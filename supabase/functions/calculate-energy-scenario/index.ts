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
    numeric('project_opex_year_1', result.financial.projectOpexYear1Eur, 'EUR/year');
    numeric('operating_margin', result.financial.operatingMarginYear1Eur, 'EUR/year');
    numeric('irr', result.financial.irrPct, '%');
    numeric('npv', result.financial.npvEur, 'EUR');
    numeric('payback_years', result.financial.paybackYears, 'years');
    numeric('lcoe', result.financial.lcoeEurPerKwh, 'EUR/kWh');
    structured('project_cash_flow', result.financial.projectCashFlowEur, 'EUR');
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

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Authentication required' }, 401);
  const { data: canWrite, error: authorizationError } = await userClient.rpc('can_write_project', { target_project: input.projectId });
  if (authorizationError || !canWrite) return json({ error: 'Not authorized to calculate this project' }, 403);

  const service = createClient(supabaseUrl, serviceRoleKey);
  const snapshotHash = await sha256(input);
  const sourceProfiles = [input.pvProduction.profileId, input.load?.profileId].filter((id): id is string => Boolean(id));
  if (input.scenarioId) {
    const { data: scenario, error: scenarioError } = await service.from('scenarios').select('project_id').eq('id', input.scenarioId).single();
    if (scenarioError || scenario?.project_id !== input.projectId) return json({ error: 'Scenario does not belong to the project' }, 400);
  }
  if (sourceProfiles.length > 0) {
    const { data: profiles, error: profileError } = await service.from('energy_profiles').select('id, project_id').in('id', sourceProfiles);
    const validIds = new Set((profiles ?? []).filter((profile) => profile.project_id === input.projectId).map((profile) => profile.id));
    if (profileError || sourceProfiles.some((id) => !validIds.has(id))) return json({ error: 'One or more energy profiles do not belong to the project' }, 400);
  }
  const { data: run, error: runError } = await service.from('calculation_runs').insert({
    project_id: input.projectId,
    scenario_id: input.scenarioId ?? null,
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
    return json({ calculationRunId: run.id, inputSnapshotHash: snapshotHash, result });
  } catch (error) {
    const detail = error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) };
    await service.from('calculation_runs').update({ status: 'FAILED', error_detail: detail, completed_at: new Date().toISOString() }).eq('id', run.id);
    return json({ calculationRunId: run.id, error: 'Calculation failed', detail }, 422);
  }
});
