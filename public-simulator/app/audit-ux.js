(function () {
  'use strict';

  const stages = [
    ['project', '1', 'Projet & adresse', /Projets|Carte et mesure de toiture/i],
    ['roof', '2', 'Surfaces solaires', /Carte et mesure de toiture/i],
    ['solar', '3', 'Performance solaire', /Fiche terrain et performance/i],
    ['risk', '4', 'Risques & preuves', /Registre de risque/i],
    ['finance', '5', 'Finance & décision', /Simulation économique SPV|Votre estimation solaire/i]
  ];

  function sectionFor(pattern) {
    return [...document.querySelectorAll('section.card')].find((node) => pattern.test(node.textContent || ''));
  }

  function installJourneyNavigation() {
    const nav = document.querySelector('.auditJourney');
    if (!nav || nav.dataset.navigationReady === 'true') return;
    const entries = [...nav.querySelectorAll('a[href^="#"], button[data-stage-target]')].map((element) => ({ element }));
    if (!entries.length) return;

    const sectionForEntry = ({ element }) => {
      const target = element.tagName === 'A' ? element.getAttribute('href')?.slice(1) : element.dataset.stageTarget;
      return target ? document.getElementById(target) : null;
    };

    nav.dataset.navigationReady = 'true';
    let frame = 0;
    const update = () => {
      frame = 0;
      if (document.body.classList.contains('prestudyShell')) return;
      const navBottom = Math.max(0, nav.getBoundingClientRect().bottom);
      const threshold = Math.max(navBottom + 24, Math.min(window.innerHeight * 0.32, navBottom + 120));
      let active = 0;
      entries.forEach((entry, index) => {
        if (sectionForEntry(entry)?.getBoundingClientRect().top <= threshold) active = index;
      });
      entries.forEach(({ element }, index) => {
        const current = index === active;
        element.classList.toggle('current', current);
        element.classList.toggle('active', current);
        if (current) element.setAttribute('aria-current', 'step');
        else element.removeAttribute('aria-current');
      });
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    entries.forEach(({ element }) => {
      element.addEventListener('click', (event) => {
        if (element.tagName === 'A') event.preventDefault();
        const section = sectionForEntry({ element });
        if (!section) return;
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        schedule();
      });
    });
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);

    // The page also has a legacy IntersectionObserver; recalculate if it changes a link class.
    new MutationObserver(schedule).observe(nav, { attributes: true, attributeFilter: ['class', 'href', 'data-stage-target'], subtree: true });
    schedule();
  }

  function installRoofMode() {
    const roof = document.getElementById('audit-roof');
    const tilt = document.getElementById('tilt');
    const total = document.getElementById('roofTotal');
    if (!roof || !tilt || !total) return;
    const heading = roof.querySelector('h2');
    if (heading) heading.textContent = 'Carte et surfaces solaires';
    const roofStage = document.querySelector('.auditJourney a[href="#audit-roof"]');
    const roofStageSpans = Array.from(roofStage?.children || []).filter((node) => node.tagName === 'SPAN');
    // The theme may already have prepended the step badge. Repair its value and class,
    // then always target the final span for the label (independent of script load order).
    if (roofStageSpans.length > 1) {
      roofStageSpans[0].classList.add('ozenoStepNumber');
      roofStageSpans[0].setAttribute('aria-hidden', 'true');
      roofStageSpans[0].textContent = '02';
    }
    const stageLabel = roofStageSpans[roofStageSpans.length - 1];
    if (stageLabel && !stageLabel.classList.contains('ozenoStepNumber')) stageLabel.textContent = 'Surfaces solaires';
    const surfaceLabel = total.closest('label');
    total.removeAttribute('placeholder');
    total.placeholder = '';
    let note = roof.querySelector('.roofModeNote');
    if (!note) {
      note = document.createElement('p');
      note.className = 'hint roofModeNote';
      roof.querySelector('.form')?.insertAdjacentElement('beforebegin', note);
    }
    const refresh = () => {
      const flat = tilt.value === 'Toit plat';
      if (surfaceLabel?.firstChild) {
        surfaceLabel.firstChild.nodeValue = 'Surface totale de la zone (m²) ';
      }
      note.textContent = flat
        ? 'Saisissez une surface connue ou mesurez-la sur la carte. Pour un toit plat tracé, précisez l’orientation et l’inclinaison des supports envisagés.'
        : 'Saisissez une surface connue ou mesurez-la sur la carte. Pour une toiture inclinée tracée, dessinez chaque pan séparément si leurs orientations diffèrent.';
      note.dataset.mode = flat ? 'flat' : 'pitched';
    };
    tilt.addEventListener('change', refresh);
    refresh();
  }

  function installRiskDraft() {
    const source = document.getElementById('riskSource');
    const factor = document.getElementById('riskFactor');
    if (!source || !factor) return;
    const label = source.closest('label');
    const marker = label?.querySelector('b');
    if (marker) marker.remove();
    if (label?.firstChild) label.firstChild.nodeValue = 'Observation ou référence ';
    source.placeholder = 'Observation facultative : ajoutez une précision ou une référence si disponible';
  }

  function installRoofAdvancedFields() {
    const roof = document.getElementById('audit-roof');
    const area = document.getElementById('panelArea');
    const power = document.getElementById('panelWp');
    const existingLoss = document.getElementById('pvgisSystemLoss');
    const form = roof?.querySelector('.form');
    if (!roof || !area || !power || !form || roof.querySelector('.roofExpertSettings')) return;
    const details = document.createElement('details');
    details.className = 'roofExpertSettings';
    details.innerHTML = '<summary>Hypothèses de panneaux et PVGIS (paramètres avancés)</summary><p class="fine">Les paramètres de panneaux estiment la puissance. Les pertes système PVGIS sont une hypothèse distincte ; l’ombrage local sélectionné est appliqué séparément. Rien de cela ne constitue une configuration technique validée.</p><div class="form"></div>';
    form.insertAdjacentElement('afterend', details);
    [area, power].forEach((input) => { const label = input.closest('label'); if (label) details.querySelector('.form').appendChild(label); });
    let loss = existingLoss;
    const previousLossDetails = loss?.closest('details');
    if (!loss) {
      loss = document.createElement('input');
      loss.id = 'pvgisSystemLoss';
      loss.type = 'number';
      loss.min = '0';
      loss.max = '50';
      loss.step = '0.1';
      loss.value = '14';
      loss.title = 'Pertes électriques globales estimées, distinctes des ombres locales.';
    }
    let lossLabel = loss.closest('label');
    if (!lossLabel) {
      lossLabel = document.createElement('label');
      lossLabel.append('Pertes système PVGIS (%)');
      lossLabel.append(loss);
    }
    details.querySelector('.form').appendChild(lossLabel);
    if (previousLossDetails && previousLossDetails !== details) previousLossDetails.remove();
    loss.addEventListener('change', () => document.getElementById('orientation')?.dispatchEvent(new Event('change', { bubbles: true })));
    const annual = document.getElementById('roofAnnual');
    if (annual?.previousElementSibling) annual.previousElementSibling.textContent = 'Production annuelle estimée';
    if (annual?.nextElementSibling) annual.nextElementSibling.textContent = 'Aperçu non canonique · dépend de la configuration provisoire';
  }

  function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .auditJourney{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px;overflow:auto;margin:0 0 20px;padding:4px 0 9px;scrollbar-width:thin}
      .auditJourney button{min-width:145px;border:1px solid #cfe0d5;background:#fff;color:#315c4b;border-radius:9px;padding:10px 12px;text-align:left;cursor:pointer;font:inherit}
      .auditJourney button:hover,.auditJourney button:focus-visible{border-color:#1c875b;outline:3px solid #1c875b33}
      .auditJourney button.current{background:#0a3f2d;color:#fff;border-color:#0a3f2d}
      .auditProgress{flex:0 0 100%;font-size:13px;color:#587469;margin:0 0 4px}.auditJourney strong{display:block;font-size:12px;opacity:.8}.auditJourney span{font-weight:700;font-size:14px}
      .stageAnchor{scroll-margin-top:150px}.auditProgress{font-size:13px;color:#587469;margin:0 0 14px}
      .auditJourney a.active:not(.current){background:#fff!important;color:#315c4b!important;border-color:#cfe0d5!important;box-shadow:none!important}
      .auditJourney a.current,.auditJourney button.current{background:#0a3f2d!important;color:#fff!important;border-color:#0a3f2d!important;box-shadow:0 3px 10px #08734c33}
      header{z-index:1200}.auditJourney{z-index:1100}.map{position:relative;z-index:0}.map .leaflet-top,.map .leaflet-bottom,.map .leaflet-control{z-index:400!important}
      .roofExpertSettings{margin:12px 0;padding:12px 14px;border:1px solid #cfe0d5;border-radius:9px;background:#f8fbf9}.roofExpertSettings summary{font-weight:700;color:#0a3f2d;cursor:pointer}.roofExpertSettings[open] summary{margin-bottom:8px}.roofExpertSettings .fine{margin:0 0 10px}
      .projects>button[data-p]{display:none!important}.projectPicker{display:block;margin:12px 0 10px;color:#0a3f2d}.projectPicker select{background:#fff;cursor:pointer;font-weight:650}.projectPicker select:focus-visible{outline:3px solid #1c875b55;outline-offset:2px}.addressRecognition{margin:7px 0;color:#587469;font-size:13px}.addressRecognition[data-state="ready"]{color:#08734c}.addressSuggestions{display:grid;gap:6px;margin:6px 0 8px}.addressSuggestions button{width:100%;margin:0!important;text-align:left!important;background:#fff!important;border:1px solid #cfe0d5!important;border-left:4px solid #54a378!important;border-radius:7px!important;padding:9px 11px!important;color:#173b2e!important;font:inherit!important;cursor:pointer}.addressSuggestions button:hover,.addressSuggestions button:focus-visible{background:#eff7f1!important;outline:2px solid #08734c55}.temporaryStudyNote{display:none;padding:9px 11px;margin:7px 0;border-radius:7px;background:#edf7f0;color:#08734c;font-size:13px}.temporaryStudyNote[data-visible="true"]{display:block}.manualSiteLocationButton{display:block;margin:8px 0;padding:8px 10px;border:1px solid #72a58b;border-radius:7px;background:#fff;color:#08734c;font:600 13px system-ui;cursor:pointer}.manualSiteLocationButton:hover,.manualSiteLocationButton:focus-visible{background:#eff7f1;outline:2px solid #08734c55}.manualSiteLocationButton[aria-pressed="true"]{background:#08734c;color:#fff}.siteLocationPicking{cursor:crosshair!important}
      @media(max-width:700px){
        header{position:static!important}
        .stageAnchor{scroll-margin-top:88px}
        .auditJourney{position:sticky!important;top:0!important;z-index:1100!important;display:flex!important;flex-wrap:nowrap!important;gap:6px!important;margin-bottom:12px!important;padding:7px 0 8px!important;overflow-x:auto!important;overscroll-behavior-x:contain;scroll-snap-type:x proximity;background:#edf3ef;box-shadow:0 5px 10px #062f3c12}
        .auditProgress{display:none!important}
        .auditJourney a,.auditJourney button{min-width:116px!important;padding:8px 9px!important;scroll-snap-align:start}
        .auditJourney strong{font-size:10px!important}.auditJourney span{font-size:12px!important;line-height:1.2}
        .projects>.hint,.projects>.fine{display:none}
        .newProject{display:block}
      }
    `;
    document.head.appendChild(style);
  }

  function installProjectPicker() {
    const projects = document.querySelector('.projects');
    if (!projects || projects.querySelector('.projectPicker')) return;
    const picker = document.createElement('label');
    picker.className = 'projectPicker';
    picker.textContent = 'Projet à qualifier';
    const select = document.createElement('select');
    select.id = 'commercialProjectPicker';
    picker.appendChild(select);
    projects.querySelector('button[data-p]')?.insertAdjacentElement('beforebegin', picker);
    let knownKeys = '', currentSavedProject = null;
    const synchronize = () => {
      const buttons = [...projects.querySelectorAll(':scope > button[data-p]')];
      const savedValue = currentSavedProject?.value || '';
      const keys = [savedValue, ...buttons.map((button) => button.dataset.p)].join('\u0000');
      if (keys !== knownKeys) {
        const options = [];
        if (currentSavedProject) {
          const option = document.createElement('option');
          option.value = currentSavedProject.value;
          option.textContent = [currentSavedProject.name, currentSavedProject.address].filter(Boolean).join(' · ');
          options.push(option);
        }
        options.push(...buttons.map((button) => {
          const option = document.createElement('option');
          option.value = button.dataset.p;
          option.textContent = [button.querySelector('b')?.textContent, button.querySelector('small')?.textContent].filter(Boolean).join(' · ');
          return option;
        }));
        select.replaceChildren(...options);
        knownKeys = keys;
      }
      const active = buttons.find((button) => button.classList.contains('active'));
      if (active && select.value !== active.dataset.p) select.value = active.dataset.p;
      else if (!active && currentSavedProject && select.value !== currentSavedProject.value) select.value = currentSavedProject.value;
    };
    select.addEventListener('change', () => {
      if (currentSavedProject?.value === select.value) {
        window.dispatchEvent(new CustomEvent('ozeno:saved-project-selected', { detail: currentSavedProject }));
        return;
      }
      [...projects.querySelectorAll(':scope > button[data-p]')].find((button) => button.dataset.p === select.value)?.click();
    });
    window.addEventListener('ozeno:project-context-loaded', (event) => {
      const detail = event.detail || {};
      const id = detail.draftId || detail.projectId;
      currentSavedProject = id && detail.name ? {
        id, scope: detail.scope || (detail.projectId ? 'cloud' : 'local'), name: detail.name,
        address: detail.address || '', value: `saved:${detail.scope || (detail.projectId ? 'cloud' : 'local')}:${id}`
      } : null;
      knownKeys = '';
      synchronize();
    });
    window.addEventListener('ozeno:project-picker-refresh', synchronize);
    new MutationObserver((changes) => {
      if (changes.some((change) => change.target === projects || change.target.matches?.('button[data-p]'))) synchronize();
    }).observe(projects, { childList: true, attributes: true, attributeFilter: ['class'], subtree: true });
    synchronize();
  }

  function parseCoordinateText(value) {
    const text = String(value || '').trim();
    const patterns = [
      /!3d(-?(?:\d+(?:\.\d+)?|\.\d+))!4d(-?(?:\d+(?:\.\d+)?|\.\d+))/i,
      /@(-?(?:\d+(?:\.\d+)?|\.\d+)),\s*(-?(?:\d+(?:\.\d+)?|\.\d+))/,
      /^\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*[,;]\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\s*$/
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (!match) continue;
      const latitude = Number(match[1]);
      const longitude = Number(match[2]);
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
      return {
        latitude,
        longitude,
        label: `Position GPS manuelle · ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
        coordinateSource: 'USER_COORDINATES',
        precision: 'USER_PROVIDED'
      };
    }
    return null;
  }

  window.SolarShiftSiteLocation = window.SolarShiftSiteLocation || {};
  window.SolarShiftSiteLocation.parseCoordinates = parseCoordinateText;

  function installAddressRecognition() {
    const input = document.getElementById('newProjectAddress');
    if (!input || input.dataset.addressRecognition === 'ready') return;
    input.dataset.addressRecognition = 'ready';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('aria-label', 'Adresse, lieu-dit ou coordonnées GPS du site');
    input.placeholder = 'Adresse, lieu-dit ou 49.2074, -0.3092';
    const newProjectBox = input.closest('.newProject');
    const projectTitle = newProjectBox?.querySelector('b');
    if (projectTitle) projectTitle.textContent = 'Adresse / nouveau projet (facultatif)';
    const suggestions = document.createElement('div');
    suggestions.id = 'addressSuggestions';
    suggestions.className = 'addressSuggestions';
    suggestions.setAttribute('role', 'listbox');
    const hint = document.createElement('p');
    hint.className = 'addressRecognition';
    hint.setAttribute('role', 'status');
    hint.textContent = 'Adresse, lieu-dit ou coordonnées GPS · Géoplateforme (IGN / Base Adresse Nationale).';
    input.insertAdjacentElement('afterend', suggestions);
    suggestions.insertAdjacentElement('afterend', hint);
    const temporaryNote = document.createElement('p');
    temporaryNote.className = 'temporaryStudyNote';
    temporaryNote.dataset.visible = 'false';
    temporaryNote.setAttribute('role', 'status');
    temporaryNote.textContent = 'Localisation utilisée pour cette simulation uniquement · aucun projet n’a été créé.';
    hint.insertAdjacentElement('afterend', temporaryNote);
    const manualLocationButton = document.createElement('button');
    manualLocationButton.id = 'manualSiteLocationButton';
    manualLocationButton.type = 'button';
    manualLocationButton.className = 'manualSiteLocationButton';
    manualLocationButton.textContent = 'Adresse imprécise ? Placer le site sur la carte';
    manualLocationButton.setAttribute('aria-pressed', 'false');
    temporaryNote.insertAdjacentElement('afterend', manualLocationButton);
    manualLocationButton.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('ozeno:manual-location-request', { detail: { inputId: input.id } }));
    });
    let timer = 0, controller = null, lastRequest = 0;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      controller?.abort();
      const config = window.SOLARSHIFT_CONFIG = window.SOLARSHIFT_CONFIG || {};
      if (config.commercialDraftId) {
        temporaryNote.textContent = 'Choisissez une suggestion officielle pour centrer la carte sur le site du dossier.';
      } else {
        temporaryNote.textContent = 'Localisation utilisée pour cette simulation uniquement · aucun projet n’a été créé.';
      }
      config.selectedAddressCoordinates = null;
      config.commercialAddressForLookup = null;
      config.addressLookupNeedsSelection = true;
      suggestions.replaceChildren();
      temporaryNote.dataset.visible = 'false';
      const query = input.value.trim();
      if (query.length < 4) { hint.textContent = 'Saisissez une adresse pour afficher des suggestions officielles.'; hint.dataset.state = ''; return; }
      const coordinates = parseCoordinateText(query);
      if (coordinates) {
        const option = document.createElement('button');
        option.type = 'button';
        option.role = 'option';
        option.textContent = `Utiliser cette position GPS · ${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`;
        option.addEventListener('click', () => {
          input.value = coordinates.label;
          config.selectedAddressCoordinates = coordinates;
          config.addressLookupNeedsSelection = false;
          hint.textContent = 'Coordonnées saisies manuellement · vérifiez le repère sur la carte.';
          hint.dataset.state = 'ready';
          temporaryNote.dataset.visible = 'true';
          suggestions.replaceChildren();
          input.dispatchEvent(new CustomEvent('ozeno:address-selected', { bubbles: true, detail: coordinates }));
        });
        suggestions.replaceChildren(option);
        hint.textContent = 'Coordonnées reconnues · confirmez leur utilisation :';
        hint.dataset.state = 'ready';
        return;
      }
      hint.textContent = 'Recherche d’adresses…';
      timer = window.setTimeout(async () => {
        const wait = Math.max(0, 1000 - (Date.now() - lastRequest));
        if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait));
        if (input.value.trim() !== query) return;
        lastRequest = Date.now();
        controller = new AbortController();
        try {
          const params = new URLSearchParams({ text: query, type: 'StreetAddress,PositionOfInterest', terr: 'METROPOLE', maximumResponses: '8' });
          const response = await fetch(`https://data.geopf.fr/geocodage/completion/?${params}`, { signal: controller.signal, headers: { 'Accept-Language': 'fr' } });
          if (!response.ok) throw new Error('recherche indisponible');
          const payload = await response.json();
          const results = Array.isArray(payload.results) ? payload.results : [];
          const usableResults = results.filter((result) => result.fulltext && Number.isFinite(Number(result.x)) && Number.isFinite(Number(result.y)));
          suggestions.replaceChildren(...usableResults.map((result, index) => {
            const option = document.createElement('button');
            option.type = 'button';
            option.role = 'option';
            option.textContent = result.fulltext;
            option.addEventListener('click', () => {
              input.value = result.fulltext;
              config.selectedAddressCoordinates = {
                latitude: Number(result.y), longitude: Number(result.x), label: result.fulltext,
                city: result.city || result.cityName || result.commune || '',
                postalCode: result.postcode || result.postalCode || '',
                cityCode: result.citycode || result.cityCode || result.codeCommune || '',
                coordinateSource: 'GEOPLATEFORME', precision: result.type === 'PositionOfInterest' ? 'POINT_OF_INTEREST' : 'ADDRESS'
              };
          config.addressLookupNeedsSelection = false;
          hint.textContent = config.commercialDraftId
            ? 'Adresse officielle sélectionnée. La carte est localisée ; enregistrez le dossier pour conserver les coordonnées.'
            : 'Adresse sélectionnée ci-dessus. Elle sert à simuler sans créer de projet.';
          hint.dataset.state = 'ready';
          temporaryNote.dataset.visible = 'true';
          if (config.commercialDraftId) temporaryNote.textContent = 'Carte centrée sur l’adresse officielle choisie. Vérifiez le repère et les contours du dossier.';
          suggestions.replaceChildren();
          input.dispatchEvent(new CustomEvent('ozeno:address-selected', { bubbles: true, detail: config.selectedAddressCoordinates }));
            });
            return option;
          }));
          hint.textContent = usableResults.length
            ? config.commercialDraftId ? 'Adresse du dossier non géolocalisée : choisissez le résultat officiel correspondant pour centrer la carte.' : 'Choisissez l’adresse ou le lieu le plus précis :'
            : 'Aucun résultat assez précis. Vous pouvez saisir une commune, des coordonnées GPS ou placer le site sur la carte.';
          hint.dataset.state = usableResults.length ? 'ready' : 'empty';
        } catch (error) {
          if (error.name !== 'AbortError') { hint.textContent = 'Reconnaissance indisponible pour le moment ; l’adresse sera vérifiée à la création.'; hint.dataset.state = 'error'; }
        }
      }, 500);
    });
  }

  function simplifyTerrainSection() {
    const section = document.getElementById('audit-solar');
    const hint = section?.querySelector('.hint');
    if (hint && /Renseignez uniquement ce qui est observé/i.test(hint.textContent || '')) hint.remove();
    const projects = document.querySelector('.projects');
    const projectHint = projects?.querySelector('.hint');
    projectHint?.remove();
    projects?.querySelector(':scope > .fine')?.remove();
  }

  function ensureRoofStateStartsUnknown() {
    const select = document.getElementById('roof');
    if (!select || select.value === '') return;
    const unknown = [...select.options].find((option) => option.value === '');
    if (!unknown) return;
    select.value = '';
    unknown.selected = true;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function removeLegacyQualificationProgress() {
    const button = document.getElementById('prepare');
    const summary = document.getElementById('qual');
    button?.remove();
    summary?.remove();
  }

  function boot() {
    ensureRoofStateStartsUnknown();
    if (document.querySelector('.auditJourney')) {
      addStyles();
      installJourneyNavigation();
      installRoofMode();
      installRoofAdvancedFields();
      removeLegacyQualificationProgress();
      installRiskDraft();
      installProjectPicker();
      installAddressRecognition();
      simplifyTerrainSection();
      return;
    }
    const main = document.querySelector('main') || document.querySelector('.layout');
    if (!main) return;
    addStyles();
    installRoofMode();
    installRoofAdvancedFields();
    removeLegacyQualificationProgress();
    installRiskDraft();
    installProjectPicker();
    installAddressRecognition();
    simplifyTerrainSection();
    const nav = document.createElement('nav');
    nav.className = 'auditJourney';
    nav.setAttribute('aria-label', 'Parcours de qualification');
    const progress = document.createElement('p');
    progress.className = 'auditProgress';
    progress.textContent = 'Parcours commercial · complétez les étapes dans l’ordre conseillé, puis validez la décision.';
    nav.appendChild(progress);
    stages.forEach(([id, number, label, pattern]) => {
      const section = sectionFor(pattern);
      if (!section) return;
      section.id = `audit-${id}`;
      section.classList.add('stageAnchor');
      const button = document.createElement('button');
      button.type = 'button';
      button.innerHTML = `<strong>Étape ${number}</strong><span>${label}</span>`;
      button.dataset.stageTarget = section.id;
      nav.appendChild(button);
    });
    main.insertBefore(nav, main.firstChild);
    installJourneyNavigation();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());
