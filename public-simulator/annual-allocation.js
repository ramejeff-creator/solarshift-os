(function (root) {
  'use strict';

  // Annual totals support a theoretical allocation, not hourly self-consumption.
  function calculateAnnualCeiling(productionKwh, consumptionKwh) {
    const production = Number(productionKwh);
    if (!Number.isFinite(production) || production <= 0) return null;
    const demand = Number(consumptionKwh);
    const hasDemand = consumptionKwh !== '' && consumptionKwh != null && Number.isFinite(demand) && demand >= 0;
    if (!hasDemand) return {
      status: 'PARTIAL',
      hasDemand: false,
      productionKwh: production,
      consumptionKwh: null,
      aciCeilingKwh: null,
      outsideSiteKwh: null,
      aciPercent: null,
      accPercent: null,
      surplusPercent: null,
      potentialAccKwh: null
    };
    const aciKwh = Math.min(production, demand);
    const aciPercent = Math.floor(aciKwh / production * 10000 + 1e-9) / 100;
    const remainingKwh = Math.max(0, production - aciKwh);
    const remainingPercent = Math.round((100 - aciPercent) * 100) / 100;
    return {
      status: 'ASSUMPTION',
      hasDemand,
      productionKwh: production,
      consumptionKwh: demand,
      aciCeilingKwh: aciKwh,
      outsideSiteKwh: remainingKwh,
      aciPercent,
      accPercent: remainingPercent,
      surplusPercent: 0,
      potentialAccKwh: remainingKwh
    };
  }

  root.OzenoAnnualAllocation = { calculateAnnualCeiling };
}(typeof window === 'undefined' ? globalThis : window));
