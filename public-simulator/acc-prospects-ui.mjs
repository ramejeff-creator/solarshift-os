import { CATEGORIES, STATUSES, FOLLOW_UP_STAGES, QUALITIES, MAX_PROSPECTS, coordinates, distanceMeters, normalizeProspect, restoreCollective, collectiveSnapshot, filterProspects } from './acc-prospects-model.mjs';
import { searchEstablishments } from './acc-prospects-search.mjs';
import { ENERGY_INTEREST, APPRAISAL_RELIABILITY, DECISION_MAKER, OCCUPANCY, prospectAppraisals, energyAssessmentKey } from './acc-prospect-appraisals.mjs';
import { suggestEnergyInterest } from './acc-energy-suggestion.mjs';

const node = (tag, text = '', className = '') => { const n = document.createElement(tag); n.textContent = text; n.className = className; return n; };
const number = value => value == null ? 'À renseigner' : Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
const distance = value => value == null ? 'Distance inconnue' : value < 1000 ? `${number(value)} m` : `${(value / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} km`;
const radiusLabel = value => value < 1000 ? `${value} m` : `${(value / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`;
const fillSelect = (select, choices) => Object.entries(choices).forEach(([value, label]) => { const option = node('option', label); option.value = value; select.append(option); });

export function mountAccProspects({ project, onSave, initialProspectId = '', search = searchEstablishments, leaflet = globalThis.L }) {
  const $ = id => document.getElementById(id), form = $('accForm'), dialog = $('accDialog');
  let prospects = restoreCollective(project.preview?.accCollective), discoveries = [], dirty = false, saving = false, searching = false, activeId = initialProspectId || null, editing = null, controller = null, automaticSearchStarted = false, activeView = 'results';
  let map = null, markers = null, radiusLayer = null, hasFit = false, mapFailed = false, hoveredId = null;
  const mapMarkers = new Map();
  let energyFormBaseline = '', energyFormMode = 'AUTO';
  const origin = coordinates(project);
  const state = (message, tone = '') => { $('accState').textContent = message; $('accState').dataset.tone = tone; $('accState').hidden = !message; };
  function buttons() { $('accSave').hidden = !dirty; $('accSave').disabled = !dirty || saving; $('accSearch').disabled = !origin || saving || searching; $('accCancelSearch').hidden = !searching; }
  function changed() { dirty = true; state('Modifications à enregistrer dans le dossier.', 'warning'); buttons(); }
  function setView(view) {
    activeView = view;
    $('accTabResults').classList.toggle('is-active', view === 'results'); $('accTabResults').setAttribute('aria-selected', String(view === 'results'));
    $('accTabFollowup').classList.toggle('is-active', view === 'followup'); $('accTabFollowup').setAttribute('aria-selected', String(view === 'followup'));
    $('accResultsView').hidden = view !== 'results'; $('accFollowupView').hidden = view !== 'followup';
    if (view === 'followup' && !prospects.some(p => p.id === activeId)) activeId = filterFollowupRows()[0]?.id || prospects[0]?.id || null;
    else if (view === 'results' && !rows().some(p => p.id === activeId)) activeId = rows()[0]?.id || null;
    render();
    if (view === 'results') requestAnimationFrame(() => { map?.invalidateSize?.({ pan: false }); renderMap(visibleRows()); });
  }
  function highlightProspect(id) {
    hoveredId = id;
    const prospectById = new Map(rows().map(prospect => [prospect.id, prospect]));
    for (const [markerId, marker] of mapMarkers) {
      const prospect = prospectById.get(markerId), active = markerId === id, selected = Boolean(prospect?.selected);
      marker.setStyle?.({ color: active ? '#9f2d83' : selected ? '#0c5445' : '#567f8b', fillColor: active ? '#e54bbd' : selected ? '#0c5445' : '#89aab6', fillOpacity: active ? 1 : .85, weight: active ? 4 : 2 });
      marker.setRadius?.(active ? 11 : selected ? 8 : 6);
    }
    for (const card of $('accList').children || []) card.classList?.toggle('is-hovered', card.dataset.prospectId === id);
  }
  const rows = () => [...prospects, ...discoveries.filter(candidate => !prospects.some(p => p.id === candidate.id))];
  const retained = id => prospects.some(p => p.id === id);
  function keep(prospect) {
    if (!retained(prospect.id) && prospects.length >= MAX_PROSPECTS) throw new Error(`Limite de ${MAX_PROSPECTS} pistes par dossier atteinte.`);
    const previous = prospects.findIndex(p => p.id === prospect.id);
    if (previous < 0) prospects.push(prospect); else prospects[previous] = prospect;
    changed(); render();
  }
  function open(prospect = null) {
    editing = prospect; form.reset(); $('accFormState').textContent = '';
    $('accDialogTitle').textContent = prospect ? prospect.name : 'Ajouter un prospect';
    for (const control of form.elements) {
      if (!control.name) continue;
      if (control.type === 'checkbox') control.checked = prospect?.[control.name] === true;
      else control.value = prospect?.[control.name] ?? ({ category: 'OTHER', status: 'IDENTIFIED', energyQuality: 'UNKNOWN', schedule: 'UNKNOWN', seasonality: 'UNKNOWN' }[control.name] || '');
    }
    for (const name of ['schedule', 'seasonality']) {
      const select = form.elements.namedItem(name), previous = prospect?.[name];
      if (previous && ![...select.children].some(option => option.value === previous)) { const option = node('option', `Valeur précédente : ${previous}`); option.value = previous; select.append(option); select.value = previous; }
    }
    const energy = prospect?.appraisals?.energy || {};
    const commercial = prospect?.appraisals?.commercial || {};
    $('accUseEnergySuggestion').hidden = !(energy.level && energy.level !== 'UNKNOWN');
    for (const [name, value] of Object.entries({
      appEnergyLevel: energy.level || 'UNKNOWN', appEnergyReliability: energy.reliability || 'UNKNOWN', appEnergyRationale: energy.rationale || '',
      appEnergyReference: energy.reference || '', appEnergyDate: energy.assessedOn || ''
    })) form.elements.namedItem(name).value = value;
    for (const [name, value] of Object.entries({
      appDecisionMaker: commercial.decisionMaker || 'UNKNOWN', appOccupancy: commercial.occupancy || 'UNKNOWN',
      appCommercialReliability: commercial.reliability || 'UNKNOWN', appCommercialRationale: commercial.rationale || '',
      appCommercialReference: commercial.reference || '', appCommercialDate: commercial.assessedOn || ''
    })) form.elements.namedItem(name).value = value;
    energyFormMode = energy.level && energy.level !== 'UNKNOWN' || energy.confirmation ? 'MANUAL' : 'AUTO';
    const directoryAddress = Boolean(prospect?.identification?.siret || prospect?.sourceUrl);
    form.elements.namedItem('address').readOnly = directoryAddress;
    $('accLocationNote').textContent = directoryAddress ? 'Adresse issue du répertoire public, conservée comme repère. Les coordonnées cartographiques restent liées à la source et ne sont pas modifiables ici.' : 'Pour un prospect ajouté manuellement, indiquez son adresse. Cette fiche ne sera pas placée sur la carte sans coordonnées.';
    if (energyFormMode === 'AUTO') prefillEnergySuggestion();
    energyFormBaseline = energyAssessmentKey(energyFields());
    previewAppraisals();
    $('accSource').replaceChildren();
    if (prospect?.sourceUrl) { const a = node('a', `Voir la fiche source · ${prospect.source}`); a.href = prospect.sourceUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'; $('accSource').append(a, document.createTextNode(` · repéré le ${new Date(prospect.observedAt).toLocaleDateString('fr-FR')}.`)); }
    else $('accSource').textContent = 'Fiche renseignée par le mandataire.';
    if (prospect?.identification?.siret) $('accSource').append(document.createTextNode(` · SIRET ${prospect.identification.siret}${prospect.identification.activityCode ? ` · APE ${prospect.identification.activityCode}` : ''}.`));
    dialog.showModal();
  }
  function formProspect() {
    const value = name => form.elements.namedItem(name).value;
    return { ...editing, category: value('category'), status: value('status'),
      annualKwh: value('annualKwh') === '' ? null : Number(value('annualKwh')), energyQuality: value('energyQuality'), energySource: value('energySource'), energyDate: value('energyDate'),
      schedule: value('schedule'), seasonality: value('seasonality') };
  }
  function energyFields() {
    const value = name => form.elements.namedItem(name).value;
    return { level: value('appEnergyLevel'), reliability: value('appEnergyReliability'), rationale: value('appEnergyRationale'), reference: value('appEnergyReference'), assessedOn: value('appEnergyDate') };
  }
  function suggestedFields(prospect) {
    const suggestion = suggestEnergyInterest(prospect);
    return { level: suggestion.level, reliability: suggestion.reliability,
      rationale: `${suggestion.reasons[0] || 'Activité à préciser.'} À vérifier auprès de l’établissement.`.slice(0, 1500),
      reference: `Suggestion ACC${prospect.identification?.activityCode ? ` · APE ${prospect.identification.activityCode}` : ''}`.slice(0, 500),
      assessedOn: suggestion.generatedAt.slice(0, 10) };
  }
  function prefillEnergySuggestion() {
    const suggested = suggestedFields(formProspect());
    for (const [field, name] of Object.entries({ level: 'appEnergyLevel', reliability: 'appEnergyReliability', rationale: 'appEnergyRationale', reference: 'appEnergyReference', assessedOn: 'appEnergyDate' })) form.elements.namedItem(name).value = suggested[field];
    energyFormMode = 'AUTO'; energyFormBaseline = energyAssessmentKey(suggested);
    // A suggestion is recorded with the fiche; its low reliability remains visible.
  }
  function readAppraisals(forSave = false) {
    const proposal = energyFields(), prospect = formProspect(), assessmentKey = energyAssessmentKey(proposal);
    const automatic = energyFormMode === 'AUTO' && assessmentKey === energyAssessmentKey(suggestedFields(prospect));
    const origin = automatic ? 'SUGGESTION' : 'MANDATAIRE';
    let energy;
    if (forSave) energy = { ...proposal, origin };
    else if (energyFormMode === 'MANUAL' && assessmentKey === energyFormBaseline) energy = editing?.appraisals?.energy || { ...proposal, origin };
    else energy = { ...proposal, origin, pending: true, pendingOrigin: origin };
    const commercial = {
      decisionMaker: form.elements.namedItem('appDecisionMaker').value,
      occupancy: form.elements.namedItem('appOccupancy').value,
      reliability: form.elements.namedItem('appCommercialReliability').value,
      rationale: form.elements.namedItem('appCommercialRationale').value,
      reference: form.elements.namedItem('appCommercialReference').value,
      assessedOn: form.elements.namedItem('appCommercialDate').value
    };
    return { schemaVersion: 1, energy, commercial };
  }
  function appraisalCards(prospect, host) {
    const assessment = prospectAppraisals(prospect).energy, block = node('div', '', 'acc-appraisals');
    const card = node('section', '', 'acc-appraisal'); card.dataset.appraisal = 'energy'; card.dataset.level = assessment.level;
    card.append(node('span', 'Piste énergétique à examiner', 'acc-appraisal-label'), node('strong', assessment.label));
    card.append(node('small', 'Fiabilité : ' + APPRAISAL_RELIABILITY[assessment.reliability] + (assessment.confidence === 'LOW' ? ' · faible' : '')));
    const details = node('details'), list = node('ul');
    details.append(node('summary', 'Justification et limites'));
    assessment.reasons.forEach(reason => list.append(node('li', reason))); details.append(list);
    if (assessment.reference) details.append(node('p', 'Référence : ' + assessment.reference, 'acc-muted'));
    if (assessment.assessedOn) details.append(node('p', 'Appréciation / suggestion du ' + new Date(assessment.assessedOn + 'T12:00:00').toLocaleDateString('fr-FR'), 'acc-muted'));
    for (const url of assessment.references || []) { const link = node('a', 'Référence de méthode'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; details.append(link); }
    card.append(details); block.append(card); host.append(block);
    const commercial = prospectAppraisals(prospect).commercial;
    const commercialCard = node('section', '', 'acc-appraisal'); commercialCard.dataset.appraisal = 'commercial';
    commercialCard.append(node('span', 'Avancement du contact', 'acc-appraisal-label'), node('strong', commercial.label));
    commercialCard.append(node('small', 'Fiabilité : ' + APPRAISAL_RELIABILITY[commercial.reliability]));
    const commercialDetails = node('details'), commercialList = node('ul');
    commercialDetails.append(node('summary', 'Repères de suivi'));
    commercial.reasons.forEach(reason => commercialList.append(node('li', reason)));
    commercialDetails.append(commercialList);
    if (commercial.reference) commercialDetails.append(node('p', 'Référence : ' + commercial.reference, 'acc-muted'));
    if (commercial.assessedOn) commercialDetails.append(node('p', 'Appréciation du ' + new Date(commercial.assessedOn + 'T12:00:00').toLocaleDateString('fr-FR'), 'acc-muted'));
    commercialCard.append(commercialDetails); block.append(commercialCard);
  }
  function previewAppraisals() {
    const host = $('accAppraisalPreview'); host.replaceChildren();
    const prospect = formProspect(), suggestion = suggestEnergyInterest(prospect);
    $('accEnergySuggestionState').textContent = 'Piste qualitative fondée sur l’activité publiée : ' + ENERGY_INTEREST[suggestion.level] + '. Fiabilité ' + (suggestion.confidence === 'LOW' ? 'faible' : 'insuffisante') + ' ; consommation et adéquation horaire inconnues. Cette suggestion n’est ni une mesure ni un matching.';
    appraisalCards({ ...prospect, appraisals: readAppraisals() }, host);
  }
  function focusProspect(prospect, fromMap = false) {
    activeId = prospect.id;
    const filtersHide = !visibleRows().some(p => p.id === prospect.id);
    render();
    if (filtersHide) return;
    if (fromMap) {
      const card = [...$('accList').children].find(n => n.dataset.prospectId === prospect.id);
      card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (map && coordinates(prospect)) map.setView([prospect.latitude, prospect.longitude], Math.max(map.getZoom(), 15));
  }
  function renderNextChecks(prospect) {
    const title = $('accNextTitle'), checks = $('accNextChecks'), proof = $('accProofLine');
    checks.replaceChildren();
    if (!prospect) { title.textContent = 'Prochaine vérification'; checks.append(node('p', 'Sélectionnez une piste pour afficher les vérifications utiles.', 'acc-muted')); proof.textContent = ''; return; }
    title.textContent = 'Points à confirmer avant décision';
    const steps = [
      'Confirmer l’adresse et l’activité réellement présentes sur le site.',
      prospect.annualKwh == null ? 'Documenter la consommation avec une source, une date et l’autorisation requise.' : 'Vérifier la source et la période de référence de la consommation.',
      'Vérifier séparément les règles géographiques à partir des points de livraison et d’injection.'
    ];
    steps.forEach((text, index) => { const row = node('div', '', 'acc-check'); row.append(node('span', String(index + 1), 'acc-check-number'), node('span', text)); checks.append(row); });
    proof.textContent = [prospect.source || 'Source non indiquée', prospect.observedAt ? 'information observée le ' + new Date(prospect.observedAt).toLocaleDateString('fr-FR') : 'date indisponible'].join(' · ');
  }
  function summary() {
    const host = $('accSummary'); host.replaceChildren();
    const stages = [
      ['Établissements repérés', rows().length, 'Pistes à vérifier dans cette recherche'],
      ['Retenues pour l’étude', prospects.filter(p => p.selected && !['REFUSED', 'OUTSIDE', 'EXCLUDED'].includes(p.status)).length, 'Choix explicite du mandataire'],
      ['À vérifier', prospects.filter(p => !p.selected && !['REFUSED', 'OUTSIDE', 'EXCLUDED'].includes(p.status)).length, 'Pistes conservées à qualifier'],
      ['Rayon exploré', radiusLabel(Number($('accRadius').value)), 'Autour du site de référence']
    ];
    for (const [label, count, note] of stages) {
      const card = node('article', '', 'acc-kpi');
      card.append(node('span', label), node('strong', typeof count === 'number' ? number(count) : count), node('p', note));
      host.append(card);
    }
  }  function visibleRows() {
    return filterProspects(rows(), { query: $('accQuery').value, category: $('accCategory').value, status: $('accStatus')?.value || '', sort: $('accSort')?.value || 'distance', origin });
  }
  function filterFollowupRows() {
    const query = $('accFollowupQuery').value.trim().toLocaleLowerCase('fr'), stage = $('accFollowupStage').value, qualification = $('accFollowupQualification').value;
    return prospects.filter(p => {
      const text = [p.name, CATEGORIES[p.category], p.address, p.contact, p.phone, p.email, p.nextAction, p.notes].join(' ').toLocaleLowerCase('fr');
      return (!query || text.includes(query)) && (!stage || p.followUpStage === stage) && (!qualification || p.status === qualification);
    }).sort((a, b) => (a.followUpDate || '9999-12-31').localeCompare(b.followUpDate || '9999-12-31') || a.name.localeCompare(b.name, 'fr'));
  }
  function renderFollowupTable(visible) {
    $('accFollowupCount').textContent = String(prospects.length);
    $('accFollowupResultsCount').textContent = visible.length + ' entreprise(s) · ' + prospects.length + ' dans le suivi';
    const host = $('accFollowupList'); host.replaceChildren();
    if (!visible.length) {
      const row = node('tr'), cell = node('td', prospects.length ? 'Aucune piste ne correspond à ces filtres.' : 'Aucune piste dans le suivi. Ajoutez-en depuis la carte ou les résultats.'); cell.colSpan = 4; row.append(cell); host.append(row); return;
    }
    for (const prospect of visible) {
      const row = node('tr'); row.dataset.prospectId = prospect.id; row.classList.toggle('is-active', prospect.id === activeId);
      row.addEventListener('click', event => { if (event.target.closest('select,input,button')) return; activeId = prospect.id; render(); });
      const identity = node('td'), name = node('button', prospect.name, 'acc-followup-name'); name.type = 'button'; name.onclick = () => { activeId = prospect.id; render(); };
      identity.append(name, node('span', (CATEGORIES[prospect.category] || CATEGORIES.OTHER) + ' · ' + (prospect.address || 'Adresse à renseigner'), 'acc-followup-sub'));
      const qualification = node('td', STATUSES[prospect.status] || STATUSES.IDENTIFIED, 'acc-tag' + (prospect.selected ? ' is-selected' : ['REFUSED', 'OUTSIDE', 'EXCLUDED'].includes(prospect.status) ? ' is-excluded' : ' is-discovery'));
      const stageCell = node('td'), stage = document.createElement('select'); fillSelect(stage, FOLLOW_UP_STAGES); stage.value = prospect.followUpStage; stage.setAttribute('aria-label', 'Avancement de ' + prospect.name); stage.disabled = saving;
      stage.onchange = () => { try { activeId = prospect.id; keep(normalizeProspect({ ...prospect, followUpStage: stage.value })); } catch (error) { stage.value = prospect.followUpStage; state(error.message, 'error'); } };
      stageCell.append(stage);
      const actionCell = node('td'), action = document.createElement('input'), due = document.createElement('input');
      action.type = 'text'; action.maxLength = 240; action.value = prospect.nextAction || ''; action.placeholder = 'Action à planifier'; action.setAttribute('aria-label', 'Prochaine action pour ' + prospect.name); action.disabled = saving;
      due.type = 'date'; due.value = prospect.followUpDate || ''; due.setAttribute('aria-label', 'Date de relance pour ' + prospect.name); due.disabled = saving;
      const saveAction = () => { try { activeId = prospect.id; keep(normalizeProspect({ ...prospect, nextAction: action.value, followUpDate: due.value })); } catch (error) { state(error.message, 'error'); } };
      action.addEventListener('change', saveAction); due.addEventListener('change', saveAction); actionCell.append(action, due);
      row.append(identity, qualification, stageCell, actionCell); host.append(row);
    }
  }
  function renderList(visible) {
    const host = $('accList'); hoveredId = null; host.replaceChildren();
    if (!visible.length) {
      const empty = rows().length ? 'Aucun établissement ne correspond aux filtres.' : 'Aucun établissement repéré. La recherche se lance à l’ouverture de cette étape ; vous pouvez aussi ajouter une piste connue manuellement.';
      host.append(node('p', empty, 'acc-empty')); return;
    }
    for (const prospect of visible) {
      const card = node('article', '', 'acc-prospect acc-prospect-compact' + (prospect.selected ? ' is-selected' : '') + (prospect.id === activeId ? ' is-active' : ''));
      card.dataset.prospectId = prospect.id;
      card.addEventListener('mouseenter', () => highlightProspect(prospect.id));
      card.addEventListener('mouseleave', () => highlightProspect(null));
      card.addEventListener('focusin', () => highlightProspect(prospect.id));
      card.addEventListener('focusout', event => { if (!card.contains(event.relatedTarget)) highlightProspect(null); });
      const head = node('div', '', 'acc-prospect-head'), title = node('button', prospect.name);
      title.type = 'button'; title.onclick = () => focusProspect(prospect);
      title.setAttribute('aria-pressed', String(prospect.id === activeId));
      const heading = node('h3'); heading.append(title);
      const stageText = STATUSES[prospect.status] || STATUSES.IDENTIFIED;
      head.append(heading, node('span', stageText, 'acc-tag' + (prospect.selected ? ' is-selected' : ['REFUSED', 'OUTSIDE', 'EXCLUDED'].includes(prospect.status) ? ' is-excluded' : ' is-discovery')));
      card.append(head);
      const category = CATEGORIES[prospect.category] || CATEGORIES.OTHER;
      card.append(node('p', category + (prospect.identification?.activityCode ? ' · APE ' + prospect.identification.activityCode : ''), 'acc-muted'));
      const metres = distanceMeters(origin, prospect);
      card.append(node('p', (prospect.address || 'Adresse indisponible') + ' · ' + (metres == null ? 'distance indisponible' : metres < 1000 ? Math.round(metres / 10) * 10 + ' m' : (metres / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' km'), 'acc-prospect-meta'));
      const dataState = prospect.annualKwh == null ? 'Consommation non renseignée' : number(prospect.annualKwh) + ' kWh/an · ' + (QUALITIES[prospect.energyQuality] || 'fiabilité à préciser');
      card.append(node('p', dataState, 'acc-prospect-energy'));
      host.append(card);
    }
  }
  function renderSelectedDetail(prospect) {
    const host = $(activeView === 'followup' ? 'accFollowupDetail' : 'accSelectedDetail');
    if (!host) return;
    host.replaceChildren();
    if (!prospect) { host.append(node('p', activeView === 'followup' ? 'Sélectionnez une entreprise dans le tableau.' : 'Aucune piste visible. Modifiez le rayon ou les filtres pour poursuivre.', 'acc-muted')); return; }
    const heading = node('div', '', 'acc-selected-heading'), identity = node('div');
    identity.append(node('h3', prospect.name));
    const category = CATEGORIES[prospect.category] || CATEGORIES.OTHER;
    const metres = distanceMeters(origin, prospect);
    const distanceText = metres == null ? 'Distance inconnue' : metres < 1000 ? Math.round(metres / 10) * 10 + ' m du site' : (metres / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' km du site';
    identity.append(node('p', [category, distanceText].join(' · '), 'acc-muted'));
    heading.append(identity);
    if (retained(prospect.id)) {
      const status = document.createElement('select'); status.setAttribute('aria-label', 'Qualification ACC pour ' + prospect.name); fillSelect(status, STATUSES); status.value = prospect.status; status.disabled = saving;
      status.onchange = () => { try { activeId = prospect.id; keep(normalizeProspect({ ...prospect, status: status.value })); } catch (error) { status.value = prospect.status; state(error.message, 'error'); } };
      heading.append(status);
    } else heading.append(node('span', STATUSES[prospect.status] || STATUSES.IDENTIFIED, 'acc-tag' + (prospect.status === 'TO_VERIFY' ? ' is-discovery' : '')));
    host.append(heading);
    const metrics = node('div', '', 'acc-selected-metrics');
    const annual = prospect.annualKwh == null ? 'Non renseignée' : number(prospect.annualKwh) + ' kWh/an';
    const scheduleLabels = { UNKNOWN: 'À confirmer', DAY: 'Principalement en journée', DAY_EVENING: 'Journée et soirée', CONTINUOUS: 'En continu', NIGHT: 'Principalement la nuit', WEEKEND: 'Surtout le week-end', VARIABLE: 'Variable selon les jours' };
    const seasonalityLabels = { UNKNOWN: 'À confirmer', YEAR_ROUND: 'Activité toute l’année', SCHOOL_BREAKS: 'Fermeture pendant les vacances', SUMMER_CLOSURE: 'Fermeture en été', WINTER_CLOSURE: 'Fermeture en hiver', SEASONAL: 'Activité saisonnière', VARIABLE: 'Variable selon la période' };
    const scheduleLabel = scheduleLabels[prospect.schedule] || prospect.schedule || 'À confirmer';
    const seasonalityLabel = seasonalityLabels[prospect.seasonality] || prospect.seasonality || 'À confirmer';
    const energyDetail = prospect.annualKwh == null
      ? 'Aucune mesure reliée à cette piste.'
      : (QUALITIES[prospect.energyQuality] || 'Fiabilité inconnue') + ' · ' + (prospect.energySource || 'source non renseignée') + ' · ' + (prospect.energyDate ? new Date(prospect.energyDate + 'T12:00:00').toLocaleDateString('fr-FR') : 'date non renseignée');
    for (const [label, value, note] of [
      ['Adresse', prospect.address || 'Indisponible', prospect.latitude != null && prospect.longitude != null ? 'Repère cartographique indicatif' : 'Aucun repère cartographique'],
      ['Consommation annuelle', annual, energyDetail],
      ['Présence habituelle', scheduleLabel, 'Déclaration à documenter'],
      ['Saisonnalité', seasonalityLabel, 'À confirmer avec l’établissement']
    ]) {
      const item = node('div', '', 'acc-selected-metric'); item.append(node('span', label), node('strong', value), node('small', note)); metrics.append(item);
    }
    host.append(metrics);
    const provenance = node('div', '', 'acc-selected-provenance');
    if (prospect.sourceUrl) {
      const link = node('a', prospect.source || 'Consulter la source publique'); link.href = prospect.sourceUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
      provenance.append(node('span', 'Provenance'), link);
    } else provenance.append(node('span', 'Provenance'), node('strong', prospect.source || 'Saisie du mandataire'));
    const observed = prospect.observedAt ? new Date(prospect.observedAt).toLocaleDateString('fr-FR') : 'date indisponible';
    provenance.append(node('small', 'Information observée le ' + observed + (prospect.identification?.activityCode ? ' · APE ' + prospect.identification.activityCode : '')));
    host.append(provenance);
    appraisalCards(prospect, host);
    if (activeView === 'followup' && retained(prospect.id)) {
      const trackingForm = document.createElement('form'); trackingForm.className = 'acc-followup-edit-grid';
      const addField = (labelText, name, type = 'text', wide = false) => {
        const label = node('label', labelText, wide ? 'wide' : ''), control = type === 'textarea' ? document.createElement('textarea') : document.createElement(type === 'select' ? 'select' : 'input');
        control.name = name; control.disabled = saving;
        if (type === 'select') fillSelect(control, FOLLOW_UP_STAGES);
        else if (type !== 'textarea') control.type = type;
        else control.rows = 2;
        control.value = prospect[name] || '';
        label.append(control); trackingForm.append(label); return control;
      };
      const followStage = addField('Avancement', 'followUpStage', 'select');
      addField('Interlocuteur', 'contact'); addField('Téléphone', 'phone', 'tel'); addField('E-mail', 'email', 'email');
      addField('Prochaine action', 'nextAction', 'text', true); addField('Date de relance', 'followUpDate', 'date', true); addField('Note de suivi', 'notes', 'textarea', true);
      followStage.value = prospect.followUpStage;
      const submit = node('button', 'Enregistrer le suivi', 'acc-primary acc-followup-save'); submit.type = 'submit'; submit.disabled = saving; trackingForm.append(submit);
      trackingForm.addEventListener('submit', event => {
        event.preventDefault();
        try { const data = Object.fromEntries(new FormData(trackingForm)); activeId = prospect.id; keep(normalizeProspect({ ...prospect, ...data })); state('Suivi mis à jour. Enregistrez-le dans le dossier.', 'warning'); }
        catch (error) { state(error.message, 'error'); }
      });
      host.append(trackingForm);
    }
    const actions = node('div', '', 'acc-selected-actions');
    const edit = node('button', retained(prospect.id) ? 'Compléter la fiche' : 'Ouvrir la fiche complète');
    edit.type = 'button'; edit.disabled = saving; edit.onclick = () => open(prospect); actions.append(edit);
    if (!retained(prospect.id)) {
      const add = node('button', 'Ajouter au suivi', 'acc-primary'); add.type = 'button'; add.disabled = saving;
      add.onclick = () => { try { activeId = prospect.id; keep(normalizeProspect({ ...prospect, followUpStage: 'TO_CONTACT' })); setView('followup'); } catch (error) { state(error.message, 'error'); } };
      actions.append(add);
      const retain = node('button', 'Retenir pour l’étude'); retain.type = 'button'; retain.disabled = saving || ['REFUSED', 'OUTSIDE', 'EXCLUDED'].includes(prospect.status);
      retain.onclick = () => { try { activeId = prospect.id; keep(normalizeProspect({ ...prospect, selected: true, followUpStage: 'TO_CONTACT' })); setView('followup'); } catch (error) { state(error.message, 'error'); } };
      actions.append(retain);
    }
    host.append(actions);
  }
  function drawMap(visible, fitRadius = false) {
    if (!leaflet) { $('accMap').hidden = true; $('accMapState').textContent = 'La carte est indisponible. La liste et les fiches restent accessibles.'; return; }
    const points = visible.filter(p => coordinates(p));
    if (!map) {
      // Leaflet needs a loaded viewport before adding circles to its renderer.
      map = leaflet.map($('accMap'), { scrollWheelZoom: false, center: origin ? [origin.latitude, origin.longitude] : [46.6, 2.4], zoom: origin ? 14 : 5 });
      leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
      markers = leaflet.layerGroup().addTo(map);
    }
    markers.clearLayers(); mapMarkers.clear();
    if (origin) leaflet.circleMarker([origin.latitude, origin.longitude], { radius: 10, color: '#876415', fillColor: '#eac04c', fillOpacity: 1, weight: 2 }).bindTooltip('Site du projet').addTo(markers);
    for (const prospect of points) {
      const active = hoveredId === prospect.id || activeId === prospect.id;
      const marker = leaflet.circleMarker([prospect.latitude, prospect.longitude], { radius: active ? 11 : prospect.selected ? 8 : 7, color: active ? '#9f2d83' : prospect.selected ? '#0c5445' : '#3c7f5a', fillColor: active ? '#e54bbd' : prospect.selected ? '#0c5445' : '#64a77b', fillOpacity: active ? 1 : .88, weight: active ? 4 : 2 });
      marker.bindTooltip(node('span', prospect.name)); marker.on('mouseover', () => highlightProspect(prospect.id)); marker.on('mouseout', () => highlightProspect(null)); marker.on('click', () => focusProspect(prospect, true)); marker.addTo(markers); mapMarkers.set(prospect.id, marker);
    }
    radiusLayer?.remove();
    if (origin) radiusLayer = leaflet.circle([origin.latitude, origin.longitude], { radius: Number($('accRadius').value), color: '#d95520', weight: 3, dashArray: '8 5', fillColor: '#ff8a45', fillOpacity: .17, interactive: false }).addTo(map);
    let bounds = radiusLayer?.getBounds?.() || null;
    if (bounds) points.forEach(p => bounds.extend([p.latitude, p.longitude]));
    else if (origin || points.length) bounds = leaflet.latLngBounds([...(origin ? [[origin.latitude, origin.longitude]] : []), ...points.map(p => [p.latitude, p.longitude])]);
    if (bounds?.isValid?.() && (!hasFit || fitRadius)) { map.fitBounds(bounds, { padding: [35, 35], maxZoom: 15, animate: false }); hasFit = true; }
    if (!bounds?.isValid?.()) map.setView([46.6, 2.4], 5);
    $('accMapState').textContent = `${visible.length - points.length} établissement(s) sans coordonnées.${!origin ? ' Localisez le projet dans la pré-étude pour activer la recherche à proximité.' : ' Le cercle représente le rayon de prospection.'}`;
  }
  function renderMap(visible, fitRadius = false) {
    const container = $('accMap');
    if (!container || container.isConnected === false
      || Number.isFinite(container.clientWidth) && container.clientWidth < 10
      || Number.isFinite(container.clientHeight) && container.clientHeight < 10) return;
    if (mapFailed) return;
    try { map?.invalidateSize?.({ pan: false }); drawMap(visible, fitRadius); }
    catch (error) {
      mapFailed = true;
      try { map?.remove(); } catch { /* A partially initialized map may not support cleanup. */ }
      map = null; markers = null; radiusLayer = null;
      $('accMap').hidden = true;
      $('accMapState').textContent = 'La carte est momentanément indisponible. La recherche, la liste et les fiches restent accessibles. Rechargez la page pour réessayer la carte.';
      console.warn('Carte ACC indisponible.', error);
    }
  }
  function render() {
    summary();
    if (activeView === 'followup') {
      const visible = filterFollowupRows();
      if (!visible.some(p => p.id === activeId)) activeId = visible[0]?.id || '';
      const active = visible.find(p => p.id === activeId) || null;
      renderFollowupTable(visible); renderSelectedDetail(active); buttons(); return;
    }
    const visible = visibleRows();
    if (!visible.some(p => p.id === activeId)) activeId = visible[0]?.id || '';
    const active = visible.find(p => p.id === activeId) || null;
    renderList(visible); renderSelectedDetail(active); renderNextChecks(active); renderMap(visible);
    $('accSortState').textContent = $('accSort').value === 'energy'
      ? 'Tri par avis énergétique du mandataire, puis par suggestion qualitative.' : '';
    $('accResultsCount').textContent = visible.length + ' piste(s) affichée(s)'; buttons();
  }
  function printFollowup() {
    const visible = filterFollowupRows();
    const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const rows = visible.map(prospect => `<tr><td><strong>${escape(prospect.name)}</strong><br>${escape(CATEGORIES[prospect.category] || CATEGORIES.OTHER)} · ${escape(prospect.address || 'Adresse à renseigner')}</td><td>${escape(STATUSES[prospect.status] || STATUSES.IDENTIFIED)}</td><td>${escape(FOLLOW_UP_STAGES[prospect.followUpStage] || FOLLOW_UP_STAGES.TO_CONTACT)}<br>${escape(prospect.contact || '')}${prospect.phone ? '<br>' + escape(prospect.phone) : ''}${prospect.email ? '<br>' + escape(prospect.email) : ''}</td><td>${escape(prospect.nextAction || 'À définir')}<br>${escape(prospect.followUpDate || 'Date à définir')}</td><td>${escape(prospect.notes || '')}</td></tr>`).join('');
    const projectName = escape(project.name || 'Projet OZENO');
    const printWindow = window.open('', '_blank');
    if (!printWindow) { state('Autorisez l’ouverture de la fenêtre pour imprimer le suivi.', 'warning'); return; }
    printWindow.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Suivi ACC · ${projectName}</title><style>body{font:13px Arial,sans-serif;color:#183e35;margin:24px}h1{font-size:20px;margin:0 0 4px}p{color:#66766f;margin:0 0 18px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #dce5de;padding:8px;text-align:left;vertical-align:top}th{background:#edf4ef;font-size:11px}td{font-size:11px;line-height:1.45}@media print{body{margin:12mm}}</style></head><body><h1>Suivi de prospection ACC</h1><p>${projectName} · ${visible.length} piste(s) · imprimé le ${new Date().toLocaleDateString('fr-FR')}</p><table><thead><tr><th>Établissement</th><th>Qualification ACC</th><th>Prospection / contact</th><th>Prochaine action</th><th>Notes</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Aucune piste dans le suivi.</td></tr>'}</tbody></table><script>window.onload=()=>window.print()</scr` + `ipt></body></html>`);
    printWindow.document.close();
  }
  fillSelect($('accCategory'), CATEGORIES);
  $('accStatus').replaceChildren($('accStatus').children[0]);
  $('accFollowupQualification').replaceChildren($('accFollowupQualification').children[0]);
  fillSelect($('accStatus'), STATUSES);
  fillSelect($('accFollowupQualification'), STATUSES);
  for (const [name, choices] of Object.entries({ category: CATEGORIES, status: STATUSES, energyQuality: QUALITIES,
    schedule: { UNKNOWN: 'À confirmer', DAY: 'Principalement en journée', DAY_EVENING: 'Journée et soirée', CONTINUOUS: 'En continu', NIGHT: 'Principalement la nuit', WEEKEND: 'Surtout le week-end', VARIABLE: 'Variable selon les jours' },
    seasonality: { UNKNOWN: 'À confirmer', YEAR_ROUND: 'Activité toute l’année', SCHOOL_BREAKS: 'Fermeture pendant les vacances', SUMMER_CLOSURE: 'Fermeture en été', WINTER_CLOSURE: 'Fermeture en hiver', SEASONAL: 'Activité saisonnière', VARIABLE: 'Variable selon la période' } })) fillSelect(form.elements.namedItem(name), choices);
  for (const [name, choices] of Object.entries({ appEnergyLevel: ENERGY_INTEREST, appEnergyReliability: APPRAISAL_RELIABILITY,
    appDecisionMaker: DECISION_MAKER, appOccupancy: OCCUPANCY, appCommercialReliability: APPRAISAL_RELIABILITY })) fillSelect(form.elements.namedItem(name), choices);
  $('accProjectLabel').textContent = [project.name, project.address].filter(Boolean).join(' · ');
  $('accApp').hidden = false; state('');
  $('accTabResults').onclick = () => setView('results'); $('accTabFollowup').onclick = () => setView('followup');
  for (const id of ['accFollowupQuery', 'accFollowupStage', 'accFollowupQualification']) $(id).addEventListener(id === 'accFollowupQuery' ? 'input' : 'change', render);
  $('accFollowupPrint').onclick = printFollowup;
  $('accRadiusOutput').textContent = radiusLabel(Number($('accRadius').value)); $('accRadiusOutput').value = radiusLabel(Number($('accRadius').value));
  $('accAdd').onclick = () => open(); $('accClose').onclick = () => dialog.close();
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const data = Object.fromEntries(new FormData(form)); data.selected = form.elements.namedItem('selected').checked;
      const prospect = normalizeProspect({ ...editing, ...data, appraisals: readAppraisals(true) }); keep(prospect); activeId = prospect.id; dialog.close(); render();
    } catch (error) { $('accFormState').textContent = error.message; }
  });
  function appraisalInput(event) {
    const name = event?.target?.name;
    const facts = ['category', 'annualKwh', 'energyQuality', 'energySource', 'energyDate', 'schedule', 'seasonality'];
    if (facts.includes(name)) {
      if (energyFormMode === 'AUTO' && energyAssessmentKey(energyFields()) === energyFormBaseline) prefillEnergySuggestion();
    }
    previewAppraisals();
  }
  form.addEventListener('input', appraisalInput); form.addEventListener('change', appraisalInput);
  $('accUseEnergySuggestion').onclick = () => { prefillEnergySuggestion(); previewAppraisals(); };
  fillSelect(form.elements.namedItem('followUpStage'), FOLLOW_UP_STAGES);
  for (const id of ['accCategory', 'accStatus', 'accSort']) $(id).addEventListener('change', render);
  $('accQuery').addEventListener('input', render);
  $('accRadius').addEventListener('input', () => {
    const radiusMeters = Number($('accRadius').value);
    $('accRadiusOutput').value = radiusLabel(radiusMeters);
    $('accRadiusOutput').textContent = radiusLabel(radiusMeters);
    summary();
    renderMap(visibleRows(), true);
  });
  $('accRadius').addEventListener('change', () => { if (origin && !searching) void searchNearby(); });
  $('accCancelSearch').onclick = () => controller?.abort();
  async function searchNearby() {
    searching = true; controller?.abort(); controller = new AbortController(); buttons(); $('accSearchProgress').hidden = false; $('accSearchPhase').textContent = 'Connexion aux sources de données…'; $('accSearchProgress').setAttribute('aria-busy', 'true'); $('accSearchState').textContent = 'La recherche peut prendre quelques instants. Vous pouvez l’annuler.';
    try {
      const results = await search(origin, { radiusMeters: Number($('accRadius').value), signal: controller.signal, onProgress: phase => { $('accSearchPhase').textContent = phase; } });
      if (controller.signal.aborted) throw new DOMException('Recherche annulée.', 'AbortError');
      discoveries = results.slice(0, 500); hasFit = false;
      const source = results.searchInfo?.source || 'OpenStreetMap';
      const coverage = results.searchInfo?.partial ? ` · sélection partielle issue de ${results.searchInfo.companiesRead} entreprise(s) examinée(s)` : '';
      $('accSearchState').textContent = `${results.length} établissement(s) repéré(s) · ${source}${coverage}${results.length > 500 ? ' · 500 premiers affichés, réduisez le rayon pour affiner' : ''}. Vérifiez l’activité et l’occupation avant de contacter. Conservez les fiches utiles dans le dossier.`;
      render();
    } catch (error) { $('accSearchState').textContent = error.name === 'AbortError' ? 'Recherche annulée. Les fiches conservées restent disponibles.' : error.message; }
    finally { searching = false; controller = null; $('accSearchProgress').hidden = true; $('accSearchProgress').removeAttribute('aria-busy'); buttons(); }
  }
  $('accSearch').onclick = searchNearby;
  $('accSave').onclick = async () => {
    saving = true; render(); state('Enregistrement d’une nouvelle version du dossier…');
    try {
      const snapshot = collectiveSnapshot(prospects, project.id), updated = await onSave(snapshot);
      project = updated; prospects = restoreCollective(updated.preview?.accCollective); dirty = false;
      state(`Collectif enregistré dans le dossier · version ${project.version}.`);
    } catch (error) { state(`${error.message} Vos modifications restent disponibles dans cette page.`, 'error'); }
    finally { saving = false; render(); }
  };
  render();
  return { getProspects: () => structuredClone(prospects), getDirty: () => dirty, activate: () => { hasFit = false; renderMap(visibleRows()); }, refreshMap: () => { hasFit = false; renderMap(visibleRows()); } };
}
