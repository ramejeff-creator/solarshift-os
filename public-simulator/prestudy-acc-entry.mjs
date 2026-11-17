import { cloudProjects, getSession, saveCloudProject } from './project-hub-client.mjs';
import { mountAccProspects } from './acc-prospects-ui.mjs';
import { withAccProspectPlanningActions } from './acc-prospects-model.mjs';

const $ = id => document.getElementById(id);
const rootId = 'prestudyAccEmbed';
let markupPromise = null;
let mountedProjectId = '';
let accInstance = null;
let prestudyHasUnsavedChanges = false;

function matchingClose(text, start) {
  let depth = 1;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}' && --depth === 0) return index;
  }
  return text.length - 1;
}
function splitSelectors(value) {
  const values = []; let depth = 0, start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '(' || value[index] === '[') depth += 1;
    else if (value[index] === ')' || value[index] === ']') depth -= 1;
    else if (value[index] === ',' && depth === 0) { values.push(value.slice(start, index).trim()); start = index + 1; }
  }
  values.push(value.slice(start).trim());
  return values.filter(Boolean);
}
function scopeCss(css, scope) {
  let output = '', cursor = 0;
  while (cursor < css.length) {
    const open = css.indexOf('{', cursor);
    if (open < 0) { output += css.slice(cursor); break; }
    const close = matchingClose(css, open + 1);
    const head = css.slice(cursor, open), selector = head.trim(), body = css.slice(open + 1, close);
    if (/^@(media|supports|container|layer|document)\b/i.test(selector)) {
      output += `${head}{${scopeCss(body, scope)}}`;
    } else if (/^@(?:-\w+-)?keyframes\b/i.test(selector) || selector.startsWith('@')) {
      output += `${head}{${body}}`;
    } else {
      const scoped = splitSelectors(selector).map(item => {
        if (item.startsWith(scope)) return item;
        if (/^:root\b/.test(item)) return item.replace(/^:root\b/, scope);
        if (/^(?:html|body)\b/.test(item)) return item.replace(/^(?:html|body)\b/, scope);
        return `${scope} ${item}`;
      }).join(',');
      output += `${head.replace(selector, scoped)}{${body}}`;
    }
    cursor = close + 1;
  }
  return output;
}

async function injectAccMarkup() {
  if (markupPromise) return markupPromise;
  markupPromise = (async () => {
    const response = await fetch('./acc-prospects.html?v=20261115-prospection-acc-suivi-v5');
    if (!response.ok) throw new Error(`Le module ACC n’a pas pu être chargé (${response.status}).`);
    const html = await response.text();
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const shell = parsed.querySelector('main.acc-shell');
    const dialog = parsed.querySelector('#accDialog');
    if (!shell || !dialog) throw new Error('Le contenu du module ACC est incomplet.');
    const target = $(rootId);
    if (!target) throw new Error('Le chapitre ACC de la pré-étude n’est pas disponible.');
    const styleResponse = await fetch('./acc-prospects.css?v=20261115-prospection-acc-suivi-v5');
    if (!styleResponse.ok) throw new Error(`Les styles du module ACC n’ont pas pu être chargés (${styleResponse.status}).`);
    const style = document.createElement('style');
    style.dataset.prestudyAcc = 'true';
    style.textContent = scopeCss(await styleResponse.text(), '#audit-acc');
    document.head.append(style);
    const embeddedShell = document.createElement('div');
    for (const attribute of shell.attributes) embeddedShell.setAttribute(attribute.name, attribute.value);
    embeddedShell.innerHTML = shell.innerHTML;
    target.replaceChildren(embeddedShell, document.importNode(dialog, true));
    return target;
  })();
  return markupPromise;
}
const flatten = row => row ? { ...row.data, ...row } : null;

async function token() {
  const session = await getSession(localStorage);
  if (!session?.access_token) throw new Error('Connectez-vous puis enregistrez ce projet dans votre espace pour activer le collectif ACC.');
  return session.access_token;
}
async function loadProject(projectId, { force = false } = {}) {
  const state = $('accState');
  if (!projectId) {
    if (state) { state.textContent = 'Enregistrez le projet dans votre espace pour activer le collectif ACC.'; state.dataset.tone = 'warning'; state.hidden = false; }
    if ($('accProjectLabel')) $('accProjectLabel').textContent = 'Projet non enregistré';
    return;
  }
  if (!force && mountedProjectId === projectId) return;
  try {
    await injectAccMarkup();
    const rows = await cloudProjects(await token(), projectId);
    let project = flatten(rows[0]);
    if (project?.id !== projectId) throw new Error('Le dossier est introuvable ou non accessible.');
    if (project.preview?.accCollective?.projectId && project.preview.accCollective.projectId !== projectId) throw new Error('Le collectif enregistré référence un autre dossier. Une vérification est nécessaire.');
    accInstance = mountAccProspects({ project, onReload: () => location.reload(), onSave: async snapshot => {
      const saved = flatten(await saveCloudProject(await token(), withAccProspectPlanningActions(project, snapshot), { projectId, expectedVersion: project.version || 0 }));
      if (saved?.id !== projectId || saved?.version !== (project.version || 0) + 1) throw new Error('Réponse d’enregistrement inattendue. Vérifiez le dossier avant de poursuivre.');
      project = saved; return saved;
    } });
    $('accSave')?.addEventListener('click', event => {
      if (!prestudyHasUnsavedChanges) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const state = $('accState');
      state.textContent = 'Enregistrez d’abord les modifications de la pré-étude avant le collectif ACC. Cela évite de créer une version à partir d’un dossier antérieur.';
      state.dataset.tone = 'warning';
    }, true);
    mountedProjectId = projectId;
    if ($('audit-acc') && !$('audit-acc').hidden) requestAnimationFrame(() => accInstance?.refreshMap?.());
  } catch (error) {
    if (state) { state.textContent = error instanceof Error ? error.message : 'Le module ACC est indisponible.'; state.dataset.tone = 'error'; state.hidden = false; }
    if ($('accProjectLabel')) $('accProjectLabel').textContent = 'Collectif indisponible';
  }
}
function currentProjectId(detail = {}) {
  const config = window.SOLARSHIFT_CONFIG || {};
  return detail.scope === 'local' ? '' : detail.projectId || config.projectId || new URLSearchParams(location.search).get('projectId') || '';
}
function start() {
  const id = currentProjectId();
  if (id) void loadProject(id);
  window.addEventListener('ozeno:project-context-loaded', event => {
    const nextId = currentProjectId(event.detail || {});
    if (nextId && nextId !== mountedProjectId) void loadProject(nextId);
  });
  window.addEventListener('ozeno:hub-status', event => { prestudyHasUnsavedChanges = Boolean(event.detail?.dirty); });
  window.addEventListener('ozeno:prestudy-chapter-shown', event => {
    if (event.detail?.chapter === 'acc') requestAnimationFrame(() => accInstance?.activate?.());
  });
}
window.addEventListener('ozeno:prestudy-chapters-mounted', start, { once: true });
if (document.body.dataset.prestudyReady === 'true') start();
