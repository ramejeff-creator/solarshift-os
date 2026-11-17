export const OBI_TERTIARY_FLAG = 'OBI_TERTIARY_PROSPECTING_ENABLED';
export const OBI_FIXTURE_PATH = './obi-001-muret-fixture.json';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function isObiTertiaryProspectingEnabled(config = {}, locationLike = {}) {
  if (!LOCAL_HOSTS.has(String(locationLike.hostname || '').toLowerCase())) return false;
  if (config[OBI_TERTIARY_FLAG] === true) return true;
  try {
    return new URLSearchParams(locationLike.search || '').get(OBI_TERTIARY_FLAG) === 'true';
  } catch {
    return false;
  }
}

export async function loadMuretFixture(fetcher = globalThis.fetch) {
  if (typeof fetcher !== 'function') throw new Error('Lecteur de fixture local indisponible.');
  const response = await fetcher(OBI_FIXTURE_PATH, { method: 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' } });
  if (!response?.ok) throw new Error('Jeu de démonstration indisponible pour cette zone.');
  const fixture = await response.json();
  if (fixture?.fixtureStatus !== 'LIVE_PUBLIC_FALLBACK_CAPTURE'
    || fixture?.canonicalMapResponse?.elements?.length !== 1664
    || fixture?.sourceCounts?.responseElements !== 5553
    || fixture?.source?.attribution !== '© OpenStreetMap contributors') {
    throw new Error('La fixture Muret ne correspond pas à la baseline A2 attendue.');
  }
  return fixture;
}

export async function buildMuretContourCandidates(fixture, latitude, longitude, radiusMeters) {
  const { mapBuildingWays, nearbyRoofCandidates } = await import('./osm-footprint-client.mjs');
  const ways = mapBuildingWays(fixture.canonicalMapResponse);
  const candidates = nearbyRoofCandidates(ways, Number(latitude), Number(longitude), {
    radiusMeters: Number(radiusMeters), minimumAreaM2: 1
  });
  return {
    candidates,
    canonicalBuildingWays: ways.length,
    rawResponseElements: fixture.sourceCounts.responseElements,
    partial: true,
    warning: 'Jeu de démonstration partiel : cette capture cartographique ne constitue pas un inventaire exhaustif des emprises ni des établissements tertiaires.'
  };
}

export function matchesMuretFixtureCenter(center, fixture, toleranceMeters = 5) {
  if (!center || !fixture?.site) return false;
  const lat1 = Number(center.latitude), lon1 = Number(center.longitude);
  const lat2 = Number(fixture.site.latitude), lon2 = Number(fixture.site.longitude);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return false;
  const toRadians = (value) => value * Math.PI / 180;
  const dLat = toRadians(lat2 - lat1), dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) <= toleranceMeters;
}
