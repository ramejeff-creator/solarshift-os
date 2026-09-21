(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const format = (value) => Math.round(value).toLocaleString('fr-FR');

  function irr(flows) {
    let low = -.9999, high = 10;
    const npv = (rate) => flows.reduce((sum, value, index) => sum + value / (1 + rate) ** index, 0);
    while (npv(high) > 0 && high < 1e6) high *= 2;
    for (let index = 0; index < 160; index++) { const middle = (low + high) / 2; if (npv(middle) > 0) low = middle; else high = middle; }
    return (low + high) / 2;
  }

  function calculate() {
    const horizon = +$('term').value, capex = +$('capex').value, production = +$('annual').value, adjustment = +$('adjust').value / 100;
    const aciShare = +$('aciShare').value / 100, accShare = +$('accShare').value / 100, gridShare = +$('gridShare').value / 100;
    const shares = aciShare + accShare + gridShare;
    const price = aciShare * +$('aciPrice').value + accShare * +$('accPrice').value + gridShare * +$('gridPrice').value;
    const rent = $('rentOn').checked ? +$('annualRent').value : 0;
    const sharePercent = shares * 100;
    const shareInvalid = sharePercent > 100.0001;
    const shareStatus = $('mixValidation');
    if (shareStatus) {
      shareStatus.textContent = `Répartition utilisée : ${sharePercent.toFixed(0)} % sur 100 %${shareInvalid ? ' — réduisez une des trois parts.' : ''}`;
      shareStatus.className = `mixValidation ${shareInvalid ? 'invalid' : 'valid'}`;
    }
    ['aciShare', 'accShare', 'gridShare'].forEach((id) => {
      $(id).setCustomValidity(shareInvalid ? 'La somme ACI + ACC + surplus ne peut pas dépasser 100 %.' : '');
      $(id).setAttribute('aria-invalid', shareInvalid ? 'true' : 'false');
    });
    const rentField = $('annualRent')?.closest('label');
    if (rentField) { rentField.hidden = !$('rentOn').checked; $('annualRent').disabled = !$('rentOn').checked; }
    $('mixInfo').textContent = `Prix moyen pondéré année 1 : ${price.toFixed(3).replace('.', ',')} €/kWh · ACI ${(aciShare * 100).toFixed(0)} % · ACC ${(accShare * 100).toFixed(0)} % · surplus ${(gridShare * 100).toFixed(0)} %${rent ? ` · loyer indexé : ${format(rent)} €/an` : ' · sans loyer'}.`;
    const mode = $('financialAnalysis')?.dataset.mode || 'investor';
    const debtShare = Math.min(100, Math.max(0, +$('debtShare').value)) / 100;
    const debtRate = Math.max(0, +$('debtRate').value) / 100;
    const debtTerm = Math.max(1, +$('debtTerm').value);
    $('termout').textContent = `${horizon} ans`;
    $('financingAssumptions').textContent = `Dégradation moyenne 0,4 %/an · dette ${(debtShare * 100).toFixed(0)} % à ${(debtRate * 100).toFixed(1).replace('.', ',')} % sur ${debtTerm} ans · OPEX 2,5 % · assurance 0,4 % · frais de gestion.`;
    if (shareInvalid) { $('irr').textContent = 'Répartition à corriger'; $('multiple').textContent = '—'; $('payback').textContent = '—'; return; }
    const debt = capex * debtShare, equity = capex - debt;
    const payment = debtRate ? debt * debtRate / (1 - (1 + debtRate) ** -debtTerm) : debt / debtTerm;
    let balance = debt;
    const flows = [-equity], annualRevenue = [], annualEbitda = [];
    const managementRate = mode === 'investor' ? .1 : 0;
    for (let year = 1; year <= horizon; year++) {
      const revenue = production * (1 - .004) ** (year - 1) * price * 1.01 ** (year - 1) * adjustment;
      const ebitda = revenue - capex * .025 - capex * .004 - revenue * managementRate + 4000 - rent * 1.01 ** (year - 1);
      annualRevenue.push(revenue);
      annualEbitda.push(ebitda);
      const interest = year <= debtTerm ? balance * debtRate : 0;
      const principal = year <= debtTerm ? Math.min(balance, Math.max(0, payment - interest)) : 0;
      balance = Math.max(0, balance - principal);
      flows.push(ebitda - interest - Math.max(0, ebitda - (year <= 9 ? capex / 9 : 0) - interest) * .25 - principal);
    }
    const rate = irr(flows);
    let cumulative = 0, payback = 'Non atteint';
    flows.forEach((flow, year) => { cumulative += flow; if (year && payback === 'Non atteint' && cumulative >= 0) payback = `${year} ans`; });
    $('irr').textContent = `${(rate * 100).toFixed(1).replace('.', ',')} %`;
    $('multiple').textContent = equity ? `${(flows.slice(1).reduce((sum, flow) => sum + flow, 0) / equity).toFixed(2).replace('.', ',')}x` : '—';
    $('payback').textContent = payback;
    $('equity').textContent = `${format(equity)} €`;
    $('dashIrr').textContent = $('irr').textContent;
    window.dispatchEvent(new CustomEvent('ozeno:local-finance', { detail: {
      horizonYears: horizon,
      averageRevenueEur: annualRevenue.reduce((sum, value) => sum + value, 0) / Math.max(1, horizon),
      averageEbitdaEur: annualEbitda.reduce((sum, value) => sum + value, 0) / Math.max(1, horizon),
      irrPct: rate * 100,
      paybackYears: payback,
      netTotalEur: flows.reduce((sum, value) => sum + value, 0)
    } }));
    if (typeof updateDecision === 'function') updateDecision();
    if (typeof updateReport === 'function') updateReport();
  }

  function boot() {
    const style = document.createElement('style');
    style.textContent = '.mixValidation{grid-column:1/-1;margin:-3px 0 2px;padding:9px 11px;border-radius:7px;font-size:14px}.mixValidation.valid{background:#edf7f0;color:#08734c}.mixValidation.invalid{background:#fff0ef;color:#7d201b;border-left:4px solid #b84a43}input[aria-invalid="true"]{border-color:#b84a43;background:#fff8f7}';
    document.head.appendChild(style);
    ['term', 'capex', 'debtShare', 'debtRate', 'debtTerm', 'annual', 'adjust', 'aciShare', 'aciPrice', 'accShare', 'accPrice', 'gridShare', 'gridPrice', 'rentOn', 'annualRent'].forEach((id) => { if ($(id)) $(id).oninput = calculate; });
    window.sim = calculate;
    window.addEventListener('ozeno:financial-mode', calculate);
    calculate();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
}());
