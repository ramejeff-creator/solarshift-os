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
test('contour correction actions sit directly below the map, before site summary and surface controls', () => {
  const html = readFileSync(new URL('../../public-simulator/index.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../../public-simulator/pro-simulator.mjs', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../public-simulator/pro-simulator-design.css', import.meta.url), 'utf8');
  assert.match(html, /<div id="roofMap"[^>]*><\/div>\s*<div id="roofContourEditor"/);
  assert.equal((html.match(/id="roofContourEditor"/g) || []).length, 1);
  const editorPosition = html.indexOf('id="roofContourEditor"');
  assert.ok(editorPosition < html.indexOf('<aside class="simSiteSummary"'));
  assert.ok(editorPosition < html.indexOf('id="usableAreaGroup"'));
  assert.ok(editorPosition < html.indexOf('id="mapOrientationGroup"'));
  assert.match(html, /id="roofContourEditor"[^>]*hidden/);
  assert.match(css, /#roofContourEditor\[hidden\] \{ display: none; \}/);
  assert.match(css, /#roofContourEditor \{ flex-wrap: wrap;/);
  assert.match(js, /onEditing\(active\) \{ \$\('roofContourEditor'\)\.hidden = !active; \}/);
  assert.match(js, /\$\('saveRoofContour'\)\.addEventListener\('click', \(\) => roofInteractions\?\.finishCorrection\(true\)\)/);
  assert.match(js, /\$\('cancelRoofContour'\)\.addEventListener\('click', \(\) => roofInteractions\?\.finishCorrection\(false\)\)/);
});

test('usable-area slider and roof orientation sit side by side with values aligned beside their explanations', () => {
  const html = readFileSync(new URL('../../public-simulator/index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../public-simulator/pro-simulator-design.css', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../../public-simulator/pro-simulator.mjs', import.meta.url), 'utf8');
  const controlsStart = html.indexOf('<div class="simSurfaceControls">');
  const controlsEnd = html.indexOf('La surface tracée reste une estimation', controlsStart);
  const controls = html.slice(controlsStart, controlsEnd);
  assert.ok(controlsStart >= 0 && controlsEnd > controlsStart);
  assert.ok(controls.indexOf('id="usableAreaGroup"') < controls.indexOf('id="mapOrientationGroup"'));
  assert.match(controls, /<output id="usableOutput">65 %<\/output>/);
  assert.match(controls, /<h3 class="simQuestionLabel" data-number="5">Orientation de la toiture/);
  assert.match(controls, /<output id="orientationStatus" class="simOrientationResult"/);
  assert.match(css, /\.simSurfaceControls \{ display: grid; grid-template-columns: minmax\(190px,\.72fr\) minmax\(0,1\.28fr\)/);
  assert.match(css, /\.simMapOrientation \[data-number\]::before/);
  assert.match(css, /\.simOrientationResult \{ display: block; flex: 0 1 52%;/);
  assert.match(css, /\.simSurfaceControls \{ grid-template-columns: minmax\(0,1fr\); gap: 8px; \}/);
  const financialSummary = js.slice(js.indexOf('  const annualSavings ='), js.indexOf('  const gridPrice ='));
  assert.match(financialSummary, /resultAnnualSavings'[\s\S]*annualSavings \/ 1000/);
  assert.match(financialSummary, /formatGainRange\(netGainCentral\)/);
  assert.doesNotMatch(financialSummary, /scenarioCorridor/);
  assert.match(js, /Scénario central : gain net estimé après CAPEX/);
  assert.match(js, /setView\(\[location\.latitude, location\.longitude\], 19\)/);
  assert.match(js, /setView\(\[suggestion\.latitude, suggestion\.longitude\], 19\)/);
});

test('simulator layout refreshes cached styles and keeps building illustrations in a visible frame', () => {
  const html = readFileSync(new URL('../../public-simulator/index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../public-simulator/pro-simulator-design.css', import.meta.url), 'utf8');
  assert.match(html, /pro-simulator-design\.css\?v=20261029-1/);
  assert.match(css, /\.simUseCaseChoices b \{[^}]*font-size: 15px;[^}]*overflow-wrap: anywhere;/);
  assert.match(css, /\.simBuildingChoices \.simBuildingArt \{\s*height: clamp\(58px, 8vw, 105px\);\s*aspect-ratio: 16 \/ 9;/);
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

test('summary presents the server reference CAPEX between production and savings, not its wide corridor', () => {
  const html = readFileSync(new URL('../../public-simulator/index.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../../public-simulator/pro-simulator.mjs', import.meta.url), 'utf8');
  const metrics = html.slice(html.indexOf('<div class="simSummaryMetrics">'), html.indexOf('<div class="simResultDetails">'));
  const ids = [...metrics.matchAll(/<strong id="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(ids, ['capacityRange', 'annualProduction', 'resultInvestmentRange', 'resultAnnualSavings', 'resultNetGain25Years']);
  const budgetCode = js.slice(js.indexOf('  const budget = production?.installation_budget;'), js.indexOf("  $('resultUsableArea').textContent"));
  const render = new Function('production', '$', 'numberFormat', budgetCode);
  const elements = Object.fromEntries(['resultInvestmentRange', 'resultInvestmentNote', 'resultFinancialCapex'].map((id) => [id, {
    textContent: '', classList: { toggle(name, pending) { assert.equal(name, 'simPendingValue'); this.pending = pending; } }
  }]));
  const format = (value) => new Intl.NumberFormat('fr-FR').format(value);
  const budget = { status: 'ASSUMPTION', scope: 'EQUIPMENT_AND_INSTALLATION', rangeBasis: 'CAPACITY_AND_INSTALLATION_TYPE_REFERENCE', lowEur: 184560, referenceEur: 201000, referenceEurPerKwp: 1000, highEur: 230700 };
  const run = (production) => render(production, (id) => elements[id], format);
  run({ installation_budget: budget });
  assert.equal(elements.resultInvestmentRange.textContent, '201 k€');
  assert.equal(elements.resultInvestmentNote.textContent, `Référence indicative : ${format(1000)} €/kWc · à confirmer par devis`);
  assert.equal(elements.resultFinancialCapex.textContent, `${format(201000)} € · ${format(1000)} €/kWc`);
  assert.equal(elements.resultInvestmentRange.classList.pending, false);
  for (const invalid of [{ ...budget, lowEur: null }, { ...budget, highEur: Infinity }, { ...budget, referenceEur: 300000 }, { ...budget, referenceEurPerKwp: null }, { ...budget, scope: 'OTHER' }, { ...budget, status: 'UNKNOWN' }]) {
    run({ installation_budget: invalid });
    assert.equal(elements.resultInvestmentRange.textContent, 'À préciser');
    assert.equal(elements.resultInvestmentRange.classList.pending, true);
  }
  run(null);
  assert.equal(elements.resultInvestmentRange.textContent, 'En attente');
});

test('automobile equivalence matches requested copy with a tree, dynamic km and accessible caveat', () => {
  const html = readFileSync(new URL('../../public-simulator/index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../public-simulator/pro-simulator-design.css', import.meta.url), 'utf8');
  const block = html.match(/<div class="simEcoCallout simCarbonEquivalence">.*?<\/details><\/div>/)?.[0];
  assert.ok(block);
  assert.match(block, /href="#sim-tree"/);
  assert.doesNotMatch(block, /href="#sim-leaf"|530.?000/);
  assert.match(block, /Soit l’équivalent de/);
  assert.match(block, /id="resultCarbonKm"/);
  assert.match(block, /en voiture thermique évités chaque année\./);
  assert.match(block, /summary aria-label="À propos de l’équivalence automobile"/);
  assert.match(block, /Il ne s’agit pas de trajets réellement évités/);
  assert.match(html, /href="#sim-leaf"\/><\/svg>Repère CO₂ évité/);
  assert.match(css, /#resultStep \.simSummaryMetrics \{ grid-template-columns: repeat\(5,minmax\(0,1fr\)\); \}/);
  assert.match(css, /@media \(max-width:700px\) \{\s*#resultStep \.simSummaryMetrics \{ grid-template-columns: 1fr; \}/);
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

test('public estimate runs an independent indicative Funding hint without changing financial outputs', () => {
  const html = readFileSync(new URL('../../public-simulator/index.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../../public-simulator/pro-simulator.mjs', import.meta.url), 'utf8');
  const runtime = readFileSync(new URL('../../public-simulator/runtime-config.js', import.meta.url), 'utf8');
  assert.match(html, /id="resultFundingHint"[^>]*aria-live="polite"/);
  assert.match(html, /Aides potentielles/);
  assert.match(html, /ne dépose aucune demande/);
  assert.match(runtime, /publicFundingHintEndpoint[^\n]*functions\/v1\/public-funding-hint/);
  assert.match(js, /async function requestPublicFundingHint\(input\)/);
  assert.match(js, /siteDepartmentCode: fundingDepartmentCode\(input\.address\)/);
  assert.match(js, /projectMode: \(\{ 'self-consumption': 'ACI'/);
  assert.match(js, /if \(!controller\.signal\.aborted\) void requestPublicFundingHint\(input\)/);
  const request = js.slice(js.indexOf('async function requestPublicFundingHint'), js.indexOf('function clearCalculationTimer'));
  assert.doesNotMatch(request, /result(?:InvestmentRange|IndicativeIrr|AnnualSavings|NetGain25Years)|financial_preview|DSCR/i);
});
