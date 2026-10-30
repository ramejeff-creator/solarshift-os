import pilotCatalog from '../_shared/funding-core/data/pilot-catalog.json' with { type: 'json' };
import { evaluatePublicFundingHint } from '../_shared/funding-public-preview.mjs';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 8192) return json({ error: 'Request too large' }, 413);
  let body: unknown = null;
  try { body = JSON.parse(rawBody); } catch { return json({ error: 'Valid JSON body required' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'JSON body required' }, 400);

  try {
    const hint = evaluatePublicFundingHint(body, pilotCatalog, new Date().toISOString().slice(0, 10));
    // The public surface receives only neutral copy, never program names, criteria or amounts.
    return json(hint);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid_public_funding_input';
    return json({ error: message }, 400);
  }
});
