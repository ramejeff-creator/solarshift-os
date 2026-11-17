import { cartographicObservation, loadParcelBuildings, knownNumber, containsPoint, requestJson } from './prospecting-data.mjs';
import { loadQualificationHorizon, validHorizon, qualificationAnalysisPoint } from './qualification-horizon.mjs';

export const PARCEL_SCHEMA = 1;
export const PARCEL_LAYERS = [
  ['zones', 'Zonage d’urbanisme', 'gpu/zone-urba', 'planning'],
  ['prescriptions', 'Prescriptions surfaciques', 'gpu/prescription-surf', 'planning'],
  ['prescriptionsLine', 'Prescriptions linéaires', 'gpu/prescription-lin', 'planning'],
  ['prescriptionsPoint', 'Prescriptions ponctuelles', 'gpu/prescription-pct', 'planning'],
  ['information', 'Périmètres d’information', 'gpu/info-surf', 'planning'],
  ['servitudes', 'Servitudes surfaciques', 'gpu/assiette-sup-s', 'servitudes'],
  ['servitudesLine', 'Servitudes linéaires', 'gpu/assiette-sup-l', 'servitudes'],
  ['servitudesPoint', 'Servitudes ponctuelles', 'gpu/assiette-sup-p', 'servitudes'],
  ['habitats', 'Natura 2000 · habitats', 'nature/natura-habitat', 'nature'],
  ['birds', 'Natura 2000 · oiseaux', 'nature/natura-oiseaux', 'nature'],
  ['znieff1', 'ZNIEFF type 1', 'nature/znieff1', 'nature'],
  ['znieff2', 'ZNIEFF type 2', 'nature/znieff2', 'nature']
];

export function sitePoint(value) {
  if (value?.latitude == null || value?.longitude == null || value.latitude === '' || value.longitude === '') return null;
  const latitude = Number(value.latitude), longitude = Number(value.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
    ? { latitude, longitude } : null;
}
// Project storage can round coordinates to six decimals. Compare the same
// precision on both sides (about 0.1 m) so a saved qualification survives a
// database round-trip without accepting a genuinely moved site marker.
export const pointKey = value => { const p = sitePoint(value); return p ? `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}` : ''; };
export function roofLookupPoint(geometry) {
  const shape = geometry?.type === 'Feature' ? geometry.geometry : geometry;
  const ring = shape?.type === 'Polygon' ? shape.coordinates?.[0] : shape?.type === 'MultiPolygon' ? shape.coordinates?.[0]?.[0] : null;
  if (!ring || ring.length < 4) return null;
  const points = ring.slice(0, -1);
  const center = points.reduce((sum, p) => [sum[0] + Number(p[0]) / points.length, sum[1] + Number(p[1]) / points.length], [0, 0]);
  // Do not invent an interior point for concave roofs whose mean lies outside.
  return containsPoint(shape, center) ? sitePoint({ longitude: center[0], latitude: center[1] }) : null;
}
export const safeSourceUrl = value => {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; }
  catch { return null; }
};
const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).slice(0, 700) : '';
const normalizedText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function documentUrl(p) {
  const direct = safeSourceUrl(p.urlfic || p.url || p.url_document);
  if (direct) return direct;
  if (/^[a-f0-9]{32}$/i.test(p.gpu_doc_id || '')) {
    return typeof p.nomfic === 'string' && /^[a-z0-9_.-]+\.pdf$/i.test(p.nomfic)
      ? `https://www.geoportail-urbanisme.gouv.fr/api/document/${p.gpu_doc_id}/files/${encodeURIComponent(p.nomfic)}`
      : `https://www.geoportail-urbanisme.gouv.fr/document/by-id/${p.gpu_doc_id}`;
  }
  return null;
}
function observationSummary(observation, group, scope) {
  return {
    state: observation.state, name: observation.name, url: observation.url,
    retrievedAt: observation.retrievedAt, method: 'API_GEOMETRY_INTERSECTION', scope, group,
    error: observation.error || '',
    items: observation.data.map(f => {
      const p = f.properties || {};
      return { id: text(f.id || p.id || p.lib_idpsc || p.lib_idinf || p.idurba || p.idass),
        typeCode: text(p.typepsc || p.typeinf || p.typezone || p.categorie),
        label: text(p.libelle || p.libelong || p.nom_site || p.nom || p.categorie || p.nomass || 'Objet géographique recensé'),
        description: text(p.libelong || p.categorie || p.typezone), date: text(p.datvalid || p.datappro || p.date_maj),
        documentUrl: documentUrl(p) };
    })
  };
}

// GPU returns every object intersecting the parcel. A single published rule can
// be split into several mapped features; group those only when the title and
// published source are identical, while retaining the number of mapped pieces.
export function compactUrbanismItems(items = []) {
  const compact = new Map();
  for (const item of items) {
    const title = normalizedText(item.label);
    const source = safeSourceUrl(item.documentUrl);
    const key = source ? `${title}|${source}|${normalizedText(item.date)}`
      : item.id ? `id:${item.id}` : `unique:${compact.size}`;
    const existing = compact.get(key);
    if (existing) existing.count++;
    else compact.set(key, { ...item, count: 1 });
  }
  return [...compact.values()];
}

// This is a reading aid based on the official layer and published title, not a
// legal conclusion. Information layers include many administrative overlays
// that do not themselves prescribe PV installation conditions.
export function urbanismRelevance(observation, item) {
  if (observation.name === 'Zonage d’urbanisme') return {
    level: 'review', label: 'Règle d’urbanisme à vérifier',
    reason: 'Le zonage peut fixer les règles applicables au bâtiment et aux travaux.'
  };
  if (observation.name?.startsWith('Prescriptions')) return {
    level: 'review', label: 'Prescription à vérifier',
    reason: 'Cette prescription peut encadrer les travaux ou l’aspect du bâtiment.'
  };
  if (observation.group === 'servitudes') return {
    level: 'review', label: 'Servitude à vérifier',
    reason: 'Une servitude peut limiter les travaux ou imposer une consultation.'
  };
  const title = normalizedText(`${item.label} ${item.description} ${item.typeCode}`);
  if (/inond|risque|monument|patrimoine|site classe|abords|captage|protection|bruit|pollu|avap|spr|secteur sauvegarde|alignement|paysage|littoral|foret|incendie/.test(title)) return {
    level: 'review', label: 'Information potentiellement pertinente',
    reason: 'Le thème publié peut influer sur l’autorisation ou les prescriptions du projet.'
  };
  if (/preemption|taxe amenagement|gare|logement|mixite sociale|emplacement reserve/.test(title)) return {
    level: 'context', label: 'Contexte administratif',
    reason: 'Cet objet ne décrit pas à lui seul une contrainte technique PV ; il peut rester utile pour le contexte foncier ou administratif.'
  };
  return { level: 'unknown', label: 'Portée à préciser', reason: 'L’intitulé seul ne permet pas de déterminer l’effet sur une installation photovoltaïque.' };
}
export async function findSiteParcels(point, options = {}) {
  const p = sitePoint(point);
  if (!p) throw new Error('Localisez le site avant de rechercher sa parcelle.');
  const query = new URLSearchParams({ geom: JSON.stringify({ type: 'Point', coordinates: [p.longitude, p.latitude] }) });
  const observation = await cartographicObservation('IGN API Carto · Cadastre', `https://apicarto.ign.fr/api/cadastre/parcelle?${query}`, options);
  // Never silently select the first result: a geocoded entrance may be on a road parcel.
  return { ...observation, data: observation.data.filter(f => /^[0-9A-Z]{14}$/.test(f.properties?.idu || '') && ['Polygon', 'MultiPolygon'].includes(f.geometry?.type)) };
}

export async function qualifyParcel(feature, point, options = {}) {
  const p = feature?.properties;
  if (!/^[0-9A-Z]{14}$/.test(p?.idu || '') || !['Polygon', 'MultiPolygon'].includes(feature.geometry?.type) || !sitePoint(point)) throw new Error('Parcelle invalide.');
  const scope = p.idu;
  const query = new URLSearchParams({ geom: JSON.stringify(feature.geometry) });
  if (query.toString().length > 24000) throw new Error('Contour trop détaillé pour cette consultation. Utilisez les liens vers les sources.');
  const results = new Array(PARCEL_LAYERS.length);
  let cursor = 0;
  // Bounded fan-out; each unavailable layer remains visible and never becomes “no constraint”.
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (cursor < PARCEL_LAYERS.length) {
      const index = cursor++, [, name, path, group] = PARCEL_LAYERS[index];
      const observation = await cartographicObservation(name, `https://apicarto.ign.fr/api/${path}?${query}`, options);
      results[index] = observationSummary(observation, group, scope);
    }
  }));
  const buildings = await loadParcelBuildings([feature], options);
  const snapshot = {
    schemaVersion: PARCEL_SCHEMA, status: 'PROVISIONAL', point: sitePoint(point), selectedAt: new Date().toISOString(),
    parcel: { id: scope, section: text(p.section), number: text(p.numero), city: text(p.nom_com), cityCode: text(p.code_insee), areaM2: knownNumber(p.contenance), geometry: structuredClone(feature.geometry) },
    cadastre: { name: 'IGN API Carto · Cadastre', url: options.cadastre?.url || 'https://apicarto.ign.fr/api/doc/cadastre',
      retrievedAt: options.cadastre?.retrievedAt || new Date().toISOString(), lookupPoint: sitePoint(options.lookupPoint || point), method: options.lookupMethod || (options.lookupPoint ? 'ROOF_POINT_THEN_USER_PARCEL_SELECTION' : 'SITE_POINT_THEN_USER_PARCEL_SELECTION') },
    observations: results,
    buildings: { state: buildings.state, name: buildings.name, url: buildings.url, retrievedAt: buildings.retrievedAt,
      method: 'BDNB_EXPLICIT_PARCEL_LINK', error: buildings.error || '', items: buildings.data.map(b => ({
        id: text(b.batiment_groupe_id), usage: text(b.usage_principal_bdnb_open), areaM2: knownNumber(b.surface_emprise_sol),
        year: knownNumber(b.annee_construction), heightM: knownNumber(b.hauteur_mean)
      })) }
  };
  if (options.siteContextEndpoint) snapshot.siteContext = await loadParcelSiteContext(snapshot, options);
  if (options.pvgisEndpoint) snapshot.horizon = await loadQualificationHorizon(snapshot, { endpoint: options.pvgisEndpoint, fetcher: options.fetcher, signal: options.signal });
  return snapshot;
}

export async function loadParcelSiteContext(snapshot, options = {}) {
  const base = { schemaVersion: 1, parcelId: snapshot.parcel.id };
  let analysisPoint = snapshot.cadastre?.lookupPoint;
  if (!sitePoint(analysisPoint) || !containsPoint(snapshot.parcel.geometry, [analysisPoint.longitude, analysisPoint.latitude])) analysisPoint = roofLookupPoint(snapshot.parcel.geometry);
  if (!analysisPoint) return { ...base, state: 'UNAVAILABLE', error: 'Un point d’analyse intérieur à la parcelle est nécessaire.' };
  try {
    const payload = await requestJson(options.siteContextEndpoint, { signal: options.signal, fetcher: options.fetcher,
      timeoutMs: 55000, method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parcelId: snapshot.parcel.id, geometry: snapshot.parcel.geometry, analysisPoint }) });
    if (!validSiteContext(payload, snapshot.parcel.id) || pointKey(payload.analysisPoint) !== pointKey(analysisPoint)) throw new Error('Réponse de qualification incohérente.');
    return payload;
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return { ...base, state: 'UNAVAILABLE', error: 'Géorisques et réseaux non récupérés. Réessayez pour compléter le contexte.' };
  }
}
export function validSiteContext(value, parcelId) {
  if (!value || value.schemaVersion !== 1 || value.parcelId !== parcelId) return false;
  if (value.state === 'UNAVAILABLE') return typeof value.error === 'string';
  return Boolean(sitePoint(value.analysisPoint) && ['AVAILABLE', 'UNAVAILABLE'].includes(value.risks?.state)
    && value.risks.parcelId === parcelId && pointKey(value.risks.queryPoint) === pointKey(value.analysisPoint) && Array.isArray(value.risks.items) && value.risks.items.length <= 30
    && value.risks.items.every(item => item && typeof item.label === 'string' && ['POINT', 'COMMUNE', 'UNRESOLVED'].includes(item.scope))
    && ['AVAILABLE', 'PARTIAL', 'OUTSIDE_COVERAGE'].includes(value.networks?.state) && value.networks.radiusM === 500
    && Array.isArray(value.networks.datasets) && value.networks.datasets.length === 5
    && new Set(value.networks.datasets.map(item => item?.dataset)).size === 5
    && value.networks.datasets.every(item => ['reseau-bt', 'reseau-souterrain-bt', 'reseau-hta', 'reseau-souterrain-hta', 'poste-electrique'].includes(item?.dataset))
    && value.networks.datasets.every(item => item && ['BT', 'HTA', 'POSTE'].includes(item.kind) && ['AVAILABLE', 'UNAVAILABLE', 'OUTSIDE_COVERAGE'].includes(item.state)
      && (item.nearestM === null || Number.isFinite(item.nearestM) && item.nearestM >= 0 && item.nearestM <= 500)
      && (item.count === null || Number.isInteger(item.count) && item.count >= 0)));
}

export function qualificationChecks(snapshot) {
  if (!snapshot) return [];
  const checks = [{ id: 'boundary', label: 'Confirmer les limites et les parcelles réellement concernées par le projet.' }];
  const observations = snapshot.observations || [];
  if (observations.some(o => o.state !== 'AVAILABLE')) checks.push({ id: 'coverage', label: 'Compléter les sources indisponibles avant de conclure sur les contraintes.' });
  if (observations.some(o => o.name === 'Zonage d’urbanisme' && o.items?.length > 1)) checks.push({ id: 'zones', label: 'Plusieurs zones touchent la parcelle : situer précisément l’implantation dans le règlement graphique.' });
  if (observations.some(o => o.group === 'servitudes' && o.items?.length)) checks.push({ id: 'servitudes', label: 'Examiner les servitudes recensées et leur règlement pour l’implantation envisagée.' });
  checks.push({ id: 'planning', label: 'Lire le règlement et les prescriptions ; confirmer le parcours d’autorisation avec l’urbanisme.' });
  if (observations.some(o => o.group === 'nature' && o.items?.length)) checks.push({ id: 'nature', label: 'Faire examiner les zonages naturels recensés pour le projet envisagé.' });
  const context = snapshot.siteContext;
  if (context?.risks?.state === 'AVAILABLE') {
    const pointRisks = context.risks.items.filter(item => item.scope === 'POINT');
    const communeRisks = context.risks.items.filter(item => item.scope !== 'POINT');
    if (pointRisks.length) checks.unshift({ id: 'risks', label: `Examiner les risques signalés au point d’analyse (${pointRisks.slice(0, 3).map(item => item.label).join(', ')}${pointRisks.length > 3 ? '…' : ''}) pour l’implantation prévue.` });
    if (communeRisks.length) checks.push({ id: 'commune-risks', label: 'Préciser l’exposition du projet aux risques communaux ; le rapport ne la renseigne pas au point.' });
  } else checks.push({ id: 'risks', label: 'Compléter le rapport Géorisques avant de conclure sur les aléas.' });
  if (context && (context.state === 'UNAVAILABLE' || context.networks?.state !== 'AVAILABLE')) checks.push({ id: 'network-coverage', label: 'Compléter la couverture des réseaux ; une donnée manquante ne signifie pas une absence d’ouvrage.' });
  checks.push(
    { id: 'grid', label: 'Confirmer le raccordement auprès du gestionnaire ; aucune capacité n’est déduite de la carte.' },
    { id: 'roof', label: 'Confirmer structure, état de toiture et ombres proches lors de l’étude technique.' });
  if (snapshot.horizon?.state !== 'AVAILABLE') checks.push({ id: 'horizon', label: 'Compléter le masque du relief PVGIS ; l’ombrage proche reste à vérifier séparément.' });
  return checks;
}

export function restoreQualification(value, point) {
  if (!sitePoint(point) || !value || value.schemaVersion !== PARCEL_SCHEMA || value.status !== 'PROVISIONAL' || pointKey(value.point) !== pointKey(point)
    || !/^[0-9A-Z]{14}$/.test(value.parcel?.id || '') || !Array.isArray(value.observations)
    || value.observations.length > PARCEL_LAYERS.length || !Array.isArray(value.buildings?.items) || value.buildings.items.length > 10 || value.buildings.items.some(item => !item || typeof item !== 'object')
    || !value.cadastre || (value.siteContext != null && !validSiteContext(value.siteContext, value.parcel.id))
    || (value.horizon != null && !validHorizon(value.horizon, qualificationAnalysisPoint(value))) || value.observations.some(o => !['planning', 'servitudes', 'nature'].includes(o?.group)
      || !['AVAILABLE', 'UNAVAILABLE'].includes(o.state) || !Array.isArray(o.items) || o.items.length > 1000
      || o.items.some(item => !item || typeof item.label !== 'string'))) return null;
  // Restored observations remain provisional. Source timestamps are not refreshed by reopening.
  return structuredClone(value);
}
