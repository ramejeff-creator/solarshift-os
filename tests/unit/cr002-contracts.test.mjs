import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = new URL('../../supabase/migrations/202609200007_cr002_contracts_technical_simulations.sql', import.meta.url);
const types = new URL('../../supabase/functions/_shared/energy-types.ts', import.meta.url);
const contract = new URL('../../docs/06-decisions/CR-002-PHASE-2.1-2.3-CONTRACT.md', import.meta.url);

test('CR-002 keeps simulations persisted and explicitly non-canonical', async () => {
  const sql = await readFile(migration, 'utf8');
  assert.match(sql, /create table public\.simulation_sessions/);
  assert.match(sql, /is_canonical boolean not null default false check \(is_canonical = false\)/);
  assert.match(sql, /retention_days integer not null default 90/);
  assert.match(sql, /status public\.simulation_status not null default 'WORKING'/);
  assert.match(sql, /freeze_simulation_to_scenario/);
  assert.match(sql, /create_working_simulation/);
  assert.match(sql, /update_working_simulation/);
  assert.match(sql, /FROZEN_TO_DRAFT_SCENARIO/);
});

test('scenario governance separates calculation validation publication and revocation', async () => {
  const [sql, policy] = await Promise.all([readFile(migration, 'utf8'), readFile(contract, 'utf8')]);
  assert.match(sql, /only a calculated scenario can be validated/);
  assert.match(sql, /only a validated scenario can be published/);
  assert.match(sql, /explicit investor authorization is required/);
  assert.match(sql, /INVESTOR_PUBLICATION_REVOKED/);
  assert.match(sql, /validated scenario content is immutable/);
  assert.match(sql, /invalid scenario lifecycle transition/);
  assert.match(policy, /freezing, validating or publishing a\s+scenario never updates them implicitly/);
});

test('technical configuration preserves UNKNOWN separately from explicit zero', async () => {
  const [sql, source] = await Promise.all([readFile(migration, 'utf8'), readFile(types, 'utf8')]);
  assert.match(sql, /create table public\.technical_configurations/);
  assert.match(sql, /pv_capacity_kwp numeric check \(pv_capacity_kwp is null or pv_capacity_kwp >= 0\)/);
  assert.match(sql, /module_manufacturer text/);
  assert.match(sql, /external_engine_reference text/);
  assert.match(source, /interface TechnicalConfiguration/);
  assert.match(source, /pvCapacityKwp\?: number/);
  assert.doesNotMatch(sql, /create table public\.equipment_catalog/);
});

test('external engineering results cannot misrepresent PVGIS as P50 or P90', async () => {
  const sql = await readFile(migration, 'utf8');
  assert.match(sql, /create table public\.external_engine_results/);
  assert.match(sql, /result_kind not in \('P50','P90'\)/);
  assert.match(sql, /result_kind not in \('P50','P90'\) or evidence_id is not null/);
  assert.match(sql, /validation_status = 'VALIDATED'[\s\S]*validated_at is not null and validated_by is not null/);
  assert.match(sql, /upper\(source_engine\) = 'PVGIS' and result_kind in \('P50','P90'\)/);
  assert.match(sql, /scenario technical configuration must be frozen and belong to the project/);
});

test('CR-002 domain contracts expose lifecycle services without financial expansion', async () => {
  const source = await readFile(types, 'utf8');
  assert.match(source, /type SimulationStatus = 'WORKING' \| 'FROZEN' \| 'PROMOTED'/);
  assert.match(source, /interface ScenarioGovernanceService/);
  assert.match(source, /freezeSimulation\(command: FreezeSimulationCommand\)/);
  assert.match(source, /interface EngineeringRepository/);
  assert.doesNotMatch(source, /interface ActorCashFlow|interface DebtSchedule|dscr/);
});
