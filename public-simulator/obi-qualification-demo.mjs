// Synthetic scenarios only. No identity, free text, networking or persistence.
export const DEMO_STAGES = ['Repérage non qualifié', 'Contact à qualifier', 'Opportunité', 'Projet à étudier'];
export const DEMO_SCENARIOS = Object.freeze([
  { id: 'activity', name: 'Activité tertiaire déclarée, surfaces inconnues', quality: 'Déclaré, à confirmer', description: 'Un gestionnaire fictif décrit des bureaux sur le site Alpha. Il souhaite seulement vérifier les informations.', gates: [true, false, false] },
  { id: 'tenant', name: 'Locataire intéressé, bailleur absent', quality: 'Déclaré, à confirmer', description: 'Un locataire fictif exprime un intérêt PV pour le bâtiment A; le bailleur doit encore autoriser une étude de toiture.', gates: [true, true, false] },
  { id: 'pv', name: 'Propriétaire : premier examen photovoltaïque', quality: 'Potentiel à vérifier', description: 'Un propriétaire fictif souhaite un premier examen PV. Cet intérêt ne constitue pas encore un mandat pour une étude définie.', gates: [true, true, false] },
  { id: 'renovation', name: 'Intérêt rénovation sans audit', quality: 'Déclaré, à confirmer', description: 'Un exploitant fictif souhaite examiner le chauffage des bureaux A. Aucun audit ni donnée énergétique ne sont fournis.', gates: [true, true, false] },
  { id: 'conflict', name: 'Activités et bâtiments contradictoires', quality: 'Informations contradictoires', description: 'Assertion A : bureaux dans le bâtiment A, source fictive du 01/10/2026. Assertion B : stockage industriel dans le bâtiment B, déclaration fictive du 27/10/2026. Les périmètres diffèrent; conserver les deux assertions avant clarification.', gates: [true, false, false] },
  { id: 'callback', name: 'Accord pour rappel uniquement', quality: 'Indice public', description: 'Un interlocuteur fictif accepte un rappel mais n’exprime aucun intérêt concret pour une étude ou un projet.', gates: [true, false, false] },
  { id: 'global', name: 'Accord explicite pour une étude globale', quality: 'Documenté', description: 'Pièce fictive : plan du site Alpha, bâtiment A, version 1 du 27/10/2026, non revue. Une personne habilitée fictive accepte une étude énergétique globale sur ce périmètre. Le spécialiste fictif et la liste de données à obtenir sont identifiés. La pièce n’est ni certifiée ni conforme par ce seul libellé.', gates: [true, true, true] },
  { id: 'unavailable', name: 'Source indisponible / lien bâtiment ambigu', quality: 'Données insuffisantes', description: 'Aucun interlocuteur ou périmètre fiable n’est identifié dans ce scénario. L’absence de preuve ne signifie pas absence de potentiel.', gates: [false, false, false] }
]);

export function demoGate(scenarioId, stage) {
  const scenario = DEMO_SCENARIOS.find(item => item.id === scenarioId);
  if (!scenario || !Number.isInteger(stage) || stage < 0 || stage >= 3) return { allowed: false, reason: 'Choisir un scénario ou revenir à une étape antérieure.' };
  const reasons = [
    'Candidat, organisme et rôle fonctionnel fictifs identifiés; motif prudent et décision de contact simulée.',
    'Intérêt concret exprimé, rôle pertinent, sujet et périmètre minimal fictifs compris.',
    'Accord explicite pour une étude définie, parties habilitées, spécialiste fictif et données à obtenir identifiés.'
  ];
  return scenario.gates[stage]
    ? { allowed: true, reason: reasons[stage] }
    : { allowed: false, reason: stage === 0 ? 'Interlocuteur ou périmètre non établi : rester au repérage.' : stage === 1 ? 'Intérêt concret ou périmètre non établi : un rappel, un indice ou une activité déclarée ne suffisent pas.' : 'Accord pour une étude définie ou autorité/parties/données nécessaires non établis.' };
}

const questions = [
  ['Quelle activité est exercée sur ce site ?', 'Bureaux fictifs — à confirmer'],
  ['Êtes-vous propriétaire, locataire ou gestionnaire, et qui décide des travaux ?', 'Rôle fictif du scénario — pouvoir à vérifier'],
  ['De quels bâtiments ou locaux parlez-vous, et connaissez-vous leur surface d’activité ?', 'Bâtiment A fictif — surface inconnue'],
  ['Disposez-vous de factures, d’un relevé de consommation, d’un audit ou d’une attestation OPERAT ?', 'Disponibilité annoncée fictive — aucune pièce reçue'],
  ['Avez-vous un projet ou une difficulté connue : toiture, chauffage, isolation, pilotage ou facture d’énergie ?', 'Intérêt fictif décrit par le scénario — aucun diagnostic']
];
const node = (tag, text = '') => { const element = document.createElement(tag); element.textContent = text; return element; };
const button = (text, action) => { const element = node('button', text); element.type = 'button'; element.className = 'hubSecondary'; element.onclick = action; return element; };
const labelSelect = (labelText, values) => {
  const label = node('label', labelText), select = node('select');
  select.dataset.suppressProjectDirty = 'true';
  values.forEach(([value, text]) => { const option = node('option', text); option.value = value; select.append(option); });
  label.append(select); return {label,select};
};

export function mountQualificationDemo(host) {
  const section = node('section'); section.className = 'hubC4Demo';
  section.append(node('h3', 'Préparer la qualification — démonstration'));
  const banner = node('p', 'Scénario de démonstration — ne correspond pas à un constat terrain. Démonstration — aucune donnée enregistrée. Les réponses ne qualifient pas l’emprise sélectionnée.'); banner.className = 'hubC4Banner'; section.append(banner);
  const scenarioPicker = labelSelect('Scénario fictif', [['', 'Choisir un scénario'], ...DEMO_SCENARIOS.map(item => [item.id, item.name])]);
  const content = node('div'); section.append(scenarioPicker.label, content);
  // View state stays in this mount only; changing candidate/mode destroys it.
  let question = 0, answers = [], stage = 0, history = [];
  const reset = () => { question = 0; answers = []; stage = 0; history = []; };
  scenarioPicker.select.onchange = () => { reset(); render(); };
  section.addEventListener('input', event => event.stopPropagation());
  section.addEventListener('change', event => event.stopPropagation());
  function render() {
    content.replaceChildren();
    const scenario = DEMO_SCENARIOS.find(item => item.id === scenarioPicker.select.value);
    if (!scenario) { content.append(node('p', 'Choisissez un cas fictif pour parcourir les questions et les étapes.')); return; }
    const badge = node('span', scenario.quality); badge.className = 'hubC4Badge';
    content.append(badge, node('p', scenario.description));
    const interview = node('section'); interview.className = 'hubC4Interview';
    interview.append(node('h4', `Entretien facultatif · question ${question + 1}/5`));
    const answer = labelSelect(questions[question][0], [['', 'Sans réponse'], ['yes', 'Oui'], ['no', 'Non'], ['unknown', 'Je ne sais pas'], ['skip', 'Passer'], ['scenario', questions[question][1]]]);
    answer.select.value = answers[question] || '';
    answer.select.onchange = () => { answers[question] = answer.select.value; };
    const actions = node('div'); actions.className = 'hubC4Actions';
    const previous = button('Question précédente', () => { question--; render(); }); previous.disabled = question === 0;
    const next = button(question === 4 ? 'Revenir à la première question' : 'Question suivante / passer', () => { question = (question + 1) % 5; render(); });
    actions.append(previous,next); interview.append(answer.label, node('p', 'Toutes les réponses sont facultatives, synthétiques et déclarées, à confirmer. Elles ne changent ni les sources publiques ni l’étape commerciale.'), actions);
    const pipeline = node('section'); pipeline.className = 'hubC4Pipeline';
    pipeline.append(node('h4', 'Parcours commercial simulé'));
    const steps = node('ol'); steps.className = 'hubC4Stages';
    DEMO_STAGES.forEach((text,index) => { const li = node('li',text); if (index === stage) li.setAttribute('aria-current','step'); steps.append(li); });
    const current = node('p', `Étape simulée : ${DEMO_STAGES[stage]}`); current.setAttribute('role','status');
    const gate = demoGate(scenario.id,stage);
    pipeline.append(steps,current,node('p',gate.reason));
    const motive = labelSelect('Motif fictif de transition', [['','Choisir un motif'], ['forward',gate.reason], ['back','Information fictive à clarifier : retour à l’étape précédente']]);
    const confirmation = node('label','Je confirme cette décision humaine fictive.');
    const check = node('input'); check.type = 'checkbox'; check.dataset.suppressProjectDirty = 'true'; confirmation.prepend(check);
    const progress = button('Confirmer la progression simulée', () => { if (!gate.allowed || motive.select.value !== 'forward' || !check.checked) return; history.push(`${DEMO_STAGES[stage]} → ${DEMO_STAGES[stage+1]} : ${gate.reason}`); stage++; render(); });
    const regress = button('Confirmer le retour d’étape simulé', () => { if (!stage || motive.select.value !== 'back' || !check.checked) return; history.push(`${DEMO_STAGES[stage]} → ${DEMO_STAGES[stage-1]} : information fictive à clarifier`); stage--; render(); });
    const update = () => { progress.disabled = !gate.allowed || motive.select.value !== 'forward' || !check.checked; regress.disabled = !stage || motive.select.value !== 'back' || !check.checked; };
    motive.select.onchange = update; check.onchange = update; update();
    const transitions = node('div'); transitions.className = 'hubC4Actions'; transitions.append(progress,regress);
    pipeline.append(motive.label,confirmation,transitions);
    const reasonLog = node('ul'); reasonLog.setAttribute('aria-label','Raisons des transitions fictives de cette vue'); history.forEach(text => reasonLog.append(node('li',text))); pipeline.append(reasonLog);
    content.append(interview,pipeline,button('Réinitialiser la démonstration',()=>{reset();scenarioPicker.select.value='';render();}));
  }
  render(); host.append(section);
}
