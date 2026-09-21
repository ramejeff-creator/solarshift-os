(function () {
  'use strict';

  const configurations = new Map();
  const orientations = ['Sud', 'Sud-Est', 'Sud-Ouest', 'Est', 'Ouest', 'Nord-Est', 'Nord-Ouest', 'Nord'];
  const pitches = ['Faible pente', 'Pente moyenne', 'Forte pente'];
  const shades = ['Aucune ou très faible', 'Quelques ombres', 'Ombres importantes'];
  const aspects = { Sud: 0, 'Sud-Ouest': 45, Ouest: 90, 'Nord-Ouest': 135, Nord: 180, 'Nord-Est': -135, Est: -90, 'Sud-Est': -45 };
  const angles = { 'Faible pente': 15, 'Pente moyenne': 30, 'Forte pente': 45 };
  const shadeFactors = { 'Aucune ou très faible': 1, 'Quelques ombres': .92, 'Ombres importantes': .75 };
  const coordinates = { Muret: [43.49001, 1.34247], Lyon: [45.764, 4.835], Lille: [50.63, 3.057] };
  let calculationVersion = 0;
  let detectionActive = false;

  function area(layer) {
    const latlngs = layer.getLatLngs();
    const ring = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
    return Math.round(L.GeometryUtil.geodesicArea(ring));
  }

  function layers() {
    const result = [];
    window.roofGroup?.eachLayer((layer) => result.push(layer));
    return result;
  }

  function selectOptions(values, selected) {
    return values.map((value) => `<option${value === selected ? ' selected' : ''}>${value}</option>`).join('');
  }

  function render() {
    const host = document.getElementById('roofSurfaces');
    if (!host) return;
    const current = layers();
    const activeIds = new Set(current.map((layer) => L.stamp(layer)));
    [...configurations.keys()].filter((id) => !activeIds.has(id)).forEach((id) => configurations.delete(id));
    current.forEach((layer) => {
      const id = L.stamp(layer);
      if (!configurations.has(id)) configurations.set(id, { type: 'PITCHED', orientation: 'Sud', pitch: 'Faible pente', shade: 'Aucune ou très faible' });
    });
    host.innerHTML = `<div class="roofSurfaceHeader"><div><b>Surfaces de toiture</b><p class="fine">Détection assistée au clic, à confirmer visuellement. Le tracé manuel reste disponible dans la carte.</p></div><button type="button" class="action" id="detectRoof">${detectionActive ? 'Cliquez sur la toiture…' : '⌖ Détecter la toiture'}</button></div><p id="roofDetectionStatus" class="roofDetectionStatus fine" aria-live="polite"></p>` +
      (current.length ? `<div class="roofSurfaceList">${current.map((layer, index) => {
        const id = L.stamp(layer), config = configurations.get(id);
        return `<article class="roofSurface" data-roof-id="${id}"><div class="roofSurfaceTitle"><b>Surface ${index + 1} · ${area(layer).toLocaleString('fr-FR')} m²</b><button type="button" class="roofDelete" data-delete-roof="${id}" aria-label="Supprimer la surface ${index + 1}" title="Supprimer cette surface"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-1 11H8L7 9Zm3 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z"/></svg></button></div><div class="form"><label>Type<select data-roof-field="type"><option value="PITCHED"${config.type === 'PITCHED' ? ' selected' : ''}>Pan incliné</option><option value="FLAT"${config.type === 'FLAT' ? ' selected' : ''}>Toit plat</option></select></label><label>Orientation<select data-roof-field="orientation">${selectOptions(orientations, config.orientation)}</select></label><label class="roofPitch">Pente<select data-roof-field="pitch">${selectOptions(pitches, config.pitch)}</select></label><label>Ombrage<select data-roof-field="shade">${selectOptions(shades, config.shade)}</select></label></div><p class="fine roofSurfaceHelp">${config.type === 'FLAT' ? 'L’orientation et la pente concernent les supports photovoltaïques.' : 'Orientation et pente propres à ce pan de toiture.'}</p></article>`;
      }).join('')}</div>` : '<p class="result">Aucune surface tracée. Utilisez le bouton ci-dessus ou les outils de dessin sur la carte.</p>');
    document.getElementById('detectRoof')?.addEventListener('click', startRoofDetection);
    host.querySelectorAll('[data-roof-id]').forEach((card) => {
      const id = Number(card.dataset.roofId);
      card.querySelectorAll('[data-roof-field]').forEach((field) => field.addEventListener('change', () => {
        configurations.get(id)[field.dataset.roofField] = field.value;
        render();
      }));
      const flat = configurations.get(id).type === 'FLAT';
      card.querySelector('.roofPitch').firstChild.nodeValue = flat ? 'Pente des supports' : 'Pente du pan';
    });
    host.querySelectorAll('[data-delete-roof]').forEach((button) => button.addEventListener('click', () => removeSurface(Number(button.dataset.deleteRoof))));
    window.OzenoRoofSurfaces = { configurations, layers: current };
    synchronizeLegacyFields();
    calculateSynthesis();
  }

  function detectionStatus(message, state = '') {
    const node = document.getElementById('roofDetectionStatus');
    if (!node) return;
    node.textContent = message;
    node.dataset.state = state;
  }

  function finishDetection() {
    detectionActive = false;
    window.solarMap.off('click', detectAt);
    window.solarMap.getContainer().classList.remove('roofDetectionActive');
  }

  function geometryLayer(geometry) {
    if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) return null;
    const group = L.geoJSON(geometry, { style: { color: '#08734c', weight: 3, fillColor: '#54a378', fillOpacity: .22 } });
    const candidates = [];
    group.eachLayer((layer) => {
      if (layer.getLatLngs) candidates.push(layer);
    });
    return candidates.sort((a, b) => area(b) - area(a))[0] || null;
  }

  function containsPoint(points, lat, lng) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].lon, yi = points[i].lat, xj = points[j].lon, yj = points[j].lat;
      const crosses = ((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi) / ((yj - yi) || Number.EPSILON)) + xi);
      if (crosses) inside = !inside;
    }
    return inside;
  }

  async function buildingLayerNear(lat, lng) {
    const query = `[out:json][timeout:15];way(around:80,${lat},${lng})["building"];out geom;`;
    const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error('empreintes indisponibles');
    const payload = await response.json();
    const buildings = (payload.elements || []).filter((item) => item.type === 'way' && item.geometry?.length >= 4);
    if (!buildings.length) return null;
    const ranked = buildings.map((item) => {
      const center = item.geometry.reduce((sum, point) => ({ lat: sum.lat + point.lat, lon: sum.lon + point.lon }), { lat: 0, lon: 0 });
      center.lat /= item.geometry.length;
      center.lon /= item.geometry.length;
      return { item, contains: containsPoint(item.geometry, lat, lng), distance: Math.hypot(center.lat - lat, center.lon - lng) };
    }).sort((a, b) => Number(b.contains) - Number(a.contains) || a.distance - b.distance);
    const selected = ranked[0];
    if (!selected.contains && selected.distance > .0012) return null;
    return L.polygon(selected.item.geometry.map((point) => [point.lat, point.lon]), { color: '#08734c', weight: 3, fillColor: '#54a378', fillOpacity: .22 });
  }

  async function detectAt(event) {
    detectionStatus('Recherche du contour du bâtiment…', 'loading');
    try {
      const { lat, lng } = event.latlng;
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&polygon_geojson=1&addressdetails=0`;
      let layer = null;
      try {
        const response = await fetch(url, { headers: { 'Accept-Language': 'fr' } });
        if (response.ok) layer = geometryLayer((await response.json()).geojson);
      } catch { /* La recherche directe de bâtiments prend le relais. */ }
      if (!layer || area(layer) < 8 || area(layer) > 100000) layer = await buildingLayerNear(lat, lng);
      const detectedArea = layer ? area(layer) : 0;
      if (!layer || detectedArea < 8 || detectedArea > 100000) throw new Error('contour non disponible');
      window.roofGroup.addLayer(layer);
      const total = layers().reduce((sum, item) => sum + area(item), 0);
      const input = document.getElementById('roofTotal');
      if (input) { input.value = Math.round(total); input.dispatchEvent(new Event('input')); }
      window.dispatchEvent(new CustomEvent('ozeno:roof-surfaces'));
      window.solarMap.fitBounds(layer.getBounds(), { padding: [24, 24], maxZoom: 19 });
      detectionStatus(`Contour OpenStreetMap proposé : ${detectedArea.toLocaleString('fr-FR')} m². Vérifiez-le puis corrigez-le avec l’outil d’édition si nécessaire.`, 'success');
    } catch {
      detectionStatus('Aucun contour fiable trouvé ici. Utilisez l’outil de tracé manuel sur la carte.', 'error');
    } finally {
      finishDetection();
      renderDetectionButton();
    }
  }

  function renderDetectionButton() {
    const button = document.getElementById('detectRoof');
    if (button) button.textContent = detectionActive ? 'Cliquez sur la toiture…' : '⌖ Détecter la toiture';
  }

  function startRoofDetection() {
    if (detectionActive) {
      finishDetection();
      renderDetectionButton();
      detectionStatus('Détection annulée.');
      return;
    }
    detectionActive = true;
    window.solarMap.getContainer().classList.add('roofDetectionActive');
    renderDetectionButton();
    detectionStatus('Cliquez au centre de la toiture à détecter.', 'loading');
    window.solarMap.once('click', detectAt);
  }

  function removeSurface(id) {
    const layer = layers().find((item) => L.stamp(item) === id);
    if (layer) window.roofGroup.removeLayer(layer);
    configurations.delete(id);
    const total = layers().reduce((sum, item) => sum + area(item), 0);
    const input = document.getElementById('roofTotal');
    if (input) { input.value = total ? Math.round(total) : ''; input.dispatchEvent(new Event('input')); }
    render();
  }

  function synchronizeLegacyFields() {
    const first = configurations.values().next().value;
    if (!first) return;
    const values = { orientation: first.orientation, tilt: first.type === 'FLAT' ? 'Toit plat' : first.pitch, shade: first.shade };
    Object.entries(values).forEach(([id, value]) => { const field = document.getElementById(id); if (field) field.value = value; });
  }

  function projectCoordinates() {
    const address = document.getElementById('dashAddress')?.textContent || '';
    return Object.entries(coordinates).find(([city]) => address.includes(city))?.[1] || coordinates.Muret;
  }

  async function calculateSynthesis() {
    const version = ++calculationVersion;
    const current = layers();
    const ratio = Number(document.getElementById('roofRatio')?.value || 0) / 100;
    const panelArea = Number(document.getElementById('panelArea')?.value || 0);
    const panelWp = Number(document.getElementById('panelWp')?.value || 0);
    const manualSurface = Number(document.getElementById('roofTotal')?.value || 0);
    const usable = (current.length ? current.reduce((sum, layer) => sum + area(layer), 0) : manualSurface) * ratio;
    const capacity = panelArea > 0 ? Math.floor(usable / panelArea) * panelWp / 1000 : 0;
    let annualProduction = 0;
    if (capacity > 0 && current.length) {
      const [lat, lon] = projectCoordinates();
      const usableTotal = Math.max(usable, 1);
      const results = await Promise.all(current.map(async (layer) => {
        const config = configurations.get(L.stamp(layer));
        const surfaceCapacity = capacity * (area(layer) * ratio / usableTotal);
        try {
          const angle = config.type === 'FLAT' ? 10 : angles[config.pitch];
          const response = await fetch(`https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=${lat}&lon=${lon}&peakpower=1&loss=14&angle=${angle}&aspect=${aspects[config.orientation]}&outputformat=json`);
          const payload = await response.json();
          return Number(payload.outputs?.totals?.fixed?.E_y || 0) * shadeFactors[config.shade] * surfaceCapacity;
        } catch { return 0; }
      }));
      annualProduction = results.reduce((sum, value) => sum + value, 0);
    } else if (capacity > 0) {
      const yieldText = document.getElementById('dashPerformance')?.textContent || '';
      const referenceYield = Number(yieldText.replace(/\s/g, '').match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(',', '.') || 0);
      annualProduction = referenceYield * capacity;
    }
    if (version !== calculationVersion) return;
    const set = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = value; };
    set('terrainUsable', usable ? `${Math.round(usable).toLocaleString('fr-FR')} m²` : 'À calculer');
    set('terrainCapacity', capacity ? `${capacity.toFixed(1).replace('.', ',')} kWc` : 'À calculer');
    set('terrainProduction', annualProduction ? `${Math.round(annualProduction).toLocaleString('fr-FR')} kWh/an` : 'À calculer');
    set('roofCapacity', capacity ? `${capacity.toFixed(1).replace('.', ',')} kWc` : 'À calculer');
    set('roofAnnual', annualProduction ? `${Math.round(annualProduction).toLocaleString('fr-FR')} kWh/an` : 'À calculer');
    set('dashCapacity', capacity ? `${capacity.toFixed(1).replace('.', ',')} kWc` : 'À calculer');
    const capexPerKwp = Number(document.getElementById('capexPerKwp')?.value || 0);
    const capex = document.getElementById('capex');
    if (capex && capacity && capexPerKwp) { capex.value = Math.round(capacity * capexPerKwp); capex.dispatchEvent(new Event('input')); }
    const surfaceInput = document.getElementById('surface'); if (surfaceInput) surfaceInput.value = Math.round(usable) || '';
    const annualInput = document.getElementById('annual'); if (annualInput && annualProduction) { annualInput.value = Math.round(annualProduction); annualInput.dispatchEvent(new Event('input')); }
  }

  function installTerrainSummary() {
    const terrain = document.getElementById('audit-solar');
    if (!terrain || document.getElementById('terrainRoofSummary')) return;
    ['surface', 'orientation', 'tilt', 'shade'].forEach((id) => document.getElementById(id)?.closest('label')?.setAttribute('hidden', 'hidden'));
    const roofState = document.getElementById('roof')?.closest('label');
    const roofForm = document.querySelector('#audit-roof > .form');
    if (roofState && roofForm) {
      roofState.removeAttribute('hidden');
      roofForm.appendChild(roofState);
    }
    if (roofForm && !document.getElementById('capexPerKwp')) {
      const cost = document.createElement('label');
      cost.innerHTML = 'Coût indicatif par kWc (€)<input id="capexPerKwp" type="number" min="0" step="10" value="900"><small class="fine">Hypothèse modifiable utilisée pour recalculer automatiquement le CAPEX.</small>';
      roofForm.appendChild(cost);
    }
    const summary = document.createElement('div');
    summary.id = 'terrainRoofSummary';
    summary.innerHTML = '<h3>Synthèse toiture</h3><p class="fine">Calcul consolidé à partir de toutes les surfaces qualifiées ci-dessus.</p><div class="metrics"><div class="metric"><b>Surface exploitable totale</b><span id="terrainUsable">À calculer</span></div><div class="metric"><b>Puissance installée totale</b><span id="terrainCapacity">À calculer</span></div><div class="metric"><b>Production annuelle moyenne</b><span id="terrainProduction">À calculer</span></div></div>';
    terrain.querySelector('.form')?.insertAdjacentElement('beforebegin', summary);
  }

  function boot() {
    if (!window.solarMap || !window.roofGroup) return;
    const style = document.createElement('style');
    style.textContent = '.roofSurfaceHeader,.roofSurfaceTitle{display:flex;justify-content:space-between;align-items:center;gap:12px}.roofSurfaceHeader{margin:15px 0 5px}.roofSurfaceHeader p{margin:3px 0}.roofDetectionStatus{min-height:18px;margin:0 0 8px}.roofDetectionStatus[data-state="success"]{color:#08734c}.roofDetectionStatus[data-state="error"]{color:#7d201b}.roofDetectionActive{cursor:crosshair}.roofSurfaceList{display:grid;gap:10px}.roofSurface{border:1px solid #cfe0d5;border-radius:9px;padding:12px;background:#f7faf8}.roofSurface .form{margin-top:9px;grid-template-columns:repeat(4,1fr)}.roofDelete{display:grid;place-items:center;width:36px;height:36px;flex:0 0 36px;border:1px solid #d6a4a0;background:#fff;color:#7d201b;border-radius:8px;padding:7px;cursor:pointer}.roofDelete:hover,.roofDelete:focus-visible{background:#fff0ef;border-color:#b84a43;outline:2px solid #b84a4333}.roofDelete svg{display:block;width:20px;height:20px;fill:currentColor}#terrainRoofSummary{margin:12px 0 18px}#terrainRoofSummary .metrics{grid-template-columns:repeat(3,1fr)}@media(max-width:760px){.roofSurfaceHeader{align-items:stretch;flex-direction:column}.roofSurfaceHeader .action{margin-top:4px}.roofSurfaceTitle{align-items:center;flex-direction:row}.roofSurface .form,#terrainRoofSummary .metrics{grid-template-columns:1fr}.leaflet-draw-actions{max-width:calc(100vw - 115px);display:flex;flex-wrap:wrap}.leaflet-draw-actions a{white-space:nowrap}}';
    document.head.appendChild(style);
    installTerrainSummary();
    window.addEventListener('ozeno:roof-surfaces', render);
    ['roofTotal', 'roofRatio', 'panelArea', 'panelWp', 'capexPerKwp'].forEach((id) => document.getElementById(id)?.addEventListener('input', calculateSynthesis));
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());
