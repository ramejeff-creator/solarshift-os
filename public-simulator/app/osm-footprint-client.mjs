const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];
const recentResults = new WeakMap();

function distanceMeters(latA, lngA, latB, lngB) {
  const radians = Math.PI / 180;
  const deltaLat = (latB - latA) * radians;
  const deltaLng = (lngB - lngA) * radians;
  const arc = Math.sin(deltaLat / 2) ** 2
    + Math.cos(latA * radians) * Math.cos(latB * radians) * Math.sin(deltaLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(arc)));
}

export function measureFootprint(geometry) {
  if (!Array.isArray(geometry) || geometry.length < 4) return null;
  const points = geometry.map((point) => ({ lat: Number(point?.lat), lng: Number(point?.lon ?? point?.lng) }));
  if (points.some((point) => !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180)) return null;
  const meanLat = points.reduce((sum, point) => sum + point.lat, 0) / points.length * Math.PI / 180;
  const radius = 6378137;
  const origin = points[0];
  const projected = points.map((point) => ({
    x: radius * (point.lng - origin.lng) * Math.PI / 180 * Math.cos(meanLat),
    y: radius * (point.lat - origin.lat) * Math.PI / 180
  }));
  let doubleArea = 0, centroidX = 0, centroidY = 0;
  for (let index = 0; index < projected.length; index += 1) {
    const current = projected[index], next = projected[(index + 1) % projected.length];
    const cross = current.x * next.y - next.x * current.y;
    doubleArea += cross;
    centroidX += (current.x + next.x) * cross;
    centroidY += (current.y + next.y) * cross;
  }
  const areaM2 = Math.round(Math.abs(doubleArea) / 2);
  if (!areaM2 || Math.abs(doubleArea) < 1e-6) return null;
  const centerX = centroidX / (3 * doubleArea), centerY = centroidY / (3 * doubleArea);
  return {
    areaM2,
    latitude: origin.lat + centerY / radius * 180 / Math.PI,
    longitude: origin.lng + centerX / (radius * Math.cos(meanLat)) * 180 / Math.PI
  };
}

export function nearbyRoofCandidates(elements, latitude, longitude, { radiusMeters = 500, minimumAreaM2 = 0 } = {}) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('Coordonnées du site invalides.');
  if (!Number.isInteger(radiusMeters) || radiusMeters < 50 || radiusMeters > 5000) throw new Error('Le rayon de recherche doit être compris entre 50 m et 5 km.');
  if (!Number.isFinite(minimumAreaM2) || minimumAreaM2 < 0) throw new Error('La surface minimale doit être un nombre positif.');
  return (Array.isArray(elements) ? elements : []).flatMap((element) => {
    if (element?.type !== 'way' || !Number.isFinite(Number(element.id))) return [];
    const measured = measureFootprint(element.geometry);
    if (!measured || measured.areaM2 < Math.max(8, minimumAreaM2) || measured.areaM2 > 100000) return [];
    const distance = Math.round(distanceMeters(latitude, longitude, measured.latitude, measured.longitude));
    if (distance > radiusMeters) return [];
    return [{ osmId: Number(element.id), geometry: element.geometry, ...measured, distanceMeters: distance }];
  }).sort((a, b) => b.areaM2 - a.areaM2);
}

export function chooseContainingFootprint(candidates) {
  return candidates.filter((candidate) => candidate.containsClick)
    .reduce((largest, candidate) => !largest || candidate.areaM2 > largest.areaM2 ? candidate : largest, null);
}

export function mapBuildingWays(payload) {
  if (!Array.isArray(payload?.elements)) throw new Error('Réponse cartographique invalide');
  const nodes = new Map(payload.elements.filter(item => item.type === 'node').map(item => [item.id, { lat: item.lat, lon: item.lon }]));
  const ways = payload.elements.flatMap(item => {
    if (item.type !== 'way' || !item.tags?.building || item.tags.building === 'no' || !Array.isArray(item.nodes)
      || item.nodes.length < 4 || item.nodes[0] !== item.nodes.at(-1) || !item.nodes.every(id => nodes.has(id))) return [];
    return [{ type: 'way', id: item.id, geometry: item.nodes.map(id => nodes.get(id)) }];
  });
  Object.defineProperty(ways, 'source', { value: 'OSM_MAP' });
  return ways;
}

export function localMapUrl(lat, lng, radiusMeters) {
  if (radiusMeters > 500 || Math.abs(lat) > 85) return null; // Small, on-demand fallback only; never a national extraction.
  const padding = radiusMeters + 100;
  const dy = padding / 111320, dx = dy / Math.cos(lat * Math.PI / 180);
  return `https://api.openstreetmap.org/api/0.6/map.json?bbox=${[lng-dx,lat-dy,lng+dx,lat+dy].join(',')}`;
}

async function boundedMapRequest(fetcher, endpoint, options, timeoutMs, signal) {
  const controller = new AbortController(); let timer, rejectAbort;
  const cancelled = new Promise((_, reject) => { rejectAbort = reject; });
  const abort = () => { controller.abort(); const error = new Error('Recherche annulée'); error.name = 'AbortError'; rejectAbort(error); };
  if (signal?.aborted) abort(); signal?.addEventListener('abort', abort, { once: true });
  try {
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('délai de réponse dépassé')); }, timeoutMs); });
    const work = (async () => {
      const response = await fetcher(endpoint, { ...options, signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })();
    return await Promise.race([work, timeout, cancelled]);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export async function fetchBuildingFootprints(lat, lng, { fetcher = fetch, timeoutMs = 11000, radiusMeters = 250, onProgress = null, signal, cacheMode = 'NEARBY' } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new Error('Coordonnées du site invalides.');
  }
  if (!Number.isInteger(radiusMeters) || radiusMeters < 50 || radiusMeters > 5000) throw new Error('Le rayon de recherche doit être compris entre 50 m et 5 km.');
  const cached = recentResults.get(fetcher);
  if (cached && cached.radiusMeters === radiusMeters && Date.now() - cached.fetchedAt < 3 * 60 * 1000
    && (cacheMode === 'EXACT' ? lat === cached.lat && lng === cached.lng : distanceMeters(lat, lng, cached.lat, cached.lng) <= 100)) return cached.elements;
  const query = `[out:json][timeout:15];way(around:${radiusMeters},${lat},${lng})["building"];out geom;`;
  const failures = [];
  const deadline = Date.now() + timeoutMs;
  const fallbackUrl = localMapUrl(lat, lng, radiusMeters);
  const overpassDeadline = deadline - (fallbackUrl ? Math.min(4000, timeoutMs * .4) : 0);
  for (const [index, endpoint] of OVERPASS_ENDPOINTS.entries()) {
    if (signal?.aborted) { const error = new Error('Recherche annulée'); error.name = 'AbortError'; throw error; }
    const remainingMs = overpassDeadline - Date.now();
    if (remainingMs <= 0) break;
    try { onProgress?.({ attempt: index + 1, total: OVERPASS_ENDPOINTS.length, endpoint: new URL(endpoint).hostname }); } catch {}
    const attemptTimeoutMs = Math.max(1, Math.min(fallbackUrl ? 3500 : 5500, remainingMs));
    try {
      // POST avoids the HTTP 406 currently returned for GET requests by some public instances.
      const payload = await boundedMapRequest(fetcher, endpoint, {
        method: 'POST',
        body: new URLSearchParams({ data: query })
      }, attemptTimeoutMs, signal);
      if (!Array.isArray(payload?.elements)) throw new Error('Réponse cartographique invalide');
      recentResults.set(fetcher, { lat, lng, radiusMeters, elements: payload.elements, fetchedAt: Date.now() });
      return payload.elements;
    } catch (error) {
      if (signal?.aborted) throw error;
      failures.push(`${new URL(endpoint).hostname} : ${error?.message || 'erreur réseau'}`);
    }
  }
  if (fallbackUrl && deadline > Date.now()) {
    try {
      try { onProgress?.({ attempt: 3, total: 3, endpoint: 'api.openstreetmap.org', source: 'OSM_MAP' }); } catch {}
      const payload = await boundedMapRequest(fetcher, fallbackUrl, { headers: { Accept: 'application/json' } }, deadline-Date.now(), signal);
      const elements = mapBuildingWays(payload);
      recentResults.set(fetcher, { lat, lng, radiusMeters, elements, fetchedAt: Date.now() });
      return elements;
    } catch (error) {
      if (signal?.aborted) throw error;
      failures.push(`api.openstreetmap.org : ${error.message}`);
    }
  }
  const error = new Error('Les services cartographiques sont momentanément indisponibles.');
  error.details = failures;
  throw error;
}
