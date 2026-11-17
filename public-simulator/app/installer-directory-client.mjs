export async function fetchPublicInstallerDirectory(input, { endpoint = globalThis.SOLARSHIFT_CONFIG?.installerDirectoryEndpoint, fetchImpl = fetch, signal } = {}) {
  if (!endpoint) throw new Error('La recherche de prestataires locaux n’est pas activée sur cet environnement.');
  const params = new URLSearchParams({ postalCode: input.postalCode, scope: input.scope || 'department', technologies: input.technologies.join(',') });
  const response = await fetchImpl(`${endpoint}?${params}`, { signal, headers: { Accept: 'application/json' } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Le répertoire public est momentanément indisponible.');
  if (!['READY', 'UNSUPPORTED'].includes(data.status) || !Array.isArray(data.partners) || !data.metadata) throw new Error('La réponse du répertoire public est invalide.');
  return data;
}

export function mergePublicInstallerPartners(publicPartners, privatePartners) {
  // A public company is never promoted automatically to the OZENO network.
  // Match an establishment by SIRET, falling back to SIREN only for a company-level fiche.
  return publicPartners.map(partner => {
    const known = privatePartners.find(item => (item.siret && item.siret === partner.siret) || (!item.siret && item.siren && item.siren === partner.siren));
    return { ...partner, known_partner: known || null };
  });
}

export function publicInstallerDraft(partner) {
  return { ...partner, id: null, network_status: 'CANDIDATE', verified_at: null,
    company_source: `${partner.company_source} · ${partner.source_url}`, company_checked_at: null,
    qualifications: (partner.qualifications || []).map(qualification => ({ ...qualification, status: 'PENDING' })) };
}

export function reviewedInstallerQualifications(originals = [], primary = null) {
  const qualifiers = structuredClone(originals);
  return (primary ? [{ ...(qualifiers[0] || {}), ...primary }, ...qualifiers.slice(1)] : qualifiers.slice(1)).slice(0, 20);
}
