import type {
  CalculationQuality,
  CalculationWarning,
  EnergyBalanceResult,
  EnergyCalculationResult,
  EnergyInputPoint,
  EnergyProfileInput,
  EnergyScenarioInput,
  FinancialAssumptions,
  FinancialResult
} from './energy-types.ts';

export const ENERGY_ENGINE_VERSION = '1.0.0';
export const ENERGY_FORMULA_VERSION = 'ENERGY-FORMULAS-1.0.0';
export const FINANCIAL_MODEL_VERSION = 'FINANCIAL-MODEL-1.0.0';

const QUALITY_ORDER: CalculationQuality[] = ['Q0', 'Q1', 'Q2', 'Q3', 'Q4'];

export class EnergyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnergyValidationError';
  }
}

function requireFiniteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new EnergyValidationError(`${name} must be a finite non-negative number`);
}

function percentToRate(value = 0, name = 'percentage'): number {
  if (!Number.isFinite(value) || value <= -100) throw new EnergyValidationError(`${name} must be finite and greater than -100`);
  return value / 100;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number, digits = 8): number {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function validatePoints(points: EnergyInputPoint[], name: string): void {
  if (points.length === 0) throw new EnergyValidationError(`${name} profile points cannot be empty`);
  let previousEnd = '';
  for (const [index, point] of points.entries()) {
    requireFiniteNonNegative(point.valueKwh, `${name}.points[${index}].valueKwh`);
    const start = Date.parse(point.intervalStart);
    const end = Date.parse(point.intervalEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new EnergyValidationError(`${name}.points[${index}] has an invalid interval`);
    }
    if (previousEnd && point.intervalStart < previousEnd) {
      throw new EnergyValidationError(`${name} profile intervals must be ordered and non-overlapping`);
    }
    previousEnd = point.intervalEnd;
  }
}

function annualEnergy(profile: EnergyProfileInput, name: string): number {
  if (profile.points) {
    validatePoints(profile.points, name);
    return sum(profile.points.map((point) => point.valueKwh));
  }
  if (profile.annualKwh !== undefined) {
    requireFiniteNonNegative(profile.annualKwh, `${name}.annualKwh`);
    return profile.annualKwh;
  }
  throw new EnergyValidationError(`${name} requires points or annualKwh`);
}

function minimumQuality(...levels: CalculationQuality[]): CalculationQuality {
  return levels.reduce((lowest, current) => QUALITY_ORDER.indexOf(current) < QUALITY_ORDER.indexOf(lowest) ? current : lowest);
}

function alignedPoints(pv: EnergyProfileInput, load: EnergyProfileInput): [EnergyInputPoint[], EnergyInputPoint[]] | undefined {
  if (!pv.points || !load.points) return undefined;
  validatePoints(pv.points, 'pvProduction');
  validatePoints(load.points, 'load');
  if (pv.points.length !== load.points.length) throw new EnergyValidationError('PV and load profiles must contain the same number of intervals');
  for (let index = 0; index < pv.points.length; index += 1) {
    if (pv.points[index].intervalStart !== load.points[index].intervalStart || pv.points[index].intervalEnd !== load.points[index].intervalEnd) {
      throw new EnergyValidationError(`PV and load intervals are not aligned at index ${index}`);
    }
  }
  return [pv.points, load.points];
}

export function calculateIntervalBalance(pvKwh: number, loadKwh: number): {
  directSelfConsumptionKwh: number;
  gridImportKwh: number;
  gridExportKwh: number;
  surplusKwh: number;
} {
  requireFiniteNonNegative(pvKwh, 'pvKwh');
  requireFiniteNonNegative(loadKwh, 'loadKwh');
  const direct = Math.min(pvKwh, loadKwh);
  const surplus = Math.max(pvKwh - loadKwh, 0);
  return {
    directSelfConsumptionKwh: direct,
    gridImportKwh: Math.max(loadKwh - pvKwh, 0),
    gridExportKwh: surplus,
    surplusKwh: surplus
  };
}
function calculateProfileBalance(pvPoints: EnergyInputPoint[], loadPoints: EnergyInputPoint[], pvFactor = 1): EnergyBalanceResult {
  let pvProduction = 0;
  let load = 0;
  let direct = 0;
  let gridImport = 0;
  let gridExport = 0;
  for (let index = 0; index < pvPoints.length; index += 1) {
    const pvValue = pvPoints[index].valueKwh * pvFactor;
    const loadValue = loadPoints[index].valueKwh;
    const interval = calculateIntervalBalance(pvValue, loadValue);
    pvProduction += pvValue;
    load += loadValue;
    direct += interval.directSelfConsumptionKwh;
    gridImport += interval.gridImportKwh;
    gridExport += interval.gridExportKwh;
  }
  return {
    pvProductionAnnualKwh: round(pvProduction),
    loadAnnualKwh: round(load),
    directSelfConsumptionKwh: round(direct),
    selfConsumptionRatePct: pvProduction > 0 ? round(direct / pvProduction * 100) : undefined,
    selfSufficiencyRatePct: load > 0 ? round(direct / load * 100) : undefined,
    gridImportKwh: round(gridImport),
    gridExportKwh: round(gridExport),
    surplusKwh: round(gridExport)
  };
}

export function npv(rate: number, cashFlows: number[]): number {
  if (!Number.isFinite(rate) || rate <= -1) throw new EnergyValidationError('NPV rate must be finite and greater than -1');
  if (cashFlows.length === 0) throw new EnergyValidationError('NPV requires at least one cash flow');
  return cashFlows.reduce((value, cashFlow, year) => value + cashFlow / ((1 + rate) ** year), 0);
}

function cashFlowSignChanges(cashFlows: number[]): number {
  const signs = cashFlows.filter((value) => value !== 0).map((value) => Math.sign(value));
  return signs.slice(1).reduce((count, sign, index) => count + (sign !== signs[index] ? 1 : 0), 0);
}

export function irr(cashFlows: number[]): { value?: number; warning?: CalculationWarning } {
  if (cashFlows.length < 2 || !cashFlows.some((value) => value < 0) || !cashFlows.some((value) => value > 0)) {
    return { warning: { code: 'IRR_UNAVAILABLE', message: 'IRR requires at least one negative and one positive cash flow.' } };
  }
  if (cashFlowSignChanges(cashFlows) > 1) {
    return { warning: { code: 'IRR_AMBIGUOUS', message: 'Cash flows contain multiple sign changes; a single IRR would be misleading.' } };
  }
  let low = -0.9999;
  let high = 1;
  let lowValue = npv(low, cashFlows);
  let highValue = npv(high, cashFlows);
  while (Math.sign(lowValue) === Math.sign(highValue) && high < 100) {
    high *= 2;
    highValue = npv(high, cashFlows);
  }
  if (Math.sign(lowValue) === Math.sign(highValue)) {
    return { warning: { code: 'IRR_NO_ROOT', message: 'No IRR root was found in the supported range.' } };
  }
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const middle = (low + high) / 2;
    const middleValue = npv(middle, cashFlows);
    if (Math.abs(middleValue) < 1e-10) return { value: middle };
    if (Math.sign(middleValue) === Math.sign(lowValue)) {
      low = middle;
      lowValue = middleValue;
    } else {
      high = middle;
    }
  }
  return { value: (low + high) / 2 };
}

export function simplePayback(cashFlows: number[]): number | undefined {
  if (cashFlows.length === 0) return undefined;
  let cumulative = cashFlows[0];
  if (cumulative >= 0) return 0;
  for (let year = 1; year < cashFlows.length; year += 1) {
    const previous = cumulative;
    cumulative += cashFlows[year];
    if (cumulative >= 0 && cashFlows[year] > 0) return (year - 1) + (-previous / cashFlows[year]);
  }
  return undefined;
}

function validateFinancial(input: FinancialAssumptions): void {
  if (!Number.isInteger(input.horizonYears) || input.horizonYears < 1 || input.horizonYears > 60) {
    throw new EnergyValidationError('financial.horizonYears must be an integer between 1 and 60');
  }
  for (const [name, value] of Object.entries({
    capexEur: input.capexEur,
    initialEquityEur: input.initialEquityEur,
    gridImportPriceYear1EurPerKwh: input.gridImportPriceYear1EurPerKwh,
    solarEnergyPriceYear1EurPerKwh: input.solarEnergyPriceYear1EurPerKwh,
    exportPriceYear1EurPerKwh: input.exportPriceYear1EurPerKwh,
    opexYear1Eur: input.opexYear1Eur
  })) requireFiniteNonNegative(value, `financial.${name}`);
  percentToRate(input.discountRatePct, 'financial.discountRatePct');
  percentToRate(input.pvDegradationPct, 'financial.pvDegradationPct');
  for (const replacement of input.replacementCosts ?? []) {
    if (!Number.isInteger(replacement.year) || replacement.year < 1 || replacement.year > input.horizonYears) {
      throw new EnergyValidationError(`replacement year ${replacement.year} is outside the calculation horizon`);
    }
    requireFiniteNonNegative(replacement.amountEur, `replacement ${replacement.label}`);
  }
}

function calculateFinancial(
  pvPoints: EnergyInputPoint[],
  loadPoints: EnergyInputPoint[],
  input: FinancialAssumptions,
  warnings: CalculationWarning[]
): FinancialResult {
  validateFinancial(input);
  const discountRate = percentToRate(input.discountRatePct);
  const degradation = percentToRate(input.pvDegradationPct, 'financial.pvDegradationPct');
  const gridEscalation = percentToRate(input.gridPriceEscalationPct, 'financial.gridPriceEscalationPct');
  const solarEscalation = percentToRate(input.solarPriceEscalationPct, 'financial.solarPriceEscalationPct');
  const exportEscalation = percentToRate(input.exportPriceEscalationPct, 'financial.exportPriceEscalationPct');
  const fixedRevenueEscalation = percentToRate(input.fixedRevenueEscalationPct, 'financial.fixedRevenueEscalationPct');
  const opexEscalation = percentToRate(input.opexEscalationPct, 'financial.opexEscalationPct');
  const leaseEscalation = percentToRate(input.leaseEscalationPct, 'financial.leaseEscalationPct');
  const baselineFixed = input.fixedGridChargeBeforeYear1Eur ?? 0;
  const projectFixed = input.fixedGridChargeAfterYear1Eur ?? 0;
  const fixedRevenue = input.fixedProjectRevenueYear1Eur ?? 0;
  const lease = input.leaseYear1Eur ?? 0;
  const replacements = new Map<number, number>();
  for (const item of input.replacementCosts ?? []) replacements.set(item.year, (replacements.get(item.year) ?? 0) + item.amountEur);

  const projectCashFlow = [-input.capexEur];
  const investorCashFlow = [-input.initialEquityEur];
  const annualSavings: number[] = [];
  const annualProduction: number[] = [];
  const annualCosts = [input.capexEur];
  let year1Baseline = 0;
  let year1ProjectBill = 0;
  let year1Revenue = 0;
  let year1Opex = 0;

  for (let year = 1; year <= input.horizonYears; year += 1) {
    const exponent = year - 1;
    const energy = calculateProfileBalance(pvPoints, loadPoints, (1 - degradation) ** exponent);
    const gridPrice = input.gridImportPriceYear1EurPerKwh * ((1 + gridEscalation) ** exponent);
    const solarPrice = input.solarEnergyPriceYear1EurPerKwh * ((1 + solarEscalation) ** exponent);
    const exportPrice = input.exportPriceYear1EurPerKwh * ((1 + exportEscalation) ** exponent);
    const baselineBill = (energy.loadAnnualKwh ?? 0) * gridPrice + baselineFixed * ((1 + gridEscalation) ** exponent);
    const projectBill = (energy.gridImportKwh ?? 0) * gridPrice + (energy.directSelfConsumptionKwh ?? 0) * solarPrice + projectFixed * ((1 + gridEscalation) ** exponent);
    const revenue = (energy.directSelfConsumptionKwh ?? 0) * solarPrice + (energy.gridExportKwh ?? 0) * exportPrice + fixedRevenue * ((1 + fixedRevenueEscalation) ** exponent);
    const opex = input.opexYear1Eur * ((1 + opexEscalation) ** exponent) + lease * ((1 + leaseEscalation) ** exponent);
    const replacement = replacements.get(year) ?? 0;
    const projectFlow = revenue - opex - replacement + (year === input.horizonYears ? input.terminalValueEur ?? 0 : 0);
    const debtService = input.debtServiceByYearEur?.[year - 1] ?? 0;
    requireFiniteNonNegative(debtService, `financial.debtServiceByYearEur[${year - 1}]`);

    annualSavings.push(baselineBill - projectBill);
    annualProduction.push(energy.pvProductionAnnualKwh);
    annualCosts.push(opex + replacement);
    projectCashFlow.push(projectFlow);
    investorCashFlow.push(projectFlow - debtService);
    if (year === 1) {
      year1Baseline = baselineBill;
      year1ProjectBill = projectBill;
      year1Revenue = revenue;
      year1Opex = opex;
    }
  }

  const irrResult = irr(investorCashFlow);
  if (irrResult.warning) warnings.push(irrResult.warning);
  const discountedCosts = annualCosts.reduce((total, cost, year) => total + cost / ((1 + discountRate) ** year), 0);
  const discountedProduction = annualProduction.reduce((total, production, index) => total + production / ((1 + discountRate) ** (index + 1)), 0);
  if (discountedProduction <= 0) throw new EnergyValidationError('LCOE cannot be calculated without positive lifecycle production');

  return {
    electricityBillBaselineYear1Eur: round(year1Baseline),
    electricityBillProjectYear1Eur: round(year1ProjectBill),
    clientSavingsYear1Eur: round(year1Baseline - year1ProjectBill),
    clientSavingsLifecycleEur: round(sum(annualSavings)),
    projectRevenueYear1Eur: round(year1Revenue),
    projectOpexYear1Eur: round(year1Opex),
    operatingMarginYear1Eur: round(year1Revenue - year1Opex),
    projectCashFlowEur: projectCashFlow.map((value) => round(value)),
    investorCashFlowEur: investorCashFlow.map((value) => round(value)),
    irrPct: irrResult.value === undefined ? undefined : round(irrResult.value * 100),
    npvEur: round(npv(discountRate, investorCashFlow)),
    paybackYears: simplePayback(investorCashFlow) === undefined ? undefined : round(simplePayback(investorCashFlow)!),
    lcoeEurPerKwh: round(discountedCosts / discountedProduction)
  };
}

export function calculateEnergyScenario(input: EnergyScenarioInput): EnergyCalculationResult {
  const warnings: CalculationWarning[] = [];
  const missingInputs: string[] = [];
  const pvAnnual = annualEnergy(input.pvProduction, 'pvProduction');
  let qualityLevel = input.pvProduction.qualityLevel;
  let energy: EnergyBalanceResult = { pvProductionAnnualKwh: round(pvAnnual) };
  let aligned: [EnergyInputPoint[], EnergyInputPoint[]] | undefined;

  if (!input.load) {
    qualityLevel = 'Q0';
    missingInputs.push('load');
    warnings.push({ code: 'LOAD_MISSING', message: 'Load is missing; matching, self-consumption, autonomy and grid-flow KPIs were not calculated.' });
  } else {
    const loadAnnual = annualEnergy(input.load, 'load');
    qualityLevel = minimumQuality(input.pvProduction.qualityLevel, input.load.qualityLevel);
    aligned = alignedPoints(input.pvProduction, input.load);
    if (aligned) {
      energy = calculateProfileBalance(aligned[0], aligned[1]);
    } else {
      energy.loadAnnualKwh = round(loadAnnual);
      warnings.push({ code: 'INTERVAL_MATCHING_UNAVAILABLE', message: 'Annual-only data cannot establish temporal PV/load matching; matching KPIs were not calculated.' });
    }
  }

  if (input.productionBenchmarks) {
    const { p50Kwh, p90Kwh, methodology } = input.productionBenchmarks;
    if (methodology !== 'VALIDATED_EXTERNAL_STUDY') throw new EnergyValidationError('P50/P90 require a validated external study in version 1');
    if (p50Kwh !== undefined) requireFiniteNonNegative(p50Kwh, 'productionBenchmarks.p50Kwh');
    if (p90Kwh !== undefined) requireFiniteNonNegative(p90Kwh, 'productionBenchmarks.p90Kwh');
    if (p50Kwh !== undefined && p90Kwh !== undefined && p90Kwh > p50Kwh) throw new EnergyValidationError('P90 cannot exceed P50');
  }

  let financial: FinancialResult | undefined;
  if (input.financial) {
    if (!aligned) {
      missingInputs.push('alignedPvAndLoadProfiles');
      warnings.push({ code: 'FINANCIALS_REQUIRE_MATCHING', message: 'Financial outputs require aligned PV and load profiles in version 1.' });
    } else {
      financial = calculateFinancial(aligned[0], aligned[1], input.financial, warnings);
    }
  } else {
    missingInputs.push('financialAssumptions');
  }

  return {
    engineVersion: ENERGY_ENGINE_VERSION,
    formulaVersion: ENERGY_FORMULA_VERSION,
    qualityLevel,
    energy,
    financial,
    productionBenchmarks: input.productionBenchmarks,
    warnings,
    missingInputs
  };
}
