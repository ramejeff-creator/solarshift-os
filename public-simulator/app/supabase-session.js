(function () {
  'use strict';

  const config = window.SOLARSHIFT_CONFIG = window.SOLARSHIFT_CONFIG || {};
  const URL = config.supabaseUrl || 'https://rniitydsksjrphulrlct.supabase.co';
  const KEY = config.supabasePublishableKey || 'sb_publishable_M1MDLia8t54lZ5xqlEEAtg_k94v6gRR';
  const STORAGE_KEY = config.sessionStorageKey || 'ozeno-supabase-session';
  const $ = (id) => document.getElementById(id);
  config.supabaseUrl = URL;
  config.supabasePublishableKey = KEY;
  config.pvgisEndpoint = config.pvgisEndpoint || `${URL}/functions/v1/pvgis`;
  config.pvgisClimateEndpoint = config.pvgisClimateEndpoint || `${URL}/functions/v1/pvgis-climate-preview`;
  config.enedisConsumptionEndpoint = config.enedisConsumptionEndpoint || `${URL}/functions/v1/enedis-public-consumption`;
  config.enedisSyntheticProfilePreviewEndpoint = config.enedisSyntheticProfilePreviewEndpoint || `${URL}/functions/v1/enedis-synthetic-profile-preview`;
  config.prospectingOwnerEndpoint = config.prospectingOwnerEndpoint || `${URL}/functions/v1/prospecting-owner-details`;
  config.canonicalConnectionExpected = Boolean(readStoredSession() || new URLSearchParams(location.hash.replace(/^#/, '')).get('access_token'));

  function readStoredSession() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
  }

  function storeSession(session) {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  }

  function sessionFromUrl() {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    const accessToken = params.get('access_token');
    if (!accessToken) return null;
    const session = {
      access_token: accessToken,
      refresh_token: params.get('refresh_token'),
      expires_at: Math.floor(Date.now() / 1000) + Number(params.get('expires_in') || 3600)
    };
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    return session;
  }

  async function authRequest(path, body) {
    const response = await fetch(`${URL}/auth/v1/${path}`, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.msg || payload.error_description || payload.error || `Erreur ${response.status}`);
    return payload;
  }

  async function currentSession() {
    let session = sessionFromUrl() || readStoredSession();
    if (!session) return null;
    if (session.expires_at > Math.floor(Date.now() / 1000) + 60) return session;
    if (!session.refresh_token) return null;
    try {
      session = await authRequest('token?grant_type=refresh_token', { refresh_token: session.refresh_token });
      session.expires_at = Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600);
      storeSession(session);
      return session;
    } catch {
      storeSession(null);
      return null;
    }
  }

  async function api(path, token) {
    const response = await fetch(`${URL}/rest/v1/${path}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${token}` }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `Erreur API ${response.status}`);
    return payload;
  }

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const profileLabel = (profile) => profile ? `${profile.profile_kind === 'LOAD' ? 'Consommation' : 'Production PV'} · v${profile.version} · ${profile.quality_level || 'UNKNOWN'}` : 'Aucun profil canonique associé';

  function profileInput(profile, points) {
    const input = {
      profileId: profile.id,
      granularity: profile.granularity,
      qualityLevel: profile.quality_level,
      provenance: profile.provenance || { sourceType: profile.source_type, sourceReference: profile.source_reference }
    };
    if (profile.granularity === 'ANNUAL') {
      input.annualKwh = Number(profile.assumptions?.annualKwh ?? profile.assumptions?.annual_kwh);
    } else {
      input.points = points.map((point) => ({
        intervalStart: point.interval_start,
        intervalEnd: point.interval_end,
        valueKwh: Number(point.value_numeric)
      }));
    }
    return input;
  }

  function sourceProfile(profiles, id, kind) {
    if (!id) return null;
    const profile = profiles.find((item) => item.id === id);
    return profile?.profile_kind === kind ? profile : null;
  }

  function dispatchContext() {
    window.dispatchEvent(new CustomEvent('ozeno:canonical-context', { detail: {
      projectId: config.projectId || null,
      scenarioId: config.scenarioId || null,
      scenarioStatus: config.scenarioStatus || null,
      pvProfileId: config.scenarioProfileRefs?.pv || null,
      loadProfileId: config.scenarioProfileRefs?.load || null,
      p50ResultId: config.scenarioBenchmarkRefs?.p50 || null,
      p90ResultId: config.scenarioBenchmarkRefs?.p90 || null,
      ready: Boolean(config.projectId && config.scenarioId && config.scenarioStatus === 'DRAFT' && config.pvProfile && config.loadProfile)
    } }));
  }

  async function loadSelectedScenario(scenarioId, token) {
    const scenario = (config.scenarios || []).find((item) => item.id === scenarioId && item.status === 'DRAFT') || null;
    config.scenarioId = scenario?.id || null;
    config.scenarioStatus = scenario?.status || null;
    config.scenarioProfileRefs = { pv: scenario?.pv_profile_id || null, load: scenario?.load_profile_id || null };
    config.scenarioBenchmarkRefs = { p50: scenario?.p50_result_id || null, p90: scenario?.p90_result_id || null };
    config.pvProfile = null;
    config.loadProfile = null;
    dispatchContext();

    const profiles = config.energyProfiles || [];
    const pv = sourceProfile(profiles, config.scenarioProfileRefs.pv, 'PV_PRODUCTION');
    const load = sourceProfile(profiles, config.scenarioProfileRefs.load, 'LOAD');
    const attached = [pv, load].filter(Boolean);
    if (attached.length) {
      const ids = attached.map((profile) => encodeURIComponent(profile.id)).join(',');
      const points = await api(`energy_profile_points?energy_profile_id=in.(${ids})&select=energy_profile_id,interval_start,interval_end,value_numeric&order=interval_start`, token);
      if (pv) config.pvProfile = profileInput(pv, points.filter((point) => point.energy_profile_id === pv.id));
      if (load) config.loadProfile = profileInput(load, points.filter((point) => point.energy_profile_id === load.id));
    }

    const workspaceOpen = $('workspaceOpen');
    if (workspaceOpen) {
      const params = new URLSearchParams({ projectId: config.projectId });
      if (scenario?.id) params.set('scenarioId', scenario.id);
      workspaceOpen.href = `./workspace.html?${params.toString()}`;
      workspaceOpen.textContent = scenario ? `Ouvrir le scénario « ${scenario.name} » dans le workspace` : 'Ouvrir le workspace pour créer ou choisir un scénario';
    }
    const pvSummary = $('canonicalPv');
    const loadSummary = $('canonicalLoad');
    if (pvSummary) pvSummary.textContent = profileLabel(pv);
    if (loadSummary) loadSummary.textContent = profileLabel(load);
    const readiness = $('canonicalScenarioState');
    if (readiness) {
      readiness.textContent = !scenario
        ? 'Choisissez un scénario brouillon pour vérifier ses données.'
        : !pv || !load
          ? 'Associez d’abord les profils PV et consommation à ce scénario dans le workspace.'
          : 'Les deux profils canoniques sont associés à ce scénario. Le calcul Energy Engine devient disponible.';
    }
    if ($('connectionScenarioWrap')) $('connectionScenarioWrap').hidden = !(config.scenarios || []).length;
    dispatchContext();
  }

  function projectCoordinates(project, sites) {
    const site = sites.find((item) => item.latitude != null && item.longitude != null);
    const source = site || project;
    if (source?.latitude == null || source?.longitude == null) return null;
    const provenance = source.provenance || {};
    return {
      latitude: Number(source.latitude),
      longitude: Number(source.longitude),
      source: provenance.coordinateSource || provenance.coordinate_source || provenance.geocoding?.source || 'Source non précisée'
    };
  }

  async function loadProject(projectId, token) {
    config.projectId = projectId;
    config.projectContextLoaded = false;
    config.projectCoordinates = null;
    config.pvProfile = null;
    config.loadProfile = null;
    dispatchContext();
    const [projects, sites, profiles, scenarios] = await Promise.all([
      api(`projects?id=eq.${encodeURIComponent(projectId)}&select=id,project_reference,name,status,address,postal_code,city,latitude,longitude&limit=1`, token),
      api(`project_sites?project_id=eq.${encodeURIComponent(projectId)}&select=id,name,address,postal_code,city,latitude,longitude,version,validation_status,provenance,site_meter_points(meter_identifier,meter_role,validation_status)&order=updated_at.desc`, token),
      api(`energy_profiles?project_id=eq.${encodeURIComponent(projectId)}&select=id,site_id,profile_kind,granularity,source_type,source_reference,quality_level,version,coverage_start,coverage_end,coverage_ratio,provenance,assumptions,created_at&order=created_at.desc`, token),
      api(`scenarios?project_id=eq.${encodeURIComponent(projectId)}&select=id,name,scenario_kind,status,version,pv_profile_id,load_profile_id,p50_result_id,p90_result_id,technical_configuration_id,created_at&order=created_at.desc`, token)
    ]);
    const project = projects[0];
    if (!project) throw new Error('Le projet n’est pas accessible avec ce compte.');
    config.projectContext = project;
    config.addressLookupNeedsSelection = false;
    config.commercialAddressForLookup = {
      address: project.address,
      city: project.city,
      postalCode: project.postal_code || '',
      cityCode: project.city_code || '',
      label: [project.address, project.postal_code, project.city].filter(Boolean).join(' ')
    };
    config.energyProfiles = profiles;
    config.scenarios = scenarios.filter((item) => item.status === 'DRAFT');
    config.projectCoordinates = projectCoordinates(project, sites);
    config.projectContextLoaded = true;
    window.dispatchEvent(new CustomEvent('ozeno:project-context-loaded', { detail: { projectId } }));

    const address = [project.address, project.postal_code, project.city].filter(Boolean).join(', ') || 'Adresse non renseignée';
    const coordinates = config.projectCoordinates
      ? `${config.projectCoordinates.latitude.toFixed(5)}, ${config.projectCoordinates.longitude.toFixed(5)} · ${config.projectCoordinates.source}`
      : 'Coordonnées canoniques non renseignées';
    const meters = sites.flatMap((site) => site.site_meter_points || []).map((meter) => meter.meter_identifier).filter(Boolean);
    const latest = (kind) => profiles.find((profile) => profile.profile_kind === kind);
    const latestLoad = latest('LOAD');
    const latestPv = latest('PV_PRODUCTION');
    const coverage = latestLoad?.coverage_ratio == null ? 'couverture UNKNOWN' : `couverture ${Math.round(Number(latestLoad.coverage_ratio) * 100)} %`;
    const loadSource = latestLoad ? [latestLoad.source_type, latestLoad.source_reference].filter(Boolean).join(' · ') || 'source UNKNOWN' : '';
    const loadPeriod = latestLoad ? [latestLoad.coverage_start, latestLoad.coverage_end].filter(Boolean).join(' → ') || 'période UNKNOWN' : '';
    $('canonicalSnapshot').innerHTML = `<div><b>${esc(project.project_reference || project.name)}</b><span>${esc(address)}</span><span>${esc(coordinates)}</span><span>PRM / compteur : ${esc(meters.length ? meters.join(', ') : 'UNKNOWN')}</span><span>Consommation du projet : ${esc(latestLoad ? `${latestLoad.granularity || 'granularité UNKNOWN'} · ${latestLoad.quality_level || 'qualité UNKNOWN'} · ${coverage} · ${loadPeriod} · ${loadSource}` : 'UNKNOWN · aucun profil canonique')}</span><span>Production PV du projet : ${esc(profileLabel(latestPv))}</span></div>`;
    const scenarioSelect = $('connectionScenario');
    if (scenarioSelect) {
      scenarioSelect.innerHTML = config.scenarios.length
        ? config.scenarios.map((scenario) => `<option value="${esc(scenario.id)}">${esc(scenario.name)} · v${esc(scenario.version)}</option>`).join('')
        : '<option value="">Aucun scénario brouillon</option>';
      const preferred = config.scenarios.find((item) => item.id === config.scenarioId)?.id || config.scenarios[0]?.id || '';
      scenarioSelect.value = preferred;
      await loadSelectedScenario(preferred, token);
    } else {
      config.scenarioId = null;
      config.scenarioStatus = null;
      dispatchContext();
    }
    const projectSelect = $('connectionProject');
    const projectLabel = projectSelect?.selectedOptions?.[0]?.textContent || project.name;
    $('connectionState').textContent = `Connecté · ${projectLabel} · données canoniques consultées`;
    window.setTimeout(async () => {
      await window.runProductionStudy?.();
      if (config.canonicalConnectionExpected && !config.projectCoordinates) {
        window.dispatchEvent(new CustomEvent('ozeno:pvgis-preview-status', { detail: { message: 'Aperçu PVGIS indisponible : les coordonnées canoniques du projet sont manquantes.' } }));
      }
    }, 0);
  }

  function installCanonicalCoordinateGuard() {
    const previousFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const original = String(input);
      if (!original.includes('re.jrc.ec.europa.eu/api/v5_3/PVcalc')) return previousFetch(input, init);
      if (config.canonicalConnectionExpected) {
        if (!config.projectContextLoaded) {
          window.dispatchEvent(new CustomEvent('ozeno:pvgis-preview-status', { detail: { message: 'Aperçu PVGIS en attente du chargement du projet.' } }));
          return Promise.resolve(new Response(JSON.stringify({ error: 'Project context is loading' }), { status: 409, headers: { 'Content-Type': 'application/json' } }));
        }
        const coordinates = config.projectCoordinates;
        if (!coordinates) {
          window.dispatchEvent(new CustomEvent('ozeno:pvgis-preview-status', { detail: { message: 'Aperçu PVGIS indisponible : les coordonnées canoniques du projet sont manquantes.' } }));
          return Promise.resolve(new Response(JSON.stringify({ error: 'Canonical project coordinates are missing' }), { status: 422, headers: { 'Content-Type': 'application/json' } }));
        }
        const url = new URL(original);
        url.searchParams.set('lat', String(coordinates.latitude));
        url.searchParams.set('lon', String(coordinates.longitude));
        return previousFetch(url.toString(), init);
      }
      return previousFetch(input, init);
    };
  }

  function installPanel() {
    const finance = [...document.querySelectorAll('.card')].find((node) => /Simulation économique SPV/i.test(node.textContent || ''));
    if (!finance || $('supabaseConnection')) return;
    const panel = document.createElement('section');
    panel.id = 'supabaseConnection';
    panel.className = 'result ok';
    panel.innerHTML = `
      <b>Connexion commerciale</b>
      <p class="fine" id="connectionState">Vérification de la session…</p>
      <div class="form" id="connectionLogin">
        <label>Adresse e-mail professionnelle<input id="connectionEmail" type="email" autocomplete="email" placeholder="vous@entreprise.fr"></label>
        <div><button class="action" type="button" id="connectionLink">Recevoir un lien de connexion</button></div>
      </div>
      <label id="connectionProjectWrap" hidden>Projet<select id="connectionProject"></select></label>
      <div id="canonicalSummary" hidden><p class="fine"><b>Données de référence du projet</b></p><div class="canonicalSnapshot" id="canonicalSnapshot"></div><label id="connectionScenarioWrap" hidden>Scénario de travail (brouillon)<select id="connectionScenario"></select></label><div class="canonicalProfiles"><span>PV rattaché : <b id="canonicalPv">—</b></span><span>Consommation rattachée : <b id="canonicalLoad">—</b></span></div><p class="fine" id="canonicalScenarioState" aria-live="polite"></p></div>
      <a id="workspaceOpen" class="secondary" href="./workspace.html" hidden style="display:inline-block;margin-top:8px;text-decoration:none">Ouvrir le workspace canonique</a>
      <div id="canonicalEnergyResult" hidden aria-live="polite"></div>
      <button class="secondary" type="button" id="connectionLogout" hidden>Se déconnecter</button>`;
    const connectionContent = document.createElement('div');
    connectionContent.className = 'canonicalConnectionContent';
    while (panel.firstChild) connectionContent.appendChild(panel.firstChild);
    const optionalConnection = document.createElement('details');
    optionalConnection.className = 'canonicalConnectionDetails';
    optionalConnection.innerHTML = '<summary>Workspace avancé <small>Facultatif · données et calculs de référence</small></summary><p class="fine">La pré-étude commerciale fonctionne sans connexion. Après l’enregistrement du projet, ouvrez le Workspace pour consulter les profils de référence et lancer un calcul énergétique validé.</p>';
    optionalConnection.appendChild(connectionContent);
    panel.appendChild(optionalConnection);
    if (!$('canonicalPanelStyles')) {
      const style = document.createElement('style');
      style.id = 'canonicalPanelStyles';
      style.textContent = '#supabaseConnection{margin:12px 0}.canonicalConnectionDetails>summary{cursor:pointer;font-weight:700;color:#0a3f2d}.canonicalConnectionDetails>summary small{margin-left:8px;color:#587469;font-weight:400}.canonicalConnectionDetails[open]>summary{margin-bottom:10px}.canonicalConnectionDetails>p{margin:0 0 10px}.canonicalConnectionContent{padding-top:8px}#canonicalSummary{margin-top:12px}.canonicalSnapshot,.canonicalProfiles{display:grid;gap:5px;padding:10px 12px;border-radius:7px;background:#f5faf7}.canonicalSnapshot>div{display:grid;gap:5px}.canonicalProfiles{grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-top:8px}.canonicalProfiles span{font-size:.94em}#canonicalScenarioState{margin-bottom:0}#canonicalEnergyResult{margin-top:12px;padding:11px;border-left:3px solid #08734c;background:#f5faf7;border-radius:5px}#canonicalEnergyResult[hidden]{display:none}';
      document.head.appendChild(style);
    }
    const button = $('runEnergyEngine');
    finance.insertBefore(panel, button || null);
    $('connectionLink').addEventListener('click', async () => {
      const email = $('connectionEmail').value.trim();
      if (!email) { $('connectionState').textContent = 'Indiquez votre adresse e-mail.'; return; }
      $('connectionState').textContent = 'Envoi du lien sécurisé…';
      try {
        const client = await import('./project-hub-client.mjs');
        await client.sendLoginLink(email, location.href.split('#')[0]);
        $('connectionState').textContent = 'Lien envoyé. Ouvrez-le dans ce navigateur pour terminer la connexion.';
      } catch (error) {
        $('connectionState').textContent = /signups not allowed/i.test(error.message)
          ? 'Ce compte commercial n’est pas encore autorisé. Un administrateur doit d’abord le créer dans Supabase.'
          : `Connexion impossible : ${error.message}`;
      }
    });
    $('connectionScenario').addEventListener('change', () => loadSelectedScenario($('connectionScenario').value, config.sessionToken).catch((error) => { $('canonicalScenarioState').textContent = `Impossible de charger les profils associés : ${error.message}`; }));
    $('connectionProject').addEventListener('change', () => loadProject($('connectionProject').value, config.sessionToken).catch((error) => { $('connectionState').textContent = error.message; }));
    $('connectionLogout').addEventListener('click', async () => {
      try {
        const client = await import('./project-hub-client.mjs');
        await client.signOut(localStorage, (await currentSession())?.access_token);
        location.href = './index.html';
      } catch (error) { $('connectionState').textContent = `Session locale supprimée ; déconnexion serveur non confirmée : ${error.message}`; }
    });
  }

  async function boot() {
    installPanel();
    installCanonicalCoordinateGuard();
    const session = await currentSession();
    config.getAccessToken = async () => (await currentSession())?.access_token || null;
    config.openCanonicalProject = async (id) => {
      const active = await currentSession();
      if (!active) throw new Error('Connectez-vous pour ouvrir ce projet.');
      config.canonicalConnectionExpected = true;
      config.sessionToken = active.access_token;
      await loadProject(id, active.access_token);
    };
    if (!session) {
      config.canonicalConnectionExpected = false;
      $('connectionState').textContent = 'Non connecté · les aperçus commerciaux restent indicatifs.';
      $('supabaseConnection').hidden = true;
      return;
    }
    config.canonicalConnectionExpected = true;
    config.sessionToken = session.access_token;
    storeSession(session);
    $('connectionLogin').hidden = true;
    $('connectionLogout').hidden = false;
    $('canonicalSummary').hidden = false;
    try {
      const projects = await api('projects?select=id,project_reference,name&order=updated_at.desc', session.access_token);
      if (!projects.length) throw new Error('Aucun projet autorisé pour ce compte.');
      const select = $('connectionProject');
      select.innerHTML = projects.map((project) => `<option value="${esc(project.id)}">${esc(project.project_reference)} · ${esc(project.name)}</option>`).join('');
      $('connectionProjectWrap').hidden = false;
      const requested = new URLSearchParams(location.search);
      if (requested.has('draftId')) {
        config.canonicalConnectionExpected = false;
        $('canonicalSummary').hidden = true;
        $('supabaseConnection').hidden = true;
        $('connectionState').textContent = 'Connecté · brouillon local ouvert, sans profil canonique.';
        return;
      }
      if (requested.has('projectId')) {
        if (!projects.some((project) => project.id === requested.get('projectId'))) throw new Error('Le projet demandé n’est pas accessible avec ce compte.');
        select.value = requested.get('projectId');
      }
      await loadProject(select.value, session.access_token);
      const workspaceOpen = $('workspaceOpen');
      if (workspaceOpen) workspaceOpen.hidden = false;
    } catch (error) {
      $('connectionState').textContent = `Connecté, mais données indisponibles : ${error.message}`;
    }
  }

  config.sessionReady = document.readyState === 'loading'
    ? new Promise((resolve) => document.addEventListener('DOMContentLoaded', () => resolve(boot())))
    : boot();
}());
