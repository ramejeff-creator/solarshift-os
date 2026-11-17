(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const config = window.SOLARSHIFT_CONFIG = window.SOLARSHIFT_CONFIG || {};
  const OBI_TERTIARY_FLAG = 'OBI_TERTIARY_PROSPECTING_ENABLED';
  const OBI_LOCAL_FLAG_ENABLED = (() => {
    try {
      const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
      const flagParams = new URLSearchParams(location.search);
      const explicitFlag = flagParams.has(OBI_TERTIARY_FLAG)
        ? flagParams.get(OBI_TERTIARY_FLAG) === 'true'
        : config[OBI_TERTIARY_FLAG] === true;
      return explicitFlag && localHosts.has(String(location.hostname).toLowerCase());
    } catch { return false; }
  })();
  // Public observations are the sole source in local multi-signal prospecting.
  // Keep them loopback-only; there is no user-facing switch back to demo data.
  const OBI_CONNECTED_LOCAL = OBI_LOCAL_FLAG_ENABLED;
  let prospectingMode = OBI_LOCAL_FLAG_ENABLED ? 'global' : 'pv', obiFixtureCache = null, obiModels = [], obiPageSize = 20, activeObiCandidateId = null, hoveredObiCandidateId = null, cancelActiveObiEvidence = () => {};
  let obiMinimumAreaValue = '500', pvMinimumAreaValue = '';
  const dashboard = document.body.classList.contains('ozenoDashboard');
  // Flag exclusivement local : OFF par défaut ; aucun effet sur les sessions de production.
  const OOI_LOCAL_PREVIEW = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname.toLowerCase())
    && (config.OOI_VISUAL_PREVIEW_ENABLED === true
      || new URLSearchParams(location.search).get('OOI_VISUAL_PREVIEW_ENABLED') === 'true');
  const preserveOoiLocalPreview = (href) => {
    if (!OOI_LOCAL_PREVIEW) return href;
    const url = new URL(href, location.href);
    url.searchParams.set('OOI_VISUAL_PREVIEW_ENABLED', 'true');
    return `${url.pathname}${url.search}${url.hash}`;
  };
  const projectPrestudyHref = (record) => preserveOoiLocalPreview(record.scope === 'cloud'
    ? `./index.html?projectId=${encodeURIComponent(record.id)}`
    : `./index.html?draftId=${encodeURIComponent(record.id)}`);
  let ooiView = null;
  if (OOI_LOCAL_PREVIEW) import('./ooi-visual-v04.mjs?v=20261113-portfolio-save-fix-1').then((module) => {
    ooiView = module;
    if (!document.getElementById('ooiVisualStyle')) {
      const link = document.createElement('link'); link.id = 'ooiVisualStyle'; link.rel = 'stylesheet'; link.href = './ooi-visual-v04.css'; document.head.append(link);
    }
    if (dashboard && client && store && deviceStore) renderDashboard();
  }).catch((error) => console.warn('OOI aperçu indisponible', error));

  const metadataFields = ['name', 'address', 'clientName', 'companyName', 'siret', 'contactName', 'phone', 'email', 'installerName', 'installationDate'];
  const inputIds = ['roofTotal', 'roofRatio', 'panelArea', 'panelWp', 'pvgisSystemLoss', 'manualAzimuth', 'orientation', 'tilt', 'shade', 'roof', 'cons', 'prestudyPrm', 'term', 'capexReferenceMode', 'capexInstallationType', 'capexPerKwp', 'prestudyBuildingType', 'prestudyWarehouseSubtype', 'prestudyIndustrySchedule', 'prestudyExactPowerKva', 'prestudyPowerBand', 'prestudyGridPrice', 'prestudyGridPriceBasis', 'irveChargerCount', 'irvePowerPerChargerKw', 'irveCustomPowerKw', 'irvePowerKw', 'irveInstalledCostPerKw', 'debtShare', 'debtRate', 'debtTerm', 'discountRate', 'assumptionProductionDegradationPct', 'assumptionEnergyPriceEscalationPct', 'assumptionS21SurplusEscalationPct', 'assumptionContractSurplusEscalationPct', 'assumptionMaintenanceCapexPct', 'assumptionInsuranceCapexPct', 'assumptionInitialProjectCommissionPct', 'assumptionManagementFeePct', 'assumptionRentEscalationPct', 'financialAnalysis', 'manualEnergyAllocation', 'aciShare', 'aciPrice', 'accShare', 'accPrice', 'irveShare', 'irvePrice', 'contractReferencePrice', 'aciDiscountPercent', 'accDiscountPercent', 'contractReferenceSource', 'gridShare', 'gridPriceMode', 'gridPrice', 'gridPriceSource', 'rentOn', 'rentRate', 'reportTitle', 'reportDate', 'reportConclusion'];
  window.SOLARSHIFT_COMPLETE_FINANCE_READY?.then((policy) => {
    if (!policy) return;
    for (const id of [...policy.parameters.map(p=>p.id),'completeSaleMode','fullQuoteScope','fullConnectionEur','contractManagementApplicable','contractAdministrationApplicable','contractPmoApplicable','npvComparisonApplicable']) {
      if (!inputIds.includes(id)) inputIds.push(id);
      if (emptyPreview) emptyPreview.controls[id] = $(id)?.type==='checkbox'?false:id==='completeSaleMode'?'MIXED':id==='fullQuoteScope'?'EPC':$(id)?.dataset.modelDefault ?? '';
    }
  });
  const commercialStatusLabels = { VALIDATED: 'Accord obtenu', IN_PROGRESS: 'Qualification en cours', ABANDONED: 'Opportunité abandonnée', DELETED: 'Archivé' };
  const commercialStatusClasses = { VALIDATED: 'validated', IN_PROGRESS: 'progress', ABANDONED: 'abandoned', DELETED: 'deleted' };
  const pipelineCategoryLabels = { VALIDATED: 'Accord commercial obtenu', IN_PROGRESS: 'Qualification en cours', PROSPECTING: 'En prospection', PENDING: 'En attente · demande web' };
  const operationModeLabels = { UNSPECIFIED: 'À définir', NO_MANAGEMENT: 'Aucune gestion OZENO', INSTALLATION_MANAGEMENT: 'Gestion installation', ACC_MANAGEMENT: 'Organisation ACC (PMO)', INSTALLATION_AND_ACC: 'Installation + organisation ACC', OTHER: 'Autre intervention' };
  const managementContractStatusLabels = { UNSPECIFIED: 'À définir', NOT_PLANNED: 'Non prévu', TO_PROPOSE: 'À proposer', PROPOSED: 'Proposition envoyée', NEGOTIATING: 'En négociation', TO_SIGN: 'À signer', ACTIVE: 'Actif', SUSPENDED: 'Suspendu', TERMINATED_BY_OWNER: 'Résilié par le propriétaire', ENDED: 'Terminé' };
  const crmStageLabels = {
    QUALIFICATION: 'Qualification en cours', CONTACT_ESTABLISHED: 'Contact établi', PROPOSAL_TO_PREPARE: 'Proposition à préparer',
    PROPOSAL_SENT: 'Proposition envoyée', CONTRACT_TO_SIGN: 'Contrat à signer', CONTRACT_ACTIVE: 'Contrat actif',
    CONTRACT_SUSPENDED_OR_TERMINATED: 'Contrat suspendu / résilié',
    OPPORTUNITY_LOST: 'Opportunité abandonnée', PROJECT_COMPLETED: 'Projet terminé'
  };
  const crmStageClasses = {
    QUALIFICATION: 'progress', CONTACT_ESTABLISHED: 'progress', PROPOSAL_TO_PREPARE: 'progress', PROPOSAL_SENT: 'progress',
    CONTRACT_TO_SIGN: 'validated', CONTRACT_ACTIVE: 'validated', CONTRACT_SUSPENDED_OR_TERMINATED: 'abandoned',
    PROJECT_COMPLETED: 'deleted', OPPORTUNITY_LOST: 'deleted'
  };
  const crmStages = Object.keys(crmStageLabels);
  const crmStageOf = (record = {}) => {
    if (crmStageLabels[record.crmStage]) return record.crmStage;
    const legacyStages = {
      NEGOTIATION: 'PROPOSAL_SENT', AGREEMENT_OBTAINED: 'CONTRACT_TO_SIGN',
      CONTRACT_SUSPENDED: 'CONTRACT_SUSPENDED_OR_TERMINATED', CONTRACT_TERMINATED: 'CONTRACT_SUSPENDED_OR_TERMINATED',
      NO_MANAGEMENT_CONTRACT: 'QUALIFICATION', PROSPECTING: 'QUALIFICATION'
    };
    if (legacyStages[record.crmStage]) return legacyStages[record.crmStage];
    if (record.crmStage === 'ARCHIVED') return 'ARCHIVED';
    if (record.commercialStatus === 'ABANDONED') return 'OPPORTUNITY_LOST';
    if (record.commercialStatus === 'DELETED') return 'ARCHIVED';
    const legacyContractStages = { TO_PROPOSE: 'PROPOSAL_TO_PREPARE', PROPOSED: 'PROPOSAL_SENT', NEGOTIATING: 'PROPOSAL_SENT', TO_SIGN: 'CONTRACT_TO_SIGN', ACTIVE: 'CONTRACT_ACTIVE', SUSPENDED: 'CONTRACT_SUSPENDED_OR_TERMINATED', TERMINATED_BY_OWNER: 'CONTRACT_SUSPENDED_OR_TERMINATED', ENDED: 'PROJECT_COMPLETED' };
    if (legacyContractStages[record.managementContractStatus]) return legacyContractStages[record.managementContractStatus];
    return record.commercialStatus === 'VALIDATED' ? 'CONTRACT_TO_SIGN' : 'QUALIFICATION';
  };
  const crmArchivedOf = (record = {}) => record.crmArchived === true || ['ARCHIVED', 'CONTRACT_SUSPENDED_OR_TERMINATED', 'PROJECT_COMPLETED', 'OPPORTUNITY_LOST'].includes(crmStageOf(record));
  const crmStageIsTerminal = (stage) => ['CONTRACT_SUSPENDED_OR_TERMINATED', 'PROJECT_COMPLETED', 'OPPORTUNITY_LOST'].includes(stage);
  const operationModeOf = (record = {}) => operationModeLabels[record.operationMode] ? record.operationMode
    : (record.crmStage === 'NO_MANAGEMENT_CONTRACT' || record.managementContractStatus === 'NOT_PLANNED') ? 'NO_MANAGEMENT' : 'UNSPECIFIED';
  const legacyStatusForCrmStage = (stage) => stage === 'OPPORTUNITY_LOST' ? 'ABANDONED'
    : ['ARCHIVED', 'CONTRACT_SUSPENDED_OR_TERMINATED', 'PROJECT_COMPLETED'].includes(stage) ? 'DELETED'
      : ['CONTRACT_TO_SIGN', 'CONTRACT_ACTIVE'].includes(stage) ? 'VALIDATED' : 'IN_PROGRESS';
  const legacyContractStatusForCrmStage = (stage, record = {}) => ({
    PROPOSAL_TO_PREPARE: 'TO_PROPOSE', PROPOSAL_SENT: 'PROPOSED', CONTRACT_TO_SIGN: 'TO_SIGN', CONTRACT_ACTIVE: 'ACTIVE',
    CONTRACT_SUSPENDED_OR_TERMINATED: ['SUSPENDED', 'TERMINATED_BY_OWNER'].includes(record.managementContractStatus) ? record.managementContractStatus : 'TERMINATED_BY_OWNER',
    PROJECT_COMPLETED: 'ENDED'
  })[stage] || 'UNSPECIFIED';
  const commercialStatusOf = (record) => legacyStatusForCrmStage(crmStageOf(record));
  const actionTypeLabels = { CALL: 'Appel', EMAIL: 'E-mail', MEETING: 'Rendez-vous', SITE_VISIT: 'Visite de site', SEND_PROPOSAL: 'Envoyer une proposition', FOLLOW_UP: 'Relance', OTHER: 'Autre action' };
  const actionStatusLabels = { PLANNED: 'À faire', DONE: 'Terminée', CANCELLED: 'Annulée' };
  const stageActionSuggestions = {
    CONTACT_ESTABLISHED: { type: 'CALL', title: 'Relancer le contact' },
    PROPOSAL_TO_PREPARE: { type: 'SEND_PROPOSAL', title: 'Préparer et envoyer la proposition' },
    PROPOSAL_SENT: { type: 'FOLLOW_UP', title: 'Relancer après l’envoi de la proposition' },
    CONTRACT_TO_SIGN: { type: 'FOLLOW_UP', title: 'Suivre la signature du contrat' },
    CONTRACT_ACTIVE: { type: 'SITE_VISIT', title: 'Planifier le lancement de l’opération' }
  };
  let client, session, identity, store, deviceStore, installerNetwork = null, current = null, organizations = [], cloudRecords = [], dashboardRecords = [], cloudError = '', dirty = false, restoring = false, saveMode = 'current', emptyPreview, leaveToDashboardAfterSave = false, finalWorkspaceTarget = null, finalWorkspaceSaving = false;
  let missionTools=null,missionSaveChain=Promise.resolve();
  let saveAddressSelection = null, saveAddressAutocompleteTimer = 0, saveAddressAutocompleteController = null, saveAddressAutocompleteRequest = 0, saveSeed = null;
  let projectMap = null, projectMapLayer = null, prospectingMap = null, prospectingLayer = null, prospectingBuildings = new Map(), prospectingAddressSelection = null, prospectingAutocompleteTimer = null, prospectingAutocompleteController = null, prospectingSearchInProgress = false;
  let prospectingSheet = null, prospectingSelection = 0;
  let prospectingSearchGeneration = 0, prospectingSearchController = null, prospectingEnergyController = null, prospectingMapPickMode = false;
  const prospectingCards = new Map();
  let obiConnectedReaders;
  function notifyShellStatus() { window.dispatchEvent(new CustomEvent('ozeno:hub-status', { detail: { dirty } })); }
  function setProspectingProgress(label, value = null, visible = true) {
    const wrap = $('hubProspectingProgressWrap'), progress = $('hubProspectingProgress'), text = $('hubProspectingProgressLabel');
    if (!wrap || !progress || !text) return;
    text.textContent = label;
    if (Number.isFinite(value)) progress.value = Math.max(0, Math.min(100, value));
    else progress.removeAttribute('value');
    wrap.classList.toggle('isComplete', value === 100);
    wrap.hidden = !visible;
  }
  function invalidateProspectingResults() {
    if (OBI_LOCAL_FLAG_ENABLED && prospectingMode !== 'pv') cancelActiveObiEvidence();
    prospectingSearchGeneration++; prospectingSearchController?.abort(); prospectingEnergyController?.abort();
    prospectingSearchInProgress = false; prospectingSelection++; prospectingSheet?.close();
    prospectingCards.clear(); $('hubCandidates')?.replaceChildren();
    if ($('hubCandidateCount')) $('hubCandidateCount').textContent = '0';
    if ($('hubProspectingResults')) $('hubProspectingResults').hidden = true;
    setProspectingProgress('', null, false);
    updateProspectingSearchAvailability();
  }
  function updateProspectingEnergy(candidate, energy) {
    const card = prospectingCards.get(candidate.osmId);
    if (!card || card.candidate !== candidate) return;
    card.energy = energy; card.energyAttempted = true;
    candidate.energy = energy;
    card.hasEnedis = energy.state === 'AVAILABLE' && energy.totalMwh != null && String(energy.totalMwh).trim() !== ''
      && Number.isFinite(Number(energy.totalMwh)) && Number(energy.totalMwh) >= 0;
    card.item.classList.toggle('hasEnedisConsumption', card.hasEnedis);
    card.energyBadge.hidden = !card.hasEnedis;
    prospectingCards.forEach(({ candidate: entry, hasEnedis }) => {
      const layer = prospectingBuildings.get(entry.osmId);
      if (layer) layer.setStyle({ color: hasEnedis ? '#188154' : '#d07a19', weight: hasEnedis ? 3 : 2 });
    });
    const value = energy.totalMwh == null ? (energy.state === 'UNAVAILABLE' ? 'Indisponible' : 'Information non disponible')
      : `${Number(energy.totalMwh).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} MWh/an · référence Enedis ${energy.latestYear}${energy.partial ? ' · partiel' : ''}`;
    card.energyText.textContent = `Consommation : ${value}`;
    card.popupLabel.textContent = `Consommation : ${value}`;
    sortProspectingCards();
  }
  async function sortProspectingCards() {
    const generation = prospectingSearchGeneration;
    const { compareProspectingCards } = await import('./prospecting-energy.mjs?v=20261116-enedis-address-reference-1');
    if (generation !== prospectingSearchGeneration) return;
    const mode = $('hubProspectingSort')?.value || 'surface';
    const cards = [...prospectingCards.values()].sort((a,b) => compareProspectingCards(a,b,mode));
    $('hubCandidates').append(...cards.map(card => card.item));
  }
  async function loadProspectingEnergySort() {
    const mode = $('hubProspectingSort').value;
    if (prospectingEnergyController && !prospectingEnergyController.done && !prospectingEnergyController.signal.aborted
      && prospectingEnergyController.generation === prospectingSearchGeneration) {
      if (!mode.startsWith('consumption')) $('hubProspectingSortState').textContent = 'Tri par surface estimée décroissante · consommations chargées progressivement.';
      return;
    }
    const controller = new AbortController(); controller.generation = prospectingSearchGeneration; prospectingEnergyController = controller;
    const generation = prospectingSearchGeneration;
    const active = () => generation === prospectingSearchGeneration && !controller.signal.aborted;
    const { candidateConsumption } = await import('./prospecting-energy.mjs?v=20261116-enedis-address-reference-1');
    if (!active()) return;
    const priority = [...prospectingCards.values()].slice(0, 100);
    const queue = priority.filter(card => !card.energyAttempted);
    const capped = prospectingCards.size > 100;
    let next = 0, completed = 0;
    const initiallyComplete = priority.length - queue.length;
    const progress = () => {
      if (active()) {
        const total = priority.length;
        const lead = $('hubProspectingSort').value.startsWith('consumption') ? 'Consommations vérifiées' : 'Chargement progressif des consommations';
        const done = Math.min(total, initiallyComplete+completed);
        $('hubProspectingSortState').textContent = `${lead} : ${done}/${total}. Les inconnues restent en fin de liste.${capped ? ' Limite de 100 bâtiments par recherche.' : ''}`;
        setProspectingProgress(done < total ? `Recherche des consommations publiées : ${done}/${total} bâtiments. Les agrégats ne sont pas des mesures individuelles.` : 'Recherche terminée. Les consommations affichées sont des agrégats d’adresse, sans attribution au contour.', total ? Math.round(done / total * 100) : 100);
      }
    };
    progress();
    async function worker() {
      while (active() && next < queue.length) {
        const card = queue[next++];
        card.energyAttempted = true;
        card.energyText.textContent = 'Consommation : chargement…';
        try {
          const energy = await candidateConsumption(card.candidate, { signal: controller.signal });
          if (active()) updateProspectingEnergy(card.candidate, energy);
        } catch {
          if (active()) updateProspectingEnergy(card.candidate, { state: 'UNAVAILABLE', totalMwh: null });
        }
        card.energyAttempted = true; completed++; progress();
      }
    }
    await Promise.all([worker(), worker()]); // Bounded concurrency; no burst of hundreds of public requests.
    if (active()) { controller.done = true; progress(); }
  }
  async function showProspectingSheet(candidate, index, consumptionLabel, scroll) {
    const selection = ++prospectingSelection;
    if (!prospectingSheet) {
      const { createProspectingSheet } = await import('./prospecting-sheet.mjs');
      if (selection !== prospectingSelection) return;
      prospectingSheet = createProspectingSheet({ host: $('hubProspectingSheet'), config, getToken: tokenSession, onConsumption: updateProspectingEnergy });
    }
    if (selection === prospectingSelection) prospectingSheet.show(candidate, index, consumptionLabel, scroll);
  }
  async function showUnifiedProspectingDetail(candidate, index, consumptionLabel) {
    if (!OBI_LOCAL_FLAG_ENABLED) return showProspectingSheet(candidate, index, consumptionLabel, true);
    try {
      const { createObiProspectingViewModel } = await import('./obi-prospecting-view-model.mjs');
      const model = createObiProspectingViewModel(candidate);
      const existingLayer = prospectingBuildings.get(candidate.osmId);
      if (existingLayer) prospectingBuildings.set(model.target.id, existingLayer);
      model.energy = { ...model.energy, enedisAddressAggregate: candidate.energy || model.energy?.enedisAddressAggregate || null };
      await showObiDetail(model, candidate, () => showProspectingSheet(candidate, index, consumptionLabel, true));
    } catch (error) {
      notice(`Fiche de synthèse indisponible : ${error.message}`, true);
    }
  }
  const safeText = (value) => String(value ?? '');
  const flatten = (record) => ({ ...record.data, ...record });
  const element = (tag, text, className) => {
    const node = document.createElement(tag); node.textContent = safeText(text);
    if (className) node.className = className;
    return node;
  };
  const accountDisplayName = () => identity?.user_metadata?.full_name?.trim()
    || identity?.user_metadata?.name?.trim()
    || identity?.email
    || 'Compte';
  window.OzenoProjectHub = Object.freeze({
    getMandataireContact: async () => {
      if (!identity && client) {
        try {
          session = await client.getSession(localStorage);
          if (session?.access_token) identity = await client.getIdentity(session.access_token);
        } catch { /* Keep the contact explicitly unknown when the account cannot be read. */ }
      }
      return {
        name: identity?.user_metadata?.full_name?.trim() || identity?.user_metadata?.name?.trim() || '',
        email: identity?.email || '',
        phone: identity?.phone || identity?.user_metadata?.phone || identity?.user_metadata?.phone_number || ''
      };
    }
  });
  function notice(message, error = false) {
    const host = $('hubNotice');
    host.textContent = message; host.dataset.error = String(error); host.hidden = false;
  }
  function dialog(id, title, content) {
    const node = document.createElement('dialog'); node.id = id; node.className = 'hubDialog';
    node.setAttribute('aria-labelledby', `${id}Title`);
    node.innerHTML = `<div class="hubDialogHead"><h2 id="${id}Title"></h2><button type="button" class="hubClose" aria-label="Fermer">×</button></div>${content}`;
    node.querySelector('h2').textContent = title;
    node.querySelector('.hubClose').addEventListener('click', () => node.close());
    document.body.appendChild(node); return node;
  }
  function showDialog(id) {
    document.querySelectorAll('.hubMenu[open]').forEach((menu) => { menu.open = false; });
    $(id).showModal();
  }
  function tokenSession() {
    // The existing session layer is responsible for refreshing workspace credentials.
    return (config.getAccessToken ? config.getAccessToken() : client.getSession(localStorage).then((value) => value?.access_token)).then((token) => {
      if (!token) throw new Error('Connectez-vous à votre compte pour cette action.');
      return token;
    });
  }
  function capturePreview() {
    const controls = {};
    inputIds.forEach((id) => {
      const node = $(id); if (node) controls[id] = node.type === 'checkbox' ? node.checked : node.value;
    });
    const annualFallback = Number(window.OzenoAnnualProductionAssumption?.captureManualFallbackKwh()
      ?? $('annual')?.dataset.manualFallbackKwh);
    controls.annualManualFallbackKwh = Number.isFinite(annualFallback) && annualFallback > 0 ? Math.round(annualFallback) : null;
    controls.annualManualFallbackSource = controls.annualManualFallbackKwh == null ? 'UNKNOWN' : 'MANUAL_ASSUMPTION';
    controls.aciPrestudyBenchmark = $('aciPrice')?.dataset.prestudyBenchmark === 'true';
    const consumption = $('cons');
    if (consumption?.dataset.referenceSource) controls.consReferenceSource = consumption.dataset.referenceSource;
    if (consumption?.dataset.referenceYear) controls.consReferenceYear = consumption.dataset.referenceYear;
    if (consumption?.dataset.referenceValue) controls.consReferenceValue = consumption.dataset.referenceValue;
    const efficiency = {};
    document.querySelectorAll('#efficiencyImpactForm [name]').forEach((node) => { efficiency[node.name] = node.value; });
    const production = config.commercialProductionPreview || {};
    const financial = window.SOLARSHIFT_FINANCIAL_PREVIEW || {};
    const finitePositive = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
    const previousMetrics = !dirty && current?.preview?.portfolioMetrics || {};
    const portfolioMetrics = {
      productionKwh: production.status === 'READY' ? finitePositive(production.annualKwh) : finitePositive(previousMetrics.productionKwh),
      powerKwp: production.status === 'READY' ? finitePositive(production.installedCapacityKwp) : finitePositive(previousMetrics.powerKwp),
      capexEur: financial.status === 'READY'
        ? finitePositive(financial.totalCapexEur ?? financial.capexEur) ?? finitePositive(previousMetrics.capexEur)
        : finitePositive(previousMetrics.capexEur)
    };
    const missionPlan=window.OzenoMissionFinance?.capture()??current?.missionPlan??current?.preview?.missionPlan;
    const savedPlan=current?.missionPlan??current?.preview?.missionPlan;
    const previousMissionPlan=current?.preview?.previousMissionPlan??(savedPlan?.missions?.includes('ACC_MANAGEMENT')?savedPlan:null);
    return { schemaVersion: 1, kind: 'COMMERCIAL_NON_CANONICAL', financialModelVersion: window.SolarShiftCompleteFinancialPolicy?.modelVersion ?? null, controls, portfolioMetrics, ...(missionPlan?{missionPlan}:{}), ...(previousMissionPlan?{previousMissionPlan}:{}),
      missionRemuneration:window.OzenoMissionFinance?.captureRemuneration()??(financial.status==='READY'?financial.missionRemuneration??null:null),
      commercialRemuneration: window.SOLARSHIFT_INSTALLER_COMMISSION_PREVIEW || null, roofs: window.OzenoRoofSurfaces?.captureDraft() || {}, parcelQualification: window.OzenoParcelQualification?.capture() || null, accCollective: current?.preview?.accCollective ? structuredClone(current.preview.accCollective) : null, risks: window.OzenoRiskDraft?.capture() || [], buildingEnergy: window.OzenoBuildingEnergyPrestudy?.capture() || null, financingMode: document.querySelector('[name="financingMode"]:checked')?.value || 'mixed', efficiency };
  }
  function syncActivityQualification() {
    const form = $('hubSaveForm');
    if (!form) return;
    const known = form.elements.activityKnowledge.value === 'KNOWN';
    $('hubActivityDetails').hidden = !known;
    form.elements.activityLabel.required = known;
    if (!known) form.elements.activityLabel.value = '';
  }
  function studyLocation() {
    return client.captureSiteLocation(config, $('dashAddress')?.textContent || '');
  }
  async function applyRecord(record) {
    if (record.scope === 'cloud' && typeof config.openCanonicalProject === 'function'
      && (!config.projectContextLoaded || config.projectContext?.id !== record.id)) {
      await config.openCanonicalProject(record.id);
    }
    await window.SOLARSHIFT_COMPLETE_FINANCE_READY;
    if (window.OzenoAnnualProductionAssumption) window.OzenoAnnualProductionAssumption.resetForProject();
    else {
      config.commercialProductionPreview = null;
      const annual = $('annual');
      if (annual) { annual.value = ''; delete annual.dataset.manualFallbackKwh; annual.dataset.productionSource = 'UNKNOWN'; }
    }
    config.commercialCarbonImpactPreview = null;
    current = record; restoring = true;
    const missionPlan=record.missionPlan??record.preview?.missionPlan??null;
    window.OZENO_MISSION_CONTEXT={missionPlan,project:{id:record.id,name:record.name,address:record.address},historical:!missionPlan,remuneration:record.preview?.missionRemuneration};
    window.OzenoMissionFinance?.restore(missionPlan,{project:window.OZENO_MISSION_CONTEXT.project,historical:!missionPlan,remuneration:record.preview?.missionRemuneration});
    try {
      if (record.scope === 'local') {
        Object.assign(config, { canonicalConnectionExpected: false, projectId: null, projectContext: null, projectCoordinates: null, projectContextLoaded: false, scenarioId: null, scenarioStatus: null, pvProfile: null, loadProfile: null, scenarioProfileRefs: {}, scenarioBenchmarkRefs: {}, energyProfiles: [], scenarios: [] });
        $('canonicalSummary')?.setAttribute('hidden', 'hidden');
        $('workspaceOpen')?.setAttribute('hidden', 'hidden');
      }
      config.commercialDraftId = record.scope === 'local' ? record.id : null;
      const canonicalSite = record.scope === 'cloud' && config.projectContextLoaded
        ? { ...config.projectContext, address: config.projectSiteContext?.address || config.projectContext?.address }
        : null;
      Object.assign(config, client.restoreSiteLocation(record, canonicalSite));
      document.querySelectorAll('.projects button[data-p]').forEach((button) => button.classList.remove('active'));
      if ($('dashAddress')) $('dashAddress').textContent = record.address || 'Site à localiser';
      if ($('newProjectAddress')) $('newProjectAddress').value = record.address || '';
      if ($('newProjectName')) $('newProjectName').value = record.name;
      if ($('ozenoWorkspaceTitle')) $('ozenoWorkspaceTitle').textContent = record.name;
      if ($('ozenoProjectName')) $('ozenoProjectName').textContent = record.name;
      config.projectIdentity = {
        clientName: record.clientName || '', companyName: record.companyName || '', siret: record.siret || '', contactName: record.contactName || '', phone: record.phone || '',
        installerName: record.installerName || '', installationDate: record.installationDate || '',
        activityLabel: record.preview?.siteQualification?.activityLabel || ''
      };
      window.dispatchEvent(new CustomEvent('ozeno:project-context-loaded', { detail: {
        projectId: config.projectId, draftId: config.commercialDraftId,
        name: record.name, address: record.address || '',
        clientName: record.clientName || '', companyName: record.companyName || '', siret: record.siret || '', contactName: record.contactName || '', phone: record.phone || '', email: record.email || '',
        installerName: record.installerName || '', installationDate: record.installationDate || '',
        activityKnowledge: record.preview?.siteQualification?.activityKnowledge || 'UNKNOWN',
        activityLabel: record.preview?.siteQualification?.activityLabel || '',
        status: commercialStatusLabels[commercialStatusOf(record)], scope: record.scope
      } }));
      if (record.scope === 'local') window.dispatchEvent(new CustomEvent('ozeno:canonical-context', { detail: { projectId: null, ready: false } }));
      window.OzenoSiteLocationUI?.sync();
      window.solarMap?.closePopup();
      // Public demo markers must not switch away from a saved dossier or clear its roofs.
      if (typeof marks !== 'undefined') Object.values(marks).forEach((marker) => window.solarMap?.removeLayer(marker));
      window.OzenoProjectMarker?.remove();
      if (record.latitude != null) {
        window.solarMap?.setView([record.latitude, record.longitude], 19);
        const popup = element('div', `${record.name} · ${record.address || 'Site localisé'}`);
        window.OzenoProjectMarker = L.marker([record.latitude, record.longitude]).addTo(window.solarMap).bindPopup(popup);
      }
      else window.roofGroup?.clearLayers();
      const preview = record.preview?.schemaVersion === 1 ? record.preview : emptyPreview;
      const annualFallback = preview.controls?.annualManualFallbackSource === 'MANUAL_ASSUMPTION'
        ? preview.controls.annualManualFallbackKwh
        : null;
      if (window.OzenoAnnualProductionAssumption) window.OzenoAnnualProductionAssumption.restoreManualFallback(annualFallback);
      else if ($('annual')) {
        const value = Number(annualFallback);
        $('annual').value = Number.isFinite(value) && value > 0 ? String(Math.round(value)) : '';
        $('annual').dispatchEvent(new Event('input', { bubbles: true }));
      }
      // Legacy drafts did not persist these fields: reset them rather than leaking
      // another project's activity, prices or cost mode into the reopened record.
      ['prestudyBuildingType', 'prestudyWarehouseSubtype', 'prestudyIndustrySchedule', 'prestudyExactPowerKva', 'prestudyPowerBand', 'prestudyGridPrice', 'prestudyGridPriceBasis', 'capexReferenceMode', 'capexInstallationType'].forEach((id) => {
        const node = $(id);
        if (node) node.value = emptyPreview?.controls?.[id] ?? '';
      });
      for (const id of inputIds) {
        const node = $(id); const value = preview.controls?.[id];
        if (!node) continue;
        if (value == null) { if(node.type==='checkbox'&&node.dataset.completeFinancialToggle)node.checked=false; if (id.startsWith('fullFinance_') || id==='fullConnectionEur') node.value=node.dataset.modelDefault ?? ''; if (id==='completeSaleMode') node.value='MIXED'; if (id==='fullQuoteScope') node.value=(preview.controls?.capexReferenceMode==='manual' || (preview.controls?.capexReferenceMode==null && preview.controls?.capexPerKwp!=null))?'UNSPECIFIED':'EPC'; continue; }
        if (node.type === 'checkbox') node.checked = Boolean(value);
        else node.value = id === 'panelArea' && Number(value) === 2 ? '2.211' : safeText(value);
      }
      if (preview.controls?.capexReferenceMode == null && $('capexReferenceMode')) {
        // A historic unit price may come from a quote: preserve it, never guess.
        $('capexReferenceMode').value = preview.controls?.capexPerKwp != null ? 'manual' : 'benchmark';
      }
      const aci = $('aciPrice'), acc = $('accPrice');
      if (aci) {
        aci.dataset.manualPrice = preview.controls?.aciPrestudyBenchmark ? '' : safeText(preview.controls?.aciPrice ?? '');
        if (preview.controls?.aciPrestudyBenchmark) aci.dataset.prestudyBenchmark = 'true';
        else delete aci.dataset.prestudyBenchmark;
      }
      if (acc) acc.dataset.manualPrice = safeText(preview.controls?.accPrice ?? '');
      const consumption = $('cons');
      if (consumption) {
        if (preview.controls?.consReferenceSource) consumption.dataset.referenceSource = safeText(preview.controls.consReferenceSource);
        else delete consumption.dataset.referenceSource;
        if (preview.controls?.consReferenceYear) consumption.dataset.referenceYear = safeText(preview.controls.consReferenceYear);
        else delete consumption.dataset.referenceYear;
        if (preview.controls?.consReferenceSource) consumption.dataset.referenceValue = safeText(preview.controls.consReferenceValue ?? consumption.value);
        else delete consumption.dataset.referenceValue;
      }
      if (preview.controls?.irveChargerCount == null && Number(preview.controls?.irvePowerKw) > 0) {
        const legacyPower = Number(preview.controls.irvePowerKw);
        $('irveChargerCount').value = '1';
        const standard = ['7.4', '11', '22'].find((value) => Math.abs(Number(value) - legacyPower) < .05);
        $('irvePowerPerChargerKw').value = standard || 'custom';
        if (!standard) $('irveCustomPowerKw').value = String(legacyPower);
      }
      const savedSurplusMode = preview.controls?.gridPriceMode;
      const savedSurplusPrice = preview.controls?.gridPrice;
      if (savedSurplusPrice != null && (savedSurplusMode === 'contract' || savedSurplusMode == null)) {
        // Legacy drafts stored a free-form price without a sale framework or source.
        // Preserve it as a contract assumption, but require the user to document it.
        $('gridPrice')?.setAttribute('data-contract-price', safeText(savedSurplusPrice));
        if (savedSurplusMode == null && $('gridPriceMode')) $('gridPriceMode').value = 'contract';
      }
      document.querySelectorAll('#efficiencyImpactForm [name]').forEach((node) => { node.value = safeText(preview.efficiency?.[node.name]); });
      if ($('efficiencyImpactResults')) $('efficiencyImpactResults').hidden = true;
      if ($('efficiencyImpactStatus')) $('efficiencyImpactStatus').textContent = 'Vérifiez les valeurs et recalculez l’aperçu CO₂ / CEE de ce dossier.';
      const funding = document.querySelector(`[name="financingMode"][value="${preview.financingMode === 'equity' ? 'equity' : 'mixed'}"]`);
      if (funding) { funding.checked = true; funding.dispatchEvent(new Event('change', { bubbles: true })); }
      window.OzenoRoofSurfaces?.restoreDraft(preview.roofs);
      window.OzenoRiskDraft?.restore(preview.risks);
      window.OzenoBuildingEnergyPrestudy?.restore(preview.buildingEnergy);
      await config.parcelQualificationReady;
      window.OzenoParcelQualification?.restore(preview.parcelQualification);
      const roofInputs = new Set(['roofTotal', 'roofRatio', 'panelArea', 'panelWp', 'pvgisSystemLoss', 'manualAzimuth', 'orientation', 'tilt', 'shade', 'roof', 'capexPerKwp', 'aciPrice', 'accPrice']);
      for (const id of inputIds) {
        // restoreDraft already restores measured/manual provenance. An input event on
        // roofTotal would wrongly convert a mapped, multi-pan roof to a manual total.
        if (roofInputs.has(id)) continue;
        const node = $(id); if (node) node.dispatchEvent(new Event(node.type === 'checkbox' || node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      }
      $('reportRefresh')?.click();
      // Recalculate once all restored fields and their derived price handlers agree.
      window.sim?.();
      window.dispatchEvent(new CustomEvent('ozeno:recalculate-roof-preview'));
      if (record.scope === 'local' && record.latitude == null && record.longitude == null && record.address && $('newProjectAddress')?.value.trim()) {
        // A saved address label is not a geocoded map position. Re-request the official
        // suggestions so the user can explicitly select the correct site on reopen.
        window.setTimeout(() => {
          if (current?.id === record.id && current.scope === record.scope) {
            const addressInput = $('newProjectAddress');
            if (addressInput) {
              addressInput.dataset.suppressProjectDirty = 'true';
              addressInput.dispatchEvent(new Event('input', { bubbles: true }));
              delete addressInput.dataset.suppressProjectDirty;
            }
          }
        }, 0);
      }
      const params = new URLSearchParams({ [record.scope === 'local' ? 'draftId' : 'projectId']: record.id });
      if (window.OzenoPrestudyShell) window.OzenoPrestudyShell.preserveUrl(params);
      else history.replaceState(null, '', `${location.pathname}?${params}`);
      notice(`${record.name} · ${record.scope === 'local' ? 'brouillon local, enregistré uniquement dans ce navigateur' : 'projet du compte, aperçu commercial non canonique'}.`);
    } finally { restoring = false; dirty = false; notifyShellStatus(); }
    if (!dashboard && installerNetwork) installerNetwork.attachProjectSuggestions(current, current?.organizationId);
  }
  function cancelSaveAddressAutocomplete() {
    clearTimeout(saveAddressAutocompleteTimer);
    saveAddressAutocompleteController?.abort();
    saveAddressAutocompleteController = null;
    saveAddressAutocompleteRequest++;
  }
  function bindSaveAddressAutocomplete(form) {
    const input = form.elements.address;
    const suggestions = $('hubAddressSuggestions');
    const status = $('hubAddressAutocompleteStatus');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', 'hubAddressSuggestions');
    input.addEventListener('input', async () => {
      cancelSaveAddressAutocomplete();
      saveAddressSelection = null;
      suggestions.replaceChildren(); suggestions.hidden = true;
      const query = input.value.trim();
      if (saveMode !== 'new') { status.textContent = 'Pour modifier l’adresse d’un dossier existant, utilisez sa recherche sur la carte.'; return; }
      if (query.length < 4) { status.textContent = ''; return; }
      const request = saveAddressAutocompleteRequest;
      const { parseCoordinatePair } = await import('./site-address.mjs?v=20261110-location-restore-2');
      if (request !== saveAddressAutocompleteRequest || input.value.trim() !== query) return;
      const coordinates = parseCoordinatePair(query);
      if (coordinates) {
        saveAddressSelection = { ...coordinates, coordinateSource: 'USER_COORDINATES' };
        input.value = coordinates.label;
        status.textContent = 'Coordonnées GPS reconnues. Elles seront enregistrées avec le projet.';
        return;
      }
      status.textContent = 'Recherche d’adresses officielles…';
      saveAddressAutocompleteTimer = window.setTimeout(async () => {
        try {
          const { siteAddressAutocompleteUrl, normalizeSiteAddressSuggestion } = await import('./site-address.mjs?v=20261110-location-restore-2');
          if (request !== saveAddressAutocompleteRequest) return;
          const controller = new AbortController(); saveAddressAutocompleteController = controller;
          const response = await fetch(siteAddressAutocompleteUrl(query), { signal: controller.signal, headers: { 'Accept-Language': 'fr' } });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const payload = await response.json();
          if (request !== saveAddressAutocompleteRequest || input.value.trim() !== query) return;
          const results = (Array.isArray(payload.results) ? payload.results : []).map(normalizeSiteAddressSuggestion).filter(Boolean);
          if (!results.length) {
            status.textContent = 'Adresse non reconnue. Vous pourrez placer le repère sur la carte à l’étape Localisation.';
            return;
          }
          suggestions.replaceChildren(...results.map((result) => {
            const option = document.createElement('button');
            option.type = 'button'; option.setAttribute('role', 'option'); option.textContent = result.label;
            option.addEventListener('click', () => {
              cancelSaveAddressAutocomplete();
              saveAddressSelection = result; input.value = result.label;
              suggestions.replaceChildren(); suggestions.hidden = true;
              status.textContent = 'Adresse officielle sélectionnée. Le point géographique sera enregistré avec le projet.';
            });
            return option;
          }));
          suggestions.hidden = false;
          status.textContent = 'Choisissez l’adresse la plus précise dans les suggestions :';
        } catch (error) {
          if (error.name !== 'AbortError' && request === saveAddressAutocompleteRequest) {
            status.textContent = 'Suggestions temporairement indisponibles. Vous pouvez conserver cette adresse comme indication et localiser le site après création.';
          }
        }
      }, 400);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !suggestions.hidden) { suggestions.replaceChildren(); suggestions.hidden = true; }
    });
    $('hubSaveDialog').addEventListener('close', cancelSaveAddressAutocomplete);
  }
  function buildSaveDialog() {
    dialog('hubSaveDialog', 'Enregistrer le projet', `<form id="hubSaveForm">
      <p class="hubMuted" id="hubSaveDescription"></p>
      <div class="hubFields">
        <label class="hubFull">Nom du projet (obligatoire)<input name="name" required maxlength="200" autocomplete="off" autofocus></label>
        <label class="hubFull">Adresse ou GPS<div class="hubAddressControl"><input name="address" maxlength="500" autocomplete="street-address" placeholder="Adresse, ville ou 48.95990, 1.82077"><button type="button" class="hubGeolocation" id="hubAddressGeolocate" aria-label="Utiliser ma position actuelle" title="Utiliser ma position actuelle"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/></svg></button></div><div id="hubAddressSuggestions" class="hubAddressSuggestions" role="listbox" hidden></div><small id="hubAddressHelp"></small><small id="hubAddressAutocompleteStatus" role="status"></small></label>
        <label class="hubFull">Nom du client<input name="clientName" maxlength="200" autocomplete="organization"></label>
        <label>Société (personne morale)<input name="companyName" maxlength="200" autocomplete="organization"></label>
        <label>SIRET<input name="siret" inputmode="numeric" maxlength="17" placeholder="14 chiffres" autocomplete="off"><small>Facultatif · établissement à confirmer.</small></label>
        <label class="hubFull">Personne de contact<input name="contactName" maxlength="200" autocomplete="name"></label>
        <label>Téléphone<input name="phone" type="tel" maxlength="80" autocomplete="tel"></label>
        <label>Adresse e-mail<input name="email" type="email" maxlength="254" autocomplete="email"></label>
        <label>Installateur pressenti<input name="installerName" maxlength="200" autocomplete="off"><small>Repère de suivi, sans attribution de droits d’accès.</small></label>
        <label>Date prévue d’installation<input name="installationDate" type="date"></label>
        <fieldset class="hubFull" id="hubActivityQualification"><legend>Activité du site</legend>
          <label>Connaissez-vous l’activité de l’établissement ?<select name="activityKnowledge"><option value="UNKNOWN">Je ne la connais pas encore</option><option value="KNOWN">Je la connais</option></select></label>
          <label id="hubActivityDetails" hidden>Activité(s) ou secteur(s) présents (ex. bureaux, stockage, fabrication)<input name="activityLabel" maxlength="200" autocomplete="off"><small>Pour un site multi-locataires, indiquez les principales activités séparées par des virgules. Déclaration à confirmer ; elle ne déduit ni le contrat ni la puissance électrique.</small></label>
        </fieldset>
        <label class="hubFull">Enregistrement<select name="destination"><option value="local">Brouillon local · ce navigateur</option><option value="cloud">Projet du compte connecté</option></select></label>
        <label class="hubFull" id="hubOrganizationLabel" hidden>Organisation<select name="organization"></select></label>
        <label class="hubFull" id="hubExistingProjectLabel" hidden>Dossier du compte à mettre à jour<select name="existingProject"></select><small>Le brouillon local reste conservé. Une sauvegarde des deux versions est téléchargée avant la mise à jour du dossier.</small></label>
      </div>
      <p class="hubMuted" id="hubSaveScope"></p><p class="hubFormError" id="hubSaveError" role="alert"></p>
      <div class="hubActions"><button type="button" class="hubSecondary" data-close-save>Annuler</button><button class="hubPrimary" type="submit" id="hubSaveConfirm">Enregistrer le projet</button><button class="hubSecondary" type="button" id="hubSaveAndReturn" hidden>Enregistrer et quitter</button></div>
    </form>`);
    const form = $('hubSaveForm');
    bindSaveAddressAutocomplete(form);
    $('hubAddressGeolocate').addEventListener('click', () => {
      const button = $('hubAddressGeolocate'), input = form.elements.address, status = $('hubAddressAutocompleteStatus');
      if (!navigator.geolocation) { status.textContent = 'La géolocalisation n’est pas disponible dans ce navigateur.'; return; }
      button.disabled = true; status.textContent = 'Localisation…';
      navigator.geolocation.getCurrentPosition(position => {
        const { latitude, longitude } = position.coords;
        const label = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        cancelSaveAddressAutocomplete();
        saveAddressSelection = { label, latitude, longitude, coordinateSource: 'BROWSER_GEOLOCATION', precision: 'DEVICE_POSITION' };
        input.value = label; $('hubAddressSuggestions').replaceChildren(); $('hubAddressSuggestions').hidden = true;
        status.textContent = 'Position GPS sélectionnée. Elle sera enregistrée avec le projet.';
        button.disabled = false;
      }, error => {
        status.textContent = error.code === 1 ? 'Autorisez la localisation dans le navigateur puis réessayez.' : 'Position indisponible. Saisissez des coordonnées GPS ou réessayez.';
        button.disabled = false;
      }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 });
    });
    $('hubSaveAndReturn').addEventListener('click', () => {
      leaveToDashboardAfterSave = true;
      form.requestSubmit();
    });
    form.elements.activityKnowledge.onchange = syncActivityQualification;
    $('hubSaveDialog').addEventListener('close', () => {
      leaveToDashboardAfterSave = false;
      if (!finalWorkspaceSaving) finalWorkspaceTarget = null;
      finalWorkspaceSaving = false;
    });
    form.querySelector('[data-close-save]').onclick = () => $('hubSaveDialog').close();
    form.elements.destination.onchange = updateSaveScope;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const returnToDashboardAfterSave = !dashboard && leaveToDashboardAfterSave;
      $('hubSaveError').textContent = ''; $('hubSaveConfirm').disabled = true;
      try {
        const isNew = saveMode === 'new';
        const selectedAddress = saveAddressSelection && saveAddressSelection.label === form.elements.address.value.trim() ? saveAddressSelection : null;
        const locationData = isNew ? {
          latitude: selectedAddress?.latitude ?? saveSeed?.latitude ?? null,
          longitude: selectedAddress?.longitude ?? saveSeed?.longitude ?? null,
          coordinateSource: selectedAddress?.coordinateSource || saveSeed?.coordinateSource || '',
          addressReference: selectedAddress ? {
            label: selectedAddress.label, address: selectedAddress.address, city: selectedAddress.city,
            postalCode: selectedAddress.postalCode, cityCode: selectedAddress.cityCode,
            coordinateSource: selectedAddress.coordinateSource, precision: selectedAddress.precision
          } : saveSeed?.addressReference || null
        } : studyLocation();
        const prospectSeed = isNew && saveSeed?.prospectingSnapshot ? saveSeed : null;
        let data = { ...locationData, preview: isNew ? structuredClone(emptyPreview) : capturePreview(), commercialStatus: isNew ? 'IN_PROGRESS' : commercialStatusOf(current), crmStage: isNew ? 'QUALIFICATION' : crmStageOf(current), crmArchived: isNew ? false : crmArchivedOf(current), crmStageHistory: isNew ? [] : (current?.crmStageHistory || []), crmStageChangedAt: isNew ? '' : (current?.crmStageChangedAt || ''), plannedActions: isNew ? [] : (current?.plannedActions || []), operationMode: isNew ? (saveSeed?.operationMode || 'UNSPECIFIED') : operationModeOf(current), managementContractStatus: isNew ? (saveSeed?.managementContractStatus || 'UNSPECIFIED') : (current?.managementContractStatus || 'UNSPECIFIED'), ...(isNew&&missionTools?{missionPlan:missionTools.createMissionPlan()}:{}), ...(isNew && saveSeed?.pipelineCategory ? { pipelineCategory: saveSeed.pipelineCategory } : {}), ...(prospectSeed ? { prospectKey: prospectSeed.prospectKey, prospectStatus: 'PENDING_MANDATAIRE_REVIEW' } : current?.prospectKey ? { prospectKey: current.prospectKey, prospectStatus: current.prospectStatus } : {}) };
        if (isNew && saveSeed?.parcelQualification) data.preview.parcelQualification = structuredClone(saveSeed.parcelQualification);
        if (prospectSeed) data.preview.obiProspecting = structuredClone(prospectSeed.prospectingSnapshot);
        else if (!isNew && current?.preview?.obiProspecting) data.preview.obiProspecting = structuredClone(current.preview.obiProspecting);
        const prospecting = (isNew ? saveSeed?.pipelineCategory : current?.pipelineCategory) === 'PROSPECTING';
        if (!prospecting) data.preview.siteQualification = {
          activityKnowledge: form.elements.activityKnowledge.value,
          activityLabel: form.elements.activityKnowledge.value === 'KNOWN' ? form.elements.activityLabel.value.trim() : '',
          source: 'MANDATAIRE_DECLARATION'
        };
        metadataFields.forEach((key) => { data[key] = form.elements[key].value; });
        let saved, reopeningError = '';
        const existing = isNew ? null : current;
        if (form.elements.destination.value === 'cloud') {
          const token = await tokenSession();
          let target = existing?.scope === 'cloud' ? existing : null;
          if (existing?.scope === 'local' && form.elements.existingProject.value) {
            const rows = await client.cloudProjects(token, form.elements.existingProject.value);
            target = rows[0] ? flatten(rows[0]) : null;
            if (!target) throw new Error('Le dossier choisi n’est plus accessible.');
            const transfer = await import('./project-transfer.mjs');
            // A transfer of an unchanged draft copies its saved snapshot, including fallback
            // assumptions which a live provider refresh may currently hide in the form.
            const transferSource = !dirty ? { ...data, preview: structuredClone(existing.preview) } : data;
            data = transfer.mergeProjectTransfer(transferSource, target, { localDraftId: existing.id, localVersion: existing.version });
            transfer.downloadTransferBackup(existing, target, data);
          }
          saved = flatten(await client.saveCloudProject(token, data, { projectId: target?.id || null, organizationId: form.elements.organization.value || null, expectedVersion: target?.version || 0 }));
          if (!dashboard && !returnToDashboardAfterSave && existing?.scope !== 'cloud') {
            try { await config.openCanonicalProject(saved.id); }
            catch (error) { reopeningError = error.message; }
          }
        } else {
          const targetStore = existing?.scope === 'local'
            ? client.draftStoreForRecord(store, deviceStore, existing.id)
            : store;
          saved = targetStore.save(data, { id: existing?.scope === 'local' ? existing.id : null, expectedVersion: existing?.scope === 'local' ? existing.version : 0 });
        }
        if (finalWorkspaceTarget) finalWorkspaceSaving = true;
        if ($('hubSaveDialog').open) $('hubSaveDialog').close();
        if (finalWorkspaceTarget) {
          const workspace = new URL('./workspace.html', location.href);
          workspace.searchParams.set('projectId', saved.id);
          const target = finalWorkspaceTarget;
          finalWorkspaceTarget = null;
          finalWorkspaceSaving = false;
          dirty = false;
          notifyShellStatus();
          if (saved.scope !== 'cloud') {
            notice('Pré-étude enregistrée dans ce navigateur. Pour ouvrir le Workspace, enregistrez le projet dans le compte connecté.');
            window.dispatchEvent(new CustomEvent('ozeno:final-workspace-save-failed', { detail: { message: 'Pré-étude enregistrée sur cet appareil ; le Workspace du compte nécessite un enregistrement dans le compte connecté.' } }));
            return;
          }
          // Preserve the caller’s preview flags while binding the Workspace to the saved project.
          const requested = new URL(target, location.href);
          requested.searchParams.forEach((value, key) => {
            if (key !== 'projectId') workspace.searchParams.set(key, value);
          });
          location.assign(workspace.href);
          return;
        }
        if (dashboard && prospectSeed) {
          if (saved.scope === 'cloud') cloudRecords = [...cloudRecords.filter((record) => record.id !== saved.id), saved];
          renderDashboard();
          if (prospectingMode !== 'pv') renderObiCandidatePage();
          saveSeed = null;
          prospectSeed.onSaved?.(saved);
          notice(`Prospect ajouté à la liste « En prospection » · vérification mandataire en attente · ${saved.scope === 'cloud' ? 'accessible dans le compte' : 'enregistré dans ce navigateur uniquement'}.`);
          return;
        }
        if (dashboard) location.href = projectPrestudyHref(saved);
        else if (returnToDashboardAfterSave) {
          dirty = false;
          if (!OOI_LOCAL_PREVIEW) location.assign(new URL('./projects.html', location.href).href);
          else location.assign(preserveOoiLocalPreview(new URL('./projects.html', location.href).href));
          return;
        }
        else {
          // A save does not need to reload the study and lose a pending map edit.
          if (isNew || !existing || existing.scope !== saved.scope) await applyRecord(saved);
          else {
            current = saved; dirty = false;
            if ($('ozenoWorkspaceTitle')) $('ozenoWorkspaceTitle').textContent = saved.name;
            if ($('ozenoProjectName')) $('ozenoProjectName').textContent = saved.name;
            config.projectIdentity = {
              clientName: saved.clientName || '', companyName: saved.companyName || '', siret: saved.siret || '', contactName: saved.contactName || '', phone: saved.phone || '',
              installerName: saved.installerName || '', installationDate: saved.installationDate || '',
              activityLabel: saved.preview?.siteQualification?.activityLabel || ''
            };
            window.dispatchEvent(new CustomEvent('ozeno:project-context-loaded', { detail: {
              projectId: saved.scope === 'cloud' ? saved.id : null, draftId: saved.scope === 'local' ? saved.id : null,
              name: saved.name, address: saved.address || '',
              clientName: saved.clientName || '', companyName: saved.companyName || '', siret: saved.siret || '', contactName: saved.contactName || '', phone: saved.phone || '', email: saved.email || '',
              installerName: saved.installerName || '', installationDate: saved.installationDate || '',
              activityKnowledge: saved.preview?.siteQualification?.activityKnowledge || 'UNKNOWN',
              activityLabel: saved.preview?.siteQualification?.activityLabel || '',
              scope: saved.scope
            } }));
            const savedParams = new URLSearchParams({ [saved.scope === 'local' ? 'draftId' : 'projectId']: saved.id });
            if (window.OzenoPrestudyShell) window.OzenoPrestudyShell.preserveUrl(savedParams);
            else history.replaceState(null, '', `${location.pathname}?${savedParams}`);
            notifyShellStatus();
            notice(`${saved.name} enregistré · ${saved.scope === 'local' ? 'dans ce navigateur uniquement' : 'dans votre compte'} · version ${saved.version}.`);
          }
          if (reopeningError) notice(`Projet enregistré dans votre compte, mais ses données de référence n’ont pas pu être chargées : ${reopeningError}. Retrouvez-le dans le tableau de bord.`, true);
        }
      } catch (error) {
        if (finalWorkspaceTarget) {
          finalWorkspaceTarget = null;
          notice(`Enregistrement impossible : ${error.message}. La pré-étude est conservée à l’écran ; réessayez après correction.`, true);
          window.dispatchEvent(new CustomEvent('ozeno:final-workspace-save-failed', { detail: { message: `Enregistrement impossible : ${error.message}. La pré-étude est restée ouverte.` } }));
        } else $('hubSaveError').textContent = `Enregistrement impossible : ${error.message}`;
      }
      finally { $('hubSaveConfirm').disabled = false; }
    });
  }
  function updateSaveScope() {
    const form = $('hubSaveForm'); const cloud = form.elements.destination.value === 'cloud';
    $('hubOrganizationLabel').hidden = !cloud || (saveMode !== 'new' && current?.scope === 'cloud');
    const matches = cloudRecords.filter(record => current?.scope === 'local' && record.name?.trim().toLowerCase() === current.name?.trim().toLowerCase() && record.address?.trim().toLowerCase() === current.address?.trim().toLowerCase());
    $('hubExistingProjectLabel').hidden = !cloud || saveMode === 'new' || !matches.length;
    const previousTarget = form.elements.existingProject.value;
    form.elements.existingProject.replaceChildren(...matches.map(record => { const option = element('option', `${record.name} · version ${record.version}`); option.value = record.id; return option; }));
    if (matches.length > 1 && matches.some(record => record.id === previousTarget)) form.elements.existingProject.value = previousTarget;
    if ($('hubExistingProjectLabel').hidden) form.elements.existingProject.replaceChildren();
    if (!$('hubExistingProjectLabel').hidden) $('hubOrganizationLabel').hidden = true;
    form.elements.organization.required = !$('hubOrganizationLabel').hidden;
    $('hubSaveScope').textContent = cloud
      ? 'Accessible après connexion, selon les droits du dossier. Les contours et hypothèses restent un aperçu commercial, distinct des données validées.'
      : 'Stocké sur cet appareil uniquement. Ce brouillon n’est ni partagé ni protégé par les droits du compte. Évitez les coordonnées sensibles sur un ordinateur partagé.';
  }
  function openSave(mode = 'current', seed = null, { silent = false } = {}) {
    if (mode === 'new' && dirty && !window.confirm('Le dossier ouvert contient des modifications non enregistrées. Commencer un nouveau projet sans les enregistrer ?')) return;
    if (mode !== 'new' && current?.scope === 'cloud' && config.canonicalConnectionExpected && !config.projectContextLoaded) {
      leaveToDashboardAfterSave = false;
      notice('Le projet du compte doit terminer son chargement avant l’enregistrement.', true); return;
    }
    saveMode = mode;
    saveSeed = mode === 'new' ? seed : null;
    $('hubSaveAndReturn').hidden = dashboard || mode === 'new';
    cancelSaveAddressAutocomplete(); saveAddressSelection = null;
    const form = $('hubSaveForm'); form.reset(); $('hubSaveError').textContent = '';
    $('hubAddressSuggestions').replaceChildren(); $('hubAddressSuggestions').hidden = true;
    $('hubAddressAutocompleteStatus').textContent = mode === 'new'
      ? ''
        : 'Modifiez l’adresse à l’étape 1. Pour corriger le repère, cliquez sur « Modifier sur la carte », puis sur l’emplacement souhaité, ou saisissez des coordonnées GPS.';
    const record = mode === 'new' ? (seed || {}) : current || {};
    const prospecting = record.pipelineCategory === 'PROSPECTING';
    $('hubActivityQualification').hidden = prospecting;
    const qualification = mode === 'new' ? null : current?.preview?.siteQualification;
    form.elements.activityKnowledge.value = qualification?.activityKnowledge === 'KNOWN' ? 'KNOWN' : 'UNKNOWN';
    form.elements.activityLabel.value = qualification?.activityLabel || '';
    syncActivityQualification();
    const local = mode === 'new' ? {} : studyLocation();
    metadataFields.forEach((key) => { form.elements[key].value = safeText(key === 'address' ? local.address || record.address : record[key]); });
    form.elements.address.readOnly = mode !== 'new';
    $('hubAddressGeolocate').hidden = mode !== 'new';
    $('hubAddressHelp').textContent = mode === 'new'
      ? ''
        : 'À l’étape 1, choisissez une adresse reconnue. Pour corriger le repère, cliquez sur « Modifier sur la carte », puis sur l’emplacement souhaité, ou saisissez des coordonnées GPS.';
    if (mode !== 'new' && !form.elements.name.value) form.elements.name.value = $('newProjectName')?.value || config.projectContext?.name || '';
    const prospectingSeed = mode === 'new' && seed?.prospectingSnapshot;
    $('hubSaveDialogTitle').textContent = prospectingSeed ? 'Enregistrer le prospect' : mode === 'new' ? 'Créer un nouveau projet' : 'Enregistrer le projet';
    $('hubSaveDescription').textContent = mode === 'new'
      ? prospectingSeed
        ? 'La fiche complète sera ajoutée à la liste « En prospection ». Les trois thèmes resteront en attente de vérification humaine ; l’adresse postale n’est pas déduite du contour cartographique.'
        : seed?.pipelineCategory === 'PROSPECTING'
        ? 'Création depuis la prospection. Le point GPS est celui du bâtiment repéré et reste à vérifier ; l’adresse postale n’est pas déduite automatiquement.'
        : 'Créez un dossier, puis localisez le site pour commencer son étude. Les modifications non enregistrées du dossier ouvert ne seront pas reprises.'
      : 'Enregistrez les informations de suivi, les surfaces et les hypothèses de cette pré-étude.';
    $('hubSaveConfirm').textContent = prospectingSeed ? 'Enregistrer le prospect' : 'Enregistrer le projet';
    const cloudAvailable = Boolean(identity && !cloudError && (record.scope === 'cloud' || organizations.length));
    form.elements.destination.querySelector('[value="cloud"]').disabled = !cloudAvailable;
    form.elements.destination.value = cloudAvailable && (mode === 'new' || record.scope !== 'local') ? 'cloud' : 'local';
    if (cloudError) $('hubSaveError').textContent = cloudError;
    form.elements.organization.replaceChildren(...organizations.map((organization) => {
      const option = element('option', organization.name); option.value = organization.id; return option;
    }));
    if (organizations.length > 1) { const placeholder = element('option', 'Choisir une organisation'); placeholder.value = ''; form.elements.organization.prepend(placeholder); form.elements.organization.value = ''; }
    updateSaveScope();
    if (!silent) showDialog('hubSaveDialog');
  }
  window.OzenoSaveBeforeFinalWorkspace = (target) => {
    if (!current || current.scope !== 'cloud' && !config.projectId) {
      notice('Enregistrez d’abord le projet dans le compte connecté pour ouvrir le Workspace.', true);
      return false;
    }
    if (current.scope === 'cloud' && config.canonicalConnectionExpected && !config.projectContextLoaded) {
      notice('Le projet du compte doit terminer son chargement avant l’enregistrement.', true);
      return false;
    }
    finalWorkspaceTarget = target;
    openSave('current', null, { silent: true });
    const form = $('hubSaveForm');
    if (!form?.checkValidity()) {
      finalWorkspaceTarget = null;
      notice('Enregistrement impossible : vérifiez les informations obligatoires du projet avant de continuer.', true);
      return false;
    }
    form.requestSubmit();
    return true;
  };
  function buildProfileDialog() {
    dialog('hubProfileDialog', 'Mon profil', '<div id="hubProfileIdentity"></div><form id="hubLoginForm"><label>Adresse e-mail professionnelle<input name="email" type="email" required autocomplete="email" placeholder="vous@entreprise.fr"></label><p class="hubMuted">Utilisez votre compte déjà autorisé. Un lien sécurisé permet de reprendre la même session sur l’ensemble de cet espace.</p><button class="hubPrimary" type="submit">Recevoir un lien de connexion</button></form><p id="hubProfileState" role="status"></p>');
    refreshProfileDialog();
    $('hubLoginForm').onsubmit = async (event) => {
      event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true;
      try {
        const redirect = new URL('./index.html', location.href);
        const params = new URLSearchParams(location.search);
        for (const key of ['projectId', 'draftId']) if (params.has(key)) redirect.searchParams.set(key, params.get(key));
        await client.sendLoginLink(event.target.elements.email.value.trim(), preserveOoiLocalPreview(redirect.href));
        $('hubProfileState').textContent = 'Lien envoyé. Ouvrez-le dans ce navigateur pour terminer la connexion.';
      } catch (error) { $('hubProfileState').textContent = `Connexion impossible : ${error.message}`; }
      finally { button.disabled = false; }
    };
  }
  function refreshProfileDialog() {
    const form = $('hubLoginForm'); const host = $('hubProfileIdentity');
    if (!form || !host) return;
    host.replaceChildren();
    form.hidden = Boolean(identity);
    if (identity) host.append(element('strong', identity.user_metadata?.full_name || identity.user_metadata?.name || 'Compte professionnel'), element('p', identity.email), element('p', 'Les droits sont ceux attribués à votre compte. Le nom de l’installateur ne donne pas accès au dossier.', 'hubMuted'));
  }
  function shareCurrent() {
    $('hubShareLink').hidden = true; $('hubShareCopy').hidden = true;
    try {
      if (!current) throw new Error('Enregistrez d’abord le projet dans votre compte.');
      const url = client.projectLink(current, location.href);
      $('hubShareLink').value = url; $('hubShareLink').hidden = false; $('hubShareCopy').hidden = false;
      $('hubShareState').textContent = `${dirty ? 'Les dernières modifications ne sont pas encore enregistrées. ' : ''}Ce lien n’accorde aucun droit supplémentaire : le destinataire doit être connecté et autorisé sur le projet.${['localhost', '127.0.0.1'].includes(location.hostname) ? ' L’adresse locale de test ne sera accessible sur un autre appareil qu’après déploiement du site.' : ''}`;
    } catch (error) { $('hubShareState').textContent = error.message; }
    showDialog('hubShareDialog');
  }
  function buildNavigation() {
    const nav = document.querySelector('.ozenoHeaderNavigation'); if (!nav) return;
    const menu = (title, items) => {
      const details = element('details', '', 'hubMenu'); const summary = element('summary', title); details.appendChild(summary);
      const list = element('div', '', 'hubMenuItems'); details.appendChild(list);
      items.forEach(([label, action, shellAction]) => { const button = element('button', label); button.type = 'button'; button.onclick = action; if (shellAction) button.dataset.prestudyAction = shellAction; list.appendChild(button); });
      details.addEventListener('toggle', () => { if (details.open) document.querySelectorAll('.hubMenu[open]').forEach((other) => { if (other !== details) other.open = false; }); });
      return details;
    };
    nav.classList.add('hubNavigation');
    // The auth gate can mount its fallback menu before this navigation is ready.
    nav.querySelector('#appAuthControls')?.remove();
    if (!dashboard) {
      nav.appendChild(menu('Projets', [['Nouveau projet', () => openSave('new'), 'new'], ['Enregistrer le projet', () => openSave(), 'save'], ['Partager ce projet', shareCurrent, 'share']]));
      nav.lastElementChild.setAttribute('data-prestudy-project-menu', '');
      const link = element('a', 'Tableau de bord', 'hubDashboardLink'); link.href = preserveOoiLocalPreview('./projects.html');
      nav.appendChild(link);
      dialog('hubLeaveDialog', 'Modifications non enregistrées', `<p class="hubMuted">Vous avez des modifications en attente. Voulez-vous les enregistrer avant de quitter la fiche projet ?</p><div class="hubActions hubLeaveActions"><button type="button" class="hubSecondary" id="hubLeaveCancel">Continuer la modification</button><button type="button" class="hubDiscard" id="hubLeaveDiscard">Quitter sans enregistrer</button><button type="button" class="hubPrimary" id="hubLeaveSave">Enregistrer et quitter</button></div>`);
      $('hubLeaveCancel').onclick = () => $('hubLeaveDialog').close();
      $('hubLeaveDiscard').onclick = () => { dirty = false; location.href = link.href; };
      $('hubLeaveSave').onclick = () => {
        leaveToDashboardAfterSave = true;
        $('hubLeaveDialog').close();
        openSave();
      };
      link.addEventListener('click', (event) => {
        if (!dirty) return;
        event.preventDefault();
        showDialog('hubLeaveDialog');
      });
    }
    const accountMenu = menu(accountDisplayName(), [['Mon profil', () => showDialog('hubProfileDialog')], ['Déconnexion', async () => {
      if (dirty && !window.confirm('Des modifications ne sont pas enregistrées. Voulez-vous vous déconnecter ?')) return;
      try { await client.signOut(localStorage, session ? await tokenSession() : null); location.href = './index.html'; }
      catch (error) { notice(`Session locale supprimée ; déconnexion serveur non confirmée : ${error.message}`, true); }
    }]]);
    accountMenu.classList.add('hubAccountMenu');
    nav.appendChild(accountMenu);
    document.addEventListener('click', (event) => { if (!event.target.closest('.hubMenu')) document.querySelectorAll('.hubMenu[open]').forEach((node) => { node.open = false; }); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') document.querySelectorAll('.hubMenu[open]').forEach((node) => { node.open = false; node.querySelector('summary').focus(); }); });
    window.dispatchEvent(new Event('ozeno:hub-navigation-ready'));
  }
  const dashboardModules = {
    planning: ['Planning', 'Agenda des visites, relances et prochaines échéances des dossiers commerciaux.'],
    revenus: ['Revenus', 'Vue des revenus prévisionnels à construire à partir des scénarios des projets, en distinguant estimations et revenus constatés.'],
    clients: ['Clients', 'Répertoire des clients, de leurs interlocuteurs et des projets associés.'],
    installateurs: ['Partenaires', 'Répertoire des partenaires, de leurs catégories et de leur attribution interne aux dossiers.'],
    'contact-ozeno': ['Contact Ozeno', 'Point de contact avec l’équipe Ozeno et suivi des demandes.'],
    'fiches-techniques': ['Fiches techniques', 'Espace de consultation des équipements et de leurs caractéristiques techniques.'],
    references: ['Références', 'Bibliothèque des références et réalisations pouvant être présentées aux clients.'],
    documentations: ['Documentations', 'Bibliothèque des documents commerciaux, techniques et réglementaires.'],
    'blog-conseils': ['Blog et conseils', 'Espace éditorial Ozeno, avec un module collaboratif interne à envisager dans une prochaine étape.']
  };

  const projectCoordinates = (record) => client?.projectMapCoordinates(record) || null;
  const mappedCoordinates = (record) => Boolean(projectCoordinates(record));
  const mapStatus = (record) => {
    return commercialStatusClasses[commercialStatusOf(record)];
  };
  const matchesProjectFilter = (record, filter) => filter === 'all' || filter === record.scope || filter === crmStageOf(record);
  const formatArea = (value) => `${Number(value).toLocaleString('fr-FR')} m²`;

  function addEsriTiles(map) {
    const template = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    const layer = L.tileLayer(template, {
      attribution: 'Tiles © Esri', maxZoom: 19
    });
    // ArcGIS occasionally drops individual image requests while the map is being
    // resized or many tiles are requested at once. Retry failed tiles through
    // its equivalent hostname so the map does not keep blank squares.
    const retries = new WeakMap();
    layer.on('tileerror', ({ tile, coords }) => {
      const attempt = retries.get(tile) || 0;
      if (attempt >= 2 || !map.hasLayer(layer)) return;
      retries.set(tile, attempt + 1);
      const retryUrl = layer.getTileUrl(coords)
        .replace('server.arcgisonline.com', 'services.arcgisonline.com');
      window.setTimeout(() => {
        if (map.hasLayer(layer) && tile.isConnected) {
          tile.src = `${retryUrl}?ozeno_retry=${attempt + 1}`;
        }
      }, 250 * (attempt + 1));
    });
    layer.addTo(map);
    return layer;
  }

  function projectPopup(record) {
    const content = element('div', '', 'hubMapPopup');
    content.append(element('strong', record.name || 'Projet sans nom'));
    content.append(element('p', record.address || 'Adresse non renseignée'));
    content.append(element('span', commercialStatusLabels[commercialStatusOf(record)], `hubStatus ${mapStatus(record)}`));
    const link = element('a', 'Ouvrir le projet');
    link.href = projectPrestudyHref(record);
    content.append(link);
    return content;
  }

  function updateProjectMap(records) {
    if (!projectMap || !projectMapLayer) return;
    projectMapLayer.clearLayers();
    const located = records.filter(mappedCoordinates);
    $('hubProjectMapEmpty').hidden = located.length > 0;
    located.forEach((record) => {
      const styles = {
        validated: { color: '#2674c8', fillColor: '#3988dc' },
        progress: { color: '#c67818', fillColor: '#e79631' },
        abandoned: { color: '#687a72', fillColor: '#aebbb5' },
        deleted: { color: '#687a72', fillColor: '#aebbb5' }
      }[mapStatus(record)];
      L.circleMarker([Number(record.latitude), Number(record.longitude)], { ...styles, radius: 9, weight: 3, fillOpacity: .98 })
        .bindPopup(projectPopup(record)).addTo(projectMapLayer);
    });
    const uniqueLocations = new Set(located.map((record) => `${Number(record.latitude).toFixed(6)},${Number(record.longitude).toFixed(6)}`));
    if (located.length === 1 || uniqueLocations.size === 1) projectMap.setView([Number(located[0].latitude), Number(located[0].longitude)], 15);
    else if (located.length > 1) projectMap.fitBounds(projectMapLayer.getBounds().pad(.12), { maxZoom: 15 });
    else projectMap.setView([46.5, 2.5], 5);
    setTimeout(() => projectMap.invalidateSize(), 0);
  }

  function setProjectDisplay(mode) {
    if (mode === 'map') {
      if (!window.L) { notice('La carte ne peut pas être chargée. Vérifiez votre connexion puis réessayez.', true); return; }
      $('hubProjectListView').hidden = true;
      $('hubProjectMapView').hidden = false;
      $('hubShowProjectMap').setAttribute('aria-pressed', 'true');
      $('hubShowProjectList').setAttribute('aria-pressed', 'false');
      if (!projectMap) {
        projectMap = L.map('hubProjectMap', { scrollWheelZoom: false }).setView([46.5, 2.5], 5);
        addEsriTiles(projectMap);
        projectMapLayer = L.featureGroup().addTo(projectMap);
      }
      updateProjectMap(dashboardRecords.filter((record) => {
        const query = $('hubSearch').value.toLocaleLowerCase('fr');
        const filter = $('hubFilter').value;
        return matchesProjectFilter(record, filter)
          && [record.name, record.address, record.clientName, record.installerName].some((value) => safeText(value).toLocaleLowerCase('fr').includes(query));
      }));
      return;
    }
    $('hubProjectListView').hidden = false;
    $('hubProjectMapView').hidden = true;
    $('hubShowProjectMap').setAttribute('aria-pressed', 'false');
    $('hubShowProjectList').setAttribute('aria-pressed', 'true');
  }

  function populateProspectingProjects() {
    const select = $('hubProspectingProject');
    const previous = select.value;
    // Archived records may retain coordinates, but must not return as prospecting references.
    const located = dashboardRecords.filter((record) => !crmArchivedOf(record) && mappedCoordinates(record));
    select.replaceChildren();
    const emptyOption = element('option', 'Aucun projet sélectionné'); emptyOption.value = ''; select.append(emptyOption);
    located.forEach((record) => {
      const option = element('option', `${record.name || 'Projet sans nom'}${record.address ? ` · ${record.address}` : ''}`);
      option.value = record.id; select.append(option);
    });
    if (located.some((record) => record.id === previous)) select.value = previous;
    updateProspectingSearchAvailability();
  }

  function selectedProspectingProject() {
    return dashboardRecords.find((record) => record.id === $('hubProspectingProject').value
      && !crmArchivedOf(record) && mappedCoordinates(record));
  }

  function selectedProspectingCenter() {
    if (prospectingAddressSelection) return prospectingAddressSelection;
    const record = selectedProspectingProject();
    return record ? {
      latitude: Number(record.latitude), longitude: Number(record.longitude),
      addressReference: { ...record.addressReference, label: record.addressReference?.label || record.address, precision: record.addressReference?.precision || 'ADDRESS' },
      label: [record.name, record.address].filter(Boolean).join(' · ') || 'Projet de référence'
    } : null;
  }

  function updateProspectingSearchAvailability() {
    const inputText = $('hubProspectingLocation')?.value.trim() || '';
    const hasUnselectedAddress = inputText.length > 0 && !prospectingAddressSelection;
    $('hubProspectingSearch').disabled = prospectingSearchInProgress || hasUnselectedAddress || !selectedProspectingCenter();
    const pickMap = $('hubProspectingPickMap');
    if (pickMap) pickMap.disabled = !selectedProspectingCenter();
  }

  function clearProspectingMinimumAreaError() {
    $('hubProspectingMinArea').removeAttribute('aria-invalid');
    $('hubProspectingMinAreaError').hidden = true;
  }

  function validateProspectingMinimumArea() {
    const input = $('hubProspectingMinArea');
    const error = $('hubProspectingMinAreaError');
    const text = input.value.trim();
    const area = text ? Number(text) : NaN;
    if (!text || !Number.isFinite(area) || area < 1 || area > 100000) {
      input.setAttribute('aria-invalid', 'true');
      error.textContent = text ? 'Saisissez une surface comprise entre 1 et 100 000 m².' : '';
      error.hidden = !text;
      input.focus();
      $('hubProspectingState').textContent = text ? error.textContent : '';
      return null;
    }
    clearProspectingMinimumAreaError();
    return area;
  }

  function closeProspectingSuggestions() {
    const list = $('hubProspectingSuggestions');
    if (list) { list.replaceChildren(); list.hidden = true; }
    $('hubProspectingLocation')?.setAttribute('aria-expanded', 'false');
  }

  function renderProspectingSuggestions(results, query) {
    const input = $('hubProspectingLocation'), list = $('hubProspectingSuggestions');
    if (input.value.trim() !== query) return;
    const options = results.map((result) => {
      const suggestion = result.suggestion;
      const button = element('button', suggestion.label, 'hubProspectingSuggestion');
      button.type = 'button'; button.setAttribute('role', 'option');
      button.addEventListener('pointerdown', (event) => event.preventDefault());
      button.addEventListener('click', () => {
        invalidateProspectingResults();
        prospectingAddressSelection = suggestion;
        input.value = suggestion.label;
        closeProspectingSuggestions();
        $('hubProspectingLocationHint').textContent = `Point de référence sélectionné : ${suggestion.label}.`;
        $('hubProspectingResults').hidden = true;
        $('hubProspectingState').textContent = 'Lancez la recherche pour afficher les bâtiments proches de ce lieu.';
        updateProspectingSearchAvailability();
      });
      return button;
    });
    list.replaceChildren(...options);
    list.hidden = options.length === 0;
    input.setAttribute('aria-expanded', String(options.length > 0));
  }

  function bindProspectingLocationAutocomplete() {
    const input = $('hubProspectingLocation');
    input.addEventListener('input', () => {
      invalidateProspectingResults();
      clearTimeout(prospectingAutocompleteTimer);
      prospectingAutocompleteController?.abort();
      prospectingAddressSelection = null;
      prospectingMapPickMode = false;
      $('hubProspectingResults').classList.remove('hubProspectingPicking');
      if (input.value.trim()) $('hubProspectingProject').value = '';
      closeProspectingSuggestions();
      $('hubProspectingResults').hidden = true;
      const query = input.value.trim();
      if (query.length < 3) {
        $('hubProspectingLocationHint').textContent = query ? 'Saisissez au moins 3 caractères pour rechercher une adresse ou un lieu.' : 'Choisissez un projet ou sélectionnez une adresse / un lieu dans les suggestions.';
        updateProspectingSearchAvailability();
        return;
      }
      $('hubProspectingLocationHint').textContent = 'Recherche d’adresses et de lieux…';
      updateProspectingSearchAvailability();
      prospectingAutocompleteTimer = window.setTimeout(async () => {
        const controller = new AbortController(); prospectingAutocompleteController = controller;
        let timeoutHandle, timedOut = false;
        const timeout = new Promise((_, reject) => {
          timeoutHandle = window.setTimeout(() => {
            timedOut = true;
            controller.abort();
            reject(new Error('Délai de réponse dépassé'));
          }, 8000);
        });
        try {
          const { prospectingAutocompleteUrls, normalizeProspectingSuggestion, parseCoordinatePair } = await import('./site-address.mjs?v=20261110-location-restore-2');
          const coordinates = parseCoordinatePair(query);
          if (coordinates) {
            prospectingAddressSelection = coordinates;
            closeProspectingSuggestions();
            $('hubProspectingLocationHint').textContent = `Coordonnées GPS sélectionnées : ${coordinates.label}. Ce point est un repère de prospection, pas une adresse postale.`;
            updateProspectingSearchAvailability();
            return;
          }
          const requests = prospectingAutocompleteUrls(query).map(async (url) => {
            const response = await fetch(url, { signal: controller.signal, headers: { 'Accept-Language': 'fr' } });
            if (!response.ok) {
              const error = new Error(`HTTP ${response.status}`);
              error.status = response.status;
              throw error;
            }
            return response.json();
          });
          const settled = await Promise.race([Promise.allSettled(requests), timeout]);
          const payloads = settled.filter((entry) => entry.status === 'fulfilled').map((entry) => entry.value);
          if (!payloads.length) throw settled[0]?.reason || new Error('Service indisponible');
          const geocodedResults = payloads.flatMap((payload) => Array.isArray(payload.features) ? payload.features : Array.isArray(payload.results) ? payload.results : []);
          const results = geocodedResults
            .map((result) => ({ result, suggestion: normalizeProspectingSuggestion(result) }))
            .filter((entry) => entry.suggestion);
          if (input.value.trim() !== query || controller.signal.aborted) return;
          renderProspectingSuggestions(results, query);
          $('hubProspectingLocationHint').textContent = results.length ? 'Sélectionnez le point le plus proche de la zone à étudier.' : 'Aucun résultat trouvé. Essayez une adresse, une zone d’activité ou une commune.';
        } catch (error) {
          if (input.value.trim() === query) {
            if (timedOut) $('hubProspectingLocationHint').textContent = 'Le service de géocodage tarde à répondre. Réessayez dans un instant ou choisissez un projet existant.';
            else if (error.name !== 'AbortError') {
              $('hubProspectingLocationHint').textContent = error.status
                ? `Le service de géocodage a répondu avec une erreur (HTTP ${error.status}). Réessayez dans un instant ou choisissez un projet existant.`
                : error.name === 'TypeError'
                  ? 'Connexion au service de géocodage impossible. Vérifiez votre connexion puis réessayez.'
                  : 'Le service de géocodage est momentanément indisponible. Réessayez dans un instant ou choisissez un projet existant.';
            }
          }
        } finally {
          clearTimeout(timeoutHandle);
          if (prospectingAutocompleteController === controller) prospectingAutocompleteController = null;
        }
      }, 350);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeProspectingSuggestions();
      if (event.key === 'ArrowDown') $('hubProspectingSuggestions').querySelector('button')?.focus();
    });
    input.addEventListener('blur', () => window.setTimeout(closeProspectingSuggestions, 120));
  }

  function ensureProspectingMap(center, radiusMeters) {
    if (!window.L) return false;
    if (!prospectingMap) {
      prospectingMap = L.map('hubProspectingMap', { scrollWheelZoom: false }).setView([Number(center.latitude), Number(center.longitude)], 15);
      addEsriTiles(prospectingMap);
      prospectingLayer = L.featureGroup().addTo(prospectingMap);
      prospectingMap.on('click', (event) => {
        if (!prospectingMapPickMode) return;
        const latitude = Number(event.latlng?.lat), longitude = Number(event.latlng?.lng);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        const point = { latitude, longitude, precision: 'COORDINATES', label: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` };
        prospectingMapPickMode = false;
        prospectingAddressSelection = point;
        $('hubProspectingProject').value = '';
        $('hubProspectingLocation').value = point.label;
        $('hubProspectingResults').classList.remove('hubProspectingPicking');
        $('hubProspectingLocationHint').textContent = `Point GPS sélectionné sur la carte : ${point.label}. Il sert uniquement de centre de recherche.`;
        $('hubProspectingState').textContent = 'Point de référence modifié. Lancez la recherche pour afficher les bâtiments proches.';
        updateProspectingSearchAvailability();
        ensureProspectingMap(point, Number($('hubProspectingRadius').value));
      });
    }
    prospectingLayer.clearLayers(); prospectingBuildings.clear();
    const coordinates = [Number(center.latitude), Number(center.longitude)];
    const circle = L.circle(coordinates, { radius: radiusMeters, color: '#0b8068', weight: 1.5, fillColor: '#35a588', fillOpacity: .07 });
    circle.addTo(prospectingLayer);
    L.circleMarker(coordinates, { radius: 6, color: '#073f39', fillColor: '#fff', fillOpacity: 1, weight: 2 })
      .bindPopup(element('strong', center.label || 'Centre de recherche')).addTo(prospectingLayer);
    prospectingMap.fitBounds(circle.getBounds(), { padding: [20, 20], maxZoom: 17 });
    setTimeout(() => prospectingMap.invalidateSize(), 0);
    return true;
  }

  function beginProspectingMapPick() {
    const center = selectedProspectingCenter();
    if (!center || !ensureProspectingMap(center, Number($('hubProspectingRadius').value))) return;
    prospectingMapPickMode = true;
    $('hubProspectingResults').hidden = false;
    $('hubProspectingResults').classList.add('hubProspectingPicking');
    $('hubCandidates').replaceChildren();
    $('hubProspectingState').textContent = 'Cliquez sur la carte pour choisir précisément le centre de recherche.';
    $('hubProspectingLocationHint').textContent = 'Mode placement actif : cliquez à l’emplacement du bâtiment ou de la zone recherchée.';
    setTimeout(() => prospectingMap?.invalidateSize(), 0);
  }

  function addProspectingResults(candidates, referenceAddress = null) {
    const list = $('hubCandidates'); list.replaceChildren();
    prospectingCards.clear();
    $('hubCandidateCount').textContent = String(candidates.length);
    prospectingBuildings.clear();
    candidates.forEach((entry, index) => {
      const candidate = { ...entry, referenceAddress };
      let polygon = null;
      const consumptionLabel = element('p', 'Consommation : sélectionner le bâtiment');
      const openSheet = element('button', OBI_LOCAL_FLAG_ENABLED ? 'Fiche de synthèse' : 'Voir la fiche', 'hubSecondary'); openSheet.type = 'button';
      openSheet.onclick = () => OBI_LOCAL_FLAG_ENABLED
        ? showUnifiedProspectingDetail(candidate, index, consumptionLabel)
        : showProspectingSheet(candidate, index, consumptionLabel, true);
      if (prospectingLayer && window.L) {
        const coordinates = candidate.geometry.map((point) => [Number(point.lat), Number(point.lon ?? point.lng)]);
        polygon = L.polygon(coordinates, { color: '#d07a19', weight: 2, fillColor: '#eca23b', fillOpacity: .28 });
        const popup = element('div', '', 'hubMapPopup');
        popup.append(element('strong', `Bâtiment ${index + 1}`), consumptionLabel, openSheet);
        polygon.bindPopup(popup).addTo(prospectingLayer);
        prospectingBuildings.set(candidate.osmId, polygon);
      }
      const item = document.createElement('li');
      item.className = 'hubCandidateCard';
      const button = element('button', '', 'hubCandidate'); button.type = 'button';
      button.append(element('strong', formatArea(candidate.areaM2)), element('span', `${candidate.distanceMeters.toLocaleString('fr-FR')} m · bâtiment ${index + 1}`));
      button.onclick = () => {
        if (OBI_LOCAL_FLAG_ENABLED) showUnifiedProspectingDetail(candidate, index, consumptionLabel);
        else showProspectingSheet(candidate, index, consumptionLabel, !polygon || !prospectingMap);
        if (!polygon || !prospectingMap) return;
        prospectingBuildings.forEach((layer, id) => {
          const hasEnedis = prospectingCards.get(id)?.hasEnedis;
          layer.setStyle({ color: hasEnedis ? '#188154' : '#d07a19', fillColor: '#eca23b', fillOpacity: .28, weight: hasEnedis ? 3 : 2 });
        });
        polygon.setStyle({ color: prospectingCards.get(candidate.osmId)?.hasEnedis ? '#188154' : '#073f39', fillColor: '#41b394', fillOpacity: .45, weight: 3 });
        prospectingMap?.fitBounds(polygon.getBounds(), { padding: [40, 40], maxZoom: 19 }); polygon.openPopup();
      };
      const details = element('button', OBI_LOCAL_FLAG_ENABLED ? 'Fiche de synthèse' : 'Fiche détaillée', 'hubCandidateDetails'); details.type = 'button';
      details.onclick = () => OBI_LOCAL_FLAG_ENABLED
        ? showUnifiedProspectingDetail(candidate, index, consumptionLabel)
        : showProspectingSheet(candidate, index, consumptionLabel, true);
      const footer = element('div', '', 'hubCandidateFooter');
      const energyText = element('span', 'Consommation : non chargée', 'hubCandidateConsumption');
      const energyBadge = element('span', 'Enedis disponible', 'hubCandidateEnedis'); energyBadge.hidden = true;
      footer.append(energyText, details, energyBadge); item.append(button, footer); list.append(item);
      const createProject = element('button', 'Créer un dossier en prospection', 'hubCandidateCreateProject');
      createProject.type = 'button';
      createProject.onclick = () => openSave('new', {
        name: `Bâtiment en prospection · ${index + 1}`,
        latitude: Number(candidate.latitude), longitude: Number(candidate.longitude),
        coordinateSource: 'PROSPECTING_OSM_BUILDING', pipelineCategory: 'PROSPECTING', parcelQualification: candidate.parcelQualification || null
      });
      item.append(createProject);
      prospectingCards.set(candidate.osmId, { candidate, index, item, popupLabel: consumptionLabel, energyText, energyBadge, energy: null, energyAttempted: false, hasEnedis: false });
      polygon?.on('click', () => {
        button.focus();
        if (OBI_LOCAL_FLAG_ENABLED) showUnifiedProspectingDetail(candidate, index, consumptionLabel);
        else showProspectingSheet(candidate, index, consumptionLabel, false);
      });
    });
    sortProspectingCards();
  }

  function isWithinMeters(a, b, maximumMeters) {
    if (!a || !b) return false;
    const values = [a.latitude, a.longitude, b.latitude, b.longitude].map(Number);
    if (!values.every(Number.isFinite)) return false;
    const radians = Math.PI / 180;
    const dLat = (values[2] - values[0]) * radians, dLon = (values[3] - values[1]) * radians;
    const haversine = Math.sin(dLat / 2) ** 2 + Math.cos(values[0] * radians) * Math.cos(values[2] * radians) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)) <= maximumMeters;
  }

  function applyProspectingMode(nextMode) {
    cancelActiveObiEvidence(); cancelActiveObiEvidence = () => {};
    const minimumInput = $('hubProspectingMinArea');
    if (OBI_LOCAL_FLAG_ENABLED) {
      if (prospectingMode === 'pv') pvMinimumAreaValue = minimumInput.value;
      else obiMinimumAreaValue = minimumInput.value;
    }
    prospectingMode = ['pv', 'tertiary', 'global'].includes(nextMode) ? nextMode : 'pv';
    document.querySelectorAll('[data-obi-mode]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.obiMode === prospectingMode));
    });
    const obiMode = OBI_LOCAL_FLAG_ENABLED && prospectingMode !== 'pv';
    if (OBI_LOCAL_FLAG_ENABLED) document.querySelector('.hubProspectingMinAreaField > span').textContent = obiMode ? 'Emprise au sol minimum (m²)' : 'Surface toiture minimum (m²)';
    const minimumField = document.querySelector('.hubProspectingMinAreaField');
    if (minimumField) minimumField.hidden = false;
    minimumInput.required = true;
    if (OBI_LOCAL_FLAG_ENABLED) minimumInput.value = obiMode ? obiMinimumAreaValue : pvMinimumAreaValue;
    $('hubProspectingResults')?.classList.toggle('hubObiMode', obiMode);
    $('hubProspectingResults')?.classList.remove('hubObiMobileMap', 'hubObiMobileList');
    document.querySelectorAll('[data-obi-mobile-view]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.obiMobileView === 'map')));
    $('hubObiListTools').hidden = !obiMode;
    $('hubObiMore').hidden = true;
    $('hubObiDetail').hidden = true;
    $('hubProspectingSheet').hidden = true;
    document.querySelector('.hubCandidatePanel')?.classList.toggle('hubObiCandidatePanel', obiMode);
    const candidateHeading = $('hubCandidateCount')?.previousElementSibling;
    if (candidateHeading) candidateHeading.textContent = obiMode ? 'Contours cartographiques' : 'Bâtiments repérés';
    const intro = $('hubProspectingTitle')?.parentElement?.querySelector('p:last-child');
    if (intro && OBI_LOCAL_FLAG_ENABLED) intro.textContent = prospectingMode === 'pv'
      ? 'Repérez les bâtiments puis consultez leur fiche : consommation publiée, bâtiment, parcelles et urbanisme.'
      : OBI_CONNECTED_LOCAL
        ? 'Recherchez des emprises autour de tout projet enregistré et examinez séparément les signaux tertiaires, photovoltaïques et de rénovation.'
        : prospectingMode === 'tertiary'
          ? 'Préqualifiez les signaux tertiaires du jeu local de démonstration Muret, avec les preuves et pièces manquantes visibles.'
          : 'Explorez la démonstration locale de Muret ; la recherche publique est disponible sur la prévisualisation locale.';
    const privacyNote = document.querySelector('.hubPrivacyNote');
    if (privacyNote && OBI_LOCAL_FLAG_ENABLED) privacyNote.textContent = obiMode
      ? 'Chaque résultat est une emprise au sol cartographiée, pas une toiture ni un établissement confirmé. Aucune consommation n’est attribuée au bâtiment. Rien n’est enregistré automatiquement : « Enregistrer le prospect » ajoute explicitement la fiche au portefeuille, avec vérifications en attente.'
      : 'Les surfaces sont estimées à partir des contours au sol et la toiture reste à vérifier. Les consommations affichées sont des agrégats publics à l’adresse, pas des relevés individuels. Les recherches restent temporaires ; seuls les dossiers explicitement créés sont ajoutés au portefeuille.';
    invalidateProspectingResults();
    if (prospectingLayer) prospectingLayer.clearLayers();
    prospectingBuildings.clear();
    obiModels = []; activeObiCandidateId = null; hoveredObiCandidateId = null;
    $('hubObiCount').textContent = '';
    $('hubObiPartialState').textContent = '';
    $('hubObiEnergySummary').hidden = true;
    $('hubObiEnergySummary').textContent = '';
    $('hubCandidates').replaceChildren();
    $('hubCandidateCount').textContent = '0';
    $('hubProspectingState').textContent = prospectingMode === 'pv'
      ? 'Sélectionnez un projet ou une adresse / un lieu, puis lancez la recherche.'
      : OBI_CONNECTED_LOCAL
        ? 'Choisissez un projet enregistré ou un lieu, puis lancez la recherche publique.'
        : 'Démo disponible à Muret. La recherche publique est disponible sur la prévisualisation locale.';
  }

  function setObiMobileView(view) {
    const results = $('hubProspectingResults');
    if (!results) return;
    const nextView = view === 'list' ? 'list' : 'map';
    results.classList.toggle('hubObiMobileMap', nextView === 'map');
    results.classList.toggle('hubObiMobileList', nextView === 'list');
    document.querySelectorAll('[data-obi-mobile-view]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.obiMobileView === nextView));
    });
    if (nextView === 'map') requestAnimationFrame(() => prospectingMap?.invalidateSize?.({ pan: false }));
  }

  function updateObiMapSignal() {
    const signal = $('hubObiMapSignal').value;
    const legend = $('hubObiLegend');
    const isPv = signal === 'pv';
    legend.replaceChildren();
    const swatch = element('span', '', `hubObiLegendSwatch ${isPv ? 'potential' : 'unknown'}`);
    swatch.setAttribute('aria-hidden', 'true');
    legend.append(swatch, document.createTextNode(isPv ? 'Potentiel · à vérifier' : 'Inconnu · preuve insuffisante'));
    for (const model of obiModels) {
      const layer = prospectingBuildings.get(model.target.id);
      if (!layer) continue;
      const active = signal === 'pv' ? model.indicators.pv : model.indicators[signal];
      const selected = model.target.id === (hoveredObiCandidateId || activeObiCandidateId);
      const hovered = model.target.id === hoveredObiCandidateId;
      const knownPotential = active.conclusion === 'POTENTIAL';
      layer.setStyle({
        color: selected ? '#b57400' : '#d9ae00',
        fillColor: '#f5d65b',
        weight: selected ? 3 : 1,
        opacity: 1,
        fillOpacity: selected ? .28 : .04,
        dashArray: ''
      });
    }
  }

  function setObiCandidateHover(model, hovered, fromList = false) {
    if (!hovered && hoveredObiCandidateId !== model.target.id) return;
    hoveredObiCandidateId = hovered ? model.target.id : null;
    updateObiMapSignal();
    for (const row of $('hubCandidates').children) {
      row.classList.toggle('isMapHovered', row.querySelector('[data-obi-candidate-id]')?.dataset.obiCandidateId === hoveredObiCandidateId);
    }
    const layer = prospectingBuildings.get(model.target.id);
    if (hovered) {
      layer?.bringToFront?.();
      if (fromList) layer?.openTooltip?.(layer.getBounds().getCenter());
    } else layer?.closeTooltip?.();
  }

  function obiMapTooltip(model) {
    const cartouche = element('div', '', 'hubObiMapTooltip');
    const rows = document.createElement('dl');
    for (const [label, value] of [
      ['Emprise au sol', formatArea(model.candidate.areaM2)],
      ['Éco Énergie', model.publicObservations?.building.building?.usage_principal_bdnb_open === 'Tertiaire' ? 'Indice de groupe · à vérifier' : 'Applicabilité à vérifier'],
      ['PV', 'Potentiel à vérifier'],
      ['Rénovation', 'Données insuffisantes']
    ]) {
      const line = document.createElement('div');
      line.append(element('dt', label), element('dd', value)); rows.append(line);
    }
    cartouche.append(rows); return cartouche;
  }

  function focusObiCandidate(model) {
    activeObiCandidateId = model.target.id;
    document.querySelectorAll('.hubObiCandidate').forEach((row) => {
      row.setAttribute('aria-current', String(row.querySelector('[data-obi-candidate-id]')?.dataset.obiCandidateId === model.target.id));
    });
    updateObiMapSignal();
    const layer = prospectingBuildings.get(model.target.id);
    const bounds = layer?.getBounds?.();
    if (bounds?.isValid?.() && prospectingMap) prospectingMap.fitBounds(bounds, { padding: [55, 55], maxZoom: 19 });
  }

  function prospectKeyFor(model) { return `OBI:${model.target.id}`; }
  function isProspectSaved(model) {
    const key = prospectKeyFor(model);
    return dashboardRecords.some((record) => record.prospectKey === key);
  }
  function createObiProspectingSnapshot(model, candidate, reference) {
    const center = selectedProspectingCenter();
    const indicatorSnapshot = {};
    for (const [key, indicator] of Object.entries(model.indicators)) {
      indicatorSnapshot[key] = {
        family: indicator.family,
        conclusion: indicator.conclusion,
        proof: indicator.proof,
        label: indicator.label,
        reason: indicator.reason,
        missing: [...indicator.missing],
        reviewStatus: 'PENDING_VALIDATION'
      };
    }
    return {
      schemaVersion: 1,
      recordType: 'OBI_PROSPECTING_SNAPSHOT',
      isDemonstration: !OBI_CONNECTED_LOCAL,
      savedAt: new Date().toISOString(),
      qualificationStatus: 'PENDING_MANDATAIRE_REVIEW',
      candidate: {
        contourId: model.target.id,
        osmId: Number(candidate.osmId),
        areaM2: Number(candidate.areaM2),
        source: 'OpenStreetMap',
        sourceDate: model.provenance.source.retrievedAt,
        attribution: model.provenance.source.attribution,
        license: model.provenance.source.license,
        estimatedFootprintM2: model.surfaces.osm_footprint_area_m2,
        roofExploitableAreaM2: model.surfaces.roof_exploitable_area_m2,
        distanceMeters: model.distanceMeters,
        latitude: Number(candidate.latitude),
        longitude: Number(candidate.longitude),
        geometry: candidate.geometry
      },
      searchReference: {
        addressOrPlace: String($('hubProspectingLocation')?.value || reference?.address || '').trim(),
        latitude: center?.latitude ?? null,
        longitude: center?.longitude ?? null,
        relationship: 'SEARCH_REFERENCE_ONLY_NOT_BUILDING_ADDRESS',
        radiusMeters: Number($('hubProspectingRadius')?.value || 0)
      },
      identities: model.identities,
      viewModel: {
        target: model.target,
        identities: model.identities,
        indicators: model.indicators,
        energy: model.energy,
        surfaces: model.surfaces,
        distanceMeters: model.distanceMeters,
        provenance: model.provenance,
        poc: model.poc,
        publicObservations: model.publicObservations || null
      },
      indicators: indicatorSnapshot,
      publicReference: reference ? structuredClone(reference) : null,
      provenance: model.provenance,
      limits: [
        'L’emprise au sol n’est pas une surface de toiture exploitable.',
        'Aucune activité, occupation, surface tertiaire, consommation, conformité EET ou besoin de rénovation n’est attribué automatiquement au bâtiment.',
        'Les statuts de vérification sont en attente et ne constituent pas une qualification ni une décision commerciale.'
      ]
    };
  }

  async function showObiDetail(model, candidate, openPvDetails = null) {
    cancelActiveObiEvidence();
    if (!OBI_LOCAL_FLAG_ENABLED) return;
    prospectingSheet?.close();
    model.energy = { ...model.energy, enedisAddressAggregate: candidate.energy || model.energy?.enedisAddressAggregate || null };
    const host = $('hubObiDetail');
    const results = $('hubProspectingResults');
    const view = $('hubProspectingView');
    const list = $('hubCandidates');
    const origin = document.activeElement;
    const mapElement = $('hubProspectingMap');
    const mapCaption = mapElement?.parentElement?.querySelector(':scope > .hubPrivacyNote');
    const snapshot = { x: window.scrollX, y: window.scrollY, listY: list.scrollTop,
      mapView: results.classList.contains('hubObiMobileMap'), listView: results.classList.contains('hubObiMobileList'),
      center: prospectingMap?.getCenter(), zoom: prospectingMap?.getZoom(),
      mapParent: mapElement?.parentElement, mapNext: mapElement?.nextSibling,
      captionParent: mapCaption?.parentElement, captionNext: mapCaption?.nextSibling };
    focusObiCandidate(model);
    let active = true;
    let cancelReader = () => {};
    const controller = new AbortController();
    const dispose = () => {
      active = false; controller.abort(); cancelReader(); window.removeEventListener('popstate', onPop);
      if (history.state?.obiC4) { const state = { ...history.state }; delete state.obiC4; history.replaceState(state, ''); }
      const restoreNode = (node, parent, next) => {
        if (!node || !parent) return;
        parent.insertBefore(node, next?.parentElement === parent ? next : null);
      };
      restoreNode(mapElement, snapshot.mapParent, snapshot.mapNext);
      restoreNode(mapCaption, snapshot.captionParent, snapshot.captionNext);
      host.hidden = true; host.replaceChildren();
      results.classList.remove('hubObiDetailOpen'); view.classList.remove('hubObiDetailOpen');
      prospectingSheet?.close();
      const sheetHost = $('hubProspectingSheet');
      if (sheetHost && sheetHost.parentElement !== view) view.append(sheetHost);
      requestAnimationFrame(() => prospectingMap?.invalidateSize?.({ pan: false }));
    };
    const restore = () => {
      dispose();
      results.classList.toggle('hubObiMobileMap', snapshot.mapView);
      results.classList.toggle('hubObiMobileList', snapshot.listView);
      document.querySelectorAll('[data-obi-mobile-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.obiMobileView === (snapshot.listView ? 'list' : 'map'))));
      // Moving the map between the fiche and results changes its container size.
      // Refresh that size before restoring the search center, otherwise Leaflet
      // interprets the saved center using the fiche dimensions and shifts it.
      prospectingMap?.invalidateSize?.({ pan: false });
      if (snapshot.center && prospectingMap && (!prospectingMap.getCenter().equals(snapshot.center) || prospectingMap.getZoom() !== snapshot.zoom)) prospectingMap.setView(snapshot.center, snapshot.zoom, { animate: false });
      origin?.focus({ preventScroll: true }); list.scrollTop = snapshot.listY;
      window.scrollTo({ left: snapshot.x, top: snapshot.y, behavior: 'instant' });
    };
    const onPop = () => { if (!history.state?.obiC4) restore(); };
    cancelActiveObiEvidence = dispose;
    activeObiCandidateId = model.target.id;
    results.classList.add('hubObiDetailOpen'); view.classList.add('hubObiDetailOpen');
    document.querySelectorAll('.hubObiCandidate').forEach((row) => row.setAttribute('aria-current', String(row.contains(origin))));
    updateObiMapSignal();
    // The map is moved into the fiche hero while it is open, then restored in place.
    host.hidden = true;
    try {
      const [{ mountQualificationPreview }, response] = await Promise.all([
        import('./obi-qualification-preview.mjs?v=20261116-enedis-prospecting-display-3'),
        fetch('./obi-c2-muret-recorded-reference.json', { signal: controller.signal, credentials: 'same-origin' })
      ]);
      if (!response.ok) throw new Error('Référence locale indisponible.');
      const recorded = await response.json();
      if (!active) return;
      const reference = recorded.cases[String(candidate.osmId)];
      history.pushState({ ...history.state, obiC4: true }, '', location.href);
      window.addEventListener('popstate', onPop);
      const preview = mountQualificationPreview(host, { model, candidate, reference, energy: candidate.energy || model.energy, withMap: true, isProspectSaved: isProspectSaved(model), eetRegulatoryEnabled: OBI_LOCAL_FLAG_ENABLED,
        onRefreshObservations: OBI_CONNECTED_LOCAL ? () => ensureObiCandidateData(model, true) : null,
        onReturn: () => history.back(),
        onStartStudy: () => openSave('new', {
          name: `Pré-étude PV · contour ${candidate.osmId}`,
          latitude: Number(candidate.latitude), longitude: Number(candidate.longitude),
          coordinateSource: 'PROSPECTING_OSM_BUILDING', pipelineCategory: 'IN_PROGRESS'
        }),
        onSaveProspect: () => {
          if (isProspectSaved(model)) { notice('Cette emprise figure déjà dans la liste de prospection.'); return; }
          openSave('new', {
            name: `Prospect cartographique · ${model.target.id}`,
            latitude: Number(candidate.latitude), longitude: Number(candidate.longitude),
            coordinateSource: 'PROSPECTING_OSM_BUILDING',
            pipelineCategory: 'PROSPECTING',
            prospectKey: prospectKeyFor(model),
            prospectingSnapshot: createObiProspectingSnapshot(model, candidate, reference),
            onSaved: () => history.back()
          });
        }
      });
      const detailMapHost = $('hubObiDetailMapHost');
      if (detailMapHost && mapElement) detailMapHost.append(mapElement);
      if (OBI_CONNECTED_LOCAL) ensureObiCandidateData(model).then(data => { if (active) preview.updateObservations(data); }).catch(error => { if (active && error.name !== 'AbortError') preview.showObservationError(error.message); });
      requestAnimationFrame(() => {
        prospectingMap?.invalidateSize?.({ pan: false });
        focusObiCandidate(model);
      });
    const evidenceSection = document.createElement('section'); evidenceSection.className = 'hubObiEvidenceEntry';
    evidenceSection.append(element('h4', 'Indices publics RNB et BDNB Open'));
    evidenceSection.append(element('p', 'Les appels concernent seulement cette emprise, à votre demande. Aucun usage de groupe n’est attribué à une construction individuelle.', 'hubObiEvidenceCaveat'));
    const evidenceButton = element('button', 'Vérifier les indices publics', 'hubSecondary'); evidenceButton.type = 'button';
    const allowedCase = ['81401972', '704399122'].includes(String(candidate.osmId));
    evidenceButton.disabled = !OBI_LOCAL_FLAG_ENABLED || !allowedCase;
    if (!allowedCase) evidenceButton.title = 'Cette emprise ne fait pas partie des deux cas Muret de C2.';
    if (!OBI_LOCAL_FLAG_ENABLED) evidenceButton.title = 'La vérification est disponible uniquement dans le prototype local, flag activé.';
    const evidenceHost = document.createElement('div');
    evidenceButton.onclick = async () => {
      if (evidenceButton.disabled || !evidenceHost.isConnected) return;
      evidenceButton.disabled = true; evidenceButton.textContent = 'Ouverture de la vérification…';
      try {
        const { mountObiEvidence } = await import('./obi-evidence-view.mjs');
        if (!evidenceHost.isConnected) return;
        const controls = mountObiEvidence(evidenceHost, candidate);
        cancelReader = controls.cancel;
        // Expose one cancellation boundary for the C2 reader and C4 navigation.
        controls.cancel = dispose;
        cancelActiveObiEvidence = controls.cancel;
        evidenceButton.hidden = true;
      } catch {
        evidenceButton.disabled = false; evidenceButton.textContent = 'Réessayer d’ouvrir la vérification';
      }
    };
    evidenceSection.append(evidenceButton, evidenceHost);
    host.querySelector('[data-public-evidence]')?.append(evidenceSection);
    } catch (error) {
      if (!active) return;
      host.replaceChildren(element('p', error.message || 'Fiche locale indisponible.', 'hubSheetWarning'));
      host.hidden = false;
    }
  }

  async function ensureObiCandidateData(model, refresh = false) {
    if (!OBI_CONNECTED_LOCAL) return null;
    if (!refresh && model.publicObservations) return { observations: model.publicObservations, energy: model.candidate.energy };
    if (model.observationPromise) return model.observationPromise;
    const generation = prospectingSearchGeneration;
    const signal = prospectingSearchController?.signal;
    model.observationStarted = true;
    model.observationPromise = (async () => {
      obiConnectedReaders ||= await import('./obi-connected-data.mjs?v=20261116-enedis-prospecting-display-3');
      if (generation !== prospectingSearchGeneration || signal?.aborted) throw new DOMException('Recherche remplacée.', 'AbortError');
      const result = await obiConnectedReaders.loadConnectedCandidate(model.candidate, { signal, refresh });
      if (generation !== prospectingSearchGeneration) throw new DOMException('Recherche remplacée.', 'AbortError');
      model.publicObservations = result.observations;
      model.candidate.energy = result.energy;
      model.energy = { ...model.energy, enedisAddressAggregate: result.energy };
      model.observationDone = true;
      const group = result.observations.building.building;
      if (model.titleText?.isConnected && group?.libelle_adr_principale_ban) model.titleText.textContent = group.libelle_adr_principale_ban;
      if (model.eetValue?.isConnected && group?.usage_principal_bdnb_open === 'Tertiaire') model.eetValue.textContent = 'Indice tertiaire de groupe · à vérifier';
      prospectingBuildings.get(model.target.id)?.setTooltipContent?.(obiMapTooltip(model));
      return result;
    })();
    try { return await model.observationPromise; }
    catch (error) {
      if (error.name !== 'AbortError') { model.observationDone = true; model.candidate.energy = { state: 'UNAVAILABLE', totalMwh: null, reason: error.message }; }
      throw error;
    } finally {
      model.observationPromise = null;
      if (model.energyValue?.isConnected) model.energyValue.textContent = obiEnergyValue(model);
    }
  }

  async function showProspectingAddressAggregate(reference, generation, signal) {
    const summary = $('hubObiEnergySummary');
    if (!summary) return;
    if (!OBI_CONNECTED_LOCAL) {
      summary.hidden = true;
      return;
    }
    summary.hidden = false;
    if (!reference || !['ADDRESS', 'USER_CONFIRMED_ADDRESS'].includes(reference.precision)) {
      summary.textContent = 'Consommation Enedis : choisissez un projet ou une adresse postale précise pour consulter l’agrégat public. Les kWh ne sont jamais attribués automatiquement aux contours de bâtiments.';
      return;
    }
    summary.textContent = `Recherche Enedis pour l’adresse sélectionnée : ${reference.label || reference.address || 'adresse confirmée'}…`;
    try {
      obiConnectedReaders ||= await import('./obi-connected-data.mjs?v=20261116-enedis-prospecting-display-3');
      const energy = await obiConnectedReaders.loadConnectedAddressAggregate(reference, { signal, refresh: true });
      if (generation !== prospectingSearchGeneration || signal?.aborted) return;
      if (energy.totalMwh != null) {
        const rows = Array.isArray(energy.latest) ? energy.latest.length : 0;
        summary.textContent = `${energy.address.label} · ${Number(energy.totalMwh).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} MWh/an en ${energy.latestYear || 'année non précisée'} · ${rows} ligne${rows > 1 ? 's' : ''} Enedis publiée${rows > 1 ? 's' : ''}. Agrégat de l’adresse sélectionnée, non attribué aux contours de bâtiments.`;
      } else summary.textContent = `${energy.address?.label || reference.label || 'Adresse sélectionnée'} · ${energy.reason || 'Aucun agrégat Enedis trouvé.'} Les consommations ne sont pas attribuées aux contours.`;
    } catch (error) {
      if (error.name === 'AbortError' || generation !== prospectingSearchGeneration) return;
      summary.textContent = `Agrégat Enedis de l’adresse non chargé : ${error.message || 'réessayez.'}`;
    }
  }

  function obiEnergyValue(model) {
    return obiConnectedReaders?.connectedEnergyLabel(model.candidate.energy, OBI_CONNECTED_LOCAL && !model.observationDone)
      || (OBI_CONNECTED_LOCAL ? 'Recherche en cours…' : 'Non renseignée');
  }

  async function loadObiVisibleObservations() {
    if (!OBI_CONNECTED_LOCAL || !obiModels.length) return;
    let controller = prospectingEnergyController;
    if (!controller || controller.signal.aborted || controller.generation !== prospectingSearchGeneration) {
      controller = new AbortController(); controller.generation = prospectingSearchGeneration; prospectingEnergyController = controller;
    }
    if (controller.obiRunning) return;
    controller.obiRunning = true;
    const active = () => controller === prospectingEnergyController && !controller.signal.aborted && controller.generation === prospectingSearchGeneration;
    const progress = () => {
      if (!active()) return;
      const visible = obiModels.slice(0, obiPageSize), completed = visible.filter(model => model.observationDone).length;
      setProspectingProgress(completed < visible.length ? `Recherche des données publiques : ${completed}/${visible.length} résultats vérifiés…` : `Recherche terminée : ${completed} résultats vérifiés.`, visible.length ? Math.round(completed / visible.length * 100) : 100);
    };
    async function worker() {
      while (active()) {
        const model = obiModels.slice(0, obiPageSize).find(entry => !entry.observationStarted && !entry.observationDone);
        if (!model) return;
        model.observationStarted = true;
        try { await ensureObiCandidateData(model); } catch (error) { if (error.name === 'AbortError') return; }
        progress();
      }
    }
    try { progress(); await Promise.all([worker(), worker()]); }
    finally { controller.obiRunning = false; if (active()) { controller.done = true; progress(); } }
  }

  function renderObiCandidatePage() {
    if (hoveredObiCandidateId) prospectingBuildings.get(hoveredObiCandidateId)?.closeTooltip?.();
    hoveredObiCandidateId = null;
    const list = $('hubCandidates'); list.replaceChildren();
    const page = obiModels.slice(0, obiPageSize);
    page.forEach((model, index) => {
      const candidate = model.candidate;
      const item = document.createElement('li'); item.className = 'hubObiCandidate';
      item.addEventListener('mouseenter', () => setObiCandidateHover(model, true, true));
      item.addEventListener('mouseleave', () => setObiCandidateHover(model, false));
      item.addEventListener('focusin', () => setObiCandidateHover(model, true, true));
      item.addEventListener('focusout', event => { if (!item.contains(event.relatedTarget)) setObiCandidateHover(model, false); });
      item.setAttribute('aria-current', String(model.target.id === activeObiCandidateId));
      const head = document.createElement('div'); head.className = 'hubObiCandidateHead';
      const select = element('button', '', 'hubCandidate'); select.type = 'button';
      select.dataset.obiCandidateId = model.target.id;
      model.titleText = element('strong', model.publicObservations?.building.building?.libelle_adr_principale_ban || `Emprise candidate ${candidate.osmId}`);
      select.append(model.titleText, element('span', `${formatArea(candidate.areaM2)} d’emprise au sol estimée · ${candidate.distanceMeters.toLocaleString('fr-FR')} m`));
      select.onclick = () => focusObiCandidate(model);
      head.append(select);
      const badges = document.createElement('dl');
      for (const [key, signal] of Object.entries(model.indicators)) {
        const badge = document.createElement('div'); badge.className = 'hubObiBadge';
        const family = key === 'pv' ? 'Photovoltaïque' : key === 'renovation' ? 'Rénovation / efficacité énergétique' : signal.family;
        const label = key === 'pv' ? 'Potentiel à vérifier' : key === 'renovation' ? 'Données insuffisantes' : 'Applicabilité à vérifier';
        const value = element('dd', key === 'eet' && model.publicObservations?.building.building?.usage_principal_bdnb_open === 'Tertiaire' ? 'Indice tertiaire de groupe · à vérifier' : label);
        if (key === 'eet') model.eetValue = value;
        badge.append(element('dt', family), value);
        badges.append(badge);
      }
      const energySummary = document.createElement('dl'); energySummary.className = 'hubObiCandidateEnergy';
      const energyLine = element('div', '', 'hubObiBadge'); model.energyValue = element('dd', obiEnergyValue(model));
      energyLine.append(element('dt', 'Consommation du site'), model.energyValue); energySummary.append(energyLine);
      const actions = document.createElement('div'); actions.className = 'hubObiCandidateActions';
      if (isProspectSaved(model)) {
        const saved = element('p', 'Dans la liste « En prospection » · vérifications en attente', 'hubObiSavedStatus');
        saved.setAttribute('role', 'status'); item.append(saved);
      }
      const details = element('button', 'Ouvrir la fiche détaillée', 'hubSecondary'); details.type = 'button';
      details.setAttribute('aria-label', `Ouvrir la fiche détaillée du contour ${candidate.osmId}`);
      details.onclick = () => showObiDetail(model, candidate, (consumptionLabel) => {
        showProspectingSheet(candidate, index, consumptionLabel || element('p', 'Consommation : à consulter'), true);
      });
      actions.append(details);
      item.append(head, badges, energySummary, actions); list.append(item);
    });
    $('hubObiCount').textContent = `${page.length} contours affichés sur ${obiModels.length}.${obiModels.length > page.length ? ' Vous pouvez afficher la suite par tranches de 20.' : ''}`;
    $('hubObiMore').hidden = page.length >= obiModels.length;
    $('hubCandidateCount').textContent = String(obiModels.length);
    updateObiMapSignal();
    if (OBI_CONNECTED_LOCAL) queueMicrotask(loadObiVisibleObservations);
  }

  async function searchObiProspectingBuildings() {
    cancelActiveObiEvidence(); cancelActiveObiEvidence = () => {};
    const minimumAreaM2 = validateProspectingMinimumArea();
    if (minimumAreaM2 === null) return;
    const center = selectedProspectingCenter();
    if (!center) { $('hubProspectingState').textContent = 'Choisissez un projet ou sélectionnez une adresse / un lieu dans les suggestions.'; return; }
    if ($('hubProspectingLocation').value.trim() && !prospectingAddressSelection) {
      $('hubProspectingState').textContent = 'Sélectionnez une adresse ou un lieu dans les suggestions avant de lancer la recherche.'; return;
    }
    const knownCenter = { latitude: 43.490007, longitude: 1.342465 };
    const radiusMeters = Number($('hubProspectingRadius').value);
    if (!OBI_CONNECTED_LOCAL && (!isWithinMeters(center, knownCenter, 5) || ![250, 500].includes(radiusMeters))) {
      prospectingMode = prospectingMode === 'pv' ? 'global' : prospectingMode;
      $('hubProspectingResults').hidden = false;
      $('hubProspectingResults').classList.add('hubObiMode');
      if (window.matchMedia('(max-width: 760px)').matches) setObiMobileView('list');
      $('hubObiListTools').hidden = false;
      $('hubCandidates').replaceChildren(); $('hubCandidateCount').textContent = '0';
      $('hubObiCount').textContent = '0 affiché sur 0 contour candidat.';
      $('hubObiMore').hidden = true;
      $('hubObiPartialState').textContent = 'La démo est limitée à Muret (250 ou 500 m). Aucun résultat n’est simulé.';
      $('hubProspectingState').textContent = 'La démo ne couvre que Muret. La recherche publique est disponible sur la prévisualisation locale.';
      return;
    }
    prospectingSearchInProgress = true;
    const requestGeneration = ++prospectingSearchGeneration;
    prospectingSearchController?.abort(); prospectingEnergyController?.abort();
    const controller = new AbortController(); prospectingSearchController = controller;
    const isCurrent = () => requestGeneration === prospectingSearchGeneration && !controller.signal.aborted;
    const addressReference = center.addressReference || (center.precision === 'ADDRESS' ? center : null);
    void showProspectingAddressAggregate(addressReference, requestGeneration, controller.signal);
    prospectingCards.clear(); $('hubCandidates').replaceChildren(); $('hubCandidateCount').textContent = '0';
    prospectingSelection++; prospectingSheet?.close(); $('hubObiDetail').hidden = true;
    updateProspectingSearchAvailability();
    $('hubProspectingResults').hidden = false;
    $('hubProspectingResults').classList.add('hubObiMode'); $('hubObiListTools').hidden = false;
    if (window.matchMedia('(max-width: 760px)').matches) setObiMobileView('list');
    $('hubProspectingState').textContent = OBI_CONNECTED_LOCAL ? 'Recherche des contours OpenStreetMap…' : 'Chargement du jeu de démonstration local…';
    setProspectingProgress(OBI_CONNECTED_LOCAL ? 'Lecture des données cartographiques publiques…' : 'Chargement de la capture cartographique locale…', 5);
    $('hubObiPartialState').textContent = '';
    let hasMap = false;
    try {
      let result;
      if (OBI_CONNECTED_LOCAL) {
        hasMap = ensureProspectingMap(center, radiusMeters);
        const { fetchBuildingFootprints, nearbyRoofCandidates } = await import('./osm-footprint-client.mjs');
        const elements = await fetchBuildingFootprints(Number(center.latitude), Number(center.longitude), {
          radiusMeters, timeoutMs: 18000, signal: controller.signal, cacheMode: 'EXACT',
          onProgress: ({ source }) => {
            if (isCurrent()) setProspectingProgress(source === 'OSM_MAP' ? 'Lecture de secours OpenStreetMap…' : 'Recherche des contours OpenStreetMap…', null);
          }
        });
        result = { candidates: nearbyRoofCandidates(elements, Number(center.latitude), Number(center.longitude), { radiusMeters, minimumAreaM2: 1 }), canonicalBuildingWays: elements.length };
      } else {
        const { loadMuretFixture, buildMuretContourCandidates, matchesMuretFixtureCenter } = await import('./obi-prospecting-fixture.mjs');
        if (!obiFixtureCache) obiFixtureCache = await loadMuretFixture();
        if (!isCurrent()) return;
        setProspectingProgress('Préparation des contours de la zone de démonstration…', 35);
        if (!matchesMuretFixtureCenter(center, obiFixtureCache)) throw new Error('Jeu de démonstration indisponible pour cette zone.');
        hasMap = ensureProspectingMap(center, radiusMeters);
        result = await buildMuretContourCandidates(obiFixtureCache, obiFixtureCache.site.latitude, obiFixtureCache.site.longitude, radiusMeters);
      }
      if (!isCurrent()) return;
      setProspectingProgress('Préparation des indicateurs et de leur provenance…', 85);
      const { createObiProspectingViewModel } = await import('./obi-prospecting-view-model.mjs');
      obiModels = result.candidates
        .filter(candidate => candidate.areaM2 >= minimumAreaM2)
        .sort((a, b) => a.distanceMeters - b.distanceMeters || Number(a.osmId) - Number(b.osmId))
        .map((candidate) => {
          if (OBI_CONNECTED_LOCAL) candidate.referenceAddress = center.addressReference || (center.precision === 'ADDRESS' ? center : null);
          const model = { ...createObiProspectingViewModel(candidate, { fixtureStatus: OBI_CONNECTED_LOCAL ? 'LIVE_PUBLIC_OBSERVATION' : 'LOCAL_DEMO' }), candidate };
          if (OBI_CONNECTED_LOCAL) {
            model.provenance.source.retrievedAt = new Date().toISOString();
            model.poc = { isDemo: false, banner: 'Données publiques à vérifier · préqualification non certifiée' };
          }
          return model;
        });
      if (prospectingLayer && window.L) {
        if (prospectingMap?.attributionControl && !prospectingMap.obiAttributionAdded) {
          prospectingMap.attributionControl.addAttribution('Contours © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>');
          prospectingMap.obiAttributionAdded = true;
        }
        for (const model of obiModels) {
          const candidate = model.candidate;
          const points = candidate.geometry.map((point) => [Number(point.lat), Number(point.lon ?? point.lng)]);
          const polygon = L.polygon(points, { color: '#d9ae00', weight: 1, opacity: 1, fillColor: '#f5d65b', fillOpacity: .04 });
          polygon.bindTooltip(obiMapTooltip(model), { direction: 'top', opacity: 1, className: 'hubObiCartouche' });
          polygon.on('mouseover', () => setObiCandidateHover(model, true));
          polygon.on('mouseout', () => setObiCandidateHover(model, false));
          polygon.on('click', () => {
            activeObiCandidateId = model.target.id;
            renderObiCandidatePage();
            const row = [...$('hubCandidates').children].find((node) => node.querySelector('[data-obi-candidate-id]')?.dataset.obiCandidateId === model.target.id);
            row?.scrollIntoView({ block: 'nearest' });
          });
          polygon.addTo(prospectingLayer); prospectingBuildings.set(model.target.id, polygon);
        }
      }
      obiPageSize = 20; activeObiCandidateId = null;
      renderObiCandidatePage();
      $('hubObiPartialState').textContent = OBI_CONNECTED_LOCAL
        ? `${result.canonicalBuildingWays} objets cartographiques lus · consultation du ${new Date().toLocaleString('fr-FR')} · couverture dépendante des données OpenStreetMap, non exhaustive. © OpenStreetMap contributors.`
        : `${result.rawResponseElements.toLocaleString('fr-FR')} objets cartographiques examinés · ${result.canonicalBuildingWays} contours de bâtiments retenus · capture partielle, non exhaustive. © OpenStreetMap contributors.`;
      $('hubProspectingState').textContent = `${obiModels.length} contours d’au moins ${formatArea(minimumAreaM2)} d’emprise au sol retenus sur ${result.candidates.length} dans la zone. Filtre de recherche modifiable ; ces contours ne constituent pas des prospects qualifiés.${hasMap ? '' : ' La carte est indisponible, la liste reste consultable.'}`;
      if (OBI_CONNECTED_LOCAL && obiModels.length === 0) setProspectingProgress('Recherche terminée · aucun contour dans les données reçues.', 100);
      if (!OBI_CONNECTED_LOCAL) setProspectingProgress('Recherche cartographique terminée.', 100);
    } catch (error) {
      if (!isCurrent()) return;
      obiModels = []; renderObiCandidatePage();
      const message = error?.message || 'Jeu de démonstration indisponible pour cette zone.';
      $('hubProspectingState').textContent = message;
      $('hubObiPartialState').textContent = message;
      setProspectingProgress(OBI_CONNECTED_LOCAL ? 'Service indisponible · résultat non déterminé ; réessayez.' : 'Recherche interrompue · aucun résultat complet à afficher.', 0);
    } finally { if (isCurrent()) { prospectingSearchInProgress = false; updateProspectingSearchAvailability(); } }
  }

  async function searchProspectingBuildings() {
    if (typeof OBI_LOCAL_FLAG_ENABLED !== 'undefined' && OBI_LOCAL_FLAG_ENABLED && prospectingMode !== 'pv') return searchObiProspectingBuildings();
    const minimumAreaM2 = validateProspectingMinimumArea();
    if (minimumAreaM2 === null) return;
    const center = selectedProspectingCenter();
    if (!center) { $('hubProspectingState').textContent = 'Choisissez un projet ou sélectionnez une adresse / un lieu dans les suggestions.'; return; }
    if ($('hubProspectingLocation').value.trim() && !prospectingAddressSelection) {
      $('hubProspectingState').textContent = 'Sélectionnez une adresse ou un lieu dans les suggestions avant de lancer la recherche.'; return;
    }
    const radiusMeters = Number($('hubProspectingRadius').value);
    prospectingSearchInProgress = true;
    const requestGeneration = ++prospectingSearchGeneration;
    prospectingSearchController?.abort(); prospectingEnergyController?.abort();
    const controller = new AbortController(); prospectingSearchController = controller;
    const isCurrent = () => requestGeneration === prospectingSearchGeneration && !controller.signal.aborted;
    prospectingCards.clear(); $('hubCandidates').replaceChildren(); $('hubCandidateCount').textContent = '0';
    prospectingSelection++; prospectingSheet?.close();
    updateProspectingSearchAvailability();
    $('hubProspectingResults').hidden = false;
    $('hubProspectingState').textContent = 'Recherche des bâtiments proches en cours…';
    setProspectingProgress('Recherche des contours cartographiques…', null);
    let hasMap = false;
    try {
      try { hasMap = ensureProspectingMap(center, radiusMeters); } catch { hasMap = false; }
      const { fetchBuildingFootprints, nearbyRoofCandidates } = await import('./osm-footprint-client.mjs');
      const elements = await fetchBuildingFootprints(Number(center.latitude), Number(center.longitude), {
        radiusMeters, timeoutMs: 18000, signal: controller.signal, cacheMode: 'EXACT',
        onProgress: ({ attempt, total, source }) => {
          if (!isCurrent()) return;
          if (source === 'OSM_MAP') { $('hubProspectingState').textContent = 'Overpass indisponible ; lecture de secours de la carte OpenStreetMap locale…'; return; }
          $('hubProspectingState').textContent = attempt === 1
            ? `Recherche OpenStreetMap en cours… (essai ${attempt}/${total})`
            : 'Le premier service cartographique tarde ; nouvel essai automatique sur un service de secours…';
        }
      });
      if (!isCurrent()) return;
      const candidates = nearbyRoofCandidates(elements, Number(center.latitude), Number(center.longitude), { radiusMeters, minimumAreaM2 });
      setProspectingProgress('Contours trouvés · préparation du résumé des résultats…', 65);
      addProspectingResults(candidates, center.addressReference || (center.precision === 'ADDRESS' ? center : null));
      $('hubProspectingState').textContent = candidates.length
        ? `${candidates.length} bâtiment${candidates.length > 1 ? 's' : ''} repéré${candidates.length > 1 ? 's' : ''}. Les surfaces estimées sont indicatives.`
        : 'Aucun bâtiment ne correspond à ces critères dans les données cartographiques disponibles.';
      if (!hasMap) $('hubProspectingState').textContent += ' La carte visuelle est indisponible, mais la liste reste consultable.';
      if (elements.source === 'OSM_MAP') $('hubProspectingState').textContent += ' Source de secours locale ; certains contours sans sommet dans la zone peuvent manquer.';
      loadProspectingEnergySort();
    } catch (error) {
      if (!isCurrent()) return;
      addProspectingResults([]);
      $('hubProspectingState').textContent = `${error.message || 'La recherche a échoué.'} Le bouton est réactivé ; vous pouvez réessayer.`;
      setProspectingProgress('Recherche interrompue · vous pouvez réessayer.', 0);
    } finally { if (isCurrent()) { prospectingSearchInProgress = false; updateProspectingSearchAvailability(); } }
  }

  function selectDashboardModule(moduleName) {
    if (!dashboard) return;
    const projects = moduleName === 'projects';
    const prospecting = moduleName === 'prospection';
    const installers = moduleName === 'installateurs';
    const planning = moduleName === 'planning';
    const markets = moduleName === 'markets';
    const opportunities = moduleName === 'opportunities';
    const route = new URL(location.href);
    if (projects) route.searchParams.delete('module'); else route.searchParams.set('module', moduleName);
    if (route.href !== location.href) history.replaceState(null, '', route.href);
    if (!prospecting) invalidateProspectingResults();
    document.querySelectorAll('.hubSidebarNav [data-hub-module]').forEach((item) => {
      const active = item.dataset.hubModule === moduleName;
      item.classList.toggle('isActive', active);
      if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
    });
    $('hubPortfolioView').hidden = !projects;
    $('hubProspectingView').hidden = !prospecting;
    $('hubInstallerNetworkView').hidden = !installers;
    $('hubPlanningView').hidden = !planning;
    $('hubMarketNoticesView').hidden = !markets;
    $('hubOpportunitiesView').hidden = !opportunities;
    $('hubModulePlaceholder').hidden = projects || prospecting || installers || planning || markets || opportunities;
    $('hubGlobalSearchWrap').hidden = !projects;
    if (prospecting) {
      populateProspectingProjects();
      setTimeout(() => prospectingMap?.invalidateSize(), 0);
    } else if (installers) {
      installerNetwork?.selectDashboardModule();
    } else if (markets || opportunities) {
      window.ozenoMarketOpportunities?.activate(moduleName);
    } else if (!projects) {
      const [title, description] = dashboardModules[moduleName] || ['Module', 'Cette rubrique sera disponible dans une prochaine étape.'];
      $('hubModuleTitle').textContent = title;
      $('hubModuleDescription').textContent = description;
    }
  }
  async function persistDashboardProject(record, payload) {
    let source = record;
    if (record.scope === 'cloud' && (!record.preview || (record.prospectKey && !record.preview?.obiProspecting))) {
      const rows = await client.cloudProjects(await tokenSession(), record.id);
      source = rows[0] ? flatten(rows[0]) : null;
      if (!source?.preview || (record.prospectKey&&!source.preview.obiProspecting)) throw new Error('La fiche complète de ce projet est indisponible.');
    }
    const completePayload = { ...source, ...payload };
    let saved;
    if (record.scope === 'local') {
      const targetStore = client.draftStoreForRecord(store, deviceStore, record.id);
      saved = flatten(targetStore.save(completePayload, { id: record.id, expectedVersion: record.version || 0 }));
    } else {
      saved = flatten(await client.saveCloudProject(await tokenSession(), completePayload, { projectId: record.id, expectedVersion: record.version || 0 }));
      cloudRecords = cloudRecords.map((item) => item.id === record.id ? saved : item);
    }
    return saved;
  }
  window.addEventListener('ozeno:missions-change',(event)=>{
    if(!current||restoring||!missionTools)return;
    let plan;
    try {plan=missionTools.normalizeMissionPlan(event.detail.plan);}catch{return;}
    const targetId=current.id;
    const savedPlan=current.missionPlan??current.preview?.missionPlan;
    const previousMissionPlan=current.preview?.previousMissionPlan??(savedPlan?.missions?.includes('ACC_MANAGEMENT')?savedPlan:null);
    current={...current,missionPlan:plan,preview:{...current.preview,...(previousMissionPlan?{previousMissionPlan}:{}),missionPlan:plan}};
    dirty=true;
    if(!event.detail.persist)return;
    missionSaveChain=missionSaveChain.then(async()=>{
      if(current?.id!==targetId)return;
      try {
        const saved=await persistDashboardProject(current,{missionPlan:plan});
        if(current?.id===targetId)current={...current,version:saved.version};
        notice('Missions enregistrées et synchronisées avec le tableau de bord. Les autres saisies de la pré-étude restent à enregistrer.');
      }catch(error){notice(`Missions non enregistrées : ${error.message}`,true);}
    });
  });
  function missionSelector(record) {
    const details=document.createElement('details');details.className='hubMissionSelector';
    const plan=missionTools.missionPlanForRecord(record),summary=element('summary',missionTools.missionLabels(plan).join(' + '));
    details.append(summary);
    if(plan.qualificationRequired)details.append(element('small','Ancienne classification conservée · choisissez les missions actuelles.'));
    const choices=document.createElement('fieldset');choices.setAttribute('aria-label',`Missions d’OZENO pour ${record.name||'ce projet'}`);
    for(const [key,label] of Object.entries(missionTools.MISSION_LABELS)) {
      const row=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.value=key;box.checked=plan.missions.includes(key);row.append(box,document.createTextNode(label));choices.append(row);
      if(missionTools.MISSION_AVAILABILITY[key]===false){box.disabled=true;box.title='Gestion ACC en préparation · indisponible.';row.dataset.unavailable='true';}
      box.addEventListener('change',async()=>{
        if(missionTools.MISSION_AVAILABILITY[key]===false){box.checked=plan.missions.includes(key);return;}
        const selected=Array.from(choices.querySelectorAll('input:checked'),node=>node.value);
        let next;
        try {next=missionTools.withMissions(plan,selected);}catch(error){box.checked=!box.checked;notice(error.message,true);return;}
        choices.disabled=true;
        try {await persistDashboardProject(record,{missionPlan:next});renderDashboard();notice('Missions enregistrées. AMO et gestion ACC seront reprises dans la pré-étude ; complétez les assiettes pour chiffrer les honoraires.');}
        catch(error){box.checked=!box.checked;notice(`Missions non enregistrées : ${error.message}`,true);}
        finally{choices.disabled=false;}
      });
    }
    details.append(choices);return details;
  }
  async function updateCrmStage(record, nextStage, control) {
    const previousStage = crmStageOf(record);
    control.disabled = true;
    try {
      const changedAt = new Date().toISOString();
      const crmStageHistory = [...(Array.isArray(record.crmStageHistory) ? record.crmStageHistory : []), { from: previousStage, to: nextStage, changedAt }].slice(-200);
      await persistDashboardProject(record, {
        crmStage: nextStage,
        crmArchived: crmStageIsTerminal(nextStage),
        crmStageHistory,
        crmStageChangedAt: changedAt,
        commercialStatus: legacyStatusForCrmStage(nextStage),
        managementContractStatus: legacyContractStatusForCrmStage(nextStage, record)
      });
      renderDashboard();
      notice(`Étape du projet mise à jour : ${crmStageLabels[nextStage]}.`);
      if (stageActionSuggestions[nextStage]) openStageActionPrompt(record.id, nextStage);
    } catch (error) {
      control.value = previousStage;
      notice(`Modification de l’étape impossible : ${error.message}`, true);
    } finally { control.disabled = false; }
  }
  function openStageActionPrompt(projectId, stage) {
    const suggestion = stageActionSuggestions[stage], form = $('hubStageActionForm'), dialog = $('hubStageActionDialog');
    const record = dashboardRecords.find((item) => item.id === projectId);
    if (!suggestion || !record || !form || !dialog?.showModal) return;
    form.dataset.projectId = projectId;
    form.elements.type.value = suggestion.type;
    form.elements.title.value = suggestion.title;
    form.elements.dueDate.value = new Date().toISOString().slice(0, 10);
    form.elements.startTime.value = ''; form.elements.endTime.value = '';
    form.elements.notes.value = '';
    $('hubStageActionContext').textContent = `${record.name || 'Projet'} · ${crmStageLabels[stage]}. La modification de l’étape est enregistrée ; souhaitez-vous ajouter une échéance de suivi ?`;
    dialog.showModal();
  }
  function allPlannedActions() {
    return dashboardRecords.flatMap((record) => (Array.isArray(record.plannedActions) ? record.plannedActions : []).map((action) => ({ ...action, projectId: record.id, projectName: record.name || 'Projet sans nom', scope: record.scope, record })));
  }
  function icsEscape(value) {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  }
  function foldIcsLine(line) {
    const parts = []; let current = ''; let bytes = 0;
    for (const character of line) {
      const size = new TextEncoder().encode(character).length;
      if (bytes + size > 75) { parts.push(current); current = ' '; bytes = 1; }
      current += character; bytes += size;
    }
    parts.push(current); return parts.join('\r\n');
  }
  function icsDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return null;
    const parsed = new Date(`${date}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  function icsUtcDateTime(value) {
    return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }
  function validatePlanningTimes(form) {
    const start = form.elements.startTime, end = form.elements.endTime;
    if (!start || !end) return true;
    start.setCustomValidity(''); end.setCustomValidity('');
    if (Boolean(start.value) !== Boolean(end.value)) {
      (start.value ? end : start).setCustomValidity('Renseignez les deux horaires ou laissez-les vides pour une tâche à échéance.');
      form.reportValidity(); return false;
    }
    if (start.value && end.value && end.value <= start.value) {
      end.setCustomValidity('L’heure de fin doit être postérieure à l’heure de début.');
      form.reportValidity(); return false;
    }
    return true;
  }
  function downloadPlanningIcs() {
    const actions = allPlannedActions().filter((action) => action.status === 'PLANNED' && icsDate(action.dueDate));
    if (!actions.length) { notice('Aucune action à faire avec une date valide à exporter.', true); return; }
    const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OZENO//Planning commercial//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:OZENO - Actions du portefeuille'];
    for (const action of actions) {
      const start = icsDate(action.dueDate); const end = new Date(start.getTime() + 86400000);
      const dateValue = (value) => value.toISOString().slice(0, 10).replace(/-/g, '');
      const hasTime = Boolean(action.startTime && action.endTime);
      const timedStart = hasTime ? new Date(`${action.dueDate}T${action.startTime}:00`) : null;
      const timedEnd = hasTime ? new Date(`${action.dueDate}T${action.endTime}:00`) : null;
      const timed = Boolean(timedStart && timedEnd && Number.isFinite(timedStart.getTime()) && Number.isFinite(timedEnd.getTime()) && timedEnd > timedStart);
      const stableId = String(action.id || `${action.projectId}-${action.dueDate}-${action.title}`).replace(/[^A-Za-z0-9._-]/g, '-');
      const description = [`Projet : ${action.projectName}`, `Action : ${actionTypeLabels[action.type] || action.type || 'Action'}`, `Nature : ${timed ? 'Créneau planifié' : 'À faire avant cette date'}`, action.notes ? `Notes : ${action.notes}` : ''].filter(Boolean).join('\n');
      lines.push('BEGIN:VEVENT', `UID:${stableId}@ozeno.local`, `DTSTAMP:${now}`);
      if (timed) lines.push(`DTSTART:${icsUtcDateTime(timedStart)}`, `DTEND:${icsUtcDateTime(timedEnd)}`);
      else lines.push(`DTSTART;VALUE=DATE:${dateValue(start)}`, `DTEND;VALUE=DATE:${dateValue(end)}`);
      lines.push(`SUMMARY:${icsEscape(timed ? action.title : `À faire · ${action.title}`)}`, `DESCRIPTION:${icsEscape(description)}`, `CATEGORIES:${icsEscape(actionTypeLabels[action.type] || 'Action')}`, 'STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.map(foldIcsLine).join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `ozeno-planning-${new Date().toISOString().slice(0, 10)}.ics`; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice(`${actions.length} action${actions.length > 1 ? 's' : ''} exportée${actions.length > 1 ? 's' : ''} en ICS. Cet export est une copie à importer.`);
  }
  function renderPlanning() {
    const host = $('hubPlanningActions');
    if (!host) return;
    const allActions = allPlannedActions();
    const outstandingCount = allActions.filter((action) => action.status === 'PLANNED').length;
    if ($('hubPlanningCount')) $('hubPlanningCount').textContent = String(outstandingCount);
    if ($('hubPlanningExport')) $('hubPlanningExport').disabled = outstandingCount === 0;
    const filter = $('hubPlanningFilter')?.value || 'active';
    const today = new Date().toISOString().slice(0, 10);
    let actions = allActions.filter((action) => filter === 'all' || (filter === 'active' ? action.status === 'PLANNED' : action.status === filter.toUpperCase()));
    actions.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.projectName.localeCompare(b.projectName, 'fr'));
    host.replaceChildren();
    if (!actions.length) {
      host.append(element('p', filter === 'active' ? 'Aucune action à venir. Planifiez un appel, une visite ou une relance depuis le formulaire.' : 'Aucune action dans cette vue.', 'hubEmpty'));
      return;
    }
    for (const action of actions) {
      const card = element('article', '', `hubPlanningAction ${action.status === 'PLANNED' && action.dueDate < today ? 'isOverdue' : ''}`);
      const heading = element('div', '', 'hubPlanningActionHeading');
      heading.append(element('div', action.title, 'hubPlanningActionTitle'));
      const due = new Date(`${action.dueDate}T12:00:00`);
      const dueLabel = `Échéance ${due.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}${action.startTime && action.endTime ? ` · ${action.startTime}–${action.endTime}` : ' · à faire'}`;
      heading.append(element('time', dueLabel, 'hubPlanningDue'));
      card.append(heading);
        const projectLink = element('a', action.projectName);
        projectLink.href = projectPrestudyHref({ id: action.projectId, scope: action.scope });
      const detail = element('div', '', 'hubPlanningMeta');
      detail.append(element('span', actionTypeLabels[action.type] || 'Action'), element('span', '·'), projectLink, element('span', '·'), element('span', actionStatusLabels[action.status] || action.status));
      if (action.source === 'ACC_PROSPECT_FOLLOW_UP' && action.sourceProspectId) {
        const prospectLink = element('a', 'Ouvrir la fiche ACC');
        prospectLink.href = `./acc-prospects.html?projectId=${encodeURIComponent(action.projectId)}&prospectId=${encodeURIComponent(action.sourceProspectId)}`;
        detail.append(element('span', '·'), prospectLink);
      }
      card.append(detail);
      if (action.createdAt) {
        const recordedAt = new Date(action.createdAt);
        if (Number.isFinite(recordedAt.getTime())) card.append(element('small', `Enregistrée le ${recordedAt.toLocaleDateString('fr-FR')}`, 'hubStageChangedAt'));
      }
      if (action.status === 'DONE') {
        const actualDate = action.occurredAt ? new Date(action.occurredAt) : null;
        const recordedDate = action.completedAt ? new Date(action.completedAt) : null;
        if (actualDate && Number.isFinite(actualDate.getTime())) card.append(element('small', `Réalisée le ${actualDate.toLocaleDateString('fr-FR')}`, 'hubStageChangedAt'));
        else if (recordedDate && Number.isFinite(recordedDate.getTime())) card.append(element('small', `Clôturée le ${recordedDate.toLocaleDateString('fr-FR')} · date réelle non renseignée`, 'hubStageChangedAt'));
      }
      if (action.notes) card.append(element('p', action.notes, 'hubPlanningNotes'));
      if (action.status === 'PLANNED') {
        const buttons = element('div', '', 'hubPlanningButtons');
        const done = element('button', 'Marquer terminée', 'hubSecondary'); done.type = 'button';
        done.addEventListener('click', () => openActionCompletionPrompt(action));
        const cancel = element('button', 'Annuler', 'hubDiscard'); cancel.type = 'button';
        cancel.addEventListener('click', () => updatePlannedAction(action, 'CANCELLED'));
        buttons.append(done, cancel); card.append(buttons);
      }
      host.append(card);
    }
  }
  let pendingCompletionAction = null;
  function openActionCompletionPrompt(action) {
    const dialog = $('hubActionCompletionDialog'), form = $('hubActionCompletionForm');
    if (!dialog?.showModal || !form) return;
    pendingCompletionAction = action;
    form.elements.occurredAt.value = new Date().toISOString().slice(0, 10);
    $('hubActionCompletionContext').textContent = `${action.title} · ${action.projectName}. La date prévue (${new Date(`${action.dueDate}T12:00:00`).toLocaleDateString('fr-FR')}) reste conservée séparément.`;
    dialog.showModal();
  }
  async function completePlannedAction(event) {
    event.preventDefault();
    if (!pendingCompletionAction) return;
    const action = pendingCompletionAction;
    const record = dashboardRecords.find((item) => item.id === action.projectId) || action.record;
    const occurredAt = new Date(`${$('hubActionCompletionForm').elements.occurredAt.value}T12:00:00`).toISOString();
    const actions = (record.plannedActions || []).map((entry) => entry.id === action.id
      ? { ...entry, status: 'DONE', completedAt: new Date().toISOString(), occurredAt } : entry);
    const submit = $('hubActionCompletionForm').querySelector('[type="submit"]'); submit.disabled = true;
    try {
      await persistDashboardProject(record, { plannedActions: actions });
      $('hubActionCompletionDialog').close(); pendingCompletionAction = null;
      renderDashboard(); notice('Action réalisée et date réelle enregistrée.');
    } catch (error) { notice(`Clôture de l’action impossible : ${error.message}`, true); }
    finally { submit.disabled = false; }
  }
  async function updatePlannedAction(action, status) {
    try {
      const actions = (action.record.plannedActions || []).map((entry) => entry.id === action.id
        ? { ...entry, status, completedAt: '', occurredAt: '' } : entry);
      await persistDashboardProject(action.record, { plannedActions: actions });
      renderDashboard();
      notice(status === 'DONE' ? 'Action clôturée.' : 'Action annulée.');
    } catch (error) { notice(`Modification de l’action impossible : ${error.message}`, true); }
  }
  async function createPlannedAction(event) {
    event.preventDefault();
    const form = $('hubPlanningForm'), projectId = form.elements.project.value;
    if (!validatePlanningTimes(form)) return;
    const record = dashboardRecords.find((item) => item.id === projectId);
    if (!record) { notice('Choisissez un projet pour planifier cette action.', true); return; }
    const action = {
      id: crypto.randomUUID(), type: form.elements.type.value, title: form.elements.title.value.trim(),
      dueDate: form.elements.dueDate.value, startTime: form.elements.startTime.value, endTime: form.elements.endTime.value, notes: form.elements.notes.value.trim(), status: 'PLANNED',
      createdAt: new Date().toISOString(), completedAt: '', occurredAt: ''
    };
    const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
    try {
      await persistDashboardProject(record, { plannedActions: [...(record.plannedActions || []), action] });
      form.elements.title.value = ''; form.elements.notes.value = ''; form.elements.startTime.value = ''; form.elements.endTime.value = '';
      renderDashboard();
      notice('Action ajoutée au planning.');
    } catch (error) { notice(`Planification impossible : ${error.message}`, true); }
    finally { submit.disabled = false; }
  }
  async function createStageSuggestedAction(event) {
    event.preventDefault();
    const form = $('hubStageActionForm'), projectId = form.dataset.projectId;
    if (!validatePlanningTimes(form)) return;
    const record = dashboardRecords.find((item) => item.id === projectId);
    if (!record) { notice('Le projet n’est plus disponible dans le portefeuille.', true); return; }
    const action = {
      id: crypto.randomUUID(), type: form.elements.type.value, title: form.elements.title.value.trim(),
      dueDate: form.elements.dueDate.value, startTime: form.elements.startTime.value, endTime: form.elements.endTime.value, notes: form.elements.notes.value.trim(), status: 'PLANNED',
      createdAt: new Date().toISOString(), completedAt: '', occurredAt: ''
    };
    const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
    try {
      await persistDashboardProject(record, { plannedActions: [...(record.plannedActions || []), action] });
      $('hubStageActionDialog').close(); renderDashboard();
      notice('Action ajoutée au planning.');
    } catch (error) { notice(`Planification impossible : ${error.message}`, true); }
    finally { submit.disabled = false; }
  }
  async function updateCommercialStatus(record, nextStatus, control) {
    const previousStatus = commercialStatusOf(record);
    control.disabled = true;
    try {
      if (record.scope === 'local') {
        const targetStore = client.draftStoreForRecord(store, deviceStore, record.id);
        targetStore.save({ ...record, commercialStatus: nextStatus }, { id: record.id, expectedVersion: record.version || 0 });
      } else {
        const token = await tokenSession();
        const updated = await client.setCommercialProjectStatus(token, record.id, nextStatus, record.version || 0);
        cloudRecords = cloudRecords.map((item) => item.id === record.id ? flatten(updated) : item);
      }
      renderDashboard();
      notice(`Statut commercial mis à jour : ${commercialStatusLabels[nextStatus]}.`);
    } catch (error) {
      control.value = previousStatus;
      notice(`Modification du statut impossible : ${error.message}`, true);
    } finally { control.disabled = false; }
  }
  async function updatePipelineCategory(record, nextCategory, control) {
    const previousCategory = client.projectPipelineCategory(record);
    control.disabled = true;
    try {
      let source = record;
      if (record.scope === 'cloud' && record.prospectKey && !record.preview?.obiProspecting) {
        const rows = await client.cloudProjects(await tokenSession(), record.id);
        source = rows[0] ? flatten(rows[0]) : null;
        if (!source?.preview?.obiProspecting) throw new Error('La fiche de prospection complète est indisponible ; le statut n’a pas été modifié.');
      }
      const payload = { ...source, pipelineCategory: nextCategory };
      if (record.scope === 'local') {
        const targetStore = client.draftStoreForRecord(store, deviceStore, record.id);
        targetStore.save(payload, { id: record.id, expectedVersion: record.version || 0 });
      } else {
        const token = await tokenSession();
        const updated = await client.saveCloudProject(token, payload, { projectId: record.id, expectedVersion: record.version || 0 });
        cloudRecords = cloudRecords.map((item) => item.id === record.id ? flatten(updated) : item);
      }
      renderDashboard();
      notice(`Étape du dossier mise à jour : ${pipelineCategoryLabels[nextCategory]}.`);
    } catch (error) {
      control.value = previousCategory;
      notice(`Modification de l’étape impossible : ${error.message}`, true);
    } finally { control.disabled = false; }
  }
  async function updateOperationMode(record, nextMode, control) {
    const previousMode = operationModeOf(record);
    control.disabled = true;
    try {
      let source = record;
      if (record.scope === 'cloud' && record.prospectKey && !record.preview?.obiProspecting) {
        const rows = await client.cloudProjects(await tokenSession(), record.id);
        source = rows[0] ? flatten(rows[0]) : null;
        if (!source?.preview?.obiProspecting) throw new Error('La fiche de prospection complète est indisponible ; le mode d’intervention n’a pas été modifié.');
      }
      const payload = { ...source, operationMode: nextMode };
      if (record.scope === 'local') {
        const targetStore = client.draftStoreForRecord(store, deviceStore, record.id);
        targetStore.save(payload, { id: record.id, expectedVersion: record.version || 0 });
      } else {
        const updated = await client.saveCloudProject(await tokenSession(), payload, { projectId: record.id, expectedVersion: record.version || 0 });
        cloudRecords = cloudRecords.map((item) => item.id === record.id ? flatten(updated) : item);
      }
      renderDashboard();
      notice(`Opération OZENO mise à jour : ${operationModeLabels[nextMode]}.`);
    } catch (error) {
      control.value = previousMode;
      notice(`Modification de l’opération impossible : ${error.message}`, true);
    } finally { control.disabled = false; }
  }
  async function updateManagementContractStatus(record, nextStatus, control) {
    const previousStatus = managementContractStatusLabels[record.managementContractStatus] ? record.managementContractStatus : 'UNSPECIFIED';
    control.disabled = true;
    try {
      let source = record;
      if (record.scope === 'cloud' && record.prospectKey && !record.preview?.obiProspecting) {
        const rows = await client.cloudProjects(await tokenSession(), record.id);
        source = rows[0] ? flatten(rows[0]) : null;
        if (!source?.preview?.obiProspecting) throw new Error('La fiche de prospection complète est indisponible ; le statut du contrat n’a pas été modifié.');
      }
      const payload = { ...source, managementContractStatus: nextStatus };
      if (record.scope === 'local') {
        const targetStore = client.draftStoreForRecord(store, deviceStore, record.id);
        targetStore.save(payload, { id: record.id, expectedVersion: record.version || 0 });
      } else {
        const updated = await client.saveCloudProject(await tokenSession(), payload, { projectId: record.id, expectedVersion: record.version || 0 });
        cloudRecords = cloudRecords.map((item) => item.id === record.id ? flatten(updated) : item);
      }
      renderDashboard();
      notice(`Contrat de gestion mis à jour : ${managementContractStatusLabels[nextStatus]}.`);
    } catch (error) {
      control.value = previousStatus;
      notice(`Modification du contrat impossible : ${error.message}`, true);
    } finally { control.disabled = false; }
  }
  async function openSavedProspect(record) {
    try {
      let savedRecord = record;
      if (record.scope === 'cloud') {
        const rows = await client.cloudProjects(await tokenSession(), record.id);
        savedRecord = rows[0] ? flatten(rows[0]) : null;
      } else {
        savedRecord = client.draftStoreForRecord(store, deviceStore, record.id).get(record.id);
      }
      const snapshot = savedRecord?.preview?.obiProspecting;
      if (snapshot?.recordType !== 'OBI_PROSPECTING_SNAPSHOT' || !snapshot.viewModel || !snapshot.candidate) {
        throw new Error('La fiche de prospection enregistrée est incomplète ou indisponible.');
      }
      let savedDialog = $('hubSavedProspectDialog');
      if (!savedDialog) {
        savedDialog = dialog('hubSavedProspectDialog', 'Fiche de prospection enregistrée', '<div id="hubSavedProspectBody"></div>');
        savedDialog.addEventListener('close', () => $('hubSavedProspectBody')?.replaceChildren());
      }
      showDialog('hubSavedProspectDialog');
      const { mountQualificationPreview } = await import('./obi-qualification-preview.mjs');
      const model = { ...snapshot.viewModel, geometry: snapshot.candidate.geometry };
      mountQualificationPreview($('hubSavedProspectBody'), {
        model,
        candidate: snapshot.candidate,
        reference: snapshot.publicReference,
        energy: snapshot.viewModel.energy,
        isProspectSaved: true,
        eetRegulatoryEnabled: OBI_LOCAL_FLAG_ENABLED,
        onReturn: () => savedDialog.close(),
        onSaveProspect: () => {},
        onStartStudy: () => {
          savedDialog.close();
          openSave('new', {
            name: `Pré-étude PV · contour ${snapshot.candidate.osmId}`,
            latitude: Number(snapshot.candidate.latitude), longitude: Number(snapshot.candidate.longitude),
            coordinateSource: 'PROSPECTING_OSM_BUILDING', pipelineCategory: 'IN_PROGRESS'
          });
        }
      });
    } catch (error) {
      notice(`Fiche de prospection indisponible : ${error.message}`, true);
    }
  }

  function renderDashboard() {
    let records;
    try {
      records = [...client.mergeLocalProjectRecords(store.list(), deviceStore.list()), ...cloudRecords];
    }
    catch (error) { notice(error.message, true); records = cloudRecords; }
    dashboardRecords = records;
    populateProspectingProjects();
    const search = $('hubSearch').value.toLocaleLowerCase('fr');
    const filter = $('hubFilter').value;
    const shown = records.filter((record) => matchesProjectFilter(record, filter) && [record.name, record.address, record.clientName, record.installerName].some((value) => safeText(value).toLocaleLowerCase('fr').includes(search)));
    const select = $('hubFilter'); const previous = select.value;
    select.replaceChildren(...[['all', 'Tous les projets'], ['local', 'Brouillons locaux'], ['cloud', 'Compte connecté'], ...Object.entries(crmStageLabels)].map(([value, label]) => { const option = element('option', label); option.value = value; return option; }));
    select.value = [...select.options].some((option) => option.value === previous) ? previous : 'all';
    const planningProject = $('hubPlanningForm')?.elements.project;
    if (planningProject) {
      const selectedProjectId = planningProject.value;
      const prompt = element('option', 'Choisir un projet'); prompt.value = '';
      planningProject.replaceChildren(prompt);
      records.forEach((record) => {
        const option = element('option', `${record.name || 'Projet sans nom'}${record.address ? ` · ${record.address}` : ''}`);
        option.value = record.id; planningProject.append(option);
      });
      planningProject.value = records.some((record) => record.id === selectedProjectId) ? selectedProjectId : '';
    }
    const body = $('hubProjectsBody'); body.replaceChildren();
    const commissionRange = (c) => `${Math.round(c.lowEur).toLocaleString('fr-FR')}–${Math.round(c.highEur).toLocaleString('fr-FR')} €`;
    const pipelineCounts = client.projectPipelineCounts(records.map((record) => ({ ...record, commercialStatus: commercialStatusOf(record) })));
    $('hubValidatedProjects').textContent = String(pipelineCounts.VALIDATED);
    $('hubInProgressProjects').textContent = String(pipelineCounts.IN_PROGRESS);
    $('hubPendingProjects').textContent = pipelineCounts.PENDING ? String(pipelineCounts.PENDING) : '—';
    const accModes = new Set(['ACC_MANAGEMENT', 'INSTALLATION_AND_ACC']);
    const accRecords = records.filter((record) => (record.missionPlan??record.preview?.missionPlan)?missionTools.missionPlanForRecord(record).missions.includes('ACC_MANAGEMENT'):accModes.has(operationModeOf(record)));
    $('hubProspectingProjects').textContent = String(accRecords.length);
    $('hubSidebarProjectCount').textContent = String(records.length);
    if (ooiView) {
      const pipelineRecords = Object.fromEntries(['VALIDATED', 'IN_PROGRESS', 'PENDING', 'PROSPECTING'].map((category) => [
        category,
        records.filter((record) => client.projectPipelineCategory({ ...record, commercialStatus: commercialStatusOf(record) }) === category)
      ]));
      ooiView.portfolioPresentation({ records, pipelineCounts, pipelineRecords, accRecords });
    }
    const columnLabels = Array.from(document.querySelectorAll('.hubProjects thead th'), (header) => header.textContent.trim());
    for (const record of shown) {
      const row = document.createElement('tr'); const nameCell = document.createElement('td');
      const link = element('a', record.name, 'hubProjectLink');
      link.href = projectPrestudyHref(record);
      nameCell.append(link, element('small', record.address || 'Site à localiser'));
      if (crmArchivedOf(record)) nameCell.append(element('small', 'Archivé automatiquement', 'hubArchivedTag'));
      if (record.prospectStatus === 'PENDING_MANDATAIRE_REVIEW') nameCell.append(element('small', 'Qualification en attente · à vérifier par le mandataire', 'hubProspectPendingStatus'));
      if (ooiView) ooiView.appendPortfolioPreview(record, nameCell);
      if (ooiView) nameCell.appendChild(element('small', `Client : ${record.clientName || 'Non renseigné'}`, 'hubProjectClient'));
      row.appendChild(nameCell);
      row.appendChild(element('td', record.clientName || 'Non renseigné'));
      row.appendChild(element('td', record.installerName || 'À identifier'));
      const operationCell = document.createElement('td');
      const operationSelect = document.createElement('select');
      const operationMode = operationModeOf(record);
      operationSelect.setAttribute('aria-label', `Opération OZENO pour ${record.name || 'ce projet'}`);
      operationSelect.title = 'Mode d’intervention prévu pour ce projet. Les options de gestion financière restent configurées dans la pré-étude.';
      Object.entries(operationModeLabels).forEach(([value, label]) => { const option = element('option', label); option.value = value; operationSelect.append(option); });
      operationSelect.value = operationMode;
      operationSelect.addEventListener('change', () => updateOperationMode(record, operationSelect.value, operationSelect));
      operationCell.appendChild(missionTools?missionSelector(record):operationSelect); row.appendChild(operationCell);
      const status = document.createElement('td');
      const stage = crmStageOf(record);
      const statusSelect = document.createElement('select'); statusSelect.className = `hubCommercialStatusSelect ${crmStageClasses[stage] || 'progress'}`;
      statusSelect.setAttribute('aria-label', `Étape du projet ${record.name || 'ce projet'}`);
      statusSelect.title = 'La négociation est incluse dans l’étape de proposition. Les dossiers abandonnés, résiliés ou terminés sont archivés automatiquement.';
      Object.entries(crmStageLabels).forEach(([value, label]) => { const option = element('option', label); option.value = value; statusSelect.append(option); });
      if (!crmStageLabels[stage]) { const archived = element('option', 'Dossier classé (historique)'); archived.value = stage; archived.disabled = true; statusSelect.append(archived); }
      statusSelect.value = stage;
      statusSelect.addEventListener('change', () => updateCrmStage(record, statusSelect.value, statusSelect));
      status.appendChild(statusSelect); row.appendChild(status);
      if (record.crmStageChangedAt) {
        const changedAt = new Date(record.crmStageChangedAt);
        if (Number.isFinite(changedAt.getTime())) status.appendChild(element('small', `Modifiée le ${changedAt.toLocaleDateString('fr-FR')}`, 'hubStageChangedAt'));
      }
      row.appendChild(element('td', record.installationDate ? new Date(`${record.installationDate}T12:00:00`).toLocaleDateString('fr-FR') : 'Non renseignée'));
      const commission = client.installerCommissionForPreview(record.preview);
      const commissionLabel = commission ? `${commissionRange(commission)} · estimation 8–10 %` : 'À renseigner';
      row.appendChild(element('td', commissionLabel));
      row.appendChild(element('td', ooiView ? ooiView.portfolioMetadata(record).dateLabel : record.updatedAt ? new Date(record.updatedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'Non renseignée'));
      const action = document.createElement('td');
      if (ooiView) {
        const preview = element('button', 'Aperçu', 'hubSecondary'); preview.type = 'button';
        preview.setAttribute('aria-label', `Aperçu de ${record.name || 'ce projet'}`);
        preview.addEventListener('click', () => ooiView.showPortfolioPreview(record, link.href, ooiView.portfolioStates(record), commissionLabel));
        action.append(preview);
      }
      if (record.prospectKey) {
        const fiche = element('button', 'Fiche', 'hubSecondary'); fiche.type = 'button';
        fiche.title = 'Ouvrir la fiche complète enregistrée'; fiche.setAttribute('aria-label', `Ouvrir la fiche de prospection ${record.name || ''}`);
        fiche.addEventListener('click', () => openSavedProspect(record)); action.appendChild(fiche);
      }
      const plan = element('button', 'Planifier', 'hubSecondary'); plan.type = 'button';
      plan.setAttribute('aria-label', `Planifier une action pour ${record.name || 'ce projet'}`);
      plan.addEventListener('click', () => { selectDashboardModule('planning'); if ($('hubPlanningForm')?.elements.project) $('hubPlanningForm').elements.project.value = record.id; $('hubPlanningForm')?.elements.title?.focus(); });
      action.appendChild(plan);
      const open = element('a', 'Ouvrir', 'hubOpen'); open.href = link.href; action.appendChild(open); row.appendChild(action); body.appendChild(row);
      Array.from(row.children).forEach((cell, index) => cell.setAttribute('data-label', columnLabels[index] || ''));
    }
    $('hubProjectCount').textContent = `${shown.length} projet${shown.length > 1 ? 's' : ''}`;
    $('hubEmpty').hidden = shown.length > 0;
    $('hubEmpty').textContent = records.length ? 'Aucun projet ne correspond à votre recherche.' : 'Aucun projet enregistré ici. Commencez par un nouveau projet ou connectez-vous pour retrouver vos dossiers.';
    updateProjectMap(shown);
    renderPlanning();
    if (cloudError) notice(cloudError, true);
    else if (!identity) notice('Non connecté · seuls les brouillons de ce navigateur sont affichés.');
    else notice('Projets du compte autorisés et brouillons locaux de ce navigateur, y compris ceux créés avant connexion.');
  }
  function portfolioPreviewOnly(preview = {}) {
    const controlKeys = ['roofTotal', 'annual', 'annualManualFallbackKwh', 'annualManualFallbackSource', 'cons', 'capexPerKwp', 'aciPrice', 'accPrice', 'debtShare'];
    const controls = Object.fromEntries(controlKeys.filter((key) => preview.controls?.[key] != null).map((key) => [key, preview.controls[key]]));
    const metrics = Object.fromEntries(['capexEur', 'productionKwh', 'powerKwp']
      .filter((key) => preview.portfolioMetrics?.[key] != null)
      .map((key) => [key, preview.portfolioMetrics[key]]));
    const surfaces = Array.isArray(preview.roofs?.surfaces)
      ? preview.roofs.surfaces.filter((surface) => ['Polygon', 'MultiPolygon'].includes(surface?.geometry?.geometry?.type))
        .map((surface) => ({ geometry: surface.geometry }))
      : [];
    return { controls, portfolioMetrics: metrics, roofs: { surfaces }, risks: Array.isArray(preview.risks) && preview.risks.length ? [{}] : [] };
  }
  async function hydrateCloudPortfolioPreviews(token) {
    const pending = cloudRecords.filter((record) => record.scope === 'cloud' && !record.preview && !record.portfolioSummary);
    let cursor = 0, changed = false;
    const worker = async () => {
      while (cursor < pending.length) {
        const record = pending[cursor++];
        try {
          const [row] = await client.cloudProjects(token, record.id);
          const full = row ? flatten(row) : null;
          if (!full || !full.preview || typeof full.preview !== 'object') continue;
          const latest = cloudRecords.find((candidate) => candidate.id === record.id);
          if (!latest || latest.version !== record.version) continue;
          const portfolioSummary = portfolioPreviewOnly(full.preview);
          cloudRecords = cloudRecords.map((candidate) => candidate.id === record.id ? { ...candidate, portfolioSummary } : candidate);
          changed = true;
        } catch (error) {
          console.warn(`Synthèse du dossier ${record.id} indisponible`, error);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, pending.length) }, worker));
    if (changed && dashboard) renderDashboard();
  }
  async function boot() {
    const stylesheet = document.createElement('link'); stylesheet.rel = 'stylesheet'; stylesheet.href = './project-hub.css'; document.head.appendChild(stylesheet);
    client = await import('./project-hub-client.mjs?v=20261110-location-restore-2');
    missionTools=await import('./ozeno-missions.mjs');
    // Local data and navigation must not wait for authentication or Supabase availability.
    deviceStore = client.createDraftStore(localStorage, 'anonymous');
    store = deviceStore;
    const host = element('p', '', 'hubNotice'); host.id = 'hubNotice'; host.setAttribute('role', 'status'); host.hidden = true;
    (document.querySelector('main') || document.body).prepend(host);
    emptyPreview = capturePreview();
    emptyPreview.roofs = {}; emptyPreview.risks = [];
    ['roofTotal', 'manualAzimuth', 'orientation', 'tilt', 'shade', 'roof', 'cons', 'reportTitle', 'reportConclusion'].forEach((id) => { emptyPreview.controls[id] = ''; });
    buildSaveDialog(); buildProfileDialog();
    dialog('hubShareDialog', 'Partager ce projet', '<p id="hubShareState" class="hubMuted"></p><input id="hubShareLink" readonly aria-label="Lien du projet"><div class="hubActions"><button class="hubPrimary" type="button" id="hubShareCopy">Copier le lien</button></div>');
    $('hubShareCopy').onclick = async () => {
      try { await navigator.clipboard.writeText($('hubShareLink').value); $('hubShareCopy').textContent = 'Lien copié'; }
      catch { $('hubShareLink').select(); $('hubShareState').textContent += ' Sélectionnez et copiez le lien.'; }
    };
    buildNavigation();
    if (!dashboard) {
      const saveButton = $('newProject');
      if (saveButton) {
        saveButton.textContent = 'Enregistrer le projet';
        // Older demo modules bind onclick on window.load. Intercept before those handlers.
        saveButton.addEventListener('click', (event) => { event.preventDefault(); event.stopImmediatePropagation(); openSave(); }, true);
      }
      if ($('newProjectName')) $('newProjectName').hidden = true;
      if ($('connectionProjectWrap')) $('connectionProjectWrap').hidden = true;
      if ($('newProjectFeedback')) $('newProjectFeedback').textContent = '';
      const siteHeading = document.querySelector('.newProject > b');
      if (siteHeading) siteHeading.textContent = 'Localisation';
      // The dashboard already selected the dossier before opening this workspace.
      // Keep project switching in the dashboard, not in a duplicate in-page selector.
      $('commercialProjectPicker')?.closest('label')?.remove();
    }
    if (dashboard) {
      const routeParams = new URLSearchParams(location.search);
      const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
      if (routeParams.get('module') === 'prospection'
        && localHosts.has(String(location.hostname).toLowerCase())
        && !routeParams.has(OBI_TERTIARY_FLAG)) {
        // An explicit local route to the new prospecting screen opts into its preview.
        // The portfolio remains flag-OFF, and an explicit OBI=false remains respected.
        routeParams.set(OBI_TERTIARY_FLAG, 'true');
        location.replace(`${location.pathname}?${routeParams}${location.hash}`);
        return;
      }
      $('hubNewProject').onclick = () => openSave('new');
      document.querySelectorAll('.hubSidebarNav [data-hub-module]').forEach((item) => item.addEventListener('click', (event) => {
        event.preventDefault();
        if (item.dataset.hubModule === 'prospection') {
          const url = new URL(location.href);
          url.searchParams.set('module', 'prospection');
          if (localHosts.has(String(location.hostname).toLowerCase()) && !url.searchParams.has(OBI_TERTIARY_FLAG)) {
            url.searchParams.set(OBI_TERTIARY_FLAG, 'true');
          }
          location.assign(url.href);
          return;
        }
        selectDashboardModule(item.dataset.hubModule);
      }));
      const initialModule = new URLSearchParams(location.search).get('module');
      if (initialModule === 'prospection') selectDashboardModule('prospection');
      else if (initialModule === 'markets' || initialModule === 'opportunities') selectDashboardModule(initialModule);
      else if (location.hash === '#planning') selectDashboardModule('planning');
      $('hubBackToProjects').onclick = () => selectDashboardModule('projects');
      $('hubPlanningForm')?.addEventListener('submit', createPlannedAction);
      $('hubPlanningFilter')?.addEventListener('change', renderPlanning);
      $('hubPlanningExport')?.addEventListener('click', downloadPlanningIcs);
      $('hubStageActionForm')?.addEventListener('submit', createStageSuggestedAction);
      $('hubActionCompletionForm')?.addEventListener('submit', completePlannedAction);
      document.querySelector('[data-close-stage-action]')?.addEventListener('click', () => $('hubStageActionDialog')?.close());
      document.querySelector('[data-close-completion]')?.addEventListener('click', () => { $('hubActionCompletionDialog')?.close(); pendingCompletionAction = null; });
      if ($('hubPlanningForm')?.elements.dueDate) $('hubPlanningForm').elements.dueDate.value = new Date().toISOString().slice(0, 10);
      $('hubShowProjectList').onclick = () => setProjectDisplay('list');
      $('hubShowProjectMap').onclick = () => setProjectDisplay('map');
      $('hubProspectingSearch').onclick = searchProspectingBuildings;
      if (OBI_LOCAL_FLAG_ENABLED) {
        document.querySelector('.hubCandidateHeading').after($('hubProspectingProgressWrap'));
        $('hubObiModeBar').hidden = false;
        document.querySelector('.hubObiMobileView').hidden = false;
        if (prospectingMode !== 'pv') document.querySelector('.hubProspectingMinAreaField > span').textContent = 'Emprise au sol minimum (m²)';
        if (prospectingMode !== 'pv') $('hubProspectingMinArea').value = obiMinimumAreaValue;
        document.querySelectorAll('[data-obi-mobile-view]').forEach((button) => button.addEventListener('click', () => setObiMobileView(button.dataset.obiMobileView)));
        document.querySelectorAll('[data-obi-mode]').forEach((button) => button.addEventListener('click', () => applyProspectingMode(button.dataset.obiMode)));
        $('hubObiMapSignal').addEventListener('change', updateObiMapSignal);
        $('hubObiMore').onclick = () => { obiPageSize += 20; renderObiCandidatePage(); };
      }
      $('hubProspectingPickMap').onclick = beginProspectingMapPick;
      $('hubProspectingMinArea').addEventListener('input', () => {
        if ($('hubProspectingMinArea').getAttribute('aria-invalid') !== 'true') return;
        const text = $('hubProspectingMinArea').value.trim();
        const value = text ? Number(text) : NaN;
        if (text && Number.isFinite(value) && value >= 1 && value <= 100000) clearProspectingMinimumAreaError();
        else if (text) $('hubProspectingMinAreaError').textContent = 'Saisissez une surface comprise entre 1 et 100 000 m².';
      });
      $('hubProspectingSort').onchange = () => { sortProspectingCards(); loadProspectingEnergySort(); };
      bindProspectingLocationAutocomplete();
      for (const id of ['hubProspectingRadius', 'hubProspectingMinArea']) $(id).addEventListener('change', invalidateProspectingResults);
      $('hubProspectingProject').addEventListener('change', () => {
        invalidateProspectingResults();
        prospectingAddressSelection = null;
        $('hubProspectingLocation').value = '';
        closeProspectingSuggestions();
        $('hubProspectingLocationHint').textContent = selectedProspectingProject()
          ? 'Projet sélectionné comme point de référence.'
          : 'Choisissez un projet ou sélectionnez une adresse / un lieu dans les suggestions.';
        $('hubProspectingResults').hidden = true;
        $('hubProspectingState').textContent = selectedProspectingCenter()
          ? 'Point de référence modifié. Lancez une nouvelle recherche pour actualiser les résultats.'
          : 'Sélectionnez un projet ou une adresse / un lieu pour pouvoir rechercher.';
        updateProspectingSearchAvailability();
      });
      $('hubSearch').oninput = renderDashboard; $('hubFilter').onchange = renderDashboard;
      window.addEventListener('storage', renderDashboard);
      renderDashboard();
    }
    const requested = new URLSearchParams(location.search);
    const requestedDraft = !dashboard && requested.get('draftId') ? deviceStore.get(requested.get('draftId')) : null;
    if (requestedDraft) await applyRecord(requestedDraft);
    try { await config.sessionReady; }
    catch (error) { cloudError = `Connexion au compte indisponible : ${error.message}`; }
    try { session = await client.getSession(localStorage); if (session) identity = await client.getIdentity(session.access_token); }
    catch (error) { cloudError = `Compte indisponible : ${error.message}`; }
    store = identity ? client.createDraftStore(localStorage, identity.id) : deviceStore;
    const accountSummary = document.querySelector('.hubAccountMenu > summary');
    if (accountSummary) accountSummary.textContent = accountDisplayName();
    refreshProfileDialog();
    if (identity) {
      try {
        const token = await tokenSession();
        [organizations, cloudRecords] = await Promise.all([client.cloudOrganizations(token), client.cloudProjects(token)]);
        cloudRecords = cloudRecords.map(flatten);
        if (dashboard && cloudRecords.some((record) => !record.preview)) void hydrateCloudPortfolioPreviews(token);
      } catch (error) { cloudError = error.message; }
    }
    const { createInstallerNetwork } = await import('./installer-network.mjs');
    installerNetwork = createInstallerNetwork({
      host: dashboard ? $('hubInstallerNetworkView') : null,
      client,
      getToken: tokenSession,
      getOrganizations: () => organizations,
      getProject: () => current,
      getCanonicalProject: () => config.projectContextLoaded && config.projectContext?.id === current?.id
        ? { ...config.projectContext, sitePostalCode: config.projectSiteContext?.postal_code || '' }
        : null,
      notify: (message) => notice(message)
    });
    installerNetwork.setOrganizations(organizations);
    if (dashboard) {
      renderDashboard();
      const requestedModule = new URLSearchParams(location.search).get('module');
      if (requestedModule === 'prospection') selectDashboardModule('prospection');
      else if (requestedModule === 'markets' || requestedModule === 'opportunities') selectDashboardModule(requestedModule);
      else if (location.hash === '#planning') selectDashboardModule('planning');
      return;
    }
    try {
      if (requested.has('draftId')) {
        const id = requested.get('draftId');
        // A dashboard link explicitly selects this device draft; opening it must not require
        // copying it into an account-scoped store or silently moving its ownership.
        const record = store.get(id) || deviceStore.get(id);
        if (!record) throw new Error('Ce brouillon n’est pas disponible dans ce navigateur.');
        if (current?.id !== record.id) await applyRecord(record);
      } else if (requested.has('projectId') || config.projectId) {
        const id = requested.get('projectId') || config.projectId;
        if (!identity) throw new Error('Connectez-vous pour ouvrir ce projet.');
        if (cloudError) throw new Error(cloudError);
        const records = await client.cloudProjects(await tokenSession(), id);
        if (!records.length) throw new Error('Le projet demandé n’est pas accessible avec ce compte.');
        const record = flatten(records[0]);
        if (config.projectId !== id || !config.projectContextLoaded || config.projectContext?.id !== id) await config.openCanonicalProject(id);
        await applyRecord(record);
      }
    } catch (error) { notice(error.message, true); }
    if (current) installerNetwork.attachProjectSuggestions(current, current.organizationId);
    document.addEventListener('input', (event) => { if (!restoring && !event.target.dataset?.suppressProjectDirty && !event.target.closest('.hubDialog')) { dirty = true; notifyShellStatus(); } });
    document.addEventListener('change', (event) => { if (!restoring && !event.target.dataset?.suppressProjectDirty && !event.target.closest('.hubDialog')) { dirty = true; notifyShellStatus(); } });
    window.addEventListener('ozeno:roof-configurations-updated', () => { if (!restoring) { dirty = true; notifyShellStatus(); } });
    window.addEventListener('ozeno:site-address-confirmed', () => { if (!restoring) { dirty = true; notifyShellStatus(); } });
    window.addEventListener('ozeno:parcel-qualification-updated', () => { if (!restoring) { dirty = true; notifyShellStatus(); } });
    $('addRisk')?.addEventListener('click', () => { dirty = true; notifyShellStatus(); });
    window.addEventListener('ozeno:risk-document-attached', () => { dirty = true; notifyShellStatus(); });
    window.addEventListener('beforeunload', (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
    window.addEventListener('ozeno:saved-project-selected', async (event) => {
      const selected = event.detail || {};
      if (!current || current.id !== selected.id || current.scope !== selected.scope) return;
      if (dirty && !window.confirm('Des modifications ne sont pas enregistrées. Recharger la dernière version sauvegardée de ce dossier ?')) {
        window.dispatchEvent(new Event('ozeno:project-picker-refresh'));
        return;
      }
      try { await applyRecord(current); }
      catch (error) { notice(`Impossible de rouvrir le dossier : ${error.message}`, true); }
    });
    // Canonical project switching is separate from intake editing; do not save into the previous dossier.
    $('connectionProject')?.addEventListener('change', () => {
      const id = $('connectionProject').value;
      current = cloudRecords.find((record) => record.id === id) || null;
      installerNetwork?.attachProjectSuggestions(current, current?.organizationId);
      config.commercialDraftId = null;
      config.localProjectCoordinates = null;
    });
  }
  const start = () => boot().then(() => {
    window.OzenoProjectHubReady = true;
    window.dispatchEvent(new Event('ozeno:project-hub-ready'));
  }).catch((error) => {
    window.OzenoProjectHubReady = false;
    window.dispatchEvent(new CustomEvent('ozeno:project-hub-failed', { detail: { message: error.message } }));
    console.error('Project hub unavailable', error);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}());
