import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('server function authenticates writers and persists immutable run/KPI records', async () => {
  const source = await readFile(new URL('../../supabase/functions/calculate-energy-scenario/index.ts', import.meta.url), 'utf8');
  assert.match(source, /rpc\('can_write_project'/);
  assert.match(source, /from\('calculation_runs'\)\.insert/);
  assert.match(source, /from\('calculated_kpis'\)\.insert/);
  assert.match(source, /input_snapshot_hash/);
  assert.match(source, /Scenario does not belong to the project/);
  assert.match(source, /energy profiles do not belong to the project/);
  assert.match(source, /created_by: userData\.user\.id/);
  assert.doesNotMatch(source, /canonical_parameter_code:/);
});

test('completion migration records terminal failed runs without relaxing open-run rules', async () => {
  const sql = await readFile(new URL('../../supabase/migrations/202609190006_calculation_run_completion.sql', import.meta.url), 'utf8');
  assert.match(sql, /'SUCCEEDED','FAILED','INVALIDATED'/);
  assert.match(sql, /'PENDING','RUNNING'/);
  assert.match(sql, /completed_at is not null/);
});

test('successful server calculation advances only a DRAFT scenario', async () => {
  const source = await readFile(new URL('../../supabase/functions/calculate-energy-scenario/index.ts', import.meta.url), 'utf8');
  assert.match(source, /select\('project_id, status'\)/);
  assert.match(source, /scenario\.status !== 'DRAFT'/);
  assert.match(source, /update\(\{ status: 'CALCULATED' \}\)/);
  assert.match(source, /\.eq\('id', input\.scenarioId\)\.eq\('status', 'DRAFT'\)/);
});
