import { cloudProjects, getSession, saveCloudProject } from './project-hub-client.mjs';
import { mountAccProspects } from './acc-prospects-ui.mjs';
import { withAccProspectPlanningActions } from './acc-prospects-model.mjs';

const projectId = new URLSearchParams(location.search).get('projectId');
const initialProspectId = new URLSearchParams(location.search).get('prospectId') || '';
const flatten = row => row ? { ...row.data, ...row } : null;
// Keep navigation usable even when the cloud read below fails or is delayed.
const currentParams = new URLSearchParams(location.search);
const prestudyParams = new URLSearchParams(currentParams);
prestudyParams.delete('prospectId');
const prestudyUrl = `./index.html${prestudyParams.size ? `?${prestudyParams}` : ''}#prestudy-project-location`;
document.getElementById('accBack').href = prestudyUrl;
document.getElementById('accPrestudy').href = prestudyUrl;
async function token() {
  const session = await getSession(localStorage);
  if (!session?.access_token) throw new Error('Connexion requise pour accéder au collectif.');
  return session.access_token;
}
try {
  if (!projectId) throw new Error('Ouvrez un projet enregistré pour constituer son collectif ACC.');
  const rows = await cloudProjects(await token(), projectId);
  let project = flatten(rows[0]);
  if (project?.id !== projectId) throw new Error('Le dossier est introuvable ou non accessible.');
  if (project.preview?.accCollective?.projectId && project.preview.accCollective.projectId !== projectId) throw new Error('Le collectif enregistré référence un autre dossier. Une vérification est nécessaire.');
  mountAccProspects({ project, initialProspectId, onReload: () => location.reload(), onSave: async snapshot => {
    const saved = flatten(await saveCloudProject(await token(), withAccProspectPlanningActions(project, snapshot), { projectId, expectedVersion: project.version || 0 }));
    if (saved?.id !== projectId || saved?.version !== (project.version || 0) + 1) throw new Error('Réponse d’enregistrement inattendue. Vérifiez le dossier avant de poursuivre.');
    project = saved; return saved;
  } });
} catch (error) {
  const state = document.getElementById('accState'); state.textContent = error.message; state.dataset.tone = 'error';
  document.getElementById('accProjectLabel').textContent = 'Collectif indisponible';
}
