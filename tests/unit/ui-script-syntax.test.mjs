import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const uiRoot = new URL('../../src/ui/', import.meta.url);

test('standalone UI scripts are valid JavaScript', () => {
  for (const file of ['supabase-session.js', 'energy-engine-client.js', 'audit-ux.js', 'production-study.js']) {
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
