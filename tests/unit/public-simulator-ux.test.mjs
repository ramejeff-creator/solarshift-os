import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installRoofMapInteractions } from '../../public-simulator/roof-map-interactions.mjs';
import { projectTimingLabel, paybackWindow, carbonEquivalenceKm } from '../../public-simulator/simulator-presentation.mjs';
import { findInvalidControl, qualificationErrorMessage } from '../../public-simulator/simulator-validation.mjs';

function emitter(extra = {}) {
  const listeners = new Map();
  return Object.assign({ on(names, callback) { names.split(' ').forEach((name) => {
    listeners.set(name, [...(listeners.get(name) || []), callback]);
  }); }, async fire(name, event = {}) { for (const callback of listeners.get(name) || []) await callback(event); } }, extra);
}
function polygon() {
  return emitter({ options: {}, coordinates: [[{ lat: 48, lng: 2 }, { lat: 48, lng: 2.01 }, { lat: 48.01, lng: 2.01 }]],
    editing: { active: false, enable() { this.active = true; }, disable() { this.active = false; } },
    getLatLngs() { return this.coordinates; }, setLatLngs(points) { this.coordinates = points; }, getBounds() { return {}; } });
}
function setup() {
  const map = emitter({ fitBounds() {} });
  const layers = [];
  const shapes = { getLayers: () => layers, addLayer: (layer) => layers.push(layer), eachLayer: (fn) => layers.forEach(fn) };
  const interaction = installRoofMapInteractions({ map, shapes, leaflet: { polygon, DomEvent: { stopPropagation() {} } },
    onChange() {}, fetchFootprints: async () => [{ type: 'way', id: 42, geometry: [
      { lat: 48, lon: 2 }, { lat: 48, lon: 2.0002 }, { lat: 48.0002, lon: 2.0002 }, { lat: 48.0002, lon: 2 }, { lat: 48, lon: 2 }
    ] }] });
  return { map, shapes, interaction };
}
test('detected footprint is editable immediately and cancellation restores original coordinates', async () => {
  const { shapes, interaction } = setup();
  await interaction.detectAt({ latlng: { lat: 48.0001, lng: 2.0001 } });
  assert.equal(shapes.getLayers().length, 1);
  const layer = shapes.getLayers()[0], original = structuredClone(layer.getLatLngs());
  assert.equal(layer.editing.active, true);
  layer.coordinates[0][0].lat += .001;
  interaction.finishCorrection(false);
  assert.equal(layer.editing.active, false);
  assert.deepEqual(layer.getLatLngs(), original);
});
test('manually drawn contour opens editor after drawstop and saved edits are preserved', async () => {
  const { map, shapes, interaction } = setup(), layer = polygon();
  await map.fire('draw:drawstart');
  await map.fire('draw:created', { layer });
  assert.equal(layer.editing.active, false);
  await map.fire('draw:drawstop');
  assert.equal(layer.editing.active, true);
  layer.coordinates[0][0].lat = 48.123;
  interaction.finishCorrection(true);
  assert.equal(layer.getLatLngs()[0][0].lat, 48.123);
  assert.equal(shapes.getLayers().length, 1);
});
test('payback presentation uses only server projection crossing, not a fabricated financial return', () => {
  const rows = [{ year: 0, cumulativeNetGainEur: -100 }, { year: 1, cumulativeNetGainEur: -40 }, { year: 2, cumulativeNetGainEur: 20 }];
  assert.equal(paybackWindow(rows, true), '1–2 ans');
  assert.equal(paybackWindow(rows.slice(0, 2), true), 'Non atteint sur 1 ans');
  assert.equal(paybackWindow(rows, false), 'À préciser');
  assert.equal(paybackWindow([{ year: 0, cumulativeNetGainEur: null }, rows[1]], true), 'À préciser');
});
test('timing has explicit unknown fallback and carbon equivalence preserves missing data', () => {
  assert.equal(projectTimingLabel('3-6-months'), 'Dans 3 à 6 mois');
  assert.equal(projectTimingLabel(null), 'Je ne sais pas encore');
  assert.equal(carbonEquivalenceKm(.142), 1000);
  assert.equal(carbonEquivalenceKm(0), 0);
  assert.equal(carbonEquivalenceKm(null), null);
  assert.equal(carbonEquivalenceKm(-1), null);
});
test('public simulator direct DOM bindings exist and IDs are unique', () => {
  const html = readFileSync(new URL('../../public-simulator/index.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../../public-simulator/pro-simulator.mjs', import.meta.url), 'utf8');
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size, 'duplicate DOM IDs');
  for (const [, id] of js.matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.includes(id), `missing DOM binding: ${id}`);
});

test('public presentation does not disclose calculation sources or detailed benchmark coefficients', () => {
  const html = readFileSync(new URL('../../public-simulator/index.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../../public-simulator/pro-simulator.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /PVGIS|RTE 2025|Impact CO₂|benchmarks? SolarShift|0,12 €\/kWh|19,6 gCO₂e|142 gCO₂e/i);
  const renderedMessages = [...js.matchAll(/\.textContent\s*(?:\+?=)([\s\S]*?);\s*(?:\r?\n|$)/g)].map((match) => match[1]).join('\n');
  assert.doesNotMatch(renderedMessages, /PVGIS|RTE 2025|benchmarks? SolarShift|Fourchette SolarShift|0,12 €\/kWh|carbonIntensityGPerKwh/);
  assert.match(html, /À propos de votre estimation/);
  assert.match(html, /indicatifs et non contractuels/);
  assert.match(html, /cycle de vie de l’installation n’est pas pris en compte/);
});

test('hero illustration is contained below navigation, including on narrow screens', () => {
  const css = readFileSync(new URL('../../public-simulator/pro-simulator-design.css', import.meta.url), 'utf8');
  assert.match(css, /\.simIntro \{[^}]*isolation: isolate;[^}]*overflow: clip;/);
  assert.match(css, /@media \(min-width:701px\) \{\s*\.simIntroArt \{ top: 0; \}\s*\.simIntroArt img \{ height: 100%; object-fit: contain;/);
});

test('qualification accepts exact consumption and reports invalid controls, not fieldsets or disabled defaults', () => {
  const html = readFileSync(new URL('../../public-simulator/index.html', import.meta.url), 'utf8');
  assert.match(html, /<input id="annualConsumption"[^>]*min="0"[^>]*step="any"/);
  const disabledTilt = { willValidate: false, checkValidity() { throw new Error('disabled controls must be ignored'); } };
  const consumption = { id: 'annualConsumption', willValidate: true, checkValidity: () => true };
  const section = { querySelectorAll(selector) { assert.equal(selector, 'input, select, textarea'); return [disabledTilt, consumption]; } };
  assert.equal(findInvalidControl(section), null);
  consumption.checkValidity = () => false;
  assert.equal(findInvalidControl(section), consumption);
  assert.match(qualificationErrorMessage(consumption), /consommation annuelle/);
  assert.doesNotMatch(qualificationErrorMessage(consumption), /Choisissez une option/);
  assert.match(qualificationErrorMessage({ type: 'radio' }), /Choisissez une option/);
});
