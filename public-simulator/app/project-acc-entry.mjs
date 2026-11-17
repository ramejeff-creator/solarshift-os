const node = (tag, text = '') => { const n = document.createElement(tag); n.textContent = text; return n; };
let currentId = new URLSearchParams(location.search).get('projectId');
function prospectsHref() {
  const projectId = currentId || window.SOLARSHIFT_CONFIG?.projectId || null;
  const target = new URL('./acc-prospects.html', location.href);
  if (projectId) target.searchParams.set('projectId', projectId);
  return `${target.pathname}${target.search}`;
}
function mount(projectId) {
  currentId = projectId;
  const workspace = document.getElementById('section-matching');
  const dashboard = document.querySelector('.dashboardGroups');
  const prestudy = document.getElementById('audit-finance');
  const parent = workspace || dashboard || prestudy;
  if (!parent) return;
  let section = document.getElementById('projectAccEntry');
  if (!section) {
    section = node('section'); section.id = 'projectAccEntry';
    section.className = 'dashboardCard';
    Object.assign(section.style, { padding: '20px', marginTop: '18px', border: '1px solid #dbe5de', borderRadius: '12px', background: '#f5f9f3', gridColumn: '1 / -1' });
    parent.append(section);
  }
  section.replaceChildren(node('h2', 'Prospects et collectif ACC'), node('p', 'Repérez les consommateurs à proximité et préparez un collectif à étudier.'));
  const teaser = node('div'); teaser.className = 'accProspectTeaser';
  const mapLink = node('a'); mapLink.className = 'accProspectMapLink'; mapLink.href = prospectsHref(); mapLink.setAttribute('aria-label', 'Ouvrir les prospects et le collectif ACC');
  const map = node('figure'); map.className = 'accProspectMiniMap'; map.setAttribute('role', 'img');
  map.setAttribute('aria-label', 'Illustration de carte de prospection, aucun candidat affiché');
  map.innerHTML = '<svg viewBox="0 0 320 150" aria-hidden="true" focusable="false"><rect width="320" height="150" fill="#edf4ed"/><path d="M-10 35 330 125M-15 125 335 25M70-10l48 180M247-10l-35 180" stroke="#fff" stroke-width="18"/><path d="M-10 35 330 125M-15 125 335 25M70-10l48 180M247-10l-35 180" stroke="#d2ddd2" stroke-width="2"/><g fill="#d6e4d7" stroke="#9ab5a1" stroke-width="1.5"><rect x="20" y="54" width="37" height="26" rx="3"/><rect x="136" y="17" width="38" height="25" rx="3"/><rect x="183" y="87" width="46" height="30" rx="3"/><rect x="264" y="48" width="30" height="24" rx="3"/><rect x="81" y="104" width="33" height="24" rx="3"/></g><circle cx="155" cy="70" r="16" fill="#138064" fill-opacity=".16"/><path d="M155 52c-8 0-14 6-14 14 0 10 14 24 14 24s14-14 14-24c0-8-6-14-14-14z" fill="#138064"/><circle cx="155" cy="66" r="4" fill="#fff"/></svg>';
  map.append(node('figcaption', 'Aperçu cartographique · ouvrir la prospection'));
  mapLink.append(map);
  const copy = node('div'); copy.className = 'accProspectTeaserCopy';
  const hasProject = Boolean(currentId || window.SOLARSHIFT_CONFIG?.projectId);
  copy.append(node('strong', 'Commencez par repérer les sites proches'), node('p', hasProject ? 'Ouvrez la liste des consommateurs associés à ce projet.' : 'Enregistrez le projet dans votre compte pour ouvrir la prospection et rattacher un collectif ACC.'));
  const link = node('a', hasProject ? 'Explorer le collectif ACC →' : 'Ouvrir la page du collectif ACC →');
  link.className = 'button secondary sectionLink';
  link.href = prospectsHref();
  copy.append(link);
  teaser.append(mapLink, copy); section.append(teaser);
}
mount(currentId);
window.addEventListener('ozeno:workspace-project-loaded', event => mount(event.detail?.workspace?.project?.id));
window.addEventListener('ozeno:hub-status', () => mount(window.SOLARSHIFT_CONFIG?.projectId || new URLSearchParams(location.search).get('projectId')));
window.addEventListener('ozeno:project-context-loaded', event => mount(event.detail?.projectId));
