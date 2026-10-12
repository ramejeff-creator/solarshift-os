import { hasHouseNumber, normalizeSiteAddressSuggestion, siteAddressAutocompleteUrl } from './site-address.mjs';
import { CR010_SIZING_VERSION, estimateSolarCapacity, PRO_SIMULATOR_TILT_ANGLES, solarRoofPlanes } from './pro-simulator-estimation.mjs?v=20261012-7';
import { installRoofMapInteractions } from './roof-map-interactions.mjs?v=20261012-9';
import { projectTimingLabel, paybackWindow, carbonEquivalenceKm, formatGainRange } from './simulator-presentation.mjs?v=20261012-7';
import { requestSolarPreview } from './solar-preview-request.mjs?v=20261012-7';
import { resolveAnnualConsumption, resolveBuildingConsumptionBenchmark, resolveElectricityPrice, resolvePowerBand } from './prestudy-building-benchmarks.mjs';
import { findInvalidControl, qualificationErrorMessage } from './simulator-validation.mjs';

const $ = (id) => document.getElementById(id);
const form = $('simulatorForm');
form.querySelectorAll('input[name="usageMode"]').forEach((input) => { input.required = true; });
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
  5: ['Votre synthèse solaire', 'Estimation indicative de votre projet', 'Une première étape vers votre projet', 'Ces résultats sont des estimations. Une étude détaillée permettra de confirmer le potentiel et les économies.']
});

let currentStep = 1;
let selectedAddress = null;
let searchTimer = null;
let searchController = null;
let calculationController = null;
let calculationTimer = null;
let roofMap = null;
let roofMapShapes = null;
let roofDrawControl = null;
let roofMapLocationKey = null;
let mapSiteKind = null;
let roofOrientation = null;
let roofOrientationPicker = null;
let roofOrientationLine = null;
let drawnRoofAreaM2 = 0;
let roofInteractions = null;
const roofPreviews = new Map();

function selected(name) { return form.querySelector(`input[name="${name}"]:checked`); }
function selectedRoofType() { return selected('siteKind')?.value === 'land' ? 'canopy' : selected('roofType')?.value; }
function numberFormat(value, maximumFractionDigits = 0) {
  return Number(value).toLocaleString('fr-FR', { maximumFractionDigits, minimumFractionDigits: 0 }).replace(/[\u00a0\u202f]/g, ' ');
}
function showStep(step) {
  if (currentStep === 2 && step !== 2) { finishRoofOrientationPick(); roofInteractions?.finishCorrection(true); cancelRoofDetection(); }
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
  if (step === 2) window.setTimeout(() => { initRoofMap(); roofMap?.invalidateSize(); roofInteractions?.editLast(); }, 0);
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
  if (roofMap) roofMap.setView([suggestion.latitude, suggestion.longitude], 19);
  updateProjectSummary();
  clearSuggestions();
  setAddressStatus(typedHouseNumber && !suggestionHasNumber
    ? `La rue est localisée, mais le numéro ${typedHouseNumber} n’est pas confirmé par la base d’adresses. Vérifiez le bâtiment sur la carte à l’étape suivante.`
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
  const externalInstallationLabels = { parking: 'Ombrière photovoltaïque', terrain: 'Installation photovoltaïque au sol', agriculture: 'Structure agrivoltaïque' };
  const area = Number($('roofArea')?.value) || drawnRoofAreaM2;
  const siteKind = selected('siteKind')?.value;
  const usablePercent = Number($('usablePercent')?.value) || 65;
  const displayedArea = siteKind === 'building' ? area * usablePercent / 100 : area;
  const building = selected('buildingUse')?.value;
  const roof = selectedRoofType();
  const roofLabel = siteKind === 'land'
    ? externalInstallationLabels[selected('externalSurfaceType')?.value] || 'Installation à préciser'
    : roof === 'flat' ? 'Toit plat' : roof === 'pitched' ? `Toiture inclinée · ${selected('roofPans')?.value === 'two' ? '2 pans' : '1 pan'}` : 'À choisir';
  const siteLabel = siteKind === 'land' ? (externalSurfaceLabels[selected('externalSurfaceType')?.value] || 'Surface extérieure à choisir') : siteKind === 'building' ? (buildingLabels[building] || 'Type de bâtiment à choisir') : 'À choisir';
  const externalInstallation = externalInstallationLabels[selected('externalSurfaceType')?.value];
  $('externalInstallationSummary').hidden = siteKind !== 'land' || !externalInstallation;
  $('externalInstallationLabel').textContent = externalInstallation || 'À préciser';
  document.querySelectorAll('#summaryBuilding, [data-summary-building]').forEach((node) => { node.textContent = siteLabel; });
  document.querySelectorAll('#summaryRoof, [data-summary-roof]').forEach((node) => { node.textContent = roofLabel; });
  document.querySelectorAll('#summaryArea, [data-summary-area]').forEach((node) => { node.textContent = area >= 20 ? `${numberFormat(displayedArea)} m²` : 'À mesurer'; });
  document.querySelectorAll('[data-summary-building-art]').forEach((node) => { node.hidden = siteKind === 'land'; node.className = `simBuildingArt building-${building || 'offices'}`; });
  document.querySelectorAll('[data-summary-roof-art]').forEach((node) => { node.hidden = roof === 'canopy'; node.className = `simSolarArt solar-${roof || 'flat'}`; });
  const siteKindLabel = siteKind === 'land' ? 'Type de surface' : 'Type de bâtiment';
  const installationLabel = siteKind === 'land' ? 'Installation' : 'Type de toiture';
  const areaLabel = siteKind === 'land' ? 'Surface extérieure' : 'Surface exploitable estimée';
  $('summaryBuildingLabel').textContent = siteKindLabel;
  $('summaryAreaLabel').textContent = siteKind === 'land' ? `${areaLabel} tracée` : areaLabel;
  document.querySelectorAll('[data-summary-site-label]').forEach((node) => { node.textContent = siteKindLabel; });
  document.querySelectorAll('[data-summary-installation-label]').forEach((node) => { node.textContent = installationLabel; });
  document.querySelectorAll('[data-summary-area-label]').forEach((node) => { node.textContent = areaLabel; });
  $('summaryAdvice').textContent = siteKind === 'land'
    ? selected('externalSurfaceType')?.value === 'agriculture'
      ? 'La configuration agrivoltaïque dépendra de l’activité agricole et d’une étude dédiée.'
      : selected('externalSurfaceType')?.value === 'terrain'
        ? 'La puissance dépendra des surfaces équipables et des contraintes du terrain.'
        : 'La puissance de l’ombrière dépendra de son implantation et d’une étude dédiée.'
    : 'La pente et l’orientation sont des hypothèses techniques de pré-étude, à confirmer lors de l’étude du site.';
  updateRoofPreviews();
}

function updateBenchmarkContext() {
  const isBuilding = selected('siteKind')?.value === 'building';
  const buildingUse = selected('buildingUse')?.value;
  $('warehouseSubtypeLabel').hidden = !isBuilding || buildingUse !== 'logistics';
  $('industryScheduleLabel').hidden = !isBuilding || buildingUse !== 'industry';
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
  const buildingDetails = document.querySelector('.simBuildingDetails');
  const roofTypeGroup = document.querySelector('.simRoofTypeGroup');
  const externalInstallationSummary = $('externalInstallationSummary');
  if (buildingDetails) buildingDetails.hidden = !buildingPath;
  if (externalSurfaceGroup) externalSurfaceGroup.hidden = !externalPath;
  if (roofTypeGroup) roofTypeGroup.hidden = !buildingPath;
  if (externalInstallationSummary && !externalPath) externalInstallationSummary.hidden = true;
  document.querySelectorAll('input[name="buildingUse"]').forEach((input) => {
    input.disabled = !buildingPath;
    input.required = buildingPath;
    if (!buildingPath) input.checked = false;
  });
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
  updateBenchmarkContext();
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
    : 'Cliquez sur une toiture pour proposer son contour. Les poignées apparaissent directement : déplacez-les pour ajuster la surface. Vous pouvez aussi dessiner au polygone ou au rectangle.';
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
      preview.map.setView([location.latitude, location.longitude], 19, { animate: false });
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
    finishRoofOrientationPick(); roofOrientation = null;
    if (roofOrientationLine) { roofMap?.removeLayer(roofOrientationLine); roofOrientationLine = null; }
    $('orientationStatus').textContent = 'Non renseignée · hypothèse sud appliquée à l’estimation.';
    updateDrawnRoofArea();
  }
  roofMapLocationKey = locationKey;
  if (!roofMap) {
    roofMap = window.L.map(container, { scrollWheelZoom: false }).setView([location.latitude, location.longitude], 19);
    const satellite = window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles © Esri', maxZoom: 19
    });
    const plan = window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19
    });
    satellite.addTo(roofMap);
    window.L.control.layers({ Satellite: satellite, Plan: plan }, null, { position: 'topright' }).addTo(roofMap);
    roofMapShapes = window.L.featureGroup().addTo(roofMap);
    roofDrawControl = new window.L.Control.Draw({
      position: 'topleft',
      edit: { featureGroup: roofMapShapes, remove: true },
      draw: { polygon: { allowIntersection: false, showArea: true }, rectangle: true, polyline: false, circle: false, marker: false, circlemarker: false }
    });
    roofMap.addControl(roofDrawControl);
    // Anchor the status inside the actual map, not over the correction buttons below it.
    container.appendChild($('roofDetectionStatus'));
    roofInteractions = installRoofMapInteractions({
      map: roofMap, shapes: roofMapShapes, leaflet: window.L, drawControl: roofDrawControl, onChange: updateDrawnRoofArea,
      onStatus(message, kind) { $('roofDetectionStatus').textContent = message; $('roofDetectionStatus').dataset.kind = kind; },
      onEditing(active) { $('roofContourEditor').hidden = !active; }
    });
    roofInteractions.setFootprintDetectionEnabled(selected('siteKind')?.value === 'building');
  } else roofMap.setView([location.latitude, location.longitude], 19);
  window.setTimeout(() => roofMap.invalidateSize(), 80);
}
function nearestCompassLabel(azimuth) {
  const normalized = ((Number(azimuth) % 360) + 360) % 360;
  return Object.entries(azimuthLabels).map(([degree, label]) => ({ degree: Number(degree), label }))
    .reduce((best, item) => {
      const difference = Math.abs(((normalized - item.degree + 540) % 360) - 180);
      return difference < best.difference ? { difference, label: item.label } : best;
    }, { difference: Infinity, label: 'Sud' }).label;
}
function ridgePanOrientation(start, end, side = null) {
  const latitudeScale = Math.cos((start.lat + end.lat) / 2 * Math.PI / 180);
  const dx = (end.lng - start.lng) * latitudeScale, dy = end.lat - start.lat;
  if (dx === 0 && dy === 0) return null;
  // Local tangent bearing at the ridge midpoint: reversing the clicks gives exactly
  // the same pair of roof normals, without introducing a click-order bias.
  const normal = (Math.atan2(dx, dy) * 180 / Math.PI + 450) % 360;
  if (!side) return normal;
  const cross = dx * (side.lat - start.lat) - dy * (side.lng - start.lng) * latitudeScale;
  if (cross === 0) return null;
  return cross < 0 ? normal : (normal + 180) % 360;
}
function roofOrientationMessage() {
  if (roofOrientation == null) return 'Non renseignée · hypothèse sud appliquée à l’estimation.';
  const first = `${nearestCompassLabel(roofOrientation)} (${Math.round(roofOrientation)}°)`;
  return selected('roofPans')?.value === 'two'
    ? `Deux pans repérés : ${first} / ${nearestCompassLabel((roofOrientation + 180) % 360)} (${Math.round((roofOrientation + 180) % 360)}°).`
    : `${first} · pan à équiper repéré sur la carte.`;
}
function finishRoofOrientationPick(message = '', keepTrace = false) {
  if (!roofOrientationPicker) return;
  const previous = roofOrientationPicker;
  const container = roofMap.getContainer();
  container.removeEventListener('click', previous.handler, true);
  container.removeEventListener('mousemove', previous.moveHandler);
  previous.markers.forEach((marker) => roofMap.removeLayer(marker));
  if (!keepTrace) {
    if (previous.trace) roofMap.removeLayer(previous.trace);
    previous.previousLine?.addTo(roofMap);
    roofOrientationLine = previous.previousLine;
  }
  container.classList.remove('simPickingOrientation');
  if (previous.doubleClickZoomEnabled) roofMap.doubleClickZoom.enable();
  $('roofMapHint').lastElementChild.textContent = previous.hint;
  roofOrientationPicker = null;
  roofInteractions?.setSuspended(false);
  $('pickRoofOrientation').textContent = 'Repérer l’orientation sur la carte';
  $('orientationStatus').textContent = message || roofOrientationMessage();
  $('roofDetectionStatus').textContent = keepTrace
    ? 'Repérage terminé. Le contour est conservé ; cliquez dessus pour le modifier.'
    : 'Repérage annulé. Le contour et l’orientation précédente sont conservés.';
  $('roofDetectionStatus').dataset.kind = 'info';
}
function startRoofOrientationPick() {
  if (!roofMap) { $('orientationStatus').textContent = 'La carte doit être chargée avant le repérage.'; return; }
  if (roofOrientationPicker) { finishRoofOrientationPick(); return; }
  // Commit the current contour and suspend editing/detection before accepting orientation clicks.
  roofInteractions?.setSuspended(true);
  $('roofContourEditor').hidden = true;
  $('roofDetectionStatus').textContent = '';
  const container = roofMap.getContainer();
  const session = {
    start: null, end: null, trace: null, markers: [], previousLine: roofOrientationLine,
    hint: $('roofMapHint').lastElementChild.textContent,
    doubleClickZoomEnabled: Boolean(roofMap.doubleClickZoom?.enabled()),
    twoPans: selected('roofPans')?.value === 'two'
  };
  session.previousLine && roofMap.removeLayer(session.previousLine);
  roofMap.doubleClickZoom?.disable();
  const prompt = (message) => {
    $('orientationStatus').textContent = message;
    $('roofMapHint').lastElementChild.textContent = message;
  };
  const commit = (orientation) => {
    roofOrientation = orientation;
    roofOrientationLine = session.trace;
    session.trace.setStyle({ dashArray: null });
    finishRoofOrientationPick(roofOrientationMessage(), true);
  };
  session.moveHandler = (event) => {
    if (!session.start || session.end || event.target.closest?.('.leaflet-control')) return;
    session.trace.setLatLngs([session.start, roofMap.mouseEventToLatLng(event)]);
  };
  session.handler = (event) => {
    if (event.target.closest?.('.leaflet-control')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const point = roofMap.mouseEventToLatLng(event);
    if (!session.start) {
      session.start = point;
      session.markers.push(window.L.circleMarker(point, { radius: 6, color: '#d52b32', weight: 3, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(roofMap));
      session.trace = window.L.polyline([point, point], { color: '#d52b32', weight: 4, dashArray: '7 6', interactive: false }).addTo(roofMap);
      prompt('Cliquez sur l’autre extrémité de la ligne au sommet du toit (faîtage).');
      return;
    }
    if (!session.end) {
      if (ridgePanOrientation(session.start, point) == null) { prompt('Choisissez un deuxième point distinct, à l’autre extrémité du faîtage.'); return; }
      session.end = point;
      session.trace.setLatLngs([session.start, point]);
      session.markers.push(window.L.circleMarker(point, { radius: 6, color: '#d52b32', weight: 3, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(roofMap));
      if (session.twoPans) { commit(ridgePanOrientation(session.start, point)); return; }
      prompt('Faîtage repéré en rouge. Cliquez maintenant sur le pan de toiture à équiper, d’un côté de cette ligne.');
      return;
    }
    const orientation = ridgePanOrientation(session.start, session.end, point);
    if (orientation == null) { prompt('Cliquez à l’intérieur du pan à équiper, pas sur la ligne rouge du faîtage.'); return; }
    commit(orientation);
  };
  roofOrientationPicker = session;
  container.classList.add('simPickingOrientation');
  container.addEventListener('click', session.handler, true);
  container.addEventListener('mousemove', session.moveHandler);
  $('pickRoofOrientation').textContent = 'Annuler le repérage';
  prompt('Contour figé. Cliquez sur une extrémité de la ligne au sommet du toit (faîtage), puis sur l’autre. Échap pour annuler.');
  $('roofMap').scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    if (roofMap) roofMap.setView([latitude, longitude], 19);
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
  const invalid = findInvalidControl(section);
  section.querySelectorAll('.simChoiceGroup').forEach((group) => {
    const required = [...group.querySelectorAll('input[required]')];
    group.classList.toggle('isMissing', required.some((input) => input.willValidate && !input.checkValidity()));
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
  const invalid = findInvalidControl(section);
  section.querySelectorAll('.simChoiceGroup').forEach((group) => {
    const required = [...group.querySelectorAll('input[required]')];
    group.classList.toggle('isMissing', required.some((input) => input.willValidate && !input.checkValidity()));
  });
  if (invalid) {
    $('formError').textContent = qualificationErrorMessage(invalid);
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
  const twoPans = roofType === 'pitched' && selected('roofPans')?.value === 'two';
  const orientation = roofOrientation ?? 180;
  const orientationSource = roofOrientation == null ? 'default-south' : 'map-trace';
  const tiltBand = selected('tiltBand')?.value || '0-6';
  const grossArea = Number($('roofArea').value) || drawnRoofAreaM2;
  const usablePercent = Number($('usablePercent').value);
  const shade = selected('shade')?.value;
  const supported = ['flat', 'pitched'].includes(roofType);
  const sizing = supported ? estimateSolarCapacity({ roofType, orientation, tiltBand, grossArea, usablePercent }) : null;
  const planes = supported ? solarRoofPlanes({ roofType, roofPans: selected('roofPans')?.value, orientation }) : [];
  const buildingUse = selected('buildingUse')?.value || null;
  const warehouseSubtype = $('warehouseSubtype')?.value || 'unknown';
  const industrySchedule = $('industrySchedule')?.value || 'UNKNOWN';
  const buildingBenchmark = siteKind === 'building'
    ? resolveBuildingConsumptionBenchmark({ buildingUse, subtype: warehouseSubtype, industrySchedule, areaM2: grossArea })
    : null;
  const rawConsumption = $('annualConsumption').value.trim();
  const declaredConsumption = rawConsumption === '' ? null : Number(rawConsumption);
  const consumption = resolveAnnualConsumption({ declaredKwh: declaredConsumption, benchmark: buildingBenchmark });
  const exactPowerRaw = $('subscribedPowerKva')?.value.trim() || '';
  const power = resolvePowerBand({ buildingUse, selectedBand: $('subscribedPowerBand')?.value || '', exactKva: exactPowerRaw === '' ? null : Number(exactPowerRaw) });
  const rawPrice = $('avoidedElectricityPrice').value.trim();
  const declaredPrice = rawPrice === '' ? null : Number(rawPrice);
  const price = resolveElectricityPrice({ selectedBand: power.band, declaredEurPerKwh: declaredPrice, declaredBasis: $('electricityPriceBasis')?.value || 'HT' });
  const benchmarkPrice = resolveElectricityPrice({ selectedBand: power.band });
  const aciAvoidablePrice = benchmarkPrice.aciAvoidableCorridorEurPerKwh?.ref ?? null;
  $('consumptionBenchmarkNote').textContent = consumption.status === 'ASSUMPTION'
    ? 'Consommation estimée selon l’activité et l’emprise au sol mesurée sur la carte, à confirmer sur facture. Les étages ne sont pas pris en compte.'
    : 'La consommation déclarée reste prioritaire. Sans saisie, une activité et le contour cartographique permettent une estimation indicative.';
  $('powerBenchmarkNote').textContent = power.status === 'ASSUMPTION'
    ? `Tranche proposée selon le type de bâtiment : ${power.band.replaceAll('_', ' ')} · estimation à confirmer sur facture.`
    : 'La tranche choisie ou la puissance exacte reste déclarative et à confirmer sur facture.';
  $('priceBenchmarkNote').textContent = declaredPrice == null
    ? price.corridorEurPerKwh
      ? 'Un prix réseau indicatif sera utilisé en l’absence de prix déclaré. L’économie sur votre facture ne porte que sur la part évitable, à confirmer lors de l’étude.'
      : 'La puissance doit être renseignée ou estimée pour proposer un prix réseau indicatif.'
    : price.usableForHtEconomics
      ? `Prix total réseau déclaré : ${numberFormat(price.valueEurPerKwh, 3)} €/kWh HT. L’économie estimée ne porte que sur la part évitable de votre facture, à confirmer lors de l’étude.`
      : 'Prix TTC déclaré : conservé comme information, mais non injecté dans le calcul financier HT. La composante ACI reste distincte.';
  return {
    address: readLocation(), roofType, supported, orientation, orientationSource, orientations: planes.map((plane) => plane.orientation), planes, twoPans, aspect: orientation - 180,
    tilt: sizing ? PRO_SIMULATOR_TILT_ANGLES[tiltBand] : null,
    selectedTilt: sizing ? PRO_SIMULATOR_TILT_ANGLES[tiltBand] : null, tiltBand,
    grossArea, usablePercent, usableArea: sizing?.usableAreaM2 ?? grossArea * usablePercent / 100,
    shade, shadeFactor: shadeMultipliers[shade], density: sizing?.densityWcM2 ?? null,
    lowKwp: sizing?.lowKwp ?? null, referenceKwp: sizing?.referenceKwp ?? null, highKwp: sizing?.highKwp ?? null,
    moduleCount: sizing?.moduleCount ?? null, modulePowerWc: sizing?.modulePowerWc ?? null,
    sizingVersion: sizing?.version ?? null, layoutWarning: sizing?.layoutWarning ?? null,
    annualConsumption: consumption.valueKwh,
    consumption,
    buildingBenchmark,
    subscribedPower: power,
    electricityPrice: price,
    aciAvoidablePriceCorridor: benchmarkPrice.aciAvoidableCorridorEurPerKwh ?? null,
    avoidedElectricityPrice: aciAvoidablePrice,
    electricityPriceBasis: price.basis,
    usageMode: selected('usageMode')?.value || 'self-consumption',
    projectTiming: selected('projectTiming')?.value || 'unknown',
    siteKind,
    buildingUse,
    warehouseSubtype,
    industrySchedule,
    externalSurfaceType: selected('externalSurfaceType')?.value || null,
    material: selected('material')?.value || null
  };
}
function apiUrl(input, optimal = false, orientation = input.orientation) {
  const endpoint = window.SOLARSHIFT_CONFIG?.pvgisEndpoint;
  if (!endpoint) throw new Error('Le service de calcul solaire n’est pas configuré.');
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
      shade: input.shade,
      financial_preview: 1,
      usage_mode: input.usageMode === 'undecided' ? 'unspecified' : input.usageMode,
      site_kind: input.siteKind,
      ...(input.buildingUse ? { building_use: input.buildingUse } : {}),
      ...(input.externalSurfaceType ? { external_surface_type: input.externalSurfaceType } : {}),
      ...(input.annualConsumption != null ? { annual_consumption_kwh: input.annualConsumption } : {}),
      financial_model_version: '2026-10-12.1',
      ...(input.aciAvoidablePriceCorridor ? {
        avoided_electricity_price_low_eur_kwh: input.aciAvoidablePriceCorridor.low,
        avoided_electricity_price_high_eur_kwh: input.aciAvoidablePriceCorridor.high
      } : {}),
      ...(input.avoidedElectricityPrice != null ? { avoided_electricity_price_eur_kwh: input.avoidedElectricityPrice } : {})
    })
  };
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  return url.toString();
}
async function requestPvgis(input, signal, optimal = false, orientation = input.orientation) {
  return requestSolarPreview(apiUrl(input, optimal, orientation), { signal,
    onRetry: () => { $('resultStatus').textContent = 'Le service solaire est momentanément occupé. Nouvelle tentative automatique…'; }
  });
}
function renderResult(input, production = null) {
  const annual = production && input.referenceKwp != null ? Number(production.annual_kwh_kwc) * input.referenceKwp * input.shadeFactor : null;
  const carbonIntensityGPerKwh = 19.6; // RTE, Bilan électrique 2025: émissions directes moyennes de production.
  $('resultLocation').textContent = input.address.label;
  $('resultTiming').textContent = `Calendrier souhaité : ${projectTimingLabel(input.projectTiming)} · information déclarative.`;
  $('resultStatus').hidden = Boolean(production);
  if (production) $('resultStatus').dataset.kind = 'ready';
  $('resultContent').hidden = false;
  $('capacityRange').textContent = input.referenceKwp != null ? `${numberFormat(input.referenceKwp, 1)} kWc` : 'À compléter';
  $('capacityCorridor').textContent = input.lowKwp != null ? `Fourchette indicative : ${numberFormat(input.lowKwp, 1)}–${numberFormat(input.highKwp, 1)} kWc` : 'Modèle non disponible pour cette installation';
  $('annualProduction').textContent = annual != null ? `${numberFormat(annual / 1000, 1)} MWh/an` : 'À compléter';
  const consumptionKnown = input.annualConsumption != null && Number.isFinite(Number(input.annualConsumption));
  const consumptionCorridor = input.consumption?.status === 'ASSUMPTION' ? input.consumption.corridorKwh : null;
  $('resultConsumptionEstimate').textContent = consumptionKnown
    ? consumptionCorridor
      ? `${numberFormat(consumptionCorridor.low / 1000, 0)}–${numberFormat(consumptionCorridor.high / 1000, 0)} MWh/an`
      : `${numberFormat(Number(input.annualConsumption) / 1000, 1)} MWh/an`
    : 'À préciser';
  $('resultConsumptionEstimate').classList.toggle('simPendingValue', !consumptionKnown);
  $('resultConsumptionNote').textContent = consumptionCorridor
    ? `Consommation indicative · valeur centrale ${numberFormat(Number(input.annualConsumption) / 1000, 1)} MWh/an`
    : input.consumption?.status === 'DECLARED'
      ? 'Valeur déclarée · à confirmer sur facture'
      : 'Estimation selon le type et l’emprise du bâtiment';
  const budget = production?.installation_budget;
  const budgetReady = budget?.status === 'ASSUMPTION' && budget.scope === 'EQUIPMENT_AND_INSTALLATION'
    && ['CAPACITY_AND_INSTALLATION_TYPE_REFERENCE', 'CAPACITY_CORRIDOR_AT_FIXED_UNIT_COST'].includes(budget.rangeBasis)
    && [budget.lowEur, budget.referenceEur, budget.highEur].every((value) => typeof value === 'number' && Number.isFinite(value) && value > 0)
    && budget.lowEur <= budget.referenceEur && budget.referenceEur <= budget.highEur;
  const budgetRange = budgetReady
    ? `${numberFormat(Math.round(budget.referenceEur / 1000))} k€ · corridor ${numberFormat(Math.round(budget.lowEur / 1000))}–${numberFormat(Math.round(budget.highEur / 1000))} k€`
    : production ? 'À préciser' : 'En attente';
  $('resultInvestmentRange').textContent = budgetReady
    ? `${numberFormat(Math.round(budget.lowEur / 1000))}–${numberFormat(Math.round(budget.highEur / 1000))} k€`
    : production ? 'À préciser' : 'En attente';
  $('resultInvestmentRange').classList.toggle('simPendingValue', !budgetReady);
  $('resultUsableArea').textContent = `${numberFormat(input.usableArea)} m²`;
  const buildingLabels = { offices: 'Bureaux & tertiaire', logistics: 'Stockage & logistique', industry: 'Industrie & atelier', retail: 'Commerce & grande surface', public: 'Équipement public', other: 'Autre bâtiment professionnel' };
  const externalSurfaceLabels = { parking: 'Parking', terrain: 'Terrain', agriculture: 'Surface agricole' };
  const externalInstallationLabels = { parking: 'Ombrière photovoltaïque', terrain: 'Installation photovoltaïque au sol', agriculture: 'Structure agrivoltaïque' };
  $('resultBuildingUse').textContent = input.siteKind === 'land' ? externalSurfaceLabels[input.externalSurfaceType] || 'Surface extérieure à préciser' : buildingLabels[input.buildingUse] || 'À compléter';
  $('resultInstallationType').textContent = input.siteKind === 'land'
    ? externalInstallationLabels[input.externalSurfaceType] || 'Installation à préciser'
    : input.roofType === 'flat' ? 'Toit plat' : input.roofType === 'pitched' ? `Toiture inclinée${input.twoPans ? ' · 2 pans' : ' · 1 pan'}` : 'À compléter';
  $('resultOrientation').textContent = input.siteKind === 'land' ? 'À qualifier selon l’installation'
    : `${nearestCompassLabel(input.orientation)}${input.orientationSource === 'map-trace' ? ' · repérée sur la carte' : ' · hypothèse par défaut'}`;
  $('resultShade').textContent = input.shade === 'none' ? 'Aucun ou très faible · hypothèse' : input.shade === 'some' ? 'Quelques ombres · hypothèse' : input.shade === 'high' ? 'Ombres importantes · hypothèse' : 'À compléter';
  $('resultSpecificYield').textContent = production && input.siteKind !== 'land'
    ? `${numberFormat(Number(production.annual_kwh_kwc) * input.shadeFactor)} kWh/kWc/an · estimation indicative`
    : 'À calculer / qualifier';
  $('resultFinancialCapex').textContent = budgetReady ? budgetRange : 'À préciser';
  const financial = production?.financial_preview;
  const financialReady = financial?.status === 'ASSUMPTION';
  const lcoe = Number(financial?.lcoeEurPerKwh);
  $('resultSolarKwhCost').textContent = Number.isFinite(lcoe) && lcoe > 0 ? `${numberFormat(lcoe, 3)} €/kWh` : 'À préciser';
  $('resultSolarKwhCost').classList.toggle('simPendingValue', !(Number.isFinite(lcoe) && lcoe > 0));
  const irrPct = financial?.irrPct;
  const irrReady = financialReady && irrPct != null && Number.isFinite(Number(irrPct));
  $('resultIndicativeIrr').textContent = irrReady ? `${numberFormat(Number(irrPct), 1)} %` : 'À préciser';
  $('resultIndicativeIrr').classList.toggle('simPendingValue', !irrReady);
  $('resultPayback').textContent = paybackWindow(financial?.projection, financialReady);
  const yearOneAci = financial?.aciSavingsYear1Eur;
  $('resultAciSavings').textContent = yearOneAci != null && Number.isFinite(Number(yearOneAci))
    ? `${numberFormat(Number(yearOneAci))} €/an · facture évitée estimée`
    : financial?.annualAllocation?.aciCeilingKwh != null
      ? `${numberFormat(financial.annualAllocation.aciCeilingKwh)} kWh/an · valorisation à préciser`
      : 'À préciser : consommation annuelle requise';
  const yearOneAcc = financial?.potentialAccValueYear1Eur;
  $('resultAccPotential').textContent = yearOneAcc != null && Number.isFinite(Number(yearOneAcc))
    ? `${numberFormat(Number(yearOneAcc))} €/an · valorisation locale potentielle`
    : financial?.annualAllocation?.potentialAccKwh != null
      ? `${numberFormat(financial.annualAllocation.potentialAccKwh)} kWh/an · potentiel à valoriser`
      : 'À préciser : consommation annuelle requise';
  const annualOpex = financial?.annualOpexYear1Eur;
  $('resultAnnualOpex').textContent = annualOpex != null && Number.isFinite(Number(annualOpex)) ? `${numberFormat(Number(annualOpex))} €/an · estimation` : 'À préciser';
  const allocation = financial?.annualAllocation;
  const aciKwh = allocation?.aciCeilingKwh;
  const accKwh = allocation?.potentialAccKwh;
  const annualSavings = yearOneAci != null && yearOneAcc != null
    && Number.isFinite(Number(yearOneAci)) && Number.isFinite(Number(yearOneAcc))
    ? Number(yearOneAci) + Number(yearOneAcc) : null;
  const aciPriceCorridor = input.aciAvoidablePriceCorridor;
  const annualSavingsLow = financial?.scenarioCorridor?.annualSavingsYear1Eur?.low ?? annualSavings;
  const annualSavingsHigh = financial?.scenarioCorridor?.annualSavingsYear1Eur?.high ?? annualSavings;
  $('resultAnnualSavings').textContent = annualSavingsLow != null && annualSavingsHigh != null
    ? annualSavingsLow === annualSavingsHigh
      ? `${numberFormat(annualSavingsLow / 1000, 1)} k€/an`
      : `${numberFormat(annualSavingsLow / 1000, 1)}–${numberFormat(annualSavingsHigh / 1000, 1)} k€/an`
    : 'À préciser';
  $('resultAnnualSavings').classList.toggle('simPendingValue', annualSavings == null);
  // Old API responses remain usable as a reference point, never a fabricated range.
  const netGainLow = financial?.scenarioCorridor?.netGainsEur?.low ?? financial?.netGainsEur ?? null;
  const netGainHigh = financial?.scenarioCorridor?.netGainsEur?.high ?? financial?.netGainsEur ?? null;
  $('resultNetGain25Years').textContent = netGainLow != null && netGainHigh != null
    ? formatGainRange(Number(netGainLow), Number(netGainHigh)) : 'À préciser';
  $('resultNetGain25Years').classList.toggle('simPendingValue', netGainLow == null || netGainHigh == null);
  const gridPrice = input.electricityPrice;
  const gridCorridor = gridPrice?.corridorEurPerKwh;
  $('resultGridPrice').textContent = gridCorridor
    ? `${numberFormat(gridCorridor.low, 2)}–${numberFormat(gridCorridor.high, 2)} €/kWh HT`
    : gridPrice?.usableForHtEconomics && gridPrice.valueEurPerKwh != null
      ? `${numberFormat(Number(gridPrice.valueEurPerKwh), 3)} €/kWh HT` : 'À confirmer sur facture';
  const allocationKnown = annual != null && annual > 0 && aciKwh != null && Number.isFinite(Number(aciKwh));
  $('resultAciRate').textContent = allocationKnown && annual > 0
    ? `${numberFormat(Math.min(100, Number(aciKwh) / annual * 100), 1)} %` : 'À préciser';
  $('resultAccRate').textContent = allocationKnown && annual > 0 && accKwh != null && Number.isFinite(Number(accKwh))
    ? `${numberFormat(Math.min(100, Number(accKwh) / annual * 100), 1)} %` : 'À préciser';
  $('resultAciVolume').textContent = allocationKnown ? `${numberFormat(aciKwh)} kWh/an · plafond théorique` : '';
  $('resultAccVolume').textContent = allocationKnown && Number.isFinite(accKwh) ? `${numberFormat(accKwh)} kWh/an · potentiel` : '';
  $('resultCoverage').textContent = allocationKnown && input.annualConsumption > 0
    ? `Au maximum ${numberFormat(Math.min(100, Number(aciKwh) / input.annualConsumption * 100), 0)} % de votre consommation annuelle pourrait être couverte par le solaire. Ce plafond reste à confirmer avec un profil horaire.`
    : 'Un profil horaire permettra de préciser la part de votre consommation couverte par le solaire.';
  const surplusKwh = allocationKnown && accKwh != null && Number.isFinite(Number(accKwh))
    ? Math.max(0, annual - Number(aciKwh) - Number(accKwh)) : null;
  const allocationChart = $('resultAllocationChart');
  const aciShare = allocationKnown ? Math.min(100, Number(aciKwh) / annual * 100) : null;
  const accShare = allocationKnown && accKwh != null && Number.isFinite(Number(accKwh))
    ? Math.min(100 - aciShare, Number(accKwh) / annual * 100) : null;
  if (allocationChart) {
    allocationChart.style.setProperty('--aci-share', `${aciShare ?? 0}%`);
    allocationChart.style.setProperty('--acc-share', `${accShare ?? 0}%`);
    allocationChart.classList.toggle('isAvailable', aciShare != null && accShare != null);
    allocationChart.setAttribute('aria-label', allocationKnown
      ? `Répartition de la production PV : ACI ${numberFormat(aciShare, 1)} %, ACC potentielle ${numberFormat(accShare ?? 0, 1)} %. Consommation annuelle : ${numberFormat(input.annualConsumption)} kWh.`
      : 'Répartition de la production indisponible ; consommation et production à qualifier.');
  }
  $('resultSurplus').textContent = surplusKwh != null
    ? `${numberFormat(surplusKwh / 1000, 1)} MWh/an (${numberFormat(surplusKwh / annual * 100, 0)} % de la production) · potentiel` : 'À préciser';
  const carbonTonnes = annual != null && Number.isFinite(annual) ? annual * carbonIntensityGPerKwh / 1_000_000 : null;
  $('resultAnnualCarbon').textContent = carbonTonnes != null ? `${numberFormat(carbonTonnes, 1)} tCO₂e/an` : 'À préciser';
  $('resultAnnualCarbon').classList.toggle('simPendingValue', carbonTonnes == null);
  const equivalentKm = carbonEquivalenceKm(carbonTonnes);
  $('resultCarbonKm').textContent = equivalentKm == null ? 'À préciser' : `${numberFormat(equivalentKm)} km`;
  $('resultCarbonNote').textContent = 'Ordre de grandeur indicatif, sans bilan carbone détaillé ni prise en compte du cycle de vie de l’installation.';
  $('resultProjectionTitle').textContent = financialReady ? 'Projection propriétaire indicative disponible' : 'Votre rentabilité reste à préciser';
  $('resultProjectionSummary').textContent = financialReady
    ? netGainLow != null && netGainHigh != null
      ? `Gain net estimé après CAPEX : ${numberFormat(netGainLow / 1000)}–${numberFormat(netGainHigh / 1000)} k€ sur 25 ans. Projection indicative ; l’ACC reste un potentiel sans contrat confirmé.`
      : `Gain net estimé après CAPEX : ${numberFormat(Number(financial.netGainsEur) / 1000)} k€ sur 25 ans. Projection indicative, à confirmer avec un conseiller.`
    : financial?.reason === 'AVOIDED_TARIFF_REQUIRED'
      ? 'Le coût de production et le potentiel ACC sont estimés ; le tarif évité de votre facture est nécessaire pour calculer les gains et le TRI.'
      : 'Un conseiller pourra confirmer les flux avec un profil horaire et des devis.';
  const monthlyValues = Array.isArray(production?.monthly_kwh_kwc) && production.monthly_kwh_kwc.length === 12
    ? production.monthly_kwh_kwc.map((value) => Number(value) * input.referenceKwp * input.shadeFactor)
    : null;
  $('resultAnnualComparison').textContent = annual != null && input.annualConsumption > 0
    ? `${numberFormat(annual)} kWh/an de production estimée pour ${numberFormat(input.annualConsumption)} kWh/an consommés, soit ${numberFormat(annual / input.annualConsumption * 100, 0)} % en volume annuel.`
    : annual == null && input.annualConsumption > 0
      ? 'Production ou consommation insuffisante pour comparer les volumes annuels.'
      : 'Consommation annuelle non renseignée : comparaison indisponible.';
  if (input.consumption?.status === 'ASSUMPTION' && input.buildingBenchmark) {
    $('resultAnnualComparison').textContent += ' Consommation indicative, à confirmer sur facture ; les niveaux/étages ne sont pas pris en compte.';
  } else if (input.consumption?.status === 'DECLARED') {
    $('resultAnnualComparison').textContent += ' Consommation déclarée, à confirmer sur facture.';
  }
  const productionPanel = $('simProductionPanel');
  const monthlyChart = $('simMonthlyChart');
  monthlyChart.replaceChildren();
  $('simMonthlyAxis').replaceChildren();
  $('simMonthlyValues').replaceChildren();
  if (monthlyValues && monthlyValues.every(Number.isFinite) && input.siteKind !== 'land') {
    const maxMonthly = Math.max(...monthlyValues, 1);
    [1, .75, .5, .25, 0].forEach((fraction) => {
      const tick = document.createElement('span'); tick.textContent = numberFormat(maxMonthly * fraction / 1000, 1);
      $('simMonthlyAxis').append(tick);
    });
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
      const row = document.createElement('tr');
      const heading = document.createElement('th'); heading.scope = 'row'; heading.textContent = monthNames[index];
      const cell = document.createElement('td'); cell.textContent = numberFormat(value);
      row.append(heading, cell); $('simMonthlyValues').append(row);
    });
    productionPanel.hidden = false;
  } else {
    productionPanel.hidden = true;
  }
  $('resultRoofType').textContent = input.siteKind === 'land'
    ? `Type de surface : ${(externalSurfaceLabels[input.externalSurfaceType] || 'surface extérieure').toLowerCase()} · installation envisagée : ${(externalInstallationLabels[input.externalSurfaceType] || 'à préciser').toLowerCase()}.`
    : `Bâtiment : ${{ flat: 'toit plat', pitched: 'toiture inclinée' }[input.roofType] || 'à compléter'}.`;
  $('resultUsage').textContent = `Usage envisagé : ${{ 'self-consumption': 'autoconsommation', 'full-sale': 'vente totale', undecided: 'non décidé' }[input.usageMode] || 'à compléter'} · qualification indicative uniquement.`;
  updateRoofPreviews();
  $('simUnsupportedResult').hidden = input.supported;
}
function mapPvgisError(error) {
  if (error?.name === 'AbortError') return '';
  return error instanceof Error ? error.message : 'Le calcul n’a pas abouti. Vérifiez les données du site puis réessayez.';
}
function clearCalculationTimer() {
  if (calculationTimer !== null) window.clearInterval(calculationTimer);
  calculationTimer = null;
}
function setCalculationButtonLoading(loading) {
  const button = $('calculateButton');
  button.classList.toggle('isLoading', loading);
  if (loading) button.setAttribute('aria-busy', 'true');
  else button.removeAttribute('aria-busy');
  $('calculateSpinner').hidden = !loading;
  $('calculateLabel').textContent = loading ? 'Calcul en cours…' : 'Voir ma synthèse';
}
async function calculate(event) {
  event.preventDefault();
  let input;
  try { input = buildEstimateInput(); }
  catch (error) {
    $('usageError').textContent = error.message || 'Vérifiez les paramètres de votre estimation.';
    $('usageError').hidden = false;
    return;
  }
  if (!input.supported) {
    calculationController?.abort();
    clearCalculationTimer();
    setCalculationButtonLoading(false);
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
  clearCalculationTimer();
  setCalculationButtonLoading(false);
  calculationController = new AbortController();
  const controller = calculationController;
  const requestTimeoutMs = 45000;
  let requestTimedOut = false;
  const requestTimeout = window.setTimeout(() => {
    requestTimedOut = true;
    controller.abort();
  }, requestTimeoutMs);
  const calculationStartedAt = Date.now();
  const updateCalculationStatus = () => {
    if (controller.signal.aborted || calculationController !== controller) return;
    const elapsedSeconds = Math.floor((Date.now() - calculationStartedAt) / 1000);
    $('resultStatus').textContent = `Calcul solaire en cours… (${elapsedSeconds} s)`;
  };
  updateCalculationStatus();
  calculationTimer = window.setInterval(updateCalculationStatus, 1000);
  $('resultStatus').dataset.kind = 'loading';
  $('resultStatus').hidden = false;
  $('retryEstimateButton').hidden = true;
  $('calculateButton').disabled = true;
  setCalculationButtonLoading(true);
  try {
    showStep(5);
    renderResult(input);
    const production = await requestPvgis(input, controller.signal);
    if (controller.signal.aborted) return;
    renderResult(input, production);
  } catch (error) {
    if (controller.signal.aborted && !requestTimedOut) return;
    $('resultStatus').textContent = requestTimedOut
      ? 'Le calcul prend trop de temps. Vérifiez votre connexion puis réessayez.'
      : mapPvgisError(error);
    $('resultStatus').dataset.kind = 'error';
    $('resultStatus').hidden = false;
    $('retryEstimateButton').hidden = false;
  } finally {
    window.clearTimeout(requestTimeout);
    if (calculationController === controller) {
      clearCalculationTimer();
      setCalculationButtonLoading(false);
      $('calculateButton').disabled = false;
      calculationController = null;
    }
  }
}
function updateRoofSupport() {
  const supported = ['flat', 'pitched'].includes(selectedRoofType());
  const fields = document.querySelector('.simTechnicalFields');
  if (fields) fields.hidden = !supported;
  $('usableAreaGroup').hidden = !supported;
  $('usablePercent').disabled = !supported;
  document.querySelectorAll('[data-step="3"] .simTechnicalFields input').forEach((input) => { input.disabled = !supported; });
  $('unsupportedRoofNotice').hidden = supported;
  $('unsupportedQualificationNotice').hidden = supported;
}
function updateTiltLegend() {
  const roofType = selectedRoofType();
  const pitched = roofType === 'pitched';
  $('roofPitchGroup').hidden = !['flat', 'pitched'].includes(roofType);
  document.querySelectorAll('input[name="tiltBand"]').forEach((input) => { input.disabled = !pitched; });
  if (!pitched) document.querySelector('input[name="tiltBand"][value="0-6"]').checked = true;
  $('tiltLegend').textContent = pitched ? 'Inclinaison de la toiture' : 'Toit plat · inclinaison retenue par défaut';
  $('roofPitchHelp').textContent = pitched
    ? 'Choisissez la plage qui ressemble le plus à la pente du toit. Une estimation suffit.'
    : 'Pour votre toiture plate, l’estimation applique une faible inclinaison par défaut. Le choix des supports sera confirmé lors de l’étude.';
  $('tiltRecommendation').hidden = true;
}
function updatePanOrientation() {
  $('mapOrientationGroup').hidden = selected('siteKind')?.value !== 'building' || selectedRoofType() !== 'pitched';
  $('roofOrientationHelp').textContent = selected('roofPans')?.value === 'two'
    ? 'Cliquez aux deux extrémités de la ligne au sommet du toit (faîtage). Les orientations des deux pans seront déduites.'
    : 'Cliquez aux deux extrémités de la ligne au sommet du toit (faîtage), puis cliquez sur le pan à équiper.';
}
function updatePanChoice() { document.querySelector('.simPansGroup').hidden = selectedRoofType() !== 'pitched'; updateRoofSupport(); updateTiltLegend(); updatePanOrientation(); }
function updateUsableOutput() {
  $('usableOutput').textContent = `${$('usablePercent').value} %`;
  updateProjectSummary();
}
function goBack() {
  calculationController?.abort(); calculationController = null; clearCalculationTimer();
  setCalculationButtonLoading(false); $('calculateButton').disabled = false;
  if (currentStep > 1) showStep(currentStep - 1);
}
function restart() {
  calculationController?.abort(); calculationController = null; clearCalculationTimer(); setCalculationButtonLoading(false);
  cancelRoofDetection();
  form.reset();
  finishRoofOrientationPick(); roofOrientation = null;
  if (roofOrientationLine) { roofMap?.removeLayer(roofOrientationLine); roofOrientationLine = null; }
  $('orientationStatus').textContent = 'Non renseignée · hypothèse sud appliquée à l’estimation.';
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
$('pickRoofOrientation').addEventListener('click', startRoofOrientationPick);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && roofOrientationPicker) { event.preventDefault(); finishRoofOrientationPick(); return; }
  if (event.key === 'Escape' && !$('roofContourEditor').hidden) { event.preventDefault(); roofInteractions?.finishCorrection(false); }
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.simAddressField')) clearSuggestions();
});
$('latitude').addEventListener('input', () => { cancelRoofDetection(); selectedAddress = null; updateContinueLabel(); });
$('longitude').addEventListener('input', () => { cancelRoofDetection(); selectedAddress = null; updateContinueLabel(); });
$('usablePercent').addEventListener('input', updateUsableOutput);
form.querySelectorAll('input[name="siteKind"]').forEach((input) => input.addEventListener('change', () => {
  finishRoofOrientationPick(); roofOrientation = null;
  if (roofOrientationLine) { roofMap?.removeLayer(roofOrientationLine); roofOrientationLine = null; }
  $('orientationStatus').textContent = 'Non renseignée · hypothèse sud appliquée à l’estimation.';
  updateSiteKind();
}));
form.querySelectorAll('input[name="roofPans"]').forEach((input) => input.addEventListener('change', () => {
  // A one-pan selection must never reuse an arbitrary side inferred for two pans.
  finishRoofOrientationPick(); roofOrientation = null;
  if (roofOrientationLine) { roofMap?.removeLayer(roofOrientationLine); roofOrientationLine = null; }
  $('orientationStatus').textContent = roofOrientationMessage();
  updatePanOrientation();
}));
form.querySelectorAll('input[name="roofType"]').forEach((input) => input.addEventListener('change', updateTiltLegend));
form.querySelectorAll('input[name="roofType"]').forEach((input) => input.addEventListener('change', () => {
  finishRoofOrientationPick(); roofOrientation = null;
  if (roofOrientationLine) { roofMap?.removeLayer(roofOrientationLine); roofOrientationLine = null; }
  $('orientationStatus').textContent = 'Non renseignée · hypothèse sud appliquée à l’estimation.';
  updateTiltLegend(); updatePanChoice();
}));
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
  if (event.target.id === 'annualConsumption') $('formError').hidden = true;
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
  updateBenchmarkContext();
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
