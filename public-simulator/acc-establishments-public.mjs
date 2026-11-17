import { coordinates, distanceMeters, normalizeProspect } from './acc-prospects-model.mjs';

const ENDPOINT = 'https://recherche-entreprises.api.gouv.fr/near_point';
// Indicative grouping of the establishment's published NAF rev.2 activity;
// this does not establish occupation, electricity consumption or eligibility.
export function categoryFromNaf(code = '') {
  if (!/^\d{2}\.\d{2}[A-Z]$/.test(code)) return 'OTHER';
  const division = Number(code.slice(0, 2));
  if (division === 55) return 'HOTEL';
  if ([45, 46, 47].includes(division)) return 'SHOP';
  if (division >= 10 && division <= 33) return 'INDUSTRY';
  if ([86, 87].includes(division)) return 'HEALTH';
  if ([62, 63, 64, 65, 66, 69, 70, 71, 72, 73, 74].includes(division)) return 'OFFICE';
  if (division === 84) return 'PUBLIC';
  return 'OTHER';
}
export function establishmentsFromPublicDirectory(payload, origin, radiusMeters, observedAt = new Date().toISOString()) {
  if (!Array.isArray(payload?.results)) throw new Error('Réponse du répertoire d’établissements invalide.');
  const unique = new Map();
  for (const company of payload.results) {
    if (company.etat_administratif !== 'A' || company.opposition_diffusion_commerciale === true) continue;
    // Only geographically matched establishments; never substitute the company HQ.
    for (const establishment of company.matching_etablissements || []) {
      const siret = String(establishment.siret || '');
      if (!/^\d{14}$/.test(siret) || establishment.etat_administratif !== 'A' || establishment.statut_diffusion_etablissement !== 'O') continue;
      const point = coordinates(establishment);
      if (!point || distanceMeters(origin, point) > radiusMeters) continue;
      const name = establishment.nom_commercial || establishment.liste_enseignes?.find(value => typeof value === 'string' && value.trim()) || company.nom_complet;
      if (typeof name !== 'string' || !name.trim()) continue;
      const activityCode = String(establishment.activite_principale || '');
      const sourceUrl = `https://annuaire-entreprises.data.gouv.fr/etablissement/${siret}`;
      const prospect = normalizeProspect({
        id: `sirene:${siret}`, name, address: establishment.adresse || '', ...point,
        category: categoryFromNaf(activityCode), source: 'API Recherche d’entreprises', sourceUrl, observedAt,
        identification: { name, address: establishment.adresse || '', ...point, category: categoryFromNaf(activityCode),
          source: 'API Recherche d’entreprises', sourceUrl, observedAt, siret, activityCode }
      });
      unique.set(prospect.id, prospect);
    }
  }
  return [...unique.values()].sort((a, b) => distanceMeters(origin, a) - distanceMeters(origin, b));
}

export async function searchPublicEstablishments(origin, { radiusMeters, signal, fetcher = fetch, timeoutMs = 12000, onProgress = () => {} } = {}) {
  const point = coordinates(origin);
  if (!point || !Number.isInteger(radiusMeters) || radiusMeters < 500 || radiusMeters > 5000 || radiusMeters % 500 !== 0) throw new Error('Périmètre de recherche invalide.');
  const unique = new Map(), deadline = Date.now() + timeoutMs;
  let pagesRead = 0, companiesRead = 0, totalCompanies = null;
  // A bounded initial selection; the UI explicitly labels it as partial.
  for (let page = 1; page <= 2; page++) {
    if (signal?.aborted) throw new DOMException('Recherche annulée.', 'AbortError');
    onProgress(`Consultation du répertoire public · page ${page}/2…`);
    const controller = new AbortController(), abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(6000, deadline - Date.now())));
    try {
      const params = new URLSearchParams({ lat: String(point.latitude), long: String(point.longitude), radius: String(radiusMeters / 1000), page: String(page), per_page: '25' });
      const response = await fetcher(`${ENDPOINT}?${params}`, { headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (signal?.aborted) throw new DOMException('Recherche annulée.', 'AbortError');
      onProgress(`${companiesRead + payload.results.length} entreprises examinées · qualification des établissements…`);
      const prospects = establishmentsFromPublicDirectory(payload, point, radiusMeters);
      prospects.forEach(prospect => unique.set(prospect.id, prospect));
      pagesRead++; companiesRead += payload.results.length;
      totalCompanies = Number.isFinite(payload.total_results) ? payload.total_results : null;
      if (!payload.results.length || payload.total_pages === page || payload.results.length < 25) break;
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Recherche annulée.', 'AbortError');
      if (!pagesRead) throw error;
      break; // Preserve the first successful page and disclose partial coverage.
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
    if (Date.now() >= deadline) break;
  }
  const results = [...unique.values()].sort((a, b) => distanceMeters(point, a) - distanceMeters(point, b));
  results.searchInfo = { source: 'API Recherche d’entreprises', partial: true, companiesRead, totalCompanies };
  return results;
}
