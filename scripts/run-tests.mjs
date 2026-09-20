// Avoids Node's worker-process test runner in restricted execution environments.
await import('../tests/unit/foundation.test.mjs');
await import('../tests/unit/cr001-energy-foundation.test.mjs');
await import('../tests/integration/cr001-energy-foundation.test.mjs');
await import('../tests/unit/energy-engine.test.mjs');
await import('../tests/integration/energy-engine-contract.test.mjs');
await import('../tests/unit/cr002-contracts.test.mjs');
await import('../tests/integration/cr002-rls-lifecycle.test.mjs');
await import('../tests/unit/risk-register-ux.test.mjs');
