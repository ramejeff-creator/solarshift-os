import test from 'node:test';
import assert from 'node:assert/strict';
import { situationLayout, handleSituationPlanRequest, IGN_WMS, CADASTRE_LAYER } from '../../supabase/functions/_shared/situation-plan-handler.mjs';
import { buildSituationPlanPdf } from '../../public-simulator/situation-plan-pdf.mjs';
const geometry = { type: 'Polygon', coordinates: [[[3, 46.5], [3.001, 46.5], [3.001, 46.5003], [3, 46.5003], [3, 46.5]]] };
const input = (overrides = {}) => ({ geometry, format: 'A4', orientation: 'landscape', scale: 1000, base: 'plan', cadastre: true, ...overrides });
const request = data => new Request('http://local/plan', { method: 'POST', body: JSON.stringify(data) });
function png(layout) {
  // Header fixture only; browser decoding is separately checked with real IGN images.
  const bytes = new Uint8Array(32); bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer); view.setUint32(16, layout.pixels[0]); view.setUint32(20, layout.pixels[1]); return bytes;
}
test('situation plan preserves metric paper scale for all formats and orientations', () => {
  for (const format of ['A4', 'A3']) for (const orientation of ['portrait', 'landscape']) {
    const layout = situationLayout(input({ format, orientation, scale: 2000 }));
    assert.deepEqual(layout.groundM, layout.mapMm.map(mm => mm * 2));
    assert.ok(Math.abs((layout.bbox[2] - layout.bbox[0]) - layout.groundM[0]) < 1e-7);
    assert.ok(Math.abs((layout.bbox[3] - layout.bbox[1]) - layout.groundM[1]) < 1e-7);
    assert.equal(layout.scaleBarM / layout.scale * 1000, 50);
    assert.ok(layout.paths.flat(2).every(([x, y]) => x > 0 && x < 1 && y > 0 && y < 1));
  }
});
test('situation plan rejects unsupported projections, formats and cropped parcels before fetching', async () => {
  let calls = 0;
  const wide = structuredClone(geometry); wide.coordinates[0][1][0] = 3.03; wide.coordinates[0][2][0] = 3.03;
  for (const data of [input({ scale: 123 }), input({ format: 'A0' }), input({ geometry: wide }), input({ base: 'https://attacker' }), input({ geometry: { type: 'Polygon', coordinates: [[[55, -21], [55.001, -21], [55.001, -21.001], [55, -21], ]] } })]) {
    const r = await handleSituationPlanRequest(request(data), { fetchImpl: () => { calls++; } }); assert.equal(r.status, 400);
  }
  assert.equal(calls, 0);
});
test('situation plan fixes IGN source and bounds, rejects partial or wrong-size images, never exports a failed layer', async () => {
  const layout = situationLayout(input());
  let seen;
  const success = await handleSituationPlanRequest(request(input()), { fetchImpl: async url => { seen = new URL(url); return new Response(png(layout), { headers: { 'Content-Type': 'image/png' } }); } });
  const p = await success.json(); assert.equal(success.status, 200); assert.equal(p.state, 'AVAILABLE');
  assert.equal(seen.origin + seen.pathname, IGN_WMS); assert.equal(seen.searchParams.get('CRS'), 'EPSG:2154');
  assert.ok(seen.searchParams.get('LAYERS').endsWith(CADASTRE_LAYER)); assert.deepEqual(p.source.layers, seen.searchParams.get('LAYERS').split(','));
  assert.equal(p.source.dataDate, null); assert.ok(Date.parse(p.source.retrievedAt));
  for (const response of [new Response('<ServiceException/>', { headers: { 'Content-Type': 'text/xml' } }), new Response(png({ pixels: [1, 1] }), { headers: { 'Content-Type': 'image/png' } }), new Response('', { status: 503 })]) {
    const failed = await handleSituationPlanRequest(request(input()), { fetchImpl: async () => response }); assert.equal(failed.status, 502); assert.equal((await failed.json()).image, undefined);
  }
});
test('situation PDF embeds original pixels with correct paper size, binary offsets and vector boundaries', () => {
  const plan = { ...situationLayout(input()), state: 'AVAILABLE', image: 'data:image/jpeg;base64,/9j/2Q==', base: 'photo', cadastre: true, source: { retrievedAt: '2026-10-20T08:00:00Z', attribution: '© IGN · DGFiP' } };
  const result = buildSituationPlanPdf(plan, { name: 'MURET', parcelId: '31395000AM0014' });
  const text = new TextDecoder().decode(result), xref = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.equal(new TextDecoder().decode(result.slice(xref, xref + 4)), 'xref');
  assert.ok(text.includes(`/MediaBox [0 0 ${297 * 72 / 25.4} ${210 * 72 / 25.4}]`));
  assert.ok(text.includes('/Width 2150 /Height 1055')); assert.ok(text.includes('/DCTDecode'));
  assert.ok(text.includes('0.78 0.12 0.15 RG')); assert.throws(() => buildSituationPlanPdf({ state: 'UNAVAILABLE' }));
});
