// Versioned qualitative lead-screening heuristic, never an energy calculation.
// The labels are OZENO suggestions, not classifications issued by these sources.
export const ENERGY_SUGGESTION_POLICY = Object.freeze({
  version: 'ACC-ENERGY-SUGGESTION-2026-11-02.1',
  ademe: 'https://www.ademe.fr/wp-content/uploads/2025/01/avis-ademe-autoconsommation-photovoltaique_-janvier-2025.pdf',
  office: 'https://www.ecologie.gouv.fr/sites/default/files/documents/Rapport%20autoconsommation%20-%20DGEC.pdf',
  coldStorage: 'https://www.insee.fr/fr/metadonnees/nafr2/sousClasse/52.10a'
});
const clean = value => String(value ?? '').trim();
export function energySuggestionInputKey(prospect = {}) {
  const annual = prospect.annualKwh;
  const annualKwh = annual == null || clean(annual) === '' || !Number.isFinite(Number(annual)) ? null : Number(annual);
  return JSON.stringify({ category: prospect.category || 'OTHER', activityCode: clean(prospect.identification?.activityCode),
    activityHint: clean(prospect.identification?.activityHint), originalCategory: prospect.identification?.category || '',
    annualKwh,
    energyQuality: annualKwh === null ? 'UNKNOWN' : prospect.energyQuality || 'UNKNOWN', energySource: clean(prospect.energySource), energyDate: clean(prospect.energyDate),
    schedule: clean(prospect.schedule), seasonality: clean(prospect.seasonality), source: clean(prospect.source || 'MANDATAIRE_DECLARATION'), sourceUrl: clean(prospect.sourceUrl)
  });
}
export function suggestEnergyInterest(prospect = {}, { previous = prospect.appraisals?.energySuggestion, now = () => new Date().toISOString() } = {}) {
  const inputKey = energySuggestionInputKey(prospect), code = clean(prospect.identification?.activityCode);
  const reasons = [], limitations = ['L’activité publiée ne prouve ni l’occupation des locaux, ni leur consommation électrique.', 'Adéquation horaire, volume absorbable et complémentarité avec le collectif à étudier.'];
  const references = [];
  let level = 'UNKNOWN', ruleId = 'INSUFFICIENT_ACTIVITY';
  const categoryUnchanged = !prospect.identification?.category || prospect.category === prospect.identification.category;
  const annual = JSON.parse(inputKey).annualKwh;
  const referenceDate = clean(prospect.energyDate), parsedDate = new Date(`${referenceDate}T00:00:00Z`);
  const validReferenceDate = /^\d{4}-\d{2}-\d{2}$/.test(referenceDate) && Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === referenceDate;
  const referencedConsumption = annual !== null && clean(prospect.energySource) && validReferenceDate && ['DECLARED', 'MEASURED'].includes(prospect.energyQuality);
  if (referencedConsumption && annual === 0) {
    level = 'LOW'; ruleId = 'REPORTED_ZERO_CONSUMPTION';
    reasons.push('Consommation annuelle renseignée à zéro pour la période de référence ; besoin actuel et futur à confirmer.');
  } else if (categoryUnchanged && (['47.11D', '47.11F'].includes(code) || prospect.identification?.activityHint === 'SUPERMARKET' || code === '52.10A')) {
    level = 'HIGH'; ruleId = code === '52.10A' ? 'COLD_STORAGE_ACTIVITY' : 'FOOD_SUPERMARKET_ACTIVITY';
    reasons.push(code === '52.10A' ? 'Activité de stockage frigorifique identifiée par le code APE : usages électriques de froid possibles en journée.' : 'Activité de supermarché / hypermarché identifiée : usages de froid et demande en journée possibles.');
    references.push(ENERGY_SUGGESTION_POLICY.ademe);
    if (code === '52.10A') references.push(ENERGY_SUGGESTION_POLICY.coldStorage);
  } else {
    const activityReasons = {
      OFFICE: 'Activité de bureaux : usages en journée possibles, calendrier et fermetures à vérifier.',
      SHOP: 'Activité de commerce : usages pendant l’ouverture possibles ; équipements et volume électrique à confirmer.',
      PUBLIC: 'Équipement public : usages en journée possibles ; calendrier, vacances et fermetures à vérifier.',
      HEALTH: 'Activité de santé : usages en journée possibles ; type de site et équipements à préciser.',
      HOTEL: 'Activité d’hébergement : usages électriques possibles ; répartition jour/nuit et saisonnalité à vérifier.'
    };
    if (activityReasons[prospect.category]) {
      level = 'MEDIUM'; ruleId = `ACTIVITY_${prospect.category}`; reasons.push(activityReasons[prospect.category]);
      if (prospect.category === 'OFFICE') references.push(ENERGY_SUGGESTION_POLICY.office);
    } else reasons.push(prospect.category === 'INDUSTRY' ? 'Les procédés et horaires industriels sont trop variables pour préremplir un niveau sans qualification supplémentaire.' : 'Activité insuffisamment qualifiée pour proposer un niveau.');
  }
  if (annual !== null) {
    reasons.push(`Consommation annuelle renseignée : ${annual.toLocaleString('fr-FR')} kWh/an (${({ ESTIMATED: 'estimée', DECLARED: 'déclarée', MEASURED: 'mesurée avec référence' })[prospect.energyQuality] || 'nature à préciser'}).`);
    if (annual > 0) limitations.push('Le volume annuel seul ne permet pas de quantifier la consommation pendant la production solaire.');
  } else limitations.push('Consommation annuelle inconnue ; aucun volume n’est estimé à partir de la seule activité.');
  const scheduleLabels = { UNKNOWN: 'à confirmer', DAY: 'principalement en journée', DAY_EVENING: 'journée et soirée', CONTINUOUS: 'en continu', NIGHT: 'principalement la nuit', WEEKEND: 'surtout le week-end', VARIABLE: 'variable selon les jours' };
  const seasonalityLabels = { UNKNOWN: 'à confirmer', YEAR_ROUND: 'activité toute l’année', SCHOOL_BREAKS: 'fermeture pendant les vacances', SUMMER_CLOSURE: 'fermeture en été', WINTER_CLOSURE: 'fermeture en hiver', SEASONAL: 'activité saisonnière', VARIABLE: 'variable selon la période' };
  if (prospect.schedule && prospect.schedule !== 'UNKNOWN') reasons.push(`Présence habituelle : ${scheduleLabels[prospect.schedule] || clean(prospect.schedule)}. Cette indication ne constitue pas une courbe de charge.`);
  else limitations.push('Horaires / profil d’activité à préciser.');
  if (prospect.seasonality && prospect.seasonality !== 'UNKNOWN') reasons.push(`Saisonnalité : ${seasonalityLabels[prospect.seasonality] || clean(prospect.seasonality)}.`);
  else limitations.push('Saisonnalité et fermetures à préciser.');
  if (prospect.energySource) reasons.push(`Référence consommation : ${clean(prospect.energySource)}${prospect.energyDate ? ` · ${prospect.energyDate}` : ''}.`);
  return {
    schemaVersion: 1, policyVersion: ENERGY_SUGGESTION_POLICY.version, ruleId, inputKey, level,
    reliability: level === 'UNKNOWN' ? 'UNKNOWN' : 'ASSUMPTION', confidence: level === 'UNKNOWN' ? 'UNKNOWN' : 'LOW',
    reasons, limitations, references,
    generatedAt: previous?.policyVersion === ENERGY_SUGGESTION_POLICY.version && previous.inputKey === inputKey && Number.isFinite(Date.parse(previous.generatedAt)) ? previous.generatedAt : now()
  };
}
