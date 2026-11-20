import { cloudPublishedStudies, getSession } from './project-hub-client.mjs?v=20261123-published-studies';

const panel = document.getElementById('hubPublishedStudies');
const list = document.getElementById('hubPublishedStudiesList');
const reportAudiences = {
  OWNER: 'Propriétaire',
  INVESTOR: 'Investisseur',
  SPV: 'Société de projet'
};

function studyRow(study) {
  const row = document.createElement('li');
  const heading = document.createElement('h3');
  const name = study.project?.name || study.name;
  heading.textContent = name + ' · Étude v' + study.version;
  row.append(heading);

  const actions = document.createElement('div');
  const reports = new Map();
  for (const report of study.reports) {
    // The API returns the latest published version first for each audience.
    if (!reports.has(report.financial_viewpoint)) reports.set(report.financial_viewpoint, report);
  }
  for (const report of reports.values()) {
    const link = document.createElement('a');
    const url = new URL('./scenario-report.html', location.href);
    url.searchParams.set('id', report.id);
    link.href = url.href;
    link.className = 'hubSecondary';
    link.textContent = reports.size === 1
      ? 'Ouvrir le rapport final'
      : 'Ouvrir le rapport final · ' + reportAudiences[report.financial_viewpoint];
    link.setAttribute('aria-label', link.textContent + ' · ' + heading.textContent);
    actions.append(link);
  }
  if (!reports.size) actions.textContent = 'Aucun rapport publié disponible pour votre compte.';
  row.append(actions);
  return row;
}

async function showPublishedStudies() {
  try {
    const session = await getSession(localStorage);
    if (!session) return;
    const studies = await cloudPublishedStudies(session.access_token);
    list.replaceChildren(...studies.map(studyRow));
    panel.hidden = studies.length === 0;
  } catch {
    document.getElementById('hubPublishedStudiesError').hidden = false;
    panel.hidden = false;
  }
}

if (window.__SOLARSHIFT_AUTHORIZED === true) void showPublishedStudies();
else window.addEventListener('solarshift:authenticated', showPublishedStudies, { once: true });
