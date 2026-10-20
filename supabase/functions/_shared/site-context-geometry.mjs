// IGN Lambert-93 constants (RGF93/WGS84 approximation), distances in metres.
export function project([lon, lat]) {
  const phi = lat * Math.PI / 180, sin = Math.sin(phi), e = .08181919112;
  const iso = Math.log(Math.tan(Math.PI / 4 + phi / 2) * ((1 - e * sin) / (1 + e * sin)) ** (e / 2));
  const r = 11754255.426096 * Math.exp(-.725607765053267 * iso), theta = .725607765053267 * (lon - 3) * Math.PI / 180;
  return [700000 + r * Math.sin(theta), 12655612.049876 - r * Math.cos(theta)];
}
const finitePoint = p => Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number' && typeof p[1] === 'number' && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
export function polygonRings(geometry) {
  const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : null;
  if (!Array.isArray(polygons) || !polygons.length) throw new TypeError('Emprise parcellaire invalide.');
  let vertices = 0;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length) throw new TypeError('Emprise parcellaire invalide.');
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4 || ring.some(p => !finitePoint(p)) || ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) throw new TypeError('Contour parcellaire invalide.');
      vertices += ring.length;
    }
  }
  if (vertices > 256) throw new TypeError('Emprise trop détaillée pour cette consultation ; réduisez le périmètre.');
  return polygons;
}
function ringContains(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export const contains = (polygons, p) => polygons.some(rings => ringContains(p, rings[0]) && !rings.slice(1).some(r => ringContains(p, r)));
function pointSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function segmentDistance(a, b, c, d) {
  const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return 0;
  return Math.min(pointSegment(a, c, d), pointSegment(b, c, d), pointSegment(c, a, b), pointSegment(d, a, b));
}
export function metricParcel(geometry) {
  return polygonRings(geometry).map(rings => rings.map(ring => ring.map(project)));
}
export function distanceToParcel(polygons, geometry) {
  const lines = geometry?.type === 'Point' ? [[geometry.coordinates]] : geometry?.type === 'LineString' ? [geometry.coordinates] : geometry?.type === 'MultiLineString' ? geometry.coordinates : null;
  if (!Array.isArray(lines) || !lines.length || lines.some(line => !Array.isArray(line) || !line.length || line.some(p => !finitePoint(p)))) throw new TypeError('Géométrie Enedis non exploitable.');
  if (lines.reduce((n, line) => n + line.length, 0) > 2000) throw new TypeError('Géométrie Enedis trop détaillée.');
  let distance = Infinity;
  const boundaries = polygons.flat();
  for (const line of lines) {
    const points = line.map(project);
    if (points.some(p => contains(polygons, p))) return 0;
    for (const ring of boundaries) {
      for (let j = 1; j < ring.length; j++) {
        if (points.length === 1) distance = Math.min(distance, pointSegment(points[0], ring[j - 1], ring[j]));
        for (let i = 1; i < points.length; i++) distance = Math.min(distance, segmentDistance(points[i - 1], points[i], ring[j - 1], ring[j]));
        if (distance === 0) return 0;
      }
    }
  }
  return distance;
}
export function searchBounds(geometry, radius) {
  const points = polygonRings(geometry).flat(2);
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const bounds = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const metres = bounds.every(Number.isFinite) && Math.hypot(...project([bounds[2], bounds[3]]).map((v, i) => v - project([bounds[0], bounds[1]])[i]));
  if (!metres || metres > 5000) throw new TypeError('Emprise trop étendue pour cette consultation ; réduisez le périmètre.');
  // Conservative bounding box, then exact point/segment-to-polygon distance filter.
  const dy = radius / 100000, dx = dy / Math.cos(Math.max(Math.abs(bounds[1]), Math.abs(bounds[3])) * Math.PI / 180);
  return [bounds[0] - dx, bounds[1] - dy, bounds[2] + dx, bounds[3] + dy];
}
