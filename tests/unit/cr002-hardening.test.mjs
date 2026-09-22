import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const hardening = new URL('../../supabase/migrations/202609210008_cr002_structural_hardening.sql', import.meta.url);
const endpoint = new URL('../../supabase/functions/calculate-energy-scenario/index.ts', import.meta.url);
const types = new URL('../../supabase/functions/_shared/energy-types.ts', import.meta.url);
const client = new URL('../../src/ui/energy-engine-client.js', import.meta.url);
const contract = new URL('../../docs/06-decisions/CR-002-PHASE-2.1-2.3-CONTRACT.md', import.meta.url);
const commercialUi = new URL('../../src/ui/index.html', import.meta.url);
const productionStudyUi = new URL('../../src/ui/production-study.js', import.meta.url);

test('hardening migration is atomic', async () => {
  const sql = (await readFile(hardening, 'utf8')).trim();
  assert.match(sql, /^begin;/i);
  assert.match(sql, /commit;$/i);
});

test('governed scenarios and their calculation evidence are immutable', async () => {
  const sql = await readFile(hardening, 'utf8');
  assert.match(sql, /before update or delete on public\.scenarios/);
  assert.match(sql, /calculation runs may be attached only to a DRAFT scenario/);
  assert.match(sql, /calculated KPIs may be attached only to a DRAFT scenario/);
  assert.match(sql, /calculation evidence of a governed scenario is immutable/);
  assert.match(sql, /calculated KPIs of a governed scenario are immutable/);
});

test('publication revocation is the only guarded PUBLISHED to VALIDATED path', async () => {
  const sql = await readFile(hardening, 'utf8');
  assert.match(sql, /coalesce\(current_setting\('solarshift\.publication_revocation', true\), ''\) = 'allowed'/);
  assert.match(sql, /set_config\('solarshift\.publication_revocation', 'allowed', true\)/);
  assert.match(sql, /INVESTOR_PUBLICATION_REVOKED/);
});

test('external engineering results enforce tenant, Evidence and version invariants', async () => {
  const sql = await readFile(hardening, 'utf8');
  assert.match(sql, /external_engine_results_pxx_validated_check/);
  assert.match(sql, /result_kind not in \('P50','P90'\)[\s\S]*validation_status = 'VALIDATED'/);
  assert.match(sql, /external result scenario must belong to the project/);
  assert.match(sql, /external result Evidence must belong to the project/);
  assert.match(sql, /invalid external result version chain/);
  assert.match(sql, /validated external results are immutable; create a new version/);
  assert.match(sql, /append_external_engine_result/);
  assert.match(sql, /validate_external_engine_result/);
});

test('promoted simulation snapshots and manually attached runs are protected', async () => {
  const sql = await readFile(hardening, 'utf8');
  assert.match(sql, /frozen simulation snapshots are immutable/);
  assert.match(sql, /invalid simulation lifecycle transition/);
  assert.match(sql, /r\.simulation_session_id = sim\.id/);
  assert.match(sql, /calculation run does not belong to this simulation/);
});

test('server calculation accepts scenario runs only in DRAFT and resolves P50/P90 from validated records', async () => {
  const [source, contracts, browserClient] = await Promise.all([
    readFile(endpoint, 'utf8'), readFile(types, 'utf8'), readFile(client, 'utf8')
  ]);
  assert.match(source, /select\('project_id, status'\)/);
  assert.match(source, /scenario\.status !== 'DRAFT'/);
  assert.match(source, /either a scenario or a working simulation, not both/);
  assert.match(source, /Production benchmarks must be selected by validated external result ID/);
  assert.match(source, /from\('external_engine_results'\)/);
  assert.match(source, /result\.validation_status !== 'VALIDATED'/);
  assert.match(source, /!result\.evidence_id/);
  assert.match(source, /externalEngineResultIds: requested/);
  assert.match(contracts, /interface ProductionBenchmarkResultIds/);
  assert.match(contracts, /productionBenchmarkResultIds\?: ProductionBenchmarkResultIds/);
  assert.match(browserClient, /productionBenchmarkResultIds: cfg\.productionBenchmarkResultIds/);
  assert.doesNotMatch(browserClient, /productionBenchmarks: cfg\.productionBenchmarks/);
});

test('commercial pre-analysis stays available without mislabelling PVGIS as P50', async () => {
  const [sql, contractText, ui, productionUi] = await Promise.all([
    readFile(hardening, 'utf8'), readFile(contract, 'utf8'),
    readFile(commercialUi, 'utf8'), readFile(productionStudyUi, 'utf8')
  ]);
  assert.match(contractText, /Commercial pre-analysis may be calculated and saved without P50\/P90/);
  assert.match(sql, /scenario validation requires current Evidence-backed P50 and P90 external results/);
  assert.match(sql, /result_record\.result_kind in \('P50','P90'\)/);
  assert.match(sql, /not exists \([\s\S]*newer_version\.supersedes_id = result_record\.id/);
  assert.match(ui, /Production théorique PVGIS/);
  assert.match(productionUi, /Non requis à ce stade/);
  assert.match(productionUi, /Estimation PVGIS \$\{point\.dataset\.p50\}/);
  assert.match(productionUi, /P90 validé/);
});
