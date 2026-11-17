import { coordinates, distanceMeters, normalizeProspect } from './acc-prospects-model.mjs';
import { searchPublicEstablishments } from './acc-establishments-public.mjs';

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
export function establishmentCategory(tags = {}) {
  if (['hotel', 'motel', 'hostel', 'guest_house'].includes(tags.tourism)) return 'HOTEL';
  if (tags.shop && tags.shop !== 'no') return 'SHOP';
  if (tags.healthcare || ['hospital', 'clinic', 'doctors', 'dentist', 'pharmacy', 'nursing_home'].includes(tags.amenity)) return 'HEALTH';
  if (tags.office && tags.office !== 'no') return 'OFFICE';
  if ((tags.craft && tags.craft !== 'no') || tags.industrial || tags.man_made === 'works') return 'INDUSTRY';
  if (['school', 'college', 'university', 'kindergarten', 'townhall', 'library', 'community_centre', 'sports_centre'].includes(tags.amenity) || tags.leisure === 'sports_centre') return 'PUBLIC';
  return 'OTHER';
}
export function establishmentsFromOsm(payload, origin, radiusMeters, observedAt = new Date().toISOString()) {
  if (!Array.isArray(payload?.elements) || payload.remark) throw new Error('La recherche cartographique est incomplète. Réduisez le rayon puis réessayez.');
  const unique = new Map();
  for (const item of payload.elements) {
    if (!['node', 'way', 'relation'].includes(item?.type) || !Number.isSafeInteger(item.id) || item.id < 1) continue;
    const tags = item.tags || {}, name = tags.name || tags.brand || tags.operator;
    const point = coordinates({ latitude: item.lat ?? item.center?.lat, longitude: item.lon ?? item.center?.lon });
    if (!name || !point || distanceMeters(origin, point) > radiusMeters || tags.disused === 'yes' || tags.abandoned === 'yes') continue;
    const id = `osm:${item.type}/${item.id}`;
    const address = [[tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '), tags['addr:postcode'], tags['addr:city']].filter(Boolean).join(', ');
    const category = establishmentCategory(tags), sourceUrl = `https://www.openstreetmap.org/${item.type}/${item.id}`;
    const prospect = normalizeProspect({ id, name, ...point, category, address,
      schedule: tags.opening_hours || '', source: 'OpenStreetMap', sourceUrl, observedAt,
      identification: { name, address, category, ...point, source: 'OpenStreetMap', sourceUrl, observedAt, activityHint: tags.shop === 'supermarket' ? 'SUPERMARKET' : '' } });
    unique.set(id, prospect);
  }
  return [...unique.values()].sort((a, b) => distanceMeters(origin, a) - distanceMeters(origin, b));
}
export async function searchEstablishments(origin, { radiusMeters = 1000, signal, fetcher = fetch, timeoutMs = 16000, onProgress = () => {} } = {}) {
  const point = coordinates(origin);
  if (!point) throw new Error('Localisez le projet dans la pré-étude avant de rechercher des établissements.');
  if (!Number.isInteger(radiusMeters) || radiusMeters < 500 || radiusMeters > 5000 || radiusMeters % 500 !== 0) throw new Error('Rayon de recherche non pris en charge.');
  const around = `(around:${radiusMeters},${point.latitude},${point.longitude})`;
  const selectors = ['["tourism"~"^(hotel|motel|hostel|guest_house)$"]', '["shop"]["shop"!="no"]', '["office"]["office"!="no"]', '["craft"]["craft"!="no"]', '["industrial"]', '["man_made"="works"]', '["healthcare"]', '["amenity"~"^(hospital|clinic|doctors|dentist|pharmacy|nursing_home|school|college|university|kindergarten|townhall|library|community_centre)$"]', '["leisure"="sports_centre"]'];
  const query = `[out:json][timeout:10];(${selectors.map(selector => `nwr${around}${selector};`).join('')});out center qt;`;
  for (const [index, endpoint] of ENDPOINTS.entries()) {
    if (signal?.aborted) throw new DOMException('Recherche annulée.', 'AbortError');
    onProgress(index === 0 ? 'Recherche cartographique des établissements…' : 'Nouvel essai sur une source cartographique…');
    const controller = new AbortController(), abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs / ENDPOINTS.length);
    try {
      const response = await fetcher(endpoint, { method: 'POST', body: new URLSearchParams({ data: query }), signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (signal?.aborted) throw new DOMException('Recherche annulée.', 'AbortError');
      return establishmentsFromOsm(payload, point, radiusMeters);
    } catch (error) { if (signal?.aborted) throw new DOMException('Recherche annulée.', 'AbortError'); }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  try { return await searchPublicEstablishments(point, { radiusMeters, signal, fetcher, onProgress }); }
  catch (error) {
    if (signal?.aborted) throw new DOMException('Recherche annulée.', 'AbortError');
    throw new Error('Recherche momentanément indisponible. Réessayez ou ajoutez un établissement manuellement.');
  }
}
