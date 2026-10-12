import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { formatGainRange } from '../../public-simulator/simulator-presentation.mjs';
import { requestSolarPreview } from '../../public-simulator/solar-preview-request.mjs';

test('small gain ranges use kEUR and only million-scale ranges use MEUR', () => {
  assert.equal(formatGainRange(50000, 70000), '50–70 k€');
  assert.equal(formatGainRange(390000, 500000), '390–500 k€');
  assert.equal(formatGainRange(1050000), '1,05 M€');
  assert.equal(formatGainRange(-70000, -50000), '-70–-50 k€');
  assert.equal(formatGainRange(null, null), 'À préciser');
  assert.equal(formatGainRange(70000, 50000), 'À préciser');
});

test('usable ratio is unique and belongs to the same step as the measured area, not qualification', () => {
  const html = fs.readFileSync(new URL('../../public-simulator/index.html', import.meta.url), 'utf8');
  const step2 = html.slice(html.indexOf('data-step="2"'), html.indexOf('data-step="3"'));
  const step3 = html.slice(html.indexOf('data-step="3"'), html.indexOf('data-step="4"'));
  assert.match(step2, /id="roofArea"/);
  assert.match(step2, /id="usableAreaGroup"/);
  assert.match(step2, /id="usablePercent"/);
  assert.doesNotMatch(step3, /id="usablePercent"/);
  assert.equal((html.match(/id="usablePercent"/g) || []).length, 1);
});

test('transient 502 retries automatically and returns the provider result unchanged', async () => {
  let requests = 0; const attempts = [];
  const result = await requestSolarPreview('https://test.invalid/', {
    fetchImpl: async () => ++requests === 1 ? new Response('{}', { status: 502 }) : Response.json({ annual_kwh_kwc: 1081.9 }),
    waitImpl: async () => {}, onRetry: (n) => attempts.push(n)
  });
  assert.equal(requests, 2); assert.deepEqual(attempts, [1]); assert.equal(result.annual_kwh_kwc, 1081.9);
});

test('retry is bounded; invalid requests and internal calculation errors are never retried', async () => {
  for (const status of [400, 500, 502, 503, 504, 429]) {
    let requests = 0;
    await assert.rejects(requestSolarPreview('https://test.invalid/', {
      fetchImpl: async () => { requests++; return new Response('{}', { status }); }, waitImpl: async () => {}
    }));
    assert.equal(requests, [429, 502, 503, 504].includes(status) ? 3 : 1);
  }
});

test('network failures can retry but cancellation never retries or returns a stale result', async () => {
  let requests = 0;
  const result = await requestSolarPreview('https://test.invalid/', {
    fetchImpl: async () => { if (++requests === 1) throw new TypeError('network'); return Response.json({ annual_kwh_kwc: 900 }); }, waitImpl: async () => {}
  });
  assert.equal(result.annual_kwh_kwc, 900);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(requestSolarPreview('https://test.invalid/', { signal: controller.signal, fetchImpl: () => { throw Error('Must not fetch'); } }), { name: 'AbortError' });
  await assert.rejects(requestSolarPreview('https://test.invalid/', { fetchImpl: async () => Response.json({ annual_kwh_kwc: null }) }));
});
