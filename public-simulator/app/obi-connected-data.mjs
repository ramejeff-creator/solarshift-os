import { loadBuildingObservations, buildingAddresses, matchingBuildingAddressReference } from './prospecting-data.mjs';
import { publishedConsumption } from './prospecting-energy.mjs?v=20261116-enedis-prospecting-display-3';

// Reuse the existing public readers and their spatial/address checks.
// An address aggregate never becomes a building's measured consumption.
export async function loadConnectedCandidate(candidate, options = {}) {
  const observations = await loadBuildingObservations(candidate, options);
  if (options.signal?.aborted) throw new DOMException('Consultation annulée.', 'AbortError');
  const building = observations.building.building;
  const addresses = buildingAddresses(building);
  // Prefer the exact project address when it matches the spatially identified
  // BDNB group. Otherwise use only that group's published primary BAN address;
  // never choose an arbitrary secondary address from a multi-address group.
  const primaryAddress = buildingAddresses({ ...building, l_libelle_adr: [] })[0] || null;
  const address = matchingBuildingAddressReference(addresses, candidate.referenceAddress) || primaryAddress
    || (addresses.length === 1 ? addresses[0] : null);
  let energy = { state: observations.building.state === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'UNKNOWN', totalMwh: null,
    reason: addresses.length > 1 ? 'Plusieurs adresses dans le groupe ; consultez l’agrégat de l’adresse de recherche ci-dessus. Aucune consommation n’est attribuée à ce bâtiment.' : observations.building.error || 'Adresse non rattachée au contour.' };
  if (address) {
    try {
      const summary = await publishedConsumption(address, options);
      energy = { ...summary, state: summary.totalMwh == null ? 'UNKNOWN' : 'AVAILABLE', address, reason: summary.totalMwh == null ? (summary.partial ? 'Consultation Enedis partielle · valeur non établie.' : 'Aucun agrégat retrouvé à l’adresse vérifiée.') : null };
    } catch (error) {
      if (options.signal?.aborted) throw error;
      energy = { state: 'UNAVAILABLE', totalMwh: null, reason: error.message };
    }
  }
  return { observations, energy };
}

export async function loadConnectedAddressAggregate(reference, options = {}) {
  const precision = String(reference?.precision || '');
  if (!reference || !['ADDRESS', 'USER_CONFIRMED_ADDRESS'].includes(precision)) {
    return { state: 'UNKNOWN', totalMwh: null, reason: 'Sélectionnez une adresse postale précise pour consulter Enedis.' };
  }
  const label = String(reference.label || '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const parsed = label.match(/^(.+?)\s+(\d{5})\s+(.+)$/);
  const address = String(reference.address || reference.streetAddress || parsed?.[1] || '').trim();
  const postalCode = String(reference.postalCode || parsed?.[2] || '').trim();
  const city = String(reference.city || parsed?.[3] || '').trim();
  const communeCode = String(reference.communeCode || reference.cityCode || '').trim().toUpperCase();
  if (!/^\d+\s+.+/.test(address) || !/^\d{5}$/.test(postalCode) || city.length < 2
    || communeCode && !/^(?:\d{5}|2[AB]\d{3})$/.test(communeCode)) {
    return { state: 'UNKNOWN', totalMwh: null, reason: 'L’adresse sélectionnée ne contient pas une voie et un code postal vérifiables.' };
  }
  const verifiedAddress = { address, postalCode, city, communeCode, label: `${address}, ${postalCode} ${city}` };
  try {
    const summary = await publishedConsumption(verifiedAddress, options);
    return { ...summary, address: verifiedAddress, state: summary.totalMwh == null ? 'UNKNOWN' : 'AVAILABLE',
      reason: summary.totalMwh == null ? (summary.partial ? 'Consultation Enedis partielle · valeur non établie.' : 'Aucun agrégat publié trouvé à cette adresse exacte.') : null };
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return { state: 'UNAVAILABLE', totalMwh: null, address: verifiedAddress, reason: error.message };
  }
}

export function connectedEnergyLabel(energy, pending = false) {
  if (pending) return 'Recherche en cours…';
  if (energy?.totalMwh != null && Number.isFinite(Number(energy.totalMwh))) {
    const count = Array.isArray(energy.latest) ? energy.latest.length : null;
    const referenceCount = count == null ? '' : ` · ${count} ligne${count > 1 ? 's' : ''} Enedis publiée${count > 1 ? 's' : ''}`;
    const address = energy.address?.label ? `${energy.address.label} · ` : '';
    return `${address}${Number(energy.totalMwh).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} MWh/an · ${energy.latestYear || 'année non précisée'}${referenceCount} · agrégat à l’adresse, non attribué au bâtiment${energy.partial ? ' · partiel' : ''}`;
  }
  return energy?.state === 'UNAVAILABLE' ? 'Source indisponible · réessayer dans la fiche' : energy?.reason || 'Non renseignée';
}
