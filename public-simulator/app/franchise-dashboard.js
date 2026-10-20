import * as client from './project-hub-client.mjs';
import {
  COMMERCIAL_PROJECT_STATUS_LABELS,
  filterAccessibleProjects,
  normalizeAccessibleProject,
  summarizeAccessibleProjects,
  projectInstallerCommission,
  summarizeInstallerCommissions
} from './franchise-dashboard-data.mjs';

const $ = (id) => document.getElementById(id);
let allProjects = [];
let loadingError = '';

function formatDate(value) {
  const date = new Date(value || '');
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : 'Non renseignée';
}

function metric(id, value) {
  const target = $(id);
  if (target) target.textContent = String(value);
}

function commissionRange(commission) {
  const euros = (value) => Number(value).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  return `${euros(commission.lowEur)}–${euros(commission.highEur)}`;
}

function renderMetrics() {
  const summary = summarizeAccessibleProjects(allProjects);
  metric('franchiseMetricProjects', summary.total);
  metric('franchiseMetricInProgress', summary.inProgress);
  metric('franchiseMetricValidated', summary.validated);
  metric('franchiseMetricAgents', 'Non disponible');
  const commissions = summarizeInstallerCommissions(allProjects);
  metric('franchiseMetricTurnover', commissions.estimatedProjects ? commissionRange(commissions) : 'À renseigner');
  metric('franchiseCommissionCoverage', `${commissions.estimatedProjects} projet(s) estimé(s) · ${commissions.missingProjects} sans base · CA facturé non disponible`);
}

function renderProjects() {
  const visible = filterAccessibleProjects(allProjects, {
    search: $('franchiseSearch').value,
    status: $('franchiseStatusFilter').value,
    periodDays: $('franchisePeriodFilter').value
  });
  const body = $('franchiseProjectRows');
  body.replaceChildren();
  for (const project of visible) {
    const row = document.createElement('tr');
    const projectCell = document.createElement('td');
    const open = document.createElement('a');
    open.className = 'franchiseProjectLink';
    open.href = `./index.html?projectId=${encodeURIComponent(project.id || '')}`;
    open.textContent = project.name || 'Projet sans nom';
    projectCell.append(open);
    const address = document.createElement('small');
    address.textContent = project.address || 'Adresse non renseignée';
    projectCell.append(address);
    row.append(projectCell);

    const status = String(project.commercialStatus || '').toUpperCase();
    const statusCell = document.createElement('td');
    const statusBadge = document.createElement('span');
    statusBadge.className = `franchiseStatusBadge ${status.toLowerCase() || 'unknown'}`;
    statusBadge.textContent = COMMERCIAL_PROJECT_STATUS_LABELS[status] || 'Statut non renseigné';
    statusCell.append(statusBadge);
    row.append(statusCell);
    const commission = projectInstallerCommission(project);
    for (const value of [project.city || 'Non renseignée', 'Non reliée', 'À renseigner', commission ? `${commissionRange(commission)} · potentiel 8–10 %` : 'À renseigner', formatDate(project.updatedAt)]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      if (value === 'Non reliée' || value === 'À renseigner' || value === 'Non disponible' || value === 'Non renseignée') cell.className = 'franchiseUnknown';
      row.append(cell);
    }
    const actionCell = document.createElement('td');
    const action = document.createElement('a');
    action.className = 'hubSecondary franchiseOpenProject';
    action.href = open.href;
    action.textContent = 'Ouvrir';
    action.setAttribute('aria-label', `Ouvrir le projet ${project.name || ''}`);
    actionCell.append(action);
    row.append(actionCell);
    body.append(row);
  }
  $('franchiseProjectCount').textContent = `${visible.length} dossier${visible.length > 1 ? 's' : ''}`;
  $('franchiseProjectsEmpty').hidden = visible.length > 0;
  $('franchiseProjectsEmpty').textContent = loadingError
    ? `Chargement des projets impossible : ${loadingError}`
    : allProjects.length
      ? 'Aucun dossier ne correspond à ces filtres.'
      : 'Aucun projet n’est accessible à ce compte pour le moment.';
}

function renderLoadState(message, { error = false } = {}) {
  const state = $('franchiseDataState');
  state.textContent = message;
  state.dataset.error = String(error);
  state.hidden = false;
}

async function loadProjects() {
  $('franchiseRefresh').disabled = true;
  renderLoadState('Chargement des projets autorisés au compte…');
  try {
    const session = await client.getSession(localStorage);
    if (!session?.access_token) throw new Error('Session expirée. Reconnectez-vous.');
    const identity = await client.getIdentity(session.access_token);
    if (!identity?.id) throw new Error('Identité du compte indisponible.');
    $('franchiseAccountEmail').textContent = identity.email || 'Compte connecté';
    const response = await client.cloudProjects(session.access_token);
    allProjects = (Array.isArray(response) ? response : []).map(normalizeAccessibleProject);
    loadingError = '';
    renderMetrics();
    renderProjects();
    renderLoadState(`${allProjects.length} projet${allProjects.length > 1 ? 's' : ''} chargé${allProjects.length > 1 ? 's' : ''} depuis le périmètre autorisé par le compte. Les rattachements régionaux ne sont pas encore disponibles.`);
  } catch (error) {
    loadingError = error?.message || 'Service temporairement indisponible.';
    allProjects = [];
    metric('franchiseMetricProjects', '—');
    metric('franchiseMetricInProgress', '—');
    metric('franchiseMetricValidated', '—');
    metric('franchiseMetricAgents', 'Non disponible');
    metric('franchiseMetricTurnover', 'Non disponible');
    renderProjects();
    renderLoadState(`Les projets n’ont pas pu être chargés : ${loadingError}`, { error: true });
  } finally {
    $('franchiseRefresh').disabled = false;
  }
}

function init() {
  $('franchiseSearch').addEventListener('input', renderProjects);
  $('franchiseStatusFilter').addEventListener('change', renderProjects);
  $('franchisePeriodFilter').addEventListener('change', renderProjects);
  $('franchiseRefresh').addEventListener('click', loadProjects);
  loadProjects();
}

document.addEventListener('DOMContentLoaded', init, { once: true });
