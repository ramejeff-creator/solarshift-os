import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { solarRoofPlanes, estimateSolarCapacity } from '../../public-simulator/pro-simulator-estimation.mjs';

test('deployed simulator accepts map-derived azimuths, including the Muret pair 204/24 degrees', () => {
  assert.deepEqual(solarRoofPlanes({ roofType: 'pitched', roofPans: 'two', orientation: 204 }),
    [{ orientation: 204, weight: .5 }, { orientation: 24, weight: .5 }]);
  assert.equal(solarRoofPlanes({ roofType: 'pitched', roofPans: 'one', orientation: 359.8 })[0].orientation, 359.8);
  for (const orientation of [-1, 360, NaN]) assert.throws(() => solarRoofPlanes({ roofType: 'pitched', roofPans: 'two', orientation }));
  const input = { roofType: 'pitched', tiltBand: '0-6', grossArea: 1695, usablePercent: 65 };
  assert.equal(estimateSolarCapacity({ ...input, orientation: 204 }).referenceKwp,
    estimateSolarCapacity({ ...input, orientation: 180 }).referenceKwp, 'pitched capacity is not an artificial orientation-yield correction');
});

test('public summary displays the central server scenario, without presenting sensitivity extremes as a forecast', () => {
  const source = readFileSync(new URL('../../public-simulator/pro-simulator.mjs', import.meta.url), 'utf8');
  const financialSummary = source.slice(source.indexOf('  const annualSavings ='), source.indexOf('  const gridPrice ='));
  assert.match(financialSummary, /financial\?\.netGainsEur/);
  assert.match(financialSummary, /annualSavings \/ 1000/);
  assert.doesNotMatch(financialSummary, /scenarioCorridor/);
  assert.doesNotMatch(source, /Number\(gainsBeforeCapex\) - budget\.(high|low)Eur/);
  assert.match(source, /avoided_electricity_price_low_eur_kwh/);
  assert.match(source, /financial_model_version: '2026-10-12.1'/);
  assert.match(source, /try \{ input = buildEstimateInput\(\); \}/);
});
