/* V10 : composition en lecture seule. Appelé uniquement par l'aperçu OOI local. */
import {missionRemunerationMatches,missionPlanForRecord} from './ozeno-missions.mjs';
const families = ['Site', 'Surfaces', 'Énergie', 'Risques', 'Finance'];
const statesText = { filled: 'Renseigné', missing: 'À compléter', unknown: 'Indéterminé' };
const visibleFamilyLabels = ['Site', 'Toit', 'Énergie', 'Risques', 'Finance'];
let tooltipSequence = 0;
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
export function installV10() {
  if (document.getElementById('ooiV10Style')) return;
  document.body.classList.add('ooiV10');
  const style = el('link'); style.id = 'ooiV10Style'; style.rel = 'stylesheet'; style.href = './ooi-v10.css?v=20261114-portfolio-hydration-1'; document.head.append(style);
}
export function documentaryBand(states) {
  const band = el('div', null, 'ooiDocumentaryBand'); band.setAttribute('role', 'group'); band.setAttribute('aria-label', 'Disponibilité documentaire · cinq familles');
  const heading = el('div', null, 'ooiDocumentaryHeading');
  heading.append(el('strong', 'Qualification documentaire'));
  const legend = el('span', null, 'ooiDocumentaryHelp');
  legend.tabIndex = 0;
  legend.setAttribute('role', 'note');
  const legendText = el('span', '5 familles · États des données ⓘ', 'ooiDocumentaryHelpLabel');
  const legendDescription = 'Vert : complété (donnée renseignée) · Orange : incomplet (à compléter) · Gris : non renseigné ou indéterminé. Ces couleurs décrivent l’état des données, pas l’avancement des travaux.';
  const tooltip = el('span', legendDescription, 'ooiDocumentaryTooltip');
  tooltip.id = `ooiDocumentaryTooltip${++tooltipSequence}`;
  legend.setAttribute('aria-describedby', tooltip.id);
  legend.append(legendText, tooltip);
  heading.append(legend);
  band.append(heading);
  families.forEach((label, i) => {
    const value = statesText[states?.[i]] ? states[i] : 'unknown';
    const item = el('span', null, `ooiDocumentaryFamily is-${value}`);
    item.title = `${label} : ${statesText[value]}`; item.setAttribute('aria-label', item.title);
    item.append(el('span', visibleFamilyLabels[i], 'ooiDocumentaryFamilyName'), el('i')); band.append(item);
  });
  return band;
}
export function mountDocumentaryBand(states) {
  installV10();
  const title = document.getElementById('prestudyChapterTitle');
  if (!title) return;
  const next = documentaryBand(states); next.id = 'ooiDocumentaryBand';
  const previous = document.getElementById(next.id);
  if (previous) previous.replaceWith(next); else title.before(next);
}
// Seuls des faits explicitement enregistrés sont présentés. Aucun statut ne devient une origine.
export function portfolioMetadata(record = {}) {
  const origin = record.prospectKey || record.preview?.obiProspecting?.recordType === 'OBI_PROSPECTING_SNAPSHOT' ? 'Prospection' : 'Non renseignée';
  // createdAt est défini par createDraftStore. La RPC cloud n'expose que updatedAt.
  const date = record.scope === 'local' && typeof record.createdAt === 'string' && Number.isFinite(Date.parse(record.createdAt)) ? record.createdAt : null;
  return { origin, date, dateLabel: date ? new Date(date).toLocaleDateString('fr-FR') : 'Non disponible' };
}
export function formatPortfolio(record, nameCell, states) {
  installV10();
  const link = nameCell.querySelector('.hubProjectLink'); if (!link) return;
  const line = el('div', null, 'ooiProjectTitleLine');
  const metadata = portfolioMetadata(record);
  link.before(line); line.append(link, el('span', metadata.origin, 'ooiOriginBadge'));
  nameCell.querySelector('.ooiCompleteness')?.remove();
  nameCell.append(documentaryBand(states));
}
function unavailable(label, note) {
  const card = el('div', null, 'ooiPreviewMetric');
  card.append(el('span', label), el('strong', 'Non disponible'), el('small', note)); return card;
}
function savedMetric(record, key) {
  const preview = record?.portfolioSummary || record?.preview;
  const value = Number(preview?.portfolioMetrics?.[key]);
  if (Number.isFinite(value) && value > 0) return value;
  if (key === 'productionKwh') {
    const annual = Number(preview?.controls?.annual);
    if (Number.isFinite(annual) && annual > 0) return annual;
    if (preview?.controls?.annualManualFallbackSource === 'MANUAL_ASSUMPTION') {
      const manual = Number(preview.controls.annualManualFallbackKwh);
      if (Number.isFinite(manual) && manual > 0) return manual;
    }
  }
  return null;
}
function formatMetric(value, divisor = 1, digits = 0) {
  return value == null ? null : (value / divisor).toLocaleString('fr-FR', { maximumFractionDigits: digits });
}
export function showPortfolioPreview(record, href, states, commissionLabel) {
  installV10();
  let dialog = document.getElementById('ooiPortfolioPreview');
  if (!dialog) { dialog = el('dialog', null, 'ooiPortfolioPreview'); dialog.id = 'ooiPortfolioPreview'; document.body.append(dialog); }
  dialog.replaceChildren(); dialog.setAttribute('aria-labelledby', 'ooiPortfolioPreviewTitle');
  const head = el('div', null, 'ooiPreviewHead'), copy = el('div');
  const title = el('h2', record.name || 'Projet'); title.id = 'ooiPortfolioPreviewTitle';
  copy.append(title, el('p', record.address || 'Site à localiser'));
  const close = el('button', 'Fermer', 'hubSecondary'); close.type = 'button'; close.addEventListener('click', () => dialog.close());
  head.append(copy, close); dialog.append(head);
  const meta = portfolioMetadata(record);
  dialog.append(el('p', `${meta.origin} · Ouverture / réception : ${meta.dateLabel}`, 'ooiPreviewMeta'), documentaryBand(states));
  const facts = el('dl', null, 'ooiPreviewFacts');
  const factRows = [['Client', record.clientName], ['Installation prévue', record.installationDate]];
  const savedFees=record.preview?.missionRemuneration;
  const missionPlan=(record.missionPlan??record.preview?.missionPlan)?missionPlanForRecord(record):null;
  if(missionPlan&&missionRemunerationMatches(savedFees,missionPlan)){
    for(const [key,label] of [['leadPv','Lead PV · prestataire → OZENO'],['leadRenovation','Lead rénovation · prestataire → OZENO'],['amo','AMO ponctuelle · client → OZENO'],['acc','Gestion ACC annuelle · investisseur → OZENO']]){
      const fee=savedFees[key];if(!fee?.active)continue;
      const amount=typeof fee.amountEur==='number'&&Number.isFinite(fee.amountEur)?`${formatMetric(fee.amountEur)} € HT · estimation non facturée`:'À compléter';
      factRows.push([label,amount]);
    }
  } else if(missionPlan) factRows.push(['Rémunérations des missions','À estimer dans la pré-étude']);
  else if (commissionLabel) factRows.push(['Commission OZENO potentielle', commissionLabel]);
  factRows.forEach(([label, value]) => {
    const row = el('div'); row.append(el('dt', label), el('dd', value || 'Non renseigné')); facts.append(row);
  }); dialog.append(facts);
  const grid = el('div', null, 'ooiPreviewGrid');
  const productionKwh = savedMetric(record, 'productionKwh');
  const powerKwp = savedMetric(record, 'powerKwp');
  const capexEur = savedMetric(record, 'capexEur');
  const energyCard = el('div', null, 'ooiPreviewMetric');
  energyCard.append(el('span', 'Production et puissance'), el('strong', productionKwh == null ? 'Non disponible' : `${formatMetric(productionKwh, 1000, 1)} MWh/an`), el('small', `${powerKwp == null ? 'Puissance à dimensionner' : `${formatMetric(powerKwp, 1, 1)} kWc`} · estimation indicative enregistrée`));
  const financeCard = el('div', null, 'ooiPreviewMetric');
  financeCard.append(el('span', 'Investissement estimé'), el('strong', capexEur == null ? 'Non disponible' : `${formatMetric(capexEur)} €`), el('small', 'CAPEX indicatif enregistré · à confirmer par devis'));
  grid.append(energyCard, financeCard);
  dialog.append(grid);
  const foot = el('div', null, 'ooiPreviewFoot'), open = el('a', 'Ouvrir le dossier', 'hubPrimary'); open.href = href;
  foot.append(el('small', 'Aperçu en lecture seule · aucune donnée recalculée'), open); dialog.append(foot);
  dialog.showModal();
}
export function portfolioPresentation({ pipelineRecords = {}, accRecords = [] } = {}) {
  installV10();
  const number = (value, maximumFractionDigits = 1) => Number(value).toLocaleString('fr-FR', { maximumFractionDigits });
  const groups = [
    pipelineRecords.VALIDATED || [],
    pipelineRecords.IN_PROGRESS || [],
    pipelineRecords.PENDING || [],
    accRecords
  ];
  document.querySelectorAll('.hubStatCard').forEach((card, index) => {
    const records = groups[index] || [];
    const metrics = [
      ['CAPEX', 'capexEur', ' €', 0],
      ['Production annuelle', 'productionKwh', ' MWh/an', 1],
      ['Puissance', 'powerKwp', ' kWc', 1]
    ];
    const secondary = el('dl', null, 'ooiStatSecondary');
    metrics.forEach(([label, key, unit, digits]) => {
      const values = records.map(record => {
        const saved = savedMetric(record, key);
        if (saved != null) return saved;
        return null;
      }).filter(value => value != null);
      const value = values.length
        ? `${number(values.reduce((sum, entry) => sum + entry, 0) / (key === 'productionKwh' ? 1000 : 1), digits)}${unit}`
        : '—';
      const row = el('div'); row.append(el('dt', label), el('dd', value));
      if (values.length && values.length < records.length) row.title = `Valeurs enregistrées pour ${values.length} dossier(s) sur ${records.length} dans cette catégorie.`;
      secondary.append(row);
    });
    secondary.setAttribute('aria-label', 'Sommes des valeurs explicitement enregistrées dans les dossiers de cette catégorie');
    const previous = card.querySelector('.ooiStatSecondary');
    if (previous) previous.replaceWith(secondary); else card.append(secondary);
  });
  const headers = document.querySelectorAll('.hubProjects thead th');
  // The eighth cell contains the opening/reception date; the ninth contains
  // row actions. Keep those labels aligned with their actual columns.
  if (headers.length > 7) headers[7].textContent = 'Ouverture / réception';
  if (headers.length > 8) headers[8].textContent = 'Actions';
}
export function composePrestudyV10(model) {
  installV10();
  const summary = document.getElementById('ozeno-summary');
  const oldDisclosure = summary?.querySelector(':scope > .ooiComplementaryResults');
  if (oldDisclosure) {
    oldDisclosure.querySelector(':scope > summary')?.remove();
    oldDisclosure.replaceWith(...oldDisclosure.childNodes);
  }
  if (summary && model) {
    // Reprendre la hiérarchie de la maquette sans importer ses valeurs fictives
    // ni ses commandes de démonstration.
    let hero = summary.querySelector(':scope > .ooiSummaryHero');
    if (!hero) {
      hero = el('section', null, 'ooiSummaryHero');
      hero.setAttribute('aria-label', 'Synthèse décisionnelle');
      const first = summary.querySelector(':scope > .eyebrow, :scope > h2, :scope > .previewNotice');
      if (first) first.before(hero); else summary.prepend(hero);
    }
    const eyebrow = summary.querySelector(':scope > .eyebrow');
    const title = summary.querySelector(':scope > h2');
    const notice = summary.querySelector(':scope > .previewNotice');
    if (eyebrow) hero.append(eyebrow);
    if (title) {
      title.textContent = 'Synthèse décisionnelle';
      hero.append(title);
    }
    let description = hero.querySelector('.ooiSummaryHeroDescription');
    if (!description) description = el('p', 'Potentiel énergétique, performance financière et contraintes — puis détail des rubriques existantes.', 'ooiSummaryHeroDescription');
    hero.append(description);
    if (notice) hero.append(notice);

    let overview = document.getElementById('ooiComplementaryOverview');
    if (!overview) { overview = el('section', null, 'ooiComplementaryOverview'); overview.id = 'ooiComplementaryOverview'; }
    const firstLegacySection = summary.querySelector('#prestudySummaryEnergyHeading, .decisionGrid');
    if (firstLegacySection && overview.nextElementSibling !== firstLegacySection) firstLegacySection.before(overview);
    const heading = el('h3', 'Hypothèses et résultats complémentaires');
    const tiles = el('div', null, 'ooiOverviewGrid');
    const fmt = (v, unit) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${unit}`;
    const read = id => { const value = document.getElementById(id)?.textContent?.trim(); return value && !/^[—–-]$/.test(value) ? value : 'Non disponible'; };
    const entries = [
      ['Production et configuration', model.energy.annualKwh == null ? 'Non disponible' : fmt(model.energy.annualKwh / 1000, 'MWh/an'), model.energy.capacityKwp == null ? 'Puissance à dimensionner' : fmt(model.energy.capacityKwp, 'kWc'), 'Aperçu PVGIS · non canonique', '#prestudy-summary-energy'],
      ['Valorisation énergétique', model.energy.annualSimulationText ? 'Simulation annuelle' : 'Non établie', 'ACI / ACC · hypothèses indicatives', 'Matching temporel non établi', '#prestudy-summary-revenue'],
      ['Économie · année 1', model.finance.ready ? read('dashRevenueTotal') : 'Non disponible', 'Économies ACI et recettes : voir ventilation', 'Montants issus de la synthèse existante', '#prestudy-summary-revenue'],
      ['Investissement et rentabilité', model.finance.projectIrrPct == null ? 'Non disponible' : fmt(model.finance.projectIrrPct, '%'), model.finance.capexEur == null ? 'CAPEX non disponible' : `CAPEX ${fmt(model.finance.capexEur, '€')}`, 'TRI Projet · aucun seuil universel', '#prestudy-summary-finance'],
      ['Impact carbone solaire', model.carbonImpact?.available ? fmt(model.carbonImpact.tonnes, 'tCO₂e/an') : 'À calculer', model.carbonImpact?.available ? 'Émissions directes moyennes du réseau évitées · estimation' : 'Calcul carbone solaire indisponible pour cet aperçu', model.carbonImpact?.factor ? `${model.carbonImpact.factor.source} ${model.carbonImpact.factor.reference_year} · ${model.carbonImpact.factor.value} gCO₂e/kWh · non ACV` : 'Les résultats efficacité énergétique et CEE sont évalués séparément', '#prestudy-summary-energy'],
      ['Qualification et restitution', model.constraints?.length ? `${model.constraints.length} constat(s)` : 'Non évaluée', 'Risques, pièces et décision', 'Registre vide ≠ absence de risque', '#prestudy-summary-decision']
    ];
    for (const [label,value,secondary,source,href] of entries) {
      const tile = el('a', null, 'ooiOverviewTile'); tile.href=href;
      tile.append(el('span',label),el('strong',value),el('small',secondary),el('small',source)); tiles.append(tile);
    }
    overview.replaceChildren(heading, tiles);
  }
  // Déplacer les nœuds existants conserve leurs champs, IDs et écouteurs.
  const target = document.getElementById('audit-roof');
  const documents = document.getElementById('roofInstallerStudyTitle')?.closest('.roofInstallerStudy');
  if (target && documents) {
    if (!documents.id) documents.id = 'ooiInstallerDocuments';
    if (!target.contains(documents)) target.append(documents);
    let partners = document.getElementById('ooiPartnersSlot');
    if (!partners) { partners = el('section', null, 'ooiPartnersSlot'); partners.id = 'ooiPartnersSlot'; partners.setAttribute('aria-label', 'Partenaires et dossier installateur'); documents.before(partners); }
    if (partners.nextElementSibling !== documents) documents.before(partners);
    const information = document.getElementById('prestudyInstallerInfoSection');
    if (information && !partners.contains(information)) partners.prepend(information);
    const suggestions = document.querySelector('[data-installer-prestudy]');
    if (suggestions && !partners.contains(suggestions)) partners.append(suggestions);
    if (information && suggestions && partners.contains(information) && partners.contains(suggestions)) partners.insertBefore(information, suggestions);
    const advancedTitle = document.getElementById('prestudySurfaceAdvancedTitle'); if (advancedTitle) advancedTitle.textContent = 'Paramètres avancés PVGIS';
  }
}
