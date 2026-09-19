import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EnergyValidationError,
  calculateEnergyScenario,
  calculateIntervalBalance,
  irr,
  npv,
  simplePayback
} from '../../src/modules/energy/engine.ts';

const point = (start, pv, load) => ({
  pv: { intervalStart: start, intervalEnd: new Date(Date.parse(start) + 3_600_000).toISOString(), valueKwh: pv },
  load: { intervalStart: start, intervalEnd: new Date(Date.parse(start) + 3_600_000).toISOString(), valueKwh: load }
});

function scenario(pairs, financial) {
  return {
    projectId: '00000000-0000-0000-0000-000000000001',
    pvProduction: { granularity: 'HOURLY', qualityLevel: 'Q3', points: pairs.map((pair) => pair.pv), provenance: { sourceType: 'TEST' } },
    load: { granularity: 'HOURLY', qualityLevel: 'Q3', points: pairs.map((pair) => pair.load), provenance: { sourceType: 'TEST' } },
    financial
  };
}

test('E-001 PV below load conserves energy', () => {
  assert.deepEqual(calculateIntervalBalance(40, 100), { directSelfConsumptionKwh: 40, gridImportKwh: 60, gridExportKwh: 0, surplusKwh: 0 });
});

test('E-002 PV above load conserves energy', () => {
  assert.deepEqual(calculateIntervalBalance(100, 40), { directSelfConsumptionKwh: 40, gridImportKwh: 0, gridExportKwh: 60, surplusKwh: 60 });
});

test('E-003 zero production does not create invalid ratios', () => {
  const result = calculateEnergyScenario(scenario([point('2026-01-01T00:00:00.000Z', 0, 100)]));
  assert.equal(result.energy.selfConsumptionRatePct, undefined);
  assert.equal(result.energy.selfSufficiencyRatePct, 0);
  assert.equal(result.energy.gridImportKwh, 100);
});

test('E-004 missing load stays UNKNOWN and is never replaced by zero', () => {
  const result = calculateEnergyScenario({
    projectId: 'p',
    pvProduction: { granularity: 'ANNUAL', qualityLevel: 'Q1', annualKwh: 120000, provenance: { sourceType: 'INDICATIVE' } }
  });
  assert.equal(result.energy.pvProductionAnnualKwh, 120000);
  assert.equal(result.energy.loadAnnualKwh, undefined);
  assert.equal(result.qualityLevel, 'Q0');
  assert.deepEqual(result.missingInputs.sort(), ['financialAssumptions', 'load']);
});

test('annual-only inputs do not fabricate temporal matching', () => {
  const result = calculateEnergyScenario({
    projectId: 'p',
    pvProduction: { granularity: 'ANNUAL', qualityLevel: 'Q1', annualKwh: 100, provenance: { sourceType: 'ESTIMATE' } },
    load: { granularity: 'ANNUAL', qualityLevel: 'Q1', annualKwh: 80, provenance: { sourceType: 'ESTIMATE' } }
  });
  assert.equal(result.energy.directSelfConsumptionKwh, undefined);
  assert.ok(result.warnings.some(({ code }) => code === 'INTERVAL_MATCHING_UNAVAILABLE'));
});

test('finance model calculates cash flow, IRR, NPV, payback and LCOE deterministically', () => {
  const result = calculateEnergyScenario(scenario([point('2026-01-01T00:00:00.000Z', 100, 100)], {
    horizonYears: 2,
    capexEur: 100,
    initialEquityEur: 100,
    discountRatePct: 10,
    gridImportPriceYear1EurPerKwh: 1,
    solarEnergyPriceYear1EurPerKwh: 0.6,
    exportPriceYear1EurPerKwh: 0,
    opexYear1Eur: 0
  }));
  assert.deepEqual(result.financial.projectCashFlowEur, [-100, 60, 60]);
  assert.equal(result.financial.irrPct, 13.06623863);
  assert.equal(result.financial.npvEur, 4.1322314);
  assert.equal(result.financial.paybackYears, 1.66666667);
  assert.equal(result.financial.lcoeEurPerKwh, 0.57619048);
});

test('standard financial helpers handle no-root and multiple-sign-change cases safely', () => {
  assert.equal(Math.round(npv(0.1, [-100, 60, 60]) * 1e8) / 1e8, 4.1322314);
  assert.equal(Math.round(simplePayback([-100, 60, 60]) * 1e8) / 1e8, 1.66666667);
  assert.equal(irr([-100, 230, -132]).value, undefined);
  assert.equal(irr([-100, 230, -132]).warning.code, 'IRR_AMBIGUOUS');
});

test('P50/P90 are accepted only from validated external studies', () => {
  const base = scenario([point('2026-01-01T00:00:00.000Z', 100, 100)]);
  assert.throws(() => calculateEnergyScenario({ ...base, productionBenchmarks: { p50Kwh: 90, p90Kwh: 95, methodology: 'VALIDATED_EXTERNAL_STUDY', provenance: { sourceType: 'STUDY' } } }), EnergyValidationError);
  const result = calculateEnergyScenario({ ...base, productionBenchmarks: { p50Kwh: 100, p90Kwh: 90, methodology: 'VALIDATED_EXTERNAL_STUDY', provenance: { sourceType: 'STUDY', sourceReference: 'study-v1' } } });
  assert.equal(result.productionBenchmarks.p90Kwh, 90);
});
