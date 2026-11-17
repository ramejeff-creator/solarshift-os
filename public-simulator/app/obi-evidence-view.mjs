import { loadPublicEvidence } from './obi-rnb-bdnb-readonly.mjs';
import { supportedMuretCase } from './obi-public-evidence.mjs';

const make = (tag, text = '', className = '') => {
  const item = document.createElement(tag);
  if (text) item.textContent = String(text);
  if (className) item.className = className;
  return item;
};

const percent = value => Number.isFinite(Number(value)) ? `${(Number(value) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` : 'Non calculable';
const sourceDate = value => value ? new Date(value).toLocaleString('fr-FR') : 'Date indisponible';

function detailCard(host, title, state, summary) {
  const card = make('details', '', 'hubObiEvidenceCard');
  const head = make('summary');
  head.append(make('strong', title), make('span', state, 'hubObiEvidenceState'));
  card.append(head, make('p', summary));
  host.append(card);
  return card;
}

function sourceLine(host, name, url, date, target, error = '') {
  const line = make('p', '', 'hubObiEvidenceSource');
  if (url && /^https:\/\/(?:rnb-api\.beta\.gouv\.fr|api\.bdnb\.io)\//.test(url)) {
    const link = make('a', name); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; line.append(link);
  } else line.append(document.createTextNode(name));
  line.append(document.createTextNode(` · cible ${target || 'non précisée'} · consulté le ${sourceDate(date)}${error ? ` · ${error}` : ''}`));
  host.append(line);
}

function renderLiveEvidence(host, result) {
  const summary = result.summary;
  const wrapper = make('section', '', 'hubObiEvidenceResults');
  wrapper.setAttribute('aria-live', 'polite');
  const banner = result.state === 'PARTIAL'
    ? 'Résultat partiel : certaines sources n’ont pas répondu. Les valeurs inconnues restent non attribuées.'
    : result.state === 'NO_MATCH' ? 'Aucun bâtiment RNB ne correspond à l’intersection demandée. Cela ne prouve pas l’absence de bâtiment.'
      : 'Observations publiques live — elles décrivent des identités géographiques et un groupe BDNB, pas un occupant certifié.';
  wrapper.append(make('p', banner, result.state === 'PARTIAL' ? 'hubSheetWarning' : 'hubObiEvidenceBanner'));

  const identity = detailCard(wrapper, '1 · Correspondance géométrique', summary.rnb.state, summary.rnb.candidates.length
    ? `${summary.rnb.candidates.length} candidat${summary.rnb.candidates.length > 1 ? 's' : ''} RNB conservé${summary.rnb.candidates.length > 1 ? 's' : ''}. Classement par recouvrement géométrique approximatif; aucun lien d’occupation n’est établi.`
    : summary.rnb.error || 'Aucun candidat retourné pour cette emprise.');
  for (const candidate of summary.rnb.candidates) {
    const metrics = candidate.overlap
      ? `IoU local ≈ ${candidate.overlap.intersectionOverUnion.toLocaleString('fr-FR', { maximumFractionDigits: 3 })} · contour OSM couvert ${percent(candidate.overlap.osmCoveredByRnb)} · contour RNB couvert ${percent(candidate.overlap.rnbCoveredByOsm)} · ${candidate.overlap.method}`
      : 'Géométrie ponctuelle ou comparaison locale impossible; aucune métrique de recouvrement n’est déduite.';
    identity.append(make('h4', `RNB ${candidate.id}${candidate.active === false ? ' · identifiant inactif' : ''}`));
    identity.append(make('p', `État RNB : ${candidate.status}${candidate.distanceMeters == null ? '' : ` · distance API au point sélectionné : ${candidate.distanceMeters.toLocaleString('fr-FR')} m`}. ${candidate.address.join(' · ') || 'Adresse RNB non renseignée.'}`));
    identity.append(make('p', metrics));
  }
  if (summary.rnb.candidates.length > 1) identity.append(make('p', 'Plusieurs constructions RNB restent candidates. Une meilleure concordance géométrique priorise une vérification, sans départager l’occupation du site.', 'hubObiEvidenceCaveat'));

  const usageText = summary.bdnb.groups.flatMap(group => group.data.map(row => ({ group, row })))
    .map(({ group, row }) => `Groupe ${group.id} : usage principal « ${row.usage_principal_bdnb_open || 'non renseigné'} »${row.surface_emprise_sol == null ? '' : ` · emprise de groupe ${Number(row.surface_emprise_sol).toLocaleString('fr-FR')} m²`}.`);
  const usage = detailCard(wrapper, '2 · Usage du groupe BDNB', summary.bdnb.state, usageText.length
    ? `${usageText.join(' ')} L’usage concerne le groupe, qui peut réunir plusieurs constructions; il ne certifie pas l’activité de cette construction.`
    : summary.bdnb.state === 'UNAVAILABLE' ? 'BDNB Open indisponible. L’usage du groupe reste inconnu.'
      : summary.bdnb.state === 'NO_MATCH' ? 'Aucune correspondance RNB → construction → groupe BDNB n’a été retournée. Cela ne signifie pas absence de données.'
        : 'Usage du groupe BDNB non établi.');
  if (summary.bdnb.groups.length > 1) usage.append(make('p', 'Plusieurs groupes BDNB ont été retournés et restent distincts. Aucun indicateur n’est fusionné entre eux.', 'hubObiEvidenceCaveat'));

  const qualification = detailCard(wrapper, '3 · Qualification à instruire', 'UNKNOWN', 'Occupant de la construction, surface de plancher tertiaire, consommation du site, périmètre EFA/EET et besoin de rénovation : données insuffisantes.');
  const unknowns = make('dl', '', 'hubObiEvidenceUnknowns');
  for (const [label, value] of [
    ['Activité à cette construction', 'UNKNOWN'], ['Surface de plancher tertiaire', '—'],
    ['Toiture PV exploitable', '—'], ['Consommation réelle du site', '—'],
    ['Périmètre / conclusion EET', 'UNKNOWN'], ['Besoin de rénovation', 'UNKNOWN']
  ]) { const row = make('div'); row.append(make('dt', label), make('dd', value)); unknowns.append(row); }
  qualification.append(unknowns, make('p', `Question suivante : ${summary.nextQuestion}`, 'hubObiEvidenceQuestion'));

  const sources = make('details', '', 'hubObiEvidenceSources');
  sources.append(make('summary', 'Sources et limites'));
  sourceLine(sources, summary.rnb.source || 'RNB · API bâtiments', summary.rnb.url, summary.rnb.retrievedAt, `OSM way/${summary.target.id}`, summary.rnb.error);
  for (const mapping of result.mappings || []) sourceLine(sources, mapping.source || 'BDNB Open · correspondance RNB', mapping.url, mapping.retrievedAt, `RNB ${mapping.rnbId}`, mapping.error);
  for (const group of summary.bdnb.groups) sourceLine(sources, group.source || 'BDNB Open · groupe', group.url, group.retrievedAt, `BDNB_GROUP ${group.id}`, group.error);
  sources.append(make('p', 'OSM, RNB et groupe BDNB sont trois identités distinctes. Un usage tertiaire au niveau groupe n’établit ni l’exploitant, ni une surface de plancher, ni la consommation du site, ni une conclusion EET. Aires d’emprise au sol et toiture exploitable ne sont pas interchangeables.', 'hubObiEvidenceCaveat'));
  sources.append(make('p', `Requêtes de cette fiche : ${result.stats.requests} · durées observées : ${(result.stats.durationsMs || []).map(item => `${item.source} ${item.durationMs} ms`).join(' ; ') || 'aucune'}${result.stats.cacheHit ? ' · cache mémoire de session' : ''}. Aucun résultat n’est enregistré.`));
  wrapper.append(sources);
  host.replaceChildren(wrapper);
}

async function renderRecordedReference(host, candidate) {
  const response = await fetch('./obi-c2-muret-recorded-reference.json', { method: 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('La référence de démonstration locale est indisponible.');
  const fixture = await response.json();
  const item = fixture.cases?.[String(candidate.osmId)];
  if (!item) throw new Error('Aucune référence consignée ne correspond à cette emprise.');
  const wrapper = make('section', '', 'hubObiEvidenceResults');
  wrapper.append(make('p', `Référence consignée au ${fixture.observedAt} — données de rapport, pas une réponse API live. ${fixture.warning}`, 'hubObiEvidenceFixtureNote'));
  const identity = detailCard(wrapper, '1 · Correspondance géométrique', 'POC_LOCAL', `${item.rnb.length} candidat${item.rnb.length > 1 ? 's' : ''} RNB rapporté${item.rnb.length > 1 ? 's' : ''} pour ${item.address}.`);
  item.rnb.forEach(building => identity.append(make('p', `RNB ${building.id} · IoU approximative ${building.iouApprox} · intersection ~${building.intersectionM2Approx.toLocaleString('fr-FR')} m² · OSM couvert ${percent(building.osmCoveredByRnb)} · RNB couvert ${percent(building.rnbCoveredByOsm)}. Source : rapport C1 bis.`)));
  const group = item.bdnbGroup;
  const usage = detailCard(wrapper, '2 · Usage du groupe BDNB', 'POC_LOCAL', group
    ? `Groupe ${group.id}, membre(s) RNB ${group.memberRnbIds.join(', ')} : usage principal « ${group.usagePrincipal} » au niveau groupe · emprise de groupe ${group.groupFootprintM2.toLocaleString('fr-FR')} m². Ceci ne certifie pas l’usage de chaque construction.`
    : 'Aucun groupe ni usage n’est établi dans les preuves consignées pour Marclan.');
  const qualification = detailCard(wrapper, '3 · Qualification à instruire', 'UNKNOWN', 'Les données indiquées par le rapport restent inconnues; aucune activité ou conclusion n’est attribuée à la construction.');
  const list = make('ul'); item.unknown.forEach(value => list.append(make('li', value))); qualification.append(list, make('p', 'Question suivante : pouvez-vous confirmer quelle construction est occupée et transmettre un plan indiquant les surfaces tertiaires exploitées ?', 'hubObiEvidenceQuestion'));
  const sources = make('details', '', 'hubObiEvidenceSources'); sources.append(make('summary', 'Sources et limites'));
  const reportLink = make('a', 'Rapport C1 bis — références et méthode'); reportLink.href = '../docs/obi-001/B1-C1-BIS-DECISION.md'; reportLink.target = '_blank'; reportLink.rel = 'noopener noreferrer'; sources.append(reportLink);
  sources.append(make('p', 'Cette référence est un support de recette hors ligne, daté et non actualisé. Elle n’est pas substituée silencieusement aux appels live et ne prouve ni l’occupation, ni la surface tertiaire, ni l’EET.'));
  wrapper.append(sources); host.replaceChildren(wrapper);
}

export function mountObiEvidence(host, candidate) {
  let controller, generation = 0;
  const supported = supportedMuretCase(candidate);
  const controls = make('div', '', 'hubObiEvidenceControls');
  const liveButton = make('button', 'Vérifier les indices publics', 'hubSecondary'); liveButton.type = 'button'; liveButton.disabled = !supported;
  if (!supported) liveButton.title = 'Enrichissement live limité aux emprises Muret prévues en C2.';
  const fixtureButton = make('button', 'Afficher la référence locale consignée', 'hubSecondary'); fixtureButton.type = 'button'; fixtureButton.disabled = !supported;
  controls.append(liveButton, fixtureButton);
  const status = make('p', supported ? 'Aucun appel n’est effectué avant votre clic.' : 'Ce cas n’est pas inclus dans C2; aucune requête n’est envoyée.', 'hubObiEvidenceStatus');
  const results = make('div');
  host.append(controls, status, results);
  liveButton.onclick = async () => {
    controller?.abort(); controller = new AbortController();
    const current = ++generation;
    liveButton.disabled = true; fixtureButton.disabled = true; liveButton.textContent = 'Consultation des indices…';
    status.textContent = 'Lecture ciblée du contour sélectionné auprès du RNB, puis des identifiants et groupes BDNB Open associés…';
    results.replaceChildren();
    try {
      const { loadPublicEvidence } = await import('./obi-rnb-bdnb-readonly.mjs');
      const { summary, mappings, stats, state, reason } = await loadPublicEvidence(candidate, { signal: controller.signal });
      if (current !== generation) return;
      if (summary) renderLiveEvidence(results, { summary, mappings, stats, state });
      else results.replaceChildren(make('p', reason || 'Aucune preuve n’est disponible pour ce cas.', 'hubSheetWarning'));
      if (state === 'PARTIAL') status.textContent = 'Résultat partiel. Si CORS ou une source bloque, le prototype ne contourne pas ce blocage; utilisez la référence locale à titre de démonstration.';
      else status.textContent = state === 'UNKNOWN' ? (reason || 'Résultat inconnu.') : 'Consultation terminée. Les limites et les dates sont détaillées dans « Sources et limites ». ';
    } catch (error) {
      if (error?.name === 'AbortError' || current !== generation) return;
      status.textContent = 'La consultation live a échoué. Aucun proxy ni autre source n’est utilisé; la référence locale reste disponible pour la revue.';
      results.replaceChildren(make('p', error.message || 'Source publique indisponible.', 'hubSheetWarning'));
    } finally {
      if (current === generation) { liveButton.disabled = false; fixtureButton.disabled = false; liveButton.textContent = 'Réessayer la vérification live'; }
    }
  };
  fixtureButton.onclick = async () => {
    controller?.abort(); const current = ++generation; liveButton.disabled = true; fixtureButton.disabled = true;
    status.textContent = 'Chargement de la référence de rapport datée; aucun appel aux API…';
    try { await renderRecordedReference(results, candidate); if (current === generation) status.textContent = 'Référence locale affichée. Elle ne correspond pas à une réponse live.'; }
    catch (error) { if (current === generation) { status.textContent = 'Référence locale indisponible.'; results.replaceChildren(make('p', error.message, 'hubSheetWarning')); } }
    finally { if (current === generation) { liveButton.disabled = false; fixtureButton.disabled = false; } }
  };
  return { cancel() { generation++; controller?.abort(); } };
}
