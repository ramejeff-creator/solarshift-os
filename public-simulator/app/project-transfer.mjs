import { normalizeProject } from './project-hub-client.mjs';
const identity = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function sameProjectSite(local, cloud) {
  return Boolean(local?.name && local?.address && cloud?.name && cloud?.address
    && identity(local.name) === identity(cloud.name) && identity(local.address) === identity(cloud.address));
}
export function mergeProjectTransfer(local, cloud, provenance = {}) {
  if (!sameProjectSite(local, cloud)) throw new Error('Le nom et l’adresse doivent correspondre au dossier existant.');
  const data = { ...structuredClone(cloud), ...structuredClone(local) };
  for (const key of ['clientName', 'contactName', 'phone', 'email', 'installerName', 'installationDate']) {
    if (!String(local[key] || '').trim()) data[key] = cloud[key] || '';
  }
  const old = cloud.preview || {}, next = local.preview || {};
  data.preview = { ...structuredClone(old), ...structuredClone(next), controls: { ...structuredClone(old.controls || {}), ...structuredClone(next.controls || {}) } };
  if (!next.parcelQualification && old.parcelQualification) data.preview.parcelQualification = structuredClone(old.parcelQualification);
  if (!next.roofs?.surfaces?.length && old.roofs?.surfaces?.length) data.preview.roofs = structuredClone(old.roofs);
  if (!next.risks?.length && old.risks?.length) data.preview.risks = structuredClone(old.risks);
  if (next.siteQualification?.activityKnowledge !== 'KNOWN' && old.siteQualification?.activityKnowledge === 'KNOWN') data.preview.siteQualification = structuredClone(old.siteQualification);
  data.commercialStatus = cloud.commercialStatus || 'IN_PROGRESS'; data.pipelineCategory = cloud.pipelineCategory || 'IN_PROGRESS';
  data.preview.transferProvenance = { method: 'LOCAL_DRAFT_TO_EXISTING_ACCOUNT_PROJECT', localDraftId: provenance.localDraftId, localVersion: provenance.localVersion, previousCloudVersion: cloud.version, transferredAt: provenance.transferredAt || new Date().toISOString() };
  return normalizeProject(data);
}
export function downloadTransferBackup(local, cloud, incoming) {
  const body = JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), local, cloud, incoming }, null, 2);
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `sauvegarde-${String(local.name || 'projet').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-avant-mise-en-ligne.json`;
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
