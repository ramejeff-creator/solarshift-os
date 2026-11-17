import { normalizeAppraisals, compareAppraisals } from './acc-prospect-appraisals.mjs';
import { suggestEnergyInterest } from './acc-energy-suggestion.mjs';

export const CATEGORIES = Object.freeze({ HOTEL: 'Hôtel / hébergement', OFFICE: 'Bureaux', SHOP: 'Commerce', INDUSTRY: 'Atelier / industrie', PUBLIC: 'Équipement public', HEALTH: 'Santé', OTHER: 'Autre' });
export const STATUSES = Object.freeze({
  IDENTIFIED: 'Repéré', TO_CONTACT: 'À contacter', CONTACTED: 'Contacté', INTERESTED: 'Intéressé',
  QUALIFIED: 'Qualifié', COMMITTED: 'Engagé', FOLLOW_UP: 'À relancer', REFUSED: 'Refus',
  OUTSIDE: 'Hors périmètre', TO_VERIFY: 'À vérifier', EXCLUDED: 'Écarté (ancien statut)'
});
export const FOLLOW_UP_STAGES = Object.freeze({ TO_CONTACT: 'À contacter', CONTACTED: 'Contacté', FOLLOW_UP: 'Relance prévue', INTERESTED: 'Intéressé', NO_RESPONSE: 'Sans suite' });
export const QUALITIES = Object.freeze({ UNKNOWN: 'Non renseignée', ESTIMATED: 'Estimée', DECLARED: 'Déclarée', MEASURED: 'Mesurée · référence fournie' });
export const PRIORITIES = Object.freeze({ NORMAL: 'Normale', HIGH: 'Haute', LOW: 'Basse' });
export const MAX_PROSPECTS = 200;
const text = (value, limit = 500) => String(value ?? '').trim().slice(0, limit);
const missing = value => value == null || String(value).trim() === '';
const enumValue = (value, choices, fallback) => {
  if (missing(value)) return fallback;
  if (!Object.hasOwn(choices, value)) throw new Error('Une valeur de qualification est inconnue.');
  return value;
};
export function coordinates(value) {
  if (missing(value?.latitude) || missing(value?.longitude)) return null;
  const latitude = Number(value.latitude), longitude = Number(value.longitude);
  return Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Number.isFinite(longitude) && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
}
export function distanceMeters(a, b) {
  a = coordinates(a); b = coordinates(b);
  if (!a || !b) return null;
  const r = Math.PI / 180, arc = Math.sin((b.latitude - a.latitude) * r / 2) ** 2 + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.sin((b.longitude - a.longitude) * r / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(arc)));
}
function date(value, label) {
  if (missing(value)) return '';
  const raw = String(value), parsed = new Date(`${raw}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) throw new Error(`Vérifiez ${label}.`);
  return raw;
}
export function normalizeProspect(input, { id = () => crypto.randomUUID(), now = () => new Date().toISOString() } = {}) {
  const name = text(input.name, 200);
  if (!name) throw new Error('Indiquez le nom de l’établissement.');
  const point = coordinates(input);
  if ((!missing(input.latitude) || !missing(input.longitude)) && !point) throw new Error('Renseignez les deux coordonnées valides, ou laissez-les vides.');
  const category = enumValue(input.category, CATEGORIES, 'OTHER');
  const followUpStage = enumValue(input.followUpStage, FOLLOW_UP_STAGES, 'TO_CONTACT');
  const rawStatus = missing(input.status) ? 'IDENTIFIED' : String(input.status);
  let status = ['SELECTED', 'TO_VERIFY'].includes(rawStatus)
    ? 'IDENTIFIED'
    : Object.hasOwn(STATUSES, rawStatus) ? rawStatus : null;
  if (!status) throw new Error('Une étape de prospection est inconnue.');
  // Older dossiers encoded the participant choice as the status SELECTED.
  // Keep that choice while restoring a neutral contact status.
  const selected = !['REFUSED', 'OUTSIDE', 'EXCLUDED'].includes(status)
    && (input.selected === true || rawStatus === 'SELECTED');
  const quality = enumValue(input.energyQuality, QUALITIES, 'UNKNOWN');
  const annualKwh = missing(input.annualKwh) ? null : Number(input.annualKwh);
  if (annualKwh !== null && (!Number.isFinite(annualKwh) || annualKwh < 0)) throw new Error('La consommation annuelle doit être positive ou nulle.');
  if (annualKwh !== null && (quality === 'UNKNOWN' || !text(input.energySource) || !input.energyDate)) throw new Error('Précisez la nature, la référence et la date de la consommation.');
  const email = text(input.email, 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Vérifiez l’adresse e-mail.');
  const prospect = {
    id: text(input.id || id(), 100), name, category, status, followUpStage, priority: enumValue(input.priority, PRIORITIES, 'NORMAL'),
    address: text(input.address), latitude: point?.latitude ?? null, longitude: point?.longitude ?? null,
    selected,
    contact: text(input.contact, 200), phone: text(input.phone, 80), email,
    annualKwh, energyQuality: annualKwh === null ? 'UNKNOWN' : quality,
    appraisals: normalizeAppraisals(input.appraisals || {}),
    energySource: text(input.energySource), energyDate: date(input.energyDate, 'la date de référence énergie'),
    schedule: text(input.schedule), seasonality: text(input.seasonality),
    nextAction: text(input.nextAction), followUpDate: date(input.followUpDate, 'la date de relance'), notes: text(input.notes, 2000),
    source: text(input.source || 'MANDATAIRE_DECLARATION', 100), sourceUrl: safeUrl(input.sourceUrl),
    identification: input.identification ? {
      name: text(input.identification.name, 200), address: text(input.identification.address),
      category: enumValue(input.identification.category, CATEGORIES, 'OTHER'),
      latitude: coordinates(input.identification)?.latitude ?? null, longitude: coordinates(input.identification)?.longitude ?? null,
      source: text(input.identification.source, 100), sourceUrl: safeUrl(input.identification.sourceUrl),
      siret: /^\d{14}$/.test(String(input.identification.siret || '')) ? String(input.identification.siret) : '',
      activityCode: text(input.identification.activityCode, 10),
      activityHint: input.identification.activityHint === 'SUPERMARKET' ? 'SUPERMARKET' : '',
      observedAt: Number.isFinite(Date.parse(input.identification.observedAt)) ? new Date(input.identification.observedAt).toISOString() : null
    } : null,
    observedAt: input.observedAt && Number.isFinite(Date.parse(input.observedAt)) ? new Date(input.observedAt).toISOString() : now(),
    updatedAt: now()
  };
  prospect.appraisals.energySuggestion = suggestEnergyInterest(prospect, { previous: input.appraisals?.energySuggestion, now });
  return prospect;
}
export function safeUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
export function restoreCollective(snapshot) {
  if (snapshot == null) return [];
  if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.prospects) || snapshot.prospects.length > MAX_PROSPECTS) throw new Error('Le collectif enregistré nécessite une vérification de son format.');
  const prospects = snapshot.prospects.map(input => {
    if (!input?.id) throw new Error('Un prospect enregistré ne possède pas de référence.');
    return { ...normalizeProspect(input), updatedAt: input.updatedAt };
  });
  if (new Set(prospects.map(p => p.id)).size !== prospects.length) throw new Error('Plusieurs prospects possèdent la même référence.');
  return prospects;
}
export function collectiveSnapshot(prospects, projectId, now = new Date().toISOString()) {
  if (prospects.length > MAX_PROSPECTS) throw new Error(`Limite de ${MAX_PROSPECTS} prospects par dossier atteinte.`);
  return { schemaVersion: 1, kind: 'COMMERCIAL_NON_CANONICAL', projectId, updatedAt: now, prospects: restoreCollective({ schemaVersion: 1, prospects }) };
}
export function withCollective(project, snapshot) {
  if (!project?.id || snapshot?.projectId !== project.id) throw new Error('Le collectif ne correspond pas au dossier.');
  restoreCollective(snapshot);
  return { ...project, preview: { ...project.preview, accCollective: structuredClone(snapshot) } };
}
export function withAccProspectPlanningActions(project, snapshot, now = () => new Date().toISOString()) {
  if (!project?.id || snapshot?.projectId !== project.id) throw new Error('Le collectif ne correspond pas au dossier.');
  const prospects = restoreCollective(snapshot);
  const existing = Array.isArray(project.plannedActions) ? project.plannedActions : [];
  const source = 'ACC_PROSPECT_FOLLOW_UP';
  const activeByProspectDate = new Map(existing
    .filter(action => action?.source === source && action.sourceProspectId && action.dueDate)
    .map(action => [`${action.sourceProspectId}:${action.dueDate}`, action]));
  const desired = prospects.filter(prospect => prospect.followUpDate).map(prospect => {
    const key = `${prospect.id}:${prospect.followUpDate}`;
    const previous = activeByProspectDate.get(key);
    return {
      ...previous,
      id: previous?.id || `acc-follow-up:${encodeURIComponent(prospect.id)}:${prospect.followUpDate}`,
      source,
      sourceProspectId: prospect.id,
      type: 'FOLLOW_UP',
      title: `${prospect.nextAction || 'Relancer'} · ${prospect.name}`,
      dueDate: prospect.followUpDate,
      startTime: '',
      endTime: '',
      notes: `Action liée à la fiche prospect ACC « ${prospect.name} ».`,
      status: previous?.status === 'DONE' ? 'DONE' : 'PLANNED',
      createdAt: previous?.createdAt || now(),
      completedAt: previous?.completedAt || '',
      occurredAt: previous?.occurredAt || ''
    };
  });
  const desiredKeys = new Set(desired.map(action => `${action.sourceProspectId}:${action.dueDate}`));
  const retained = existing.map(action => {
    if (action?.source !== source || action.status !== 'PLANNED') return action;
    return desiredKeys.has(`${action.sourceProspectId}:${action.dueDate}`)
      ? action
      : { ...action, status: 'CANCELLED', completedAt: '', occurredAt: '', cancelledAt: now() };
  });
  const merged = retained.filter(action => action?.source !== source || !desiredKeys.has(`${action.sourceProspectId}:${action.dueDate}`));
  return { ...withCollective(project, snapshot), plannedActions: [...merged, ...desired] };
}
export function summarize(prospects, projectPoint) {
  const selected = prospects.filter(p => p.selected && !['REFUSED', 'OUTSIDE', 'EXCLUDED'].includes(p.status));
  const located = selected.filter(p => coordinates(p));
  const points = [...(coordinates(projectPoint) ? [projectPoint] : []), ...located];
  let maxDistance = null;
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) maxDistance = Math.max(maxDistance ?? 0, distanceMeters(points[i], points[j]));
  const known = selected.filter(p => p.annualKwh !== null);
  return { total: prospects.length, selected: selected.length, committed: selected.filter(p => p.status === 'COMMITTED').length, known: known.length,
    annualKwh: known.length ? known.reduce((sum, p) => sum + p.annualKwh, 0) : null,
    maxDistance, unlocated: selected.length - located.length, projectLocated: !!coordinates(projectPoint) };
}
export function filterProspects(prospects, { query = '', category = '', status = '', selectedOnly = false, sort = 'distance', origin = null } = {}) {
  const fold = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
  const needle = fold(query);
  return prospects.filter(p => (!category || p.category === category) && (!status || p.status === status) && (!selectedOnly || p.selected)
    && fold(`${p.name} ${p.address}`).includes(needle)).sort((a, b) => {
    if (sort === 'priority') { const rank = { HIGH: 0, NORMAL: 1, LOW: 2 }; const delta = rank[a.priority] - rank[b.priority]; if (delta) return delta; }
    if (sort === 'energy' || sort === 'commercial') { const delta = compareAppraisals(a, b, sort); if (delta) return delta; }
    if (sort !== 'name') { const delta = (distanceMeters(origin, a) ?? Infinity) - (distanceMeters(origin, b) ?? Infinity); if (Number.isFinite(delta) && delta) return delta; if (delta === Infinity || delta === -Infinity) return delta; }
    return a.name.localeCompare(b.name, 'fr');
  });
}
