// Read-only browser smoke test against the live solar calculation service.
// Usage: SOLARSHIFT_PLAYWRIGHT_MODULE may point to a bundled playwright index.mjs.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.SOLARSHIFT_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../public-simulator/', import.meta.url));
const output = fileURLToPath(new URL('../output/simulator-qa/', import.meta.url));
await mkdir(output, { recursive: true });
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png' };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/__local/pvgis') {
      const result = await fetch(`http://127.0.0.1:3000/__local/pvgis${url.search}`);
      response.writeHead(result.status, { 'content-type': 'application/json' }); response.end(await result.text()); return;
    }
    const path = resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(403).end(); return; }
    response.writeHead(200, { 'content-type': mime[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(await readFile(path));
  } catch { response.writeHead(500).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const target = process.env.SOLARSHIFT_QA_URL || `http://127.0.0.1:${server.address().port}/`;
  await page.goto(target, { waitUntil: 'networkidle' });
  await page.locator('.simCoordinates summary').click();
  await page.locator('#latitude').fill('48.8199'); await page.locator('#longitude').fill('2.394');
  await page.locator('[data-step="1"] [data-next]').click();
  await page.locator('label:has(input[name="siteKind"][value="building"])').click();
  await page.locator('label:has(input[name="buildingUse"][value="logistics"])').click();
  await page.locator('label:has(input[name="roofType"][value="flat"])').click();
  await page.locator('.leaflet-draw-draw-polygon').click();
  await page.locator('#roofMap').scrollIntoViewIfNeeded();
  const box = await page.locator('#roofMap').boundingBox();
  for (const [x, y] of [[.42,.4],[.6,.4],[.6,.6],[.42,.6]]) {
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
    await page.waitForTimeout(300);
  }
  await page.locator('.leaflet-draw-actions a').filter({ hasText: /^Finish$/ }).click();
  await page.screenshot({ path: resolve(output, 'map-after-draw.png'), fullPage: true });
  await page.locator('#roofContourEditor').waitFor({ state: 'visible' });
  assert.ok(await page.locator('.leaflet-editing-icon').count() >= 4, 'editable contour handles absent after drawing');
  await page.screenshot({ path: resolve(output, 'editable-map.png'), fullPage: true });
  await page.locator('#saveRoofContour').click();
  await page.locator('#roofArea').fill('1380');
  await page.locator('[data-step="2"] [data-next]').click();
  await page.locator('#roofPitchGroup').waitFor({ state: 'visible' });
  assert.equal(await page.locator('input[name="tiltBand"]:checked').inputValue(), '0-6');
  assert.ok(await page.locator('input[name="tiltBand"]').first().isDisabled(), 'flat roof tilt should remain an explicit default');
  assert.match(await page.locator('[data-step="3"] [data-summary-area]').innerText(), /897/);
  await page.locator('#annualConsumption').fill('100000');
  await page.screenshot({ path: resolve(output, 'qualification-desktop.png'), fullPage: true });
  await page.locator('[data-step="3"] [data-next]').click();
  await page.locator('label:has(input[name="projectTiming"][value="3-6-months"])').click();
  await page.locator('#warehouseSubtype').selectOption('dry');
  await page.locator('#subscribedPowerBand').selectOption('LE_36_KVA');
  await page.screenshot({ path: resolve(output, 'usage-timing.png'), fullPage: true });
  await page.locator('#calculateButton').click();
  await page.waitForFunction(() => document.getElementById('resultStatus').hidden || document.getElementById('resultStatus').dataset.kind === 'error', null, { timeout: 60000 });
  assert.equal(await page.locator('#resultStatus').isHidden(), true, await page.locator('#resultStatus').innerText());
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(await page.locator('#simMonthlyChart .simMonth').count(), 12);
  assert.equal(await page.locator('#simMonthlyValues tr').count(), 12);
  assert.match(await page.locator('#resultTiming').innerText(), /3 à 6 mois/);
  for (const id of ['resultAciRate', 'resultAccRate', 'resultAciVolume', 'resultAccVolume', 'resultPayback', 'resultAnnualSavings', 'resultAnnualCarbon']) {
    assert.doesNotMatch(await page.locator(`#${id}`).innerText(), /À préciser|NaN|undefined|Infinity/);
  }
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#downloadEstimateButton').click();
  const download = await downloadEvent;
  const payload = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(payload.commercial.projectTiming, '3-6-months');
  assert.equal(payload.kind, 'NON_CANONICAL_PRESTUDY');
  assert.ok(payload.production.annual_kwh_kwc > 0);
  await page.screenshot({ path: resolve(output, 'synthesis-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'mobile horizontal overflow');
  await page.screenshot({ path: resolve(output, 'synthesis-mobile.png'), fullPage: true });
  await page.locator('.simFinanceDetails summary').click();
  assert.equal(await page.locator('#resultIndicativeIrr').isVisible(), true);
  await page.locator('#resultStep [data-back]').click();
  assert.equal(await page.locator('input[name="projectTiming"]:checked').inputValue(), '3-6-months');
  await page.locator('[data-step="4"] [data-back]').click();
  await page.locator('[data-step="3"] [data-back]').click();
  await page.locator('#roofContourEditor').waitFor({ state: 'visible' });
  assert.ok(await page.locator('.leaflet-editing-icon').count() >= 4, 'handles absent when returning to map');
  await page.locator('#saveRoofContour').click();
  await page.locator('label:has(input[name="roofType"][value="pitched"])').click();
  await page.locator('[data-step="2"] [data-next]').click();
  assert.equal(await page.locator('input[name="tiltBand"]').first().isEnabled(), true);
  await page.locator('label:has(input[name="tiltBand"][value="15-30"])').click();
  assert.equal(await page.locator('input[name="tiltBand"]:checked').inputValue(), '15-30');
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(JSON.stringify({ target, status: 'PASS', pageErrors: errors, production: payload.production.annual_kwh_kwc, timing: payload.commercial, screenshots: output }, null, 2));
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
