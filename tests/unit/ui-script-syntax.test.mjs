import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const uiRoot = new URL('../../src/ui/', import.meta.url);

test('standalone UI scripts are valid JavaScript', () => {
  for (const file of ['supabase-session.js', 'energy-engine-client.js', 'audit-ux.js', 'production-study.js', 'roof-surfaces.js', 'finance-controls.js', 'summary-ux.js']) {
    const source = fs.readFileSync(new URL(file, uiRoot), 'utf8');
    assert.doesNotThrow(() => new Function(source), `${file} must parse`);
  }
});

test('inline index scripts are valid JavaScript', () => {
  const html = fs.readFileSync(new URL('index.html', uiRoot), 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter((source) => source.trim());

  assert.ok(scripts.length > 0, 'index.html should contain inline scripts');
  scripts.forEach((source, index) => {
    assert.doesNotThrow(() => new Function(source), `inline script ${index + 1} must parse`);
  });
});

test('roof and financing controls expose the requested variables', () => {
  const html = fs.readFileSync(new URL('index.html', uiRoot), 'utf8');
  const roof = fs.readFileSync(new URL('roof-surfaces.js', uiRoot), 'utf8');
  const finance = fs.readFileSync(new URL('finance-controls.js', uiRoot), 'utf8');
  assert.match(html, /id="roofSurfaces"/);
  assert.match(roof, /Pan incliné/);
  assert.match(roof, /Toit plat/);
  assert.match(roof, /Ombrage/);
  assert.match(roof, /Surface exploitable totale/);
  assert.match(roof, /Puissance installée totale/);
  assert.match(roof, /Production annuelle moyenne/);
  assert.match(roof, /Détecter la toiture/);
  assert.match(roof, /nominatim\.openstreetmap\.org\/reverse/);
  assert.match(roof, /polygon_geojson=1/);
  assert.match(roof, /Supprimer cette surface/);
  assert.match(roof, /aria-label="Supprimer la surface/);
  assert.match(roof, /capexPerKwp/);
  assert.match(roof, /capex\.dispatchEvent/);
  assert.match(roof, /energy_profile|PVcalc|calculateSynthesis/);
  assert.match(roof, /roofState/);
  const auditUx = fs.readFileSync(new URL('audit-ux.js', uiRoot), 'utf8');
  assert.match(auditUx, /mobileProjectChoice/);
  assert.match(auditUx, /position:sticky!important/);
  assert.match(auditUx, /Surface toiture \(renseigner ou tracer sur la carte\)/);
  assert.match(auditUx, /removeAttribute\('placeholder'\)/);
  assert.match(auditUx, /total\.placeholder = ''/);
  assert.match(html, /id="debtShare"/);
  assert.match(finance, /Dégradation moyenne/);
  assert.match(finance, /frais de gestion/);
  assert.doesNotMatch(finance, /commission 10/);
  const engineClient = fs.readFileSync(new URL('energy-engine-client.js', uiRoot), 'utf8');
  assert.match(engineClient, /frais de gestion/);
  assert.match(engineClient, /Estimation locale/);
  assert.match(finance, /ozeno:local-finance/);
  assert.doesNotMatch(engineClient, /gestion réseau 10 %|commission de gestion réseau/);
  const summary = fs.readFileSync(new URL('summary-ux.js', uiRoot), 'utf8');
  assert.match(summary, /kWh\/kWc\/an/);
  assert.match(summary, /dashboardProfileTooltip/);
  assert.match(summary, /Statut de qualification/);
  assert.match(summary, /Prochaine action/);
});
