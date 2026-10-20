(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const config = window.SOLARSHIFT_CONFIG = window.SOLARSHIFT_CONFIG || {};
  const dashboard = document.body.classList.contains('ozenoDashboard');
  const metadataFields = ['name', 'address', 'clientName', 'contactName', 'phone', 'email', 'installerName', 'installationDate'];
  const inputIds = ['roofTotal', 'roofRatio', 'panelArea', 'panelWp', 'pvgisSystemLoss', 'manualAzimuth', 'orientation', 'tilt', 'shade', 'roof', 'cons', 'term', 'capexReferenceMode', 'capexInstallationType', 'capexPerKwp', 'prestudyBuildingType', 'prestudyWarehouseSubtype', 'prestudyIndustrySchedule', 'prestudyExactPowerKva', 'prestudyPowerBand', 'prestudyGridPrice', 'prestudyGridPriceBasis', 'irveChargerCount', 'irvePowerPerChargerKw', 'irveCustomPowerKw', 'irvePowerKw', 'irveInstalledCostPerKw', 'debtShare', 'debtRate', 'debtTerm', 'discountRate', 'assumptionProductionDegradationPct', 'assumptionEnergyPriceEscalationPct', 'assumptionS21SurplusEscalationPct', 'assumptionContractSurplusEscalationPct', 'assumptionMaintenanceCapexPct', 'assumptionInsuranceCapexPct', 'assumptionInitialProjectCommissionPct', 'assumptionManagementFeePct', 'assumptionRentEscalationPct', 'financialAnalysis', 'manualEnergyAllocation', 'aciShare', 'aciPrice', 'accShare', 'accPrice', 'irveShare', 'irvePrice', 'contractReferencePrice', 'aciDiscountPercent', 'accDiscountPercent', 'contractReferenceSource', 'gridShare', 'gridPriceMode', 'gridPrice', 'gridPriceSource', 'rentOn', 'rentRate', 'reportTitle', 'reportDate', 'reportConclusion'];
  const commercialStatusLabels = { VALIDATED: 'Validé', IN_PROGRESS: 'En cours / brouillon', ABANDONED: 'Abandonné', DELETED: 'Supprimé' };
  const commercialStatusClasses = { VALIDATED: 'validated', IN_PROGRESS: 'progress', ABANDONED: 'abandoned', DELETED: 'deleted' };
  const pipelineCategoryLabels = { VALIDATED: 'Projet validé', IN_PROGRESS: 'En cours / brouillon', PROSPECTING: 'En prospection', PENDING: 'En attente · demande web' };
  const commercialStatusOf = (record) => commercialStatusLabels[record.commercialStatus] ? record.commercialStatus : 'IN_PROGRESS';
  let client, session, identity, store, deviceStore, current = null, organizations = [], cloudRecords = [], dashboardRecords = [], cloudError = '', dirty = false, restoring = false, saveMode = 'current', emptyPreview, leaveToDashboardAfterSave = false;
  let saveAddressSelection = null, saveAddressAutocompleteTimer = 0, saveAddressAutocompleteController = null, saveAddressAutocompleteRequest = 0, saveSeed = null;
  let projectMap = null, projectMapLayer = null, prospectingMap = null, prospectingLayer = null, prospectingBuildings = new Map(), prospectingAddressSelection = null, prospectingAutocompleteTimer = null, prospectingAutocompleteController = null, prospectingSearchInProgress = false;
  let prospectingSheet = null, prospectingSelection = 0;
  let prospectingSearchGeneration = 0, prospectingSearchController = null, prospectingEnergyController = null, prospectingMapPickMode = false;
  const prospectingCards = new Map();
  function notifyShellStatus() { window.dispatchEvent(new CustomEvent('ozeno:hub-status', { detail: { dirty } })); }
  function invalidateProspectingResults() {
    prospectingSearchGeneration++; prospectingSearchController?.abort(); prospectingEnergyController?.abort();
    prospectingSearchInProgress = false; prospectingSelection++; prospectingSheet?.close();
    prospectingCards.clear(); $('hubCandidates')?.replaceChildren();
    if ($('hubCandidateCount')) $('hubCandidateCount').textContent = '0';
    if ($('hubProspectingResults')) $('hubProspectingResults').hidden = true;
    updateProspectingSearchAvailability();
  }
  function updateProspectingEnergy(candidate, energy) {
    const card = prospectingCards.get(candidate.osmId);
    if (!card || card.candidate !== candidate) return;
    card.energy = energy; card.energyAttempted = true;
    const value = energy.totalMwh == null ? (energy.state === 'UNAVAILABLE' ? 'Indisponible' : 'Information non disponible')
      : `${Number(energy.totalMwh).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} MWh/an · référence Enedis ${energy.latestYear}${energy.partial ? ' · partiel' : ''}`;
    card.energyText.textContent = `Consommation : ${value}`;
    card.popupLabel.textContent = `Consommation : ${value}`;
    sortProspectingCards();
  }
  async function sortProspectingCards() {
    const generation = prospectingSearchGeneration;
    const { compareProspectingCards } = await import('./prospecting-energy.mjs');
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
    const { candidateConsumption } = await import('./prospecting-energy.mjs');
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
        $('hubProspectingSortState').textContent = `${lead} : ${Math.min(total, initiallyComplete+completed)}/${total}. Les inconnues restent en fin de liste.${capped ? ' Limite de 100 bâtiments par recherche.' : ''}`;
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
    return { schemaVersion: 1, kind: 'COMMERCIAL_NON_CANONICAL', controls, commercialRemuneration: window.SOLARSHIFT_INSTALLER_COMMISSION_PREVIEW || null, roofs: window.OzenoRoofSurfaces?.captureDraft() || {}, parcelQualification: window.OzenoParcelQualification?.capture() || null, risks: window.OzenoRiskDraft?.capture() || [], financingMode: document.querySelector('[name="financingMode"]:checked')?.value || 'mixed', efficiency };
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
    if (window.OzenoAnnualProductionAssumption) window.OzenoAnnualProductionAssumption.resetForProject();
    else {
      config.commercialProductionPreview = null;
      const annual = $('annual');
      if (annual) { annual.value = ''; delete annual.dataset.manualFallbackKwh; annual.dataset.productionSource = 'UNKNOWN'; }
    }
    current = record; restoring = true;
    try {
      if (record.scope === 'local') {
        Object.assign(config, { canonicalConnectionExpected: false, projectId: null, projectContext: null, projectCoordinates: null, projectContextLoaded: false, scenarioId: null, scenarioStatus: null, pvProfile: null, loadProfile: null, scenarioProfileRefs: {}, scenarioBenchmarkRefs: {}, energyProfiles: [], scenarios: [] });
        $('canonicalSummary')?.setAttribute('hidden', 'hidden');
        $('workspaceOpen')?.setAttribute('hidden', 'hidden');
      }
      config.commercialDraftId = record.scope === 'local' ? record.id : null;
      Object.assign(config, client.restoreSiteLocation(record, record.scope === 'cloud' && config.projectContextLoaded ? config.projectContext : null));
      document.querySelectorAll('.projects button[data-p]').forEach((button) => button.classList.remove('active'));
      if ($('dashAddress')) $('dashAddress').textContent = record.address || 'Site à localiser';
      if ($('newProjectAddress')) $('newProjectAddress').value = record.address || '';
      if ($('newProjectName')) $('newProjectName').value = record.name;
      if ($('ozenoWorkspaceTitle')) $('ozenoWorkspaceTitle').textContent = record.name;
      if ($('ozenoProjectName')) $('ozenoProjectName').textContent = record.name;
      config.projectIdentity = {
        clientName: record.clientName || '', contactName: record.contactName || '', phone: record.phone || '',
        installerName: record.installerName || '', installationDate: record.installationDate || '',
        activityLabel: record.preview?.siteQualification?.activityLabel || ''
      };
      window.dispatchEvent(new CustomEvent('ozeno:project-context-loaded', { detail: {
        projectId: config.projectId, draftId: config.commercialDraftId,
        name: record.name, address: record.address || '',
        clientName: record.clientName || '', contactName: record.contactName || '', phone: record.phone || '', email: record.email || '',
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
        if (!node || value == null) continue;
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
    input.addEventListener('input', () => {
      cancelSaveAddressAutocomplete();
      saveAddressSelection = null;
      suggestions.replaceChildren(); suggestions.hidden = true;
      const query = input.value.trim();
      if (saveMode !== 'new') { status.textContent = 'Pour modifier l’adresse d’un dossier existant, utilisez sa recherche sur la carte.'; return; }
      if (query.length < 4) { status.textContent = 'Saisissez au moins 4 caractères pour afficher les suggestions officielles.'; return; }
      status.textContent = 'Recherche d’adresses officielles…';
      const request = saveAddressAutocompleteRequest;
      saveAddressAutocompleteTimer = window.setTimeout(async () => {
        try {
          const { siteAddressAutocompleteUrl, normalizeSiteAddressSuggestion } = await import('./site-address.mjs');
          if (request !== saveAddressAutocompleteRequest) return;
          const controller = new AbortController(); saveAddressAutocompleteController = controller;
          const response = await fetch(siteAddressAutocompleteUrl(query), { signal: controller.signal, headers: { 'Accept-Language': 'fr' } });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const payload = await response.json();
          if (request !== saveAddressAutocompleteRequest || input.value.trim() !== query) return;
          const results = (Array.isArray(payload.results) ? payload.results : []).map(normalizeSiteAddressSuggestion).filter(Boolean);
          if (!results.length) {
            status.textContent = 'Aucune suggestion précise. L’adresse saisie restera une indication ; vous pourrez localiser le site sur la carte après création.';
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
        <label class="hubFull">Adresse / localisation du site<input name="address" maxlength="500" autocomplete="street-address"><div id="hubAddressSuggestions" class="hubAddressSuggestions" role="listbox" hidden></div><small id="hubAddressHelp"></small><small id="hubAddressAutocompleteStatus" role="status">Saisissez au moins 4 caractères pour afficher les suggestions officielles.</small></label>
        <label class="hubFull">Nom du client<input name="clientName" maxlength="200" autocomplete="organization"></label>
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
    $('hubSaveAndReturn').addEventListener('click', () => {
      leaveToDashboardAfterSave = true;
      form.requestSubmit();
    });
    form.elements.activityKnowledge.onchange = syncActivityQualification;
    $('hubSaveDialog').addEventListener('close', () => { leaveToDashboardAfterSave = false; });
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
        let data = { ...locationData, preview: isNew ? structuredClone(emptyPreview) : capturePreview(), commercialStatus: isNew ? 'IN_PROGRESS' : commercialStatusOf(current), ...(isNew && saveSeed?.pipelineCategory ? { pipelineCategory: saveSeed.pipelineCategory } : {}) };
        if (isNew && saveSeed?.parcelQualification) data.preview.parcelQualification = structuredClone(saveSeed.parcelQualification);
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
          if (!dashboard && existing?.scope !== 'cloud') {
            try { await config.openCanonicalProject(saved.id); }
            catch (error) { reopeningError = error.message; }
          }
        } else {
          const targetStore = existing?.scope === 'local'
            ? client.draftStoreForRecord(store, deviceStore, existing.id)
            : store;
          saved = targetStore.save(data, { id: existing?.scope === 'local' ? existing.id : null, expectedVersion: existing?.scope === 'local' ? existing.version : 0 });
        }
        $('hubSaveDialog').close();
        if (dashboard) location.href = saved.scope === 'cloud'
          ? `./project-dashboard.html?projectId=${encodeURIComponent(saved.id)}`
          : `./index.html?draftId=${encodeURIComponent(saved.id)}`;
        else if (returnToDashboardAfterSave) {
          dirty = false;
          location.assign(new URL('./projects.html', location.href).href);
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
              clientName: saved.clientName || '', contactName: saved.contactName || '', phone: saved.phone || '',
              installerName: saved.installerName || '', installationDate: saved.installationDate || '',
              activityLabel: saved.preview?.siteQualification?.activityLabel || ''
            };
            window.dispatchEvent(new CustomEvent('ozeno:project-context-loaded', { detail: {
              projectId: saved.scope === 'cloud' ? saved.id : null, draftId: saved.scope === 'local' ? saved.id : null,
              name: saved.name, address: saved.address || '',
              clientName: saved.clientName || '', contactName: saved.contactName || '', phone: saved.phone || '', email: saved.email || '',
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
      } catch (error) { $('hubSaveError').textContent = `Enregistrement impossible : ${error.message}`; }
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
  function openSave(mode = 'current', seed = null) {
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
      ? 'Saisissez au moins 4 caractères pour afficher les suggestions officielles.'
      : 'Pour modifier l’adresse d’un dossier existant, utilisez sa recherche sur la carte.';
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
    $('hubAddressHelp').textContent = mode === 'new'
      ? 'Facultatif : choisissez une suggestion officielle pour enregistrer aussi le point géographique. Une saisie libre sera gardée comme indication.'
      : 'Pour garder l’adresse et le point géographique cohérents, modifiez la localisation depuis la carte et la recherche d’adresse.';
    if (mode !== 'new' && !form.elements.name.value) form.elements.name.value = $('newProjectName')?.value || config.projectContext?.name || '';
    $('hubSaveDialogTitle').textContent = mode === 'new' ? 'Créer un nouveau projet' : 'Enregistrer le projet';
    $('hubSaveDescription').textContent = mode === 'new'
      ? seed?.pipelineCategory === 'PROSPECTING'
        ? 'Création depuis la prospection. Le point GPS est celui du bâtiment repéré et reste à vérifier ; l’adresse postale n’est pas déduite automatiquement.'
        : 'Créez un dossier, puis localisez le site pour commencer son étude. Les modifications non enregistrées du dossier ouvert ne seront pas reprises.'
      : 'Enregistrez les informations de suivi, les surfaces et les hypothèses de cette pré-étude.';
    const cloudAvailable = Boolean(identity && !cloudError && (record.scope === 'cloud' || organizations.length));
    form.elements.destination.querySelector('[value="cloud"]').disabled = !cloudAvailable;
    form.elements.destination.value = cloudAvailable && (mode === 'new' || record.scope !== 'local') ? 'cloud' : 'local';
    if (cloudError) $('hubSaveError').textContent = cloudError;
    form.elements.organization.replaceChildren(...organizations.map((organization) => {
      const option = element('option', organization.name); option.value = organization.id; return option;
    }));
    if (organizations.length > 1) { const placeholder = element('option', 'Choisir une organisation'); placeholder.value = ''; form.elements.organization.prepend(placeholder); form.elements.organization.value = ''; }
    updateSaveScope(); showDialog('hubSaveDialog');
  }
  function buildProfileDialog() {
    dialog('hubProfileDialog', 'Mon profil', '<div id="hubProfileIdentity"></div><form id="hubLoginForm"><label>Adresse e-mail professionnelle<input name="email" type="email" required autocomplete="email" placeholder="vous@entreprise.fr"></label><p class="hubMuted">Utilisez votre compte déjà autorisé. Un lien sécurisé permet de reprendre la même session sur l’ensemble de cet espace.</p><button class="hubPrimary" type="submit">Recevoir un lien de connexion</button></form><p id="hubProfileState" role="status"></p>');
    refreshProfileDialog();
    $('hubLoginForm').onsubmit = async (event) => {
      event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true;
      try {
        const redirect = new URL('./index.html', location.href);
        const params = new URLSearchParams(location.search);
        for (const key of ['projectId', 'draftId']) if (params.has(key)) redirect.searchParams.set(key, params.get(key));
        await client.sendLoginLink(event.target.elements.email.value.trim(), redirect.href);
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
      const link = element('a', 'Tableau de bord', 'hubDashboardLink'); link.href = './projects.html';
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
    installateurs: ['Installateurs', 'Répertoire des partenaires installateurs et suivi de leur attribution aux dossiers.'],
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
  const matchesProjectFilter = (record, filter) => filter === 'all' || filter === record.scope || filter === commercialStatusOf(record) || client?.projectPipelineCategory(record) === filter;
  const formatArea = (value) => `${Number(value).toLocaleString('fr-FR')} m²`;

  function addEsriTiles(map) {
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles © Esri', maxZoom: 19
    }).addTo(map);
  }

  function projectPopup(record) {
    const content = element('div', '', 'hubMapPopup');
    content.append(element('strong', record.name || 'Projet sans nom'));
    content.append(element('p', record.address || 'Adresse non renseignée'));
    content.append(element('span', commercialStatusLabels[commercialStatusOf(record)], `hubStatus ${mapStatus(record)}`));
    const link = element('a', 'Ouvrir le projet');
    link.href = record.scope === 'cloud'
      ? `./project-dashboard.html?projectId=${encodeURIComponent(record.id)}`
      : `./index.html?draftId=${encodeURIComponent(record.id)}`;
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
    const located = dashboardRecords.filter(mappedCoordinates);
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
    return dashboardRecords.find((record) => record.id === $('hubProspectingProject').value && mappedCoordinates(record));
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
          const { prospectingAutocompleteUrls, normalizeProspectingSuggestion, parseCoordinatePair } = await import('./site-address.mjs');
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
      const openSheet = element('button', 'Voir la fiche', 'hubSecondary'); openSheet.type = 'button';
      openSheet.onclick = () => showProspectingSheet(candidate, index, consumptionLabel, true);
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
        showProspectingSheet(candidate, index, consumptionLabel, !polygon || !prospectingMap);
        if (!polygon || !prospectingMap) return;
        prospectingBuildings.forEach((layer) => layer.setStyle({ color: '#d07a19', fillColor: '#eca23b', fillOpacity: .28, weight: 2 }));
        polygon.setStyle({ color: '#073f39', fillColor: '#41b394', fillOpacity: .45, weight: 3 });
        prospectingMap?.fitBounds(polygon.getBounds(), { padding: [40, 40], maxZoom: 19 }); polygon.openPopup();
      };
      const details = element('button', 'Fiche détaillée', 'hubCandidateDetails'); details.type = 'button';
      details.onclick = () => showProspectingSheet(candidate, index, consumptionLabel, true);
      const footer = element('div', '', 'hubCandidateFooter');
      const energyText = element('span', 'Consommation : non chargée', 'hubCandidateConsumption');
      footer.append(energyText, details); item.append(button, footer); list.append(item);
      const createProject = element('button', 'Créer un dossier en prospection', 'hubCandidateCreateProject');
      createProject.type = 'button';
      createProject.onclick = () => openSave('new', {
        name: `Bâtiment en prospection · ${index + 1}`,
        latitude: Number(candidate.latitude), longitude: Number(candidate.longitude),
        coordinateSource: 'PROSPECTING_OSM_BUILDING', pipelineCategory: 'PROSPECTING', parcelQualification: candidate.parcelQualification || null
      });
      item.append(createProject);
      prospectingCards.set(candidate.osmId, { candidate, index, item, popupLabel: consumptionLabel, energyText, energy: null, energyAttempted: false });
      polygon?.on('click', () => { button.focus(); showProspectingSheet(candidate, index, consumptionLabel, false); });
    });
    sortProspectingCards();
  }

  async function searchProspectingBuildings() {
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
    let hasMap = false;
    try {
      try { hasMap = ensureProspectingMap(center, radiusMeters); } catch { hasMap = false; }
      const { fetchBuildingFootprints, nearbyRoofCandidates } = await import('./osm-footprint-client.mjs');
      const elements = await fetchBuildingFootprints(Number(center.latitude), Number(center.longitude), {
        radiusMeters, timeoutMs: 11000, signal: controller.signal, cacheMode: 'EXACT',
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
    } finally { if (isCurrent()) { prospectingSearchInProgress = false; updateProspectingSearchAvailability(); } }
  }

  function selectDashboardModule(moduleName) {
    if (!dashboard) return;
    const projects = moduleName === 'projects';
    const prospecting = moduleName === 'prospection';
    if (!prospecting) invalidateProspectingResults();
    document.querySelectorAll('.hubSidebarNav [data-hub-module]').forEach((item) => {
      const active = item.dataset.hubModule === moduleName;
      item.classList.toggle('isActive', active);
      if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
    });
    $('hubPortfolioView').hidden = !projects;
    $('hubProspectingView').hidden = !prospecting;
    $('hubModulePlaceholder').hidden = projects || prospecting;
    $('hubGlobalSearchWrap').hidden = !projects;
    if (prospecting) {
      populateProspectingProjects();
      setTimeout(() => prospectingMap?.invalidateSize(), 0);
    } else if (!projects) {
      const [title, description] = dashboardModules[moduleName] || ['Module', 'Cette rubrique sera disponible dans une prochaine étape.'];
      $('hubModuleTitle').textContent = title;
      $('hubModuleDescription').textContent = description;
    }
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
      const payload = { ...record, pipelineCategory: nextCategory };
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
    select.replaceChildren(...[['all', 'Tous les projets'], ['local', 'Brouillons locaux'], ['cloud', 'Compte connecté'], ...Object.entries(pipelineCategoryLabels)].map(([value, label]) => { const option = element('option', label); option.value = value; return option; }));
    select.value = [...select.options].some((option) => option.value === previous) ? previous : 'all';
    const body = $('hubProjectsBody'); body.replaceChildren();
    const commissionRange = (c) => `${Math.round(c.lowEur).toLocaleString('fr-FR')}–${Math.round(c.highEur).toLocaleString('fr-FR')} €`;
    const commissions = records.filter((r) => !['ABANDONED', 'DELETED'].includes(r.commercialStatus))
      .map((r) => client.installerCommissionForPreview(r.preview)).filter(Boolean);
    const totalCommission = commissions.reduce((sum, c) => ({ lowEur: sum.lowEur + c.lowEur, highEur: sum.highEur + c.highEur }), { lowEur: 0, highEur: 0 });
    if ($('hubCommissionPotential')) $('hubCommissionPotential').textContent = `Commissions OZENO potentielles : ${commissions.length ? commissionRange(totalCommission) : 'à renseigner'} · ${commissions.length} dossier(s) estimé(s) · 8–10 % facturés à l’installateur, sans effet sur le CAPEX client. CA facturé non disponible sans factures. Base HT à confirmer.`;
    const pipelineCounts = client.projectPipelineCounts(records);
    $('hubValidatedProjects').textContent = String(pipelineCounts.VALIDATED);
    $('hubInProgressProjects').textContent = String(pipelineCounts.IN_PROGRESS);
    $('hubPendingProjects').textContent = pipelineCounts.PENDING ? String(pipelineCounts.PENDING) : '—';
    $('hubProspectingProjects').textContent = String(pipelineCounts.PROSPECTING);
    $('hubSidebarProjectCount').textContent = String(records.length);
    for (const record of shown) {
      const row = document.createElement('tr'); const nameCell = document.createElement('td');
      const link = element('a', record.name, 'hubProjectLink');
      link.href = record.scope === 'cloud'
        ? `./project-dashboard.html?projectId=${encodeURIComponent(record.id)}`
        : `./index.html?draftId=${encodeURIComponent(record.id)}`;
      nameCell.append(link, element('small', record.address || 'Site à localiser'));
      row.appendChild(nameCell);
      row.appendChild(element('td', record.clientName || 'Non renseigné'));
      row.appendChild(element('td', record.installerName || 'À identifier'));
      const pipelineCell = document.createElement('td');
      const pipelineSelect = document.createElement('select');
      const category = client.projectPipelineCategory(record);
      pipelineSelect.setAttribute('aria-label', `Étape du dossier ${record.name || ''}`);
      pipelineSelect.title = 'En attente est réservé aux demandes reçues par le formulaire du site. Cette source n’est pas encore connectée.';
      ['IN_PROGRESS', 'PROSPECTING'].forEach((value) => { const option = element('option', pipelineCategoryLabels[value]); option.value = value; pipelineSelect.append(option); });
      if (category === 'VALIDATED') { const option = element('option', pipelineCategoryLabels.VALIDATED); option.value = 'VALIDATED'; pipelineSelect.append(option); }
      if (!category) { const option = element('option', commercialStatusLabels[commercialStatusOf(record)]); option.value = ''; pipelineSelect.append(option); }
      pipelineSelect.value = category === 'VALIDATED' ? 'VALIDATED' : category || '';
      pipelineSelect.disabled = category === 'VALIDATED' || !category;
      pipelineSelect.addEventListener('change', () => updatePipelineCategory(record, pipelineSelect.value, pipelineSelect));
      pipelineCell.appendChild(pipelineSelect); row.appendChild(pipelineCell);
      const status = document.createElement('td');
      const statusSelect = document.createElement('select'); statusSelect.className = `hubCommercialStatusSelect ${commercialStatusClasses[commercialStatusOf(record)]}`;
      statusSelect.setAttribute('aria-label', `Statut commercial de ${record.name || 'ce projet'}`);
      statusSelect.title = 'Statut commercial, distinct de la validation technique du projet.';
      Object.entries(commercialStatusLabels).forEach(([value, label]) => { const option = element('option', label); option.value = value; statusSelect.append(option); });
      statusSelect.value = commercialStatusOf(record);
      statusSelect.addEventListener('change', () => updateCommercialStatus(record, statusSelect.value, statusSelect));
      status.appendChild(statusSelect); row.appendChild(status);
      row.appendChild(element('td', record.installationDate ? new Date(`${record.installationDate}T12:00:00`).toLocaleDateString('fr-FR') : 'Non renseignée'));
      const commission = client.installerCommissionForPreview(record.preview);
      row.appendChild(element('td', commission ? `${commissionRange(commission)} · estimation 8–10 %` : 'À renseigner'));
      row.appendChild(element('td', record.updatedAt ? new Date(record.updatedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'Non renseignée'));
      const action = document.createElement('td'); const open = element('a', 'Ouvrir', 'hubOpen'); open.href = link.href; action.appendChild(open); row.appendChild(action); body.appendChild(row);
    }
    $('hubProjectCount').textContent = `${shown.length} projet${shown.length > 1 ? 's' : ''}`;
    $('hubEmpty').hidden = shown.length > 0;
    $('hubEmpty').textContent = records.length ? 'Aucun projet ne correspond à votre recherche.' : 'Aucun projet enregistré ici. Commencez par un nouveau projet ou connectez-vous pour retrouver vos dossiers.';
    updateProjectMap(shown);
    if (cloudError) notice(cloudError, true);
    else if (!identity) notice('Non connecté · seuls les brouillons de ce navigateur sont affichés.');
    else notice('Projets du compte autorisés et brouillons locaux de ce navigateur, y compris ceux créés avant connexion.');
  }
  async function boot() {
    const stylesheet = document.createElement('link'); stylesheet.rel = 'stylesheet'; stylesheet.href = './project-hub.css'; document.head.appendChild(stylesheet);
    client = await import('./project-hub-client.mjs');
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
      $('hubNewProject').onclick = () => openSave('new');
      document.querySelectorAll('.hubSidebarNav [data-hub-module]').forEach((item) => item.addEventListener('click', (event) => {
        event.preventDefault(); selectDashboardModule(item.dataset.hubModule);
      }));
      $('hubBackToProjects').onclick = () => selectDashboardModule('projects');
      $('hubShowProjectList').onclick = () => setProjectDisplay('list');
      $('hubShowProjectMap').onclick = () => setProjectDisplay('map');
      $('hubProspectingSearch').onclick = searchProspectingBuildings;
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
      } catch (error) { cloudError = error.message; }
    }
    if (dashboard) {
      renderDashboard(); return;
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
        if (config.projectId !== id || !config.projectContextLoaded) await config.openCanonicalProject(id);
        await applyRecord(record);
      }
    } catch (error) { notice(error.message, true); }
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
      config.commercialDraftId = null;
      config.localProjectCoordinates = null;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot().catch((error) => console.error('Project hub unavailable', error)));
  else boot().catch((error) => console.error('Project hub unavailable', error));
}());
