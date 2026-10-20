(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const make = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
  let riskEditor, revealRisk;

  function section(root, id, label, nodes) {
    const host = make('section', null, 'prestudyDSection'); host.id = id;
    const heading = make('h2', label, 'prestudyDHeading'); heading.id = `${id}-title`;
    host.setAttribute('aria-labelledby', heading.id);
    const panel = make('div', null, 'prestudyDPanel');
    nodes.filter(Boolean).forEach((n) => panel.append(n)); host.append(heading, panel); root.append(host);
    return { host, panel };
  }
  function headingBefore(target, id, text) {
    const h = make('h2', text, 'prestudyDHeading'); h.id = id; target.before(h); return h;
  }
  function presentationHeadingBefore(target, id, text) {
    if (!target || $(id)) return $(id);
    const h = make('h3', text, 'prestudyEHeading'); h.id = id; target.before(h); return h;
  }
  function prepareProject() {
    const root = $('audit-project'), identity = $('ozenoProjectIdentity'), location = root.querySelector('.newProject');
    const provenance = root.querySelector('.siteLocationInfo');
    const locationTitle = location?.querySelector(':scope > b');
    if (locationTitle?.textContent.trim() === 'Localisation') locationTitle.classList.add('prestudySrOnly');
    if (identity) identity.open = true;
    // Le bandeau du shell et le menu Projets conservent les actions de sauvegarde/création.
    // Ce bouton historique ouvre la même boîte de sauvegarde et ferait doublon dans le chapitre.
    const duplicateSave = $('newProject');
    if (duplicateSave) duplicateSave.hidden = true;
    if (identity && !identity.querySelector('.prestudyIdentityActions')) {
      const actions = make('div', null, 'prestudyIdentityActions');
      actions.append(make('p', 'Cette fiche est un résumé en lecture seule. Les coordonnées client restent modifiables dans la boîte « Enregistrer le projet ».', 'fine'));
      const edit = make('button', 'Modifier la fiche projet', 'secondary');
      edit.type = 'button';
      edit.addEventListener('click', () => document.querySelector('.prestudySave')?.click());
      actions.append(edit);
      identity.append(actions);
    }
    section(root, 'prestudyProjectIdentityGroup', 'Fiche projet', [identity]);
    section(root, 'prestudyProjectLocationGroup', 'Localisation', [location]);
    const config = window.SOLARSHIFT_CONFIG = window.SOLARSHIFT_CONFIG || {};
    config.parcelQualificationReady = import('./parcel-qualification-ui.mjs').then(module => module.mountParcelQualification($('prestudyProjectLocationGroup').querySelector('.prestudyDPanel')));
    const provenanceSection = section(root, 'prestudyProjectProvenanceGroup', 'Origine des données', [provenance]);
    provenanceSection.panel.append(make('p', 'Les sources sont précisées au niveau des champs et résultats concernés ; aucun récapitulatif séparé de provenance n’est disponible dans cette fiche.', 'prestudyProvenanceEmpty'));
  }
  function prepareSurfaces() {
    const root = $('audit-roof'); root.querySelector(':scope > h2')?.classList.add('prestudySrOnly');
    const nature = $('earlySolarProjectType');
    if (nature) { const h = nature.querySelector('h2'); if (h) { h.id = 'prestudySurfaceKindTitle'; h.classList.add('prestudyDHeading'); nature.before(h); } nature.classList.add('prestudyDPanel'); }
    headingBefore($('map'), 'prestudySurfaceMapTitle', 'Carte et tracé');
    headingBefore($('roofSurfaceGeneral'), 'prestudySurfaceAreasTitle', 'Zones et surfaces');
    $('roofSurfaceGeneral').classList.add('prestudyDPanel');
    const qualification = section($('roofSurfaces'), 'prestudySurfaceQualification', 'Qualification toiture', [$('manualAreaSettings'), $('roofSurfaceCards')]);
    qualification.host.dataset.surfaceQualification = 'true';
    const roofState = $('roof')?.closest('label');
    if (roofState) {
      const labelText = [...roofState.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
      if (labelText) labelText.textContent = 'État apparent du bâtiment';
      $('roof')?.setAttribute('aria-label', 'État apparent du bâtiment');
    }
    qualification.panel.prepend(make('p', 'Sans toiture tracée, les paramètres généraux servent de référence. Dès qu’une toiture est tracée, ses caractéristiques propres (type, orientation, pente et ombrage) prévalent pour son estimation PVGIS. L’état apparent reste une appréciation unique du bâtiment.', 'fine prestudySurfacePriorityNote'));
    const advanced = root.querySelector('.roofExpertSettings');
    if (advanced) { headingBefore(advanced, 'prestudySurfaceAdvancedTitle', 'Paramètres avancés et documents'); advanced.classList.add('prestudyDPanel'); }
    // Les deux tuiles restent accessibles dans la production ; retrait du seul bloc de surface redondant.
    $('roofSurfaceGeneral').querySelectorAll('.metric').forEach((n) => {
      if (/^(Zones identifiées|Couverture)$/.test(n.querySelector('b,small')?.textContent.trim() || '')) n.hidden = true;
    });
  }
  function preparePerformance() {
    const root = $('audit-solar'), estimate = $('roofEstimate'), study = $('audit-production'), climate = $('climateYieldPanel');
    const legacy = [...root.children];
    const production = section(root, 'prestudyPerformanceProductionGroup', 'Production PVGIS', [estimate]);
    const load = section(root, 'prestudyPerformanceLoadGroup', 'Consommation et profil de charge', [study]);
    section(root, 'prestudyPerformanceMatchingGroup', 'Adéquation énergétique', [make('p', 'Les profils et répartitions indicatifs sont présentés ci-dessus avec leurs limites. Les parts ACI, ACC, IRVE et surplus restent réglables dans Finance & décision.', 'fine')]);
    const matchingLink = make('a', 'Accéder à la valorisation de l’énergie →'); matchingLink.href = '#prestudy-finance-allocation';
    $('prestudyPerformanceMatchingGroup').lastElementChild.append(matchingLink);
    if (estimate) {
      const action = make('p', null, 'fine prestudyDInlineAction');
      const link = make('a', 'Ajuster les surfaces et la qualification de toiture →');
      link.href = '#prestudySurfaceQualification';
      action.append(link);
      production.panel.append(action);
    }
    const climateGroup = section(root, 'prestudyPerformanceClimateGroup', 'Variabilité climatique historique', [climate]);
    if (climate) {
      const action = make('p', null, 'fine prestudyDInlineAction');
      const link = make('a', 'Accéder à Production PVGIS →');
      link.href = '#prestudyPerformanceProductionGroup';
      action.append(link);
      climateGroup.panel.append(action);
    }
    const productionCurve = study?.querySelector('.productionCurve');
    const profileBars = study?.querySelector('#profileBars');
    const profileLine = study?.querySelector('#profileP50');
    if (productionCurve && profileBars && !study.querySelector('.prestudyProductionPending')) {
      const pending = make('p', 'Le graphique mensuel s’affichera après une estimation PVGIS réussie.', 'fine prestudyProductionPending');
      pending.setAttribute('role', 'status');
      productionCurve.insertAdjacentElement('afterend', pending);
      const syncProductionGraph = () => {
        const ready = profileBars.childElementCount >= 12 || Boolean(profileLine?.getAttribute('points')?.trim());
        productionCurve.hidden = !ready;
        pending.hidden = ready;
      };
      syncProductionGraph();
      new MutationObserver(syncProductionGraph).observe(profileBars, { childList: true, subtree: true });
      if (profileLine) new MutationObserver(syncProductionGraph).observe(profileLine, { attributes: true, attributeFilter: ['points'] });
    }
    // Ces contrôles historiques restent en place : leurs identifiants sont encore lus par PVGIS, Risques, Enedis, Finance et la restauration du brouillon.
    const terrain = section(root, 'prestudyPerformanceTerrainGroup', 'Fiche terrain actuelle', legacy);
    terrain.panel.prepend(make('p', 'Cette rubrique reprend la fiche terrain historique : surface utilisable, orientation, pente, ombrage, état apparent et consommation. Les valeurs sont maintenant renseignées dans « Surfaces solaires » et « Consommation et profil de charge » ; cette fiche ne contient donc pas de valeur indépendante. Le badge « Commercial » indique le contexte de pré-étude, pas une qualification technique du site.', 'fine prestudyTerrainNote'));
    production.panel.querySelector(':scope > #roofEstimate > h3')?.classList.add('prestudySrOnly');
    production.panel.querySelector('#roofEstimate > .sectionTitle h2')?.classList.add('prestudySrOnly');
    climate?.querySelector(':scope > h3')?.classList.add('prestudySrOnly');
    load.panel.querySelector('#consumptionReferenceGroup')?.classList.add('prestudyDFlat');
  }
  function prepareRisks() {
    const root = $('audit-risk'), selector = $('riskFactor');
    const form = selector.closest('.form');
    root.querySelector('.sectionTitle h2')?.classList.add('prestudySrOnly');
    const register = section(root, 'prestudyRiskRegister', 'Registre des sept contrôles', []);
    const editorNodes = [form, $('riskHelp'), root.querySelector('.riskActions'), $('riskEvidenceUploadStatus'), $('riskEvidenceDocuments')];
    riskEditor = make('div', null, 'prestudyRiskEditor'); riskEditor.id = 'prestudyRiskEditor';
    register.panel.append(riskEditor);
    editorNodes.filter(Boolean).forEach((n) => riskEditor.append(n));
    const rows = new Map(); let active = selector.value, pending = null, internalChange = false, restoringContext = false;
    const source = $('riskSource'), observation = $('riskObservation'), evidence = $('riskEvidence'), file = $('riskEvidenceFile'), upload = $('riskEvidenceUpload');
    const values = () => JSON.stringify([observation.value, evidence.value, source.value]);
    const initialValue = (select) => ([...select.options].find((o) => o.defaultSelected) || select.options[0]).value;
    const initialEditor = [initialValue(observation), initialValue(evidence), source.defaultValue];
    let baseline = values();
    const hasFile = () => Boolean(file.files?.length);
    const changed = () => values() !== baseline || hasFile() || upload.disabled;
    const records = () => window.OzenoRiskDraft?.capture() || [];
    const guard = make('dialog', null, 'prestudyRiskGuard'); guard.setAttribute('aria-labelledby', 'prestudyRiskGuardTitle');
    guard.innerHTML = '<h2 id="prestudyRiskGuardTitle">Édition en cours</h2><p>Conservez cette ligne pour terminer votre saisie, appliquez le constat avec l’action existante, ou abandonnez cette édition avant de changer de point.</p><p id="prestudyRiskGuardFile" role="status"></p><div><button type="button" data-risk-continue>Continuer la saisie</button><button type="button" data-risk-apply>Appliquer le constat</button><button type="button" data-risk-discard>Abandonner l’édition</button></div>';
    document.body.append(guard);
    const syncGuard = () => {
      guard.querySelector('[data-risk-apply]').disabled = hasFile() || upload.disabled;
      guard.querySelector('[data-risk-discard]').disabled = upload.disabled;
      $('prestudyRiskGuardFile').textContent = upload.disabled ? 'Envoi en cours : attendez sa fin avant de changer de point.' : hasFile() ? 'Un justificatif est sélectionné. Joignez-le depuis la ligne actuelle, ou abandonnez explicitement sa sélection.' : '';
    };
    function refresh() {
      // Le hub annonce le contexte avant de restaurer les constats : attendre le rendu de couverture existant.
      if (restoringContext) { loadSelectedRecord(); baseline = values(); restoringContext = false; }
      const byFactor = new Map(records().map((r) => [r.factor, r]));
      rows.forEach(({ status, state }, key) => {
        const record = byFactor.get(key);
        status.textContent = record ? 'Constat enregistré' : 'À vérifier';
        const scoreLabel = record ? [...observation.options].find((o) => Number(o.value) === record.score)?.textContent || 'Constat disponible' : 'Aucun constat documenté';
        const sourceLabel = record?.source?.trim() || '';
        state.querySelector('.prestudyRiskObservation').textContent = scoreLabel;
        state.querySelector('.prestudyRiskSource').textContent = sourceLabel ? `Source : ${sourceLabel}` : '';
        state.querySelector('.prestudyRiskSource').hidden = !sourceLabel;
      });
    }
    function open(factor, focus = true) {
      active = factor;
      const row = rows.get(factor); row.host.append(riskEditor); riskEditor.hidden = false;
      rows.forEach((item, key) => item.button.setAttribute('aria-expanded', String(key === factor)));
      if (focus) { selector.focus({ preventScroll: true }); row.host.scrollIntoView({ block: 'nearest' }); }
    }
    function select(factor) {
      if (factor !== active) {
        selector.value = factor; internalChange = true; selector.dispatchEvent(new Event('change')); internalChange = false;
        loadSelectedRecord();
        active = factor; baseline = values();
      }
      open(factor);
    }
    function loadSelectedRecord() {
      const record = records().find((r) => r.factor === selector.value);
      if (record) { observation.value = String(record.score); evidence.value = record.evidence; source.value = record.source || ''; }
      else { [observation.value, evidence.value, source.value] = initialEditor; }
    }
    function request(factor) {
      if (factor !== active && changed()) { pending = factor; syncGuard(); guard.showModal(); return; }
      select(factor);
    }
    [...selector.options].forEach((option) => {
      const host = make('div', null, 'prestudyRiskRow'); host.id = `prestudy-risk-${option.value.toLowerCase()}`;
      const line = make('div', null, 'prestudyRiskLine'), label = make('strong', option.textContent.replace(/^✓\s*/, ''));
      const state = make('span', null, 'prestudyRiskState'), status = make('span', null, 'prestudyRiskStatus');
      state.append(make('span', null, 'prestudyRiskObservation'), make('small', null, 'prestudyRiskSource'));
      const button = make('button', 'Examiner'); button.type = 'button'; button.dataset.riskExamine = option.value;
      button.setAttribute('aria-label', `Examiner : ${label.textContent}`); button.setAttribute('aria-controls', riskEditor.id); button.setAttribute('aria-expanded', 'false');
      button.addEventListener('click', () => request(option.value));
      line.append(label, state, status, button); host.append(line); register.panel.append(host); rows.set(option.value, { host, button, status, state });
    });
    // Le contrôle existant reste utilisable : intercepter avant ses handlers seulement en cas de changement de ligne.
    selector.addEventListener('change', (event) => {
      if (internalChange) return;
      const requested = selector.value;
      if (requested !== active) { event.stopImmediatePropagation(); selector.value = active; request(requested); }
    }, true);
    guard.querySelector('[data-risk-continue]').onclick = () => guard.close();
    guard.querySelector('[data-risk-apply]').onclick = () => { $('addRisk').click(); const next = pending; guard.close(); select(next); };
    guard.querySelector('[data-risk-discard]').onclick = () => { file.value = ''; const next = pending; guard.close(); select(next); };
    guard.addEventListener('close', () => rows.get(active)?.button.focus({ preventScroll: true }));
    $('addRisk').addEventListener('click', () => { baseline = values(); refresh(); });
    new MutationObserver(refresh).observe($('riskCoverage'), { childList: true, subtree: true });
    new MutationObserver(syncGuard).observe(upload, { attributes: true, attributeFilter: ['disabled'] });
    window.addEventListener('ozeno:risk-document-attached', refresh);
    window.addEventListener('ozeno:project-context-loaded', () => {
      guard.close(); file.value = ''; active = selector.value; restoringContext = true; baseline = values();
      riskEditor.hidden = true; rows.forEach((row) => row.button.setAttribute('aria-expanded', 'false'));
    });
    revealRisk = () => open(active, false);
    root.addEventListener('invalid', revealRisk, true);
    riskEditor.hidden = true; refresh();
  }
  function prepareFinancePresentation() {
    const root = $('audit-finance');
    const funding = root?.querySelector('.financeFundingConfiguration');
    const irve = root?.querySelector('#irveInvestmentGroup');
    if (funding && irve) irve.before(funding);
    presentationHeadingBefore(root?.querySelector('.financeInvestmentCostRow'), 'prestudyFinanceCapexHeading', 'CAPEX');
    presentationHeadingBefore(funding, 'prestudyFinanceFundingHeading', 'Financement');
    presentationHeadingBefore(root?.querySelector('.financeRevenueGroups'), 'prestudyFinanceValuationHeading', 'Valorisation énergétique');
    presentationHeadingBefore(root?.querySelector('.financePreviewMetrics'), 'prestudyFinanceResultsHeading', 'Résultats financiers · aperçu');
  }
  function addPreviewMetric(grid, id, label, valueId, noteId, description) {
    if (!grid || $(id)) return;
    const card = make('div', null, 'decisionMetricUnavailable'); card.id = id;
    const value = make('strong', 'À calculer'); value.id = valueId;
    const note = make('small', description); note.id = noteId;
    card.append(make('small', label), value, note);
    grid.append(card);
  }
  function prepareSummaryPresentation() {
    const root = $('ozeno-summary');
    const energyGrid = root?.querySelector('.decisionGrid');
    if (energyGrid && !energyGrid.id) energyGrid.id = 'prestudySummaryEnergyGrid';
    presentationHeadingBefore(energyGrid, 'prestudySummaryEnergyHeading', 'Indicateurs énergétiques');
    const profile = root?.querySelector('.decisionProductionProfile');
    if (profile && !profile.id) profile.id = 'prestudySummaryProduction';
    const financeGrid = $('decisionFinanceMetricGrid') || $('decisionFinanceMetrics')?.querySelector('.decisionFinanceMetricGrid');
    if (financeGrid) {
      addPreviewMetric(financeGrid, 'prestudyProjectIrrAvailability', 'TRI Projet', 'decisionFinanceProjectIrr', 'decisionFinanceProjectIrrNote', 'CAPEX initial, puis revenus moins OPEX, avant financement et impôts · aperçu indicatif.');
      addPreviewMetric(financeGrid, 'prestudyDscrAvailability', 'DSCR minimum · période de dette', 'decisionFinanceDscr', 'decisionFinanceDscrNote', 'Flux disponible avant dette ÷ intérêts et principal ; minimum pendant la durée de dette.');
    }
    const lcoe = $('dashLcoe')?.closest('.decisionFinanceMetric');
    if (lcoe) {
      if (!lcoe.id) lcoe.id = 'prestudySummaryLcoe';
      if (!lcoe.querySelector('.decisionLcoeMethod')) {
        const method = make('small', 'Méthode existante : CAPEX, commission initiale et OPEX non actualisés rapportés à la production totale estimée.', 'decisionLcoeMethod');
        $('dashLcoe').insertAdjacentElement('afterend', method);
      }
    }
    const revenue = $('decisionRevenue');
    if (revenue) {
      revenue.setAttribute('aria-label', 'Économies ACI et recettes ACC, IRVE et surplus estimées pour l’année 1');
      if (!revenue.querySelector('.decisionRevenuePeriodNote')) {
        const note = make('small', 'Ventilation par canal disponible pour l’année 1. Le moteur actuel ne fournit pas de détail annuel par canal sur toute la durée de projection.', 'decisionRevenuePeriodNote');
        revenue.querySelector('.decisionRevenueHeading')?.insertAdjacentElement('afterend', note);
      }
    }
    window.dispatchEvent(new CustomEvent('ozeno:prestudy-summary-presentation-ready'));
  }
  function prepareEfficiencyPresentation() {
    const form = $('efficiencyImpactForm');
    const primaryGrid = form?.querySelector(':scope > .efficiencyGrid');
    presentationHeadingBefore(primaryGrid, 'prestudyEfficiencyInputsHeading', 'Hypothèses de l’action');
    form?.querySelectorAll('label').forEach((label) => {
      const name = label.querySelector('[name]')?.name || '';
      if (/source|referenceDate|ficheCode/i.test(name)) label.classList.add('efficiencySourceField');
    });
    const ceeGrid = form?.querySelector('.efficiencyCee > .form');
    presentationHeadingBefore(ceeGrid, 'prestudyEfficiencyCeeHeading', 'Données de valorisation CEE');
    const results = $('efficiencyImpactResults');
    if (results) results.setAttribute('aria-label', 'Résultats de l’aperçu efficacité énergétique, CO₂ et CEE');
  }
  function prepare() {
    if (!$('audit-project') || $('audit-project').classList.contains('prestudyChapterD')) return;
    // Vérifiable avant/après composition : aucune copie de contrôle ni nouvelle valeur métier.
    const link = make('link'); link.rel = 'stylesheet'; link.href = './prestudy-chapters.css'; document.head.append(link);
    ['audit-project', 'audit-roof', 'audit-solar', 'audit-risk'].forEach((id) => $(id).classList.add('prestudyChapterD'));
    const phaseEStyle = make('link'); phaseEStyle.id = 'prestudyPhaseEStyles'; phaseEStyle.rel = 'stylesheet'; phaseEStyle.href = './prestudy-phase-e.css'; document.head.append(phaseEStyle);
    ['audit-finance', 'audit-efficiency', 'ozeno-summary'].forEach((id) => $(id)?.classList.add('prestudyChapterE'));
    document.querySelector('.reportEditor')?.classList.add('prestudyChapterE');
    prepareProject(); prepareSurfaces(); preparePerformance(); prepareRisks();
    prepareFinancePresentation(); prepareEfficiencyPresentation(); prepareSummaryPresentation();
    window.addEventListener('ozeno:finance-summary-ready', prepareSummaryPresentation);
    const summary = $('ozeno-summary');
    if (summary) new MutationObserver(prepareSummaryPresentation).observe(summary, { childList: true, subtree: true });
  }
  window.OzenoPrestudyChapters = Object.freeze({ prepare, refreshSummaryPresentation: prepareSummaryPresentation, reveal(target) { if (riskEditor?.contains(target)) revealRisk(); } });
}());
