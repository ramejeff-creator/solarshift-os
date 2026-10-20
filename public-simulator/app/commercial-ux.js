(function () {
  'use strict';

  const config = window.SOLARSHIFT_CONFIG = window.SOLARSHIFT_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  function distanceMeters(a, b) {
    const radians = Math.PI / 180;
    const dLat = (b.latitude - a.latitude) * radians;
    const dLon = (b.longitude - a.longitude) * radians;
    const lat1 = a.latitude * radians, lat2 = b.latitude * radians;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function currentMapSite() {
    const coordinates = config.localProjectCoordinates || config.projectCoordinates;
    if (Number.isFinite(Number(coordinates?.latitude)) && Number.isFinite(Number(coordinates?.longitude))) {
      return { latitude: Number(coordinates.latitude), longitude: Number(coordinates.longitude) };
    }
    const center = window.roofGroup?.getBounds?.().getCenter?.();
    return center && Number.isFinite(center.lat) && Number.isFinite(center.lng)
      ? { latitude: center.lat, longitude: center.lng }
      : null;
  }

  function setMapLocation(latitude, longitude, label, { temporary = true, coordinateSource = 'GEOPLATEFORME', precision = 'ADDRESS', preserveContours = false, centerMap = true } = {}) {
    if (!window.solarMap || !window.L) return;
    const point = [latitude, longitude];
    if (temporary) {
      if (typeof marks !== 'undefined') Object.values(marks).forEach((marker) => window.solarMap.removeLayer(marker));
      window.OzenoProjectMarker?.remove();
    }
    config.temporaryMapMarker?.remove?.();
    const popup = document.createElement('span');
    popup.textContent = label;
    config.temporaryMapMarker = L.circleMarker(point, {
      radius: 8, color: '#fff', weight: 3, fillColor: '#0878c9', fillOpacity: .95
    }).addTo(window.solarMap).bindPopup(popup);
    if (centerMap) window.solarMap.setView(point, 19);
    if (temporary) {
      config.localProjectCoordinates = { latitude, longitude, coordinateSource, precision };
      config.temporaryStudyLabel = config.commercialDraftId ? null : label;
      if (preserveContours) window.dispatchEvent(new CustomEvent('ozeno:site-location-updated'));
      else {
        window.roofGroup?.clearLayers();
        window.dispatchEvent(new CustomEvent('ozeno:roof-surfaces'));
        window.dispatchEvent(new CustomEvent('ozeno:project-context-loaded'));
      }
      const dash = $('dashAddress');
      if (dash) dash.textContent = config.commercialDraftId ? label : `${label} · simulation temporaire`;
    }
  }

  function installAddressSimulation() {
    const input = $('newProjectAddress');
    const box = input?.closest('.newProject');
    if (!input || !box) return;
    const explanation = document.createElement('p');
    explanation.className = 'fine addressSimulationExplanation';
    explanation.textContent = 'Localisez le projet par une adresse, des coordonnées GPS ou un clic sur la carte.';
    box.querySelector('b')?.insertAdjacentElement('afterend', explanation);
    input.addEventListener('ozeno:address-selected', (event) => {
      const coords = event.detail;
      if (!Number.isFinite(coords?.latitude) || !Number.isFinite(coords?.longitude)) return;
      let preserveContours = Boolean(config.commercialDraftId);
      const existingSurfaces = window.roofGroup?.getLayers?.().length || 0;
      if (config.commercialDraftId && existingSurfaces) {
        const previousSite = currentMapSite();
        if (previousSite && distanceMeters(previousSite, coords) <= 500) preserveContours = true;
        else {
          const accepted = window.confirm('La carte et les contours du dossier sont encore positionnés ailleurs. Localiser à cette adresse effacera ces contours pour éviter un calcul sur le mauvais site. Continuer ?');
          if (!accepted) {
            config.selectedAddressCoordinates = null;
            config.commercialAddressForLookup = null;
            config.addressLookupNeedsSelection = true;
            input.value = $('dashAddress')?.textContent || '';
            const hint = box.querySelector('.addressRecognition');
            if (hint) hint.textContent = 'Localisation annulée ; le dossier et ses contours ont été conservés.';
            const note = box.querySelector('.temporaryStudyNote');
            if (note) { note.textContent = 'Aucune modification de la position ou des surfaces.'; note.dataset.visible = 'true'; }
            if ($('roofResult')) $('roofResult').textContent = 'Localisation annulée : le dossier et ses contours ont été conservés.';
            window.OzenoSiteLocationUI?.sync();
            return;
          }
          preserveContours = false;
        }
      }
      config.commercialAddressForLookup = coords;
      config.addressLookupNeedsSelection = false;
      const coordinateSource = coords.coordinateSource || 'GEOPLATEFORME';
      setMapLocation(coords.latitude, coords.longitude, coords.label || input.value, {
        coordinateSource, precision: coords.precision || 'ADDRESS', preserveContours
      });
      window.OzenoSiteLocationUI?.sync();
      const temporaryNote = box.querySelector('.temporaryStudyNote');
      if (temporaryNote) {
        temporaryNote.textContent = coordinateSource === 'MANUAL_MAP_PIN'
          ? 'Repère placé manuellement · à confirmer sur l’imagerie avant de tracer le toit.'
          : coordinateSource === 'USER_COORDINATES'
            ? 'Coordonnées GPS saisies manuellement · à confirmer sur l’imagerie.'
            : 'Localisation issue de la Géoplateforme · vérifiez le repère avant de tracer le toit.';
      }
      const feedback = $('newProjectFeedback');
      if (feedback) feedback.textContent = 'Localisation appliquée à l’étude. Vérifiez le repère et la toiture, puis enregistrez le projet pour conserver vos modifications.';
    });
    document.querySelector('.projects')?.addEventListener('click', (event) => {
      const projectButton = event.target.closest('button[data-p]');
      if (!projectButton || projectButton.dataset.created === 'true') return;
      config.localProjectCoordinates = null;
      config.selectedAddressCoordinates = null;
      config.commercialAddressForLookup = null;
      config.addressLookupNeedsSelection = true;
      config.temporaryStudyLabel = null;
      config.temporaryMapMarker?.remove?.();
      config.temporaryMapMarker = null;
      window.roofGroup?.clearLayers();
      window.dispatchEvent(new CustomEvent('ozeno:roof-surfaces'));
      window.dispatchEvent(new CustomEvent('ozeno:project-context-loaded'));
    });
  }

  function installLocationChoices() {
    const input = $('newProjectAddress');
    if (!input) return;
    const box = input.closest('.newProject');
    const hint = box?.querySelector('.addressRecognition');
    $('manualSiteLocationButton')?.remove();
    config.manualLocationPickActive = false;
    input.placeholder = 'Adresse';
    input.setAttribute('aria-label', 'Adresse du projet');
    const addressLabel = document.createElement('label');
    addressLabel.className = 'siteAddressLabel';
    addressLabel.htmlFor = input.id;
    addressLabel.textContent = 'Adresse';
    input.insertAdjacentElement('beforebegin', addressLabel);
    if (hint) hint.textContent = 'Choisissez une suggestion officielle (IGN / Base Adresse Nationale).';
    const gps = document.createElement('div');
    gps.className = 'siteGpsFields';
    gps.innerHTML = '<label for="siteGpsCoordinates">Ou coordonnées GPS</label><input id="siteGpsCoordinates" type="text" placeholder="Latitude, longitude" autocomplete="off" aria-describedby="siteGpsHint"><p id="siteGpsHint" class="fine">Exemple de format : 49.2074, -0.3092.</p><button type="button" id="useSiteGps" class="action">Valider les coordonnées GPS</button><p id="siteGpsStatus" class="fine" role="status"></p>';
    (box.querySelector('.temporaryStudyNote') || hint || input).insertAdjacentElement('afterend', gps);
    const mapInfo = document.createElement('p');
    mapInfo.className = 'siteLocationInfo';
    mapInfo.textContent = 'Si la position est incorrecte, renseigner de nouvelles coordonnées ou modifier la position directement sur la carte.';
    gps.insertAdjacentElement('afterend', mapInfo);
    const mapPick = document.createElement('div');
    mapPick.className = 'siteMapPick';
    mapPick.innerHTML = '<button type="button" id="pickSiteOnMap" class="secondary">Placer le repère du site sur la carte</button><p id="siteMapPickStatus" class="fine" role="status" aria-live="polite"></p><button type="button" id="findReverseAddress" class="secondary" hidden>Rechercher une adresse proche via Géoplateforme</button><small class="fine">Cette recherche transmettra la latitude et la longitude du repère à la Géoplateforme. Le résultat est une adresse proche, à vérifier et confirmer manuellement.</small><button type="button" id="confirmReverseAddress" class="secondary" hidden></button>';
    mapInfo.insertAdjacentElement('afterend', mapPick);
    const pickButton = $('pickSiteOnMap');
    const pickStatus = $('siteMapPickStatus');
    const findReverse = $('findReverseAddress');
    const confirmReverse = $('confirmReverseAddress');
    let reverseCandidate = null, reverseRequest = 0;
    const sync = () => {
      const coordinates = config.localProjectCoordinates || config.projectCoordinates;
      const reference = config.commercialAddressForLookup;
      const coordinateOnly = (config.addressLookupNeedsSelection && Boolean(coordinates))
        || ['MAP_CLICK', 'CONTOUR_CENTER', 'USER_PROVIDED', 'COORDINATES', 'DEVICE_POSITION'].includes(reference?.precision)
        || /^(?:Repère manuel|Position GPS|Position sur la carte|Coordonnées GPS|Votre position actuelle)/.test(input.value);
      if (coordinateOnly) input.value = '';
      else if (reference?.label) input.value = reference.label;
      if ($('siteGpsCoordinates')) $('siteGpsCoordinates').value = coordinates?.latitude != null && coordinates?.longitude != null
        ? `${Number(coordinates.latitude).toFixed(5)}, ${Number(coordinates.longitude).toFixed(5)}` : '';
      if ($('siteGpsStatus')) $('siteGpsStatus').textContent = coordinateOnly ? 'Position géographique connue ; adresse postale à confirmer si nécessaire.' : '';
    };
    window.OzenoSiteLocationUI = { sync };
    const useGps = () => {
      const coordinates = window.SolarShiftSiteLocation?.parseCoordinates($('siteGpsCoordinates').value);
      if (!coordinates) { $('siteGpsStatus').textContent = 'Vérifiez la latitude (−90 à 90) et la longitude (−180 à 180), séparées par une virgule.'; return; }
      config.selectedAddressCoordinates = coordinates;
      config.commercialAddressForLookup = coordinates;
      config.addressLookupNeedsSelection = false;
      input.value = '';
      input.dispatchEvent(new CustomEvent('ozeno:address-selected', { bubbles: true, detail: coordinates }));
      sync();
      $('siteGpsStatus').textContent = 'Carte localisée avec les coordonnées saisies. Cliquez sur la toiture pour proposer son contour.';
    };
    $('useSiteGps').addEventListener('click', useGps);
    $('siteGpsCoordinates').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); useGps(); } });
    pickButton.addEventListener('click', () => {
      config.manualLocationPickActive = true;
      reverseCandidate = null;
      findReverse.hidden = true;
      confirmReverse.hidden = true;
      pickButton.textContent = 'Cliquez sur le point exact du site sur la carte…';
      pickStatus.textContent = 'Le prochain clic sur la carte déplacera le repère du site, sans tracer ni détecter de toiture.';
      window.solarMap?.getContainer?.().classList.add('isPickingSiteLocation');
    });
    confirmReverse.addEventListener('click', () => {
      if (!reverseCandidate || !config.localProjectCoordinates) return;
      const pin = config.localProjectCoordinates;
      const confirmed = { ...reverseCandidate, latitude: pin.latitude, longitude: pin.longitude, coordinateSource: 'USER_CONFIRMED_REVERSE_GEOCODE', precision: 'REVERSE_GEOCODED_ADDRESS' };
      config.commercialAddressForLookup = confirmed;
      config.selectedAddressCoordinates = confirmed;
      config.addressLookupNeedsSelection = false;
      input.value = confirmed.label;
      confirmReverse.hidden = true;
      pickStatus.textContent = `Adresse de proximité confirmée pour la recherche Enedis : ${confirmed.label}. Le point GPS exact reste conservé séparément.`;
      window.dispatchEvent(new CustomEvent('ozeno:site-address-confirmed', { detail: confirmed }));
    });
    findReverse.addEventListener('click', async () => {
      const coordinates = config.localProjectCoordinates;
      if (!coordinates) return;
      const request = ++reverseRequest;
      reverseCandidate = null;
      confirmReverse.hidden = true;
      findReverse.disabled = true;
      pickStatus.textContent = 'Recherche de l’adresse la plus proche via la Géoplateforme…';
      try {
        const { reverseGeocodeUrl, normalizeReverseGeocodeResult } = await import('./site-address.mjs');
        const response = await fetch(reverseGeocodeUrl(coordinates.latitude, coordinates.longitude), { signal: AbortSignal.timeout(12_000) });
        if (!response.ok) throw new Error(`service indisponible (${response.status})`);
        const candidate = normalizeReverseGeocodeResult(await response.json());
        if (request !== reverseRequest) return;
        if (!candidate) throw new Error('aucune adresse proche trouvée');
        reverseCandidate = candidate;
        const distanceLabel = candidate.distanceMeters == null ? '' : ` · à environ ${Math.round(candidate.distanceMeters)} m`;
        confirmReverse.textContent = `Confirmer l’adresse proche pour Enedis : ${candidate.label}${distanceLabel}`;
        confirmReverse.hidden = false;
        pickStatus.textContent = 'Adresse la plus proche proposée par la Géoplateforme : elle ne prouve pas le numéro exact du bâtiment. Vérifiez le repère et confirmez uniquement si l’adresse correspond au site.';
      } catch (error) {
        if (request === reverseRequest) pickStatus.textContent = `Repère GPS conservé. Aucune adresse postale confirmable (${error?.message || 'erreur'}).`;
      } finally {
        findReverse.disabled = false;
      }
    });
    window.addEventListener('ozeno:project-context-loaded', sync);
    window.addEventListener('ozeno:site-address-confirmed', sync);
    window.addEventListener('ozeno:map-site-selected', (event) => {
      const manualPick = config.manualLocationPickActive || event.detail?.manualPick === true;
      if (!manualPick && (config.localProjectCoordinates || (config.projectContextLoaded && config.projectCoordinates))) return;
      const { latitude, longitude, coordinateSource = 'MANUAL_MAP_PIN', precision = 'MAP_CLICK' } = event.detail;
      config.manualLocationPickActive = false;
      window.solarMap?.getContainer?.().classList.remove('isPickingSiteLocation');
      const reference = { latitude, longitude, label: 'Repère manuel sur la carte', coordinateSource: manualPick ? 'MANUAL_MAP_PIN' : coordinateSource, precision: manualPick ? 'MAP_CLICK' : precision };
      config.selectedAddressCoordinates = reference;
      config.commercialAddressForLookup = null;
      config.addressLookupNeedsSelection = true;
      input.value = '';
      input.placeholder = 'Adresse postale à confirmer (facultatif)';
      setMapLocation(latitude, longitude, reference.label, { coordinateSource: reference.coordinateSource, precision: reference.precision, preserveContours: true, centerMap: false });
      pickButton.textContent = 'Replacer le repère du site sur la carte';
      pickStatus.textContent = `Repère GPS enregistré : ${latitude.toFixed(5)}, ${longitude.toFixed(5)}. Vous pouvez l’utiliser seul, ou demander une adresse de proximité à confirmer.`;
      findReverse.hidden = false;
      confirmReverse.hidden = true;
      reverseCandidate = null;
      reverseRequest += 1;
      sync();
    });
    window.addEventListener('ozeno:roof-surfaces', () => {
      if (config.localProjectCoordinates || (config.projectContextLoaded && config.projectCoordinates)) return;
      const point = window.roofGroup?.getLayers?.()[0]?.getBounds?.().getCenter();
      if (point) window.dispatchEvent(new CustomEvent('ozeno:map-site-selected', { detail: { latitude: point.lat, longitude: point.lng, coordinateSource: 'DRAWN_CONTOUR_CENTER', precision: 'CONTOUR_CENTER' } }));
    });
    sync();
  }

  function installGeolocationControl() {
    if (!window.L || !window.solarMap || document.querySelector('.commercialGeolocation')) return;
    const control = L.control({ position: 'topright' });
    control.onAdd = () => {
      const wrap = L.DomUtil.create('div', 'leaflet-bar commercialGeolocation');
      const button = L.DomUtil.create('button', '', wrap);
      button.type = 'button';
      button.textContent = 'Ma position';
      button.title = 'Centrer la carte sur ma position';
      button.setAttribute('aria-label', 'Centrer la carte sur ma position');
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.on(button, 'click', () => {
        const status = $('roofResult');
        if (!navigator.geolocation) {
          if (status) status.textContent = 'La géolocalisation n’est pas disponible dans ce navigateur.';
          return;
        }
        button.disabled = true;
        button.textContent = 'Localisation…';
        navigator.geolocation.getCurrentPosition((position) => {
          const { latitude, longitude } = position.coords;
          const canUseForPreview = !config.canonicalConnectionExpected;
          if (canUseForPreview) {
            const reference = { latitude, longitude, label: 'Votre position actuelle', coordinateSource: 'BROWSER_GEOLOCATION', precision: 'DEVICE_POSITION' };
            config.commercialAddressForLookup = reference;
            config.selectedAddressCoordinates = reference;
            config.addressLookupNeedsSelection = false;
          }
          setMapLocation(latitude, longitude, 'Votre position actuelle', { temporary: canUseForPreview, coordinateSource: 'BROWSER_GEOLOCATION', precision: 'DEVICE_POSITION' });
          window.OzenoSiteLocationUI?.sync();
          if (status) status.textContent = canUseForPreview
            ? 'Carte centrée sur votre position. Elle sert de site temporaire à la simulation ; les tracés précédents ont été effacés.'
            : 'Carte centrée sur votre position. Les coordonnées canoniques du projet restent inchangées.';
          button.disabled = false;
          button.textContent = 'Ma position';
        }, (error) => {
          if (status) status.textContent = error.code === 1
            ? 'Autorisez la localisation dans le navigateur pour centrer la carte.'
            : 'Position indisponible. Vérifiez le signal GPS ou réessayez.';
          button.disabled = false;
          button.textContent = 'Ma position';
        }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 });
      });
      return wrap;
    };
    control.addTo(window.solarMap);
    const style = document.createElement('style');
    style.textContent = '.commercialGeolocation button{border:0;background:#fff;color:#08734c;padding:7px 9px;min-height:34px;font:600 13px system-ui;cursor:pointer}.commercialGeolocation button:disabled{opacity:.65}.addressSimulationExplanation{margin:7px 0}.isPickingSiteLocation,.isPickingSiteLocation *{cursor:crosshair!important}.siteMapPick{display:grid;gap:6px;margin:8px 0}.siteMapPick small{color:#587469}';
    document.head.appendChild(style);
  }

  function replaceDemoProjectCreation() {
    const button = $('newProject');
    if (!button) return;
    window.createNewProject = function createNewProjectFromChosenAddress() {
      const name = $('newProjectName')?.value.trim();
      const input = $('newProjectAddress');
      const address = input?.value.trim();
      const feedback = $('newProjectFeedback');
      const coords = config.selectedAddressCoordinates;
      if (!name || !address) {
        if (feedback) feedback.textContent = 'Pour créer un projet, indiquez son nom et choisissez une adresse proposée.';
        return;
      }
      if (!coords || coords.label !== address) {
        if (feedback) feedback.textContent = 'Choisissez d’abord l’adresse exacte dans les suggestions. Vous pouvez aussi l’utiliser directement pour une simulation provisoire.';
        return;
      }
      const key = `p${Date.now()}`;
      const fullName = `${name} — ${coords.label}`;
      ps[key] = [fullName, 'Projet de démonstration · non enregistré dans Supabase', coords.latitude, coords.longitude];
      const popup = document.createElement('div');
      const popupTitle = document.createElement('b');
      popupTitle.textContent = fullName;
      popup.append(popupTitle, document.createElement('br'), document.createTextNode('Projet de démonstration · non enregistré'));
      marks[key] = L.marker([coords.latitude, coords.longitude]).bindPopup(popup);
      marks[key].on('click', () => pick(key));
      const projectButton = document.createElement('button');
      projectButton.dataset.p = key;
      projectButton.dataset.created = 'true';
      const title = document.createElement('b');
      title.textContent = name;
      const subtitle = document.createElement('small');
      subtitle.textContent = `Projet de démonstration · ${address}`;
      projectButton.append(title, subtitle);
      projectButton.onclick = () => pick(key);
      document.querySelector('.projects')?.insertBefore(projectButton, document.querySelector('.newProject'));
      config.localProjectCoordinates = { latitude: coords.latitude, longitude: coords.longitude };
      config.commercialAddressForLookup = coords;
      config.temporaryStudyLabel = coords.label;
      if ($('newProjectName')) $('newProjectName').value = '';
      if (feedback) feedback.textContent = 'Projet ajouté à cette démonstration. Les données ne sont pas enregistrées dans Supabase.';
      pick(key);
      window.dispatchEvent(new CustomEvent('ozeno:project-context-loaded'));
    };
    button.onclick = window.createNewProject;
  }

  function installPvgisLossHelp() {
    const input = $('pvgisSystemLoss');
    const label = input?.closest('label');
    if (!input || !label || label.querySelector('.pvgisLossHelp')) return;

    const help = document.createElement('span');
    help.className = 'pvgisLossHelp';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pvgisLossHelpButton';
    button.textContent = 'i';
    button.setAttribute('aria-label', 'Comprendre les pertes estimées du système');
    button.setAttribute('aria-expanded', 'false');
    const tooltip = document.createElement('span');
    tooltip.className = 'pvgisLossTooltip';
    tooltip.id = 'pvgisLossTooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.textContent = 'Pertes estimées du système : Les pertes estimées du système sont toutes les pertes dans le système qui font que la puissance réellement délivrée sur le réseau électrique soit plus basse que la puissance produite par les modules. Elles peuvent notamment provenir du câblage, de l’onduleur, de la saleté (et parfois de la neige) sur les modules, etc. Au fil des années, les performances des modules tendent à diminuer : la puissance moyenne délivrée annuellement pendant la durée de vie du système sera donc inférieure à celle des premières années.\n\nPar défaut, nous utilisons une estimation de pertes de 14 %. Si vous savez que les pertes de votre système sont différentes (par exemple grâce à un onduleur au très bon rendement), vous pouvez légèrement réduire ce nombre.';
    button.setAttribute('aria-describedby', tooltip.id);
    help.append(button, tooltip);
    input.insertAdjacentElement('beforebegin', help);
    // The roof sizing controls may have wrapped the label text before this
    // window-load hook runs. Keep the help icon in the title row in either
    // script order instead of letting it become a separate grid row.
    const sizingTitle = label.querySelector('.roofSizingLabelTitle');
    if (sizingTitle) sizingTitle.append(help);

    if (!document.getElementById('pvgisLossHelpStyles')) {
      const style = document.createElement('style');
      style.id = 'pvgisLossHelpStyles';
      style.textContent = '.pvgisLossHelp{position:relative;display:inline-block;vertical-align:middle;margin:0 0 5px 6px;font-weight:400}.pvgisLossHelpButton{display:inline-grid;place-items:center;width:20px;height:20px;padding:0;border:0;border-radius:0;background:transparent;color:#08734c;font:700 14px system-ui;cursor:help}.pvgisLossHelpButton:focus-visible{outline:2px solid #08734c;outline-offset:2px}.pvgisLossTooltip{display:none;position:absolute;top:calc(100% + 7px);left:0;z-index:1200;width:min(420px,calc(100vw - 48px));padding:12px 14px;border:1px solid #cfe0d5;border-radius:8px;background:#fff;color:#123d30;box-shadow:0 4px 18px #0002;font-size:13px;font-weight:400;line-height:1.45;white-space:pre-line}.pvgisLossHelp:hover .pvgisLossTooltip,.pvgisLossHelp:focus-within .pvgisLossTooltip,.pvgisLossHelp.is-open .pvgisLossTooltip{display:block}';
      document.head.appendChild(style);
    }

    button.addEventListener('click', () => {
      const open = help.classList.toggle('is-open');
      button.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (event) => {
      if (help.contains(event.target)) return;
      help.classList.remove('is-open');
      button.setAttribute('aria-expanded', 'false');
    });
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      help.classList.remove('is-open');
      button.setAttribute('aria-expanded', 'false');
      button.focus();
    });
  }

  function boot() {
    installAddressSimulation();
    installLocationChoices();
    installGeolocationControl();
    replaceDemoProjectCreation();
    installPvgisLossHelp();
  }

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot, { once: true });
}());
