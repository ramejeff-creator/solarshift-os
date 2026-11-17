import { normalizeAddressReference } from './site-address.mjs?v=20261110-location-restore-2';
import './installer-commission.js';
import { normalizeMissionPlan,missionRemunerationMatches } from './ozeno-missions.mjs';
export const installerCommissionForPreview = (preview) => globalThis.OzenoInstallerCommission.fromPreview(preview);
export { captureSiteLocation, restoreSiteLocation } from './site-address.mjs?v=20261110-location-restore-2';
const CONFIG = globalThis.SOLARSHIFT_CONFIG || {};
export const SUPABASE_URL = CONFIG.supabaseUrl || 'https://rniitydsksjrphulrlct.supabase.co';
const KEY = CONFIG.supabasePublishableKey || 'sb_publishable_M1MDLia8t54lZ5xqlEEAtg_k94v6gRR';
const SESSION_KEY = CONFIG.sessionStorageKey || 'ozeno-supabase-session';
const clone = (value) => JSON.parse(JSON.stringify(value));
export const COMMERCIAL_PROJECT_STATUSES = Object.freeze(['VALIDATED', 'IN_PROGRESS', 'ABANDONED', 'DELETED']);
export const PIPELINE_CATEGORIES = Object.freeze(['VALIDATED', 'IN_PROGRESS', 'PROSPECTING', 'PENDING']);
export const PROJECT_OPERATION_MODES = Object.freeze(['UNSPECIFIED', 'NO_MANAGEMENT', 'INSTALLATION_MANAGEMENT', 'ACC_MANAGEMENT', 'INSTALLATION_AND_ACC', 'OTHER']);
export const MANAGEMENT_CONTRACT_STATUSES = Object.freeze(['UNSPECIFIED', 'NOT_PLANNED', 'TO_PROPOSE', 'PROPOSED', 'NEGOTIATING', 'TO_SIGN', 'ACTIVE', 'SUSPENDED', 'TERMINATED_BY_OWNER', 'ENDED']);
export const CRM_PROJECT_STAGES = Object.freeze(['QUALIFICATION', 'CONTACT_ESTABLISHED', 'PROPOSAL_TO_PREPARE', 'PROPOSAL_SENT', 'CONTRACT_TO_SIGN', 'CONTRACT_ACTIVE', 'CONTRACT_SUSPENDED_OR_TERMINATED', 'PROJECT_COMPLETED', 'OPPORTUNITY_LOST', 'ARCHIVED', 'NEGOTIATION', 'AGREEMENT_OBTAINED', 'CONTRACT_SUSPENDED', 'CONTRACT_TERMINATED', 'NO_MANAGEMENT_CONTRACT', 'PROSPECTING']);
export const PLANNED_ACTION_TYPES = Object.freeze(['CALL', 'EMAIL', 'MEETING', 'SITE_VISIT', 'SEND_PROPOSAL', 'FOLLOW_UP', 'OTHER']);
export const PLANNED_ACTION_STATUSES = Object.freeze(['PLANNED', 'DONE', 'CANCELLED']);

export function projectPipelineCategory(record = {}) {
  if (record.commercialStatus === 'VALIDATED') return 'VALIDATED';
  if (['ABANDONED', 'DELETED'].includes(record.commercialStatus)) return null;
  return PIPELINE_CATEGORIES.includes(record.pipelineCategory) && record.pipelineCategory !== 'VALIDATED'
    ? record.pipelineCategory
    : 'IN_PROGRESS';
}

export function projectPipelineCounts(records = []) {
  return records.reduce((counts, record) => {
    const category = projectPipelineCategory(record);
    if (category) counts[category] += 1;
    return counts;
  }, { VALIDATED: 0, IN_PROGRESS: 0, PROSPECTING: 0, PENDING: 0 });
}

export function projectMapCoordinates(record) {
  const latitudeValue = record?.latitude, longitudeValue = record?.longitude;
  if (latitudeValue == null || longitudeValue == null
    || (typeof latitudeValue === 'string' && !latitudeValue.trim())
    || (typeof longitudeValue === 'string' && !longitudeValue.trim())) return null;
  const latitude = Number(latitudeValue), longitude = Number(longitudeValue);
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

export function normalizeProject(input) {
  const result = {};
  for (const [key, limit] of Object.entries({ name: 200, address: 500, clientName: 200, companyName: 200, siret: 17, contactName: 200, phone: 80, email: 254, installerName: 200, installationDate: 10, coordinateSource: 80 })) {
    result[key] = String(input[key] ?? '').trim();
    if (result[key].length > limit) throw new Error(`Le champ ${key} est trop long.`);
  }
  result.siret = result.siret.replace(/\s+/g, '');
  if (result.siret && !/^\d{14}$/.test(result.siret)) throw new Error('Le SIRET doit contenir 14 chiffres.');
  result.commercialStatus = String(input.commercialStatus ?? 'IN_PROGRESS').trim();
  if (!COMMERCIAL_PROJECT_STATUSES.includes(result.commercialStatus)) throw new Error('Le statut commercial du projet est invalide.');
  result.pipelineCategory = result.commercialStatus === 'VALIDATED'
    ? 'VALIDATED'
    : String(input.pipelineCategory ?? 'IN_PROGRESS').trim();
  if (!PIPELINE_CATEGORIES.includes(result.pipelineCategory)) throw new Error('La catégorie de portefeuille du projet est invalide.');
  result.operationMode = String(input.operationMode ?? 'UNSPECIFIED').trim();
  if (!PROJECT_OPERATION_MODES.includes(result.operationMode)) throw new Error('Le mode d’intervention OZENO est invalide.');
  result.managementContractStatus = String(input.managementContractStatus ?? 'UNSPECIFIED').trim();
  if (!MANAGEMENT_CONTRACT_STATUSES.includes(result.managementContractStatus)) throw new Error('Le statut du contrat de gestion est invalide.');
  if (input.crmStage != null) {
    result.crmStage = String(input.crmStage).trim();
    if (!CRM_PROJECT_STAGES.includes(result.crmStage)) throw new Error('L’étape du projet est invalide.');
  }
  if (input.crmArchived != null && typeof input.crmArchived !== 'boolean') throw new Error('L’état d’archivage du projet est invalide.');
  result.crmArchived = input.crmArchived === true;
  const stageHistory = Array.isArray(input.crmStageHistory) ? input.crmStageHistory : [];
  if (stageHistory.length > 200) throw new Error('L’historique des étapes du projet est trop long.');
  result.crmStageHistory = stageHistory.map((entry) => {
    const item = {
      from: String(entry?.from ?? '').trim(),
      to: String(entry?.to ?? '').trim(),
      changedAt: String(entry?.changedAt ?? '').trim()
    };
    const changedAt = new Date(item.changedAt);
    if (!CRM_PROJECT_STAGES.includes(item.from) || !CRM_PROJECT_STAGES.includes(item.to)
      || !Number.isFinite(changedAt.getTime()) || item.changedAt.length > 40) {
      throw new Error('Une entrée de l’historique des étapes est invalide.');
    }
    return item;
  });
  result.crmStageChangedAt = String(input.crmStageChangedAt ?? result.crmStageHistory.at(-1)?.changedAt ?? '').trim();
  if (result.crmStageChangedAt.length > 40 || (result.crmStageChangedAt && !Number.isFinite(new Date(result.crmStageChangedAt).getTime()))) {
    throw new Error('La date de changement d’étape est invalide.');
  }
  const actions = Array.isArray(input.plannedActions) ? input.plannedActions : [];
  if (actions.length > 100) throw new Error('Un projet ne peut contenir plus de 100 actions planifiées.');
  result.plannedActions = actions.map((action) => {
    const entry = {
      id: String(action?.id ?? '').trim(),
      type: String(action?.type ?? '').trim(),
      title: String(action?.title ?? '').trim(),
      dueDate: String(action?.dueDate ?? '').trim(),
      notes: String(action?.notes ?? '').trim(),
      status: String(action?.status ?? 'PLANNED').trim(),
      createdAt: String(action?.createdAt ?? '').trim(),
      completedAt: String(action?.completedAt ?? '').trim(),
      occurredAt: String(action?.occurredAt ?? '').trim(),
      ...(action?.source ? { source: String(action.source).trim() } : {}),
      ...(action?.sourceProspectId ? { sourceProspectId: String(action.sourceProspectId).trim() } : {})
    };
    const dueDate = new Date(`${entry.dueDate}T00:00:00Z`);
    if (!entry.id || entry.id.length > 100 || !PLANNED_ACTION_TYPES.includes(entry.type)
      || !entry.title || entry.title.length > 180 || !/^\d{4}-\d{2}-\d{2}$/.test(entry.dueDate)
      || !Number.isFinite(dueDate.getTime()) || dueDate.toISOString().slice(0, 10) !== entry.dueDate
      || entry.notes.length > 1200 || !PLANNED_ACTION_STATUSES.includes(entry.status)
      || entry.createdAt.length > 40 || entry.completedAt.length > 40 || entry.occurredAt.length > 40
      || (entry.source && entry.source.length > 80) || (entry.sourceProspectId && entry.sourceProspectId.length > 100)
      || (entry.occurredAt && !Number.isFinite(new Date(entry.occurredAt).getTime()))) {
      throw new Error('Une action planifiée contient des informations invalides.');
    }
    return entry;
  });
  if (!result.name) throw new Error('Indiquez le nom du projet.');
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new Error('Vérifiez l’adresse e-mail du contact.');
  const date = new Date(`${result.installationDate}T00:00:00Z`);
  if (result.installationDate && (!/^\d{4}-\d{2}-\d{2}$/.test(result.installationDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== result.installationDate)) throw new Error('Vérifiez la date prévue d’installation.');
  result.latitude = input.latitude == null || input.latitude === '' ? null : Number(input.latitude);
  result.longitude = input.longitude == null || input.longitude === '' ? null : Number(input.longitude);
  if ((result.latitude == null) !== (result.longitude == null) || (result.latitude != null && (!Number.isFinite(result.latitude) || Math.abs(result.latitude) > 90 || !Number.isFinite(result.longitude) || Math.abs(result.longitude) > 180))) throw new Error('Les coordonnées du site sont invalides.');
  result.addressReference = normalizeAddressReference(input.addressReference);
  result.preview = input.preview && typeof input.preview === 'object' && !Array.isArray(input.preview) ? clone(input.preview) : {};
  const missionPlan=input.missionPlan??result.preview.missionPlan;
  if(missionPlan!=null){
    const previousPlan=result.preview.missionPlan;
    if(previousPlan?.missions?.includes('ACC_MANAGEMENT')&&!missionPlan.missions?.includes('ACC_MANAGEMENT')&&!result.preview.previousMissionPlan)result.preview.previousMissionPlan=clone(previousPlan);
    result.missionPlan=normalizeMissionPlan(missionPlan);result.preview.missionPlan=clone(result.missionPlan);
    if(result.preview.missionRemuneration&&!missionRemunerationMatches(result.preview.missionRemuneration,result.missionPlan)){
      result.preview.previousMissionRemuneration=clone(result.preview.missionRemuneration);
      result.preview.missionRemuneration=null;
    }
  }
  if (input.prospectKey != null) {
    result.prospectKey = String(input.prospectKey).trim();
    if (result.prospectKey.length > 120 || !/^OBI:way\/\d+$/.test(result.prospectKey)) throw new Error('La référence du prospect est invalide.');
  }
  if (input.prospectStatus != null) {
    result.prospectStatus = String(input.prospectStatus).trim();
    if (result.prospectStatus !== 'PENDING_MANDATAIRE_REVIEW') throw new Error('Le statut de qualification du prospect est invalide.');
  }
  if (JSON.stringify(result).length > 500000) throw new Error('Le brouillon est trop volumineux pour cet enregistrement.');
  return result;
}

export function createDraftStore(storage, owner = 'anonymous', { uuid = () => crypto.randomUUID(), now = () => new Date().toISOString() } = {}) {
  const key = `ozeno-commercial-drafts-v1:${owner}`;
  const read = () => {
    const raw = storage.getItem(key);
    if (!raw) return [];
    let data;
    try { data = JSON.parse(raw); } catch { throw new Error('Les brouillons locaux sont illisibles. Ils n’ont pas été écrasés.'); }
    if (data.schemaVersion !== 1 || !Array.isArray(data.records)) throw new Error('Le format des brouillons n’est pas reconnu. Les données sont conservées.');
    return data.records;
  };
  return {
    list: () => clone(read()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    get: (id) => clone(read().find((record) => record.id === id) || null),
    save(input, { id = null, expectedVersion = 0 } = {}) {
      const payload = normalizeProject(input);
      const records = read();
      const previous = id ? records.find((record) => record.id === id) : null;
      if (id && !previous) throw new Error('Ce brouillon n’existe plus dans ce navigateur.');
      if ((previous?.version || 0) !== expectedVersion) throw new Error('Le projet a été modifié dans un autre onglet. Rechargez-le avant d’enregistrer.');
      const record = { id: previous?.id || uuid(), version: (previous?.version || 0) + 1, status: 'LOCAL_DRAFT', scope: 'local', createdAt: previous?.createdAt || now(), updatedAt: now(), ...payload };
      storage.setItem(key, JSON.stringify({ schemaVersion: 1, records: [...records.filter((item) => item.id !== record.id), record] }));
      return clone(record);
    }
  };
}

export function mergeLocalProjectRecords(accountRecords = [], deviceRecords = []) {
  const records = new Map(deviceRecords.map((record) => [record.id, record]));
  accountRecords.forEach((record) => records.set(record.id, record));
  return [...records.values()].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

export function draftStoreForRecord(accountStore, deviceStore, recordId) {
  return accountStore.get(recordId) ? accountStore : deviceStore;
}

export function projectLink(record, baseUrl) {
  if (record.scope !== 'cloud') throw new Error('Un brouillon local ne peut pas être ouvert sur un autre appareil. Enregistrez-le dans votre compte avant de le partager.');
  const url = new URL('./index.html', baseUrl);
  url.search = new URLSearchParams({ projectId: record.id }).toString();
  url.hash = '';
  return url.href;
}

async function request(path, { token, method = 'GET', body, prefer } = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method, headers: { apikey: KEY, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (/^\/rest\/v1\/installer_(partners|opportunities)(?:\?|$)/.test(path) && (response.status === 404 || data.code === 'PGRST205')) {
      const error = new Error('Le stockage du réseau OZENO n’est pas encore installé sur cet environnement. La consultation des prestataires publics reste disponible.');
      error.code = 'INSTALLER_NETWORK_NOT_INSTALLED'; error.status = response.status;
      throw error;
    }
    if (/^\/rest\/v1\//.test(path) && (response.status === 404 || data.code === 'PGRST202')) throw new Error('Le service d’enregistrement des projets doit encore être déployé. Aucune donnée n’a été enregistrée dans le compte.');
    throw new Error(data.message || data.msg || data.error_description || data.error || `Service indisponible (${response.status}).`);
  }
  return data;
}

export async function getSession(storage) {
  let session;
  try { session = JSON.parse(storage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  if (!session?.access_token) return null;
  if (Number(session.expires_at) > Date.now() / 1000 + 60) return session;
  if (!session.refresh_token) return null;
  const refreshed = await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } });
  refreshed.expires_at = Math.floor(Date.now() / 1000) + Number(refreshed.expires_in || 3600);
  storage.setItem(SESSION_KEY, JSON.stringify(refreshed));
  return refreshed;
}

export const getIdentity = (token) => request('/auth/v1/user', { token });
export async function signInWithPassword(email, password, storage) {
  const session = await request('/auth/v1/token?grant_type=password', {
    method: 'POST', body: { email: String(email).trim(), password }
  });
  if (!session?.access_token || !session?.refresh_token) throw new Error('La réponse de connexion est incomplète.');
  session.expires_at = Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600);
  await getIdentity(session.access_token);
  storage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}
export async function listMfaFactors(token) {
  // Supabase lists factors on the authenticated user; GET /factors is not supported.
  const user = await getIdentity(token);
  const all = Array.isArray(user?.factors) ? user.factors : [];
  return { all, phone: all.filter(factor => factor.factor_type === 'phone'),
    totp: all.filter(factor => factor.factor_type === 'totp') };
}
export const enrollMfaPhone = (token, phone) => request('/auth/v1/factors', {
  token, method: 'POST', body: { factor_type: 'phone', phone: String(phone).trim(), friendly_name: 'Téléphone professionnel' }
});
export const challengeMfaFactor = (token, factorId) => request(`/auth/v1/factors/${encodeURIComponent(factorId)}/challenge`, { token, method: 'POST', body: {} });
export async function verifyMfaFactor(token, factorId, challengeId, code, storage) {
  const session = await request(`/auth/v1/factors/${encodeURIComponent(factorId)}/verify`, {
    token, method: 'POST', body: { challenge_id: challengeId, code: String(code).trim() }
  });
  if (!session?.access_token || !session?.refresh_token) throw new Error('La validation du code n’a pas renvoyé de session sécurisée.');
  session.expires_at = Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600);
  storage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}
export const sendPasswordRecovery = (email, redirect) => request(`/auth/v1/recover?${new URLSearchParams({ redirect_to: redirect })}`, {
  method: 'POST', body: { email: String(email).trim() }
});
export const setRecoveredPassword = (token, password) => request('/auth/v1/user', {
  token, method: 'PUT', body: { password: String(password) }
});
export const cloudOrganizations = (token) => request('/rest/v1/rpc/commercial_project_organizations', { token, method: 'POST', body: {} });
export const cloudProjects = (token, projectId = null) => request('/rest/v1/rpc/list_commercial_projects', { token, method: 'POST', body: { target_project: projectId } });
export const saveCloudProject = (token, record, { projectId = null, organizationId = null, expectedVersion = 0 } = {}) => request('/rest/v1/rpc/save_commercial_project', { token, method: 'POST', body: { project_record: normalizeProject(record), target_project: projectId, target_organization: organizationId, expected_version: expectedVersion } });
export function cloudInstallerPartners(token, organizationId) {
  const query = new URLSearchParams({ select: '*', organization_id: `eq.${organizationId}`, order: 'updated_at.desc' });
  return request(`/rest/v1/installer_partners?${query}`, { token });
}
export function saveCloudInstallerPartner(token, organizationId, partner, partnerId = null) {
  const body = { ...partner, organization_id: organizationId };
  if (partnerId) {
    const query = new URLSearchParams({ id: `eq.${partnerId}`, organization_id: `eq.${organizationId}`, select: '*' });
    return request(`/rest/v1/installer_partners?${query}`, { token, method: 'PATCH', body, prefer: 'return=representation' });
  }
  return request('/rest/v1/installer_partners?select=*', { token, method: 'POST', body, prefer: 'return=representation' });
}
export function cloudInstallerOpportunities(token, projectId) {
  const query = new URLSearchParams({ select: '*', project_id: `eq.${projectId}`, order: 'created_at.desc' });
  return request(`/rest/v1/installer_opportunities?${query}`, { token });
}
export function recordCloudInstallerOpportunity(token, opportunity) {
  return request('/rest/v1/installer_opportunities?select=*', { token, method: 'POST', body: opportunity, prefer: 'return=representation' });
}
export function updateCloudInstallerOpportunity(token, opportunityId, updates) {
  const query = new URLSearchParams({ id: `eq.${opportunityId}`, select: '*' });
  return request(`/rest/v1/installer_opportunities?${query}`, { token, method: 'PATCH', body: updates, prefer: 'return=representation' });
}
export function setCommercialProjectStatus(token, projectId, status, expectedVersion) {
  if (!COMMERCIAL_PROJECT_STATUSES.includes(status)) throw new Error('Le statut commercial du projet est invalide.');
  return request('/rest/v1/rpc/set_commercial_project_pipeline_status', {
    token, method: 'POST', body: { target_project: projectId, next_status: status, expected_version: expectedVersion }
  });
}
export async function signOut(storage, token) {
  try { if (token) await request('/auth/v1/logout?scope=local', { token, method: 'POST' }); }
  finally { storage.removeItem(SESSION_KEY); }
}
// Raw Auth REST expects redirect_to in the query, unlike SDK options.emailRedirectTo.
export const sendLoginLink = (email, redirect) => request(`/auth/v1/otp?${new URLSearchParams({ redirect_to: redirect })}`, { method: 'POST', body: { email, create_user: false } });
