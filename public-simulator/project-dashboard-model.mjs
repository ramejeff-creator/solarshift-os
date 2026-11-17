const STATUS_LABELS = Object.freeze({
  VERIFIED: 'Vérifié', ASSUMPTION: 'Estimation', UNKNOWN: 'À compléter',
  STALE: 'À actualiser', PARTIAL: 'Couverture partielle'
});

const firstKpi = (kpis, codes) => kpis.find((kpi) => codes.includes(kpi.kpi_code));
const numValue = (kpi) => kpi && typeof kpi.value_numeric === 'number' && Number.isFinite(kpi.value_numeric) ? kpi.value_numeric : null;
const jsonValue = (kpi) => kpi?.value_json && typeof kpi.value_json === 'object' ? kpi.value_json : null;
const dateValue = (run) => run?.completed_at || run?.created_at || null;
const partyIsValidated = (actors, role, partyId) => actors.some((actor) => actor.actor_role === role && actor.party_id === partyId && actor.validation_status === 'VALIDATED');

function financeViews(result, actors, legacyAvailable) {
  const perspectives = Array.isArray(result?.perspectives) ? result.perspectives : [];
  const multiChannel = result?.contractType === 'MULTICHANNEL_ANNUAL_FLOWS';
  if (multiChannel) {
    return perspectives.filter((perspective) => partyIsValidated(actors, perspective.actorRole, perspective.partyId))
      .map((perspective) => ({
        key: perspective.actorRole === 'PROJECT_SPV' ? 'SPV' : perspective.actorRole === 'SITE_OWNER' ? 'OWNER' : perspective.actorRole,
        label: ({ PROJECT_SPV: 'SPV', SITE_OWNER: 'Propriétaire', INVESTOR: 'Investisseur', CLIENT: 'Client', ENERGY_CONSUMER: 'Consommateur', SOLARSHIFT: 'SolarShift', LENDER: 'Prêteur' })[perspective.actorRole] || null,
        role: perspective.actorRole, partyId: perspective.partyId, result: perspective
      })).filter((item) => item.label);
  }
  if (!legacyAvailable) return [];
  const assetOwners = actors.filter((actor) => actor.actor_role === 'PV_ASSET_OWNER' && actor.validation_status === 'VALIDATED');
  const consumers = actors.filter((actor) => actor.actor_role === 'ENERGY_CONSUMER' && actor.validation_status === 'VALIDATED');
  const samePartyOwnerOperator = assetOwners.some((owner) => consumers.some((consumer) => consumer.party_id === owner.party_id));
  return samePartyOwnerOperator ? [{ key: 'OWNER', label: 'Propriétaire', role: 'OWNER_OPERATOR', partyId: assetOwners[0]?.party_id, result: null }] : [];
}

function energySummary(decision, productionValue, scenarioCurrent, isStale = false) {
  const mode = decision?.scenario_mode || null;
  const method = decision?.allocation_method || null;
  const maturity = decision?.decision_maturity || null;
  const values = decision?.energy_volumes_kwh && typeof decision.energy_volumes_kwh === 'object' ? decision.energy_volumes_kwh : {};
  const canonical = scenarioCurrent && decision?.status === 'READY' && method === 'TEMPORAL_MATCHING' && maturity === 'CANONICAL';
  const preview = decision?.status === 'READY' && method === 'ANNUAL_PREVIEW';
  const rows = mode === 'FULL_SALE'
    ? [{ channel: 'FULL_SALE', label: 'Vente totale', value: values.FULL_SALE ?? null, unit: 'kWh/an' }]
    : ['ACI', 'ACC', 'SURPLUS'].filter((channel) => (decision?.enabled_channels || []).includes(channel))
      .map((channel) => ({ channel, label: ({ ACI: 'ACI', ACC: 'ACC', SURPLUS: 'Surplus' })[channel], value: values[channel] ?? null, unit: 'kWh/an' }));
  return {
    mode, method, maturity, rows, productionValue,
    matchingLabel: isStale ? 'À actualiser avec cette version' : canonical ? 'Matching temporel · canonique' : preview ? 'Estimation annuelle' : mode === 'FULL_SALE' && productionValue != null ? 'Vente totale · production canonique' : 'Matching à compléter',
    status: isStale ? 'STALE' : canonical ? 'VERIFIED' : preview || (mode === 'FULL_SALE' && productionValue != null) ? 'ASSUMPTION' : 'UNKNOWN'
  };
}

export function buildProjectDashboardModel(projectData, scenarioData, preferredPerspective = null) {
  const project = projectData?.project || null;
  const scenarios = (projectData?.scenarios || []).filter((scenario) => scenario.status !== 'RETIRED');
  const explicitId = scenarioData?.scenario?.id || null;
  const scenario = explicitId ? scenarios.find((item) => item.id === explicitId) || scenarioData.scenario : scenarios[0] || null;
  const runs = scenarioData?.calculationRuns || [];
  const canonicalRun = scenario?.canonical_calculation_run_id
    ? runs.find((run) => run.id === scenario.canonical_calculation_run_id) || null
    : null;
  const inputsCurrent = scenario && scenario.inputs_revision != null && scenario.canonical_inputs_revision != null
    ? scenario.inputs_revision === scenario.canonical_inputs_revision : null;
  const energyRunCurrent = Boolean(canonicalRun?.status === 'SUCCEEDED' && inputsCurrent !== false);
  const runKpis = energyRunCurrent
    ? (scenarioData?.calculatedKpis || []).filter((kpi) => kpi.calculation_run_id === canonicalRun.id)
    : [];
  const kpi = (codes) => firstKpi(runKpis, codes);
  const productionKpi = kpi(['pv_production_annual_kwh']);
  const production = energyRunCurrent ? numValue(productionKpi) : null;
  const decisionKpi = kpi(['cr011_scenario_decision']);
  const decision = jsonValue(decisionKpi);
  const techConfig = (scenarioData?.technicalConfigurations || projectData?.technicalConfigurations || [])
    .find((item) => item.id === scenario?.technical_configuration_id)
    || (projectData?.technicalConfigurations || []).find((item) => item.id === scenario?.technical_configuration_id)
    || (!scenario ? (projectData?.technicalConfigurations || [])[0] : null)
    || null;

  const financialKpi = kpi(['financial_multichannel_result']);
  const financialResult = jsonValue(financialKpi);
  const legacyAvailable = Boolean(energyRunCurrent && kpi(['irr']) && kpi(['project_cash_flow']));
  const actors = scenarioData?.actors || [];
  const perspectives = financeViews(financialResult, actors, legacyAvailable);
  const requested = preferredPerspective ? perspectives.find((item) => item.key === preferredPerspective) : null;
  const selectedPerspective = requested || perspectives[0] || null;
  const selectedFinance = selectedPerspective?.result || (selectedPerspective && financialResult?.contractType !== 'MULTICHANNEL_ANNUAL_FLOWS' ? financialResult : null);
  const legacyKpis = selectedPerspective?.key === 'OWNER' && financialResult?.contractType !== 'MULTICHANNEL_ANNUAL_FLOWS' ? runKpis : [];
  const financeStatus = !energyRunCurrent && canonicalRun
    ? inputsCurrent === false ? 'STALE' : 'UNKNOWN'
    : selectedPerspective ? 'ASSUMPTION' : 'UNKNOWN';
  const currentFinance = energyRunCurrent ? selectedFinance : null;
  const financialMetric = (value, kpiCodes = []) => {
    if (!selectedPerspective) return null;
    if (value != null && Number.isFinite(Number(value))) return Number(value);
    const found = firstKpi(legacyKpis, kpiCodes);
    return energyRunCurrent ? numValue(found) : null;
  };
  const irr = financialMetric(currentFinance?.irrPct, ['irr']);
  const npv = financialMetric(currentFinance?.npvEur, ['npv']);
  const payback = financialMetric(currentFinance?.paybackYears, ['payback_years']);
  const ebitdaSeries = currentFinance?.annualEbitdaEur;
  const ebitda = Array.isArray(ebitdaSeries) ? (ebitdaSeries.length > 1 ? ebitdaSeries[1] : ebitdaSeries[0]) : financialMetric(null, ['annual_ebitda']);
  const cashFlows = Array.isArray(currentFinance?.annualCashFlowEur) && currentFinance.annualCashFlowEur.every((value) => Number.isFinite(Number(value)))
    ? currentFinance.annualCashFlowEur.map(Number) : null;

  const carbonRuns = runs.filter((run) => run.engine_code === 'CARBON_IMPACT_ENGINE' && run.status === 'SUCCEEDED')
    .sort((a, b) => String(b.completed_at || b.created_at || '').localeCompare(String(a.completed_at || a.created_at || '')));
  const carbonRun = carbonRuns.find((run) => {
    const row = (scenarioData?.calculatedKpis || []).find((item) => item.calculation_run_id === run.id && item.kpi_code === 'carbon_impact_result');
    const result = jsonValue(row);
    return result?.energy_source_run_id === canonicalRun?.id && result?.energy_source_snapshot_hash === canonicalRun?.input_snapshot_hash;
  }) || carbonRuns[0] || null;
  const carbonKpi = carbonRun && (scenarioData?.calculatedKpis || []).find((item) => item.calculation_run_id === carbonRun.id && item.kpi_code === 'carbon_impact_result');
  const carbonResult = jsonValue(carbonKpi);
  const carbonCurrent = Boolean(energyRunCurrent && carbonRun?.status === 'SUCCEEDED'
    && carbonResult?.energy_source_run_id === canonicalRun?.id
    && carbonResult?.energy_source_snapshot_hash === canonicalRun?.input_snapshot_hash);
  const carbonStatus = carbonResult ? (carbonCurrent ? 'ASSUMPTION' : 'STALE') : 'UNKNOWN';

  const supportRuns = runs.filter((run) => run.engine_code === 'CR015_SUPPORT_ELIGIBILITY_ENGINE' && run.status === 'SUCCEEDED');
  const supportCandidates = supportRuns.map((run) => {
    const row = (scenarioData?.calculatedKpis || []).find((item) => item.calculation_run_id === run.id && item.kpi_code === 'support_eligibility_result');
    const result = jsonValue(row);
    return result ? { run, result } : null;
  }).filter(Boolean);
  const supportResults = supportCandidates.filter(({ run, result }) => result.scenario_version === scenario?.version
    && result.input_snapshot_hash === run.input_snapshot_hash).map(({ result }) => result);
  const supportStatus = supportCandidates.length
    ? supportResults.length && ['VALIDATED', 'PUBLISHED'].includes(scenario?.status) ? 'ASSUMPTION' : 'STALE'
    : 'UNKNOWN';
  const cataloguePartial = true; // CR-015 V1 explicitly declares its verified catalogue non-exhaustive.

  const capexKpi = kpi(['capex_total_eur', 'total_capex_eur', 'capex_eur']);
  const lcoeKpi = financialResult?.contractType === 'LEGACY_SCALAR' ? kpi(['lcoe', 'lcoe_eur_per_kwh']) : null;
  const latestCalculation = dateValue(canonicalRun);
  const pvProfile = (scenarioData?.profiles || []).find((profile) => profile.id === scenario?.pv_profile_id && profile.profile_kind === 'PV_PRODUCTION');
  const actionHref = `./workspace.html?projectId=${encodeURIComponent(project?.id || '')}${scenario?.id ? `&scenarioId=${encodeURIComponent(scenario.id)}` : ''}#scenarioPanel`;

  return {
    project, scenarios, scenario, scenarioData, canonicalRun, energyRunCurrent, inputsCurrent,
    currentness: !scenario ? 'UNKNOWN' : !canonicalRun ? 'UNKNOWN' : inputsCurrent === false ? 'STALE' : inputsCurrent === true && canonicalRun.status === 'SUCCEEDED' ? 'VERIFIED' : 'UNKNOWN',
    latestCalculation,
    technical: {
      configuration: techConfig,
      areas: techConfig?.technical_configuration_solar_areas || [],
      status: techConfig ? 'ASSUMPTION' : 'UNKNOWN'
    },
    kpis: [
      { key: 'power', label: 'Puissance', value: energyRunCurrent ? (techConfig?.pv_capacity_kwp ?? null) : null, unit: 'kWc', status: techConfig ? 'ASSUMPTION' : 'UNKNOWN' },
      { key: 'production', label: 'Production annuelle', value: production, unit: 'kWh/an', status: energyRunCurrent && production != null ? (productionKpi?.quality_level === 'Q4' ? 'VERIFIED' : 'ASSUMPTION') : inputsCurrent === false && canonicalRun ? 'STALE' : 'UNKNOWN' },
      { key: 'capex', label: 'CAPEX', value: energyRunCurrent ? numValue(capexKpi) : null, unit: '€', status: capexKpi && energyRunCurrent ? 'ASSUMPTION' : inputsCurrent === false && canonicalRun ? 'STALE' : 'UNKNOWN' },
      { key: 'lcoe', label: 'Coût solaire / kWh', value: energyRunCurrent ? numValue(lcoeKpi) : null, unit: '€/kWh', status: energyRunCurrent && numValue(lcoeKpi) != null ? 'ASSUMPTION' : inputsCurrent === false && canonicalRun ? 'STALE' : 'UNKNOWN' },
      { key: 'irr', label: 'TRI', value: irr, unit: '%', status: financeStatus },
      { key: 'payback', label: 'Payback', value: payback, unit: 'ans', status: financeStatus },
      { key: 'carbon', label: 'CO₂e évité estimé', value: carbonCurrent ? carbonResult?.avoided_co2e_t_year ?? null : null, unit: 'tCO₂e/an', status: carbonStatus }
    ],
    energy: energySummary(decision, production, energyRunCurrent, Boolean(canonicalRun && inputsCurrent === false)),
    finance: {
      perspectives, selectedPerspective, status: financeStatus, irr, npv, payback, ebitda,
      cashFlows: energyRunCurrent ? cashFlows : null,
      cashFlowStatus: energyRunCurrent && cashFlows ? financeStatus : 'UNKNOWN',
      contractType: financialResult?.contractType || null
    },
    impact: {
      status: carbonStatus,
      co2eTonnesPerYear: carbonCurrent ? carbonResult?.avoided_co2e_t_year ?? null : null,
      carEquivalentKm: carbonCurrent ? carbonResult?.thermal_car_equivalent_km ?? null : null,
      moduleRate: carbonCurrent && carbonResult?.pv_module_valorization_status === 'CONTEXTUAL_REFERENCE' ? carbonResult?.pv_module_valorization_rate ?? null : null,
      moduleStatus: carbonCurrent ? carbonResult?.pv_module_valorization_status || 'UNKNOWN' : carbonStatus,
      methodology: carbonCurrent ? carbonResult?.methodology || null : null,
      factor: carbonCurrent ? carbonResult?.carbon_factor || null : null,
      referenceYear: carbonCurrent ? carbonResult?.reference_year ?? null : null
    },
    support: { results: supportStatus === 'STALE' ? [] : supportResults, status: supportStatus, cataloguePartial },
    actions: {
      recalculate: scenario?.status === 'DRAFT' && Boolean(pvProfile),
      validate: scenario?.status === 'CALCULATED',
      report: ['VALIDATED', 'PUBLISHED'].includes(scenario?.status),
      workspaceHref: actionHref
    },
    labels: STATUS_LABELS
  };
}

export { STATUS_LABELS };
