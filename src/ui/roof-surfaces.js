(function () {
  'use strict';

  const configurations = new Map();
  const orientations = ['Sud', 'Sud-Est', 'Sud-Ouest', 'Est', 'Ouest', 'Nord-Est', 'Nord-Ouest', 'Nord'];
  const pitches = ['Faible pente', 'Pente moyenne', 'Forte pente'];

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
      if (!configurations.has(id)) configurations.set(id, { type: 'PITCHED', orientation: 'Sud', pitch: 'Faible pente' });
    });
    host.innerHTML = `<div class="roofSurfaceHeader"><div><b>Surfaces de toiture</b><p class="fine">Chaque zone ou pan conserve sa propre orientation et sa propre pente.</p></div><button type="button" class="action" id="addRoofSurface">+ Ajouter une surface</button></div>` +
      (current.length ? `<div class="roofSurfaceList">${current.map((layer, index) => {
        const id = L.stamp(layer), config = configurations.get(id);
        return `<article class="roofSurface" data-roof-id="${id}"><b>Surface ${index + 1} · ${area(layer).toLocaleString('fr-FR')} m²</b><div class="form"><label>Type<select data-roof-field="type"><option value="PITCHED"${config.type === 'PITCHED' ? ' selected' : ''}>Pan incliné</option><option value="FLAT"${config.type === 'FLAT' ? ' selected' : ''}>Toit plat</option></select></label><label>Orientation<select data-roof-field="orientation">${selectOptions(orientations, config.orientation)}</select></label><label class="roofPitch">Pente<select data-roof-field="pitch">${selectOptions(pitches, config.pitch)}</select></label></div><p class="fine roofSurfaceHelp">${config.type === 'FLAT' ? 'L’orientation et la pente concernent les supports photovoltaïques.' : 'Orientation et pente propres à ce pan de toiture.'}</p></article>`;
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
  }

  function boot() {
    if (!window.solarMap || !window.roofGroup) return;
    const style = document.createElement('style');
    style.textContent = '.roofSurfaceHeader{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:15px 0 8px}.roofSurfaceHeader p{margin:3px 0}.roofSurfaceList{display:grid;gap:10px}.roofSurface{border:1px solid #cfe0d5;border-radius:9px;padding:12px;background:#f7faf8}.roofSurface .form{margin-top:9px;grid-template-columns:repeat(3,1fr)}@media(max-width:760px){.roofSurfaceHeader{align-items:flex-start;flex-direction:column}.roofSurface .form{grid-template-columns:1fr}}';
    document.head.appendChild(style);
    window.addEventListener('ozeno:roof-surfaces', render);
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());
