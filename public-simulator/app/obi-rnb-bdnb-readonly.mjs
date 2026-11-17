import { buildEvidenceSummary, supportedMuretCase } from './obi-public-evidence.mjs';

const RNB_ORIGIN = 'https://rnb-api.beta.gouv.fr';
const BDNB_ORIGIN = 'https://api.bdnb.io';
const CACHE = new Map();
const MAX_RNB_PAGES = 4;
const REQUEST_TIMEOUT_MS = 10000;

function safeEndpoint(value, origin) {
  const url = new URL(value);
  if (url.origin !== origin || url.protocol !== 'https:') throw new Error('L’URL de la source n’est pas dans la liste autorisée.');
  return url;
}

async function readJson(url, { origin, signal, stats, source }) {
  const safeUrl = safeEndpoint(url, origin);
  if (signal?.aborted) throw new DOMException('Consultation annulée.', 'AbortError');
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  const startedAt = performance.now();
  const timer = setTimeout(() => controller.abort(new DOMException('Délai dépassé.', 'TimeoutError')), REQUEST_TIMEOUT_MS);
  stats.requests++;
  try {
    const response = await fetch(safeUrl, { method: 'GET', signal: controller.signal, credentials: 'omit', headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) {
      const error = new Error(`La source ${source} a répondu HTTP ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    const payload = await response.json();
    if (!payload || typeof payload !== 'object') throw new Error(`Réponse ${source} invalide.`);
    return { payload, url: safeUrl.href, retrievedAt: new Date().toISOString() };
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof TypeError) throw new Error(`Connexion à ${source} impossible depuis le navigateur local (réseau ou CORS).`);
    if (controller.signal.aborted && !(error instanceof Error && error.message.includes('HTTP'))) throw new Error(`Délai dépassé pour ${source}.`);
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    stats.durationsMs.push({ source, durationMs });
  }
}

function polygonWkt(candidate) {
  const points = Array.isArray(candidate.geometry) ? candidate.geometry.map(point => [Number(point.lon ?? point.lng), Number(point.lat)]) : [];
  if (points.length < 3 || points.some(point => !point.every(Number.isFinite))) throw new Error('Contour OSM invalide.');
  if (points[0][0] !== points.at(-1)[0] || points[0][1] !== points.at(-1)[1]) points.push([...points[0]]);
  return `POLYGON((${points.map(point => `${point[0]} ${point[1]}`).join(',')}))`;
}

async function loadRnb(candidate, options, stats) {
  const url = new URL('/api/alpha/buildings/intersect/', RNB_ORIGIN);
  url.searchParams.set('shape', polygonWkt(candidate));
  const data = [];
  let next = url.href, retrievedAt = new Date().toISOString();
  try {
    for (let page = 0; next && page < MAX_RNB_PAGES; page++) {
      const result = await readJson(next, { origin: RNB_ORIGIN, signal: options.signal, stats, source: 'RNB' });
      retrievedAt = result.retrievedAt;
      const rows = result.payload.results;
      if (!Array.isArray(rows)) throw new Error('Réponse RNB invalide : la liste des bâtiments est absente.');
      data.push(...rows.filter(row => typeof row?.rnb_id === 'string' && row.shape && typeof row.shape.type === 'string'));
      next = typeof result.payload.next === 'string' && result.payload.next ? safeEndpoint(result.payload.next, RNB_ORIGIN).href : null;
    }
    return { state: next ? 'PARTIAL' : data.length ? 'AVAILABLE' : 'NO_MATCH', data, source: 'RNB · API bâtiments, intersection de contour', url: url.href, retrievedAt, error: null };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return { state: 'UNAVAILABLE', data, source: 'RNB · API bâtiments, intersection de contour', url: url.href, retrievedAt, error: error.message };
  }
}

async function loadBdnbMapping(rnbId, options, stats) {
  if (!/^[A-Z0-9]{12}$/.test(rnbId)) return { state: 'UNKNOWN', rnbId, data: [], error: 'ID-RNB invalide.' };
  const url = new URL('/v1/bdnb/donnees/batiment_construction', BDNB_ORIGIN);
  url.searchParams.set('rnb_id', `eq.${rnbId}`);
  url.searchParams.set('select', 'rnb_id,batiment_construction_id,batiment_groupe_id');
  url.searchParams.set('limit', '10');
  try {
    const result = await readJson(url.href, { origin: BDNB_ORIGIN, signal: options.signal, stats, source: 'BDNB Open · correspondance RNB' });
    if (!Array.isArray(result.payload)) throw new Error('Réponse BDNB invalide : liste de correspondances absente.');
    const rows = result.payload.filter(row => row?.rnb_id === rnbId && typeof row.batiment_groupe_id === 'string');
    return { state: rows.length >= 10 ? 'PARTIAL' : rows.length ? (rows.length > 1 ? 'AMBIGUOUS' : 'AVAILABLE') : 'NO_MATCH', rnbId, data: rows, source: 'BDNB Open · bâtiment_construction', url: result.url, retrievedAt: result.retrievedAt, error: null };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return { state: 'UNAVAILABLE', rnbId, data: [], source: 'BDNB Open · bâtiment_construction', url: url.href, retrievedAt: new Date().toISOString(), error: error.message };
  }
}

async function loadBdnbGroup(groupId, options, stats) {
  if (!/^bdnb-bg-[A-Z0-9-]{1,80}$/.test(groupId)) return { id: groupId, state: 'UNKNOWN', data: [], error: 'Identifiant BDNB invalide.' };
  const url = new URL('/v1/bdnb/donnees/batiment_groupe_complet', BDNB_ORIGIN);
  url.searchParams.set('batiment_groupe_id', `eq.${groupId}`);
  url.searchParams.set('select', 'batiment_groupe_id,usage_principal_bdnb_open,surface_emprise_sol');
  url.searchParams.set('limit', '2');
  try {
    const result = await readJson(url.href, { origin: BDNB_ORIGIN, signal: options.signal, stats, source: 'BDNB Open · usage du groupe' });
    if (!Array.isArray(result.payload)) throw new Error('Réponse BDNB invalide : liste de groupes absente.');
    const rows = result.payload.filter(row => row?.batiment_groupe_id === groupId);
    return { id: groupId, state: rows.length === 1 ? 'AVAILABLE' : rows.length ? 'AMBIGUOUS' : 'NO_MATCH', data: rows, source: 'BDNB Open · bâtiment_groupe_complet', url: result.url, retrievedAt: result.retrievedAt, error: null };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return { id: groupId, state: 'UNAVAILABLE', data: [], source: 'BDNB Open · bâtiment_groupe_complet', url: url.href, retrievedAt: new Date().toISOString(), error: error.message };
  }
}

export async function loadPublicEvidence(candidate, options = {}) {
  const supported = supportedMuretCase(candidate);
  if (!supported) return { state: 'UNKNOWN', reason: 'Cette emprise n’appartient pas aux deux cas Muret autorisés pour C2.', stats: { requests: 0, durationsMs: [] } };
  const cacheKey = `${candidate.osmId}:${JSON.stringify(candidate.geometry)}`;
  if (!options.refresh && CACHE.has(cacheKey)) return { ...CACHE.get(cacheKey), stats: { ...CACHE.get(cacheKey).stats, cacheHit: true } };
  const stats = { requests: 0, durationsMs: [], cacheHit: false };
  const rnb = await loadRnb(candidate, options, stats);
  if (options.signal?.aborted) throw new DOMException('Consultation annulée.', 'AbortError');
  const mappings = [];
  for (const building of rnb.data) {
    mappings.push(await loadBdnbMapping(building.rnb_id, options, stats));
    if (options.signal?.aborted) throw new DOMException('Consultation annulée.', 'AbortError');
  }
  const groupIds = [...new Set(mappings.flatMap(mapping => mapping.data.map(row => row.batiment_groupe_id)))];
  const groups = [];
  for (const groupId of groupIds) {
    groups.push(await loadBdnbGroup(groupId, options, stats));
    if (options.signal?.aborted) throw new DOMException('Consultation annulée.', 'AbortError');
  }
  const summary = buildEvidenceSummary({ candidate, rnbObservation: rnb, mappings, groups, retrievedAt: new Date().toISOString() });
  const incomplete = rnb.state === 'UNAVAILABLE' || rnb.state === 'PARTIAL'
    || mappings.some(mapping => ['UNAVAILABLE', 'PARTIAL'].includes(mapping.state))
    || groups.some(group => ['UNAVAILABLE', 'PARTIAL'].includes(group.state));
  const result = { state: incomplete ? 'PARTIAL' : rnb.state, summary, mappings, stats };
  if (!incomplete) CACHE.set(cacheKey, result);
  return result;
}
