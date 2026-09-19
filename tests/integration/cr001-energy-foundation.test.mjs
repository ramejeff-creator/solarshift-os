import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('CR-001 migration contracts cover investor publication, audit and canonical promotion', async () => {
  const [sql, plan] = await Promise.all([
    readFile(new URL('../../supabase/migrations/202609190005_cr001_energy_data_foundation.sql', import.meta.url), 'utf8'),
    readFile(new URL('./CR001-ENERGY-FOUNDATION-RLS-TEST-PLAN.md', import.meta.url), 'utf8')
  ]);
  for (const policy of ['scenario read by role and publication', 'calculation run read by scenario publication', 'calculated KPI read by scenario publication']) assert.match(sql, new RegExp(`create policy "${policy}"`));
  assert.match(sql, /create trigger energy_profile_points_audit/);
  assert.match(sql, /PROMOTED_TO_CANONICAL_PARAMETER/);
  assert.match(plan, /DRAFT, CALCULATED and VALIDATED scenarios remain hidden/);
  assert.match(plan, /cannot insert\/update\/delete CR-001 tables directly/);
});
