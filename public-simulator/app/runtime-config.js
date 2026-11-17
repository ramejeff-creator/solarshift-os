(function configureSolarShiftRuntime() {
  const activeProject = {
    url: 'https://dptympcfznaqcdvtdxok.supabase.co',
    key: 'sb_publishable_hgv1JT2STnQeP2-W84IeYg_vADnN2ym',
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
    || host.endsWith('.github.io')
    || host.endsWith('.pages.dev');
  const project = testHost ? testProject : activeProject;
  const config = window.SOLARSHIFT_CONFIG = window.SOLARSHIFT_CONFIG || {};
  config.environment = project.name;
  // Phone MFA is a paid Supabase add-on. Keep the local test preview usable
  // without weakening authentication on any hosted test or production origin.
  config.localTestMfaBypass = localPreview && project.name === 'test';
  config.betaTestMfaBypass = window.location.protocol === 'https:'
    && host === 'ramejeff-creator.github.io'
    && String(window.location.pathname || '').startsWith('/solarshift-os/')
    && project.name === 'test' && project.url === 'https://dptympcfznaqcdvtdxok.supabase.co';

  // Une seule présentation active sur le serveur local : les anciennes URL
  // restent compatibles sans exiger de paramètre dans la barre d’adresse.
  // Un false explicite reste disponible pour une comparaison locale ponctuelle.
  const ooiPreviewParam = new URLSearchParams(window.location.search).get('OOI_VISUAL_PREVIEW_ENABLED');
  config.OOI_VISUAL_PREVIEW_ENABLED = (localPreview || host === 'ramejeff-creator.github.io') && ooiPreviewParam !== 'false';
  // The newer prospecting experience is the default on the local loopback server only.
  // An explicit URL value can still switch it off for a local baseline comparison.
  config.OBI_TERTIARY_PROSPECTING_ENABLED = localPreview || host === 'ramejeff-creator.github.io';
  // Public directory is developed locally first; no undeployed remote route is called.
  config.installerDirectoryEndpoint = localPreview ? '/__local/installer-directory' : '';
  config.supabaseUrl = project.url;
  config.supabasePublishableKey = project.key;
  config.sessionStorageKey = `ozeno-supabase-session:${project.name}`;
  config.pvgisEndpoint = localPreview ? '/__local/pvgis' : `${project.url}/functions/v1/pvgis`;
  config.financialPreviewEndpoint = localPreview ? '/__local/financial-preview' : `${project.url}/functions/v1/financial-preview`;
  config.publicFundingHintEndpoint = localPreview
    ? '/__local/public-funding-hint'
    : `${project.url}/functions/v1/public-funding-hint`;
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
  config.siteContextEndpoint = localPreview ? '/__local/site-context' : `${project.url}/functions/v1/site-context`;
  config.situationPlanEndpoint = localPreview ? '/__local/situation-plan' : `${project.url}/functions/v1/situation-plan`;
})();
