const DRAFT_KEY_PREFIX = 'ozeno-commercial-drafts-v1:';

const normalized = (value) => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();

function normalizedAddress(value) {
  return normalized(value)
    .replace(/\b(?:\d{5})\b/g, ' ')
    .replace(/\b(?:bd|boul)\b/g, ' boulevard ')
    .replace(/\b(?:av|ave)\b/g, ' avenue ')
    .replace(/\b(?:st)\b/g, ' saint ')
    .replace(/\s+/g, ' ')
    .trim();
}

function roofGeometry(entry) {
  const geometry = entry?.geometry?.type === 'Feature' ? entry.geometry.geometry : entry?.geometry;
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type) || !Array.isArray(geometry.coordinates)) return null;
  return geometry;
}

export function findLocalRoofDrafts(storage, project) {
  const targetName = normalized(project?.name);
  const projectAddress = normalizedAddress(project?.address);
  const addressSuffix = [project?.postal_code, project?.city]
    .filter((value) => value && !projectAddress.includes(normalizedAddress(value)));
  const targetAddress = normalizedAddress([projectAddress, ...addressSuffix].filter(Boolean).join(' '));
  const matches = [];
  for (let index = 0; index < Number(storage?.length || 0); index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(DRAFT_KEY_PREFIX)) continue;
    let payload;
    try { payload = JSON.parse(storage.getItem(key) || 'null'); } catch { continue; }
    if (payload?.schemaVersion !== 1 || !Array.isArray(payload.records)) continue;
    for (const record of payload.records) {
      const roofs = record?.preview?.roofs;
      if (!record?.id || !Array.isArray(roofs?.surfaces) || !roofs.surfaces.some((entry) => roofGeometry(entry))) continue;
      if (normalized(record.name) !== targetName) continue;
      const draftAddress = normalizedAddress(record.address);
      if (targetAddress && draftAddress !== targetAddress) continue;
      matches.push({
        id: record.id,
        name: record.name,
        address: record.address,
        updatedAt: record.updatedAt || '',
        surfaces: roofs.surfaces.map((entry, surfaceIndex) => ({
          name: `Toiture issue du brouillon · zone ${surfaceIndex + 1}`,
          area_kind: 'ROOF',
          geometry_geojson: roofGeometry(entry)
        })).filter((entry) => entry.geometry_geojson)
      });
    }
  }
  return matches.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}
