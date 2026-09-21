import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const uiRoot = new URL('../../src/ui/', import.meta.url);

test('standalone UI scripts are valid JavaScript', () => {
  for (const file of ['supabase-session.js', 'energy-engine-client.js', 'audit-ux.js', 'production-study.js', 'roof-surfaces.js', 'finance-controls.js']) {
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
  assert.match(roof, /Ajouter une surface/);
  assert.match(roof, /Pan incliné/);
  assert.match(roof, /Toit plat/);
  assert.match(html, /id="debtShare"/);
  assert.match(finance, /Dégradation moyenne/);
  assert.match(finance, /frais de gestion/);
  assert.doesNotMatch(finance, /commission 10/);
  const engineClient = fs.readFileSync(new URL('energy-engine-client.js', uiRoot), 'utf8');
  assert.match(engineClient, /frais de gestion/);
  assert.doesNotMatch(engineClient, /gestion réseau 10 %|commission de gestion réseau/);
});
