import { requestJson } from './prospecting-data.mjs';
import { downloadSituationPlan } from './situation-plan-pdf.mjs';
const el = (tag, text = '') => { const n = document.createElement(tag); n.textContent = text; return n; };

export function appendSituationPlan(host, snapshot, { identity = () => ({}), active = () => true } = {}) {
  if (!snapshot?.parcel?.geometry) return;
  const endpoint = window.SOLARSHIFT_CONFIG?.situationPlanEndpoint;
  const section = el('details'); section.className = 'situationPlan'; section.append(el('summary', 'Plan de situation HD à l’échelle'));
  section.append(el('p', 'Préparez un plan centré sur la parcelle, puis exportez-le en PDF à imprimer à taille réelle.'));
  const controls = el('div'); controls.className = 'situationPlanControls';
  function select(label, options) {
    const field = el('label', label), input = el('select'); input.dataset.suppressProjectDirty = 'true';
    for (const [value, title] of options) { const option = el('option', title); option.value = value; input.append(option); }
    field.append(input); controls.append(field); return input;
  }
  const base = select('Fond', [['plan', 'Plan IGN'], ['photo', 'Photo aérienne IGN']]);
  const format = select('Feuille', [['A4:landscape', 'A4 paysage'], ['A4:portrait', 'A4 portrait'], ['A3:landscape', 'A3 paysage'], ['A3:portrait', 'A3 portrait']]);
  const scale = select('Échelle', [1000, 500, 2000, 5000, 10000].map(n => [String(n), `1/${n.toLocaleString('fr-FR')}`]));
  const cadastreLabel = el('label'), cadastre = el('input'); cadastreLabel.className = 'situationPlanCadastre'; cadastre.type = 'checkbox'; cadastre.dataset.suppressProjectDirty = 'true'; cadastre.checked = true; cadastreLabel.append(cadastre, document.createTextNode('Cadastre')); controls.append(cadastreLabel);
  const prepare = el('button', 'Préparer l’aperçu'), download = el('button', 'Exporter le plan en PDF'); prepare.type = download.type = 'button'; prepare.className = download.className = 'secondary'; download.disabled = true; prepare.disabled = !endpoint;
  const status = el('p'), preview = el('div'); status.setAttribute('role', 'status'); preview.className = 'situationPlanPreview';
  section.append(controls, prepare, download, status, preview, el('p', '200 dpi · nord du quadrillage Lambert-93 · sources IGN / DGFiP. Le cadastre reste indicatif et ne remplace pas un bornage.'));
  host.append(section);
  let plan = null, controller, generation = 0;
  const current = run => run === generation && active() && section.isConnected;
  function invalidate() { generation++; controller?.abort(); plan = null; preview.replaceChildren(); download.disabled = true; prepare.disabled = !endpoint; status.textContent = 'Préparez un nouvel aperçu avec ces réglages.'; }
  controls.addEventListener('change', invalidate);
  prepare.onclick = async () => {
    invalidate(); controller = new AbortController(); const run = generation; prepare.disabled = true; status.textContent = 'Préparation du fond IGN en haute définition…';
    try {
      const [paper, orientation] = format.value.split(':');
      // This public, unauthenticated geographic endpoint reads JSON text and needs no CORS preflight.
      const result = await requestJson(endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ geometry: snapshot.parcel.geometry, base: base.value, format: paper, orientation, scale: Number(scale.value), cadastre: cadastre.checked }), signal: controller.signal, timeoutMs: 35000,
        fetcher: async (...args) => {
          let r;
          try { r = await fetch(...args); }
          catch (error) { throw new Error(`Connexion au service de plan impossible (${error.message}). Réessayez.`); }
          if (!r.ok) { const payload = await r.json().catch(() => null); throw new Error(payload?.error || `Fond IGN indisponible (HTTP ${r.status}).`); }
          return r;
        } });
      if (!current(run)) return;
      if (result.state !== 'AVAILABLE' || result.crs !== 'EPSG:2154' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(result.image || '')) throw new Error('Fond IGN invalide.');
      const image = el('img'); image.alt = 'Plan de situation à l’échelle : fond IGN et parcelle en rouge.'; image.src = result.image;
      await image.decode(); if (!current(run)) return;
      if (image.naturalWidth !== result.pixels[0] || image.naturalHeight !== result.pixels[1]) throw new Error('Dimensions du fond IGN incohérentes.');
      const map = el('div'); map.className = 'situationPlanMap'; map.append(image);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 1000 1000'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true');
      for (const rings of result.paths) {
        const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', rings.map(ring => ring.map(([x, y], i) => `${i ? 'L' : 'M'}${x * 1000},${y * 1000}`).join(' ') + ' Z').join(' '));
        path.setAttribute('fill', 'none'); path.setAttribute('stroke', '#c71f26'); path.setAttribute('stroke-width', '2'); path.setAttribute('vector-effect', 'non-scaling-stroke'); svg.append(path);
      }
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0);
      map.append(svg); preview.replaceChildren(map); plan = { ...result, image: canvas.toDataURL('image/jpeg', .96) }; download.disabled = false;
      status.textContent = `${result.groundM[0].toLocaleString('fr-FR')} × ${result.groundM[1].toLocaleString('fr-FR')} m · 200 dpi · aperçu prêt. Échelle respectée dans le PDF imprimé à 100 %.`;
    } catch (error) { if (current(run)) status.textContent = error.message; }
    finally { if (current(run)) prepare.disabled = false; }
  };
  download.onclick = () => { if (plan && active()) { downloadSituationPlan(plan, { ...identity(), parcelId: snapshot.parcel.id }); status.textContent = 'PDF exporté. Imprimez à 100 % / taille réelle, sans ajuster à la page.'; } };
}
