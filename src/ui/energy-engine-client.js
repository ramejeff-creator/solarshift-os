(function () {
  'use strict';

  const ENDPOINT = 'https://rniitydsksjrphulrlct.supabase.co/functions/v1/calculate-energy-scenario';
  const $ = (id) => document.getElementById(id);

  function number(id, fallback = 0) {
    const value = Number($(id)?.value);
    return Number.isFinite(value) ? value : fallback;
  }

  function ensureControls() {
    const card = [...document.querySelectorAll('.card')].find((node) =>
      /Simulation économique SPV/i.test(node.textContent || '')
    );
    if (!card) return;

    let status = $('engineStatus');
    if (!status) {
      const status = document.createElement('p');
      status.id = 'engineStatus';
      status.className = 'helper engineStatus';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.style.margin = '10px 0 0';
      status.style.padding = '9px 11px';
      status.style.borderRadius = '7px';
      status.textContent = 'Mode local — non canonique. Le calcul serveur attend un projet et des profils énergétiques validés.';
      const title = card.querySelector('.sectionTitle') || card.firstElementChild;
      (title || card).insertAdjacentElement('afterend', status);
      status = $('engineStatus');
    }

    if (!$('runEnergyEngine')) {
      const button = document.createElement('button');
      button.id = 'runEnergyEngine';
      button.type = 'button';
      button.className = 'secondary';
      button.textContent = 'Calculer avec Energy Engine v1';
      button.addEventListener('click', run);
      card.appendChild(button);
    }

    const button = $('runEnergyEngine');
    if (button && status) button.insertAdjacentElement('afterend', status);
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

  function readInput() {
    const cfg = config();
    const horizonYears = Math.max(1, Math.round(number('term', 30)));
    const capexEur = number('capex');
    const rentEnabled = Boolean($('rentOn')?.checked);
    const aciShare = number('aciShare');
    const accShare = number('accShare');
    const gridShare = number('gridShare');
    const aciPrice = number('aciPrice');
    const accPrice = number('accPrice');
    const gridPrice = number('gridPrice');
    const directShare = aciShare + accShare;
    const solarPrice = directShare > 0
      ? (aciShare * aciPrice + accShare * accPrice) / directShare
      : aciPrice;

    return {
      projectId: cfg.projectId,
      scenarioId: cfg.scenarioId,
      pvProduction: cfg.pvProfile,
      load: cfg.loadProfile,
      financial: {
        horizonYears,
        capexEur,
        initialEquityEur: Number.isFinite(cfg.initialEquityEur) ? cfg.initialEquityEur : capexEur * 0.8,
        discountRatePct: Number.isFinite(cfg.discountRatePct) ? cfg.discountRatePct : 7,
        gridImportPriceYear1EurPerKwh: gridPrice,
        solarEnergyPriceYear1EurPerKwh: solarPrice,
        exportPriceYear1EurPerKwh: Number.isFinite(cfg.exportPriceEurPerKwh) ? cfg.exportPriceEurPerKwh : gridPrice,
        opexYear1Eur: Number.isFinite(cfg.opexYear1Eur) ? cfg.opexYear1Eur : capexEur * 0.025,
        leaseYear1Eur: rentEnabled ? number('annualRent') : 0,
        gridPriceEscalationPct: 1,
        solarPriceEscalationPct: 1,
        exportPriceEscalationPct: 1,
        opexEscalationPct: 0,
        leaseEscalationPct: 1,
        pvDegradationPct: 0.4
      },
      productionBenchmarks: cfg.productionBenchmarks
    };
  }

  async function accessToken() {
    const cfg = config();
    if (typeof cfg.getAccessToken === 'function') return cfg.getAccessToken();
    return cfg.accessToken || null;
  }

  function hasProfiles(input) {
    return input?.projectId && input?.pvProduction && input?.load;
  }

  function updateResults(result) {
    const financial = result?.financial;
    if (!financial) {
      setStatus('Calcul serveur exécuté, mais aucun résultat financier n’est disponible pour ces profils.', 'warning');
      return;
    }
    if ($('irr')) $('irr').textContent = `${Number(financial.irrPct ?? 0).toFixed(1)} %`;
    if ($('multiple')) $('multiple').textContent = `${Number(financial.equityMultiple ?? 0).toFixed(2)}x`;
    if ($('payback')) $('payback').textContent = financial.paybackYears == null ? '—' : `${Number(financial.paybackYears).toFixed(1)} ans`;
    if ($('equity')) $('equity').textContent = `${Math.round(Number(financial.initialEquityEur ?? 0)).toLocaleString('fr-FR')} €`;
    setStatus('Energy Engine v1 — calcul serveur validé, versionné et enregistré.', 'success');
  }

  async function run() {
    const button = $('runEnergyEngine');
    const input = readInput();
    const token = await accessToken();
    if (!token || !hasProfiles(input)) {
      setStatus('Connexion commerciale et profils PV/consommation validés requis. Les valeurs visibles restent une simulation locale indicative.', 'warning');
      return;
    }

    button?.setAttribute('disabled', 'disabled');
    setStatus('Calcul Energy Engine v1 en cours…', 'info');
    try {
      const response = await fetch(config().energyEngineUrl || ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(input)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Erreur serveur (${response.status})`);
      updateResults(payload);
    } catch (error) {
      setStatus(`Le calcul serveur n’a pas abouti : ${error.message}`, 'error');
    } finally {
      button?.removeAttribute('disabled');
    }
  }

  window.SolarShiftEnergyEngine = { run, readInput };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureControls);
  else ensureControls();
}());
