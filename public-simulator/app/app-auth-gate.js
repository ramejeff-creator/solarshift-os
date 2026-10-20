(function installAppAuthenticationGate() {
  const config = window.SOLARSHIFT_CONFIG || {};
  const sessionKey = config.sessionStorageKey;
  if (config.environment !== 'test' || !sessionKey || /(?:^|\/)login\.html$/i.test(window.location.pathname)) return;

  window.__SOLARSHIFT_AUTHORIZED = false;
  const authorized = new Promise((resolve) => { window.__SOLARSHIFT_AUTH_RESOLVE = resolve; });
  const originalFetch = window.fetch.bind(window);
  const apiOrigin = String(config.supabaseUrl || '').replace(/\/$/, '');
  const activeOrigin = 'https://rniitydsksjrphulrlct.supabase.co';
  window.fetch = (input, init) => {
    let requestInput = input;
    let url = typeof input === 'string' ? input : input?.url || String(input);
    if (config.environment === 'test' && url.startsWith(`${activeOrigin}/`)) {
      url = `${apiOrigin}${url.slice(activeOrigin.length)}`;
      requestInput = input instanceof Request ? new Request(url, input) : url;
    }
    if (!apiOrigin || !url.startsWith(`${apiOrigin}/`)) return originalFetch(requestInput, init);
    const path = url.slice(apiOrigin.length);
    if (/^\/auth\/v1\/(?:token|user|logout)(?:\?|$)/.test(path)) return originalFetch(requestInput, init);
    return authorized.then((allowed) => {
      if (!allowed) throw new Error('Connexion requise.');
      return originalFetch(requestInput, init);
    });
  };

  document.documentElement.classList.add('appAuthPending');
  const style = document.createElement('style');
  style.textContent = 'html.appAuthPending body{visibility:hidden!important}.appAuthControls{position:relative;margin-left:auto;color:inherit;font:inherit;font-size:13px}.appAuthControls>summary{list-style:none;cursor:pointer;font-weight:650}.appAuthControls>summary::-webkit-details-marker{display:none}.appAuthControlsMenu{position:absolute;top:calc(100% + 8px);right:0;z-index:1500;min-width:150px;padding:6px;border:1px solid #cfe0d5;border-radius:8px;background:#fff;color:#073d35;box-shadow:0 5px 18px #0002}.appAuthControls button{width:100%;border:0;border-radius:6px;background:transparent;color:inherit;padding:8px 10px;text-align:left;font:inherit;cursor:pointer}.appAuthControls button:hover{background:#edf6f1}@media(max-width:700px){.appAuthControls{font-size:11px}.appAuthControls button{padding:7px 8px}}';
  document.head.appendChild(style);

  const login = (reason = '') => {
    window.__SOLARSHIFT_AUTH_RESOLVE?.(false);
    const target = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const query = new URLSearchParams({ next: target });
    if (reason) query.set('reason', reason);
    window.location.replace(`./login.html?${query.toString()}`);
  };

  (async () => {
    try {
      const client = await import('./project-hub-client.mjs');
      const session = await client.getSession(window.localStorage);
      if (!session?.access_token) return login();
      const identity = await client.getIdentity(session.access_token);
      if (!identity?.id) return login();
      window.__SOLARSHIFT_AUTHORIZED = true;
      window.__SOLARSHIFT_AUTH_RESOLVE?.(true);
      document.documentElement.classList.remove('appAuthPending');
      window.dispatchEvent(new CustomEvent('solarshift:authenticated', { detail: { email: identity.email || '' } }));
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => addAccountControls(identity, client), { once: true });
      else addAccountControls(identity, client);
    } catch {
      window.localStorage.removeItem(sessionKey);
      login('session');
    }
  })();

  function addAccountControls(identity, client) {
    if (document.getElementById('appAuthControls')) return;
    const mount = document.querySelector('.ozenoHeaderNavigation') || document.querySelector('header');
    if (!mount) return;
    if (mount.classList.contains('hubNavigation') && mount.querySelector('.hubAccountMenu')) return;
    const controls = document.createElement('details');
    controls.id = 'appAuthControls';
    controls.className = 'appAuthControls';
    const label = document.createElement('summary');
    label.textContent = identity.user_metadata?.full_name?.trim() || identity.user_metadata?.name?.trim() || identity.email || 'Compte';
    const menu = document.createElement('div');
    menu.className = 'appAuthControlsMenu';
    const logout = document.createElement('button');
    logout.type = 'button';
    logout.textContent = 'Déconnexion';
    logout.addEventListener('click', async () => {
      logout.disabled = true;
      try { await client.signOut(window.localStorage, (await client.getSession(window.localStorage))?.access_token); }
      finally { window.location.replace('./login.html'); }
    });
    menu.appendChild(logout);
    controls.append(label, menu);
    mount.appendChild(controls);
  }
})();
