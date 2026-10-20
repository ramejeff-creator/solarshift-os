(function () {
  'use strict';

  // Presentation only: existing inputs, project context and calculation events remain authoritative.
  function boot() {
    if (document.body.classList.contains('ozenoWorkspace')) return;
    document.body.classList.add('ozenoWorkspace');
    document.title = 'OZENO · Espace commercial';
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = './ozeno-theme.css';
    stylesheet.addEventListener('load', () => window.solarMap?.invalidateSize());
    document.head.appendChild(stylesheet);

    const header = document.querySelector('body > header');
    const subtitle = header?.querySelector('.brandSub');
    if (subtitle) subtitle.textContent = 'Plateforme de transition énergétique';
    if (header) {
      const navigation = document.createElement('nav');
      navigation.className = 'ozenoHeaderNavigation';
      navigation.setAttribute('aria-label', 'Modules de l’espace commercial');
      navigation.innerHTML = '<a href="#audit-roof" class="ozenoHeaderCurrent">Étude solaire</a><span class="ozenoHeaderUnavailable" aria-disabled="true" title="Module en préparation">Efficacité · CO₂ & CEE</span><a href="#ozeno-summary">Synthèse</a>';
      header.appendChild(navigation);
    }

    const layout = document.querySelector('main.layout');
    const journey = layout?.querySelector('.auditJourney');
    const decision = document.querySelector('.decision');
    if (decision) decision.id = 'ozeno-summary';
    if (layout && journey) {
      const intro = document.createElement('section');
      intro.className = 'ozenoWorkspaceIntro';
      intro.setAttribute('aria-labelledby', 'ozenoWorkspaceTitle');
      intro.innerHTML = '<div><p class="ozenoEyebrow">ESPACE COMMERCIAL / ÉTUDE DE SITE</p><h1 id="ozenoWorkspaceTitle">Qualification de projet</h1><p>Repérez les surfaces, estimez le potentiel et préparez la décision.</p></div><div class="ozenoSiteContext"><span>Site à l’étude</span><strong id="ozenoSiteStatus">Pré-étude non enregistrée</strong><small>Estimation indicative · à confirmer</small></div>';
      journey.insertAdjacentElement('beforebegin', intro);
      const updateProjectContext = (event) => {
        const detail = event?.detail || {};
        const projectHeading = document.getElementById('ozenoProjectName');
        const projectAddress = document.getElementById('ozenoProjectAddress');
        if (detail.name && projectHeading) projectHeading.textContent = detail.name;
        if (detail.address !== undefined && projectAddress) projectAddress.textContent = detail.address || 'Adresse à préciser';
        if (detail.status) intro.querySelector('#ozenoSiteStatus').textContent = detail.status;
      };
      window.addEventListener('ozeno:project-context-loaded', updateProjectContext);

      journey.querySelectorAll('a, button[data-stage-target]').forEach((entry, index) => {
        const number = document.createElement('span');
        number.className = 'ozenoStepNumber';
        number.setAttribute('aria-hidden', 'true');
        number.textContent = String(index + 1).padStart(2, '0');
        entry.prepend(number);
      });
      // Keep the selected step visible in the horizontally scrolling mobile journey.
      let lastCurrent = null;
      const revealCurrentStep = () => {
        if (document.body.classList.contains('prestudyShell')) return;
        const current = journey.querySelector('[aria-current="step"]');
        if (!current || current === lastCurrent) return;
        lastCurrent = current;
        if (journey.scrollWidth > journey.clientWidth) {
          journey.scrollLeft = Math.max(0, current.offsetLeft - (journey.clientWidth - current.offsetWidth) / 2);
        }
      };
      new MutationObserver(revealCurrentStep).observe(journey, { attributes: true, subtree: true, attributeFilter: ['aria-current'] });
      window.addEventListener('resize', () => { lastCurrent = null; revealCurrentStep(); });
      revealCurrentStep();
    }

    const projectsTitle = document.querySelector('.projects > h1');
    if (projectsTitle) {
      const heading = document.getElementById('ozenoProjectName') || document.createElement('h2');
      heading.id = 'ozenoProjectName';
      heading.textContent = window.SOLARSHIFT_CONFIG?.projectContext?.name || 'Projet à nommer';
      const titleRow = document.createElement('div');
      titleRow.className = 'ozenoProjectTitleRow';
      const projectStatus = document.createElement('span');
      projectStatus.className = 'ozenoEnvironment ozenoProjectStatus';
      projectStatus.textContent = 'Pré-étude';
      titleRow.append(heading, projectStatus);
      projectsTitle.replaceWith(titleRow);
      const projectAddress = document.createElement('small');
      projectAddress.id = 'ozenoProjectAddress';
      projectAddress.className = 'ozenoProjectAddress';
      const address = document.getElementById('dashAddress');
      projectAddress.textContent = address?.textContent.trim() || 'Adresse à préciser';
      titleRow.insertAdjacentElement('afterend', projectAddress);
      const identity = document.createElement('details');
      identity.id = 'ozenoProjectIdentity';
      identity.className = 'ozenoProjectIdentity';
      identity.innerHTML = '<summary>Fiche signalétique</summary><dl></dl>';
      const identityFields = [
        ['clientName', 'Client'], ['contactName', 'Contact'], ['phone', 'Téléphone'],
        ['installerName', 'Partenaire installateur'], ['installationDate', 'Date prévisionnelle'], ['activityLabel', 'Activité(s) du site']
      ];
      const identityList = identity.querySelector('dl');
      identityFields.forEach(([key, label]) => {
        const row = document.createElement('div');
        row.className = 'ozenoProjectIdentityRow';
        const term = document.createElement('dt'); term.textContent = label;
        const value = document.createElement('dd'); value.dataset.identityField = key; value.textContent = 'À renseigner';
        row.append(term, value); identityList.appendChild(row);
      });
      projectAddress.insertAdjacentElement('afterend', identity);
      const updateIdentity = (detail = {}) => {
        identityFields.forEach(([key]) => {
          const value = identity.querySelector(`[data-identity-field="${key}"]`);
          const raw = detail[key];
          value.textContent = key === 'installationDate' && raw
            ? new Date(`${raw}T12:00:00`).toLocaleDateString('fr-FR')
            : String(raw || '').trim() || 'À renseigner';
        });
      };
      updateIdentity(window.SOLARSHIFT_CONFIG?.projectIdentity || window.SOLARSHIFT_CONFIG?.projectContext || {});
      window.addEventListener('ozeno:project-context-loaded', (event) => updateIdentity(event?.detail || {}));
      if (address) new MutationObserver(() => {
        projectAddress.textContent = address.textContent.trim() || 'Adresse à préciser';
      }).observe(address, { childList: true, characterData: true, subtree: true });
    }
    const mapHint = document.querySelector('#audit-roof > .hint');
    if (mapHint) mapHint.textContent = 'Localisez le projet par son adresse, ses coordonnées GPS ou un clic sur la carte. Cliquez une fois sur chaque toiture à ajouter pour proposer son contour. Pour le corriger, cliquez une seconde fois dessus. Chaque zone peut ensuite être qualifiée séparément.';
    const summaryProfile = document.querySelector('.decisionProductionProfile');
    if (summaryProfile) {
      const months = document.createElement('div');
      months.className = 'ozenoSummaryMonths';
      months.setAttribute('aria-hidden', 'true');
      ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'].forEach((month) => {
        const label = document.createElement('span');
        label.textContent = month;
        months.appendChild(label);
      });
      summaryProfile.querySelector('.bars')?.insertAdjacentElement('afterend', months);
    }
    const chart = document.getElementById('productionSvg');
    chart?.setAttribute('aria-label', 'Production mensuelle estimée PVGIS, en kWh. Survolez une barre ou utilisez la touche Tab pour lire sa valeur.');

    let frame = 0;
    const refreshModule = () => {
      frame = 0;
      if (document.body.classList.contains('prestudyShell')) return;
      const threshold = (journey?.getBoundingClientRect().bottom || 150) + 40;
      const efficiency = document.getElementById('audit-efficiency');
      const active = decision && decision.getBoundingClientRect().top <= threshold
        ? '#ozeno-summary'
        : efficiency && efficiency.getBoundingClientRect().top <= threshold ? '#audit-efficiency' : '#audit-roof';
      header?.querySelectorAll('.ozenoHeaderNavigation a').forEach((link) => {
        const current = link.getAttribute('href') === active;
        link.classList.toggle('ozenoHeaderCurrent', current);
        if (current) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(refreshModule); };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    schedule();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());
