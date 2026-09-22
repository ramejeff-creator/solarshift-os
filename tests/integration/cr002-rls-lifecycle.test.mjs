import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const liveAcceptance = new URL('./cr002-live-acceptance.sql', import.meta.url);
const freezeHashMigration = new URL('../../supabase/migrations/202609220009_cr002_freeze_hash_schema.sql', import.meta.url);

const migration = new URL('../../supabase/migrations/202609200007_cr002_contracts_technical_simulations.sql', import.meta.url);

test('investors are isolated from simulations and require a published scenario ACL', async () => {
  const sql = await readFile(migration, 'utf8');
  assert.match(sql, /simulation authorized worker read[\s\S]*can_write_project/);
  assert.match(sql, /create table public\.scenario_investor_grants/);
  assert.match(sql, /scenario read by role and explicit publication/);
  assert.match(sql, /scenario read by role and explicit publication[\s\S]*status = 'PUBLISHED'[\s\S]*has_active_scenario_investor_grant/);
  assert.doesNotMatch(sql.match(/create policy "simulation authorized worker read"[\s\S]*?;/)?.[0] ?? '', /INVESTOR|scenario_investor_grants/);
});

test('CR-002 entities are RLS protected and audited', async () => {
  const sql = await readFile(migration, 'utf8');
  for (const table of ['technical_configurations', 'external_engine_results', 'simulation_sessions', 'scenario_investor_grants']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  for (const trigger of ['technical_configurations_audit', 'external_engine_results_audit', 'simulation_sessions_audit']) {
    assert.match(sql, new RegExp(`create trigger ${trigger}`));
  }
});

test('publication and revocation are restricted to ADMIN or SOLARSHIFT', async () => {
  const sql = await readFile(migration, 'utf8');
  const publish = sql.match(/create function public\.publish_scenario[\s\S]*?\$\$;/)?.[0] ?? '';
  const revoke = sql.match(/create function public\.revoke_scenario_publication[\s\S]*?\$\$;/)?.[0] ?? '';
  assert.match(publish, /array\['ADMIN','SOLARSHIFT'\]/);
  assert.match(revoke, /array\['ADMIN','SOLARSHIFT'\]/);
  assert.doesNotMatch(publish, /array\[[^\]]*(?:MANDATAIRE|EXPERT|CLIENT|INVESTOR)[^\]]*\]/);
  assert.doesNotMatch(revoke, /array\[[^\]]*(?:MANDATAIRE|EXPERT|CLIENT|INVESTOR)[^\]]*\]/);
});

test('live acceptance recipe covers the complete rollback-only CR-002 journey', async () => {
  const sql = await readFile(liveAcceptance, 'utf8');
  assert.match(sql, /^-- CR-002 phases 2\.1-2\.3 live acceptance recipe\./);
  assert.match(sql, /create_working_simulation/);
  assert.match(sql, /alter table cr002_acceptance_results enable row level security/);
  assert.match(sql, /freeze_simulation_to_scenario/);
  assert.match(sql, /cannot be VALIDATED/);
  assert.match(sql, /append_external_engine_result[\s\S]*'P50'/);
  assert.match(sql, /append_external_engine_result[\s\S]*'P90'/);
  assert.match(sql, /validated scenario content is immutable/);
  assert.match(sql, /publish_scenario/);
  assert.match(sql, /revoke_scenario_publication/);
  assert.match(sql, /insert into auth\.users/);
  assert.match(sql, /investor_user := gen_random_uuid\(\)/);
  assert.match(sql, /investor sees only the explicitly published scenario/);
  assert.match(sql, /publication and revocation are audited/);
  assert.match(sql, /rollback;\s*$/i);
});

test('hosted Supabase FREEZE resolves pgcrypto from the extensions schema', async () => {
  const sql = await readFile(freezeHashMigration, 'utf8');
  const acceptance = await readFile(liveAcceptance, 'utf8');
  assert.match(sql, /^begin;/);
  assert.match(sql, /create or replace function public\.freeze_simulation_to_scenario/);
  assert.match(sql, /extensions\.digest\(snapshot::text, 'sha256'\)/);
  assert.match(sql, /commit;\s*$/);
  assert.match(acceptance, /extensions\.digest\('cr002-live-acceptance', 'sha256'\)/);
});
