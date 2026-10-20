// Avoids Node's worker-process test runner in restricted execution environments.
await import('../tests/unit/foundation.test.mjs');
await import('../tests/unit/cr001-energy-foundation.test.mjs');
await import('../tests/integration/cr001-energy-foundation.test.mjs');
await import('../tests/unit/energy-engine.test.mjs');
await import('../tests/integration/energy-engine-contract.test.mjs');
await import('../tests/unit/cr002-contracts.test.mjs');
await import('../tests/unit/cr002-hardening.test.mjs');
await import('../tests/integration/cr002-rls-lifecycle.test.mjs');
await import('../tests/unit/risk-register-ux.test.mjs');
await import('../tests/unit/ui-script-syntax.test.mjs');
await import('../tests/unit/public-simulator-ux.test.mjs');
await import('../tests/unit/public-simulator-orientation.test.mjs');
await import('../tests/unit/public-simulator-consistency.test.mjs');
await import('../tests/unit/public-simulator-reliability.test.mjs');
await import('../tests/unit/situation-plan.test.mjs');
await import('../tests/unit/project-transfer.test.mjs');
