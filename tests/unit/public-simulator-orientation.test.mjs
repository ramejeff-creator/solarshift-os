import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { installRoofMapInteractions } from '../../public-simulator/roof-map-interactions.mjs';
import { solarRoofPlanes } from '../../public-simulator/pro-simulator-estimation.mjs';

const source = readFileSync(new URL('../../public-simulator/pro-simulator.mjs', import.meta.url), 'utf8');
function emitter(extra = {}) {
  const listeners = new Map();
  return Object.assign({ on(names, handler) { names.split(' ').forEach(name => listeners.set(name, [...(listeners.get(name) || []), handler])); },
    async fire(name, event = {}) { for (const handler of listeners.get(name) || []) await handler(event); } }, extra);
}
function setup({ twoPans = true, fetchFootprints, drawControl } = {}) {
  const nodes = new Map(['roofContourEditor', 'roofDetectionStatus', 'orientationStatus', 'roofMapHint', 'pickRoofOrientation'].map(id => [id, {
    hidden: false, textContent: '', dataset: {}, lastElementChild: { textContent: 'Déplacez les poignées pour corriger le contour.' }
  }]));
  const classes = new Set(), handlers = new Map(), plotted = new Set();
  const container = { classList: { add: v => classes.add(v), remove: v => classes.delete(v) },
    addEventListener(name, handler) { handlers.set(name, handler); }, removeEventListener(name) { handlers.delete(name); }, scrollIntoView() {} };
  nodes.set('roofMap', container);
  const map = emitter({ getContainer: () => container, fitBounds() {}, mouseEventToLatLng: event => event.point,
    removeLayer: layer => plotted.delete(layer), doubleClickZoom: { active: true, enabled() { return this.active; }, disable() { this.active = false; }, enable() { this.active = true; } } });
  const layer = emitter({ options: {}, coordinates: [[{ lat: 43, lng: 1 }, { lat: 43, lng: 1.002 }, { lat: 43.002, lng: 1 }]],
    editing: { active: false, enable() { this.active = true; }, disable() { this.active = false; } },
    getLatLngs() { return this.coordinates; }, setLatLngs(points) { this.coordinates = points; } });
  const layers = [layer];
  const shapes = { getLayers: () => layers, eachLayer: callback => layers.forEach(callback), addLayer: layer => layers.push(layer) };
  const graphic = (coordinates, style) => ({ coordinates, style, addTo() { plotted.add(this); return this; },
    setLatLngs(points) { this.coordinates = points; }, setStyle(patch) { Object.assign(this.style, patch); } });
  const leaflet = { DomEvent: { stopPropagation() {} }, circleMarker: graphic, polyline: graphic };
  let changes = 0;
  const interactions = installRoofMapInteractions({ map, shapes, leaflet, drawControl, fetchFootprints,
    onChange() { changes++; }, onEditing: active => { nodes.get('roofContourEditor').hidden = !active; },
    onStatus(message) { nodes.get('roofDetectionStatus').textContent = message; } });
  const context = { roofMap: map, roofInteractions: interactions, $: id => nodes.get(id), window: { L: leaflet },
    selected: () => ({ value: twoPans ? 'two' : 'one' }), azimuthLabels: { 0: 'Nord', 90: 'Est', 180: 'Sud', 270: 'Ouest' } };
  const start = source.indexOf('function nearestCompassLabel('), end = source.indexOf('async function findAddresses(', start);
  vm.runInNewContext('let roofOrientation = null, roofOrientationLine = null, roofOrientationPicker = null;\n' + source.slice(start, end)
    + '\nglobalThis.api = { startRoofOrientationPick, finishRoofOrientationPick, ridgePanOrientation, state: () => ({ roofOrientation, roofOrientationLine, roofOrientationPicker }) };', context);
  const click = async point => {
    const handler = handlers.get('click'); assert.ok(handler, 'picker click handler must be installed');
    handler({ point, target: { closest: () => false }, preventDefault() {}, stopImmediatePropagation() {} });
  };
  return { api: context.api, nodes, classes, handlers, plotted, map, layer, layers, interactions, click, get changes() { return changes; } };
}

test('starting orientation commits and freezes the contour, clears edit instructions and blocks competing map edits', async () => {
  let queries = 0;
  const h = setup({ fetchFootprints: async () => { queries++; return []; } });
  h.interactions.editLast();
  assert.equal(h.layer.editing.active, true);
  h.layer.coordinates[0][0].lat += .0001;
  const adjusted = structuredClone(h.layer.coordinates);
  h.api.startRoofOrientationPick();
  assert.equal(h.layer.editing.active, false);
  assert.deepEqual(h.layer.coordinates, adjusted);
  assert.equal(h.nodes.get('roofContourEditor').hidden, true);
  assert.equal(h.nodes.get('roofDetectionStatus').textContent, '');
  assert.match(h.nodes.get('roofMapHint').lastElementChild.textContent, /Contour figé.*faîtage/);
  assert.doesNotMatch(h.nodes.get('roofMapHint').lastElementChild.textContent, /Déplacez les/);
  await h.layer.fire('click', {});
  await h.interactions.detectAt({ latlng: { lat: 44, lng: 2 } });
  h.interactions.editLast();
  assert.equal(h.layer.editing.active, false);
  assert.equal(queries, 0);
  assert.equal(h.layers.length, 1);
  h.api.finishRoofOrientationPick();
  assert.equal(h.handlers.size, 0); assert.equal(h.map.doubleClickZoom.active, true);
  h.interactions.editLast(); assert.equal(h.layer.editing.active, true);
  assert.deepEqual(h.layer.coordinates, adjusted, 'returning to contour editing keeps the saved adjustments');
});

test('two ridge clicks draw a red preview and commit perpendicular opposite pans, not the ridge direction', async () => {
  const h = setup(); h.api.startRoofOrientationPick();
  await h.click({ lat: 43, lng: 1 });
  h.handlers.get('mousemove')({ point: { lat: 43, lng: 1.002 }, target: { closest: () => false } });
  const preview = h.api.state().roofOrientationPicker.trace;
  assert.equal(preview.style.color, '#d52b32');
  assert.equal(preview.coordinates[1].lng, 1.002);
  await h.click({ lat: 43, lng: 1.002 });
  assert.equal(h.api.state().roofOrientation, 180);
  assert.deepEqual(solarRoofPlanes({ roofType: 'pitched', roofPans: 'two', orientation: h.api.state().roofOrientation }),
    [{ orientation: 180, weight: .5 }, { orientation: 0, weight: .5 }]);
  assert.equal(h.api.state().roofOrientationPicker, null);
  assert.equal(h.handlers.size, 0); assert.equal(h.classes.size, 0);
  assert.equal(h.plotted.size, 1, 'only the completed red ridge remains');
  assert.equal(h.api.state().roofOrientationLine.style.color, '#d52b32');
  assert.equal(h.api.state().roofOrientationLine.style.dashArray, null);
  assert.match(h.nodes.get('orientationStatus').textContent, /Deux pans repérés.*Sud.*Nord/);
});

test('one equipped pan requires a side click and reversing the ridge does not reverse the selected pan', async () => {
  for (const reverse of [false, true]) {
    const h = setup({ twoPans: false }); h.api.startRoofOrientationPick();
    const points = [{ lat: 43, lng: 1 }, { lat: 43, lng: 1.002 }];
    if (reverse) points.reverse();
    await h.click(points[0]); await h.click(points[1]);
    assert.equal(h.api.state().roofOrientation, null);
    assert.ok(h.api.state().roofOrientationPicker);
    await h.click({ lat: 43, lng: 1.001 });
    assert.equal(h.api.state().roofOrientation, null, 'clicking on the ridge is ambiguous');
    await h.click({ lat: 43.0005, lng: 1.001 });
    assert.equal(h.api.state().roofOrientation, 0, 'north-facing pan stays north regardless of click order');
    assert.equal(h.api.state().roofOrientationPicker, null);
  }
});

test('cancelled remeasurement restores the previous line and azimuth and removes only the unfinished red trace', async () => {
  const h = setup(); h.api.startRoofOrientationPick();
  await h.click({ lat: 43, lng: 1 }); await h.click({ lat: 43, lng: 1.002 });
  const previous = h.api.state().roofOrientationLine;
  h.api.startRoofOrientationPick(); await h.click({ lat: 43, lng: 1 });
  h.api.finishRoofOrientationPick();
  assert.equal(h.api.state().roofOrientationLine, previous);
  assert.equal(h.api.state().roofOrientation, 180);
  assert.deepEqual([...h.plotted], [previous]);
  assert.equal(h.handlers.size, 0);
  assert.match(h.nodes.get('roofDetectionStatus').textContent, /orientation précédente.*conservés/);
});

test('freeze cancels in-flight footprint detection and saves/disables any native Leaflet drawing handler', async () => {
  let resolveRequest, saved = 0, disabled = 0;
  const h = setup({ fetchFootprints: () => new Promise(resolve => { resolveRequest = resolve; }),
    drawControl: { _toolbars: { edit: { _activeMode: { handler: { save() { saved++; }, disable() { disabled++; } } } } } } });
  const pending = h.interactions.detectAt({ latlng: { lat: 44, lng: 2 } });
  h.api.startRoofOrientationPick();
  resolveRequest([{ type: 'way', id: 42, geometry: [{ lat: 44, lon: 2 }, { lat: 44, lon: 2.0002 }, { lat: 44.0002, lon: 2.0002 }, { lat: 44.0002, lon: 2 }] }]);
  await pending;
  assert.equal(h.layers.length, 1, 'a stale detection must not add a roof or reopen editing');
  assert.equal(h.layer.editing.active, false);
  assert.equal(saved, 1); assert.equal(disabled, 1);
  h.api.finishRoofOrientationPick();
});

test('orientation UI disables the drawing toolbar, supports Escape, and uses ridge-specific help', () => {
  const css = readFileSync(new URL('../../public-simulator/pro-simulator-design.css', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../../public-simulator/index.html', import.meta.url), 'utf8');
  assert.match(css, /\.simPickingOrientation \.leaflet-draw \{ display: none; \}/);
  assert.match(source, /event\.key === 'Escape' && roofOrientationPicker/);
  assert.match(source, /container\.appendChild\(\$\('roofDetectionStatus'\)\)/);
  assert.match(html, /id="roofOrientationHelp"/);
  assert.doesNotMatch(html, /cliquez du faîtage vers le bas de pente/);
  assert.match(source, /input\[name="roofPans"\].*addEventListener\('change'/);
});
