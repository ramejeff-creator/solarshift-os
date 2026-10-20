(function () {
  'use strict';

  const ENDPOINT = window.SOLARSHIFT_CONFIG?.energyScenarioEndpoint || 'https://rniitydsksjrphulrlct.supabase.co/functions/v1/calculate-energy-scenario';
  const $ = (id) => document.getElementById(id);
  let lastResultScenarioId = null;

  function ensureControls() {
    const card = [...document.querySelectorAll('.card')].find((node) => /Simulation économique SPV/i.test(node.textContent || ''));
    if (!card) return;

    let status = $('engineStatus');
    if (!status) {
      status = document.createElement('p');
      status.id = 'engineStatus';
      status.className = 'helper engineStatus';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.style.margin = '10px 0 0';
      status.style.padding = '9px 11px';
      status.style.borderRadius = '7px';
      status.textContent = 'Le calcul canonique attend un scénario brouillon avec ses profils PV et consommation associés.';
      const title = card.querySelector('.sectionTitle') || card.firstElementChild;
      (title || card).insertAdjacentElement('afterend', status);
    }

    if (!$('runEnergyEngine')) {
      const button = document.createElement('button');
      button.id = 'runEnergyEngine';
      button.type = 'button';
      button.className = 'secondary';
      button.textContent = 'Calculer les résultats énergétiques canoniques';
      button.disabled = true;
      button.addEventListener('click', run);
      card.appendChild(button);
    }

    const button = $('runEnergyEngine');
    if (button && status) button.insertAdjacentElement('afterend', status);
    window.addEventListener('ozeno:canonical-context', (event) => updateAvailability(event.detail || {}));
    updateAvailability({});
  }

  function setStatus(message, tone) {
    const node = $('engineStatus');
    if (!node) return;
    node.textContent = message;
    node.dataset.tone = tone || 'info';
    node.style.background = tone === 'success' ? '#dff0e5' : tone === 'error' ? '#ffe1df' : '#fff2c9';
    node.style.color = tone === 'success' ? '#073d2a' : tone === 'error' ? '#7d201b' : '#493500';
  }

  function config() {
    return window.SOLARSHIFT_CONFIG || {};
  }

  function currentInput() {
    const cfg = config();
    const input = {
      projectId: cfg.projectId,
      scenarioId: cfg.scenarioId,
      pvProduction: cfg.pvProfile,
      load: cfg.loadProfile
    };
    const p50ResultId = cfg.scenarioBenchmarkRefs?.p50;
    const p90ResultId = cfg.scenarioBenchmarkRefs?.p90;
    if (p50ResultId || p90ResultId) input.productionBenchmarkResultIds = { p50ResultId: p50ResultId || undefined, p90ResultId: p90ResultId || undefined };
    return input;
  }

  function hasMatchingInputs(input) {
    const cfg = config();
    return Boolean(input.projectId && input.scenarioId && cfg.scenarioStatus === 'DRAFT'
      && input.pvProduction?.profileId && input.load?.profileId
      && input.pvProduction.profileId === cfg.scenarioProfileRefs?.pv
      && input.load.profileId === cfg.scenarioProfileRefs?.load
      && profileHasData(input.pvProduction) && profileHasData(input.load));
  }

  function hasAttachedProfiles(input) {
    const cfg = config();
    return Boolean(input?.projectId && input?.scenarioId && cfg.scenarioStatus === 'DRAFT'
      && input.pvProduction?.profileId && input.load?.profileId
      && input.pvProduction.profileId === cfg.scenarioProfileRefs?.pv
      && input.load.profileId === cfg.scenarioProfileRefs?.load);
  }

  function profileHasData(profile) {
    if (!profile) return false;
    if (profile.granularity === 'ANNUAL') return Number.isFinite(profile.annualKwh) && profile.annualKwh >= 0;
    return Array.isArray(profile.points) && profile.points.length > 0;
  }

  function updateAvailability(context) {
    const button = $('runEnergyEngine');
    if (!button) return;
    const canOpenWorkspace = Boolean(config().getAccessToken && config().projectId);
    button.hidden = !canOpenWorkspace;
    const statusNode = $('engineStatus');
    if (statusNode) statusNode.hidden = !canOpenWorkspace;
    const result = $('canonicalEnergyResult');
    if (!canOpenWorkspace) {
      if (result) result.hidden = true;
      lastResultScenarioId = null;
      return;
    }
    if (result && lastResultScenarioId && lastResultScenarioId !== context.scenarioId) {
      result.hidden = true;
      lastResultScenarioId = null;
    }
    const ready = context.ready === true && hasMatchingInputs(currentInput());
    button.disabled = !ready;
    if (ready) {
      setStatus('Scénario brouillon et profils canoniques associés. Les montants financiers ci-dessus restent un aperçu local, séparé du calcul énergétique.', 'info');
    } else if (!config().getAccessToken || !config().projectId) {
      setStatus('Connectez-vous puis choisissez un projet et un scénario brouillon dans le bloc de connexion.', 'info');
    } else if (!context.scenarioId) {
      setStatus('Aucun scénario brouillon sélectionné. Créez-en un dans le workspace, puis revenez le choisir ici.', 'info');
    } else if (context.ready === true && hasAttachedProfiles(currentInput())) {
      setStatus('Les profils sont associés, mais leurs points ne sont pas disponibles pour le calcul. Rechargez les données dans le workspace ou vérifiez l’import.', 'warning');
    } else {
      setStatus('Pour activer le calcul, associez un profil de production PV et un profil de consommation au même scénario dans le workspace.', 'info');
    }
  }

  async function accessToken() {
    const cfg = config();
    if (typeof cfg.getAccessToken === 'function') return cfg.getAccessToken();
    return cfg.accessToken || null;
  }

  function formatNumber(value, suffix = '') {
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}${suffix}` : 'UNKNOWN';
  }

  function showCanonicalResult(payload, scenarioId) {
    const host = $('canonicalEnergyResult');
    if (!host) return;
    lastResultScenarioId = scenarioId;
    const result = payload?.result || payload;
    const energy = result?.energy || {};
    host.replaceChildren();
    host.hidden = false;
    const title = document.createElement('b');
    title.textContent = 'Résultats énergétiques canoniques · Energy Engine';
    host.appendChild(title);
    const quality = document.createElement('p');
    quality.textContent = `Qualité ${result?.qualityLevel || 'UNKNOWN'} · formule ${result?.formulaVersion || 'UNKNOWN'} · run ${payload?.calculationRunId || 'UNKNOWN'}`;
    host.appendChild(quality);
    const metrics = [
      ['Production PV annuelle', energy.pvProductionAnnualKwh, ' kWh'],
      ['Consommation annuelle', energy.loadAnnualKwh, ' kWh'],
      ['Autoconsommation directe', energy.directSelfConsumptionKwh, ' kWh'],
      ['Taux d’autoconsommation', energy.selfConsumptionRatePct, ' %'],
      ['Taux d’autonomie', energy.selfSufficiencyRatePct, ' %'],
      ['Import réseau', energy.gridImportKwh, ' kWh'],
      ['Injection réseau', energy.gridExportKwh, ' kWh']
    ];
    const list = document.createElement('ul');
    metrics.forEach(([label, value, unit]) => {
      if (value == null) return;
      const item = document.createElement('li');
      item.textContent = `${label} : ${formatNumber(value, unit)}`;
      list.appendChild(item);
    });
    if (list.children.length) host.appendChild(list);
    const warnings = result?.warnings || [];
    if (warnings.length) {
      const note = document.createElement('p');
      note.textContent = `À noter : ${warnings.map((warning) => warning.message || warning.code).join(' · ')}`;
      host.appendChild(note);
    }
  }

  async function run() {
    const button = $('runEnergyEngine');
    const input = currentInput();
    const token = await accessToken();
    if (!token || !hasMatchingInputs(input)) {
      setStatus('Aucun calcul lancé : le projet doit être connecté et le scénario doit contenir ses deux profils canoniques.', 'warning');
      return;
    }

    button?.setAttribute('disabled', 'disabled');
    setStatus('Calcul énergétique canonique en cours…', 'info');
    try {
      const response = await fetch(config().energyEngineUrl || ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(input)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Erreur serveur (${response.status})`);
      showCanonicalResult(payload, input.scenarioId);
      setStatus('Calcul énergétique enregistré sur le scénario brouillon. Les résultats financiers et P50/P90 restent séparés et non calculés ici.', 'success');
    } catch (error) {
      setStatus(`Le calcul serveur n’a pas abouti : ${error.message}`, 'error');
    } finally {
      if (button) button.disabled = !hasMatchingInputs(currentInput());
    }
  }

  window.SolarShiftEnergyEngine = { run, currentInput, hasMatchingInputs, hasAttachedProfiles };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureControls);
  else ensureControls();
}());
