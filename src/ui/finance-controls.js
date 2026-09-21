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
    const horizon = +$('term').value, capex = +$('capex').value, production = +$('annual').value, adjustment = +$('adjust').value;
    const aciShare = +$('aciShare').value / 100, accShare = +$('accShare').value / 100, gridShare = +$('gridShare').value / 100;
    const shares = aciShare + accShare + gridShare;
    const price = aciShare * +$('aciPrice').value + accShare * +$('accPrice').value + gridShare * +$('gridPrice').value;
    const rent = $('rentOn').checked ? +$('annualRent').value : 0;
    const debtShare = Math.min(100, Math.max(0, +$('debtShare').value)) / 100;
    const debtRate = Math.max(0, +$('debtRate').value) / 100;
    const debtTerm = Math.max(1, +$('debtTerm').value);
    $('termout').textContent = `${horizon} ans`;
    $('financingAssumptions').textContent = `Dégradation moyenne 0,4 %/an · dette ${(debtShare * 100).toFixed(0)} % à ${(debtRate * 100).toFixed(1).replace('.', ',')} % sur ${debtTerm} ans · OPEX 2,5 % · assurance 0,4 % · frais de gestion.`;
    if (Math.abs(shares - 1) > .0001) { $('irr').textContent = 'Répartition à corriger'; $('multiple').textContent = '—'; $('payback').textContent = '—'; return; }
    const debt = capex * debtShare, equity = capex - debt;
    const payment = debtRate ? debt * debtRate / (1 - (1 + debtRate) ** -debtTerm) : debt / debtTerm;
    let balance = debt;
    const flows = [-equity];
    for (let year = 1; year <= horizon; year++) {
      const revenue = production * (1 - .004) ** (year - 1) * price * 1.01 ** (year - 1) * adjustment;
      const ebitda = revenue - capex * .025 - capex * .004 - revenue * .1 + 4000 - rent * 1.01 ** (year - 1);
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
    if (typeof updateDecision === 'function') updateDecision();
    if (typeof updateReport === 'function') updateReport();
  }

  function boot() {
    ['term', 'capex', 'debtShare', 'debtRate', 'debtTerm', 'annual', 'adjust', 'aciShare', 'aciPrice', 'accShare', 'accPrice', 'gridShare', 'gridPrice', 'rentOn', 'annualRent'].forEach((id) => { if ($(id)) $(id).oninput = calculate; });
    window.sim = calculate;
    calculate();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
}());
