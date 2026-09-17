import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('ADR-001 locks the approved confidence scale', async () => {
  const adr = await readFile(
    new URL('../../docs/06-decisions/ADR/ADR-001-CONFIDENCE-SCALE.md', import.meta.url),
    'utf8'
  );

  assert.match(adr, /\| L1 \| 0\.25 \|/);
  assert.match(adr, /\| L2 \| 0\.50 \|/);
  assert.match(adr, /\| L3 \| 0\.70 \|/);
  assert.match(adr, /\| L4 \| 0\.85 \|/);
  assert.match(adr, /\| L5 \| 1\.00 \|/);
});

