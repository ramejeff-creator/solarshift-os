// Isolated, read-only browser regression test. No client data or calculation API writes.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.SOLARSHIFT_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../public-simulator/', import.meta.url));
const output = fileURLToPath(new URL('../output/simulator-orientation-qa/', import.meta.url));
await mkdir(output, { recursive: true });
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png' };
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(403).end(); return; }
    response.writeHead(200, { 'content-type': mime[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(await readFile(path));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
  await page.locator('.simCoordinates summary').click();
  await page.locator('#latitude').fill('43.49001'); await page.locator('#longitude').fill('1.34247');
  await page.locator('[data-step="1"] [data-next]').click();
  await page.locator('label:has(input[name="buildingUse"][value="industry"])').click();
  await page.locator('label:has(input[name="roofType"][value="pitched"])').click();
  await page.locator('label:has(input[name="roofPans"][value="two"])').click();
  const map = page.locator('#roofMap');
  const mapClick = async (x, y) => { const box = await map.boundingBox(); await map.click({ position: { x: box.width * x, y: box.height * y } }); };
  await page.locator('.leaflet-draw-draw-polygon').click();
  for (const point of [[.35,.4],[.65,.4],[.65,.7],[.35,.7]]) { await mapClick(...point); await page.waitForTimeout(150); }
  await page.locator('.leaflet-draw-actions a').filter({ hasText: /^Finish$/ }).click();
  await page.locator('#roofContourEditor').waitFor({ state: 'visible' });
  assert.ok(await page.locator('.leaflet-editing-icon').count() >= 4);
  const area = await page.locator('#roofArea').inputValue();
  await page.locator('#pickRoofOrientation').click();
  assert.equal(await page.locator('#roofContourEditor').isHidden(), true);
  assert.equal(await page.locator('.leaflet-editing-icon').count(), 0);
  assert.equal(await page.locator('.leaflet-draw').isHidden(), true);
  assert.equal(await page.locator('#roofDetectionStatus').innerText(), '');
  assert.match(await page.locator('#roofMapHint').innerText(), /Contour figé.*faîtage/);
  await mapClick(.35,.55);
  await map.hover({ position: { x: (await map.boundingBox()).width * .65, y: (await map.boundingBox()).height * .55 } });
  assert.ok(await map.locator('path[stroke="#d52b32"]').count() >= 2);
  await page.locator('.simMapSection').screenshot({ path: resolve(output, 'ridge-frozen-contour-desktop.png') });
  await mapClick(.65,.55);
  assert.match(await page.locator('#orientationStatus').innerText(), /Deux pans repérés.*Ouest|Deux pans repérés.*Sud/);
  assert.equal(await page.locator('#roofArea').inputValue(), area);
  assert.equal(await map.locator('path[stroke="#d52b32"]').count(), 1);
  assert.equal(await page.locator('.leaflet-editing-icon').count(), 0);
  await page.locator('#pickRoofOrientation').click(); await mapClick(.45,.55);
  await page.keyboard.press('Escape');
  assert.equal(await map.locator('path[stroke="#d52b32"]').count(), 1);
  assert.match(await page.locator('#roofDetectionStatus').innerText(), /orientation précédente.*conservés/);
  await mapClick(.5,.65);
  assert.ok(await page.locator('.leaflet-editing-icon').count() >= 4, 'contour must become editable again after orientation');
  await page.locator('label:has(input[name="roofPans"][value="one"])').click();
  await page.locator('#pickRoofOrientation').click();
  await mapClick(.35,.55); await mapClick(.65,.55);
  assert.match(await page.locator('#orientationStatus').innerText(), /Cliquez maintenant sur le pan/);
  await mapClick(.5,.65);
  assert.match(await page.locator('#orientationStatus').innerText(), /pan à équiper repéré/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#pickRoofOrientation').click();
  await mapClick(.35,.55); await map.hover({ position: { x: (await map.boundingBox()).width * .65, y: (await map.boundingBox()).height * .55 } });
  assert.equal(await page.locator('.leaflet-editing-icon').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile horizontal overflow');
  await page.locator('.simMapSection').screenshot({ path: resolve(output, 'ridge-frozen-contour-mobile.png') });
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'PASS', pageErrors: errors, screenshots: output }));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
