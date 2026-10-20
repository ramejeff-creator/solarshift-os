import { metricParcel } from './site-context-geometry.mjs';

export const IGN_WMS = 'https://data.geopf.fr/wms-r/ows';
export const PLAN_LAYERS = { plan: 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2', photo: 'ORTHOIMAGERY.ORTHOPHOTOS' };
export const CADASTRE_LAYER = 'CADASTRALPARCELS.PARCELLAIRE_EXPRESS';
const FORMATS = { A4: [297, 210], A3: [420, 297] };
const SCALES = [500, 1000, 2000, 5000, 10000];
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, apikey, authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });

export function situationLayout(input) {
  if (!input || !FORMATS[input.format] || !SCALES.includes(input.scale) || !PLAN_LAYERS[input.base] || typeof input.cadastre !== 'boolean' || !['landscape', 'portrait'].includes(input.orientation)) throw new TypeError('Choisissez le fond, le format et l’échelle proposés.');
  const polygons = metricParcel(input.geometry);
  const geographic = input.geometry.type === 'Polygon' ? [input.geometry.coordinates] : input.geometry.coordinates;
  // Lambert-93 only: never print an overseas site at a misleading metropolitan scale.
  if (geographic.flat(2).some(([lon, lat]) => lon < -6 || lon > 10 || lat < 41 || lat > 52)) throw new TypeError('Ce plan en Lambert-93 est disponible pour la France métropolitaine.');
  const points = polygons.flat(2), xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const extent = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const pageMm = input.orientation === 'portrait' ? [...FORMATS[input.format]].reverse() : [...FORMATS[input.format]];
  const mapMm = [pageMm[0] - 24, pageMm[1] - 76];
  const groundM = mapMm.map(n => n * input.scale / 1000);
  const center = [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2];
  const bbox = [center[0] - groundM[0] / 2, center[1] - groundM[1] / 2, center[0] + groundM[0] / 2, center[1] + groundM[1] / 2];
  if (extent[0] < bbox[0] + groundM[0] * .02 || extent[1] < bbox[1] + groundM[1] * .02 || extent[2] > bbox[2] - groundM[0] * .02 || extent[3] > bbox[3] - groundM[1] * .02) throw new TypeError('La parcelle dépasse le cadre. Choisissez une échelle plus large (par exemple 1/2 000) ou un format plus grand.');
  const dpi = 200, pixels = mapMm.map(n => Math.round(n / 25.4 * dpi));
  const paths = polygons.map(rings => rings.map(ring => ring.map(([x, y]) => [(x - bbox[0]) / groundM[0], (bbox[3] - y) / groundM[1]])));
  const scaleBarM = input.scale / 20; // Exactly 50 mm on paper.
  return { pageMm, mapMm, groundM, bbox, pixels, dpi, crs: 'EPSG:2154', paths, scaleBarM, scale: input.scale, format: input.format, orientation: input.orientation };
}

function base64(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 8192) result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(result);
}
export async function handleSituationPlanRequest(request, { fetchImpl = fetch } = {}) {
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return reply({ error: 'Méthode non autorisée.' }, 405);
  let input, layout;
  try {
    const raw = await request.text();
    if (raw.length > 32768) return reply({ error: 'Emprise trop détaillée.' }, 413);
    input = JSON.parse(raw); layout = situationLayout(input);
  } catch (error) { return reply({ error: error instanceof TypeError ? error.message : 'Demande de plan invalide.' }, 400); }
  const layers = [PLAN_LAYERS[input.base], ...(input.cadastre ? [CADASTRE_LAYER] : [])];
  const url = new URL(IGN_WMS);
  url.search = new URLSearchParams({ SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetMap', LAYERS: layers.join(','), STYLES: layers.map(() => '').join(','), CRS: layout.crs, BBOX: layout.bbox.join(','), WIDTH: String(layout.pixels[0]), HEIGHT: String(layout.pixels[1]), FORMAT: 'image/png', TRANSPARENT: 'FALSE', BGCOLOR: '0xFFFFFF' }).toString();
  try {
    const response = await fetchImpl(url.href, { signal: AbortSignal.any([request.signal, AbortSignal.timeout(30000)]), redirect: 'error' });
    if (!response.ok || !response.headers.get('content-type')?.toLowerCase().startsWith('image/png')) throw new Error('IGN unavailable');
    if (Number(response.headers.get('content-length') || 0) > 12000000) throw new Error('Image too large');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 24 || bytes.length > 12000000 || ![137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) throw new Error('Invalid image');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(16) !== layout.pixels[0] || view.getUint32(20) !== layout.pixels[1]) throw new Error('Invalid dimensions');
    return reply({ schemaVersion: 1, state: 'AVAILABLE', ...layout, base: input.base, cadastre: input.cadastre, image: `data:image/png;base64,${base64(bytes)}`, source: { name: 'IGN · Géoplateforme', url: url.href, layers, retrievedAt: new Date().toISOString(), dataDate: null, licence: 'Licence Ouverte Etalab 2.0', attribution: input.cadastre ? '© IGN · DGFiP' : '© IGN' } });
  } catch { return reply({ error: 'Fond IGN indisponible. Aucun plan incomplet n’est exporté ; réessayez.' }, 502); }
}
