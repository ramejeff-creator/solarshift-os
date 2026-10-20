(function () {
  'use strict';
  if (!document.querySelector('main.layout .auditJourney') || document.body.classList.contains('ozenoDashboard')) return;
  const $ = (id) => document.getElementById(id);
  const chapters = [
    { key: 'project', label: 'Projet & adresse', root: '#audit-project', sections: [
      ['prestudy-project-identity', 'Fiche projet', '#prestudyProjectIdentityGroup'],
      ['prestudy-project-location', 'Localisation', '#prestudyProjectLocationGroup'],
      ['prestudy-project-provenance', 'Origine des données', '#prestudyProjectProvenanceGroup']] },
    { key: 'surfaces', label: 'Surfaces solaires', root: '#audit-roof', sections: [
      ['prestudy-surfaces-kind', 'Nature du projet', '#prestudySurfaceKindTitle'],
      ['prestudy-surfaces-map', 'Carte et tracé', '#prestudySurfaceMapTitle'],
      ['prestudy-surfaces-areas', 'Zones et surfaces', '#prestudySurfaceAreasTitle'],
      ['prestudy-surfaces-roof', 'Qualification toiture', '#prestudySurfaceQualification'],
      ['prestudy-surfaces-advanced', 'Paramètres avancés', '#prestudySurfaceAdvancedTitle']] },
    { key: 'performance', label: 'Performance solaire', root: '#audit-solar', sections: [
      ['prestudy-performance-production', 'Production PVGIS', '#prestudyPerformanceProductionGroup'],
      ['prestudy-performance-load', 'Consommation et profil', '#prestudyPerformanceLoadGroup'],
      ['prestudy-performance-matching', 'Adéquation énergétique', '#prestudyPerformanceMatchingGroup'],
      ['prestudy-performance-climate', 'Variabilité climatique', '#prestudyPerformanceClimateGroup'],
      ['prestudy-performance-terrain', 'Fiche terrain actuelle', '#prestudyPerformanceTerrainGroup']] },
    { key: 'risks', label: 'Risques & preuves', root: '#audit-risk', sections: [
      ['prestudy-risks-register', 'Registre des sept contrôles', '#prestudyRiskRegister'],
      ['prestudy-risks-documents', 'Documents et preuves', '.riskActions']] },
    { key: 'finance', label: 'Finance & décision', root: '#audit-finance', sections: [
      ['prestudy-finance-model', 'Porteur', '#financeOwnershipChoice'],
      ['prestudy-finance-capex', 'CAPEX', '#prestudyFinanceCapexHeading'],
      ['prestudy-finance-funding', 'Financement', '#prestudyFinanceFundingHeading'],
      ['prestudy-finance-irve', 'IRVE', '#irveInvestmentGroup'],
      ['prestudy-finance-allocation', 'Valorisation énergétique', '#prestudyFinanceValuationHeading'],
      ['prestudy-finance-results', 'Résultats financiers', '#prestudyFinanceResultsHeading'],
      ['prestudy-finance-workspace', 'Accès à l’étude détaillée', '#supabaseConnection']], externalSections: [
      ['prestudy-summary-cashflow', 'Trésorerie'],
      ['prestudy-summary-decision', 'Décision provisoire']] },
    { key: 'efficiency', label: 'Efficacité – CO₂ & CEE', root: '#audit-efficiency', sections: [
      ['prestudy-efficiency-energy', 'Module existant', '#efficiencyImpactForm']] },
    { key: 'summary', label: '6 Synthèse', root: '#ozeno-summary', extra: '.reportEditor', sections: [
      ['prestudy-summary-overview', 'Estimation actuelle', '#ozeno-summary > h2'],
      ['prestudy-summary-energy', 'Indicateurs énergétiques', '#prestudySummaryEnergyHeading'],
      ['prestudy-summary-revenue', 'Économies et recettes · année 1', '#decisionRevenue'],
      ['prestudy-summary-finance', 'Financement et indicateurs', '#decisionFinanceMetrics'],
      ['prestudy-summary-lcoe', 'Prix de revient du kWh', '#prestudySummaryLcoe'],
      ['prestudy-summary-cashflow', 'Trésorerie cumulative', '#decisionCashflowPanel'],
      ['prestudy-summary-decision', 'Qualification et décision', '#decisionStatus'],
      ['prestudy-summary-report', 'Rapport existant', '.reportEditor']] }
  ];
  const aliases = { 'audit-project': 'prestudy-project', 'audit-roof': 'prestudy-surfaces', 'audit-solar': 'prestudy-performance', 'audit-production': 'prestudy-performance-production', 'audit-risk': 'prestudy-risks', 'audit-finance': 'prestudy-finance', 'audit-efficiency': 'prestudy-efficiency', 'ozeno-summary': 'prestudy-summary' };
  const main = document.querySelector('main.layout');
  const header = document.querySelector('body > header');
  let current = null, currentAnchor = null, contextKey = null, project = {};
  let scheduled = 0, navigating = false, quickReturn = null, navigationVersion = 0;
  const mobile = matchMedia('(max-width: 1199px)');
  const savedPositions = new Map();
  document.body.classList.add('prestudyShell');
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = './prestudy-shell.css'; document.head.append(css);
  const bar = document.createElement('section'); bar.id = 'prestudyProjectBar'; bar.className = 'prestudyProjectBar'; bar.setAttribute('aria-label', 'Projet courant');
  bar.innerHTML = '<button type="button" id="prestudyNavToggle" class="prestudyIconButton" aria-label="Ouvrir la navigation" aria-expanded="false" aria-controls="prestudyNavDialog">☰</button><div class="prestudyProjectIdentity"><button type="button" id="prestudyProjectName" aria-label="Identité complète du projet">Projet à nommer</button><div id="prestudyProjectMeta"></div><div id="prestudyProjectAddress"></div></div><span class="prestudyBadge">Pré-étude</span><span id="prestudyProgress" aria-label="Étape affichée parmi les cinq étapes métier"></span><div id="prestudyPrimaryActions"><button type="button" id="prestudyQuickOpen">Récapitulatif rapide</button></div><button type="button" id="prestudyActionsToggle" class="prestudyIconButton" aria-label="Actions du projet" aria-expanded="false" aria-controls="prestudyActions">⋮</button><div id="prestudyActions" hidden><strong>Actions du projet</strong><div id="prestudyMobilePrimary"></div><div id="prestudySecondaryActions"></div><div id="prestudyMobileGlobal"></div></div>';
  header.insertAdjacentElement('afterend', bar);
  const navHost = document.createElement('aside'); navHost.id = 'prestudyNavHost'; navHost.className = 'prestudyNavHost'; main.before(navHost);
  const nav = document.createElement('nav'); nav.id = 'prestudyRail'; nav.setAttribute('aria-label', 'Chapitres et sous-sections de la pré-étude'); navHost.append(nav);
  const drawer = document.createElement('dialog'); drawer.id = 'prestudyNavDialog'; drawer.className = 'prestudyDialog prestudyNavDialog'; drawer.setAttribute('aria-labelledby', 'prestudyNavTitle');
  drawer.innerHTML = '<div class="prestudyDialogHead"><h2 id="prestudyNavTitle">Navigation</h2><button type="button" data-shell-close aria-label="Fermer la navigation">×</button></div><div id="prestudyDrawerNav"></div>';
  const quick = document.createElement('dialog'); quick.id = 'prestudyQuickDialog'; quick.className = 'prestudyDialog prestudyQuickDialog'; quick.setAttribute('aria-labelledby', 'prestudyQuickTitle');
  quick.innerHTML = '<div class="prestudyDialogHead"><h2 id="prestudyQuickTitle">Récapitulatif rapide</h2><button type="button" data-shell-close aria-label="Fermer le récapitulatif">×</button></div><div id="prestudyQuickContent"></div><a href="#prestudy-summary" class="prestudySummaryLink">Ouvrir 6 Synthèse →</a>';
  document.body.append(drawer, quick);
  const title = document.createElement('h1'); title.id = 'prestudyChapterTitle'; title.tabIndex = -1; title.className = 'prestudyChapterTitle'; main.prepend(title);
  const live = document.createElement('p'); live.id = 'prestudyNavigationStatus'; live.className = 'prestudySrOnly'; live.setAttribute('role', 'status'); main.prepend(live);

  function node(tag, text, className) { const n = document.createElement(tag); n.textContent = text; if (className) n.className = className; return n; }
  function projectKey() { const q = new URLSearchParams(location.search); return project.projectId || project.draftId || q.get('projectId') || q.get('draftId') || 'temporary'; }
  function navigationState(extra = {}) { return { ...(history.state || {}), prestudy: { project: projectKey(), chapter: current?.key, anchor: currentAnchor, scroll: scrollY, ...extra } }; }
  function updateDimensions() { const height = header.getBoundingClientRect().height + bar.getBoundingClientRect().height; document.body.style.setProperty('--prestudy-top', `${height}px`); }
  function closeActions(focus = false) { $('prestudyActions').hidden = true; $('prestudyActionsToggle').setAttribute('aria-expanded', 'false'); if (focus) $('prestudyActionsToggle').focus(); }
  function closeDialogs() { if (drawer.open) drawer.close(); if (quick.open) quick.close(); closeActions(); }
  function updateContext(detail = {}) {
    project = { ...project, ...detail };
    const key = projectKey();
    const switched = contextKey && key !== contextKey;
    if (switched) { closeDialogs(); savedPositions.clear(); current = null; currentAnchor = null; history.replaceState({ ...(history.state || {}), prestudy: null }, '', location.pathname + location.search); }
    contextKey = key;
    const name = project.name || $('ozenoProjectName')?.textContent || 'Projet à nommer';
    $('prestudyProjectName').textContent = name; $('prestudyProjectName').setAttribute('aria-label', `Identité complète : ${name}`);
    $('prestudyProjectName').title = name;
    const scope = project.scope === 'cloud' ? 'Cloud' : project.scope === 'local' ? 'Local · ce navigateur' : 'Non enregistré';
    $('prestudyProjectMeta').textContent = [project.status || 'Qualification à confirmer', scope].join(' · ');
    $('prestudyProjectAddress').textContent = project.address && project.address !== name ? project.address : '';
    $('prestudyProjectAddress').title = project.address || '';
    if (switched || current && history.state?.prestudy?.project !== key) navigate('prestudy-project', { replace: true, focus: false });
  }
  function findTarget(id) {
    const normalized = aliases[id] || id;
    for (const chapter of chapters) {
      if (chapter.id === normalized) return { chapter, target: chapter.marker, anchor: chapter.id };
      const section = chapter.sections.find((item) => item.id === normalized);
      if (section) return { chapter, target: section.marker, anchor: section.id };
    }
    const existing = $(id);
    if (existing) { const chapter = chapters.find((item) => item.roots?.some((root) => root.contains(existing))); if (chapter) return { chapter, target: existing, anchor: id }; }
    return null;
  }
  function markActive(anchor) {
    currentAnchor = anchor;
    nav.querySelectorAll('a').forEach((link) => {
      const active = link.hash.slice(1) === anchor;
      link.classList.toggle('isCurrentAnchor', active);
      if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
      link.classList.toggle('isCurrentChapter', link.dataset.chapter === current?.key && link.dataset.chapterLink === 'true');
    });
  }
  function navigate(id, options = {}) {
    const version = ++navigationVersion;
    let entry = findTarget(id);
    if (!entry) { entry = findTarget('prestudy-project'); live.textContent = 'Section indisponible : retour au projet.'; }
    if (!entry) return;
    if (current) savedPositions.set(`${projectKey()}:${current.key}`, scrollY);
    const { chapter, target, anchor } = entry;
    current = chapter; navigating = true;
    chapters.forEach((item) => item.roots.forEach((root) => { root.hidden = item !== chapter; root.inert = item !== chapter; }));
    window.OzenoPrestudyChapters?.reveal(target);
    if (chapter.key === 'summary') window.OzenoPrestudyChapters?.refreshSummaryPresentation?.();
    for (let parent = target.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
    title.textContent = chapter.index < 5 ? `${chapter.index + 1} · ${chapter.label}` : chapter.label;
    const progress = $('prestudyProgress'); progress.textContent = chapter.index < 5 ? `Étape ${chapter.index + 1} / 5` : chapter.key === 'summary' ? 'Restitution' : 'Complément';
    markActive(anchor);
    if (options.history !== false) {
      const url = new URL(location.href); url.hash = anchor;
      const method = options.replace || location.hash === `#${anchor}` ? 'replaceState' : 'pushState';
      history[method](navigationState({ anchor, scroll: 0 }), '', url);
    }
    closeDialogs();
    requestAnimationFrame(() => {
      if (version !== navigationVersion) return;
      if (options.restoreScroll != null) scrollTo({ top: options.restoreScroll, behavior: 'instant' });
      else if (options.chapterPosition && savedPositions.has(`${projectKey()}:${chapter.key}`)) scrollTo({ top: savedPositions.get(`${projectKey()}:${chapter.key}`), behavior: 'instant' });
      else (anchor === chapter.id ? title : target).scrollIntoView({ block: 'start', behavior: 'instant' });
      if (options.focus !== false) {
        const focusTarget = anchor === chapter.id ? title : target;
        if (!focusTarget.matches('a[href],button,input,select,textarea,[tabindex]')) focusTarget.tabIndex = -1;
        focusTarget.focus({ preventScroll: true });
      }
      if (chapter.roots.some((root) => root.contains($('map')))) window.solarMap?.invalidateSize();
      if (options.history !== false) history.replaceState(navigationState(), '', location.href);
      navigating = false;
    });
    return true;
  }
  function markerFor(host, id, label) {
    const marker = document.createElement('span'); marker.id = id; marker.className = 'prestudyAnchor'; marker.tabIndex = -1; marker.setAttribute('role', 'group'); marker.setAttribute('aria-label', label);
    host.before(marker); return marker;
  }
  function mountChapterFooter(chapter) {
    if (chapter.index >= 5) return;
    const footer = document.createElement('nav');
    footer.className = 'prestudyChapterFooter';
    footer.setAttribute('aria-label', `Navigation de l’étape ${chapter.index + 1} sur 5`);

    const previous = document.createElement('button');
    previous.type = 'button';
    previous.className = 'prestudyChapterBack';
    previous.textContent = '← Revenir';
    previous.disabled = chapter.index === 0;
    previous.setAttribute('aria-label', chapter.index === 0 ? 'Revenir : début du parcours' : `Revenir à ${chapters[chapter.index - 1].label}`);
    if (chapter.index > 0) previous.addEventListener('click', () => navigate(chapters[chapter.index - 1].id));

    const nextChapter = chapter.index === 4 ? chapters.find((item) => item.key === 'summary') : chapters[chapter.index + 1];
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'prestudyChapterContinue';
    next.textContent = 'Continuer →';
    next.setAttribute('aria-label', `Continuer vers ${nextChapter.label}`);
    next.addEventListener('click', () => navigate(nextChapter.id));

    footer.append(previous, next);
    chapter.roots.at(-1).append(footer);
  }
  function mountChapters() {
    const intro = document.querySelector('.ozenoWorkspaceIntro'); if (intro) intro.hidden = true;
    document.querySelector('.auditJourney').hidden = true;
    chapters.forEach((chapter, index) => {
      chapter.index = index; chapter.id = `prestudy-${chapter.key}`;
      const root = document.querySelector(chapter.root);
      if (!root) {
        // Le module complémentaire peut ne pas être monté par l’existant : aucun calcul ou formulaire de substitution.
        const unavailable = document.createElement('section'); unavailable.className = 'prestudyUnavailable'; unavailable.id = 'prestudyEfficiencyUnavailable';
        unavailable.append(node('h2', 'Efficacité – CO₂ & CEE'), node('p', 'Ce module n’est pas disponible dans cet écran. Aucun résultat CO₂ ou CEE n’est calculé ici.'));
        main.append(unavailable); chapter.roots = [unavailable];
      } else chapter.roots = [root, ...(chapter.extra ? [...document.querySelectorAll(chapter.extra)] : [])];
      const first = chapter.roots[0]; chapter.marker = markerFor(first, chapter.id, chapter.label); first.prepend(chapter.marker);
      chapter.roots.forEach((r) => r.dataset.prestudyChapter = chapter.key);
      const group = document.createElement('div'); group.className = 'prestudyChapterLinks';
      const link = node('a', index < 5 ? `${index + 1}  ${chapter.label}` : chapter.label, 'prestudyChapterLink'); link.href = `#${chapter.id}`; link.dataset.chapter = chapter.key; link.dataset.chapterLink = 'true'; group.append(link);
      chapter.sections = chapter.sections.flatMap(([id, label, selector]) => {
        const host = document.querySelector(selector);
        if (!host || !chapter.roots.some((r) => r.contains(host))) return [];
        const marker = markerFor(host, id, label); if (chapter.roots.includes(host)) host.prepend(marker);
        const a = node('a', label, 'prestudySectionLink'); a.href = `#${id}`; a.dataset.chapter = chapter.key; group.append(a);
        return [{ id, label, marker, host }];
      });
      (chapter.externalSections || []).forEach(([id, label]) => {
        const link = node('a', label, 'prestudySectionLink'); link.href = `#${id}`; link.dataset.chapter = chapter.key; link.dataset.externalSection = 'true'; group.append(link);
      });
      mountChapterFooter(chapter);
      nav.append(group);
    });
  }
  function mountActions() {
    const oldNav = document.querySelector('.ozenoHeaderNavigation'); if (!oldNav) return;
    oldNav.querySelectorAll(':scope > a[href^="#"], :scope > .ozenoHeaderUnavailable').forEach((n) => n.hidden = true);
    const save = document.querySelector('[data-prestudy-action="save"]');
    const secondary = $('prestudySecondaryActions');
    document.querySelectorAll('[data-prestudy-action="new"], [data-prestudy-action="share"]').forEach((n) => secondary.append(n));
    if (save) { save.id = 'prestudySave'; save.classList.add('prestudySave'); }
    const oldProjects = document.querySelector('[data-prestudy-project-menu]'); if (oldProjects) oldProjects.hidden = true;
    const dashboard = document.querySelector('.hubDashboardLink'); const account = document.querySelector('.hubAccountMenu');
    if (!save || !dashboard || !account) return;
    // Le garde d’authentification peut avoir monté un menu de secours directement dans le header.
    // Le retirer seulement lorsque le vrai menu Compte du hub est disponible.
    $('appAuthControls')?.remove();
    const primary = mobile.matches ? $('prestudyMobilePrimary') : $('prestudyPrimaryActions');
    primary.prepend(save); primary.append($('prestudyQuickOpen'));
    const global = mobile.matches ? $('prestudyMobileGlobal') : oldNav;
    global.append(dashboard, account);
    account.querySelector('summary')?.setAttribute('aria-label', 'Compte utilisateur');
    if (drawer.open && !mobile.matches) drawer.close();
    (mobile.matches ? $('prestudyDrawerNav') : navHost).append(nav);
    updateDimensions();
  }
  function showQuick() {
    quickReturn = document.activeElement;
    closeDialogs(); const content = $('prestudyQuickContent'); content.replaceChildren();
    content.append(node('h3', $('prestudyProjectName').textContent), node('p', $('prestudyProjectMeta').textContent));
    if (project.address && project.address !== $('prestudyProjectName').textContent) content.append(node('p', project.address));
    const dl = document.createElement('dl');
    [['Surface exploitable', 'terrainUsable'], ['Puissance estimée', 'studyCapacity'], ['Production annuelle', 'studyAnnual']].forEach(([label, id]) => { dl.append(node('dt', label), node('dd', $(id)?.textContent || 'Non disponible')); });
    content.append(dl, node('p', 'Indicateurs indicatifs issus des composants existants. Sources et limites dans les chapitres.'));
    quick.showModal();
  }
  function scrollState() {
    scheduled = 0; if (!current || navigating || drawer.open || quick.open) return;
    const limit = parseFloat(getComputedStyle(document.body).getPropertyValue('--prestudy-top')) + 40;
    const active = current.sections.filter((s) => s.marker.getBoundingClientRect().top <= limit).at(-1);
    markActive(active?.id || current.id);
    history.replaceState(navigationState(), '', location.href);
  }
  function boot() {
    window.OzenoPrestudyChapters?.prepare();
    mountChapters(); mountActions(); updateContext(window.SOLARSHIFT_CONFIG?.projectContext || {}); updateDimensions();
    nav.addEventListener('click', (event) => { const link = event.target.closest('a[href^="#"]'); if (!link) return; event.preventDefault(); navigate(link.hash.slice(1), { chapterPosition: link.dataset.chapterLink === 'true' }); });
    $('prestudyProjectName').addEventListener('click', showQuick); $('prestudyQuickOpen').addEventListener('click', showQuick);
    $('prestudyNavToggle').addEventListener('click', () => { closeDialogs(); $('prestudyDrawerNav').append(nav); drawer.showModal(); $('prestudyNavToggle').setAttribute('aria-expanded', 'true'); });
    $('prestudyActionsToggle').addEventListener('click', () => { const open = $('prestudyActions').hidden; closeDialogs(); $('prestudyActions').hidden = !open; $('prestudyActionsToggle').setAttribute('aria-expanded', String(open)); });
    [drawer, quick].forEach((dialog) => {
      dialog.querySelector('[data-shell-close]').addEventListener('click', () => dialog.close());
      dialog.addEventListener('click', (event) => { if (event.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); });
    });
    drawer.addEventListener('close', () => $('prestudyNavToggle').setAttribute('aria-expanded', 'false'));
    quick.addEventListener('close', () => {
      if (navigating) return;
      const trigger = quickReturn?.getClientRects().length ? quickReturn : $('prestudyActionsToggle');
      trigger.focus({ preventScroll: true });
    });
    quick.querySelector('a').addEventListener('click', (event) => { event.preventDefault(); navigate('prestudy-summary'); });
    $('prestudyActions').addEventListener('click', (event) => { if (event.target.closest('button,a')) closeActions(); });
    document.addEventListener('click', (event) => { if (!bar.contains(event.target)) closeActions(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('prestudyActions').hidden) { event.preventDefault(); closeActions(true); } });
    document.addEventListener('click', (event) => { const a = event.target.closest('a[href^="#"]'); if (!a || nav.contains(a) || quick.contains(a) || !findTarget(a.hash.slice(1))) return; event.preventDefault(); navigate(a.hash.slice(1)); });
    document.addEventListener('invalid', (event) => { const chapter = chapters.find((c) => c.roots.some((r) => r.contains(event.target))); if (!chapter || chapter === current) return; navigate(chapter.id, { focus: false }); requestAnimationFrame(() => event.target.focus()); }, true);
    document.addEventListener('click', (event) => { if (event.target.closest('#pickSiteOnMap')) navigate('prestudy-surfaces-map'); }, true);
    window.addEventListener('popstate', (event) => { const state = event.state?.prestudy; navigate(location.hash.slice(1) || 'prestudy-project', { history: false, restoreScroll: state?.project === projectKey() ? state.scroll : undefined }); });
    window.addEventListener('hashchange', () => { if (!navigating) navigate(location.hash.slice(1), { history: false }); });
    window.addEventListener('scroll', () => { if (!scheduled) scheduled = requestAnimationFrame(scrollState); }, { passive: true });
    mobile.addEventListener('change', () => { closeDialogs(); mountActions(); });
    new ResizeObserver(updateDimensions).observe(bar); new ResizeObserver(updateDimensions).observe(header);
    navigate(location.hash.slice(1) || 'prestudy-project', { replace: true, focus: false });
    document.body.dataset.prestudyReady = 'true';
  }
  window.addEventListener('ozeno:project-context-loaded', (event) => updateContext(event.detail || {}));
  window.addEventListener('ozeno:hub-navigation-ready', mountActions);
  window.addEventListener('ozeno:hub-status', (event) => { $('prestudyProjectMeta').textContent = [project.status || 'Qualification à confirmer', project.scope === 'cloud' ? 'Cloud' : project.scope === 'local' ? 'Local · ce navigateur' : 'Non enregistré', event.detail?.dirty ? 'Modifications non enregistrées' : ''].filter(Boolean).join(' · '); });
  // Le hub ouvre ses dialogues sans exposition de fonctions métier globales.
  window.OzenoPrestudyShell = Object.freeze({ navigate, preserveUrl: (params) => {
    const url = new URL(location.href);
    const before = url.searchParams.get('projectId') || url.searchParams.get('draftId');
    const after = params.get('projectId') || params.get('draftId');
    if (before !== after) url.searchParams.delete('scenarioId');
    url.searchParams.delete('projectId'); url.searchParams.delete('draftId');
    params.forEach((value, key) => url.searchParams.set(key, value));
    history.replaceState(history.state, '', url);
  } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
}());
