import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const requiredFiles = [
  'AGENTS.md',
  'docs/02-data/DATA-DICTIONARY-v1.2.md',
  'docs/03-architecture/ARCHITECTURE-TECHNIQUE-v1.0.md',
  'docs/04-engines/CERTAINTY-ENGINE-v1.1.md',
  'docs/04-engines/RISK-RESILIENCE-ENGINE-v1.0.md',
  'docs/05-testing/DATASET-DEMO-TESTS-v1.0.md',
  'docs/06-decisions/ADR/ADR-001-CONFIDENCE-SCALE.md',
  'supabase/migrations/README.md',
  'tests/unit/foundation.test.mjs'
];

for (const file of requiredFiles) {
  await access(resolve(file));
}

const adr001 = await readFile(
  resolve('docs/06-decisions/ADR/ADR-001-CONFIDENCE-SCALE.md'),
  'utf8'
);

if (!adr001.includes('| L1 | 0.25 |') || !adr001.includes('| L5 | 1.00 |')) {
  throw new Error('ADR-001 must define the approved Certainty Engine v1.1 confidence scale.');
}

console.log('SolarShift Phase 0 foundation check passed.');

