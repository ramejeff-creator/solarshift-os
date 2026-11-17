import { suggestEnergyInterest } from './acc-energy-suggestion.mjs';

// Qualitative commercial working assessments. No energy score or matching is computed here.
export const ENERGY_INTEREST = Object.freeze({ UNKNOWN: 'À apprécier', HIGH: 'Élevé', MEDIUM: 'Intermédiaire', LOW: 'Limité' });
export const APPRAISAL_RELIABILITY = Object.freeze({ UNKNOWN: 'À préciser', ASSUMPTION: 'Hypothèse', DECLARED: 'Déclaration', DOCUMENTED: 'Éléments documentés' });
export const DECISION_MAKER = Object.freeze({ UNKNOWN: 'À confirmer', YES: 'Décideur identifié', NO: 'Décideur non identifié' });
export const OCCUPANCY = Object.freeze({ UNKNOWN: 'À confirmer', STABLE: 'Stabilité déclarée', UNCERTAIN: 'Stabilité incertaine' });
export const COMMERCIAL_MATURITY = Object.freeze({
  IDENTIFIED: 'Repéré', TO_CONTACT: 'À contacter', CONTACTED: 'Contact établi',
  FOLLOW_UP: 'Relance à prévoir', INTERESTED: 'Intérêt exprimé', QUALIFIED: 'Qualification déclarée',
  COMMITTED: 'Engagement déclaré', REFUSED: 'Refus', OUTSIDE: 'Hors périmètre déclaré',
  TO_VERIFY: 'À vérifier', EXCLUDED: 'Écarté (statut historique)'
});
const clean = (value, limit = 500) => String(value ?? '').trim().slice(0, limit);
function choice(value, choices, fallback, label) {
  if (value == null || value === '') return fallback;
  if (!Object.hasOwn(choices, value)) throw new Error(`Vérifiez ${label}.`);
  return value;
}
function reviewDate(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const date = new Date(`${raw}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== raw) throw new Error('Vérifiez la date de l’appréciation.');
  return raw;
}
function review(input = {}) {
  return {
    reliability: choice(input.reliability, APPRAISAL_RELIABILITY, 'UNKNOWN', 'le fondement de l’appréciation'),
    rationale: clean(input.rationale, 1500), reference: clean(input.reference), assessedOn: reviewDate(input.assessedOn)
  };
}
export function normalizeAppraisals(input = {}) {
  if (input.schemaVersion != null && input.schemaVersion !== 1) throw new Error('Version d’appréciation non prise en charge.');
  const energy = { ...review(input.energy || {}), level: choice(input.energy?.level, ENERGY_INTEREST, 'UNKNOWN', 'l’intérêt énergétique'),
    origin: ['SUGGESTION', 'MANDATAIRE'].includes(input.energy?.origin) ? input.energy.origin : '' };
  const confirmation = input.energy?.confirmation;
  if (confirmation) {
    if (confirmation.status === 'PENDING') energy.confirmation = { status: 'PENDING' };
    else {
      if (confirmation.status !== 'CONFIRMED' || !Number.isFinite(Date.parse(confirmation.confirmedAt)) || !confirmation.inputKey || !confirmation.assessmentKey) throw new Error('La confirmation de l’appréciation est incomplète.');
      energy.confirmation = { status: 'CONFIRMED', confirmedAt: new Date(confirmation.confirmedAt).toISOString(), inputKey: clean(confirmation.inputKey, 6000), assessmentKey: clean(confirmation.assessmentKey, 6000), policyVersion: clean(confirmation.policyVersion, 100), origin: confirmation.origin === 'SUGGESTION' ? 'SUGGESTION' : 'MANDATAIRE' };
    }
  }
  const commercial = { ...review(input.commercial || {}),
    decisionMaker: choice(input.commercial?.decisionMaker, DECISION_MAKER, 'UNKNOWN', 'l’identification du décideur'),
    occupancy: choice(input.commercial?.occupancy, OCCUPANCY, 'UNKNOWN', 'la stabilité d’occupation') };
  if ((energy.level !== 'UNKNOWN' || energy.confirmation) && (!energy.rationale || energy.reliability === 'UNKNOWN' || !energy.reference || !energy.assessedOn)) {
    throw new Error('Pour apprécier l’intérêt énergétique, indiquez une justification, un fondement, une référence et une date.');
  }
  for (const assessment of [energy, commercial]) {
    if (assessment.reliability !== 'UNKNOWN' && (!assessment.reference || !assessment.assessedOn)) throw new Error('Complétez la référence et la date de l’appréciation.');
  }
  return { schemaVersion: 1, energy, commercial };
}
export function energyAssessmentKey(energy = {}) {
  return JSON.stringify({ level: energy.level || 'UNKNOWN', reliability: energy.reliability || 'UNKNOWN', rationale: clean(energy.rationale, 1500), reference: clean(energy.reference), assessedOn: clean(energy.assessedOn) });
}
export function energyConfirmationState(prospect = {}) {
  const energy = prospect.appraisals?.energy || {}, confirmation = energy.confirmation;
  if (energy.pending || confirmation?.status === 'PENDING') return 'PENDING';
  if (energy.level && energy.level !== 'UNKNOWN' || energy.origin || confirmation) return 'RECORDED';
  return 'SUGGESTED';
}
export function prospectAppraisals(prospect = {}) {
  const energy = prospect.appraisals?.energy || {}, commercial = prospect.appraisals?.commercial || {};
  const suggestion = suggestEnergyInterest(prospect), confirmationState = energyConfirmationState(prospect);
  const hasOpinion = energy.level && energy.level !== 'UNKNOWN' || energy.confirmation;
  const level = hasOpinion && Object.hasOwn(ENERGY_INTEREST, energy.level) ? energy.level : suggestion.level;
  const maturity = Object.hasOwn(COMMERCIAL_MATURITY, prospect.status) ? prospect.status : 'IDENTIFIED';
  const knownReliability = assessment => Object.hasOwn(APPRAISAL_RELIABILITY, assessment.reliability) && assessment.reference && assessment.assessedOn ? assessment.reliability : 'UNKNOWN';
  const energyReasons = [];
  if (!hasOpinion) energyReasons.push(...suggestion.reasons, ...suggestion.limitations);
  else if (level === 'UNKNOWN') energyReasons.push(energy.rationale || 'Appréciation laissée à préciser par le mandataire.');
  else energyReasons.push(energy.rationale || 'Justification à compléter.');
  energyReasons.push(prospect.annualKwh == null ? 'Consommation annuelle à renseigner.' : 'Consommation annuelle renseignée ; volume absorbable à étudier.');
  if (!prospect.schedule) energyReasons.push('Horaires / profil d’activité à préciser.');
  if (!prospect.seasonality) energyReasons.push('Saisonnalité et fermetures à préciser.');
  energyReasons.push('L’adéquation horaire et la complémentarité avec le collectif restent à étudier.');
  const commercialReasons = [`D’après le statut commercial : ${COMMERCIAL_MATURITY[maturity].toLocaleLowerCase('fr')}.`];
  commercialReasons.push(DECISION_MAKER[commercial.decisionMaker] || DECISION_MAKER.UNKNOWN);
  commercialReasons.push(commercial.occupancy === 'STABLE' ? 'Occupation stable selon les éléments renseignés.' : commercial.occupancy === 'UNCERTAIN' ? 'Stabilité d’occupation à examiner.' : 'Stabilité d’occupation à confirmer.');
  if (!prospect.phone && !prospect.email) commercialReasons.push('Coordonnées de contact à compléter.');
  if (commercial.rationale) commercialReasons.push(commercial.rationale);
  return {
    energy: { level, label: ENERGY_INTEREST[level], reliability: hasOpinion ? knownReliability(energy) : suggestion.reliability, reasons: energyReasons, reference: hasOpinion ? energy.reference || '' : `Présélection par activité · ${suggestion.policyVersion}`, assessedOn: hasOpinion ? energy.assessedOn || '' : suggestion.generatedAt.slice(0, 10),
      confirmationState, confirmationLabel: ({ SUGGESTED: level === 'UNKNOWN' ? 'Informations insuffisantes' : 'Suggestion automatique', PENDING: 'À enregistrer avec la fiche', RECORDED: energy.origin === 'SUGGESTION' || energy.pendingOrigin === 'SUGGESTION' || energy.confirmation?.origin === 'SUGGESTION' ? 'Suggestion enregistrée' : 'Appréciation enregistrée' })[confirmationState],
      confidence: !hasOpinion || energy.origin === 'SUGGESTION' || energy.pendingOrigin === 'SUGGESTION' || energy.confirmation?.origin === 'SUGGESTION' && energy.reliability === 'ASSUMPTION' ? suggestion.confidence : null,
      references: hasOpinion ? [] : suggestion.references, confirmedAt: energy.confirmation?.confirmedAt || '', suggestion },
    commercial: { level: maturity, label: COMMERCIAL_MATURITY[maturity], reliability: knownReliability(commercial), reasons: commercialReasons, reference: commercial.reference || '', assessedOn: commercial.assessedOn || '' }
  };
}
export function compareAppraisals(a, b, kind) {
  const rank = kind === 'energy' ? ['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'] : ['COMMITTED', 'QUALIFIED', 'INTERESTED', 'CONTACTED', 'FOLLOW_UP', 'TO_CONTACT', 'IDENTIFIED', 'REFUSED', 'OUTSIDE'];
  const left = prospectAppraisals(a)[kind], right = prospectAppraisals(b)[kind];
  return rank.indexOf(left.level) - rank.indexOf(right.level);
}
