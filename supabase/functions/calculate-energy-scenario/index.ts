import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  ENERGY_ENGINE_VERSION,
  ENERGY_FORMULA_VERSION,
  FINANCIAL_MODEL_VERSION,
  calculateEnergyScenario
} from '../_shared/energy-engine.ts';
import type { EnergyCalculationResult, EnergyScenarioInput } from '../_shared/energy-types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stable(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function kpiRows(runId: string, input: EnergyScenarioInput, result: EnergyCalculationResult) {
  const common = {
    project_id: input.projectId,
    scenario_id: input.scenarioId ?? null,
    calculation_run_id: runId,
    formula_version: result.formulaVersion,
    quality_level: result.qualityLevel,
    source_parameter_ids: [],
    assumptions_snapshot: input.financial ?? {},
    provenance: { engine_version: result.engineVersion }
  };
  const rows: Record<string, unknown>[] = [];
  const numeric = (code: string, value: number | undefined, unit: string) => {
    if (value !== undefined) rows.push({ ...common, kpi_code: code, value_numeric: value, value_json: null, unit, is_validated_reference: false });
  };
  const structured = (code: string, value: unknown, unit: string) => rows.push({ ...common, kpi_code: code, value_numeric: null, value_json: value, unit, is_validated_reference: false });

  numeric('pv_production_annual_kwh', result.energy.pvProductionAnnualKwh, 'kWh/year');
  numeric('load_annual_kwh', result.energy.loadAnnualKwh, 'kWh/year');
  numeric('direct_self_consumption_kwh', result.energy.directSelfConsumptionKwh, 'kWh/year');
  numeric('self_consumption_rate_pct', result.energy.selfConsumptionRatePct, '%');
  numeric('self_sufficiency_rate_pct', result.energy.selfSufficiencyRatePct, '%');
  numeric('grid_import_kwh', result.energy.gridImportKwh, 'kWh/year');
  numeric('grid_export_kwh', result.energy.gridExportKwh, 'kWh/year');
  numeric('surplus_kwh', result.energy.surplusKwh, 'kWh/year');
  numeric('pv_production_p50_kwh', result.productionBenchmarks?.p50Kwh, 'kWh/year');
  numeric('pv_production_p90_kwh', result.productionBenchmarks?.p90Kwh, 'kWh/year');
  if (result.financial) {
    numeric('electricity_bill_baseline', result.financial.electricityBillBaselineYear1Eur, 'EUR/year');
    numeric('electricity_bill_project', result.financial.electricityBillProjectYear1Eur, 'EUR/year');
    numeric('client_savings_year_1', result.financial.clientSavingsYear1Eur, 'EUR/year');
    numeric('client_savings_lifetime', result.financial.clientSavingsLifecycleEur, 'EUR');
    numeric('project_revenue_year_1', result.financial.projectRevenueYear1Eur, 'EUR/year');
    numeric('project_revenue_average', result.financial.projectRevenueAverageEur, 'EUR/year');
    numeric('project_opex_year_1', result.financial.projectOpexYear1Eur, 'EUR/year');
    numeric('operating_margin', result.financial.operatingMarginYear1Eur, 'EUR/year');
    numeric('operating_margin_average', result.financial.operatingMarginAverageEur, 'EUR/year');
    numeric('project_net_total', result.financial.projectNetTotalEur, 'EUR');
    numeric('irr', result.financial.irrPct, '%');
    numeric('npv', result.financial.npvEur, 'EUR');
    numeric('payback_years', result.financial.paybackYears, 'years');
    numeric('lcoe', result.financial.lcoeEurPerKwh, 'EUR/kWh');
    structured('project_cash_flow', result.financial.projectCashFlowEur, 'EUR');
    structured('annual_revenue', result.financial.annualRevenueEur, 'EUR/year');
    structured('annual_ebitda', result.financial.annualEbitdaEur, 'EUR/year');
    structured('investor_cash_flow', result.financial.investorCashFlowEur, 'EUR');
  }
  return rows;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: 'Server configuration is incomplete' }, 500);
  if (!authorization) return json({ error: 'Authentication required' }, 401);

  let input: EnergyScenarioInput;
  try {
    input = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!input?.projectId) return json({ error: 'projectId is required' }, 400);
  if (input.scenarioId && input.simulationId) {
    return json({ error: 'A calculation must target either a scenario or a working simulation, not both' }, 400);
  }

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Authentication required' }, 401);
  const { data: canWrite, error: authorizationError } = await userClient.rpc('can_write_project', { target_project: input.projectId });
  if (authorizationError || !canWrite) return json({ error: 'Not authorized to calculate this project' }, 403);

  const service = createClient(supabaseUrl, serviceRoleKey);
  const sourceProfiles = [input.pvProduction.profileId, input.load?.profileId].filter((id): id is string => Boolean(id));
  if (input.scenarioId) {
    const { data: scenario, error: scenarioError } = await service.from('scenarios').select('project_id, status').eq('id', input.scenarioId).single();
    if (scenarioError || scenario?.project_id !== input.projectId) return json({ error: 'Scenario does not belong to the project' }, 400);
    if (scenario.status !== 'DRAFT') return json({ error: 'Only a DRAFT scenario can receive a calculation run' }, 409);
  }
  if (input.simulationId) {
    const { data: simulation, error: simulationError } = await service.from('simulation_sessions').select('project_id, status, retention_days').eq('id', input.simulationId).single();
    if (simulationError || simulation?.project_id !== input.projectId || simulation.status !== 'WORKING') {
      return json({ error: 'Working simulation does not belong to the project' }, 400);
    }
  }
  if (sourceProfiles.length > 0) {
    const { data: profiles, error: profileError } = await service.from('energy_profiles').select('id, project_id').in('id', sourceProfiles);
    const validIds = new Set((profiles ?? []).filter((profile) => profile.project_id === input.projectId).map((profile) => profile.id));
    if (profileError || sourceProfiles.some((id) => !validIds.has(id))) return json({ error: 'One or more energy profiles do not belong to the project' }, 400);
  }

  if (input.productionBenchmarks && !input.productionBenchmarkResultIds) {
    return json({ error: 'Production benchmarks must be selected by validated external result ID' }, 400);
  }

  const benchmarkIds = input.productionBenchmarkResultIds;
  if (benchmarkIds) {
    const requested = [benchmarkIds.p50ResultId, benchmarkIds.p90ResultId].filter((id): id is string => Boolean(id));
    if (requested.length === 0) return json({ error: 'At least one production benchmark result ID is required' }, 400);
    if (new Set(requested).size !== requested.length) return json({ error: 'P50 and P90 must reference distinct external results' }, 400);

    const { data: externalResults, error: externalResultError } = await service
      .from('external_engine_results')
      .select('id, project_id, result_kind, value_numeric, unit, source_engine, source_reference, methodology, evidence_id, validation_status, provenance, version')
      .in('id', requested);
    if (externalResultError || (externalResults?.length ?? 0) !== requested.length) {
      return json({ error: 'One or more production benchmark results were not found' }, 400);
    }

    const byId = new Map((externalResults ?? []).map((result) => [result.id, result]));
    const resolveBenchmark = (id: string | undefined, expectedKind: 'P50' | 'P90'): number | undefined => {
      if (!id) return undefined;
      const result = byId.get(id);
      if (!result || result.project_id !== input.projectId || result.result_kind !== expectedKind
        || result.validation_status !== 'VALIDATED' || !result.evidence_id
        || result.value_numeric === null || result.value_numeric === undefined
        || String(result.source_engine).toUpperCase() === 'PVGIS') {
        throw new Error(`${expectedKind} must reference a validated, Evidence-backed external engineering result`);
      }
      return Number(result.value_numeric);
    };

    try {
      const p50Kwh = resolveBenchmark(benchmarkIds.p50ResultId, 'P50');
      const p90Kwh = resolveBenchmark(benchmarkIds.p90ResultId, 'P90');
      input = {
        ...input,
        productionBenchmarks: {
          p50Kwh,
          p90Kwh,
          methodology: 'VALIDATED_EXTERNAL_STUDY',
          provenance: {
            sourceType: 'EXTERNAL_ENGINE_RESULT',
            sourceReference: requested.join(','),
            evidenceId: (externalResults ?? []).map((result) => result.evidence_id).join(','),
            externalEngineResultIds: requested,
            versions: (externalResults ?? []).map((result) => ({ id: result.id, version: result.version }))
          }
        }
      };
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  }

  const snapshotHash = await sha256(input);
  const { data: run, error: runError } = await service.from('calculation_runs').insert({
    project_id: input.projectId,
    scenario_id: input.scenarioId ?? null,
    simulation_session_id: input.simulationId ?? null,
    engine_code: 'ENERGY_ENGINE',
    engine_version: ENERGY_ENGINE_VERSION,
    financial_model_version: FINANCIAL_MODEL_VERSION,
    status: 'RUNNING',
    quality_level: 'Q0',
    input_snapshot: input,
    input_snapshot_hash: snapshotHash,
    assumptions_snapshot: input.financial ?? {},
    source_parameter_ids: [],
    source_profile_ids: sourceProfiles,
    external_study_references: input.productionBenchmarks ? [input.productionBenchmarks.provenance] : [],
    started_at: new Date().toISOString(),
    created_by: userData.user.id
  }).select('id').single();
  if (runError || !run) return json({ error: 'Unable to create calculation run', detail: runError?.message }, 500);

  try {
    const result = calculateEnergyScenario(input);
    const rows = kpiRows(run.id, input, result);
    if (rows.length > 0) {
      const { error: kpiError } = await service.from('calculated_kpis').insert(rows);
      if (kpiError) throw kpiError;
    }
    const { error: completionError } = await service.from('calculation_runs').update({
      status: 'SUCCEEDED',
      quality_level: result.qualityLevel,
      warnings: result.warnings,
      missing_inputs: result.missingInputs,
      completed_at: new Date().toISOString()
    }).eq('id', run.id);
    if (completionError) throw completionError;
    // A successful canonical server run may advance only a DRAFT scenario.
    // Validated/published scenarios remain immutable and are never overwritten.
    if (input.scenarioId) {
      const { error: scenarioStatusError } = await service.from('scenarios').update({ status: 'CALCULATED' })
        .eq('id', input.scenarioId).eq('status', 'DRAFT');
      if (scenarioStatusError) throw scenarioStatusError;
    }
    if (input.simulationId) {
      const expiry = new Date();
      const { data: simulationRetention } = await service.from('simulation_sessions').select('retention_days').eq('id', input.simulationId).single();
      expiry.setUTCDate(expiry.getUTCDate() + (simulationRetention?.retention_days ?? 90));
      const { error: simulationAttachError } = await service.from('simulation_sessions').update({
        latest_calculation_run_id: run.id,
        last_activity_at: new Date().toISOString(),
        expires_at: expiry.toISOString(),
        updated_by: userData.user.id,
        updated_at: new Date().toISOString()
      }).eq('id', input.simulationId).eq('status', 'WORKING');
      if (simulationAttachError) throw simulationAttachError;
    }
    return json({ calculationRunId: run.id, inputSnapshotHash: snapshotHash, result });
  } catch (error) {
    const detail = error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) };
    await service.from('calculation_runs').update({ status: 'FAILED', error_detail: detail, completed_at: new Date().toISOString() }).eq('id', run.id);
    return json({ calculationRunId: run.id, error: 'Calculation failed', detail }, 422);
  }
});
