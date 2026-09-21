(function () {
  'use strict';

  const URL = 'https://rniitydsksjrphulrlct.supabase.co';
  const KEY = 'sb_publishable_M1MDLia8t54lZ5xqlEEAtg_k94v6gRR';
  const STORAGE_KEY = 'ozeno-supabase-session';
  const $ = (id) => document.getElementById(id);
  const config = window.SOLARSHIFT_CONFIG = window.SOLARSHIFT_CONFIG || {};

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

  async function loadProject(projectId, token) {
    const profiles = await api(`energy_profiles?project_id=eq.${encodeURIComponent(projectId)}&select=*&order=version.desc`, token);
    const pv = profiles.find((profile) => profile.profile_kind === 'PV_PRODUCTION');
    const load = profiles.find((profile) => profile.profile_kind === 'LOAD');
    if (!pv || !load) throw new Error('Profils PV et consommation manquants pour ce projet.');
    const ids = [pv.id, load.id];
    const points = await api(`energy_profile_points?energy_profile_id=in.(${ids.join(',')})&select=energy_profile_id,interval_start,interval_end,value_numeric&order=interval_start`, token);
    config.projectId = projectId;
    config.pvProfile = profileInput(pv, points.filter((point) => point.energy_profile_id === pv.id));
    config.loadProfile = profileInput(load, points.filter((point) => point.energy_profile_id === load.id));
    $('connectionState').textContent = `Projet connecté · PV ${pv.quality_level} · consommation ${load.quality_level}`;
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
      <label id="connectionProjectWrap" hidden>Projet autorisé<select id="connectionProject"></select></label>
      <button class="secondary" type="button" id="connectionLogout" hidden>Se déconnecter</button>`;
    const button = $('runEnergyEngine');
    finance.insertBefore(panel, button || null);
    $('connectionLink').addEventListener('click', async () => {
      const email = $('connectionEmail').value.trim();
      if (!email) { $('connectionState').textContent = 'Indiquez votre adresse e-mail.'; return; }
      $('connectionState').textContent = 'Envoi du lien sécurisé…';
      try {
        await authRequest('otp', { email, create_user: false, options: { emailRedirectTo: location.href.split('#')[0] } });
        $('connectionState').textContent = 'Lien envoyé. Ouvrez-le dans ce navigateur pour terminer la connexion.';
      } catch (error) { $('connectionState').textContent = `Connexion impossible : ${error.message}`; }
    });
    $('connectionLogout').addEventListener('click', () => { storeSession(null); location.reload(); });
  }

  async function boot() {
    installPanel();
    const session = await currentSession();
    config.getAccessToken = async () => (await currentSession())?.access_token || null;
    if (!session) { $('connectionState').textContent = 'Non connecté · les simulations locales restent indicatives.'; return; }
    storeSession(session);
    $('connectionLogin').hidden = true;
    $('connectionLogout').hidden = false;
    try {
      const projects = await api('projects?select=id,project_reference,name,status,address,postal_code,city&order=updated_at.desc', session.access_token);
      if (!projects.length) throw new Error('Aucun projet autorisé pour ce compte.');
      const select = $('connectionProject');
      select.innerHTML = projects.map((project) => `<option value="${project.id}">${project.project_reference} · ${project.name}</option>`).join('');
      $('connectionProjectWrap').hidden = false;
      select.addEventListener('change', () => loadProject(select.value, session.access_token).catch((error) => { $('connectionState').textContent = error.message; }));
      await loadProject(select.value, session.access_token);
    } catch (error) { $('connectionState').textContent = `Connecté, mais données indisponibles : ${error.message}`; }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());
