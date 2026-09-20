import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync(new URL('../../src/ui/index.html', import.meta.url), 'utf8');
const ux = fs.readFileSync(new URL('../../src/ui/audit-ux.js', import.meta.url), 'utf8');

test('risk register clears the draft observation when the factor changes', () => {
  assert.match(index, /function resetRiskDraft\(\)/);
  assert.match(index, /riskFactor'\)\.onchange=\(\)=>\{resetRiskDraft\(\);explainRisk\(\)\}/);
});

test('risk register accepts a missing observation as an explicit unknown', () => {
  assert.match(index, /riskSource'\)\.value\.trim\(\)\|\|'Observation non renseignée'/);
  assert.match(ux, /Observation facultative/);
});
