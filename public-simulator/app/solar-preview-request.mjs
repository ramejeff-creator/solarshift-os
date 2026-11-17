const TRANSIENT_STATUSES = new Set([429, 502, 503, 504]);
const abortError = () => new DOMException('Calcul annulé', 'AbortError');
function wait(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(abortError()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, milliseconds);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
// Retrying GET requests is safe. Never substitute an invented production or gain.
export async function requestSolarPreview(url, { signal, fetchImpl = fetch, waitImpl = wait, onRetry = () => {} } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw abortError();
    let response;
    try { response = await fetchImpl(url, { signal }); }
    catch (error) {
      if (signal?.aborted || error?.name === 'AbortError' || attempt === 2) throw error;
      onRetry(attempt + 1); await waitImpl(500 * 2 ** attempt, signal); continue;
    }
    if (!response.ok) {
      if (TRANSIENT_STATUSES.has(response.status) && attempt < 2) {
        onRetry(attempt + 1); await waitImpl(500 * 2 ** attempt, signal); continue;
      }
      throw new Error('Le calcul solaire est momentanément indisponible. Vos données sont conservées ; réessayez dans quelques instants.');
    }
    const result = await response.json();
    if (typeof result.annual_kwh_kwc !== 'number' || !Number.isFinite(result.annual_kwh_kwc) || result.annual_kwh_kwc <= 0)
      throw new Error('Le service de calcul solaire a renvoyé un résultat incomplet. Réessayez dans quelques instants.');
    return result;
  }
}
