import { buildProjectDashboardModel, STATUS_LABELS } from './project-dashboard-model.mjs';

const config = window.SOLARSHIFT_CONFIG || {};
const apiBase = config.supabaseUrl;
const apiKey = config.supabasePublishableKey;
const sessionKey = config.sessionStorageKey || 'ozeno-supabase-session';
const functions = `${apiBase}/functions/v1`;
const params = new URLSearchParams(location.search);
const projectId = params.get('projectId');
const statusNode = document.getElementById('dashboardStatus');
const content = document.getElementById('dashboardContent');
const $ = (id) => document.getElementById(id);
let accessToken = null;
let projectData = null;
let scenarioData = null;
let selectedPerspective = params.get('perspective');

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fmt = (value, unit = '', maximumFractionDigits = 1) => value == null || !Number.isFinite(Number(value))
  ? 'À compléter'
  : `${Number(value).toLocaleString('fr-FR', { maximumFractionDigits })}${unit ? ` ${unit}` : ''}`;
const labelStatus = (status) => STATUS_LABELS[status] || STATUS_LABELS.UNKNOWN;
const lifecycleLabel = (status) => ({ DRAFT: 'Brouillon', CALCULATED: 'Calculé', VALIDATED: 'Validé', PUBLISHED: 'Publié', RETIRED: 'Archivé' })[status] || 'Statut à compléter';
const badge = (status, text = labelStatus(status)) => `<span class="statusBadge" data-status="${esc(status || 'UNKNOWN')}">${esc(text)}</span>`;
const setNotice = (message, kind = '') => { statusNode.textContent = message; statusNode.className = `notice${kind ? ` ${kind}` : ''}`; statusNode.hidden = false; };

function getSession() {
  try { return JSON.parse(localStorage.getItem(sessionKey) || 'null'); } catch { return null; }
}

async function getFunction(name, query) {
  const response = await fetch(`${functions}/${name}?${new URLSearchParams(query)}`, {
    headers: { apikey: apiKey, Authorization: `Bearer ${accessToken}` }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || result.message || `Service indisponible (${response.status}).`);
  return result;
}

function setLinks(href) {
  $('workspaceNav').href = href;
  $('preStudyNav').href = `./index.html?projectId=${encodeURIComponent(projectId)}`;
  $('technicalLink').href = `${href.split('#')[0]}#solarAreaSummary`;
  $('energyLink').href = href;
  $('financeLink').href = href;
}

function renderScenarioPicker(scenarios, active) {
  const picker = $('scenarioPicker');
  $('scenarioPickerWrap').hidden = !scenarios.length;
  if (!scenarios.length) return;
  picker.innerHTML = scenarios.map((scenario) => `<option value="${esc(scenario.id)}" ${scenario.id === active?.id ? 'selected' : ''}>${esc(scenario.name)} · v${esc(scenario.version)} · ${esc(lifecycleLabel(scenario.status))}</option>`).join('');
}

function renderKpis(model) {
  $('kpiRow').innerHTML = model.kpis.map((item) => {
    const value = item.status === 'STALE' ? 'À actualiser' : fmt(item.value, item.unit, item.key === 'irr' ? 2 : 1);
    return `<article class="kpiCard" data-status="${esc(item.status)}"><span>${esc(item.label)}</span><strong>${esc(value)}</strong>${badge(item.status)}</article>`;
  }).join('');
}

const areaKind = (kind) => ({ ROOF: 'Toiture', PARKING_CANOPY: 'Ombrière', GROUND_MOUNTED: 'Au sol', AGRIVOLTAIC: 'Agrivoltaïsme', BUILDING_FACADE: 'Façade', FLOATING: 'Installation flottante', OTHER: 'Autre' })[kind] || 'Type à compléter';
const orientation = (degrees) => degrees == null ? 'À compléter' : `${Number(degrees)}°`;

function renderTechnical(model) {
  const { configuration, areas } = model.technical;
  $('technicalStatus').dataset.status = model.technical.status;
  $('technicalStatus').textContent = labelStatus(model.technical.status);
  if (!configuration) {
    $('technicalSummary').innerHTML = '<p class="emptyState">Aucune configuration solaire n’est liée à cette version.</p>';
    return;
  }
  const lines = [
    ['Installation', areas.length ? [...new Set(areas.map((area) => areaKind(area.area_kind)))].join(' · ') : 'Type à compléter'],
    ['Configuration technique', `Version ${configuration.version}${configuration.is_frozen ? ' · gelée' : ' · brouillon'}`]
  ];
  $('technicalSummary').innerHTML = `${lines.map(([label, value]) => `<div class="summaryLine"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}${areas.length ? areas.map((area) => `<article class="areaSummary"><h4>${esc(area.name || areaKind(area.area_kind))}</h4><p>Surface exploitable · ${esc(fmt(area.usable_area_estimate_m2, 'm²'))}</p><p>Orientation · ${esc(orientation(area.orientation_deg))}　 Pente · ${esc(orientation(area.tilt_deg))}</p><p>Statut · ${esc(area.provenance?.inputStatus === 'USER_PROVIDED' ? 'À qualifier' : 'À confirmer')}</p></article>`).join('') : '<p class="quietNote">Aucune zone solaire renseignée pour cette configuration.</p>'}`;
}

function renderEnergy(model) {
  const energy = model.energy;
  $('energyStatus').dataset.status = energy.status;
  $('energyStatus').textContent = labelStatus(energy.status);
  const rows = energy.rows.length ? energy.rows.map((row) => row.channel === 'FULL_SALE'
    ? `<div class="allocationRow"><span>${esc(row.label)}</span><strong>Volume = production canonique</strong>${badge(energy.status)}</div>`
    : `<div class="allocationRow"><span>${esc(row.label)}</span><strong>${esc(row.value == null ? 'À compléter' : fmt(row.value, row.unit, 0))}</strong>${badge(row.value == null ? 'UNKNOWN' : energy.status === 'VERIFIED' ? 'VERIFIED' : 'ASSUMPTION')}</div>`).join('') : '<p class="emptyState">Aucune répartition CR-011 liée au run énergétique de cette version.</p>';
  $('energySummary').innerHTML = `<p class="quietNote">La production annuelle est indiquée dans les KPI principaux.</p><p class="quietNote">Répartition issue de la décision énergétique enregistrée</p><div class="allocationList">${rows}</div><p class="quietNote">${esc(energy.matchingLabel)}</p>`;
  $('timeSeriesNote').hidden = false;
}

function financeMetric(label, value, unit, status) {
  const safeValue = status === 'STALE' ? 'À actualiser' : fmt(value, unit, label === 'TRI' ? 2 : 1);
  return `<article class="financeMetric"><span>${esc(label)}</span><strong>${esc(safeValue)}</strong>${badge(value == null ? (status === 'STALE' ? 'STALE' : 'UNKNOWN') : status)}</article>`;
}

function cashFlowChart(values) {
  if (!Array.isArray(values) || values.length < 2) return '';
  const maxMagnitude = Math.max(...values.map((value) => Math.abs(value)), 1);
  const bars = values.map((value, index) => {
    const height = Math.max(3, Math.round(Math.abs(value) / maxMagnitude * 38));
    const negative = value < 0;
    return `<div class="cashBarWrap"><i class="cashBar${negative ? ' negative' : ''}" style="height:${height}px" title="${esc(fmt(value, '€', 0))}"></i><span class="cashBarLabel">${index === 0 ? 'Initial' : `A${index}`}</span></div>`;
  }).join('');
  const list = values.map((value, index) => `<li>${index === 0 ? 'Initial' : `A${index}`} · ${esc(fmt(value, '€', 0))}</li>`).join('');
  return `<figure class="cashFlow"><figcaption>Flux de trésorerie persistés · affichage de la série enregistrée</figcaption><div class="cashFlowPlot" role="img" aria-label="Graphe des flux de trésorerie persistés">${bars}</div><ol class="cashFlowValues">${list}</ol></figure>`;
}

function renderFinance(model) {
  const finance = model.finance;
  $('financeStatus').dataset.status = finance.status;
  $('financeStatus').textContent = labelStatus(finance.status);
  const wrap = $('perspectiveWrap');
  wrap.hidden = finance.perspectives.length < 2;
  if (finance.perspectives.length) {
    $('perspectivePicker').innerHTML = finance.perspectives.map((view) => `<option value="${esc(view.key)}" ${view.key === finance.selectedPerspective?.key ? 'selected' : ''}>${esc(view.label)}</option>`).join('');
    wrap.hidden = false;
  }
  $('financeKpis').innerHTML = [
    financeMetric('VAN', finance.npv, '€', finance.status),
    financeMetric('EBITDA annuel', finance.ebitda, '€', finance.status)
  ].join('');
  $('cashFlowHost').innerHTML = finance.status === 'STALE' ? '<p class="emptyState">Les flux doivent être actualisés avec le scénario.</p>' : cashFlowChart(finance.cashFlows) || '<p class="quietNote">Aucune série de cashflows persistée pour cette perspective.</p>';
}

function renderImpact(model) {
  const impact = model.impact;
  const carbonValue = (value, unit) => impact.status === 'STALE' ? 'À actualiser' : fmt(value, unit, 1);
  const carbonStatusText = labelStatus(impact.status);
  $('carbonSummary').innerHTML = [
    `<div class="impactMetric"><span>Équivalent voiture thermique · km</span><strong>${esc(carbonValue(impact.carEquivalentKm, ''))}</strong>${badge(impact.status, carbonStatusText)}</div>`,
    ...(impact.moduleRate != null ? [`<div class="impactMetric"><span>Valorisation des panneaux · référence contextuelle</span><strong>${esc(fmt(impact.moduleRate, '%', 0))}</strong>${badge('ASSUMPTION', 'Estimation')}</div>`] : [])
  ].join('');
  const details = [
    impact.methodology ? `<p>${esc(impact.methodology)}</p>` : null,
    impact.factor ? `<p>Facteur : ${esc(fmt(impact.factor.value, impact.factor.unit, 2))} · ${esc(impact.factor.source || 'source à compléter')} · version ${esc(impact.factor.source_version || 'à compléter')} · référence ${esc(impact.referenceYear ?? 'année à compléter')}</p>` : null,
    impact.moduleStatus === 'CONTEXTUAL_REFERENCE' ? '<p>La référence panneau est contextuelle, non calculée pour le projet.</p>' : null
  ].filter(Boolean).join('') || '<p>Source et méthode CR-014 à compléter ou à actualiser.</p>';
  $('carbonSourceDetails').innerHTML = details;
  const known = new Map(model.support.results.map((item) => [item.scheme_code, item]));
  const s21 = known.get('CR015_S21');
  const aos = known.get('CR015_AOS_PETIT_PV');
  const schemeCard = (title, item, type) => {
    if (model.support.status === 'STALE') return `<article class="supportCard"><strong>${esc(title)}</strong><p>Évaluation existante à actualiser avec cette version du scénario.</p>${badge('STALE')}</article>`;
    if (!item) return `<article class="supportCard"><strong>${esc(title)}</strong><p>${type === 'S21' ? 'Pré-éligibilité indicative non évaluée pour cette version du scénario.' : 'Aucune évaluation de période CR-015 liée à cette version.'}</p>${badge('UNKNOWN')}</article>`;
    const isS21 = type === 'S21';
    const closed = item.procedural_status === 'PERIOD_CLOSED';
    const eligible = item.eligibility_status === 'POTENTIALLY_ELIGIBLE';
    const status = eligible || closed ? 'ASSUMPTION' : 'UNKNOWN';
    const headline = isS21 ? eligible ? 'Pré-éligibilité indicative' : 'Évaluation à compléter' : closed ? 'Période P2 fermée' : 'État de période à compléter';
    const description = isS21 ? 'À confirmer sur pièces ; cette pré-évaluation ne détermine ni tarif, ni prime, ni droit définitif.' : closed ? 'La période documentée est fermée dans la version de règles évaluée.' : 'Le statut affiché correspond uniquement à la version de règles liée à cette évaluation.';
    const sources = Array.isArray(item.source_references) ? item.source_references.map((source) => typeof source === 'string' ? source : source.document_reference || source.url).filter(Boolean).join(' · ') : '';
    return `<article class="supportCard">${badge(status)}<strong>${esc(title)} · ${esc(headline)}</strong><p>${esc(description)}</p><small>Version ${esc(item.scheme_version || 'à compléter')}${sources ? ` · ${esc(sources)}` : ''}</small></article>`;
  };
  $('supportSummary').innerHTML = `${schemeCard('S21 · surplus photovoltaïque', s21, 'S21')}${schemeCard('AOS Petit PV', aos, 'AOS')}<article class="coverageNote">${badge('PARTIAL')}<p>Aucun autre dispositif identifié dans le catalogue actuellement vérifié.</p><p>Le catalogue CR-015 V1 est partiel ; les dispositifs régionaux et locaux restent à vérifier.</p></article><p class="quietNote">Aucun montant d’aide n’est calculé ou annoncé.</p>`;
}

function renderActions(model) {
  const host = $('lifecycleActions');
  const workspaceHref = model.actions.workspaceHref;
  const actions = [];
  if (model.actions.recalculate) actions.push(`<a class="actionButton" href="${esc(workspaceHref)}">Recalculer</a>`);
  if (model.actions.validate) actions.push(`<a class="actionButton" href="${esc(workspaceHref)}">Valider</a>`);
  const reportViewSupported = !model.finance.selectedPerspective || ['OWNER', 'SPV', 'INVESTOR'].includes(model.finance.selectedPerspective.key);
  if (model.actions.report && reportViewSupported) actions.push('<button class="actionButton primary" id="generateDashboardReport" type="button">Rapport CR-007</button>');
  host.innerHTML = `${actions.join('')}${model.actions.report && !reportViewSupported ? '<span class="quietNote">Pour le rapport CR-007, choisissez la perspective Propriétaire, SPV ou Investisseur.</span>' : ''}`;
  $('generateDashboardReport')?.addEventListener('click', () => generateReport(model));
}

async function generateReport(model) {
  const button = $('generateDashboardReport');
  button.disabled = true;
  setNotice('Assemblage du rapport à partir du scénario figé…');
  const view = model.finance.selectedPerspective?.key || 'INVESTOR';
  const reportType = view === 'OWNER' ? 'OWNER' : 'INVESTOR';
  const financialViewpoint = view === 'OWNER' ? 'OWNER' : view === 'SPV' ? 'SPV' : 'INVESTOR';
  try {
    const response = await fetch(config.frozenScenarioReportEndpoint || `${functions}/frozen-scenario-report`, {
      method: 'POST',
      headers: { apikey: apiKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate', scenarioId: model.scenario.id, reportType, financialViewpoint })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Impossible de générer le rapport (${response.status}).`);
    location.href = `./scenario-report.html?id=${encodeURIComponent(result.report.id)}`;
  } catch (error) {
    setNotice(error.message || 'Le rapport ne peut pas être généré.', 'error');
    button.disabled = false;
  }
}

function render(model) {
  const project = model.project;
  if (!project) throw new Error('Le projet n’est pas accessible.');
  $('projectName').textContent = project.name || project.project_reference || 'Projet';
  $('projectAddress').textContent = [project.address, project.postal_code, project.city].filter(Boolean).join(', ') || 'Adresse à compléter';
  $('scenarioMeta').textContent = model.scenario ? `${model.scenario.name} · v${model.scenario.version} · ${lifecycleLabel(model.scenario.status)}` : 'Aucun scénario associé';
  $('scenarioCurrentness').dataset.status = model.currentness;
  $('scenarioCurrentness').textContent = labelStatus(model.currentness);
  $('calculationMeta').textContent = `Dernier calcul : ${model.latestCalculation ? new Date(model.latestCalculation).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }) : 'à compléter'}`;
  renderScenarioPicker(model.scenarios, model.scenario);
  renderKpis(model);
  renderTechnical(model);
  renderEnergy(model);
  renderFinance(model);
  renderImpact(model);
  renderActions(model);
  const route = model.actions.workspaceHref;
  setLinks(route);
  content.hidden = false;
  statusNode.hidden = true;
  if (model.currentness === 'STALE') setNotice('À actualiser · les entrées du scénario ne correspondent plus à son calcul canonique.', 'warn');
  else if (!model.canonicalRun) setNotice(model.scenario ? 'Aucun calcul canonique n’est lié à cette version de scénario.' : 'Projet chargé · aucun scénario n’est encore associé. Les indicateurs restent à compléter.');
}

async function loadScenario(scenarioId) {
  scenarioData = scenarioId ? await getFunction('get-scenario-workspace', { scenarioId }) : null;
  if (scenarioData?.scenario && scenarioData.scenario.project_id !== projectId) throw new Error('Ce scénario ne correspond pas au projet demandé.');
  const model = buildProjectDashboardModel(projectData, scenarioData, selectedPerspective);
  if (model.finance.selectedPerspective) selectedPerspective = model.finance.selectedPerspective.key;
  render(buildProjectDashboardModel(projectData, scenarioData, selectedPerspective));
}

async function boot() {
  try {
    if (!projectId) throw new Error('Identifiant de projet manquant. Revenez à la liste des projets.');
    const session = getSession();
    if (!session?.access_token) throw new Error('Connexion requise pour ouvrir la synthèse du projet.');
    accessToken = session.access_token;
    projectData = await getFunction('get-project-workspace', { projectId });
    const urlScenario = params.get('scenarioId');
    const selected = urlScenario && projectData.scenarios.some((item) => item.id === urlScenario)
      ? projectData.scenarios.find((item) => item.id === urlScenario)
      : projectData.scenarios.find((item) => item.status !== 'RETIRED') || null;
    if (urlScenario && !selected) throw new Error('Cette version de scénario ne fait pas partie des scénarios accessibles du projet.');
    await loadScenario(selected?.id || null);
    $('scenarioPicker').addEventListener('change', async () => {
      params.set('scenarioId', $('scenarioPicker').value);
      history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
      await loadScenario($('scenarioPicker').value);
    });
    $('perspectivePicker').addEventListener('change', async () => {
      selectedPerspective = $('perspectivePicker').value;
      params.set('perspective', selectedPerspective);
      history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
      await loadScenario(scenarioData?.scenario?.id || null);
    });
  } catch (error) {
    setNotice(error.message || 'Impossible de charger les données canoniques du projet.', 'error');
  }
}

boot();
