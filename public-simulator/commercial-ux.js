(function () {
  'use strict';

  const config = window.SOLARSHIFT_CONFIG = window.SOLARSHIFT_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  function pointInRing(latitude, longitude, ring) {
    if (!Array.isArray(ring) || ring.length < 4) return false;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i] || [], [xj, yj] = ring[j] || [];
      if (![xi, yi, xj, yj].every(Number.isFinite)) continue;
      if ((yi > latitude) !== (yj > latitude)
        && longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function roofContainsPoint(latitude, longitude) {
    return (window.roofGroup?.getLayers?.() || []).some((layer) => {
      let geometry;
      try { geometry = layer.toGeoJSON?.().geometry; } catch { return false; }
      const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates]
        : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
      return polygons.some((rings) => Array.isArray(rings) && rings.length
        && pointInRing(latitude, longitude, rings[0])
        && !rings.slice(1).some((hole) => pointInRing(latitude, longitude, hole)));
    });
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
      const savedProject = Boolean(config.projectId || config.commercialDraftId || (config.projectContextLoaded && config.projectContext?.id));
      config.temporaryStudyLabel = savedProject ? null : label;
      if (preserveContours) window.dispatchEvent(new CustomEvent('ozeno:site-location-updated'));
      else {
        window.roofGroup?.clearLayers();
        window.dispatchEvent(new CustomEvent('ozeno:roof-surfaces'));
        window.dispatchEvent(new CustomEvent('ozeno:project-context-loaded'));
      }
      const dash = $('dashAddress');
      const postalLabel = config.commercialAddressForLookup?.label || config.projectContext?.address;
      if (dash) dash.textContent = savedProject
        ? (postalLabel || label)
        : `${label} · simulation temporaire`;
    }
  }

  function installAddressSimulation() {
    const input = $('newProjectAddress');
    const box = input?.closest('.newProject');
    if (!input || !box) return;
    const explanation = document.createElement('p');
    explanation.className = 'fine addressSimulationExplanation';
    explanation.textContent = 'Si la position est inexacte, cliquez sur « Modifier sur la carte », puis repérez le nouvel emplacement sur la carte. Vous pouvez aussi saisir des coordonnées GPS si elles sont connues.';
    box.querySelector('b')?.insertAdjacentElement('afterend', explanation);
    input.addEventListener('ozeno:address-selected', (event) => {
      const coords = event.detail;
      if (!Number.isFinite(coords?.latitude) || !Number.isFinite(coords?.longitude)) return;
      const existingSurfaces = window.roofGroup?.getLayers?.().length || 0;
      let preserveContours = existingSurfaces > 0 && roofContainsPoint(coords.latitude, coords.longitude);
      if (existingSurfaces && !preserveContours) {
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
      }
      config.commercialAddressForLookup = coords;
      config.addressLookupNeedsSelection = false;
      const coordinateSource = coords.coordinateSource || 'GEOPLATEFORME';
      setMapLocation(coords.latitude, coords.longitude, coords.label || input.value, {
        coordinateSource, precision: coords.precision || 'ADDRESS', preserveContours
      });
      window.OzenoSiteLocationUI?.sync();
      if (Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude)) {
        window.dispatchEvent(new CustomEvent('ozeno:parcel-address-resolved', { detail: {
          latitude: coords.latitude, longitude: coords.longitude,
          coordinateSource, precision: coords.precision || 'ADDRESS', label: coords.label || input.value
        } }));
      }
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
    input.placeholder = 'Adresse, ville ou 48.95990, 1.82077';
    input.setAttribute('aria-label', 'Adresse ou coordonnées GPS du site');
    const addressLabel = document.createElement('label');
    addressLabel.className = 'siteAddressLabel';
    addressLabel.htmlFor = input.id;
    addressLabel.textContent = 'Adresse ou GPS';
    input.insertAdjacentElement('beforebegin', addressLabel);
    let addressControl = input.closest('.siteAddressControl');
    if (!addressControl) {
      addressControl = document.createElement('div');
      addressControl.className = 'siteAddressControl';
      input.before(addressControl);
      addressControl.append(input);
    }
    if (hint) hint.textContent = 'Pour corriger l’emplacement, cliquez sur « Modifier sur la carte », puis sélectionnez le point souhaité. Vous pouvez aussi saisir des coordonnées GPS dans ce champ.';

    const mapPick = document.createElement('div');
    mapPick.className = 'siteMapPick';
    mapPick.innerHTML = '<button type="button" id="pickSiteOnMap" class="secondary">Modifier sur la carte</button><button type="button" id="validateSiteMapPosition" class="secondary" hidden>Valider la position</button><button type="button" id="cancelSiteMapPick" class="secondary" hidden>Annuler le placement</button><p id="siteMapPickStatus" class="fine" role="status" aria-live="polite"></p>';
    (box.querySelector('.temporaryStudyNote') || hint || input).insertAdjacentElement('afterend', mapPick);

    const pickButton = $('pickSiteOnMap'), pickStatus = $('siteMapPickStatus'), validatePositionButton = $('validateSiteMapPosition');
    const showPositionValidation = (visible) => {
      const point = config.localProjectCoordinates || config.projectCoordinates || config.selectedAddressCoordinates;
      const hasPoint = Number.isFinite(Number(point?.latitude)) && Number.isFinite(Number(point?.longitude));
      const confirmedParcel = Boolean(window.OzenoParcelQualification?.capture?.());
      const ready = hasPoint && confirmedParcel && !config.manualLocationPickActive
        && hasPostalAddress() && !config.manualLocationAddressFlow && !config.addressLookupNeedsSelection;
      validatePositionButton.hidden = visible === false || !ready;
      validatePositionButton.textContent = 'Valider l’adresse et continuer';
    };
    const suggestions = document.createElement('div');
    suggestions.className = 'siteAddressSuggestions';
    suggestions.id = 'siteAddressSuggestions';
    suggestions.setAttribute('role', 'listbox');
    suggestions.hidden = true;
    const addressStatus = document.createElement('p');
    addressStatus.className = 'fine siteAddressStatus';
    addressStatus.id = 'siteAddressStatus';
    addressStatus.setAttribute('role', 'status');
    addressStatus.setAttribute('aria-live', 'polite');
    addressControl.insertAdjacentElement('afterend', suggestions);
    suggestions.insertAdjacentElement('afterend', addressStatus);
    let addressSearchTimer = 0, addressSearchRequest = 0, addressSearchController = null, addressCandidates = [];
    const closeAddressSuggestions = () => { suggestions.replaceChildren(); suggestions.hidden = true; addressCandidates = []; };
    const selectAddress = (coords) => {
      if (!Number.isFinite(coords?.latitude) || !Number.isFinite(coords?.longitude)) return;
      const previousReference = config.commercialAddressForLookup;
      const previousLabel = previousReference?.label || config.projectContext?.address || '';
      const existingSurfaces = window.roofGroup?.getLayers?.().length || 0;
      const savedProject = Boolean(config.projectId || config.commercialDraftId || (config.projectContextLoaded && config.projectContext?.id));
      let preserveContours = existingSurfaces > 0 && roofContainsPoint(coords.latitude, coords.longitude);
      if (savedProject && existingSurfaces && !preserveContours) {
          const accepted = window.confirm('Cette adresse se trouve hors des toitures dessinées. La sélectionner effacera ces tracés pour éviter un calcul sur le mauvais bâtiment. Continuer ?');
          if (!accepted) {
            input.value = previousLabel;
            addressStatus.textContent = 'Adresse non modifiée ; le site et ses surfaces ont été conservés.';
            closeAddressSuggestions();
            return;
          }
      }
      config.commercialAddressForLookup = coords;
      config.selectedAddressCoordinates = coords;
      config.addressLookupNeedsSelection = false;
      config.temporaryStudyLabel = savedProject ? null : coords.label;
      input.value = coords.label;
      const dashAddress = $('dashAddress');
      if (dashAddress) dashAddress.textContent = coords.label;
      closeAddressSuggestions();
      const coordinateOnly = ['COORDINATES', 'USER_COORDINATES'].includes(coords.precision);
      setMapLocation(coords.latitude, coords.longitude, coords.label, {
        coordinateSource: coords.coordinateSource || (coordinateOnly ? 'USER_COORDINATES' : 'GEOPLATEFORME'),
        precision: coords.precision || 'ADDRESS', preserveContours
      });
      showPositionValidation(true);
      window.OzenoSiteLocationUI?.sync();
      window.dispatchEvent(new CustomEvent('ozeno:site-address-confirmed', { detail: { label: coords.label, precision: coords.precision || 'ADDRESS' } }));
      window.dispatchEvent(new CustomEvent('ozeno:parcel-address-resolved', { detail: {
        latitude: coords.latitude, longitude: coords.longitude,
        coordinateSource: coords.coordinateSource || (coordinateOnly ? 'USER_COORDINATES' : 'GEOPLATEFORME'),
        precision: coords.precision || 'ADDRESS', label: coords.label
      } }));
      addressStatus.textContent = coordinateOnly
        ? 'Repère placé à ces coordonnées. Si le point est correct, continuez ; sinon déplacez-le sur la carte.'
        : 'Adresse et repère appliqués. Si le point est correct, continuez ; sinon cliquez sur « Modifier sur la carte ». La parcelle se vérifie séparément à l’étape Surfaces solaires.';
    };
    const searchAddressSuggestions = async () => {
      const query = input.value.trim();
      const request = ++addressSearchRequest;
      addressSearchController?.abort();
      addressSearchController = null;
      if (!query) { closeAddressSuggestions(); addressStatus.textContent = ''; return; }
      const { parseCoordinatePair, siteAddressAutocompleteUrl, normalizeSiteAddressSuggestion } = await import('./site-address.mjs?v=20261111-location-flow-5');
      if (request !== addressSearchRequest || input.value.trim() !== query) return;
      const coordinates = parseCoordinatePair(query);
      if (coordinates) {
        const option = document.createElement('button');
        option.type = 'button'; option.className = 'siteAddressSuggestion'; option.setAttribute('role', 'option');
        option.textContent = `Utiliser les coordonnées ${coordinates.label}`;
        option.addEventListener('click', () => selectAddress({ ...coordinates, coordinateSource: 'USER_COORDINATES' }));
        suggestions.replaceChildren(option); suggestions.hidden = false;
        addressStatus.textContent = 'Coordonnées GPS reconnues. Sélectionnez-les pour déplacer le repère.';
        return;
      }
      if (query.length < 3) { closeAddressSuggestions(); addressStatus.textContent = 'Saisissez au moins 3 caractères pour rechercher une adresse.'; return; }
      addressSearchController = new AbortController();
      const signal = addressSearchController.signal;
      addressStatus.textContent = 'Recherche d’adresses officielles…';
      try {
        const response = await fetch(siteAddressAutocompleteUrl(query), { signal });
        if (!response.ok) throw new Error(`geocoding_http_${response.status}`);
        const payload = await response.json();
        if (request !== addressSearchRequest || input.value.trim() !== query) return;
        addressCandidates = (payload.results || payload.features || []).map(normalizeSiteAddressSuggestion).filter(Boolean).slice(0, 8);
        suggestions.replaceChildren(...addressCandidates.map((candidate, index) => {
          const option = document.createElement('button');
          option.type = 'button'; option.className = 'siteAddressSuggestion'; option.setAttribute('role', 'option');
          option.textContent = candidate.label; option.dataset.addressIndex = String(index);
          option.addEventListener('click', () => selectAddress(candidate));
          return option;
        }));
        suggestions.hidden = !addressCandidates.length;
        addressStatus.textContent = addressCandidates.length
          ? 'Choisissez une adresse dans la liste pour la valider et déplacer le repère.'
          : 'Aucune suggestion trouvée. Vérifiez la voie et la commune ou déplacez le repère sur la carte.';
      } catch (error) {
        if (request !== addressSearchRequest || signal.aborted) return;
        closeAddressSuggestions();
        addressStatus.textContent = 'Recherche d’adresse indisponible. Vous pouvez toujours repérer le site sur la carte.';
      }
    };
    input.addEventListener('input', () => {
      window.dispatchEvent(new CustomEvent('ozeno:site-map-mode-cancel'));
      validatePositionButton.hidden = true;
      window.clearTimeout(addressSearchTimer);
      addressSearchTimer = window.setTimeout(() => { void searchAddressSuggestions(); }, 250);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !suggestions.hidden) { closeAddressSuggestions(); return; }
      if (event.key === 'Enter' && !suggestions.hidden && addressCandidates.length) {
        event.preventDefault(); selectAddress(addressCandidates[0]);
      }
    });
    const cancelPick = () => {
      if (config.manualLocationPickActive) {
        config.manualLocationAddressFlow = false;
        window.dispatchEvent(new CustomEvent('ozeno:parcel-confirmation-required', { detail: { required: false } }));
      }
      config.manualLocationPickActive = false;
      window.solarMap?.getContainer?.().classList.remove('isPickingSiteLocation');
      $('cancelSiteMapPick').hidden = true;
      pickButton.textContent = 'Modifier sur la carte';
      pickStatus.textContent = '';
      showPositionValidation();
    };
    validatePositionButton.addEventListener('click', () => {
      if (!window.OzenoParcelQualification?.capture?.() || !hasPostalAddress() || config.manualLocationAddressFlow || config.addressLookupNeedsSelection) return;
      config.manualLocationPositionConfirmed = true;
      config.manualLocationAddressFlow = false;
      window.dispatchEvent(new CustomEvent('ozeno:parcel-confirmation-required', { detail: { required: false } }));
      validatePositionButton.hidden = true;
      pickStatus.textContent = 'Position validée. L’adresse postale et la parcelle peuvent être vérifiées séparément.';
      window.dispatchEvent(new CustomEvent('ozeno:site-position-confirmed', { detail: { ...config.localProjectCoordinates } }));
    });
    $('cancelSiteMapPick').addEventListener('click', cancelPick);
    window.addEventListener('ozeno:site-map-mode-cancel', cancelPick);
    window.addEventListener('ozeno:project-context-loaded', cancelPick);
    input.addEventListener('input', () => window.dispatchEvent(new CustomEvent('ozeno:site-map-mode-cancel')));
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && config.manualLocationPickActive) cancelPick(); });
    const sync = () => {
      const coordinates = config.localProjectCoordinates || config.projectCoordinates;
      const reference = config.commercialAddressForLookup;
      const hasPostalReference = Boolean(reference && (reference.address || reference.streetAddress)
        && !['MAP_CLICK', 'CONTOUR_CENTER', 'USER_PROVIDED', 'COORDINATES', 'DEVICE_POSITION', 'POINT_OF_INTEREST', 'MANUAL_MAP_PIN'].includes(reference.precision));
      const coordinateOnly = !hasPostalReference && ((config.addressLookupNeedsSelection && Boolean(coordinates))
        || ['MAP_CLICK', 'CONTOUR_CENTER', 'USER_PROVIDED', 'COORDINATES', 'DEVICE_POSITION'].includes(reference?.precision)
        || /^(?:Repère manuel|Position GPS|Position sur la carte|Coordonnées GPS|Votre position actuelle)/.test(input.value));
      if (coordinateOnly) input.value = reference?.label || '';
      else if (reference?.label) input.value = reference.label;
    };
    window.OzenoSiteLocationUI = { sync };
    pickButton.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('ozeno:site-map-mode-cancel'));
      config.manualLocationPickActive = true;
      config.manualLocationPositionConfirmed = false;
      config.manualLocationAddressFlow = true;
      window.dispatchEvent(new CustomEvent('ozeno:parcel-confirmation-required', { detail: { required: true } }));
      validatePositionButton.hidden = true;
      config.parcelLocationPickActive = false;
      $('cancelSiteMapPick').hidden = false;
      pickButton.textContent = 'Cliquez sur le site sur la carte…';
      pickStatus.textContent = 'Cliquez sur le bâtiment ou le terrain pour déplacer le repère et rechercher sa parcelle.';
      window.solarMap?.getContainer?.().classList.add('isPickingSiteLocation');
      const mapTarget = $('prestudyLocationMapSlot')?.parentElement || window.solarMap?.getContainer?.();
      mapTarget?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    });
    window.addEventListener('ozeno:project-context-loaded', () => { sync(); showPositionValidation(); });
    window.addEventListener('ozeno:site-address-confirmed', sync);
    window.addEventListener('ozeno:parcel-qualification-updated', () => showPositionValidation());
    window.addEventListener('ozeno:parcel-qualification-confirmed', () => {
      if (config.manualLocationAddressFlow) return;
      if (config.manualLocationPositionConfirmed) {
        window.dispatchEvent(new CustomEvent('ozeno:site-position-confirmed', { detail: { ...config.localProjectCoordinates } }));
      }
    });
    window.addEventListener('ozeno:parcel-address-suggestion-validated', event => {
      const candidate = event.detail;
      if (!candidate || !String(candidate.address || '').trim()) return;
      const selected = { ...candidate, coordinateSource: 'GEOPLATEFORME_REVERSE', precision: 'USER_CONFIRMED_ADDRESS' };
      const savedProject = Boolean(config.projectId || config.commercialDraftId || (config.projectContextLoaded && config.projectContext?.id));
      config.commercialAddressForLookup = selected;
      config.selectedAddressCoordinates = selected;
      config.addressLookupNeedsSelection = false;
      config.manualLocationAddressFlow = false;
      window.dispatchEvent(new CustomEvent('ozeno:parcel-confirmation-required', { detail: { required: false } }));
      config.temporaryStudyLabel = savedProject ? null : selected.label;
      input.value = selected.label;
      const dashAddress = $('dashAddress');
      if (dashAddress) dashAddress.textContent = selected.label;
      window.OzenoSiteLocationUI?.sync();
      addressStatus.textContent = 'Nouvelle adresse validée. Passage à l’étape suivante…';
      window.dispatchEvent(new CustomEvent('ozeno:site-address-confirmed', { detail: { label: selected.label, source: 'PARCEL_PROXIMITY_CANDIDATE' } }));
    });
    window.addEventListener('ozeno:map-site-selected', event => {
      const manualPick = config.manualLocationPickActive || event.detail?.manualPick === true;
      if (!manualPick && (config.localProjectCoordinates || (config.projectContextLoaded && config.projectCoordinates))) return;
      const { latitude, longitude, coordinateSource = 'MANUAL_MAP_PIN', precision = 'MAP_CLICK' } = event.detail;
      config.manualLocationPickActive = false;
      $('cancelSiteMapPick').hidden = true;
      validatePositionButton.hidden = true;
      window.solarMap?.getContainer?.().classList.remove('isPickingSiteLocation');
      const markerReference = { latitude, longitude, label: 'Repère manuel sur la carte', coordinateSource: manualPick ? 'MANUAL_MAP_PIN' : coordinateSource, precision: manualPick ? 'MAP_CLICK' : precision };
      const postalReference = config.commercialAddressForLookup;
      const hasPostalReference = Boolean(!manualPick && postalReference && (postalReference.address || postalReference.streetAddress)
        && !['MAP_CLICK', 'CONTOUR_CENTER', 'USER_PROVIDED', 'COORDINATES', 'DEVICE_POSITION', 'POINT_OF_INTEREST', 'MANUAL_MAP_PIN'].includes(postalReference.precision));
      config.selectedAddressCoordinates = markerReference;
      if (hasPostalReference) {
        config.addressLookupNeedsSelection = false;
        input.value = postalReference.label || postalReference.address || config.projectContext?.address || input.value;
      } else {
        config.commercialAddressForLookup = null;
        config.addressLookupNeedsSelection = true;
        input.value = '';
      }
      input.placeholder = 'Adresse postale du site';
      const preserveContours = roofContainsPoint(latitude, longitude);
      setMapLocation(latitude, longitude, markerReference.label, { coordinateSource: markerReference.coordinateSource, precision: markerReference.precision, preserveContours, centerMap: false });
      pickButton.textContent = 'Modifier sur la carte';
      config.manualLocationPositionConfirmed = false;
      showPositionValidation(false);
      pickStatus.textContent = manualPick
        ? 'Repère déplacé. Confirmez la nouvelle parcelle, puis choisissez son adresse avant de continuer.'
        : '';
      if (config.siteLocationMapActive && !event.detail?.parcelLookupScheduled) {
        config.parcelLocationPickActive = true;
        window.dispatchEvent(new CustomEvent('ozeno:parcel-map-click', { detail: { latitude, longitude } }));
      }
      sync();
    });
    window.addEventListener('ozeno:roof-surfaces', () => {
      if (config.localProjectCoordinates || (config.projectContextLoaded && config.projectCoordinates)) return;
      const point = window.roofGroup?.getLayers?.()[0]?.getBounds?.().getCenter();
      if (point) window.dispatchEvent(new CustomEvent('ozeno:map-site-selected', { detail: { latitude: point.lat, longitude: point.lng, coordinateSource: 'DRAWN_CONTOUR_CENTER', precision: 'CONTOUR_CENTER' } }));
    });
    sync();
    showPositionValidation();
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
    style.textContent = '.commercialGeolocation button{border:0;background:#fff;color:#08734c;padding:7px 9px;min-height:34px;font:600 13px system-ui;cursor:pointer}.commercialGeolocation button:disabled{opacity:.65}.addressSimulationExplanation{margin:7px 0}.isPickingSiteLocation,.isPickingSiteLocation *{cursor:crosshair!important}.siteAddressControl{display:block;max-width:620px}.siteAddressControl input{box-sizing:border-box;width:100%;min-width:0}.siteAddressSuggestions{display:grid;gap:4px;max-width:620px;margin:4px 0}.siteAddressSuggestion{display:block;width:100%;padding:9px 11px;border:1px solid #d3e1d8;border-radius:5px;background:#fff;color:#244d40;text-align:left;cursor:pointer}.siteAddressSuggestion:hover,.siteAddressSuggestion:focus-visible{background:#eff7f2;border-color:#25856a}.siteAddressStatus{max-width:620px;margin:4px 0;color:#52675f;font-size:12px}.siteMapPick{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:8px 0}.siteMapPick p{flex-basis:100%;margin:0}.siteMapPick small{color:#587469}';
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
      style.textContent = '.pvgisLossHelp{position:relative;display:inline-block;vertical-align:middle;margin:0 0 5px 6px;font-weight:400}.pvgisLossHelpButton{display:inline-grid;place-items:center;width:20px;height:20px;padding:0;border:1px solid #87b6a0;border-radius:50%;background:#fff;color:#08734c;font:700 12px system-ui;cursor:help}.pvgisLossHelpButton:focus-visible{outline:2px solid #08734c;outline-offset:2px}.pvgisLossTooltip{display:none;position:absolute;top:calc(100% + 7px);left:0;z-index:1200;width:min(420px,calc(100vw - 48px));padding:12px 14px;border:1px solid #cfe0d5;border-radius:8px;background:#fff;color:#123d30;box-shadow:0 4px 18px #0002;font-size:13px;font-weight:400;line-height:1.45;white-space:pre-line}.pvgisLossHelp:hover .pvgisLossTooltip,.pvgisLossHelp:focus-within .pvgisLossTooltip,.pvgisLossHelp.is-open .pvgisLossTooltip{display:block}';
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
