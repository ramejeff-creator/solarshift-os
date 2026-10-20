(function configureSolarShiftRuntime() {
  const activeProject = {
    url: 'https://rniitydsksjrphulrlct.supabase.co',
    key: 'sb_publishable_M1MDLia8t54lZ5xqlEEAtg_k94v6gRR',
    name: 'active'
  };
  const testProject = {
    url: 'https://dptympcfznaqcdvtdxok.supabase.co',
    key: 'sb_publishable_hgv1JT2STnQeP2-W84IeYg_vADnN2ym',
    name: 'test'
  };
  const host = window.location.hostname.toLowerCase();
  const localPreview = window.location.protocol !== 'file:'
    && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
  const testHost = window.location.protocol === 'file:'
    || host === 'localhost'
    || host === '127.0.0.1'
    || host === '::1'
    || host === '[::1]'
    || host === 'github.io'
    || host.endsWith('.github.io')
    || host.endsWith('.pages.dev');
  const project = testHost ? testProject : activeProject;
  const config = window.SOLARSHIFT_CONFIG = window.SOLARSHIFT_CONFIG || {};
  config.environment = project.name;
  config.supabaseUrl = project.url;
  config.supabasePublishableKey = project.key;
  config.sessionStorageKey = `ozeno-supabase-session:${project.name}`;
  config.pvgisEndpoint = localPreview ? '/__local/pvgis' : `${project.url}/functions/v1/pvgis`;
  config.pvgisClimateEndpoint = `${project.url}/functions/v1/pvgis-climate-preview`;
  config.frozenScenarioReportEndpoint = `${project.url}/functions/v1/frozen-scenario-report`;
  config.projectDocumentEndpoint = `${project.url}/functions/v1/upload-project-document`;
  config.energyScenarioEndpoint = `${project.url}/functions/v1/calculate-energy-scenario`;
  config.efficiencyImpactEndpoint = `${project.url}/functions/v1/calculate-efficiency-impact`;
  config.enedisConsumptionEndpoint = `${project.url}/functions/v1/enedis-public-consumption`;
  config.enedisSyntheticProfilePreviewEndpoint = localPreview
    ? '/__local/enedis-synthetic-profile-preview'
    : `${project.url}/functions/v1/enedis-synthetic-profile-preview`;
  config.prospectingOwnerEndpoint = `${project.url}/functions/v1/prospecting-owner-details`;
  config.situationPlanEndpoint = `${project.url}/functions/v1/situation-plan`;
})();
