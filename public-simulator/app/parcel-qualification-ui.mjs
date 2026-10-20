import { findSiteParcels, qualifyParcel, loadParcelSiteContext, qualificationChecks, restoreQualification, sitePoint, pointKey, roofLookupPoint, safeSourceUrl } from './parcel-qualification.mjs';
import { appendSiteContext } from './site-context-view.mjs';
import { appendHorizon, loadQualificationHorizon } from './qualification-horizon.mjs';
import { downloadQualificationPdf } from './qualification-report.mjs';
import { appendSituationPlan } from './situation-plan-ui.mjs';

const el = (tag, text, cls) => { const n = document.createElement(tag); n.textContent = text || ''; if (cls) n.className = cls; return n; };
const number = n => n == null ? 'Non renseignée' : Number(n).toLocaleString('fr-FR');
const config = window.SOLARSHIFT_CONFIG || {};
const currentPoint = () => sitePoint(config.localProjectCoordinates || config.projectCoordinates);
let snapshot = null, controller, generation = 0, host, output, status, search, overlay;
function link(label, url) {
  const a = el('a', label); a.href = safeSourceUrl(url) || 'https://www.geoportail-urbanisme.gouv.fr/'; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
}
function provenance(parent, source) {
  const p = el('p', '', 'parcelSource');
  const date = source.retrievedAt && !Number.isNaN(Date.parse(source.retrievedAt)) ? new Date(source.retrievedAt).toLocaleString('fr-FR') : 'date non renseignée';
  p.append(link(source.name || 'Source', source.url), document.createTextNode(` · consultée le ${date}`)); parent.append(p);
}
function clearOverlay() { overlay?.remove(); overlay = null; }
function showOverlay(feature) {
  clearOverlay();
  if (window.L && window.solarMap) overlay = window.L.geoJSON(feature, { style: { color: '#167766', weight: 3, fillOpacity: .06, dashArray: '6 4' }, interactive: false }).addTo(window.solarMap);
}
function changed() { window.dispatchEvent(new CustomEvent('ozeno:parcel-qualification-updated')); }
function reset() { generation++; controller?.abort(); snapshot = null; clearOverlay(); render(); }
function render() {
  if (!host) return;
  const point = currentPoint(); search.disabled = !point;
  output.replaceChildren();
  if (!snapshot) {
    status.textContent = point ? 'Identifiez la parcelle au repère du site, puis confirmez celle à examiner.' : 'Localisez le site pour identifier sa parcelle.';
    return;
  }
  status.textContent = 'Qualification indicative · à confirmer pour le projet.';
  const p = snapshot.parcel;
  const summary = el('div', '', 'parcelSummary');
  summary.append(el('strong', `Parcelle ${p.section} ${p.number}`), el('span', `${p.city || p.cityCode} · ${number(p.areaM2)} m² cadastraux`));
  output.append(summary, el('p', 'Cette superficie décrit le terrain, pas la surface de panneaux disponible.', 'parcelMuted'));
  const context = snapshot.siteContext;
  const contextMissing = !context || context.state === 'UNAVAILABLE' ? 2
    : (context.risks.state === 'AVAILABLE' ? 0 : 1) + context.networks.datasets.filter(d => d.state !== 'AVAILABLE').length;
  const counts = snapshot.observations.filter(o => o.state !== 'AVAILABLE').length + (snapshot.buildings.state === 'AVAILABLE' ? 0 : 1) + contextMissing + (snapshot.horizon?.state === 'AVAILABLE' ? 0 : 1);
  const zones = snapshot.observations.find(o => o.name === 'Zonage d’urbanisme');
  const labels = zones?.state === 'AVAILABLE' && zones.items.length ? `Zones ${[...new Set(zones.items.map(item => item.label))].join(', ')}` : 'Zonage à vérifier';
  const servitudes = snapshot.observations.filter(o => o.group === 'servitudes');
  const sup = servitudes.every(o => o.state === 'AVAILABLE') ? `${servitudes.reduce((sum, o) => sum + o.items.length, 0)} emprise(s) de servitude recensée(s)` : 'Servitudes à compléter';
  output.append(el('p', `${labels} · ${sup}${counts ? ` · ${counts} source(s) à compléter` : ''}.`, 'parcelMuted'));
  appendSiteContext(output, snapshot.siteContext);
  appendHorizon(output, snapshot.horizon);
  const refresh = el('button', 'Actualiser les données du site', 'secondary'); refresh.type = 'button'; refresh.disabled = !config.siteContextEndpoint || !config.pvgisEndpoint;
  refresh.onclick = () => enrichSiteContext(); output.append(refresh);
  const exportButton = el('button', 'Exporter la qualification en PDF', 'secondary'); exportButton.type = 'button';
  exportButton.onclick = () => {
    if (!snapshot || pointKey(snapshot.point) !== pointKey(currentPoint())) return;
    try {
      const filename = downloadQualificationPdf(snapshot, { name: document.getElementById('prestudyProjectName')?.textContent?.trim() || 'Site à qualifier', address: document.getElementById('dashAddress')?.textContent?.trim() || '' });
      status.textContent = `Synthèse exportée : ${filename}. Données provisoires, dates de consultation conservées.`;
    } catch { status.textContent = 'Export indisponible. Vérifiez la qualification du site puis réessayez.'; }
  };
  output.append(exportButton);
  const planSnapshot = snapshot;
  appendSituationPlan(output, planSnapshot, {
    identity: () => ({ name: document.getElementById('prestudyProjectName')?.textContent?.trim(), address: document.getElementById('dashAddress')?.textContent?.trim() }),
    active: () => snapshot === planSnapshot && pointKey(snapshot.point) === pointKey(currentPoint())
  });
  const checks = el('section'); checks.append(el('h3', 'Points à vérifier'));
  const actions = qualificationChecks(snapshot);
  const list = el('ul'); actions.slice(0, 3).forEach(check => list.append(el('li', check.label))); checks.append(list);
  if (actions.length > 3) {
    const other = el('details'); other.append(el('summary', 'Autres vérifications pour l’étude'));
    const remaining = el('ul'); actions.slice(3).forEach(check => remaining.append(el('li', check.label))); other.append(remaining); checks.append(other);
  }
  output.append(checks);
  const details = el('details'); details.append(el('summary', 'Constats et sources'));
  provenance(details, snapshot.cadastre);
  details.append(el('p', `Identifiant : ${p.id}. Parcelle confirmée à partir ${snapshot.cadastre.method === 'ROOF_POINT_THEN_USER_PARCEL_SELECTION' ? 'd’une toiture tracée' : 'du repère du site'}. Les résultats suivants concernent l’emprise cadastrale entière.`, 'parcelMuted'));
  for (const [group, label] of [['planning', 'Urbanisme'], ['servitudes', 'Servitudes'], ['nature', 'Environnement']]) {
    const block = el('section'); block.append(el('h3', label));
    for (const observation of snapshot.observations.filter(o => o.group === group)) {
      const row = el('div', '', 'parcelObservation'); row.append(el('strong', observation.name));
      if (observation.state !== 'AVAILABLE') row.append(el('p', 'Source indisponible : contrainte non déterminée.', 'parcelWarning'));
      else if (!observation.items.length) row.append(el('p', 'Aucun objet renvoyé sur cette emprise par cette couche.', 'parcelMuted'));
      for (const item of observation.items) {
        row.append(el('p', [item.label, item.description && item.description !== item.label ? item.description : '', item.date ? `Date publiée : ${item.date}` : ''].filter(Boolean).join(' · ')));
        if (safeSourceUrl(item.documentUrl)) row.append(link('Ouvrir la pièce publiée', item.documentUrl));
      }
      provenance(row, observation); block.append(row);
    }
    details.append(block);
  }
  const building = el('section'); building.append(el('h3', 'Bâtiments liés à la parcelle · BDNB'));
  const b = snapshot.buildings;
  if (b.state !== 'AVAILABLE') building.append(el('p', b.state === 'AMBIGUOUS' ? 'Liste potentiellement incomplète ; rattachements à vérifier.' : 'Source indisponible ou rattachement non résolu.', 'parcelWarning'));
  else if (!b.items.length) building.append(el('p', 'Aucun bâtiment lié renvoyé ; cela ne prouve pas l’absence de bâti.', 'parcelMuted'));
  b.items.forEach(item => building.append(el('p', `${item.id} · ${item.usage || 'Usage non renseigné'} · emprise ${number(item.areaM2)} m² · construction ${item.year ?? 'non renseignée'} · hauteur moyenne ${number(item.heightM)} m`)));
  provenance(building, b); details.append(building);
  details.append(el('p', 'Couverture environnementale : Natura 2000 et ZNIEFF uniquement ; autres protections à examiner. Les risques et réseaux sont détaillés dans leur rubrique avec leur portée propre. Le millésime n’est affiché que s’il est fourni par la source. Aucun constat ne vaut autorisation ou validation technique.', 'parcelMuted'));
  const links = el('p', '', 'parcelLinks');
  links.append(link('Carte urbanisme', `https://www.geoportail-urbanisme.gouv.fr/map/#tile=1&lon=${snapshot.point.longitude}&lat=${snapshot.point.latitude}&zoom=17`),
    link('Géorisques', 'https://www.georisques.gouv.fr/'), link('Réseaux Enedis', 'https://openservices.enedis.fr/service/cartographie-reseaux/'));
  details.append(links); output.append(details);
  const forget = el('button', 'Changer de parcelle', 'secondary'); forget.type = 'button'; forget.onclick = () => { reset(); changed(); search.focus(); }; output.append(forget);
}
async function enrichSiteContext({ missingOnly = false } = {}) {
  if (!snapshot || !config.siteContextEndpoint) return;
  controller?.abort(); controller = new AbortController(); const signal = controller.signal, run = ++generation;
  const previous = snapshot;
  const active = () => generation === run && !signal.aborted && snapshot === previous && pointKey(snapshot.point) === pointKey(currentPoint());
  status.textContent = 'Consultation des risques, des réseaux et du relief PVGIS…';
  output.querySelectorAll('button').forEach(b => b.disabled = true);
  try {
    const working = structuredClone(previous);
    // Older saved qualifications may predate geometry persistence: recover only the confirmed parcel.
    if (!previous.parcel.geometry) {
      const cadastre = await findSiteParcels(previous.cadastre.lookupPoint || previous.point, { signal });
      if (!active()) return;
      const match = cadastre.data.find(f => f.properties.idu === previous.parcel.id);
      if (!match) throw new Error('Parcelle confirmée non retrouvée. Identifiez-la de nouveau pour consulter les sources.');
      working.parcel.geometry = match.geometry;
      working.cadastre = { ...working.cadastre, url: cadastre.url, retrievedAt: cadastre.retrievedAt };
    }
    const context = missingOnly && working.siteContext ? working.siteContext : await loadParcelSiteContext(working, { signal, siteContextEndpoint: config.siteContextEndpoint });
    working.siteContext = context;
    const horizon = missingOnly && working.horizon ? working.horizon : await loadQualificationHorizon(working, { signal, endpoint: config.pvgisEndpoint });
    if (!active()) return;
    snapshot = { ...working, horizon }; render(); changed();
  } catch (error) { if (active()) { render(); status.textContent = error.message; } }
}
function offerRoofLookups() {
  const layers = window.roofGroup?.getLayers?.() || [];
  layers.forEach((layer, index) => {
    const point = roofLookupPoint(layer.toGeoJSON?.()); if (!point) return;
    const button = el('button', `Chercher sous la surface solaire ${index + 1}`, 'secondary'); button.type = 'button';
    button.onclick = () => identify(point); output.append(button);
  });
}
async function identify(lookupPoint = null) {
  // onclick passes an event; only explicitly supplied geographic points are accepted.
  lookupPoint = sitePoint(lookupPoint);
  const point = currentPoint(); if (!point) return;
  controller?.abort(); controller = new AbortController(); const signal = controller.signal, run = ++generation;
  const active = () => generation === run && !signal.aborted && pointKey(point) === pointKey(currentPoint());
  search.disabled = true; status.textContent = 'Recherche cadastrale…';
  try {
    const result = await findSiteParcels(lookupPoint || point, { signal });
    if (!active()) return;
    output.replaceChildren();
    if (result.state !== 'AVAILABLE') { status.textContent = 'Le cadastre est indisponible. Réessayez ; aucune absence de parcelle n’est déduite.'; return; }
    if (!result.data.length) { status.textContent = 'Aucune parcelle renvoyée au repère. Cherchez sous une surface tracée ou replacez le repère sur la carte.'; offerRoofLookups(); return; }
    status.textContent = 'Confirmez la parcelle à examiner. Un repère d’adresse peut se trouver sur une voie.';
    for (const feature of result.data) {
      const p = feature.properties;
      const button = el('button', `Examiner ${p.section || ''} ${p.numero || ''} · ${p.nom_com || p.code_insee} · ${number(p.contenance)} m²`, 'secondary'); button.type = 'button';
      button.onclick = async () => {
        if (!active()) return;
        // Selection is explicit even when only one cadastral result exists.
        snapshot = null; changed();
        output.querySelectorAll('button').forEach(b => b.disabled = true);
        showOverlay(feature); status.textContent = 'Consultation des sources sur la parcelle…'; search.disabled = true;
        try {
          const next = await qualifyParcel(feature, point, { signal, cadastre: result, lookupPoint, siteContextEndpoint: config.siteContextEndpoint, pvgisEndpoint: config.pvgisEndpoint });
          if (!active()) return;
          snapshot = next; render(); changed();
        } catch (error) { if (active()) { clearOverlay(); status.textContent = error.message; output.querySelectorAll('button').forEach(b => b.disabled = false); } }
        finally { if (active()) search.disabled = false; }
      };
      output.append(button);
    }
    provenance(output, result);
  } catch (error) { if (active()) status.textContent = error.message; }
  finally { if (active()) search.disabled = false; }
}

export function mountParcelQualification(parent) {
  if (host || !parent) return;
  const css = el('link'); css.id = 'ozenoParcelQualificationStyle'; css.rel = 'stylesheet'; css.href = './parcel-qualification.css'; document.head.append(css);
  host = el('section', '', 'parcelQualification'); host.id = 'parcelQualification'; host.setAttribute('aria-labelledby', 'parcelQualificationTitle');
  const heading = el('h3', 'Parcelle et contexte du site'); heading.id = 'parcelQualificationTitle';
  search = el('button', 'Identifier la parcelle', 'secondary'); search.type = 'button'; search.onclick = identify;
  status = el('p', '', 'parcelMuted'); status.setAttribute('role', 'status');
  output = el('div'); host.append(heading, el('p', 'Un premier repérage pour préparer le projet et les vérifications utiles.'), search, status, output); parent.append(host);
  window.OzenoParcelQualification = {
    capture: () => pointKey(snapshot?.point) === pointKey(currentPoint()) && snapshot ? structuredClone(snapshot) : null,
    restore(value) {
      generation++; controller?.abort(); clearOverlay(); snapshot = restoreQualification(value, currentPoint()); render();
      if (snapshot?.parcel.geometry && ['Polygon', 'MultiPolygon'].includes(snapshot.parcel.geometry.type)) showOverlay({ type: 'Feature', properties: {}, geometry: snapshot.parcel.geometry });
      if (snapshot && (!snapshot.siteContext || !snapshot.horizon)) void enrichSiteContext({ missingOnly: true });
    }
  };
  for (const event of ['ozeno:site-location-updated', 'ozeno:site-address-confirmed', 'ozeno:project-context-loaded', 'ozeno:map-site-selected']) {
    window.addEventListener(event, () => { if (!snapshot || pointKey(snapshot.point) !== pointKey(currentPoint())) reset(); });
  }
  // Address typing invalidates the old qualification before a new suggestion is chosen.
  document.getElementById('newProjectAddress')?.addEventListener('input', event => { if (!event.target.dataset.suppressProjectDirty) reset(); });
  render();
}
