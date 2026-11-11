import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('wall and heating qualification stays inside existing pre-study chapters and preserves CR-UX-012 navigation', () => {
  const chapters = read('public-simulator/app/prestudy-chapters.js');
  const shell = read('public-simulator/app/prestudy-shell.js');
  const markup = read('public-simulator/app/building-energy-prestudy.js');
  assert.match(chapters, /OzenoBuildingEnergyPrestudy\?\.mountRisk\(root, section\)/);
  assert.match(chapters, /OzenoBuildingEnergyPrestudy\?\.mountFunding\(root\)/);
  assert.match(shell, /label: 'Risques & preuves'/);
  assert.match(shell, /label: 'Finance & décision'/);
  assert.doesNotMatch(shell, /Enveloppe et chauffage/);
  assert.match(markup, /wallCurrentState/);
  assert.match(markup, /wallInsulationPlan/);
  assert.match(markup, /currentHeatingSystem/);
  assert.match(markup, /plannedHeatingSystem/);
  assert.match(markup, /wallProofStatus/);
  assert.match(markup, /heatingProofStatus/);
});

test('building energy answers are part of the recoverable commercial draft, not PV or finance inputs', () => {
  const hub = read('public-simulator/app/project-hub.js');
  const module = read('public-simulator/app/building-energy-prestudy.js');
  assert.match(hub, /buildingEnergy: window\.OzenoBuildingEnergyPrestudy\?\.capture\(\)/);
  assert.match(hub, /OzenoBuildingEnergyPrestudy\?\.restore\(preview\.buildingEnergy\)/);
  assert.match(module, /schemaVersion: 1, capturedAt:/);
  assert.match(module, /Information déclarée/);
  assert.match(module, /Document reçu/);
  assert.match(module, /Vérifié lors d’une visite ou mesure/);
});

test('pre-study Funding leads require authentication and use only planned renovation actions', () => {
  const endpoint = read('supabase/functions/prestudy-funding-leads/index.ts');
  const config = read('supabase/config.toml');
  const catalog = JSON.parse(read('supabase/functions/_shared/funding-core/data/pilot-catalog.json'));
  const heating = catalog.find((item) => item.id === 'FUND-CEE-008');
  assert.match(config, /\[functions\.prestudy-funding-leads\]\s+verify_jwt = true/);
  assert.match(endpoint, /evaluateFundingCatalog\(pilotCatalog, context\)/);
  assert.match(endpoint, /wallInsulationPlan/);
  assert.match(endpoint, /heatingReplacementPlanned/);
  assert.match(endpoint, /currentHeatingSystem/);
  assert.match(endpoint, /plannedHeatingSystem/);
  assert.match(endpoint, /if \(!request\.headers\.has\('authorization'\)\)/);
  assert.equal(heating.source.verifiedForLiveUse, false);
  assert.equal(heating.rulesCoverage, 'partial');
  assert.match(heating.source.url, /^https:\/\//);
  assert.doesNotMatch(endpoint, /CAPEX|\bTRI\b|\bDSCR\b|financial/i);
});
