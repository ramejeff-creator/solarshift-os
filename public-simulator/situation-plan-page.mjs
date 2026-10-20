import { cartographicObservation, requestJson } from './prospecting-data.mjs';
import { normalizeSiteAddressSuggestion, siteAddressAutocompleteUrl, parseCoordinatePair } from './site-address.mjs';
import { appendSituationPlan } from './situation-plan-ui.mjs';
const $ = id => document.getElementById(id), status = $('planLookupStatus'), choices = $('planChoices'), result = $('planResult');
const params = new URLSearchParams(location.search);
let version = 0, controller, selectedAddress = params.get('label')?.slice(0, 500) || '';
$('planSiteName').value = params.get('name')?.slice(0, 85) || 'Site à qualifier';
const lat = params.get('lat'), lon = params.get('lon');
if (lat && lon && parseCoordinatePair(`${lat}, ${lon}`)) $('planSiteLookup').value = `${lat}, ${lon}`;
if (/^[0-9A-Z]{14}$/.test(params.get('parcel') || '')) $('planSiteLookup').value = params.get('parcel');
function invalidate() { version++; controller?.abort(); choices.replaceChildren(); result.replaceChildren(); status.textContent = ''; }
$('planSiteLookup').addEventListener('input', () => { invalidate(); selectedAddress = ''; });
function button(label, action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = action; return b; }
async function lookupParcel(point, reference, run, signal) {
  if (run !== version) return;
  status.textContent = 'Consultation du cadastre IGN…'; choices.replaceChildren();
  const query = reference ? new URLSearchParams({ code_insee: reference.slice(0, 5), section: reference.slice(8, 10), numero: reference.slice(10) }) : new URLSearchParams({ geom: JSON.stringify({ type: 'Point', coordinates: [point.longitude, point.latitude] }) });
  const observation = await cartographicObservation('IGN API Carto · Cadastre', `https://apicarto.ign.fr/api/cadastre/parcelle?${query}`, { signal });
  if (run !== version) return;
  if (observation.state !== 'AVAILABLE') throw new Error('Cadastre indisponible. Réessayez.');
  const features = observation.data.filter(f => /^[0-9A-Z]{14}$/.test(f.properties?.idu || '') && (!reference || f.properties.idu === reference) && ['Polygon', 'MultiPolygon'].includes(f.geometry?.type));
  status.textContent = features.length ? 'Confirmez la parcelle à représenter.' : 'Aucune parcelle à ce point. Utilisez un point dans le terrain ou la référence cadastrale complète.';
  for (const feature of features) {
    const p = feature.properties;
    choices.append(button(`Utiliser ${p.section} ${p.numero} · ${p.nom_com || p.code_insee} · ${Number(p.contenance).toLocaleString('fr-FR')} m²`, () => {
      if (run !== version) return;
      result.replaceChildren(); const summary = document.createElement('h2'); summary.textContent = `Parcelle ${p.section} ${p.numero} · ${p.nom_com || p.code_insee}`; result.append(summary);
      appendSituationPlan(result, { parcel: { id: p.idu, geometry: feature.geometry } }, { active: () => run === version, identity: () => ({ name: $('planSiteName').value.trim() || 'Site à qualifier', address: selectedAddress }) });
      result.querySelector('details').open = true;
      status.textContent = `Parcelle confirmée · cadastre consulté le ${new Date(observation.retrievedAt).toLocaleString('fr-FR')}.`;
    }));
  }
}
$('planFindParcel').onclick = async () => {
  invalidate(); controller = new AbortController(); const signal = controller.signal, run = version, text = $('planSiteLookup').value.trim();
  try {
    const point = parseCoordinatePair(text), reference = /^[0-9A-Z]{14}$/.test(text.toUpperCase()) ? text.toUpperCase() : null;
    if (point || reference) { await lookupParcel(point, reference, run, signal); return; }
    if (text.length < 4) throw new Error('Renseignez une adresse, des coordonnées ou une référence cadastrale complète.');
    status.textContent = 'Recherche dans la base d’adresses IGN…';
    const payload = await requestJson(siteAddressAutocompleteUrl(text), { signal });
    if (run !== version) return;
    const addresses = (payload.results || []).map(normalizeSiteAddressSuggestion).filter(Boolean).slice(0, 8);
    status.textContent = addresses.length ? 'Choisissez l’adresse du site. Le repère d’adresse peut se situer sur une voie.' : 'Adresse non trouvée. Essayez les coordonnées dans la parcelle ou sa référence cadastrale.';
    for (const address of addresses) choices.append(button(address.label, async () => {
      if (run !== version) return;
      selectedAddress = address.label;
      try { await lookupParcel(address, null, run, signal); } catch (error) { if (run === version) status.textContent = error.message; }
    }));
  } catch (error) { if (run === version) status.textContent = error.message; }
};
