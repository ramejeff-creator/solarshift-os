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
    host.innerHTML = `<div class="roofSurfaceHeader"><div><b>Surfaces de toiture</b><p class="fine">Chaque zone ou pan conserve sa propre orientation et sa propre pente.</p></div><button type="button" class="action" id="addRoofSurface">+ Ajouter une surface</button></div>` +
      (current.length ? `<div class="roofSurfaceList">${current.map((layer, index) => {
        const id = L.stamp(layer), config = configurations.get(id);
        return `<article class="roofSurface" data-roof-id="${id}"><b>Surface ${index + 1} · ${area(layer).toLocaleString('fr-FR')} m²</b><div class="form"><label>Type<select data-roof-field="type"><option value="PITCHED"${config.type === 'PITCHED' ? ' selected' : ''}>Pan incliné</option><option value="FLAT"${config.type === 'FLAT' ? ' selected' : ''}>Toit plat</option></select></label><label>Orientation<select data-roof-field="orientation">${selectOptions(orientations, config.orientation)}</select></label><label class="roofPitch">Pente<select data-roof-field="pitch">${selectOptions(pitches, config.pitch)}</select></label><label>Ombrage<select data-roof-field="shade">${selectOptions(shades, config.shade)}</select></label></div><p class="fine roofSurfaceHelp">${config.type === 'FLAT' ? 'L’orientation et la pente concernent les supports photovoltaïques.' : 'Orientation et pente propres à ce pan de toiture.'}</p></article>`;
      }).join('')}</div>` : '<p class="result">Aucune surface tracée. Utilisez le bouton ci-dessus ou les outils de dessin sur la carte.</p>');
    document.getElementById('addRoofSurface')?.addEventListener('click', () => new L.Draw.Polygon(window.solarMap, { allowIntersection: false }).enable());
    host.querySelectorAll('[data-roof-id]').forEach((card) => {
      const id = Number(card.dataset.roofId);
      card.querySelectorAll('[data-roof-field]').forEach((field) => field.addEventListener('change', () => {
        configurations.get(id)[field.dataset.roofField] = field.value;
        render();
      }));
      const flat = configurations.get(id).type === 'FLAT';
      card.querySelector('.roofPitch').firstChild.nodeValue = flat ? 'Pente des supports' : 'Pente du pan';
    });
    window.OzenoRoofSurfaces = { configurations, layers: current };
    synchronizeLegacyFields();
    calculateSynthesis();
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
    const usable = current.reduce((sum, layer) => sum + area(layer) * ratio, 0);
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
    }
    if (version !== calculationVersion) return;
    const set = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = value; };
    set('terrainUsable', usable ? `${Math.round(usable).toLocaleString('fr-FR')} m²` : 'À calculer');
    set('terrainCapacity', capacity ? `${capacity.toFixed(1).replace('.', ',')} kWc` : 'À calculer');
    set('terrainProduction', annualProduction ? `${Math.round(annualProduction).toLocaleString('fr-FR')} kWh/an` : 'À calculer');
    set('roofCapacity', capacity ? `${capacity.toFixed(1).replace('.', ',')} kWc` : 'À calculer');
    set('roofAnnual', annualProduction ? `${Math.round(annualProduction).toLocaleString('fr-FR')} kWh/an` : 'À calculer');
    set('dashCapacity', capacity ? `${capacity.toFixed(1).replace('.', ',')} kWc` : 'À calculer');
    const surfaceInput = document.getElementById('surface'); if (surfaceInput) surfaceInput.value = Math.round(usable) || '';
    const annualInput = document.getElementById('annual'); if (annualInput && annualProduction) { annualInput.value = Math.round(annualProduction); annualInput.dispatchEvent(new Event('input')); }
  }

  function installTerrainSummary() {
    const terrain = document.getElementById('audit-solar');
    if (!terrain || document.getElementById('terrainRoofSummary')) return;
    ['surface', 'orientation', 'tilt', 'shade'].forEach((id) => document.getElementById(id)?.closest('label')?.setAttribute('hidden', 'hidden'));
    const summary = document.createElement('div');
    summary.id = 'terrainRoofSummary';
    summary.innerHTML = '<h3>Synthèse toiture</h3><p class="fine">Calcul consolidé à partir de toutes les surfaces qualifiées ci-dessus.</p><div class="metrics"><div class="metric"><b>Surface exploitable totale</b><span id="terrainUsable">À calculer</span></div><div class="metric"><b>Puissance installée totale</b><span id="terrainCapacity">À calculer</span></div><div class="metric"><b>Production annuelle moyenne</b><span id="terrainProduction">À calculer</span></div></div>';
    terrain.querySelector('.form')?.insertAdjacentElement('beforebegin', summary);
  }

  function boot() {
    if (!window.solarMap || !window.roofGroup) return;
    const style = document.createElement('style');
    style.textContent = '.roofSurfaceHeader{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:15px 0 8px}.roofSurfaceHeader p{margin:3px 0}.roofSurfaceList{display:grid;gap:10px}.roofSurface{border:1px solid #cfe0d5;border-radius:9px;padding:12px;background:#f7faf8}.roofSurface .form{margin-top:9px;grid-template-columns:repeat(4,1fr)}#terrainRoofSummary{margin:12px 0 18px}#terrainRoofSummary .metrics{grid-template-columns:repeat(3,1fr)}@media(max-width:760px){.roofSurfaceHeader{align-items:flex-start;flex-direction:column}.roofSurface .form,#terrainRoofSummary .metrics{grid-template-columns:1fr}}';
    document.head.appendChild(style);
    installTerrainSummary();
    window.addEventListener('ozeno:roof-surfaces', render);
    ['roofRatio', 'panelArea', 'panelWp'].forEach((id) => document.getElementById(id)?.addEventListener('input', calculateSynthesis));
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());
