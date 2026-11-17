import { ficheMarkup, ficheStyles } from './obi-prospecting-fiche-template.mjs';
import { parcelsLinkedToBuilding } from './prospecting-data.mjs';
import { mountEetRegulatory } from './obi-eet-regulatory.mjs';
import { mountDvfHistory } from './obi-dvf-history.mjs';

const make = (tag, text = '', className = '') => {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
};
const fmt = value => value == null || value === '' || !Number.isFinite(Number(value)) ? 'inconnue' : Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 1 });

function indicatorCards(model, reference) {
  const current = model.publicObservations?.building;
  const group = current?.building ? { id: current.building.batiment_groupe_id, usagePrincipal: current.building.usage_principal_bdnb_open, groupFootprintM2: current.building.surface_emprise_sol } : reference?.bdnbGroup;
  const hasGroup = Boolean(group);
  const tertiaryClue = group?.usagePrincipal === 'Tertiaire';
  const hasRnb = Boolean(reference?.rnb?.length);
  const eet = {
    name: 'Éco Énergie Tertiaire', icon: '▦', tone: tertiaryClue || hasRnb ? 'review' : 'none',
    state: tertiaryClue || hasRnb ? 'À qualifier' : 'Non qualifié', source: hasGroup ? 'Indice public de groupe' : hasRnb ? 'Rapprochement RNB consigné' : 'Données insuffisantes',
    quantity: hasGroup ? `Usage « ${group.usagePrincipal || 'non renseigné'} » indiqué pour le groupe BDNB ${fmt(group.groupFootprintM2)} m².` : hasRnb ? `${reference.rnb.length} construction(s) RNB candidate(s) à cette adresse.` : 'Aucun périmètre tertiaire ou surface intérieure établi.',
    quality: 'L’activité, l’occupant, les surfaces de plancher et le périmètre d’exploitation ne sont pas attribués à ce contour.',
    next: 'Confirmer les bâtiments réellement exploités, l’activité et les surfaces avant d’évaluer l’applicabilité EET.',
    sourceDetails: hasGroup ? `BDNB Open ${current?.building ? 'consulté le ' + new Date(current.retrievedAt).toLocaleString('fr-FR') : 'consigné'} : l’usage et les ${fmt(group.groupFootprintM2)} m² concernent le groupe ${group.id}. Aucune extrapolation à une construction ou au contour OSM.` : 'Les éléments RNB consignés sont des candidats géométriques. Ils ne prouvent ni occupation, ni activité, ni assujettissement.'
  };
  const pv = {
    name: 'Photovoltaïque', icon: '☀', tone: 'review', state: 'À examiner', source: 'Repère cartographique',
    quantity: `Emprise au sol OSM estimée : ${fmt(model.surfaces.osm_footprint_area_m2)} m². Ce chiffre ne mesure pas la toiture.`,
    quality: 'Surface utile, état, forme, ombrage, accès, structure et raccordement ne sont pas documentés.',
    next: 'Lancer une pré-étude documentaire pour vérifier la toiture. Aucun kWc ni faisabilité n’est calculé ici.',
    sourceDetails: `OpenStreetMap, ${model.poc?.isDemo === false ? 'consultation du ' + new Date(model.provenance.source.retrievedAt).toLocaleString('fr-FR') : 'capture du 26/10/2026'} · © OpenStreetMap contributors · ODbL 1.0. L’emprise au sol sert au repérage uniquement.`
  };
  const renovation = {
    name: 'Rénovation / efficacité énergétique', icon: '⌁', tone: 'none', state: 'Non qualifié', source: 'Données insuffisantes',
    quantity: 'Consommation propre, factures et surface intérieure : inconnues.',
    quality: 'Aucun audit, DPE attribué au bon bâtiment ou besoin de travaux documenté.',
    next: 'Recueillir les informations sur les équipements et les besoins avant d’orienter vers un diagnostic.',
    sourceDetails: 'Un DPE non retrouvé par adresse ne prouve pas son absence. Un agrégat d’adresse ou une référence sectorielle ne constitue pas un diagnostic.'
  };
  return [pv, eet, renovation];
}

// Stable, pure qualification projection used by focused tests and other read-only consumers.
// Keep proof quality separate from the human-readable conclusion and preserve the scope of each clue.
export function qualificationCards(model, reference) {
  const displayed = indicatorCards(model, reference);
  const publicBuilding = model.publicObservations?.building?.building;
  const group = publicBuilding
    ? { id: publicBuilding.batiment_groupe_id, usagePrincipal: publicBuilding.usage_principal_bdnb_open }
    : reference?.bdnbGroup || null;
  const tertiaryGroup = group?.usagePrincipal === 'Tertiaire';
  const eet = displayed[1];
  const pv = displayed[0];
  const renovation = displayed[2];
  const eetTechnical = model.indicators?.eet;
  const pvTechnical = model.indicators?.pv;
  const renovationTechnical = model.indicators?.renovation;

  return [
    {
      id: 'eet', name: eet.name,
      scope: tertiaryGroup ? `BDNB_GROUP · ${group.id}` : 'UNKNOWN',
      conclusion: tertiaryGroup ? 'Applicabilité à vérifier' : 'Données insuffisantes',
      quality: tertiaryGroup ? 'Indice public' : 'Données insuffisantes',
      technical: tertiaryGroup ? `${eetTechnical?.conclusion || 'UNKNOWN'} / ${eetTechnical?.proof || 'INSUFFICIENT'}` : 'INSUFFICIENT / UNKNOWN',
      evidence: tertiaryGroup
        ? `Usage tertiaire indiqué pour le groupe uniquement (${group.id}); aucune attribution au contour du bâtiment. Référence enregistrée non live.`
        : 'Groupe BDNB, activité et surface de plancher non établis pour ce contour. Cette absence de preuve ne prouve pas une absence d’applicabilité EET.',
      source: eet.source,
      next: eet.next
    },
    {
      id: 'pv', name: pv.name, scope: model.target?.id || 'UNKNOWN',
      conclusion: 'Potentiel à vérifier', quality: 'Potentiel à vérifier',
      technical: `${pvTechnical?.conclusion || 'UNKNOWN'} / ${pvTechnical?.proof || 'INSUFFICIENT'}`,
      evidence: pv.quantity, source: pv.source, next: pv.next
    },
    {
      id: 'renovation', name: renovation.name, scope: model.target?.id || 'UNKNOWN',
      conclusion: 'Données insuffisantes', quality: 'Données insuffisantes',
      technical: `${renovationTechnical?.conclusion || 'UNKNOWN'} / ${renovationTechnical?.proof || 'INSUFFICIENT'}`,
      evidence: `${renovation.sourceDetails} L’absence de document lié ne prouve pas une absence de travaux.`,
      source: renovation.source, next: renovation.next
    }
  ];
}

function setRows(panel, entries) {
  const list = panel.querySelector('.key-list'); list.replaceChildren();
  for (const [label, value] of entries) {
    const line = make('div', '', 'key-row');
    line.append(make('div', label, 'k'), make('div', value, 'v')); list.append(line);
  }
}

export function mountQualificationPreview(host, { model, candidate, reference, energy, onReturn, onSaveProspect, onStartStudy, onRefreshObservations, withMap = false, isProspectSaved = false, eetRegulatoryEnabled = false }) {
  host.classList.remove('hubC4', 'hubObiDetail'); host.classList.add('hubValidatedFiche');
  const style = make('style'); style.textContent = ficheStyles;
  const content = make('div', '', 'wrap'); content.innerHTML = ficheMarkup;
  host.replaceChildren(style, content);
  const panels = [...content.querySelectorAll(':scope > section')];
  const [hero, overview, signals, energySection, actions] = panels;
  const returnBar = make('nav', '', 'ficheReturnBar');
  returnBar.setAttribute('aria-label', 'Retour à la recherche');
  returnBar.style.top = host.closest('dialog') ? '0px' : `${Math.ceil(document.querySelector('body > header.hubTopbar')?.getBoundingClientRect().height || 0)}px`;
  const returnButton = make('button', '← Retour aux résultats', 'btn');
  returnButton.type = 'button'; returnButton.setAttribute('aria-label', 'Retour aux résultats');
  returnButton.onclick = onReturn; returnBar.append(returnButton); content.prepend(returnBar);
  const isJoffrery = Number(candidate.osmId) === 81401972 && reference?.address === '41 boulevard de Joffrery, 31600 Muret';
  const showFictionalActors = isJoffrery && model.poc?.isDemo !== false;
  const title = hero.querySelector('h2'); title.textContent = reference?.address || 'Bâtiment repéré · contour ' + candidate.osmId;
  title.id = 'hubObiDetailTitle'; title.tabIndex = -1;
  hero.querySelector('.subtitle').textContent = 'Bâtiment sélectionné : contour OSM ' + model.target.id + ' · Rapprochement à confirmer';
  hero.querySelector('.badge.stage').textContent = isProspectSaved ? 'En prospection · vérifications en attente' : 'Repérage non qualifié';
  const heroMain = make('div', '', 'ficheHeroMain');
  heroMain.append(...hero.childNodes);
  const figure = make('figure', '', 'ficheMapFigure');
  figure.hidden = !withMap; hero.classList.toggle('has-context-map', withMap);
  const mapHost = make('div', '', 'ficheMapHost'); mapHost.id = 'hubObiDetailMapHost';
  const mapCaption = make('figcaption');
  mapCaption.append(document.createTextNode('Contour sélectionné · emprise au sol, toiture à vérifier. '));
  const osmCredit = make('a', '© OpenStreetMap contributors'); osmCredit.href = 'https://www.openstreetmap.org/copyright'; osmCredit.target = '_blank'; osmCredit.rel = 'noopener noreferrer';
  mapCaption.append(osmCredit, document.createTextNode(' · Imagerie © Esri.'));
  figure.append(mapHost, mapCaption); hero.append(heroMain, figure);

  const [site, building] = overview.querySelectorAll(':scope > article');
  setRows(site, [
    ['Établissement identifié', showFictionalActors ? 'Société Alpha Restauration (fictif) · activité déclarée : restauration · présence sur le bâtiment non confirmée' : 'Non identifié pour ce bâtiment'],
    ['Candidats et usages du site', reference?.rnb?.length ? reference.rnb.length + ' construction(s) RNB candidate(s) · ' + (isJoffrery ? 'restaurant, bar, négoce : activités possibles, à confirmer' : 'activité occupante non établie') : 'Activité et occupation à confirmer'],
    ['Exploitant', 'À identifier et confirmer'],
    ['Propriétaire', showFictionalActors ? 'SCI Joffrery Activités (fictif) · piste de démonstration, occupation non prouvée' : 'Non établi'],
    ['Interlocuteur à contacter', 'À qualifier · rôle et coordonnées à vérifier']
  ]);
  const dvfHistory = eetRegulatoryEnabled === true ? mountDvfHistory(site, { model, candidate }) : null;
  setRows(building, [
    ['RNB pressenti', reference?.rnb?.length ? reference.rnb.map(r => r.id).join(' · ') + ' · rapprochement géométrique non confirmé' : 'Non établi'],
    ['Emprise au sol estimée', fmt(model.surfaces.osm_footprint_area_m2) + ' m² · toiture à vérifier'],
    ['Distance du point de recherche', fmt(candidate.distanceMeters) + ' m'],
    ['Parcelles citées dans les captures', isJoffrery ? '31395000AM0010 (B0) · 31395000AM0014 (Pappers)' : 'Non renseignées pour ce cas'],
    ['Rattachement cadastral', 'À confirmer pour ce contour'],
    ['Zonage PLU', isJoffrery ? 'UF (capture B0) · règlement à vérifier' : 'Non renseigné pour ce cas'],
    ['Activité rattachée au bâtiment', 'Non établie']
  ]);
  if (!isJoffrery) building.querySelector('.proof-line').textContent = 'Les références cadastrales et le zonage doivent être établis pour le bâtiment sélectionné.';

  let eetRegulatory = null;
  function refreshSignalCards() {
    const cards = indicatorCards(model, reference);
    signals.querySelectorAll('.trigger-card').forEach((article, i) => {
    const card = cards[i]; article.querySelector('h4').textContent = card.name;
    const badges = article.querySelector('.trigger-badges');
    badges.children[0].textContent = card.state; badges.children[0].className = 'trigger-state ' + (card.tone === 'none' ? 'none' : 'review');
    badges.children[1].textContent = card.source;
    const copies = article.querySelectorAll('.criterion-copy > span'); copies[0].textContent = card.quantity; copies[1].textContent = card.quality;
    article.querySelector('.trigger-next').replaceChildren(make('strong', 'Démarche : '), document.createTextNode(card.next));
    const details = article.querySelector('.details-body');
    const evidenceReader = details.querySelector('.hubObiEvidenceEntry');
    details.replaceChildren(make('p', card.sourceDetails));
    const indicator = i === 0 ? model.indicators.pv : i === 1 ? model.indicators.eet : model.indicators.renovation;
    details.append(make('p', 'État technique : ' + indicator.conclusion + ' / ' + indicator.proof + ' · revue humaine en attente', 'proof-line'));
    if (i === 1) details.dataset.publicEvidence = '';
    if (evidenceReader) details.append(evidenceReader);
  });
    eetRegulatory?.update();
  }
  refreshSignalCards();
  if (eetRegulatoryEnabled === true) eetRegulatory = mountEetRegulatory({ content, signals, actions, model, reference });
  signals.querySelector('.warning-box').textContent = 'Le mandataire décide de poursuivre à partir des signaux observés et des vérifications à mener. Aucun score ni seuil automatique n’est appliqué.';

  const [benchmark, measurements] = energySection.querySelectorAll(':scope > article');
  for (const select of benchmark.querySelectorAll('select')) {
    [...select.options].forEach((option, i) => { if (i > 0) option.disabled = true; });
    select.disabled = true; select.title = 'Seule la référence 2024 reproduite de la capture B0 est disponible localement.';
  }
  if (!isJoffrery) {
    benchmark.querySelector('.info-box').textContent = 'Aucune référence sectorielle sélectionnée pour ce bâtiment. Confirmer son activité avant de choisir une catégorie de comparaison.';
    benchmark.querySelectorAll('.mini-stats, .bars, .operat-toolbar').forEach(node => node.remove());
    const captions = benchmark.querySelectorAll('.eyebrow'); if (captions.length > 1) captions[captions.length - 1].remove();
  }
  const measuredRows = [
    ['Consommation finale annuelle propre', 'Inconnue · aucun kWh réel attribué au site'],
    ...(energy?.totalMwh == null ? [] : [
      ['Agrégat public à l’adresse', fmt(energy.totalMwh) + ' MWh/an · non attribué au contour'],
      [`Références Enedis publiées (${energy.latestYear || 'année non précisée'})`, `${Array.isArray(energy.latest) ? energy.latest.length : 0} lignes publiées · catégories/statistiques d’adresse, pas des compteurs attribués au bâtiment`]
    ]),
    ['Surface tertiaire intérieure', 'Inconnue'],
    ['Factures / données de comptage', 'Non disponibles / non communiquées'],
    ['DPE tertiaire', 'Non établi pour ce bâtiment · portée de recherche limitée'],
    ['Éco Énergie Tertiaire', 'À instruire']
  ];
  setRows(measurements, measuredRows);
  const observationStatus = make('p', '', 'proof-line'); observationStatus.setAttribute('role', 'status');
  const observationProgress = make('progress'); observationProgress.setAttribute('aria-label', 'Chargement des données de la fiche');
  const sourceDetails = make('details'); sourceDetails.append(make('summary', 'Sources publiques consultées'));
  const sourceLines = make('div', '', 'details-body'); sourceDetails.append(sourceLines);
  const refreshButton = make('button', 'Actualiser les données publiques', 'btn'); refreshButton.type = 'button'; refreshButton.hidden = !onRefreshObservations;
  measurements.append(observationStatus, observationProgress, refreshButton, sourceDetails); sourceDetails.hidden = true;
  const isConnected = model.poc?.isDemo === false;
  observationProgress.hidden = !isConnected;
  observationStatus.textContent = isConnected ? 'Recherche des données publiques du bâtiment…' : '';
  measurements.setAttribute('aria-busy', String(isConnected));
  function showObservationError(message) {
    observationProgress.hidden = true; refreshButton.disabled = false; measurements.setAttribute('aria-busy', 'false');
    observationStatus.textContent = message || 'Consultation indisponible. Vous pouvez réessayer.';
  }
  function updateObservations(result) {
    if (!result?.observations) return;
    const { observations, energy: published } = result;
    model.publicObservations = observations;
    refreshSignalCards();
    const matched = observations.building.building;
    const linked = matched ? parcelsLinkedToBuilding(observations.parcels.data, matched) : [];
    const rows = [
      ['Emprise au sol OSM estimée', fmt(model.surfaces.osm_footprint_area_m2) + ' m² · toiture à vérifier'],
      ['Distance du point de recherche', fmt(candidate.distanceMeters) + ' m'],
      ['Usage déclaré du groupe BDNB', matched?.usage_principal_bdnb_open || 'Non renseigné'],
      ['Année de construction du groupe', matched?.annee_construction == null ? 'Non renseignée' : String(matched.annee_construction)],
      ['Hauteur moyenne du groupe', matched?.hauteur_mean == null ? 'Non renseignée' : fmt(matched.hauteur_mean) + ' m'],
      ['Section / numéro de parcelle', linked.length ? linked.map(p => `${p.properties.section || '?'} / ${p.properties.numero || '?'}`).join(' · ') : 'Non établis'],
      ['Contenance cadastrale liée', linked.length ? linked.map(p => p.properties.contenance == null ? 'Non renseignée' : fmt(p.properties.contenance) + ' m² de terrain').join(' · ') : 'Non établie'],
      ['Zonage PLU intersectant le contour', observations.planning.data.length ? observations.planning.data.map(zone => zone.properties?.libelle || zone.properties?.libelong || 'Zone sans libellé').join(' · ') : observations.planning.error || 'Non retrouvé'],
      ['Activité occupante rattachée au bâtiment', 'Non établie']
    ];
    setRows(building, rows);
    building.querySelector('.proof-line').textContent = 'Rattachement spatial au groupe BDNB à contrôler. Les attributs du groupe ne sont pas extrapolés au contour OSM. Les parcelles affichées sont explicitement liées au groupe ; le zonage ne suffit pas à établir la faisabilité.';
    if (matched?.libelle_adr_principale_ban) title.textContent = matched.libelle_adr_principale_ban;
    if (isConnected) setRows(site, [
      ['Établissement identifié', 'Non identifié par les sources consultées'],
      ['Contexte du groupe BDNB', matched?.usage_principal_bdnb_open ? `Usage « ${matched.usage_principal_bdnb_open} » publié pour le groupe ; activité exploitante à confirmer.` : 'Usage non établi'],
      ['Exploitant', 'À identifier et confirmer'], ['Propriétaire', 'Non établi par ces lecteurs publics'],
      ['Interlocuteur à contacter', 'À identifier · rôle et coordonnées à vérifier']
    ]);
    dvfHistory?.update();
    const energyRows = [
      ['Consommation finale annuelle propre', 'Inconnue · aucun kWh individuel attribué au bâtiment'],
      ['Agrégat public à l’adresse', published?.totalMwh != null ? `${Number(published.totalMwh).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} MWh/an · ${published.latestYear} · non attribué au contour` : published?.reason || 'Aucun agrégat retrouvé à une adresse vérifiée'],
      ...(published?.totalMwh == null ? [] : [[`Références Enedis publiées (${published.latestYear || 'année non précisée'})`, `${Array.isArray(published.latest) ? published.latest.length : 0} lignes publiées · statistiques d’adresse, pas des compteurs attribués au bâtiment`]]),
      ['Surface tertiaire intérieure', 'Inconnue'], ['Factures / données de comptage', 'Non communiquées'],
      ['DPE tertiaire', 'Non établi pour ce bâtiment'], ['Éco Énergie Tertiaire', 'À instruire']
    ];
    setRows(measurements, energyRows);
    sourceLines.replaceChildren(); sourceDetails.hidden = false;
    for (const source of [observations.building, observations.parcels, observations.planning]) {
      const p = make('p');
      if (source.url) { const a = make('a', source.name); a.href = source.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; p.append(a); }
      else p.append(document.createTextNode(source.name));
      p.append(document.createTextNode(` · ${source.retrievedAt ? new Date(source.retrievedAt).toLocaleString('fr-FR') : 'non consulté'} · ${source.error || (source.state === 'SPATIAL_MATCH' ? 'rapprochement spatial à confirmer' : source.state === 'AVAILABLE' ? 'source disponible' : 'rattachement non établi')}`)); sourceLines.append(p);
    }
    if (published?.address) {
      const p = make('p', `Enedis Open Data · ${published.address.label || published.address.address} · ${published.latestYear || 'année non précisée'} · ${published.retrievedAt ? new Date(published.retrievedAt).toLocaleString('fr-FR') : ''}. Agrégat d’adresse ; aucune attribution individuelle.`); sourceLines.append(p);
    }
    for (const warning of published?.warnings || []) sourceLines.append(make('p', warning));
    observationProgress.hidden = true; refreshButton.disabled = false; measurements.setAttribute('aria-busy', 'false');
    observationStatus.textContent = [observations.building, observations.parcels, observations.planning].some(s => s.state === 'UNAVAILABLE') || published?.state === 'UNAVAILABLE' || published?.partial ? 'Consultation partielle : certaines sources sont indisponibles. Les erreurs sont détaillées dans les sources.' : 'Données publiques consultées. Rattachements et périmètres à confirmer.';
  }
  refreshButton.onclick = async () => {
    refreshButton.disabled = true; observationProgress.hidden = false; observationStatus.textContent = 'Actualisation des données publiques…'; measurements.setAttribute('aria-busy', 'true');
    try { updateObservations(await onRefreshObservations()); } catch (error) { if (error.name !== 'AbortError') showObservationError(error.message); }
  };
  if (model.publicObservations) updateObservations({ observations: model.publicObservations, energy: candidate.energy || energy?.enedisAddressAggregate || energy });
  const indicatorsLink = measurements.querySelector('a');
  indicatorsLink.onclick = event => { event.preventDefault(); signals.scrollIntoView({ block: 'start', behavior: 'smooth' }); };

  const buttons = actions.querySelectorAll('.final-action-grid button');
  const [save, study, close] = buttons;
  save.id = 'hubObiSaveProspect'; save.disabled = isProspectSaved; save.textContent = isProspectSaved ? 'Prospect déjà enregistré' : 'Enregistrer le prospect';
  save.title = ''; save.onclick = onSaveProspect;
  save.nextElementSibling.textContent = 'Ajoute la fiche à la liste « En prospection » du mandataire, avec vérifications en attente.';
  study.disabled = !onStartStudy; study.onclick = onStartStudy;
  study.title = onStartStudy ? 'Préparer un dossier dans le parcours photovoltaïque' : 'Ouvrez le parcours PV depuis la liste des projets.';
  study.nextElementSibling.textContent = 'Ouvre la création d’un dossier PV. La toiture, les hypothèses et les données nécessaires restent à renseigner dans le parcours dédié.';
  close.disabled = false; close.title = ''; close.onclick = onReturn;
  close.nextElementSibling.textContent = 'Revient aux résultats en conservant la recherche, les filtres et la carte.';
  actions.querySelector('.badge').textContent = 'Choisir la suite';
  actions.querySelector('.proof-line').remove();
  content.querySelector('footer').textContent = model.poc?.isDemo === false ? 'Fiche de prospection · données publiques à vérifier · références B0 et C1 consignées, non actualisées · aucune attribution automatique au bâtiment.' : 'Fiche de prospection · repères publics à vérifier · acteurs fictifs uniquement dans le cas de démonstration Joffrery.';
  host.setAttribute('aria-labelledby', title.id); host.hidden = false;
  title.focus({ preventScroll: true }); host.scrollIntoView({ block: 'start', behavior: 'instant' });
  return { updateObservations, showObservationError };
}
