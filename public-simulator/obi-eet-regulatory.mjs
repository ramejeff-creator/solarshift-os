// Local editorial content only. No eligibility rule, data request or persistence.
export const EET_CONTENT_VERSION = 'EET-PROSPECTING-2026-11-02-v1';
export const EET_REVIEWED_AT = '2026-11-02';
export const EET_SOURCES = Object.freeze([
  Object.freeze({ label: 'CCH · R.174-22 — champ d’application', url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000043819501', version: 'En vigueur depuis le 01/07/2021' }),
  Object.freeze({ label: 'CCH · L.174-1 — objectifs et responsabilités', url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000043977483', version: 'En vigueur depuis le 25/08/2021' }),
  Object.freeze({ label: 'CCH · R.174-27 — déclaration des données', url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044133897', version: 'En vigueur depuis le 01/10/2021' }),
  Object.freeze({ label: 'Ministère · Éco Énergie Tertiaire', url: 'https://www.ecologie.gouv.fr/politiques-publiques/eco-energie-tertiaire-eet', version: 'Mise à jour du 09/09/2025' }),
  Object.freeze({ label: 'Service Public · obligations et calendrier', url: 'https://entreprendre.service-public.gouv.fr/vosdroits/F38065', version: 'Vérifié le 09/09/2025' })
]);

const make = (tag, text = '', className = '') => {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
};

// This is a display projection of already available clues, never an EET conclusion.
// Footprint values are deliberately not used, even when above the regulatory threshold.
export function eetProspectingContext(model, reference) {
  const observation = model.publicObservations?.building;
  const matched = observation?.building;
  const group = observation
    ? matched && { id: matched.batiment_groupe_id, usage: matched.usage_principal_bdnb_open }
    : reference?.bdnbGroup && { id: reference.bdnbGroup.id, usage: reference.bdnbGroup.usagePrincipal };
  const tertiaryClue = group?.usage === 'Tertiaire';
  return {
    applicability: 'UNKNOWN',
    activity: 'UNKNOWN',
    scope: 'UNKNOWN',
    tertiaryFloorAreaM2: null,
    evidenceLevel: tertiaryClue ? 'Indice public de groupe' : 'Données insuffisantes',
    evidence: group
      ? `Usage BDNB « ${group.usage || 'non renseigné'} » au groupe. Surface de plancher tertiaire : inconnue.`
      : 'Activité et surface de plancher tertiaire non établies pour les locaux sélectionnés.',
    clue: group
      ? `BDNB : usage « ${group.usage || 'non renseigné'} » pour le groupe ${group.id || 'non identifié'}. L’activité des locaux sélectionnés reste à confirmer.`
      : 'Les rapprochements cartographiques disponibles ne documentent pas l’activité réelle des locaux.',
    next: 'Confirmer l’activité et les locaux concernés, puis obtenir leur surface de plancher cumulée.',
    provenance: observation
      ? `${observation.name || 'BDNB Open'} · ${observation.retrievedAt || 'date non renseignée'} · rapprochement à confirmer${observation.error ? ' · ' + observation.error : ''}`
      : 'Référence locale consignée le 27/10/2026 · non actualisée par ce volet.'
  };
}

const styles = `
.hubValidatedFiche .eetRegulatory { padding:0; overflow:hidden; }
.hubValidatedFiche .eetRegulatory > summary { display:flex; align-items:center; flex-wrap:wrap; gap:8px 18px; padding:18px 20px; cursor:pointer; list-style:none; color:#123f3b; }
.hubValidatedFiche .eetRegulatory > summary::-webkit-details-marker { display:none; }
.hubValidatedFiche .eetRegulatory > summary::before { content:'+'; display:grid; place-items:center; width:28px; height:28px; border:1px solid #d3ded8; border-radius:8px; font-size:20px; font-weight:400; }
.hubValidatedFiche .eetRegulatory[open] > summary::before { content:'−'; }
.hubValidatedFiche .eetRegulatoryTitle { font-size:17px; font-weight:750; }
.hubValidatedFiche .eetRegulatoryHint { margin-left:auto; color:#647b73; font-size:12px; font-weight:400; }
.hubValidatedFiche .eetRegulatoryBody { padding:0 20px 20px; }
.hubValidatedFiche .eetSiteContext { padding:14px 16px; border:1px solid #dbe3df; background:#f5f8f6; border-radius:10px; margin-bottom:20px; }
.hubValidatedFiche .eetSiteHeading { display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:space-between; }
.hubValidatedFiche .eetSiteContext h4 { font-size:14px; margin:0; }
.hubValidatedFiche .eetSiteContext p { font-size:12px; margin:8px 0 0; line-height:1.55; }
.hubValidatedFiche .eetScopeFacts { display:flex; flex-wrap:wrap; gap:6px 18px; padding:0; margin:10px 0; list-style:none; font-size:12px; color:#506a60; }
.hubValidatedFiche .eetGeneralGrid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:20px; }
.hubValidatedFiche .eetGeneralGrid h4 { margin:0 0 9px; font-size:14px; }
.hubValidatedFiche .eetGeneralGrid p,.hubValidatedFiche .eetGeneralGrid li { font-size:13px; line-height:1.55; }
.hubValidatedFiche .eetGeneralGrid p { margin:8px 0; }
.hubValidatedFiche .eetGeneralGrid ul { padding-left:18px; margin:8px 0; }
.hubValidatedFiche .eetGeneralGrid li { margin:5px 0; }
.hubValidatedFiche .eetMilestones { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; padding:0; margin:12px 0; list-style:none; }
.hubValidatedFiche .eetMilestones li { display:flex; flex-direction:column; gap:2px; padding:10px; margin:0; border:1px solid #dbe3df; border-radius:9px; background:#fafcfb; }
.hubValidatedFiche .eetMilestones span { font-size:12px; color:#647b73; }
.hubValidatedFiche .eetMilestones strong { font-size:21px; color:#184d42; }
.hubValidatedFiche .eetQuestions { margin-top:20px; padding-top:18px; border-top:1px solid #dbe3df; scroll-margin-top:170px; }
.hubValidatedFiche .eetQuestions h4 { margin:0 0 6px; font-size:15px; }
.hubValidatedFiche .eetQuestions > p { margin:0 0 12px; font-size:12px; color:#647b73; }
.hubValidatedFiche .eetQuestionList { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; list-style:none; padding:0; margin:0; counter-reset:eet-question; }
.hubValidatedFiche .eetQuestionList li { border:1px solid #dbe3df; border-radius:10px; padding:14px; counter-increment:eet-question; }
.hubValidatedFiche .eetQuestionList li::before { content:'0' counter(eet-question); color:#a66b00; font-size:11px; font-weight:750; }
.hubValidatedFiche .eetQuestionList h5 { font-size:13px; line-height:1.5; margin:6px 0; }
.hubValidatedFiche .eetQuestionList p { font-size:12px; color:#647b73; line-height:1.5; margin:0; }
.hubValidatedFiche .eetSources { margin-top:16px; font-size:11px; }
.hubValidatedFiche .eetSources ul { padding-left:18px; }
.hubValidatedFiche .eetSources li { margin:6px 0; font-size:11px; overflow-wrap:anywhere; }
.hubValidatedFiche .eetSources a { color:#195f52; }
.hubValidatedFiche .eetSiteState { font-size:11px; color:#5e706a; margin:8px 0; }
.hubValidatedFiche .eetCardOpen { display:block; margin-top:10px; padding:0; border:0; background:transparent; color:#176453; text-decoration:underline; cursor:pointer; text-align:left; min-height:36px; }
.hubValidatedFiche .eetOrientation { display:flex; align-items:center; flex-wrap:wrap; gap:10px 16px; padding:12px 0 18px; }
.hubValidatedFiche .eetOrientation span { font-size:12px; color:#647b73; }
.hubValidatedFiche .eetRegulatory summary:focus-visible,.hubValidatedFiche .eetQuestions h4:focus,.hubValidatedFiche .eetCardOpen:focus-visible { outline:2px solid #176453; outline-offset:4px; border-radius:4px; }
@container (max-width:620px) {
 .hubValidatedFiche .eetGeneralGrid,.hubValidatedFiche .eetQuestionList { grid-template-columns:minmax(0,1fr); }
 .hubValidatedFiche .eetRegulatory > summary { padding:16px; gap:8px; }
 .hubValidatedFiche .eetRegulatoryHint { width:100%; margin-left:36px; }
 .hubValidatedFiche .eetRegulatoryBody { padding:0 16px 16px; }
 .hubValidatedFiche .eetOrientation button { width:100%; }
}
`;

export function mountEetRegulatory({ content, signals, actions, model, reference }) {
  const style = make('style'); style.textContent = styles; content.append(style);
  const volet = make('details', '', 'panel eetRegulatory');
  volet.dataset.eetContentVersion = EET_CONTENT_VERSION;
  const summary = make('summary');
  summary.append(make('span', 'Obligations réglementaires', 'eetRegulatoryTitle'), make('span', 'Éco Énergie Tertiaire · règles générales', 'eetRegulatoryHint'));
  const body = make('div', '', 'eetRegulatoryBody');
  const context = make('section', '', 'eetSiteContext');
  const contextHeading = make('div', '', 'eetSiteHeading');
  contextHeading.append(make('h4', 'Pour le site sélectionné'), make('span', 'Assujettissement à vérifier', 'badge unknown'));
  const clue = make('p');
  const facts = make('ul', '', 'eetScopeFacts');
  for (const text of ['Activité réelle : inconnue', 'Périmètre : inconnu', 'Surface de plancher tertiaire : inconnue']) facts.append(make('li', text));
  context.append(contextHeading, clue, facts, make('p', 'Les emprises OSM et BDNB ne sont pas des surfaces de plancher tertiaire. Elles ne permettent pas d’appliquer le seuil réglementaire.'));

  const general = make('div', '', 'eetGeneralGrid');
  const scope = make('section'); scope.append(make('h4', 'Règles générales · qui peut être concerné ?'));
  scope.append(make('p', 'Le seuil de 1 000 m² porte sur la surface de plancher du périmètre tertiaire. Propriétaires et, selon les cas, preneurs à bail sont concernés.'));
  const scopes = make('ul');
  for (const text of [
    'Bâtiment exclusivement tertiaire, avec prise en compte des activités non tertiaires accessoires.',
    'Parties tertiaires d’un bâtiment mixte : surfaces cumulées.',
    'Ensemble de bâtiments sur une même unité foncière ou un même site : surfaces tertiaires cumulées.'
  ]) scopes.append(make('li', text));
  scope.append(scopes, make('p', 'À examiner aussi : permis précaire, culte, activités opérationnelles de défense, sécurité civile ou sûreté intérieure. Une baisse de surface sous le seuil après cessation partielle d’activité ne met pas nécessairement fin à une obligation existante.', 'proof-line'));

  const obligations = make('section'); obligations.append(make('h4', 'Si le périmètre est assujetti · OPERAT'));
  obligations.append(make('p', 'Déclarer les activités, les surfaces et les consommations annuelles par énergie, ainsi que les références et modulations pertinentes. Propriétaire et preneur à bail coordonnent leurs responsabilités.'));
  obligations.append(make('p', 'La déclaration annuelle porte sur l’année précédente, normalement au plus tard le 30 septembre. OPERAT fournit une attestation annuelle ; aucune déclaration ni attestation du site n’est vérifiée ici.'));
  const milestones = make('ul', '', 'eetMilestones');
  for (const [year, reduction] of [['2030', '−40 %'], ['2040', '−50 %'], ['2050', '−60 %']]) {
    const milestone = make('li'); milestone.append(make('span', year), make('strong', reduction)); milestones.append(milestone);
  }
  obligations.append(milestones, make('p', 'Deux voies : réduction relative par rapport à une consommation de référence non antérieure à 2010, ou valeur absolue réglementaire selon l’activité. Modulations et conditions à instruire. Ces repères ne sont pas des objectifs calculés pour le site.', 'proof-line'));
  general.append(scope, obligations);

  const questions = make('section', '', 'eetQuestions');
  const questionTitle = make('h4', 'Préparer la vérification · trois questions'); questionTitle.tabIndex = -1;
  questions.append(questionTitle, make('p', 'Support d’échange en lecture seule. Aucune réponse n’est saisie ou enregistrée dans cette fiche.'));
  const questionList = make('ol', '', 'eetQuestionList');
  for (const [title, hint] of [
    ['Quelles activités tertiaires sont réellement exercées ?', 'Confirmer l’exploitant, les usages et les locaux concernés. Un usage BDNB au groupe reste un indice.'],
    ['Quels locaux et quelle surface de plancher cumuler ?', 'Vérifier les plans, les parties mixtes et les autres bâtiments du même site ou de la même unité foncière.'],
    ['Qui peut confirmer le périmètre et la situation OPERAT ?', 'Identifier le propriétaire ou preneur compétent ; examiner les justificatifs, exceptions et l’historique éventuel.']
  ]) { const item = make('li'); item.append(make('h5', title), make('p', hint)); questionList.append(item); }
  questions.append(questionList);

  const sources = make('details', '', 'eetSources');
  sources.append(make('summary', 'Sources officielles et version du contenu'));
  const sourceList = make('ul');
  for (const source of EET_SOURCES) {
    const item = make('li'); const link = make('a', source.label); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    item.append(link, document.createTextNode(' · ' + source.version)); sourceList.append(item);
  }
  const provenance = make('p', '', 'proof-line');
  sources.append(sourceList, make('p', `Contenu local ${EET_CONTENT_VERSION} · sources consultées le 02/11/2026. Mise à jour manuelle ; ces textes ne documentent pas l’assujettissement du site.`, 'proof-line'), provenance);
  body.append(context, general, questions, sources); volet.append(summary, body); signals.after(volet);

  function openQuestions() {
    volet.open = true;
    questionTitle.focus({ preventScroll: true });
    questions.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  const orientation = make('div', '', 'eetOrientation');
  const orientationButton = make('button', 'Vérifier l’assujettissement EET', 'btn'); orientationButton.type = 'button'; orientationButton.onclick = openQuestions;
  orientation.append(orientationButton, make('span', 'Préparer les vérifications avec un interlocuteur compétent.'));
  actions.querySelector('.final-action-grid').before(orientation);

  function update() {
    const view = eetProspectingContext(model, reference);
    volet.dataset.applicability = view.applicability;
    clue.textContent = view.clue;
    provenance.textContent = view.provenance + ' État d’assujettissement : UNKNOWN. Revue humaine nécessaire.';
    const eetCard = signals.querySelectorAll('.trigger-card')[1];
    eetCard.querySelector('.trigger-badges .badge').textContent = view.evidenceLevel;
    eetCard.querySelector('.criterion-copy > strong').textContent = 'Indice disponible';
    eetCard.querySelector('.criterion-copy > span').textContent = view.evidence;
    const next = eetCard.querySelector('.trigger-next');
    const state = make('p', 'Assujettissement : à vérifier', 'eetSiteState'); state.dataset.eetApplicability = view.applicability;
    const open = make('button', 'Voir les obligations EET', 'eetCardOpen'); open.type = 'button';
    open.onclick = () => { volet.open = true; summary.focus({ preventScroll: true }); volet.scrollIntoView({ block: 'start', behavior: 'instant' }); };
    next.replaceChildren(state, make('strong', 'Prochaine vérification : '), document.createTextNode(view.next), open);
    eetCard.querySelector('.details-body').append(make('p', 'Assujettissement : UNKNOWN · activité, périmètre et surface de plancher non établis. Les trois questions préparent une revue humaine.', 'proof-line'));
  }
  update();
  return { update };
}
