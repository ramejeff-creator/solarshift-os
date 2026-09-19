import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = new URL('../../supabase/migrations/202609190005_cr001_energy_data_foundation.sql', import.meta.url);
const types = new URL('../../supabase/functions/_shared/energy-types.ts', import.meta.url);

test('CR-001 foundation creates only approved entities and taxonomy', async () => {
  const sql = await readFile(migration, 'utf8');
  for (const table of ['calculation_runs', 'calculated_kpis', 'scenarios', 'scenario_sets', 'energy_profiles', 'energy_profile_points']) assert.match(sql, new RegExp(`create table public\\.${table}`));
  assert.match(sql, /'CONFIGURATION','SENSITIVITY','STRESS'/);
  assert.match(sql, /'Q0','Q1','Q2','Q3','Q4'/);
  assert.doesNotMatch(sql, /battery_dispatch|participant_energy_results|allocation_rules/);
});

test('C03 and C09 retain one validated calculation reference before promotion', async () => {
  const sql = await readFile(migration, 'utf8');
  assert.match(sql, /canonical_parameter_code in \('C03','C09'\)/);
  assert.match(sql, /one_validated_reference_per_project_parameter/);
  assert.match(sql, /promote_validated_kpi_to_canonical_parameter/);
  assert.match(sql, /append_project_parameter/);
});

test('all CR-001 data is RLS-enabled and exposes the approved calculation contract', async () => {
  const [sql, source] = await Promise.all([readFile(migration, 'utf8'), readFile(types, 'utf8')]);
  for (const table of ['energy_profiles', 'energy_profile_points', 'scenario_sets', 'scenarios', 'calculation_runs', 'calculated_kpis']) assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(sql, /status = 'PUBLISHED'/);
  assert.match(sql, /has_internal_project_role/);
  assert.match(sql, /has_investor_project_role/);
  assert.match(sql, /energy_profile_points_audit/);
  assert.match(source, /interface EnergyFoundationRepository/);
  assert.match(source, /calculateEnergyScenario\(input: EnergyScenarioInput\): Promise<EnergyCalculationResult>/);
});
