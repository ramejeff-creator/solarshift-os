import { cloudProjects, getSession } from './project-hub-client.mjs';
import { restoreQualification, qualificationChecks, safeSourceUrl } from './parcel-qualification.mjs';
import { appendSiteContext } from './site-context-view.mjs';
import { appendHorizon } from './qualification-horizon.mjs';
import { appendSituationPlan } from './situation-plan-ui.mjs';
import { downloadQualificationPdf } from './qualification-report.mjs';

const node = (tag, text = '') => { const n = document.createElement(tag); n.textContent = text; return n; };
const section = node('section'); section.className = 'workspaceSection card dashboardCard'; section.id = 'projectSiteQualification'; section.setAttribute('aria-label', 'Qualification du site enregistrée');
const parent = document.getElementById('section-site') || document.querySelector('.dashboardGroups');
if (parent) {
  if (parent.id === 'section-site') parent.append(section); else parent.prepend(section);
  const css = node('link'); css.rel = 'stylesheet'; css.href = './parcel-qualification.css'; document.head.append(css);
}
let generation = 0, currentId = null;
function source(host, label, url, retrievedAt) {
  const p = node('p'); p.className = 'parcelSource'; const safe = safeSourceUrl(url);
  if (safe) { const a = node('a', label); a.href = safe; a.target = '_blank'; a.rel = 'noopener noreferrer'; p.append(a); } else p.append(document.createTextNode(label));
  p.append(document.createTextNode(` · consultation : ${retrievedAt && !Number.isNaN(Date.parse(retrievedAt)) ? new Date(retrievedAt).toLocaleString('fr-FR') : 'date non renseignée'}`)); host.append(p);
}
async function load(projectId) {
  if (!parent || !projectId || currentId === projectId) return;
  currentId = projectId; const run = ++generation; section.replaceChildren(node('h2', 'Qualification du site'), node('p', 'Chargement des informations enregistrées…'));
  const active = () => run === generation && currentId === projectId;
  try {
    const session = await getSession(localStorage); if (!session?.access_token) throw new Error('Connectez-vous pour consulter la qualification du dossier.');
    const rows = await cloudProjects(session.access_token, projectId); if (!active()) return;
    const record = rows[0] ? { ...rows[0].data, ...rows[0] } : null;
    if (!record || record.id !== projectId) throw new Error('Dossier non accessible.');
    const point = { latitude: record.latitude, longitude: record.longitude };
    const snapshot = restoreQualification(record.preview?.parcelQualification, point);
    section.replaceChildren(node('h2', 'Qualification du site'));
    const link = node('a', 'Compléter dans la pré-étude'); link.href = `./index.html?projectId=${encodeURIComponent(projectId)}#prestudy-project-location`;
    if (!snapshot) { section.append(node('p', 'Qualification parcellaire non enregistrée ou localisation modifiée. Reprenez la qualification dans la pré-étude.'), link); return; }
    section.append(node('p', `${record.name} · parcelle ${snapshot.parcel.section} ${snapshot.parcel.number} · ${Number(snapshot.parcel.areaM2).toLocaleString('fr-FR')} m² cadastraux.`), node('p', `Qualification issue de la pré-étude enregistrée, version ${record.version}. Les informations et leurs dates sont conservées ; elles restent à vérifier pour l’étude.`));
    appendSiteContext(section, snapshot.siteContext); appendHorizon(section, snapshot.horizon);
    const exportButton = node('button', 'Exporter la qualification en PDF'); exportButton.type = 'button'; exportButton.className = 'button secondary';
    exportButton.onclick = () => { if (active()) downloadQualificationPdf(snapshot, { name: record.name, address: record.address }); }; section.append(exportButton);
    appendSituationPlan(section, snapshot, { active, identity: () => ({ name: record.name, address: record.address }) });
    const checks = node('details'); checks.append(node('summary', 'Points à vérifier pour l’étude')); const list = node('ul'); qualificationChecks(snapshot).forEach(check => list.append(node('li', check.label))); checks.append(list); section.append(checks);
    const observations = node('details'); observations.append(node('summary', 'Urbanisme, bâtiments et sources enregistrées'));
    source(observations, snapshot.cadastre.name, snapshot.cadastre.url, snapshot.cadastre.retrievedAt);
    for (const row of snapshot.observations) { observations.append(node('p', `${row.name} : ${row.state !== 'AVAILABLE' ? 'source à compléter' : row.items.length ? row.items.map(item => item.description || item.label).join(' ; ') : 'aucun objet renvoyé par cette couche'}.`)); source(observations, row.name, row.url, row.retrievedAt); }
    const buildings = snapshot.buildings;
    observations.append(node('p', `BDNB : ${buildings.state === 'AVAILABLE' ? buildings.items.map(b => `${b.usage || 'usage non renseigné'}${b.areaM2 != null ? ` · emprise ${b.areaM2} m²` : ''}${b.year != null ? ` · construction ${b.year}` : ''}`).join(' ; ') || 'aucun bâtiment explicitement rattaché' : 'source à compléter'}.`)); source(observations, buildings.name, buildings.url, buildings.retrievedAt);
    section.append(observations, node('p', 'Ces observations ne modifient ni la validation technique, ni les résultats ou le statut du scénario d’étude.'), link);
  } catch (error) { if (active()) { currentId = null; section.replaceChildren(node('h2', 'Qualification du site'), node('p', error.message)); } }
}
window.addEventListener('ozeno:workspace-project-loaded', event => { void load(event.detail?.workspace?.project?.id); });
void load(new URLSearchParams(location.search).get('projectId'));
