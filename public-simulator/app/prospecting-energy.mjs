// Published address aggregates only. No PRM, individual load profile, owner/contact or financial data.
import { knownNumber, requestJson, summarizeConsumption, loadBuildingObservations, buildingAddresses } from './prospecting-data.mjs';
const definitions = [
  { population: 'BUSINESS', slug: 'consommation-annuelle-entreprise-par-adresse', count: 'nombre_de_sites', countLabel: 'site(s)' },
  { population: 'RESIDENTIAL', slug: 'consommation-annuelle-residentielle-par-adresse', count: 'nombre_de_logements', countLabel: 'logement(s)' }
];
const caches = new WeakMap();

export function normalizePublishedEnergy(payload, definition, retrievedAt) {
  if (!Array.isArray(payload?.results)) throw new Error('Réponse Enedis invalide.');
  return payload.results.flatMap(row => {
    const annualMwh = knownNumber(row.consommation_annuelle_totale_de_ladresse_mwh);
    if (annualMwh == null) return [];
    return [{ population: definition.population, year: knownNumber(row.annee), address: String(row.adresse || [row.numero_de_voie, row.indice_de_repetition, row.type_de_voie, row.libelle_de_voie].filter(Boolean).join(' ')),
      communeCode: String(row.code_commune || ''), city: String(row.nom_commune || ''), annualMwh,
      count: knownNumber(row[definition.count]), countLabel: definition.countLabel,
      sector: String(row.code_grand_secteur || ''), category: String((definition.population === 'BUSINESS' ? row.code_secteur_naf2 : row.segment_de_client) ?? ''), retrievedAt }];
  });
}

export async function publishedConsumption(address, { fetcher = fetch, signal, refresh = false, timeoutMs = 12000 } = {}) {
  const communeCode = String(address?.communeCode || '').toUpperCase();
  const city = String(address?.city || '').trim();
  const hasCommuneCode = /^(?:\d{5}|2[AB]\d{3})$/.test(communeCode);
  if (!address?.address || (!hasCommuneCode && !city)) throw new Error('Adresse et commune vérifiées requises pour Enedis.');
  let cache = caches.get(fetcher); if (!cache) { cache = new Map(); caches.set(fetcher, cache); }
  const key = JSON.stringify([address.address.toUpperCase(), hasCommuneCode ? communeCode : city.toUpperCase()]);
  const previous = cache.get(key);
  if (!refresh && previous && Date.now()-previous.time < 10*60*1000) return previous.summary;
  const retrievedAt = new Date().toISOString();
  const results = await Promise.all(definitions.map(async definition => {
    const params = new URLSearchParams({ q: address.address, q_mode: 'and', q_fields: 'adresse,numero_de_voie,type_de_voie,libelle_de_voie', ...(hasCommuneCode ? { code_commune_eq: communeCode } : { nom_commune_eq: city }), size: '100', sort: '-annee' });
    try {
      const payload = await requestJson(`https://opendata.enedis.fr/data-fair/api/v1/datasets/${definition.slug}/lines?${params}`, { fetcher, signal, timeoutMs });
      return { rows: normalizePublishedEnergy(payload, definition, retrievedAt), population: definition.population, truncated: Number(payload.total) > payload.results.length };
    } catch (error) { if (signal?.aborted) throw error; return { rows: [], population: definition.population, error }; }
  }));
  if (results.every(result => result.error)) throw new Error('L’Open Data Enedis est momentanément indisponible. Réessayez dans un instant.');
  const warnings = results.flatMap(result => result.error ? [`Source ${result.population === 'BUSINESS' ? 'entreprise' : 'résidentielle'} indisponible : résultat partiel.`]
    : result.truncated ? [`Historique ${result.population === 'BUSINESS' ? 'entreprise' : 'résidentiel'} limité aux 100 dernières lignes publiées ; résultat potentiellement incomplet.`] : []);
  const summary = summarizeConsumption({ results: results.flatMap(result => result.rows), warnings, retrievedAt }, address);
  summary.partial = results.some(result => result.error || result.truncated);
  if (!summary.partial) { cache.set(key, { time: Date.now(), summary }); if (cache.size > 100) cache.delete(cache.keys().next().value); }
  return summary;
}

export async function candidateConsumption(candidate, options = {}) {
  const observations = await loadBuildingObservations(candidate, { ...options, includePlanning: false });
  const addresses = buildingAddresses(observations.building.building);
  if (addresses.length !== 1) return { state: observations.building.state === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'UNKNOWN', totalMwh: null, reason: addresses.length > 1 ? 'Plusieurs adresses : consulter la fiche.' : 'Adresse non identifiée.' };
  const summary = await publishedConsumption(addresses[0], options);
  return { ...summary, state: summary.totalMwh == null ? 'UNKNOWN' : 'AVAILABLE', address: addresses[0] };
}

export function compareProspectingCards(a, b, mode = 'surface') {
  if (mode.startsWith('consumption')) {
    const av = knownNumber(a.energy?.totalMwh), bv = knownNumber(b.energy?.totalMwh);
    if (av == null || bv == null) { if (av == null && bv != null) return 1; if (av != null && bv == null) return -1; }
    else if (av !== bv) return mode === 'consumptionAsc' ? av-bv : bv-av;
  }
  return b.candidate.areaM2-a.candidate.areaM2 || a.index-b.index;
}
