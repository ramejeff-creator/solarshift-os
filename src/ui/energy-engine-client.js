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
    ensureFinancialSummary(card);
  }

  function ensureFinancialSummary(financeCard) {
    if ($('financialAnalysis')) return;
    if (!$('financialAnalysisStyles')) {
      const style = document.createElement('style');
      style.id = 'financialAnalysisStyles';
      style.textContent = '.financialAnalysis{margin-top:18px}.financialMode{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.financialMode button{border:1px solid #9ab4a6;background:#fff;color:#315c4b;border-radius:7px;padding:8px 11px;font:inherit;cursor:pointer}.financialMode button.current{background:#0a3f2d;color:#fff;border-color:#0a3f2d}.financialCashflow{padding:12px;background:#f4f9f5;border-left:4px solid #54a378;border-radius:6px;color:#315c4b}.financialMetrics{grid-template-columns:repeat(5,1fr)}@media(max-width:760px){.financialMetrics{grid-template-columns:1fr 1fr}}';
      document.head.appendChild(style);
    }
    const block = document.createElement('section');
    block.id = 'financialAnalysis';
    block.className = 'card financialAnalysis';
    block.innerHTML = `
      <div class="sectionTitle"><h2>Analyse financière</h2><span class="pill">Serveur</span></div>
      <p class="hint">Les indicateurs nets intègrent les charges d’exploitation. Les résultats restent en attente tant qu’aucun calcul Energy Engine validé n’est disponible.</p>
      <div class="financialMode" role="group" aria-label="Perspective financière">
        <button type="button" class="secondary current" data-financial-mode="investor">Investisseur / SPV</button>
        <button type="button" class="secondary" data-financial-mode="owner">Propriétaire autofinancé</button>
      </div>
      <div class="metrics financialMetrics">
        <div class="metric"><small>CA moyen annuel</small><span id="analysisRevenue">À calculer</span></div>
        <div class="metric"><small>EBITDA moyen annuel</small><span id="analysisEbitda">À calculer</span></div>
        <div class="metric"><small>TRI net fonds propres</small><span id="analysisIrr">À calculer</span></div>
        <div class="metric"><small>Payback</small><span id="analysisPayback">À calculer</span></div>
        <div class="metric"><small>Total net cumulé</small><span id="analysisNet">À calculer</span></div>
      </div>
      <p class="fine" id="analysisCharges">Charges prises en compte : assurance 0,4 % du CA · maintenance 2,5 % du CA · gestion réseau 10 % du CA pour le modèle investisseur.</p>
      <div class="financialCashflow" id="analysisCashflow">Flux de trésorerie : à calculer côté serveur.</div>`;
    financeCard.insertAdjacentElement('afterend', block);
    block.querySelectorAll('[data-financial-mode]').forEach((toggle) => toggle.addEventListener('click', () => {
      block.querySelectorAll('[data-financial-mode]').forEach((item) => item.classList.toggle('current', item === toggle));
      block.dataset.mode = toggle.dataset.financialMode;
      const charges = $('analysisCharges');
      if (charges) charges.textContent = toggle.dataset.financialMode === 'owner'
        ? 'Charges prises en compte : assurance 0,4 % du CA · maintenance 2,5 % du CA · sans commission de gestion réseau investisseur.'
        : 'Charges prises en compte : assurance 0,4 % du CA · maintenance 2,5 % du CA · gestion réseau 10 % du CA.';
    }));
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
    if ($('analysisRevenue')) $('analysisRevenue').textContent = `${Math.round(Number(financial.projectRevenueAverageEur ?? financial.projectRevenueYear1Eur ?? 0)).toLocaleString('fr-FR')} € / an`;
    if ($('analysisEbitda')) $('analysisEbitda').textContent = `${Math.round(Number(financial.operatingMarginAverageEur ?? financial.operatingMarginYear1Eur ?? 0)).toLocaleString('fr-FR')} € / an`;
    if ($('analysisIrr')) $('analysisIrr').textContent = financial.irrPct == null ? '—' : `${Number(financial.irrPct).toFixed(1)} %`;
    if ($('analysisPayback')) $('analysisPayback').textContent = financial.paybackYears == null ? '—' : `${Number(financial.paybackYears).toFixed(1)} ans`;
    if ($('analysisNet')) $('analysisNet').textContent = `${Math.round(Number(financial.projectNetTotalEur ?? 0)).toLocaleString('fr-FR')} €`;
    if ($('analysisCashflow')) $('analysisCashflow').textContent = `Flux annuels enregistrés : ${(financial.projectCashFlowEur || []).length - 1} années · cumul net projet disponible.`;
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
