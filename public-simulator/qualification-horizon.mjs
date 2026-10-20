import { requestJson, containsPoint } from './prospecting-data.mjs';
const CONVENTION = 'PVGIS_SOUTH_ZERO_WEST_POSITIVE';
const finite = n => typeof n === 'number' && Number.isFinite(n);
export function validHorizon(value, point) {
  if (!value || value.schemaVersion !== 1 || !value.queryPoint || value.queryPoint.latitude !== point?.latitude || value.queryPoint.longitude !== point?.longitude) return false;
  if (value.state === 'UNAVAILABLE') return typeof value.error === 'string';
  return value.state === 'AVAILABLE' && value.method === 'PVGIS_5_3_PRINTHORIZON' && value.azimuthConvention === CONVENTION
    && !Number.isNaN(Date.parse(value.retrievedAt))
    && [value.southHorizonDeg, value.maxHorizonDeg].every(n => finite(n) && Math.abs(n) <= 90)
    && ['profile', 'december', 'june'].every(key => Array.isArray(value[key]) && value[key].length >= 9 && value[key].length <= 721
      && value[key].every((p, i, all) => p && finite(p.azimuthDeg) && finite(p.heightDeg) && Math.abs(p.azimuthDeg) <= 180 && Math.abs(p.heightDeg) <= 90
        && (!i || p.azimuthDeg > all[i - 1].azimuthDeg && p.azimuthDeg - all[i - 1].azimuthDeg <= 45))
      && value[key][0].azimuthDeg === -180 && value[key].at(-1).azimuthDeg === 180)
    && value.profile.find(p => p.azimuthDeg === 0)?.heightDeg === value.southHorizonDeg
    && Math.max(...value.profile.map(p => p.heightDeg)) === value.maxHorizonDeg;
}
export function qualificationAnalysisPoint(snapshot) {
  const proposed = snapshot.siteContext?.analysisPoint || snapshot.cadastre?.lookupPoint || snapshot.point;
  return proposed && containsPoint(snapshot.parcel?.geometry, [proposed.longitude, proposed.latitude]) ? proposed : null;
}
export async function loadQualificationHorizon(snapshot, { endpoint, fetcher, signal } = {}) {
  const point = qualificationAnalysisPoint(snapshot);
  if (!point) return null;
  try {
    const query = new URLSearchParams({ tool: 'printhorizon', lat: String(point.latitude), lon: String(point.longitude) });
    const separator = String(endpoint).includes('?') ? '&' : '?';
    const result = await requestJson(`${endpoint}${separator}${query}`, { fetcher, signal, timeoutMs: 25000 });
    if (!validHorizon(result, point) || result.state !== 'AVAILABLE') throw new Error('Profil PVGIS incohérent.');
    return result;
  } catch (error) {
    if (signal?.aborted) throw error;
    return { schemaVersion: 1, state: 'UNAVAILABLE', queryPoint: point, retrievedAt: new Date().toISOString(), error: 'Masque du relief PVGIS non récupéré. À compléter.', name: 'PVGIS 5.3 · JRC', url: 'https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis_en' };
  }
}
export function horizonChartData(horizon, width = 640, height = 240) {
  if (horizon?.state !== 'AVAILABLE') return null;
  const left = 36, right = width - 16, top = 14, bottom = height - 30;
  const minY = Math.min(0, ...horizon.profile.map(p => Math.floor(p.heightDeg / 10) * 10));
  const x = a => left + (a + 180) / 360 * (right - left), y = h => bottom - (h - minY) / (90 - minY) * (bottom - top);
  return { width, height, left, right, top, bottom,
    curves: [['profile', 'Relief', '#526b61'], ['december', 'Soleil · 21 décembre', '#4d75a2'], ['june', 'Soleil · 21 juin', '#cb8a13']].map(([key, label, color]) => ({ key, label, color, points: horizon[key].map(p => [x(p.azimuthDeg), y(p.heightDeg)]) })),
    xTicks: [[-180, 'N'], [-90, 'E'], [0, 'S'], [90, 'O'], [180, 'N']].map(([a, label]) => ({ position: x(a), label })),
    yTicks: [...new Set([minY, 0, 30, 60, 90])].map(h => ({ position: y(h), label: `${h}°` })) };
}
export function appendHorizon(host, horizon) {
  const make = (tag, text) => { const n = document.createElement(tag); n.textContent = text || ''; return n; };
  const block = make('section'); block.className = 'parcelHorizon'; block.append(make('h3', 'Masque solaire · relief'));
  if (!horizon || horizon.state !== 'AVAILABLE') {
    block.append(make('p', horizon?.error || 'Masque du relief non encore consulté.')); host.append(block); return;
  }
  const fmt = n => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  block.append(make('p', `Horizon plein sud : ${fmt(horizon.southHorizonDeg)}° · relief maximal : ${fmt(horizon.maxHorizonDeg)}°.`));
  const details = make('details'); details.append(make('summary', 'Voir le profil du relief et les courses du soleil'));
  const data = horizonChartData(horizon), ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${data.width} ${data.height}`); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Horizon du relief et hauteurs du soleil les 21 décembre et 21 juin. Axe de gauche à droite : nord, est, sud, ouest, nord. Hauteur en degrés. Relief au sud ${fmt(horizon.southHorizonDeg)} degrés.`);
  const shape = (tag, attrs, text) => { const n = document.createElementNS(ns, tag); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, String(v))); if (text) n.textContent = text; svg.append(n); };
  for (const t of data.yTicks) { shape('line', { x1: data.left, x2: data.right, y1: t.position, y2: t.position, stroke: '#dce5e1' }); shape('text', { x: data.left - 7, y: t.position + 4, 'text-anchor': 'end', 'font-size': 11, fill: '#526b61' }, t.label); }
  for (const t of data.xTicks) shape('text', { x: t.position, y: data.bottom + 20, 'text-anchor': 'middle', 'font-size': 12, fill: '#183d36' }, t.label);
  for (const c of data.curves) shape('polyline', { points: c.points.map(p => p.join(',')).join(' '), fill: 'none', stroke: c.color, 'stroke-width': 2, ...(c.key === 'december' ? { 'stroke-dasharray': '5 3' } : {}) });
  details.append(svg);
  const legend = make('p', 'Relief (gris-vert) · soleil du 21 décembre (bleu pointillé) · soleil du 21 juin (ocre). Hauteurs en degrés.'); legend.className = 'parcelMuted'; details.append(legend);
  const source = make('p', `${horizon.name} · consulté le ${new Date(horizon.retrievedAt).toLocaleString('fr-FR')} · altitude du modèle : ${horizon.elevationM == null ? 'non renseignée' : `${fmt(horizon.elevationM)} m`}.`); source.className = 'parcelSource'; details.append(source);
  block.append(details, make('p', horizon.limitation), make('p', 'Le relief est déjà pris en compte par défaut dans les estimations PVGIS existantes. Ce profil n’ajoute aucune perte aux calculs ; l’ombrage proche reste à vérifier.'));
  host.append(block);
}
