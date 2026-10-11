import { hasHouseNumber, normalizeSiteAddressSuggestion, siteAddressAutocompleteUrl } from './site-address.mjs';
import { CR010_SIZING_VERSION, estimateSolarCapacity, PRO_SIMULATOR_TILT_ANGLES, solarRoofPlanes } from './pro-simulator-estimation.mjs';
import { installRoofMapInteractions } from './roof-map-interactions.mjs';

const $ = (id) => document.getElementById(id);
const form = $('simulatorForm');
form.querySelectorAll('input[name="usageMode"]').forEach((input) => { input.checked = false; input.required = true; });
const steps = [...document.querySelectorAll('[data-step]')].filter((section) => Number(section.dataset.step) <= 5);
const progressItems = [...document.querySelectorAll('[data-progress-step]')];
const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const shadeMultipliers = Object.freeze({ none: 1, some: 0.92, high: 0.75 });
const azimuthLabels = Object.freeze({ 0: 'Nord', 45: 'Nord-est', 90: 'Est', 135: 'Sud-est', 180: 'Sud', 225: 'Sud-ouest', 270: 'Ouest', 315: 'Nord-ouest' });
const heroCopy = Object.freeze({
  1: ['Évaluez le potentiel solaire de votre site <em>professionnel</em>', 'Obtenez une première estimation du potentiel solaire de votre site en quelques minutes, gratuitement et sans engagement.', 'Le solaire, un atout pour votre activité', 'Explorez le potentiel de votre site et préparez votre projet en toute simplicité.'],
  2: ['Estimez le potentiel solaire de votre <em>site</em>', 'En quelques étapes, obtenez une première estimation du potentiel solaire de votre bâtiment ou de votre surface extérieure.', 'Un parcours adapté à votre site', 'Les questions s’adaptent à une toiture ou à une surface extérieure destinée à une ombrière.'],
  3: ['Qualification <em>technique</em>', 'Ces repères nous aident à préciser l’estimation de la surface choisie.', 'Des informations simples pour avancer', 'Les valeurs déclarées restent indicatives et seront à confirmer lors de l’étude technique.'],
  4: ['Parlons de <em>votre projet solaire</em>', 'Ces informations nous permettent de mieux comprendre votre besoin et votre calendrier.', 'Un projet à votre rythme', 'Précisez l’usage envisagé et votre horizon de réalisation. Aucun engagement à cette étape.'],
  5: ['Votre première estimation', 'Consultez librement cet aperçu indicatif. Il ne crée pas de projet et ne remplace pas une étude complète.', 'Et maintenant ?', 'Faites confirmer la toiture, la structure et l’implantation avant tout engagement.']
});

let currentStep = 1;
let selectedAddress = null;
let searchTimer = null;
let searchController = null;
let calculationController = null;
let roofMap = null;
let roofMapShapes = null;
let roofMapLocationKey = null;
let mapSiteKind = null;
let drawnRoofAreaM2 = 0;
let roofInteractions = null;
const roofPreviews = new Map();

function selected(name) { return form.querySelector(`input[name="${name}"]:checked`); }
function selectedRoofType() { return selected('siteKind')?.value === 'land' ? 'canopy' : selected('roofType')?.value; }
function numberFormat(value, maximumFractionDigits = 0) {
  return Number(value).toLocaleString('fr-FR', { maximumFractionDigits, minimumFractionDigits: 0 }).replace(/[\u00a0\u202f]/g, ' ');
}
function showStep(step) {
  if (currentStep === 2 && step !== 2) { roofInteractions?.finishCorrection(true); cancelRoofDetection(); }
  currentStep = step;
  updatePresentation(step);
  steps.forEach((section) => { section.hidden = Number(section.dataset.step) !== step; });
  const progressStep = Math.min(step, progressItems.length);
  progressItems.forEach((item) => {
    const number = Number(item.dataset.progressStep);
    item.classList.toggle('isCurrent', number === progressStep);
    item.classList.toggle('isComplete', number < progressStep);
    if (number === progressStep) item.setAttribute('aria-current', 'step');
    else item.removeAttribute('aria-current');
  });
  $('progressFill').style.width = `${((progressStep - 1) / Math.max(1, progressItems.length - 1)) * 100}%`;
  document.querySelector('.simTopbar').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  $('simTitle').focus({ preventScroll: true });
  if (step === 2) window.setTimeout(() => { initRoofMap(); roofMap?.invalidateSize(); }, 0);
  if (step === 3 || step === 4) window.setTimeout(updateRoofPreviews, 0);
}
function updatePresentation(step) {
  document.body.dataset.activeStep = String(step);
  document.body.dataset.view = step === 5 ? 'summary' : 'input';
  const [title, description, noteTitle, noteText] = heroCopy[step];
  // Only static editorial copy is rendered as markup; site/contact values remain textContent.
  $('simTitle').innerHTML = title;
  $('simTitle').removeAttribute('aria-label');
  $('simTitle').tabIndex = -1;
  $('simHeroEyebrow').textContent = step === 5 ? 'APERÇU INDICATIF · NON CANONIQUE' : `ÉTAPE ${step} SUR 5`;
  $('simHeroDescription').textContent = description;
  $('simHeroNoteTitle').textContent = noteTitle;
  $('simHeroNoteText').textContent = noteText;
}
function setAddressStatus(message, kind = 'info') {
  const status = $('addressStatus');
  status.textContent = message;
  status.dataset.kind = kind;
}
function clearSuggestions() {
  $('addressSuggestions').replaceChildren();
  $('addressSuggestions').hidden = true;
}
function useSuggestion(suggestion) {
  const typedHouseNumber = $('siteAddress').value.trim().match(/^\s*(\d+[a-z]?)(?=\s)/i)?.[1];
  const suggestionHasNumber = typedHouseNumber && hasHouseNumber(suggestion.label, typedHouseNumber);
  selectedAddress = suggestion;
  $('siteAddress').value = suggestion.label;
  $('continueLabel').textContent = 'Continuer';
  $('latitude').value = suggestion.latitude;
  $('longitude').value = suggestion.longitude;
  if (roofMap) roofMap.setView([suggestion.latitude, suggestion.longitude], 18);
  updateProjectSummary();
  clearSuggestions();
  setAddressStatus(typedHouseNumber && !suggestionHasNumber
    ? `La rue est localisée, mais le numéro ${typedHouseNumber} n’est pas confirmé par la base d’adresses. Vérifiez le bâtiment sur la carte.`
    : 'Adresse sélectionnée. Vérifiez qu’elle correspond bien au bâtiment étudié.', typedHouseNumber && !suggestionHasNumber ? 'warning' : 'ready');
}
function renderSuggestions(results) {
  const container = $('addressSuggestions');
  container.replaceChildren(...results.map((suggestion, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `addressSuggestion${index}`;
    button.setAttribute('role', 'option');
    button.textContent = suggestion.label;
    button.addEventListener('click', () => useSuggestion(suggestion));
    return button;
  }));
  container.hidden = results.length === 0;
}
function polygonAreaSquareMeters(layer) {
  const coordinates = layer.getLatLngs();
  const ring = Array.isArray(coordinates[0]) ? coordinates[0] : coordinates;
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  const earthRadius = 6378137;
  let total = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    total += (next.lng - current.lng) * Math.PI / 180
      * (2 + Math.sin(current.lat * Math.PI / 180) + Math.sin(next.lat * Math.PI / 180));
  }
  return Math.abs(total * earthRadius * earthRadius / 2);
}
function cancelRoofDetection() {
  roofInteractions?.cancel();
  $('roofDetectionStatus').textContent = '';
}
function updateDrawnRoofArea() {
  drawnRoofAreaM2 = 0;
  roofMapShapes?.eachLayer((layer) => { drawnRoofAreaM2 += polygonAreaSquareMeters(layer); });
  if (drawnRoofAreaM2 > 0) {
    $('roofArea').value = String(Math.round(drawnRoofAreaM2));
    $('mapAreaOutput').textContent = `${numberFormat(drawnRoofAreaM2)} m² mesurés`;
  } else {
    $('roofArea').value = '';
    $('mapAreaOutput').textContent = 'Surface à repérer';
  }
  $('roofMap').classList.remove('isMissing');
  $('areaError').hidden = true;
  updateProjectSummary();
}
function updateProjectSummary() {
  const buildingLabels = { offices: 'Bureaux & tertiaire', logistics: 'Stockage & logistique', industry: 'Industrie & atelier', retail: 'Commerce & grande surface', public: 'Équipement public', other: 'Autre bâtiment professionnel' };
  const externalSurfaceLabels = { parking: 'Parking', terrain: 'Terrain', agriculture: 'Surface agricole' };
  const area = Number($('roofArea')?.value) || drawnRoofAreaM2;
  const siteKind = selected('siteKind')?.value;
  const building = selected('buildingUse')?.value;
  const roof = selectedRoofType();
  const roofLabel = roof === 'flat' ? 'Toit plat' : roof === 'pitched' ? `Toiture inclinée · ${selected('roofPans')?.value === 'two' ? '2 pans' : '1 pan'}` : roof === 'canopy' ? 'Ombrière photovoltaïque' : 'À choisir';
  const siteLabel = siteKind === 'land' ? (externalSurfaceLabels[selected('externalSurfaceType')?.value] || 'Surface extérieure à choisir') : siteKind === 'building' ? (buildingLabels[building] || 'Type de bâtiment à choisir') : 'À choisir';
  document.querySelectorAll('#summaryBuilding, [data-summary-building]').forEach((node) => { node.textContent = siteLabel; });
  document.querySelectorAll('#summaryRoof, [data-summary-roof]').forEach((node) => { node.textContent = roofLabel; });
  document.querySelectorAll('#summaryArea, [data-summary-area]').forEach((node) => { node.textContent = area >= 20 ? `${numberFormat(area)} m²` : 'À mesurer'; });
  document.querySelectorAll('[data-summary-building-art]').forEach((node) => { node.hidden = siteKind === 'land'; node.className = `simBuildingArt building-${building || 'offices'}`; });
  document.querySelectorAll('[data-summary-roof-art]').forEach((node) => { node.hidden = roof === 'canopy'; node.className = `simSolarArt solar-${roof || 'flat'}`; });
  const siteKindLabel = siteKind === 'land' ? 'Type de surface' : 'Type de bâtiment';
  const installationLabel = siteKind === 'land' ? 'Installation' : 'Type de toiture';
  const areaLabel = siteKind === 'land' ? 'Surface extérieure' : 'Surface de toiture';
  $('summaryBuildingLabel').textContent = siteKindLabel;
  $('summaryAreaLabel').textContent = `${areaLabel} tracée`;
  document.querySelectorAll('[data-summary-site-label]').forEach((node) => { node.textContent = siteKindLabel; });
  document.querySelectorAll('[data-summary-installation-label]').forEach((node) => { node.textContent = installationLabel; });
  document.querySelectorAll('[data-summary-area-label]').forEach((node) => { node.textContent = areaLabel; });
  $('summaryAdvice').textContent = siteKind === 'land'
    ? 'La puissance d’une ombrière dépendra ensuite de son implantation et d’une étude dédiée.'
    : 'Vous préciserez la pente, l’orientation et l’ombrage pour affiner votre estimation.';
  updateRoofPreviews();
}

function updateSiteKind() {
  const siteKind = selected('siteKind')?.value;
  const buildingPath = siteKind === 'building';
  const externalPath = siteKind === 'land';
  if (mapSiteKind && siteKind && mapSiteKind !== siteKind) {
    roofMapShapes?.clearLayers();
    drawnRoofAreaM2 = 0;
    $('roofArea').value = '';
    $('mapAreaOutput').textContent = 'Surface à repérer';
    $('roofDetectionStatus').textContent = 'Le contour précédent a été effacé : il correspondait à l’autre type de surface.';
    $('roofDetectionStatus').dataset.kind = 'info';
  }
  if (siteKind) mapSiteKind = siteKind;
  roofInteractions?.setFootprintDetectionEnabled(buildingPath);
  const externalSurfaceGroup = document.querySelector('.simExternalSurfaceGroup');
  if (externalSurfaceGroup) externalSurfaceGroup.hidden = !externalPath;
  document.querySelectorAll('input[name="buildingUse"]').forEach((input) => { input.required = true; });
  document.querySelectorAll('input[name="roofType"]').forEach((input) => {
    input.disabled = !buildingPath;
    input.required = buildingPath;
    if (!buildingPath) input.checked = false;
  });
  document.querySelectorAll('input[name="externalSurfaceType"]').forEach((input) => {
    input.disabled = !externalPath;
    input.required = externalPath;
    if (!externalPath) input.checked = false;
  });
  $('areaLabel').textContent = siteKind === 'land' ? 'Surface extérieure à étudier (m²)' : 'Surface totale de toiture (m²)';
  $('areaHelp').textContent = siteKind === 'land'
    ? 'Surface du parking, du terrain ou de la zone agricole, mesurée sur la carte ou indiquée.'
    : 'Mesurée sur la carte ou indiquée si vous la connaissez.';
  $('roofMapHeading').textContent = 'Repérez votre toiture ou surface à couvrir';
  $('detailsDescription').textContent = externalPath
    ? 'Quelques repères simples pour préciser l’estimation de votre surface extérieure.'
    : 'Quelques repères simples pour affiner l’estimation de votre toiture.';
  document.querySelectorAll('[data-roof-preview]').forEach((node) => {
    node.setAttribute('aria-label', externalPath
      ? 'Aperçu de la surface extérieure sur la carte'
      : 'Aperçu de votre toiture sur la carte');
  });
  $('roofMapDescription').textContent = siteKind === 'land'
    ? 'Repérez le parking, le terrain ou la surface agricole à étudier. Tracez son contour avec le rectangle ou le polygone.'
    : 'Tracez le contour de la toiture avec le rectangle ou le polygone. Vous pourrez ajuster les points si besoin.';
  $('roofMapHint').lastElementChild.textContent = siteKind === 'land'
    ? 'Pour un parking, un terrain ou une surface agricole, dessinez le contour avec le polygone ou le rectangle. Le repérage automatique des toitures n’est pas appliqué.'
    : 'Cliquez une fois sur chaque toiture pour proposer son contour automatique. Pour le corriger, cliquez une seconde fois dessus. Vous pouvez aussi dessiner au polygone ou au rectangle.';
  $('roofMap').setAttribute('aria-label', siteKind === 'land'
    ? 'Carte satellite pour tracer le contour de la surface extérieure'
    : 'Carte satellite pour tracer le contour de la toiture');
  $('areaError').textContent = siteKind === 'land'
    ? 'Tracez la surface extérieure sur la carte ou indiquez sa superficie pour continuer.'
    : 'Tracez le toit sur la carte ou indiquez sa surface pour continuer.';
  updatePanChoice();
  updateProjectSummary();
}
function updateRoofPreviews() {
  const location = readLocation();
  if (!location || !window.L) return;
  document.querySelectorAll('[data-roof-preview]').forEach((container) => {
    if (container.closest('[data-step]')?.hidden || !container.clientWidth || !container.clientHeight) return;
    let preview = roofPreviews.get(container);
    if (!preview) {
      const map = window.L.map(container, { zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, touchZoom: false, keyboard: false });
      // The recap reuses the existing satellite source, never a different mapping service.
      window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles © Esri', maxZoom: 19 }).addTo(map);
      preview = { map, shapes: window.L.featureGroup().addTo(map) };
      roofPreviews.set(container, preview);
    }
    preview.map.invalidateSize();
    preview.shapes.clearLayers();
    const geometry = roofMapShapes?.toGeoJSON();
    if (geometry?.features?.length) {
      window.L.geoJSON(geometry, { style: { color: '#fff', weight: 2, fillColor: '#5db78d', fillOpacity: .4 } }).addTo(preview.shapes);
      preview.map.fitBounds(preview.shapes.getBounds(), { padding: [20, 20], maxZoom: 19, animate: false });
    } else {
      preview.map.setView([location.latitude, location.longitude], 18, { animate: false });
      window.L.circleMarker([location.latitude, location.longitude], { radius: 6, color: '#fff', weight: 2, fillColor: '#007952', fillOpacity: 1 }).addTo(preview.shapes);
    }
  });
}
function initRoofMap() {
  const container = $('roofMap');
  const location = readLocation();
  if (!container || !location || !window.L) return;
  const locationKey = `${location.latitude},${location.longitude}`;
  if (roofMapLocationKey && roofMapLocationKey !== locationKey) {
    cancelRoofDetection();
    roofMapShapes?.clearLayers();
    updateDrawnRoofArea();
  }
  roofMapLocationKey = locationKey;
  if (!roofMap) {
    roofMap = window.L.map(container, { scrollWheelZoom: false }).setView([location.latitude, location.longitude], 18);
    const satellite = window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles © Esri', maxZoom: 19
    });
    const plan = window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19
    });
    satellite.addTo(roofMap);
    window.L.control.layers({ Satellite: satellite, Plan: plan }, null, { position: 'topright' }).addTo(roofMap);
    roofMapShapes = window.L.featureGroup().addTo(roofMap);
    roofMap.addControl(new window.L.Control.Draw({
      position: 'topleft',
      edit: { featureGroup: roofMapShapes, remove: true },
      draw: { polygon: { allowIntersection: false, showArea: true }, rectangle: true, polyline: false, circle: false, marker: false, circlemarker: false }
    }));
    roofInteractions = installRoofMapInteractions({
      map: roofMap, shapes: roofMapShapes, leaflet: window.L, onChange: updateDrawnRoofArea,
      onStatus(message, kind) { $('roofDetectionStatus').textContent = message; $('roofDetectionStatus').dataset.kind = kind; },
      onEditing(active) { $('roofContourEditor').hidden = !active; }
    });
    roofInteractions.setFootprintDetectionEnabled(selected('siteKind')?.value === 'building');
  } else roofMap.setView([location.latitude, location.longitude], 18);
  window.setTimeout(() => roofMap.invalidateSize(), 80);
}
async function findAddresses(query) {
  searchController?.abort();
  searchController = new AbortController();
  const controller = searchController;
  setAddressStatus('Recherche de l’adresse…');
  try {
    // Use the same autocomplete endpoint and behavior as the project form.
    const response = await fetch(siteAddressAutocompleteUrl(query), { signal: controller.signal, headers: { 'Accept-Language': 'fr' } });
    if (controller.signal.aborted) return;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const results = (Array.isArray(payload.results) ? payload.results : [])
      .map(normalizeSiteAddressSuggestion).filter(Boolean);
    const normalizedQuery = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const typedNumber = normalizedQuery.match(/(?:^|\s)(\d+[a-z]?)(?=\s|$)/i)?.[1];
    const ranked = results.map((item) => {
      const label = item.label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const numberMatch = typedNumber && new RegExp(`(?:^|\\s)${typedNumber}(?:\\s|,|$)`, 'i').test(label);
      const wordMatches = normalizedQuery.split(/\s+/).filter((part) => part.length > 2 && label.includes(part)).length;
      return { item, score: (numberMatch ? 100 : 0) + wordMatches };
    }).sort((left, right) => right.score - left.score).map(({ item }) => item);
    const unique = [...new Map(ranked.map((item) => [`${item.latitude.toFixed(6)}:${item.longitude.toFixed(6)}`, item])).values()].slice(0, 8);
    renderSuggestions(unique);
    setAddressStatus(unique.length
      ? typedNumber ? `Le numéro ${typedNumber} n’est pas toujours référencé. Choisissez la rue et la commune ; vous vérifierez ensuite le bâtiment sur la carte.` : 'Choisissez la rue et la commune correspondant au site.'
      : 'Aucune suggestion pour le moment. Essayez seulement le nom de la rue et la commune, ou saisissez les coordonnées GPS.');
    return unique;
  } catch (error) {
    if (error.name !== 'AbortError') setAddressStatus('Recherche temporairement indisponible. Vous pouvez saisir les coordonnées GPS.');
    return [];
  }
}
function useMyLocation() {
  const button = $('useMyLocation');
  if (!navigator.geolocation) {
    setAddressStatus('La géolocalisation n’est pas disponible dans ce navigateur. Saisissez une adresse ou des coordonnées GPS.', 'error');
    return;
  }
  clearTimeout(searchTimer);
  searchController?.abort();
  button.disabled = true;
  setAddressStatus('Recherche de votre position…');
  navigator.geolocation.getCurrentPosition((position) => {
    const latitude = Number(position.coords.latitude);
    const longitude = Number(position.coords.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
      || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      setAddressStatus('La position reçue est invalide. Saisissez une adresse ou des coordonnées GPS.', 'error');
      button.disabled = false;
      return;
    }
    selectedAddress = null;
    $('siteAddress').value = 'Ma position';
    $('latitude').value = String(latitude);
    $('longitude').value = String(longitude);
    if (roofMap) roofMap.setView([latitude, longitude], 18);
    clearSuggestions();
    updateContinueLabel();
    setAddressStatus('Position récupérée. Elle sera utilisée pour le calcul solaire.', 'ready');
    button.disabled = false;
  }, (error) => {
    const messages = {
      1: 'Autorisez la localisation dans le navigateur, ou saisissez une adresse ou les coordonnées GPS.',
      2: 'Position indisponible. Saisissez une adresse ou les coordonnées GPS.',
      3: 'La recherche de position a pris trop de temps. Réessayez ou saisissez une adresse.'
    };
    setAddressStatus(messages[error.code] || 'Impossible de récupérer votre position. Saisissez une adresse ou les coordonnées GPS.', 'error');
    button.disabled = false;
  }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
}
function readLocation() {
  const latitude = Number($('latitude').value);
  const longitude = Number($('longitude').value);
  if ($('latitude').value && $('longitude').value && Number.isFinite(latitude) && Number.isFinite(longitude)
      && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
    return { latitude, longitude, label: selectedAddress?.label || $('siteAddress').value.trim() || `${latitude}, ${longitude}` };
  }
  if (selectedAddress) return selectedAddress;
  return null;
}
function updateContinueLabel() {
  $('continueLabel').textContent = readLocation() || !$('siteAddress').value.trim()
    ? 'Continuer'
    : 'Rechercher l’adresse';
}
async function validateStepOne() {
  const error = $('formError');
  error.hidden = true;
  $('siteAddress').classList.remove('isMissing');
  $('simAddressField').classList.remove('isMissing');
  if (readLocation()) return true;
  if (!$('siteAddress').value.trim()) {
    $('siteAddress').classList.add('isMissing');
    $('simAddressField').classList.add('isMissing');
    setAddressStatus('Saisissez une adresse ou ouvrez la saisie des coordonnées GPS.', 'error');
    $('siteAddress').focus();
  } else {
    const query = $('siteAddress').value.trim();
    if (query.length < 4) {
      setAddressStatus('Saisissez une adresse plus complète pour lancer la recherche.', 'error');
      $('siteAddress').focus();
      return false;
    }
    setAddressStatus('Recherche de cette adresse pour afficher les choix…');
    const continueButton = form.querySelector('[data-next]');
    $('continueLabel').textContent = 'Recherche…';
    continueButton.disabled = true;
    try { await findAddresses(query); }
    finally {
      continueButton.disabled = false;
      $('continueLabel').textContent = 'Rechercher l’adresse';
    }
    const firstSuggestion = $('addressSuggestions').querySelector('button');
    if (firstSuggestion) {
      setAddressStatus('Choisissez l’adresse correspondant au bâtiment, puis cliquez de nouveau sur « Continuer ».', 'error');
      firstSuggestion.focus();
    } else {
      setAddressStatus('Aucune suggestion pour cette saisie. Essayez le nom de la rue et la commune, ou saisissez les coordonnées GPS.', 'error');
      $('siteAddress').focus();
    }
  }
  return false;
}
function validateStepTwo() {
  const section = form.querySelector('[data-step="2"]');
  const invalid = section.querySelector(':invalid');
  section.querySelectorAll('.simChoiceGroup').forEach((group) => {
    const required = [...group.querySelectorAll('input[required]')];
    group.classList.toggle('isMissing', required.some((input) => !input.checkValidity()));
  });
  const area = Number($('roofArea').value) || drawnRoofAreaM2;
  $('areaError').hidden = area >= 20;
  $('roofConfigError').hidden = !invalid;
  $('roofMap').classList.toggle('isMissing', area < 20);
  if (area < 20 && !invalid) {
    $('areaError').hidden = false;
    $('roofArea').focus();
    return false;
  }
  if (invalid) {
    $('roofConfigError').hidden = false;
    invalid.focus();
    return false;
  }
  return true;
}
function validateStepThree() {
  if (!['flat', 'pitched'].includes(selectedRoofType())) { $('formError').hidden = true; return true; }
  const section = form.querySelector('[data-step="3"]');
  const invalid = section.querySelector(':invalid');
  section.querySelectorAll('.simChoiceGroup').forEach((group) => {
    const required = [...group.querySelectorAll('input[required]')];
    group.classList.toggle('isMissing', required.some((input) => !input.checkValidity()));
  });
  if (invalid) {
    $('formError').textContent = 'Choisissez une option dans chaque rubrique encadrée en rouge.';
    $('formError').hidden = false;
    invalid.focus();
    return false;
  }
  $('formError').hidden = true;
  return true;
}
function validateStepFour() {
  const choice = selected('usageMode');
  const group = document.querySelector('.simUseCases');
  group?.classList.toggle('isMissing', !choice);
  $('usageError').hidden = Boolean(choice);
  if (!choice) {
    group?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
    group?.querySelector('input[name="usageMode"]')?.focus({ preventScroll: true });
    return false;
  }
  return true;
}
function roofAzimuth(aspect) {
  const normalized = ((Number(aspect) % 360) + 360) % 360;
  if (normalized >= 45 && normalized <= 135 || normalized >= 225 && normalized <= 315) return 'eastWest';
  if (normalized >= 135 && normalized <= 225) return 'south';
  return 'other';
}
function buildEstimateInput() {
  const siteKind = selected('siteKind')?.value;
  const roofType = selectedRoofType();
  const orientationValue = selected('orientation')?.value;
  const orientation = orientationValue == null ? null : Number(orientationValue);
  const tiltBand = selected('tiltBand')?.value;
  const grossArea = Number($('roofArea').value) || drawnRoofAreaM2;
  const usablePercent = Number($('usablePercent').value);
  const shade = selected('shade')?.value;
  const supported = ['flat', 'pitched'].includes(roofType);
  const sizing = supported ? estimateSolarCapacity({ roofType, orientation, tiltBand, grossArea, usablePercent }) : null;
  const twoPans = roofType === 'pitched' && selected('roofPans')?.value === 'two';
  const planes = supported ? solarRoofPlanes({ roofType, roofPans: selected('roofPans')?.value, orientation }) : [];
  return {
    address: readLocation(), roofType, supported, orientation, orientations: planes.map((plane) => plane.orientation), planes, twoPans, aspect: orientation - 180,
    tilt: sizing ? PRO_SIMULATOR_TILT_ANGLES[tiltBand] : null,
    selectedTilt: sizing ? PRO_SIMULATOR_TILT_ANGLES[tiltBand] : null, tiltBand,
    grossArea, usablePercent, usableArea: sizing?.usableAreaM2 ?? grossArea * usablePercent / 100,
    shade, shadeFactor: shadeMultipliers[shade], density: sizing?.densityWcM2 ?? null,
    lowKwp: sizing?.lowKwp ?? null, referenceKwp: sizing?.referenceKwp ?? null, highKwp: sizing?.highKwp ?? null,
    moduleCount: sizing?.moduleCount ?? null, modulePowerWc: sizing?.modulePowerWc ?? null,
    sizingVersion: sizing?.version ?? null, layoutWarning: sizing?.layoutWarning ?? null,
    annualConsumption: Number($('annualConsumption').value) || null,
    usageMode: selected('usageMode')?.value || 'self-consumption',
    siteKind,
    buildingUse: selected('buildingUse')?.value || null,
    externalSurfaceType: selected('externalSurfaceType')?.value || null,
    material: selected('material')?.value || null
  };
}
function apiUrl(input, optimal = false, orientation = input.orientation) {
  const endpoint = window.SOLARSHIFT_CONFIG?.pvgisEndpoint;
  if (!endpoint) throw new Error('Le service de calcul PVGIS n’est pas configuré.');
  const url = new URL(endpoint, window.location.href);
  const params = {
    lat: input.address.latitude, lon: input.address.longitude,
    angle: optimal ? 10 : input.tilt,
    aspect: orientation - 180,
    loss: 14,
    mountingplace: 'building',
    ...(optimal ? { optimalinclination: 1 } : {
      budget_low_kwp: input.lowKwp,
      budget_reference_kwp: input.referenceKwp,
      budget_high_kwp: input.highKwp,
      roof_pans: input.twoPans ? 'two' : 'one',
      shade: input.shade
    })
  };
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  return url.toString();
}
async function requestPvgis(input, signal, optimal = false, orientation = input.orientation) {
  const response = await fetch(apiUrl(input, optimal, orientation), { signal });
  if (!response.ok) throw new Error(`Le calcul solaire est momentanément indisponible (code ${response.status}).`);
  const result = await response.json();
  if (!Number.isFinite(Number(result.annual_kwh_kwc))) {
    throw new Error('Le service PVGIS a renvoyé un résultat incomplet. Réessayez dans quelques instants.');
  }
  return result;
}
function renderResult(input, production = null) {
  const annual = production && input.referenceKwp != null ? Number(production.annual_kwh_kwc) * input.referenceKwp * input.shadeFactor : null;
  $('resultLocation').textContent = input.address.label;
  $('resultStatus').hidden = Boolean(production);
  $('resultContent').hidden = false;
  $('capacityRange').textContent = input.referenceKwp != null ? `${numberFormat(input.referenceKwp, 1)} kWc` : 'À compléter';
  $('capacityCorridor').textContent = input.lowKwp != null ? `Fourchette indicative : ${numberFormat(input.lowKwp, 1)}–${numberFormat(input.highKwp, 1)} kWc` : 'Modèle non disponible pour cette installation';
  $('annualProduction').textContent = annual != null ? `${numberFormat(annual)} kWh/an` : 'À compléter';
  const budget = production?.installation_budget;
  const budgetReady = budget?.status === 'ASSUMPTION' && budget.scope === 'EQUIPMENT_AND_INSTALLATION'
    && budget.rangeBasis === 'CAPACITY_CORRIDOR_AT_FIXED_UNIT_COST'
    && [budget.lowEur, budget.referenceEur, budget.highEur].every((value) => typeof value === 'number' && Number.isFinite(value) && value > 0)
    && budget.lowEur <= budget.referenceEur && budget.referenceEur <= budget.highEur;
  const budgetRange = budgetReady ? `${numberFormat(Math.round(budget.lowEur / 1000))}–${numberFormat(Math.round(budget.highEur / 1000))} k€` : production ? 'À préciser' : 'En attente';
  $('installationBudget').textContent = budgetRange;
  $('installationBudget').classList.toggle('simPendingValue', !budgetReady);
  $('installationBudgetRange').textContent = budgetReady
    ? 'Fourchette indicative · équipements et installation'
    : production ? 'À préciser avec un devis' : 'Non disponible';
  $('resultGrossArea').textContent = `${numberFormat(input.grossArea)} m²`;
  $('resultUsableArea').textContent = `${numberFormat(input.usableArea)} m²`;
  $('resultUsableAssumption').textContent = `${numberFormat(input.usablePercent)} % de la surface totale · hypothèse modifiable`;
  const buildingLabels = { offices: 'Bureaux & tertiaire', logistics: 'Stockage & logistique', industry: 'Industrie & atelier', retail: 'Commerce & grande surface', public: 'Équipement public', other: 'Autre bâtiment professionnel' };
  const externalSurfaceLabels = { parking: 'Parking', terrain: 'Terrain', agriculture: 'Surface agricole' };
  $('resultBuildingUse').textContent = input.siteKind === 'land' ? externalSurfaceLabels[input.externalSurfaceType] || 'Surface extérieure à préciser' : buildingLabels[input.buildingUse] || 'À compléter';
  $('resultInstallationType').textContent = input.siteKind === 'land'
    ? 'Ombrière photovoltaïque'
    : input.roofType === 'flat' ? 'Toit plat' : input.roofType === 'pitched' ? `Toiture inclinée${input.twoPans ? ' · 2 pans' : ' · 1 pan'}` : 'À compléter';
  $('resultOrientation').textContent = input.siteKind === 'land' ? 'À qualifier pour l’ombrière' : azimuthLabels[input.orientation] || 'À compléter';
  $('resultTilt').textContent = input.siteKind === 'land' || input.tilt == null ? 'À qualifier' : `${numberFormat(input.tilt)}°`;
  $('resultShade').textContent = input.shade === 'none' ? 'Aucun ou très faible · hypothèse' : input.shade === 'some' ? 'Quelques ombres · hypothèse' : input.shade === 'high' ? 'Ombres importantes · hypothèse' : 'À compléter';
  $('resultSpecificYield').textContent = production && input.siteKind !== 'land'
    ? `${numberFormat(Number(production.annual_kwh_kwc) * input.shadeFactor)} kWh/kWc/an · estimation PVGIS`
    : 'À calculer / qualifier';
  $('resultFinancialCapex').textContent = budgetReady ? budgetRange : 'À préciser';
  const monthlyValues = Array.isArray(production?.monthly_kwh_kwc) && production.monthly_kwh_kwc.length === 12
    ? production.monthly_kwh_kwc.map((value) => Number(value) * input.referenceKwp * input.shadeFactor)
    : null;
  $('resultAnnualComparison').textContent = annual != null && input.annualConsumption > 0
    ? `${numberFormat(annual)} kWh/an de production estimée pour ${numberFormat(input.annualConsumption)} kWh/an consommés, soit ${numberFormat(annual / input.annualConsumption * 100, 0)} % en volume annuel.`
    : annual == null && input.annualConsumption > 0
      ? 'Production ou consommation insuffisante pour comparer les volumes annuels.'
      : 'Consommation annuelle non renseignée : comparaison indisponible.';
  const productionPanel = $('simProductionPanel');
  const monthlyChart = $('simMonthlyChart');
  monthlyChart.replaceChildren();
  if (monthlyValues && monthlyValues.every(Number.isFinite) && input.siteKind !== 'land') {
    const maxMonthly = Math.max(...monthlyValues, 1);
    monthlyValues.forEach((value, index) => {
      const month = document.createElement('div');
      month.className = 'simMonth';
      const wrap = document.createElement('div');
      wrap.className = 'simMonthBarWrap';
      const bar = document.createElement('div');
      bar.className = 'simMonthBar';
      bar.style.height = `${Math.max(2, value / maxMonthly * 100)}%`;
      bar.title = `${monthNames[index]} · ${numberFormat(value)} kWh estimés`;
      const label = document.createElement('label');
      label.textContent = monthNames[index];
      wrap.append(bar);
      month.append(wrap, label);
      monthlyChart.append(month);
    });
    productionPanel.hidden = false;
  } else {
    productionPanel.hidden = true;
  }
  $('resultRoofType').textContent = input.siteKind === 'land'
    ? `Type de surface : parking, terrain ou surface agricole · installation envisagée : ombrière photovoltaïque.`
    : `Bâtiment : ${{ flat: 'toit plat', pitched: 'toiture inclinée' }[input.roofType] || 'à compléter'}.`;
  $('resultUsage').textContent = `Usage envisagé : ${{ 'self-consumption': 'autoconsommation', 'full-sale': 'vente totale', undecided: 'non décidé' }[input.usageMode] || 'à compléter'} · qualification indicative uniquement.`;
  $('simUnsupportedResult').hidden = input.supported;
}
function mapPvgisError(error) {
  if (error?.name === 'AbortError') return '';
  return error instanceof Error ? error.message : 'Le calcul n’a pas abouti. Vérifiez les données du site puis réessayez.';
}
async function calculate(event) {
  event.preventDefault();
  const input = buildEstimateInput();
  if (!input.supported) {
    calculationController?.abort();
    renderResult(input);
    $('simUnsupportedResult').hidden = false;
    $('resultStatus').textContent = 'Aucune estimation de puissance ou de production n’est disponible pour ce type d’installation.';
    $('resultStatus').dataset.kind = 'unknown';
    $('resultStatus').hidden = false;
    $('retryEstimateButton').hidden = true;
    $('calculateButton').disabled = false;
    showStep(5);
    return;
  }
  calculationController?.abort();
  calculationController = new AbortController();
  const controller = calculationController;
  $('resultStatus').textContent = 'Calcul PVGIS en cours…';
  $('resultStatus').dataset.kind = 'loading';
  $('resultStatus').hidden = false;
  $('retryEstimateButton').hidden = true;
  $('calculateButton').disabled = true;
  renderResult(input);
  showStep(5);
  try {
    const production = await requestPvgis(input, controller.signal);
    if (controller.signal.aborted) return;
    renderResult(input, production);
  } catch (error) {
    if (controller.signal.aborted) return;
    $('resultStatus').textContent = mapPvgisError(error);
    $('resultStatus').dataset.kind = 'error';
    $('resultStatus').hidden = false;
    $('retryEstimateButton').hidden = false;
  } finally {
    if (!controller.signal.aborted) $('calculateButton').disabled = false;
  }
}
function updateRoofSupport() {
  const supported = ['flat', 'pitched'].includes(selectedRoofType());
  const fields = document.querySelector('.simTechnicalFields');
  if (fields) fields.hidden = !supported;
  document.querySelectorAll('[data-step="3"] .simTechnicalFields input').forEach((input) => { input.disabled = !supported; });
  $('unsupportedRoofNotice').hidden = supported;
  $('unsupportedQualificationNotice').hidden = supported;
}
function updateTiltLegend() {
  const roofType = selectedRoofType();
  $('tiltLegend').textContent = roofType === 'flat' ? 'Inclinaison des supports envisagée' : 'Inclinaison de la toiture';
  const note = $('tiltRecommendation');
  if (roofType === 'flat') {
    note.textContent = 'Pour un toit plat, indiquez l’inclinaison de support envisagée. L’optimum PVGIS sera affiché séparément comme recommandation.';
    note.hidden = false;
  } else {
    note.textContent = 'Pour une toiture inclinée, la pente du toit détermine physiquement l’angle des panneaux.';
    note.hidden = false;
  }
}
function updatePanOrientation() {
  const two = selected('roofType')?.value === 'pitched' && selected('roofPans')?.value === 'two';
  $('orientationLegend').textContent = two ? 'Orientation du premier pan' : 'Orientation principale des panneaux';
  const note = $('secondPanOrientation');
  note.hidden = !two;
  const orientation = selected('orientation')?.value;
  note.textContent = orientation == null
    ? 'Choisissez l’orientation d’un pan. Le second sera considéré comme opposé, avec la moitié de la surface, la même pente et le même ombrage.'
    : `Pan 1 : ${azimuthLabels[orientation]} · Pan 2 : ${azimuthLabels[(Number(orientation) + 180) % 360]}. Chaque pan représente 50 % de la surface, avec la même pente et le même ombrage. Pour un toit asymétrique, une étude séparée des pans est nécessaire.`;
}
function updatePanChoice() { document.querySelector('.simPansGroup').hidden = selectedRoofType() !== 'pitched'; updatePanOrientation(); updateRoofSupport(); }
function updateUsableOutput() { $('usableOutput').textContent = `${$('usablePercent').value} %`; }
function goBack() {
  calculationController?.abort(); $('calculateButton').disabled = false;
  if (currentStep > 1) showStep(currentStep - 1);
}
function restart() {
  calculationController?.abort();
  cancelRoofDetection();
  form.reset();
  selectedAddress = null;
  drawnRoofAreaM2 = 0;
  roofMapShapes?.clearLayers();
  $('roofArea').value = '';
  $('mapAreaOutput').textContent = 'Surface à repérer';
  updateSiteKind();
  $('usablePercent').value = '65'; updateUsableOutput();
  $('resultContent').hidden = true; $('resultStatus').hidden = true;
  updateProjectSummary();
  showStep(1);
}

$('siteAddress').addEventListener('input', (event) => {
  cancelRoofDetection();
  selectedAddress = null;
  event.currentTarget.classList.remove('isMissing');
  $('simAddressField').classList.remove('isMissing');
  updateContinueLabel();
  $('latitude').value = ''; $('longitude').value = '';
  clearTimeout(searchTimer); clearSuggestions();
  const query = event.currentTarget.value.trim();
  if (query.length < 4) { setAddressStatus('Saisissez au moins 4 caractères pour rechercher une adresse.'); return; }
  searchTimer = setTimeout(() => findAddresses(query), 350);
});
$('siteAddress').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') clearSuggestions();
  if (event.key === 'ArrowDown' && !$('addressSuggestions').hidden) { event.preventDefault(); $('addressSuggestions').querySelector('button')?.focus(); }
});
 $('useMyLocation').addEventListener('click', useMyLocation);
$('saveRoofContour').addEventListener('click', () => roofInteractions?.finishCorrection(true));
$('cancelRoofContour').addEventListener('click', () => roofInteractions?.finishCorrection(false));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('roofContourEditor').hidden) { event.preventDefault(); roofInteractions?.finishCorrection(false); }
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.simAddressField')) clearSuggestions();
});
$('latitude').addEventListener('input', () => { cancelRoofDetection(); selectedAddress = null; updateContinueLabel(); });
$('longitude').addEventListener('input', () => { cancelRoofDetection(); selectedAddress = null; updateContinueLabel(); });
$('usablePercent').addEventListener('input', updateUsableOutput);
form.querySelectorAll('input[name="siteKind"]').forEach((input) => input.addEventListener('change', updateSiteKind));
form.querySelectorAll('input[name="roofType"]').forEach((input) => input.addEventListener('change', updateTiltLegend));
form.querySelectorAll('input[name="roofType"]').forEach((input) => input.addEventListener('change', updatePanChoice));
form.querySelectorAll('[data-next]').forEach((button, index) => button.addEventListener('click', async (event) => {
  if (index === 0 && await validateStepOne()) showStep(2);
  else if (index === 1 && validateStepTwo()) showStep(3);
  else if (index === 2 && validateStepThree()) showStep(4);
  else if (index === 3 && validateStepFour()) await calculate(event);
}));
document.querySelectorAll('[data-back]').forEach((button) => button.addEventListener('click', goBack));
form.addEventListener('input', (event) => {
  if (!event.target.matches('input')) return;
  event.target.closest('.simChoiceGroup')?.classList.remove('isMissing');
  if (event.target.id === 'roofArea') {
    drawnRoofAreaM2 = 0;
    $('mapAreaOutput').textContent = event.target.value ? `${numberFormat(Number(event.target.value))} m² saisis` : 'Surface à repérer';
    $('roofMap').classList.remove('isMissing');
    $('areaError').hidden = true;
      updateProjectSummary();
  }
});
form.addEventListener('change', (event) => {
  event.target.closest('.simChoiceGroup')?.classList.remove('isMissing');
  if (event.target.name === 'usageMode') $('usageError').hidden = true;
  $('formError').hidden = true;
  updateProjectSummary();
  updatePanOrientation();
});
form.addEventListener('submit', (event) => {
  event.preventDefault();
  form.querySelector(`[data-step="${currentStep}"] [data-next]`)?.click();
});
$('restartButton').addEventListener('click', restart);
$('printEstimateButton').addEventListener('click', () => window.print());
$('retryEstimateButton').addEventListener('click', calculate);
updateUsableOutput();
updateSiteKind();
updatePresentation(1);

export { buildEstimateInput, roofAzimuth, estimateSolarCapacity, CR010_SIZING_VERSION };
