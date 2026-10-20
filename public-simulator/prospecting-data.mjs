// Public physical observations only. Owner/contact fields are deliberately not requested.
export const BDNB_FIELDS = ['batiment_groupe_id', 'geom_groupe', 'code_commune_insee', 'libelle_commune_insee',
  'libelle_adr_principale_ban', 'l_libelle_adr', 'l_parcelle_id', 'usage_principal_bdnb_open',
  'surface_emprise_sol', 'annee_construction', 'hauteur_mean', 'mat_toit_txt', 'mat_mur_txt', 'nb_log', 'nb_niveau'];
export const SOURCES = {
  parcels: { name: 'IGN API Carto · Cadastre', url: 'https://apicarto.ign.fr/api/doc/cadastre' },
  planning: { name: 'Géoportail de l’urbanisme · IGN API Carto', url: 'https://www.geoportail-urbanisme.gouv.fr/' },
  building: { name: 'BDNB Open', url: 'https://bdnb.io/' }
};

export function knownNumber(value) {
  if (value == null || typeof value === 'boolean' || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function footprintGeometry(candidate) {
  const ring = candidate.geometry?.map(p => [Number(p.lon ?? p.lng), Number(p.lat)]);
  if (!ring || ring.length < 3 || ring.some(p => !p.every(Number.isFinite) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)) throw new Error('Contour du bâtiment invalide.');
  if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) ring.push([...ring[0]]);
  return { type: 'Polygon', coordinates: [ring] };
}

function insideRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function containsPoint(geometry, point) {
  const polygons = geometry?.type === 'MultiPolygon' ? geometry.coordinates : geometry?.type === 'Polygon' ? [geometry.coordinates] : [];
  return polygons.some(rings => rings?.length && insideRing(point, rings[0]) && !rings.slice(1).some(ring => insideRing(point, ring)));
}

// IGN Lambert-93 constants: representations-planes_v3-0.pdf p.32; metre-level WGS84/RGF93 approximation.
export function lambert93([longitude, latitude]) {
  const phi = latitude * Math.PI / 180, lambda = longitude * Math.PI / 180;
  const eccentricity = .08181919112, n = .725607765053267;
  const sin = Math.sin(phi);
  const iso = Math.log(Math.tan(Math.PI / 4 + phi / 2) * ((1 - eccentricity * sin) / (1 + eccentricity * sin)) ** (eccentricity / 2));
  const r = 11754255.426096 * Math.exp(-n * iso), theta = n * (lambda - 3 * Math.PI / 180);
  return [700000 + r * Math.sin(theta), 12655612.049876 - r * Math.cos(theta)];
}

export function matchBuilding(rows, candidate) {
  const geometry = footprintGeometry(candidate);
  const center = [Number(candidate.longitude), Number(candidate.latitude)];
  // A concave outline can have its centroid outside: do not guess an address in that case.
  if (!center.every(Number.isFinite) || !containsPoint(geometry, center)) return { state: 'UNRESOLVED', building: null };
  const matches = rows.filter(row => {
    const shape = row.geom_groupe;
    const crs = shape?.crs?.properties?.name || '';
    const point = /(?:EPSG:|EPSG::)2154$/.test(crs) ? lambert93(center)
      : !crs || /4326$|CRS84$/.test(crs) ? center : null;
    return point && containsPoint(shape, point);
  });
  return { state: matches.length === 1 ? 'SPATIAL_MATCH' : matches.length ? 'AMBIGUOUS' : 'UNRESOLVED', building: matches.length === 1 ? matches[0] : null };
}

export async function requestJson(url, { fetcher = fetch, signal, timeoutMs = 12000, headers = {}, method = 'GET', body } = {}) {
  const controller = new AbortController();
  let rejectCancellation;
  const cancellation = new Promise((_, reject) => { rejectCancellation = reject; });
  const abort = () => {
    controller.abort(signal?.reason);
    const error = new Error('Consultation annulée.'); error.name = 'AbortError'; rejectCancellation(error);
  };
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  let timeout;
  try {
    // Race also bounds a transport that does not settle promptly after abort.
    const deadline = new Promise((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new Error('Le service tarde à répondre.')); }, timeoutMs); });
    const work = (async () => {
      const response = await fetcher(url, { method, body, signal: controller.signal, headers: { Accept: 'application/json', ...headers } });
      if (!response.ok) {
        let message = response.status === 404 ? 'Connecteur non déployé.' : response.status === 403 ? 'Accès réservé aux commerciaux internes et administrateurs.' : response.status === 401 ? 'Connexion requise.' : `Service indisponible (HTTP ${response.status}).`;
        if (response.status === 404) {
          const payload = await response.json().catch(() => null);
          if (typeof payload?.error === 'string') message = payload.error;
        }
        const error = new Error(message);
        error.status = response.status; throw error;
      }
      return response.json();
    })();
    return await Promise.race([work, deadline, cancellation]);
  } catch (error) {
    if (error.name === 'TypeError') throw new Error('Connexion à la source impossible. Réessayez dans un instant.');
    throw error;
  } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort); }
}

const cache = new Map();
// Shared by the prospecting sheet and the parcel qualification: one public transport,
// provenance contract and field allowlist. No owner/contact fields are requested.
export async function cartographicObservation(name, url, options = {}) {
  const retrievedAt = new Date().toISOString();
  try {
    const payload = await requestJson(url, options);
    if (!Array.isArray(payload?.features) || payload.features.some(f => !f || typeof f !== 'object')) throw new Error('Réponse cartographique invalide.');
    if (payload.features.length > 1000 || (Number(payload.totalFeatures ?? payload.numberMatched) > payload.features.length)) {
      throw new Error('Résultat incomplet : réduisez le périmètre de consultation.');
    }
    return { state: 'AVAILABLE', name, url, retrievedAt, data: payload.features };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return { state: 'UNAVAILABLE', name, url, retrievedAt, data: [], error: error.message };
  }
}

export async function loadParcelBuildings(parcels, options = {}) {
  const ids = [...new Set(parcels.map(f => f.properties?.idu).filter(id => /^[0-9A-Z]{14}$/.test(id || '')))];
  const codes = [...new Set(parcels.map(f => f.properties?.code_insee).filter(code => /^(?:\d{5}|2[AB]\d{3})$/.test(code || '')))];
  const observation = { ...SOURCES.building, retrievedAt: new Date().toISOString(), data: [], building: null };
  if (!ids.length || ids.length > 12 || codes.length !== 1) return { ...observation, state: 'UNRESOLVED' };
  const params = new URLSearchParams({ code_commune_insee: `eq.${codes[0]}`, l_parcelle_id: `ov.{${ids.join(',')}}`, select: BDNB_FIELDS.join(','), limit: '10' });
  const url = `https://api.bdnb.io/v1/bdnb/donnees/batiment_groupe_complet?${params}`;
  try {
    let data;
    for (let attempt = 0; attempt < 2; attempt++) {
      try { data = await requestJson(url, { ...options, timeoutMs: options.timeoutMs ?? 6000 }); break; }
      catch (error) {
        if (options.signal?.aborted || attempt === 1 || (error.status && ![408, 500, 502, 503, 504].includes(error.status))) throw error;
      }
    }
    if (!Array.isArray(data)) throw new Error('Réponse BDNB invalide.');
    // Ten is the anonymous gateway cap, not proof that the list is exhaustive.
    return { ...observation, url, state: data.length >= 10 ? 'AMBIGUOUS' : 'AVAILABLE',
      data: data.filter(row => Array.isArray(row.l_parcelle_id) && row.l_parcelle_id.some(id => ids.includes(id))) };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return { ...observation, url, state: 'UNAVAILABLE', error: error.message };
  }
}
export function referenceAddressQuery(reference) {
  if (!reference || (reference.precision && reference.precision !== 'ADDRESS')) return null;
  const label = String(reference.label || [reference.address || reference.streetAddress, reference.postalCode, reference.city].filter(Boolean).join(' '))
    .replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  // A commune, POI or GPS label is not a postal identity. No wildcard/fuzzy neighbor lookup.
  if (!/^\d+\s+.+\s+\d{5}\s+.+$/.test(label) || /[*?%_\\]/.test(label) || label.length > 500) return null;
  const params = new URLSearchParams({ libelle_adr_principale_ban: `ilike.${label}`, select: BDNB_FIELDS.join(','), limit: '10' });
  const code = String(reference.cityCode || reference.communeCode || '').toUpperCase();
  if (/^(?:\d{5}|2[AB]\d{3})$/.test(code)) params.set('code_commune_insee', `eq.${code}`);
  return params;
}

export function addressResolutionMessage(observation) {
  return observation.state === 'UNAVAILABLE'
    ? { popup: 'Consommation : identification temporairement indisponible', detail: 'Le service d’identification du bâtiment est indisponible. Cela ne signifie pas que la consommation n’existe pas chez Enedis. Réessayez avec « Actualiser les données ».' }
    : observation.state === 'AMBIGUOUS'
      ? { popup: 'Consommation : adresse à vérifier', detail: 'Rattachement ambigu ou résultats incomplets : aucune consommation voisine n’est attribuée automatiquement.' }
      : { popup: 'Consommation : adresse non rattachée', detail: 'Adresse non rattachée au contour : consommation non renseignée. Cela ne signifie pas absence de données chez Enedis.' };
}

export async function loadBuildingObservations(candidate, options = {}) {
  const geometry = footprintGeometry(candidate), referenceQuery = referenceAddressQuery(candidate.referenceAddress);
  const key = JSON.stringify([geometry, referenceQuery?.toString() || '', options.includePlanning !== false]);
  const previous = cache.get(key);
  if (!options.refresh && previous && Date.now() - previous.time < 5 * 60 * 1000) return previous.value;
  const geom = new URLSearchParams({ geom: JSON.stringify(geometry) });
  async function source(name, url, normalize) {
    const retrievedAt = new Date().toISOString();
    const attempts = name === 'planning' ? 1 : 2;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try { return { state: 'AVAILABLE', ...SOURCES[name], retrievedAt, data: normalize(await requestJson(url, { ...options, timeoutMs: options.timeoutMs ?? (attempts === 1 ? 12000 : 6000) })) }; }
      catch (error) {
        if (options.signal?.aborted) throw error;
        if (attempt + 1 < attempts && (!error.status || [408, 500, 502, 503, 504].includes(error.status))) continue;
        return { state: 'UNAVAILABLE', ...SOURCES[name], retrievedAt, data: [], error: error.message };
      }
    }
  }
  const features = payload => {
    if (!Array.isArray(payload?.features)) throw new Error('Réponse cartographique invalide.');
    return payload.features;
  };
  const [parcels, planning] = await Promise.all([
    source('parcels', `https://apicarto.ign.fr/api/cadastre/parcelle?${geom}`, features),
    options.includePlanning === false ? Promise.resolve({ state: 'NOT_REQUESTED', ...SOURCES.planning, data: [] }) : source('planning', `https://apicarto.ign.fr/api/gpu/zone-urba?${geom}`, features)
  ]);
  const ids = [...new Set(parcels.data.map(f => f.properties?.idu).filter(id => /^[0-9A-Z]{14}$/.test(id || '')))];
  const codes = [...new Set(parcels.data.map(f => f.properties?.code_insee).filter(code => /^(?:\d{5}|2[AB]\d{3})$/.test(code || '')))];
  let building = { state: 'UNRESOLVED', ...SOURCES.building, data: [], building: null, retrievedAt: new Date().toISOString() };
  const rows = payload => {
    if (!Array.isArray(payload)) throw new Error('Réponse BDNB invalide.'); return payload;
  };
  const match = observation => {
    if (observation.state === 'AVAILABLE') Object.assign(observation, observation.data.length >= 10 ? { state: 'AMBIGUOUS', building: null } : matchBuilding(observation.data, candidate));
    return observation;
  };
  if (ids.length && ids.length <= 12 && codes.length === 1) {
    // The anonymous BDNB gateway currently caps each response at 10 items.
    building = match(await loadParcelBuildings(parcels.data, options));
  } else if (parcels.state === 'UNAVAILABLE') {
    building = { ...building, state: 'UNAVAILABLE', error: 'Le cadastre n’a pas répondu : identification BDNB non effectuée.' };
  }
  if (referenceQuery && ['UNAVAILABLE', 'UNRESOLVED'].includes(building.state)) {
    // Legacy drafts may have no INSEE code. Resolve the exact postal label, not a nearest address.
    // BDNB commune filtering avoids an expensive nationwide address scan.
    if (!referenceQuery.has('code_commune_insee')) {
      const label = referenceQuery.get('libelle_adr_principale_ban').slice('ilike.'.length);
      const params = new URLSearchParams({ index: 'address', q: label, limit: '1', autocomplete: '0' });
      try {
        const payload = await requestJson(`https://data.geopf.fr/geocodage/search?${params}`, { ...options, timeoutMs: options.timeoutMs ?? 6000 });
        const properties = payload.features?.[0]?.properties;
        if (properties?.type === 'housenumber' && normalizeStreet(properties.label) === normalizeStreet(label)
          && /^(?:\d{5}|2[AB]\d{3})$/.test(properties.citycode || '')) referenceQuery.set('code_commune_insee', `eq.${properties.citycode}`);
      } catch (error) { if (options.signal?.aborted) throw error; }
    }
    const fallback = match(await source('building', `https://api.bdnb.io/v1/bdnb/donnees/batiment_groupe_complet?${referenceQuery}`, rows));
    // The reference address is only a search hint. It never substitutes for spatial verification.
    if (fallback.state === 'SPATIAL_MATCH') building = { ...fallback, lookupMethod: 'REFERENCE_ADDRESS_AND_GEOMETRY' };
    else if (fallback.state === 'UNAVAILABLE' || fallback.state === 'AMBIGUOUS') building = fallback;
  }
  const value = { parcels, planning, building };
  // Unavailable sources are retryable, not cached as an absence of information.
  if ([parcels, planning, building].every(s => !['UNAVAILABLE', 'UNRESOLVED', 'AMBIGUOUS'].includes(s.state))) {
    cache.set(key, { time: Date.now(), value });
    if (cache.size > 30) cache.delete(cache.keys().next().value);
  }
  return value;
}

export function buildingAddresses(building) {
  const addresses = [...new Set([building?.libelle_adr_principale_ban, ...(building?.l_libelle_adr || [])].filter(v => typeof v === 'string' && v.trim()))];
  const seen = new Set();
  return addresses.map(label => {
    const match = label.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().match(/^(.+?)\s+(\d{5})\s+(.+)$/);
    return match ? { label, address: match[1], postalCode: match[2], city: match[3], communeCode: building.code_commune_insee } : null;
  }).filter(address => {
    if (!address) return false;
    const key = `${normalizeStreet(address.address)}|${address.postalCode}|${address.communeCode}`;
    if (seen.has(key)) return false; seen.add(key); return true;
  });
}

// The cadastral API returns every parcel intersecting the searched roof outline.
// Keep only parcel IDs explicitly linked by the spatially matched BDNB building;
// an incidental boundary intersection is not enough to attribute a parcel.
export function parcelsLinkedToBuilding(parcels, building) {
  const ids = new Set((Array.isArray(building?.l_parcelle_id) ? building.l_parcelle_id : [])
    .filter(id => typeof id === 'string' && /^[0-9A-Z]{14}$/.test(id)));
  if (!ids.size) return [];
  return parcels.filter(feature => ids.has(feature?.properties?.idu));
}

export function normalizeStreet(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    .replace(/\bBD\b/g, 'BOULEVARD').replace(/\bAV\b/g, 'AVENUE')
    .replace(/[^A-Z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function summarizeConsumption(payload, address) {
  const seen = new Set();
  const rows = (payload.results || []).filter(row => {
    const amount = knownNumber(row.annualMwh), year = knownNumber(row.year);
    if (amount == null || !Number.isInteger(year) || year < 1900 || year > 2200 || !['BUSINESS', 'RESIDENTIAL'].includes(row.population)) return false;
    const communeMatches = address.communeCode
      ? row.communeCode === address.communeCode
      : normalizeStreet(row.city) === normalizeStreet(address.city);
    if (normalizeStreet(row.address) !== normalizeStreet(address.address) || !communeMatches) return false;
    const key = [row.population, year, normalizeStreet(row.address), row.communeCode, row.sector, row.category].join('|');
    if (seen.has(key)) return false; seen.add(key); return true;
  });
  const years = [...new Set(rows.map(row => Number(row.year)))].sort((a,b) => b-a);
  const latestYear = years[0] ?? null;
  const latest = rows.filter(row => Number(row.year) === latestYear);
  const warnings = [...(payload.warnings || [])];
  if (new Set(rows.map(row => row.population)).size > new Set(latest.map(row => row.population)).size) warnings.push('Les publications entreprise et résidentielle ne couvrent pas la même année ; aucun mélange de millésimes.');
  if ((payload.results || []).length && !rows.length) warnings.push('Aucune ligne ne correspond exactement à l’adresse et au code commune retenus.');
  const history = years.map(year => {
    const yearRows = rows.filter(row => Number(row.year) === year);
    const scope = [...new Set(yearRows.map(row => JSON.stringify([
      row.population,
      row.sector || '',
      row.category || '',
      row.count == null ? 'UNKNOWN' : Number(row.count)
    ])))].sort();
    return {
      year,
      totalMwh: yearRows.reduce((sum, row) => sum + Number(row.annualMwh), 0),
      scopeSignature: JSON.stringify(scope)
    };
  });
  return { rows, latestYear, latest, totalMwh: latest.length ? latest.reduce((sum,row) => sum + Number(row.annualMwh), 0) : null,
    history,
    warnings, retrievedAt: payload.retrievedAt, notice: payload.notice };
}

export function recentConsumptionAverage(history, maxYears = 3) {
  const limit = Math.max(2, Math.floor(Number(maxYears) || 3));
  const selected = (Array.isArray(history) ? history : [])
    .filter(row => Number.isInteger(Number(row?.year)) && Number.isFinite(Number(row?.totalMwh)) && Number(row.totalMwh) >= 0)
    .slice()
    .sort((a, b) => Number(b.year) - Number(a.year))
    .slice(0, limit);
  if (selected.length < 2) return null;
  const signatures = selected.map(row => row.scopeSignature);
  const scopeComparable = signatures.every(signature => typeof signature === 'string' && signature.length > 0)
    && signatures.every(signature => signature === signatures[0]);
  return {
    years: selected.map(row => Number(row.year)),
    yearCount: selected.length,
    meanMwh: selected.reduce((sum, row) => sum + Number(row.totalMwh), 0) / selected.length,
    scopeComparable
  };
}
