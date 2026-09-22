# Energy Engine v1 — implementation contract

This module exposes the deterministic, server-side implementation approved after CR-001.
The deployable source lives in `supabase/functions/_shared`; the files in this
directory are stable domain entry points for the rest of the application.
It does not contain commercial thresholds, regulatory eligibility rules or an optimizer.

## Energy balance

For each aligned interval:

- direct self-consumption = `min(PV, load)`;
- grid import = `max(load - PV, 0)`;
- grid export and surplus = `max(PV - load, 0)`.

Annual values are the sum of the intervals. Self-consumption rate divides direct
self-consumption by PV production. Self-sufficiency divides it by load. A zero
denominator produces `UNKNOWN`, never an invented zero.

Annual-only inputs may provide annual production and annual load at quality Q1,
but they cannot produce temporal matching KPIs. Missing load downgrades the run to
Q0 and returns an explicit missing input.

## Lifecycle economics

The calculation horizon is supplied by the scenario. For each year, the engine:

1. applies the explicit PV degradation assumption to every PV interval;
2. recalculates PV/load matching;
3. applies explicit grid, solar-sale and export prices and indexation;
4. calculates the client bill before and after the project;
5. calculates project revenue, OPEX, lease and scheduled replacements;
6. builds project and investor cash-flow arrays.

The investor cash flow starts with the explicit initial equity contribution. Debt
service can be supplied as an explicit annual schedule, but no debt model or DSCR
formula is introduced in v1.

- NPV is the discounted investor cash flow at the scenario discount rate.
- IRR is the annual rate that sets investor NPV to zero. Multiple cash-flow sign
  changes return `UNKNOWN` with `IRR_AMBIGUOUS` instead of selecting an arbitrary root.
- Simple payback is the fractional year in which cumulative investor cash flow
  becomes non-negative.
- LCOE is discounted lifecycle cost divided by discounted PV production.

All percentages and monetary assumptions are caller-supplied and stored in the
calculation snapshot. Optional omitted assumptions are explicitly zero; required
assumptions fail validation.

## Provenance and persistence

`supabase/functions/calculate-energy-scenario/index.ts` authenticates the caller,
checks project write access, hashes the complete input snapshot, creates a versioned
calculation run, appends calculated KPI records and records warnings/missing inputs.

P50/P90 inputs are passed as `productionBenchmarkResultIds`. The server resolves
the corresponding Evidence-backed, validated `external_engine_results`; raw
client-declared benchmark values are rejected.

Calculated production and IRR do not overwrite C03/C09 automatically. They become
canonical only after validation through the existing controlled promotion function.

## Deliberately excluded

- battery dispatch;
- multi-participant ACC allocation;
- internal P50/P90 statistics;
- optimizer/Pareto ranking;
- tax modelling and a generated debt schedule;
- UI calculations.

P50/P90 values are accepted only as a validated external-study import with provenance.
