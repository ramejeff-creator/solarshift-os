(function installEquityCashflow(global) {
  'use strict';

  function buildEquityCashflowSchedule(input = {}) {
    const horizonYears = Math.floor(Number(input.horizonYears));
    const capexEur = Number(input.capexEur);
    const productionKwh = Number(input.productionKwh);
    const debtShare = Number(input.debtShare);
    const debtRate = Number(input.debtRate);
    const debtTermYears = Math.floor(Number(input.debtTermYears));
    const initialCommissionBaseEur = Number(input.initialCommissionBaseEur ?? capexEur);
    const mix = input.energyMix || {};
    const prices = input.pricesEurPerKwh || {};
    const financialAssumptions = input.financialAssumptions || {};
    const productionDegradationRate = Number(financialAssumptions.productionDegradationRate);
    const energyPriceEscalationRate = Number(financialAssumptions.energyPriceEscalationRate);
    const s21SurplusEscalationRate = Number(financialAssumptions.s21SurplusEscalationRate);
    const contractSurplusEscalationRate = Number(financialAssumptions.contractSurplusEscalationRate);
    const maintenanceCapexRate = Number(financialAssumptions.maintenanceCapexRate);
    const insuranceCapexRate = Number(financialAssumptions.insuranceCapexRate);
    const investorManagementFeeRate = Number(financialAssumptions.investorManagementFeeRate);
    const initialProjectCommissionRate = Number(financialAssumptions.initialProjectCommissionRate);
    const rentEscalationRate = Number(financialAssumptions.rentEscalationRate);
    const surplusIndexationRate = input.surplusMode === 'oa_s21' ? s21SurplusEscalationRate : contractSurplusEscalationRate;

    const requiredValues = [input.horizonYears, input.capexEur, input.productionKwh, input.debtShare, input.debtRate,
      input.debtTermYears, initialCommissionBaseEur, productionDegradationRate, energyPriceEscalationRate, surplusIndexationRate,
      initialProjectCommissionRate,
      maintenanceCapexRate, insuranceCapexRate, investorManagementFeeRate, rentEscalationRate, mix.aci, mix.acc, mix.irve, mix.surplus,
      prices.aci, prices.acc, prices.irve, prices.surplus];
    const finite = requiredValues.every(value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)));
    const finiteSchedule = [horizonYears, capexEur, initialCommissionBaseEur, productionKwh, debtShare, debtRate, debtTermYears, productionDegradationRate,
      energyPriceEscalationRate, surplusIndexationRate, maintenanceCapexRate, insuranceCapexRate, investorManagementFeeRate, rentEscalationRate,
      initialProjectCommissionRate, mix.aci, mix.acc, mix.irve, mix.surplus, prices.aci, prices.acc, prices.irve, prices.surplus]
      .every(value => Number.isFinite(Number(value)));
    if (!finite || !finiteSchedule || horizonYears < 1 || capexEur <= 0 || initialCommissionBaseEur < 0 || initialCommissionBaseEur > capexEur
      || productionKwh <= 0 || debtShare < 0 || debtShare > 1
      || debtRate < 0 || debtTermYears < 1 || productionDegradationRate < 0 || productionDegradationRate >= 1
      || energyPriceEscalationRate < 0 || surplusIndexationRate < 0 || maintenanceCapexRate < 0 || insuranceCapexRate < 0
      || investorManagementFeeRate < 0 || (initialProjectCommissionRate !== 0 && (initialProjectCommissionRate < .08 || initialProjectCommissionRate > .1)) || rentEscalationRate < 0) return null;
    // Same €/kWh entry bounds as the public API. Guard the engine too: saved drafts
    // and programmatic callers must never interpret annual kWh as a unit price.
    if (['aci', 'acc', 'irve', 'surplus'].some(key => Number(mix[key]) < 0 || Number(mix[key]) > 1
      || Number(prices[key]) < 0 || Number(prices[key]) > 10)) return null;
    const allocatedShare = ['aci', 'acc', 'irve', 'surplus'].reduce((sum, key) => sum + Number(mix[key]), 0);
    if (allocatedShare > 1 + 1e-9) return null;

    // The installer pays this fee. Never add it to the customer's quote,
    // financing, OPEX base or lifecycle cost; never deduct it from the quote either.
    const installerCommissionEur = initialCommissionBaseEur * initialProjectCommissionRate;
    const initialProjectCommissionEur = 0;
    const totalInitialInvestmentEur = capexEur;
    const debtEur = totalInitialInvestmentEur * debtShare;
    const equityEur = totalInitialInvestmentEur - debtEur;
    const scheduledPaymentEur = debtEur === 0 ? 0 : debtRate
      ? debtEur * debtRate / (1 - (1 + debtRate) ** -debtTermYears)
      : debtEur / debtTermYears;
    const ownershipMode = input.ownershipMode === 'owner' ? 'owner' : 'investor';
    const managementRate = ownershipMode === 'investor' ? investorManagementFeeRate : 0;
    const rows = [{
      year: 0,
      productionKwh: 0,
      weightedEnergyValueEurPerKwh: null,
      energyValueEur: 0,
      maintenanceEur: 0,
      insuranceEur: 0,
      managementCommissionEur: 0,
      rentEur: 0,
      opexEur: 0,
      debtInterestEur: 0,
      debtPrincipalEur: 0,
      debtServiceEur: 0,
      equityCashflowEur: -equityEur,
      cumulativeEquityCashflowEur: -equityEur,
      initialCapexEur: capexEur,
      initialProjectCommissionEur,
      installerCommissionEur,
      totalInitialInvestmentEur,
      debtDrawdownEur: debtEur
    }];

    let balanceEur = debtEur;
    let cumulativeEur = -equityEur;
    for (let year = 1; year <= horizonYears; year++) {
      const elapsedYears = year - 1;
      const annualProductionKwh = productionKwh * (1 - productionDegradationRate) ** elapsedYears;
      const regularPriceFactor = (1 + energyPriceEscalationRate) ** elapsedYears;
      const surplusPriceFactor = (1 + surplusIndexationRate) ** elapsedYears;
      const weightedEnergyValueEurPerKwh = Number(mix.aci) * Number(prices.aci) * regularPriceFactor
        + Number(mix.acc) * Number(prices.acc) * regularPriceFactor
        + Number(mix.irve) * Number(prices.irve) * regularPriceFactor
        + Number(mix.surplus) * Number(prices.surplus) * surplusPriceFactor;
      const energyValueEur = annualProductionKwh * weightedEnergyValueEurPerKwh;
      const maintenanceEur = totalInitialInvestmentEur * maintenanceCapexRate;
      const insuranceEur = totalInitialInvestmentEur * insuranceCapexRate;
      const managementCommissionEur = energyValueEur * managementRate;
      const rentEur = Math.max(0, Number(input.annualRentEur) || 0) * ((1 + rentEscalationRate) ** elapsedYears);
      const opexEur = maintenanceEur + insuranceEur + managementCommissionEur + rentEur;
      const debtInterestEur = year <= debtTermYears ? balanceEur * debtRate : 0;
      const debtPrincipalEur = year <= debtTermYears
        ? Math.min(balanceEur, Math.max(0, scheduledPaymentEur - debtInterestEur))
        : 0;
      balanceEur = Math.max(0, balanceEur - debtPrincipalEur);
      const debtServiceEur = debtInterestEur + debtPrincipalEur;
      const equityCashflowEur = energyValueEur - opexEur - debtServiceEur;
      cumulativeEur += equityCashflowEur;
      if (![annualProductionKwh, energyValueEur, opexEur, equityCashflowEur, cumulativeEur].every(Number.isFinite)) return null;
      rows.push({
        year,
        productionKwh: annualProductionKwh,
        weightedEnergyValueEurPerKwh,
        energyValueEur,
        maintenanceEur,
        insuranceEur,
        managementCommissionEur,
        rentEur,
        opexEur,
        debtInterestEur,
        debtPrincipalEur,
        debtServiceEur,
        equityCashflowEur,
        cumulativeEquityCashflowEur: cumulativeEur,
        initialCapexEur: 0,
        debtDrawdownEur: 0
      });
    }
    return { ownershipMode, capexEur, initialProjectCommissionEur, installerCommissionEur, totalInitialInvestmentEur, debtEur, equityEur, rows, cashflowsEur: rows.map(row => row.equityCashflowEur) };
  }

  function calculateLifecycleLcoe({ capexEur, rows } = {}) {
    const capex = Number(capexEur);
    if (!Number.isFinite(capex) || capex <= 0 || !Array.isArray(rows)) return null;
    const operatingRows = rows.filter(row => Number(row.year) > 0);
    if (!operatingRows.length || operatingRows.some(row => !Number.isFinite(Number(row.productionKwh)) || Number(row.productionKwh) <= 0 || !Number.isFinite(Number(row.opexEur)))) return null;
    const initialCommission = rows.filter(row => Number(row.year) === 0).reduce((sum, row) => {
      const amount = row.initialProjectCommissionEur == null ? 0 : Number(row.initialProjectCommissionEur);
      return sum + (Number.isFinite(amount) && amount >= 0 ? amount : NaN);
    }, 0);
    if (!Number.isFinite(initialCommission)) return null;
    const totalLifecycleCostsEur = capex + initialCommission + operatingRows.reduce((sum, row) => sum + Number(row.opexEur), 0);
    const totalProductionKwh = operatingRows.reduce((sum, row) => sum + Number(row.productionKwh), 0);
    if (totalProductionKwh <= 0) return null;
    return { lcoeEurPerKwh: totalLifecycleCostsEur / totalProductionKwh, totalLifecycleCostsEur, totalProductionKwh, initialCommissionEur: initialCommission };
  }

  global.SolarShiftEquityCashflow = Object.freeze({ buildEquityCashflowSchedule, calculateLifecycleLcoe });
})(globalThis);
