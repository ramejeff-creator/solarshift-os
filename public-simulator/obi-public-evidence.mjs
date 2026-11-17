export const EVIDENCE_STATES = Object.freeze([
  'AVAILABLE', 'NO_MATCH', 'UNAVAILABLE', 'PARTIAL', 'AMBIGUOUS', 'STALE',
  'CONFLICTED', 'AUTH_REQUIRED', 'UNKNOWN'
]);

const OBSERVED_CASES = Object.freeze({
  '81401972': {
    label: '41 boulevard de Joffrery, 31600 Muret',
    rnbIds: ['7GFB2KH6AS87', '6TQD9BX8CP45'],
    groupId: 'bdnb-bg-C6E5-GD8W-HQGC'
  },
  '704399122': {
    label: '1 rue de Marclan, 31600 Muret',
    rnbIds: ['7H8NE2HWD3D1'],
    groupId: null
  }
});

export function supportedMuretCase(candidate) {
  if (!candidate || !/^(?:81401972|704399122)$/.test(String(candidate.osmId))) return null;
  return OBSERVED_CASES[String(candidate.osmId)];
}

function polygonParts(shape) {
  if (!shape || !['Polygon', 'MultiPolygon'].includes(shape.type)) return [];
  const polygons = shape.type === 'Polygon' ? [shape.coordinates] : shape.coordinates;
  return polygons.map(rings => (Array.isArray(rings) ? rings : []).map(ring =>
    (Array.isArray(ring) ? ring : []).map(point => Array.isArray(point) ? [Number(point[0]), Number(point[1])] : [NaN, NaN])
  )).filter(rings => rings[0]?.length >= 4 && rings.every(ring => ring.every(point => point.every(Number.isFinite))));
}

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > point[1]) !== (yj > point[1]) && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function contains(polygons, point) {
  return polygons.some(rings => pointInRing(point, rings[0]) && !rings.slice(1).some(ring => pointInRing(point, ring)));
}

/** Deterministic local equirectangular sampling; indicative geometry comparison, never occupancy proof. */
export function approximateGeometryOverlap(osmCoordinates, rnbShape, resolution = 300) {
  const inputRing = (Array.isArray(osmCoordinates) ? osmCoordinates : []).map(point => [Number(point.lon ?? point.lng), Number(point.lat)]);
  if (inputRing.length < 4 || inputRing.some(point => !point.every(Number.isFinite))) return null;
  const rnb = polygonParts(rnbShape);
  if (!rnb.length) return null;
  const latitude = inputRing.reduce((sum, point) => sum + point[1], 0) / inputRing.length;
  const centerLon = inputRing.reduce((sum, point) => sum + point[0], 0) / inputRing.length;
  const centerLat = latitude;
  const xScale = 111320 * Math.cos(centerLat * Math.PI / 180), yScale = 110540;
  const project = ([lon, lat]) => [(lon - centerLon) * xScale, (lat - centerLat) * yScale];
  const osm = [[inputRing.map(project)]];
  const projectedRnb = rnb.map(rings => rings.map(ring => ring.map(project)));
  const allPoints = [...osm.flat(2), ...projectedRnb.flat(2)];
  const minX = Math.min(...allPoints.map(point => point[0])), maxX = Math.max(...allPoints.map(point => point[0]));
  const minY = Math.min(...allPoints.map(point => point[1])), maxY = Math.max(...allPoints.map(point => point[1]));
  if (!(maxX > minX && maxY > minY)) return null;
  const steps = Math.max(40, Math.min(500, Math.floor(Number(resolution) || 300)));
  let osmCount = 0, rnbCount = 0, intersectionCount = 0;
  for (let row = 0; row < steps; row++) for (let column = 0; column < steps; column++) {
    const point = [minX + (column + .5) * (maxX - minX) / steps, minY + (row + .5) * (maxY - minY) / steps];
    const inOsm = contains(osm, point), inRnb = contains(projectedRnb, point);
    if (inOsm) osmCount++;
    if (inRnb) rnbCount++;
    if (inOsm && inRnb) intersectionCount++;
  }
  const unionCount = osmCount + rnbCount - intersectionCount;
  if (!osmCount || !rnbCount || !unionCount) return null;
  const round = value => Math.round(value * 1000) / 1000;
  return {
    method: `Échantillonnage local sur grille équirectangulaire ${steps} × ${steps} (approximation)`,
    resolution: steps,
    intersectionOverUnion: round(intersectionCount / unionCount),
    osmCoveredByRnb: round(intersectionCount / osmCount),
    rnbCoveredByOsm: round(intersectionCount / rnbCount)
  };
}

export function buildEvidenceSummary({ candidate, rnbObservation, mappings, groups, retrievedAt = new Date().toISOString() }) {
  const targetCase = supportedMuretCase(candidate);
  const rnbCandidates = (rnbObservation?.data || []).map(building => ({
    id: building.rnb_id,
    status: building.status || 'UNKNOWN',
    active: building.is_active ?? null,
    distanceMeters: Number.isFinite(Number(building.distance)) ? Number(building.distance) : null,
    overlap: approximateGeometryOverlap(candidate.geometry, building.shape),
    address: (building.addresses || []).map(address => [address.street_number, address.street, address.city_zipcode, address.city_name].filter(Boolean).join(' ')).filter(Boolean),
    extIds: Array.isArray(building.ext_ids) ? building.ext_ids : []
  })).sort((a, b) => (b.overlap?.intersectionOverUnion ?? -1) - (a.overlap?.intersectionOverUnion ?? -1));
  const rnbState = rnbObservation?.state || 'UNKNOWN';
  const mappingRows = Array.isArray(mappings) ? mappings : [];
  const groupRows = Array.isArray(groups) ? groups : [];
  const groupState = mappingRows.some(row => row.state === 'UNAVAILABLE') || groupRows.some(row => row.state === 'UNAVAILABLE') ? 'UNAVAILABLE'
    : mappingRows.some(row => row.state === 'PARTIAL') || groupRows.some(row => row.state === 'PARTIAL') ? 'PARTIAL'
      : groupRows.length > 1 || groupRows.some(row => row.state === 'AMBIGUOUS') ? 'AMBIGUOUS'
        : groupRows.length ? 'AVAILABLE'
          : rnbState === 'UNAVAILABLE' ? 'UNAVAILABLE'
            : mappingRows.some(row => row.state === 'UNKNOWN') ? 'UNKNOWN'
            : mappingRows.some(row => row.state === 'NO_MATCH') ? 'NO_MATCH'
              : rnbCandidates.length ? 'NO_MATCH' : 'UNKNOWN';
  const usageValues = [...new Set(groupRows.flatMap(row => row.data || []).map(row => row.usage_principal_bdnb_open).filter(value => typeof value === 'string' && value.trim()))];
  return {
    case: targetCase,
    target: { namespace: 'OSM_WAY', id: String(candidate.osmId), areaM2: Number(candidate.areaM2) || null },
    retrievedAt,
    rnb: { state: rnbState, candidates: rnbCandidates, source: rnbObservation?.source || null, url: rnbObservation?.url || null, retrievedAt: rnbObservation?.retrievedAt || retrievedAt, error: rnbObservation?.error || null },
    bdnb: {
      state: groupState,
      groups: groupRows.map(row => ({ id: row.id, state: row.state, source: row.source, url: row.url, retrievedAt: row.retrievedAt, error: row.error || null, data: row.data || [] })),
      usageValues
    },
    qualification: {
      activityAtIndividualBuilding: 'UNKNOWN',
      tertiaryFloorAreaM2: null,
      roofExploitableAreaM2: null,
      annualActualFinalEnergyKwh: null,
      eetLegalScope: 'UNKNOWN',
      eetConclusion: 'UNKNOWN',
      renovationNeed: 'UNKNOWN'
    },
    nextQuestion: 'Pouvez-vous confirmer quelle construction est occupée par votre activité et transmettre un plan ou une attestation indiquant les surfaces tertiaires réellement exploitées ?'
  };
}
