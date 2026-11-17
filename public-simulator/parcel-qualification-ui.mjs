import { findSiteParcels, qualifyParcel, loadParcelSiteContext, restoreQualification, sitePoint, pointKey, safeSourceUrl, compactUrbanismItems, urbanismRelevance } from './parcel-qualification.mjs';
import { loadQualificationHorizon } from './qualification-horizon.mjs';
import { hasHouseNumber, isLocationOnlyLabel, nearbyAddressAssessment, normalizeReverseGeocodeResult, reverseGeocodeUrl } from './site-address.mjs?v=20261111-location-flow-5';

const el = (tag, text, cls) => { const n = document.createElement(tag); n.textContent = text || ''; if (cls) n.className = cls; return n; };
const number = n => n == null ? 'Non renseignée' : Number(n).toLocaleString('fr-FR');
const addressKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR').replace(/[^a-z0-9]+/g, ' ').trim();
const config = window.SOLARSHIFT_CONFIG || {};
const currentPoint = () => sitePoint(config.localProjectCoordinates || config.projectCoordinates);
let snapshot = null, candidate = null, controller, generation = 0, host, output, status, overlay, urbanismHost, addressLookupController, addressLookupGeneration = 0;
function infoTooltip(label, message) {
  const tooltip = el('span', '', 'parcelInfoTooltip'); tooltip.tabIndex = 0; tooltip.setAttribute('aria-label', label);
  const icon = el('span', 'i', 'parcelInfoTooltipIcon'); icon.setAttribute('aria-hidden', 'true');
  const text = el('span', message, 'parcelInfoTooltipText'); text.setAttribute('role', 'tooltip');
  tooltip.append(icon, text); return tooltip;
}
function link(label, url) {
  const a = el('a', label); a.href = safeSourceUrl(url) || 'https://www.geoportail-urbanisme.gouv.fr/'; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
}
function provenance(parent, source) {
  const p = el('p', '', 'parcelSource');
  const date = source.retrievedAt && !Number.isNaN(Date.parse(source.retrievedAt)) ? new Date(source.retrievedAt).toLocaleString('fr-FR') : 'date non renseignée';
  // Keep request URLs in the snapshot for traceability, never open API JSON in the user journey.
  const rawIgn = /^https:\/\/apicarto\.ign\.fr\/api\//.test(source.url || '');
  p.append(rawIgn ? el('span', (source.name || 'Cadastre IGN').replace('IGN API Carto · Cadastre', 'Cadastre IGN').replace('IGN API Carto', 'IGN')) : link(source.name || 'Source', source.url), document.createTextNode(` · consultée le ${date}`)); parent.append(p);
}
function clearOverlay() { overlay?.remove(); overlay = null; }
function showOverlay(feature) {
  clearOverlay();
  if (window.L && window.solarMap) overlay = window.L.geoJSON(feature, { style: { color: '#167766', weight: 3, fillOpacity: .06, dashArray: '6 4' }, interactive: false }).addTo(window.solarMap);
}
function changed() { window.dispatchEvent(new CustomEvent('ozeno:parcel-qualification-updated')); }
function stopPicking() {
  config.parcelLocationPickActive = false;
  window.solarMap?.getContainer?.().classList.remove('isPickingParcel');
}
function cancelSelection() {
  generation++; controller?.abort(); candidate = null; stopPicking(); clearOverlay(); render();
  if (snapshot?.parcel.geometry) showOverlay({ type: 'Feature', properties: {}, geometry: snapshot.parcel.geometry });
}
function reset() { generation++; controller?.abort(); addressLookupGeneration++; addressLookupController?.abort(); snapshot = null; candidate = null; stopPicking(); clearOverlay(); render(); }
function hasPostalAddress() {
  const reference = config.commercialAddressForLookup;
  if (config.manualLocationAddressFlow || config.addressLookupNeedsSelection || !reference || isLocationOnlyLabel(reference.label || reference.address)) return false;
  if (reference.precision === 'MANUAL_POSTAL_ADDRESS') return Boolean(reference.address && reference.postalCode && reference.city);
  const label = reference.label || reference.address || reference.streetAddress || '';
  const address = reference.address || reference.streetAddress || label;
  const number = String(reference.houseNumber || reference.housenumber || address.match(/^\s*(\d+\s*(?:bis|ter|[a-z])?)(?=\s|,|$)/i)?.[1] || '').trim();
  return Boolean(hasHouseNumber(address, number) && /\b\d{5}\b/.test(label) && (reference.city || /\b\d{5}\s+[^,]+/i.test(label)));
}
function parcelAddressProbePoints(value) {
  const points = [];
  const pin = sitePoint(value.point);
  if (pin) points.push(pin);
  const geometry = value.parcel?.geometry;
  const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates]
    : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
  for (const polygon of polygons) {
    const ring = polygon?.[0];
    if (!Array.isArray(ring) || !ring.length) continue;
    const [longitude, latitude] = ring.reduce((sum, coordinate) => [sum[0] + Number(coordinate[0]), sum[1] + Number(coordinate[1])], [0, 0]).map(number => number / ring.length);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) points.push({ latitude, longitude });
  }
  const seen = new Set();
  return points.filter(point => {
    const key = `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 3);
}
async function loadNearbyParcelAddresses(value, container, lookupId) {
  addressLookupController?.abort();
  addressLookupController = new AbortController();
  const signal = addressLookupController.signal;
  container.textContent = 'Recherche de repères d’adresse proches de la parcelle…';
  container.classList.add('isLoading'); container.setAttribute('aria-busy', 'true');
  status.textContent = 'Parcelle confirmée · recherche des adresses proches…';
  status.classList.add('isLoading'); status.setAttribute('aria-busy', 'true');
  const candidates = [];
  try {
    for (const point of parcelAddressProbePoints(value)) {
      const response = await fetch(reverseGeocodeUrl(point.latitude, point.longitude), { signal });
      if (!response.ok) continue;
      const normalized = normalizeReverseGeocodeResult(await response.json());
      if (!normalized || nearbyAddressAssessment(normalized, value.parcel).state === 'OTHER_COMMUNE') continue;
      const key = normalized.label.trim().toLocaleLowerCase('fr-FR');
      if (!candidates.some(item => item.label.trim().toLocaleLowerCase('fr-FR') === key)) candidates.push(normalized);
    }
    if (lookupId !== addressLookupGeneration || !container.isConnected || snapshot !== value) return;
    container.classList.remove('isLoading'); container.removeAttribute('aria-busy');
    status.classList.remove('isLoading'); status.removeAttribute('aria-busy');
    container.replaceChildren();
    const projectAddress = config.projectContextLoaded ? config.projectContext?.address : '';
    const originAddress = config.commercialAddressForLookup?.label || config.commercialAddressForLookup?.address || projectAddress;
    const originKey = addressKey(originAddress);
    const distinctCandidates = candidates.filter(address => addressKey(address.label) !== originKey);
    if (!distinctCandidates.length) {
      container.textContent = 'Aucune adresse proche exploitable n’a été renvoyée. Saisissez une adresse ou utilisez le repère sur la carte.';
      status.textContent = originKey && candidates.length
        ? 'Parcelle confirmée · les résultats ne distinguent pas l’adresse d’origine du projet. Saisissez l’adresse exacte du nouveau site pour la confirmer.'
        : 'Parcelle confirmée · aucune adresse proche trouvée. Saisissez l’adresse exacte du site.';
      return;
    }
    status.textContent = 'Parcelle confirmée · recherche terminée. Choisissez l’adresse qui correspond au site.';
    const lead = el('p', 'Adresses proches proposées autour du repère et de la parcelle. Choisissez celle qui correspond au site ; cette proximité ne prouve pas le rattachement au bâtiment ou au compteur.', 'parcelMuted');
    const list = el('div', '', 'parcelAddressSuggestions');
    for (const address of distinctCandidates) {
      const card = el('article', '', 'parcelAddressCandidate');
      card.append(el('strong', address.label));
      const button = el('button', 'Valider', 'parcelAddressSuggestion'); button.type = 'button';
      button.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('ozeno:parcel-address-suggestion-validated', { detail: address }));
        button.disabled = true; button.textContent = 'Adresse validée';
        container.replaceChildren(lead, card, el('p', 'Nouvelle adresse validée. Passage à l’étape suivante…', 'parcelAddressSelected'));
      });
      card.append(button); list.append(card);
    }
    container.append(lead, list);
  } catch {
    if (lookupId !== addressLookupGeneration || !container.isConnected || signal.aborted) return;
    container.classList.remove('isLoading'); container.removeAttribute('aria-busy');
    status.classList.remove('isLoading'); status.removeAttribute('aria-busy');
    status.textContent = 'Parcelle confirmée · recherche d’adresse indisponible. Réessayez ou saisissez une adresse connue.';
    container.textContent = 'La recherche d’adresse est indisponible pour le moment. Saisissez une adresse connue ou utilisez le repère sur la carte.';
  }
}
function renderNearbyParcelAddressSuggestions(value) {
  const wrap = el('section', '', 'parcelAddressLookup');
  wrap.append(el('strong', 'Adresse postale du site'));
  const content = el('div', '', 'parcelAddressLookupStatus');
  content.setAttribute('role', 'status'); content.setAttribute('aria-live', 'polite');
  const reference = config.commercialAddressForLookup;
  const project = config.projectContextLoaded ? config.projectContext : null;
  const currentAddress = reference && reference.precision !== 'REVERSE_GEOCODED_ADDRESS' && !isLocationOnlyLabel(reference.label || reference.address)
    ? { ...reference }
    : project?.address && !isLocationOnlyLabel(project.address)
      ? { label: project.address, address: project.address, city: project.city || '', postalCode: project.postal_code || '', cityCode: project.city_code || '' }
      : null;
  if (currentAddress?.label || currentAddress?.address) {
    const current = el('div', '', 'parcelCurrentAddress');
    const confirmedAddress = currentAddress.precision === 'USER_CONFIRMED_ADDRESS';
    current.append(el('span', confirmedAddress ? 'Adresse validée pour le site' : 'Adresse actuelle du projet', 'parcelAddressBadge'));
    current.append(el('strong', currentAddress.label || currentAddress.address));
    current.append(el('p', confirmedAddress
      ? 'Adresse sélectionnée et confirmée pour cette position.'
      : config.addressLookupNeedsSelection || config.manualLocationAddressFlow
        ? 'Adresse d’origine du dossier. Elle n’est pas confirmée pour la nouvelle position ni la nouvelle parcelle.'
        : 'Cette adresse décrit le dossier ; une nouvelle position doit être validée séparément.', 'parcelMuted'));
    wrap.append(current);
  }
  wrap.append(content); output.append(wrap);
  const lookupId = ++addressLookupGeneration;
  if (!hasPostalAddress()) void loadNearbyParcelAddresses(value, content, lookupId);
  else content.textContent = 'L’adresse actuelle est conservée. La position et la parcelle sont validées séparément.';
}
function renderUrbanism() {
  if (!urbanismHost) return;
  urbanismHost.replaceChildren();
  if (!snapshot) {
    urbanismHost.append(el('p', 'Confirmez une parcelle pour consulter les informations d’urbanisme disponibles.', 'parcelMuted'));
    return;
  }
  urbanismHost.append(el('p', 'Ces informations concernent la parcelle cadastrale entière, pas nécessairement le bâtiment ou la toiture visés.', 'parcelMuted'));
  urbanismHost.append(el('p', 'Tri indicatif : les zonages, prescriptions et servitudes sont à examiner en priorité. Les périmètres d’information sont classés selon leur intitulé ; ce repérage aide à cibler les pièces, sans remplacer la vérification du règlement applicable.', 'parcelTriageNote'));
  const details = el('details', '', 'parcelUrbanismDetails');
  details.append(el('summary', 'Consulter les informations disponibles'));
  const observations = snapshot.observations.filter(o => o.group === 'planning');
  if (!observations.length) details.append(el('p', 'Aucune donnée d’urbanisme disponible pour cette parcelle.', 'parcelMuted'));
  for (const observation of observations) {
    const row = el('div', '', 'parcelObservation'); row.append(el('strong', observation.name));
    if (observation.state !== 'AVAILABLE') row.append(el('p', 'Source indisponible : information non déterminée.', 'parcelWarning'));
    else if (!observation.items.length) row.append(el('p', 'Aucun objet renvoyé sur cette emprise par cette couche.', 'parcelMuted'));
    const items = compactUrbanismItems(observation.items).map(item => ({ ...item, relevance: urbanismRelevance(observation, item) }))
      .sort((a, b) => ({ review: 0, unknown: 1, context: 2 }[a.relevance.level] - { review: 0, unknown: 1, context: 2 }[b.relevance.level]));
    for (const item of items) {
      const card = el('div', '', `parcelUrbanismItem is-${item.relevance.level}`);
      const title = el('div', '', 'parcelUrbanismItemTitle'); title.append(el('strong', item.label), el('span', item.relevance.label, 'parcelRelevanceBadge'));
      if (item.count > 1) title.append(el('span', `${item.count} objets cartographiques regroupés`, 'parcelDuplicateCount'));
      card.append(title);
      if (item.description && item.description !== item.label) card.append(el('p', item.description));
      if (item.date) card.append(el('p', 'Date publiée : ' + item.date, 'parcelMuted'));
      card.append(el('p', item.relevance.reason, 'parcelMuted'));
      if (safeSourceUrl(item.documentUrl)) card.append(link('Consulter la pièce utile', item.documentUrl));
      row.append(card);
    }
    provenance(row, observation); details.append(row);
  }
  urbanismHost.append(details);
}
function render() {
  if (!host) return;
  output.replaceChildren();
  renderUrbanism();
  if (!snapshot) {
    addressLookupGeneration++; addressLookupController?.abort();
    status.classList.remove('isLoading'); status.removeAttribute('aria-busy');
    status.textContent = currentPoint()
      ? 'Recherche automatique de la parcelle…'
      : 'Repère géographique manquant. Recherchez ou saisissez l’adresse du site.';
    return;
  }
  if (!status.classList.contains('isLoading')) status.textContent = 'Parcelle confirmée · contexte indicatif à vérifier pour le projet.';
  const p = snapshot.parcel;
  const summary = el('div', '', 'parcelSummary');
  summary.append(el('strong', `Parcelle ${p.section} ${p.number}`), el('span', `${p.city || p.cityCode} · ${number(p.areaM2)} m² cadastraux`));
  output.append(summary);
  renderNearbyParcelAddressSuggestions(snapshot);
}
async function enrichSiteContext({ missingOnly = false } = {}) {
  if (!snapshot || !config.siteContextEndpoint) return;
  controller?.abort(); controller = new AbortController(); const signal = controller.signal, run = ++generation;
  const previous = snapshot;
  const active = () => generation === run && !signal.aborted && snapshot === previous && pointKey(snapshot.point) === pointKey(currentPoint());
  status.textContent = 'Consultation des risques, des réseaux et du relief PVGIS…';
  output.querySelectorAll('button').forEach(b => b.disabled = true);
  try {
    const working = structuredClone(previous);
    // Older saved qualifications may predate geometry persistence: recover only the confirmed parcel.
    if (!previous.parcel.geometry) {
      const cadastre = await findSiteParcels(previous.cadastre.lookupPoint || previous.point, { signal });
      if (!active()) return;
      const match = cadastre.data.find(f => f.properties.idu === previous.parcel.id);
      if (!match) throw new Error('Parcelle confirmée non retrouvée. Identifiez-la de nouveau pour consulter les sources.');
      working.parcel.geometry = match.geometry;
      working.cadastre = { ...working.cadastre, url: cadastre.url, retrievedAt: cadastre.retrievedAt };
    }
    const datasets = working.siteContext?.networks?.datasets || [];
    const contextComplete = working.siteContext?.state !== 'UNAVAILABLE' && datasets.length === 5
      && datasets.every(row => ['AVAILABLE', 'OUTSIDE_COVERAGE'].includes(row.state));
    const context = missingOnly && contextComplete ? working.siteContext : await loadParcelSiteContext(working, { signal, siteContextEndpoint: config.siteContextEndpoint });
    working.siteContext = context;
    const horizon = missingOnly && working.horizon?.state === 'AVAILABLE' ? working.horizon : await loadQualificationHorizon(working, { signal, endpoint: config.pvgisEndpoint });
    if (!active()) return;
    snapshot = { ...working, horizon }; render(); changed();
  } catch (error) { if (active()) { render(); status.textContent = error.message; } }
}
function previewCandidate(index = 0) {
  if (!candidate || pointKey(candidate.point) !== pointKey(currentPoint())) return;
  candidate.index = index;
  const { result } = candidate, feature = result.data[index];
  if (!feature) return;
  clearOverlay();
  if (window.L && window.solarMap) {
    overlay = window.L.geoJSON(result.data, {
      style: f => ({ color: f === feature ? '#176b58' : '#66788b', weight: f === feature ? 4 : 2, fillOpacity: f === feature ? .22 : .04 }),
      onEachFeature: (f, layer) => { layer.options.bubblingMouseEvents = false; layer.on('click', () => previewCandidate(result.data.indexOf(f))); }
    }).addTo(window.solarMap);
    const selectedLayer = window.L.geoJSON(feature);
    if (selectedLayer.getBounds().isValid()) window.solarMap.fitBounds(selectedLayer.getBounds(), { padding: [24, 24], maxZoom: 19 });
  }
  output.replaceChildren();
  status.textContent = candidate.origin === 'ADDRESS'
    ? 'Parcelle proposée à partir de l’adresse. Vérifiez le contour sur la carte, puis validez.'
    : 'Contour proposé sur la carte. Vérifiez qu’il correspond bien au site.';
  const p = feature.properties;
  const card = el('section', '', 'parcelCandidate'); card.setAttribute('aria-label', 'Emplacement sélectionné');
  card.append(el('strong', `Parcelle ${p.section || ''} ${p.numero || ''}`), el('p', `${p.nom_com || p.code_insee} · ${number(p.contenance)} m² cadastraux`));
  card.append(el('p', 'Vérifiez le contour sur la carte, puis validez.', 'parcelMuted'));
  const confirm = el('button', 'Confirmer la parcelle', 'action'); confirm.id = 'confirmSiteParcel'; confirm.type = 'button'; confirm.onclick = confirmCandidate; card.append(confirm); output.append(card);
  provenance(output, result);
}
async function confirmCandidate() {
  const selected = candidate;
  if (!selected || pointKey(selected.point) !== pointKey(currentPoint())) return;
  const feature = selected.result.data[selected.index];
  // Keep the confirmed parcel tied to the map pin selected before this confirmation.
  if (!currentPoint()) window.dispatchEvent(new CustomEvent('ozeno:map-site-selected', { detail: { ...selected.lookupPoint, manualPick: true } }));
  const point = currentPoint(); if (!point) return;
  controller?.abort(); controller = new AbortController(); const signal = controller.signal, run = ++generation;
  const active = () => generation === run && !signal.aborted && pointKey(point) === pointKey(currentPoint());
  candidate = null; snapshot = null; changed(); stopPicking(); showOverlay(feature);
  output.replaceChildren();
  status.textContent = 'Enregistrement de la parcelle et des informations du site…';
  try {
  const lookupMethod = selected.origin === 'ADDRESS' ? 'USER_ADDRESS_THEN_PARCEL_CONFIRMATION' : 'USER_MAP_POINT_THEN_PARCEL_CONFIRMATION';
    const next = await qualifyParcel(feature, point, { signal, cadastre: selected.result, lookupPoint: selected.lookupPoint, lookupMethod, siteContextEndpoint: config.siteContextEndpoint, pvgisEndpoint: config.pvgisEndpoint });
    if (!active()) return;
    snapshot = next; render(); changed();
    window.dispatchEvent(new CustomEvent('ozeno:parcel-qualification-confirmed', { detail: { parcelId: next.parcel.id } }));
  } catch (error) {
    if (active()) { clearOverlay(); status.textContent = error.message; }
  }
}
function beginSelection() {
  window.dispatchEvent(new CustomEvent('ozeno:site-map-mode-cancel'));
  output.replaceChildren(); clearOverlay();
  config.parcelLocationPickActive = true;
  status.textContent = 'Cliquez sur le bâtiment ou le terrain recherché. Vérifiez le contour proposé ; la parcelle actuelle reste confirmée jusqu’à votre choix.';
  window.solarMap?.getContainer?.().classList.add('isPickingParcel');
  const mapTarget = document.getElementById('prestudyLocationMapSlot')?.parentElement || window.solarMap?.getContainer?.();
  mapTarget?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}
async function identify(lookupPoint, origin = 'MAP') {
  lookupPoint = sitePoint(lookupPoint); if (!lookupPoint || (origin === 'MAP' && !config.parcelLocationPickActive)) return;
  const point = currentPoint();
  controller?.abort(); controller = new AbortController(); const signal = controller.signal, run = ++generation;
  const active = () => generation === run && !signal.aborted && pointKey(point) === pointKey(currentPoint());
  status.textContent = 'Recherche cadastrale…';
  candidate = null; clearOverlay(); output.replaceChildren();
  try {
    const result = await findSiteParcels(lookupPoint || point, { signal });
    if (!active()) return;
    output.replaceChildren();
    if (result.state !== 'AVAILABLE') { status.textContent = 'Le cadastre est indisponible. Réessayez ; aucune absence de parcelle n’est déduite.'; return; }
    candidate = null; clearOverlay();
    if (!result.data.length) { status.textContent = 'Aucune parcelle trouvée à cet endroit. Cliquez à l’intérieur du terrain, en dehors de la rue.'; return; }
    candidate = { result, point, lookupPoint, index: 0, origin }; previewCandidate();
  } catch (error) { if (active()) status.textContent = error.message; }
}
function autoIdentifyCurrentSite() {
  if (snapshot || candidate || config.manualLocationAddressFlow || config.manualLocationPickActive) return;
  const point = currentPoint();
  if (point) void identify(point, 'ADDRESS');
}

export function mountParcelQualification(parent) {
  if (host || !parent) return;
  const css = el('link'); css.id = 'ozenoParcelQualificationStyle'; css.rel = 'stylesheet'; css.href = './parcel-qualification.css?v=20261115-site-parcel-flow'; document.head.append(css);
  host = el('section', '', 'parcelQualification'); host.id = 'parcelQualification'; host.setAttribute('aria-labelledby', 'parcelQualificationTitle');
  const heading = el('h3', 'Parcelle du site'); heading.id = 'parcelQualificationTitle';
  heading.append(infoTooltip('À propos de la parcelle', 'La parcelle décrit le terrain entier, qui peut comprendre plusieurs bâtiments. Elle ne désigne ni un bâtiment précis ni son compteur électrique.'));
  status = el('p', '', 'parcelMuted'); status.id = 'parcelSelectionStatus'; status.setAttribute('role', 'status');
  output = el('div'); host.append(heading, el('p', 'La parcelle est recherchée automatiquement à partir de l’adresse ou du repère. Vérifiez son contour avant de la confirmer.'), status, output); parent.append(host);
  window.OzenoParcelQualification = {
    capture: () => pointKey(snapshot?.point) === pointKey(currentPoint()) && snapshot ? structuredClone(snapshot) : null,
    mountUrbanism(parent) {
      if (!parent) return;
      urbanismHost = parent;
      renderUrbanism();
    },
    refreshContext() { return enrichSiteContext(); },
    restore(value) {
      generation++; controller?.abort(); candidate = null; stopPicking(); clearOverlay(); snapshot = restoreQualification(value, currentPoint()); render();
      if (snapshot?.parcel.geometry && ['Polygon', 'MultiPolygon'].includes(snapshot.parcel.geometry.type)) showOverlay({ type: 'Feature', properties: {}, geometry: snapshot.parcel.geometry });
      // Project context is dispatched before this restore during dossier loading.
      // Notify dependent panels now so they render the restored parcel data too.
      changed();
      const networkRows = snapshot?.siteContext?.networks?.datasets || [];
      const contextNeedsRefresh = !snapshot?.siteContext || snapshot.siteContext.state === 'UNAVAILABLE'
        || networkRows.some(row => row.state === 'UNAVAILABLE');
      if (snapshot && (contextNeedsRefresh || snapshot.horizon?.state !== 'AVAILABLE')) void enrichSiteContext({ missingOnly: true });
      else if (!snapshot) setTimeout(autoIdentifyCurrentSite, 0);
    }
  };
  window.addEventListener('ozeno:parcel-map-click', event => { void identify(event.detail); });
  window.addEventListener('ozeno:parcel-address-resolved', event => { void identify(event.detail, 'ADDRESS'); });
  window.addEventListener('ozeno:site-map-mode-cancel', cancelSelection);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && (config.parcelLocationPickActive || candidate)) cancelSelection(); });
  for (const event of ['ozeno:site-location-updated', 'ozeno:site-address-confirmed', 'ozeno:project-context-loaded', 'ozeno:map-site-selected']) {
    window.addEventListener(event, () => {
      if (!snapshot || pointKey(snapshot.point) !== pointKey(currentPoint())) reset();
      if (event === 'ozeno:project-context-loaded' && !snapshot) setTimeout(autoIdentifyCurrentSite, 0);
    });
  }
  // Address typing invalidates the old qualification before a new suggestion is chosen.
  document.getElementById('newProjectAddress')?.addEventListener('input', event => { if (!event.target.dataset.suppressProjectDirty) reset(); });
  render();
  setTimeout(autoIdentifyCurrentSite, 0);
}
