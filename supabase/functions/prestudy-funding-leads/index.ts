import pilotCatalog from '../_shared/funding-core/data/pilot-catalog.json' with { type: 'json' };
import { evaluateFundingCatalog } from '../_shared/funding-core/src/engine.ts';
import type { FundingProjectContext, FundingMatch } from '../_shared/funding-core/src/types.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

const wallPlans = new Set(['NONE', 'ITI', 'ITE', 'BOTH', 'OTHER', 'UNKNOWN']);
const heatingSystems = new Set(['COAL_BOILER', 'OIL_BOILER', 'GAS_BOILER', 'PROPANE_BOILER', 'DIRECT_ELECTRIC', 'HEAT_PUMP', 'HEAT_NETWORK', 'BIOMASS', 'OTHER', 'UNKNOWN']);
const replacementSystems = new Set(['NONE', 'HEAT_NETWORK', 'HP_AIR_WATER', 'HP_WATER_WATER', 'GEOTHERMAL', 'BIOMASS', 'OTHER', 'UNKNOWN']);
const boolish = (value: unknown): boolean | undefined => value === 'YES' ? true : value === 'NO' ? false : undefined;

function makeContext(input: Record<string, unknown>, asOf: string): FundingProjectContext {
  const wallPlan = wallPlans.has(String(input.wallInsulationPlan)) ? String(input.wallInsulationPlan) : 'UNKNOWN';
  const currentHeating = heatingSystems.has(String(input.currentHeatingSystem)) ? String(input.currentHeatingSystem) : 'UNKNOWN';
  const plannedHeating = replacementSystems.has(String(input.plannedHeatingSystem)) ? String(input.plannedHeatingSystem) : 'UNKNOWN';
  const heatingReplacementPlanned = input.heatingReplacementPlanned === 'YES';
  const actions: FundingProjectContext['work']['actions'] = [];
  if (['ITI', 'ITE', 'BOTH'].includes(wallPlan)) actions.push('WALL_INSULATION');
  if (heatingReplacementPlanned) actions.push('HEATING_REPLACEMENT');
  return {
    projectId: 'PRESTUDY_FUNDING_PREVIEW',
    scenarioId: 'BUILDING_ENVELOPE_HEATING',
    asOf,
    site: {},
    organization: { professional: true },
    work: {
      actions,
      ...(heatingReplacementPlanned ? {
        currentHeatingSystem: currentHeating as NonNullable<FundingProjectContext['work']['currentHeatingSystem']>,
        plannedHeatingSystem: plannedHeating === 'NONE' ? 'UNKNOWN' : plannedHeating as NonNullable<FundingProjectContext['work']['plannedHeatingSystem']>,
        buildingOlderThanTwoYears: boolish(input.buildingOlderThanTwoYears)
      } : {})
    },
    funding: {},
    timeline: {
      ...(input.workAlreadyCommitted === 'YES' ? { orderOrWorkCommittedBeforeApplication: true } : input.workAlreadyCommitted === 'NO' ? { orderOrWorkCommittedBeforeApplication: false } : {})
    }
  };
}

function toLeads(matches: readonly FundingMatch[], context: FundingProjectContext) {
  const byId = new Map(matches.map((match) => [match.programId, match]));
  const leads: Array<{ id: string; title: string; description: string; sourceUrl: string; sourceCheckedAt: string; status: string }> = [];
  const wallMatch = byId.get('FUND-CEE-002');
  if (context.work.actions.includes('WALL_INSULATION') && wallMatch && !['EXCLUDED', 'CLOSED'].includes(wallMatch.status)) {
    leads.push({
      id: 'wall-insulation-cee',
      title: 'CEE tertiaires · isolation des murs',
      description: 'Piste à examiner pour les travaux d’isolation prévus. La fiche applicable, l’usage du local, les performances, les justificatifs et la date d’engagement restent à vérifier avec un opérateur CEE.',
      sourceUrl: wallMatch.source.url,
      sourceCheckedAt: wallMatch.source.checkedAt,
      status: 'À instruire'
    });
  }
  const heatingMatch = byId.get('FUND-CEE-008');
  const knownCoveredOldSystem = ['COAL_BOILER', 'OIL_BOILER', 'GAS_BOILER'].includes(context.work.currentHeatingSystem || 'UNKNOWN');
  const knownCoveredReplacement = ['HEAT_NETWORK', 'HP_AIR_WATER', 'HP_WATER_WATER', 'GEOTHERMAL'].includes(context.work.plannedHeatingSystem || 'UNKNOWN');
  if (context.work.actions.includes('HEATING_REPLACEMENT') && knownCoveredOldSystem && knownCoveredReplacement && heatingMatch && !['EXCLUDED', 'CLOSED'].includes(heatingMatch.status)) {
    leads.push({
      id: 'heating-replacement-cee',
      title: 'Prime CEE « Coup de pouce Chauffage »',
      description: 'Piste à examiner si une chaudière charbon, fioul ou gaz est remplacée par un réseau de chaleur efficace ou, sous conditions, une pompe à chaleur ou la géothermie. Ancienneté du bâtiment, réseau disponible, fiche technique et chronologie de l’offre à confirmer.',
      sourceUrl: heatingMatch.source.url,
      sourceCheckedAt: heatingMatch.source.checkedAt,
      status: 'À instruire'
    });
  }
  return leads;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!request.headers.has('authorization')) return json({ error: 'Authentication required' }, 401);
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 8192) return json({ error: 'Request too large' }, 413);
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { return json({ error: 'Valid JSON body required' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'JSON body required' }, 400);

  try {
    const context = makeContext(body as Record<string, unknown>, new Date().toISOString().slice(0, 10));
    const matches = evaluateFundingCatalog(pilotCatalog, context);
    const leads = toLeads(matches, context);
    return json({
      kind: leads.length ? 'POSSIBLE_LEADS' : 'NO_MATCHING_LEAD',
      title: leads.length ? 'Pistes d’aides à examiner' : 'Aucune piste ciblée avec ces réponses',
      note: leads.length
        ? 'Le repérage s’appuie sur les travaux envisagés. Il ne confirme aucune éligibilité, aucun montant ni l’ouverture d’un guichet. Aucune demande n’est déposée.'
        : 'Cela ne prouve pas qu’aucune aide existe. Les réponses actuelles ne font ressortir aucune piste du registre pilote.',
      leads
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_funding_input';
    return json({ error: message }, 400);
  }
});
