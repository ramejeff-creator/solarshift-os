(function () {
  'use strict';

  const DOCUMENT_TYPES = [
    ['EPC_QUOTATION', 'Offre installateur (EPC)'],
    ['STRUCTURAL_STUDY', 'Étude structurelle'],
    ['ROOF_RIGHT', 'Droit d’usage de toiture'],
    ['MANDATE', 'Mandat'],
    ['GRID_CONNECTION', 'Raccordement réseau'],
    ['ENERGY_STUDY', 'Étude énergétique'],
    ['P50_P90_STUDY', 'Étude P50/P90']
  ];
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const dateLabel = (value) => {
    if (!value) return 'Date non disponible';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Date non disponible' : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
  };

  function installStyles() {
    if (document.getElementById('workspaceR11Styles')) return;
    const link = document.createElement('link');
    link.id = 'workspaceR11Styles';
    link.rel = 'stylesheet';
    link.href = './workspace-r1-1.css';
    document.head.append(link);
  }

  function createTabs(section) {
    const summary = section.querySelector(':scope > .sectionSummary');
    const toolbar = section.querySelector(':scope > .reportToolbar');
    const history = section.querySelector(':scope > #reportHistory');
    if (!summary || !toolbar || !history) return;

    const shell = document.createElement('div');
    shell.className = 'workspaceR11';
    shell.innerHTML = `
      <div class="workspaceR11Access" aria-label="Accès au dossier CR-007">
        <button type="button" data-r11-open="report" aria-current="page"><strong>Rapport final</strong><small>Génération CR-007 et historique</small></button>
        <button type="button" data-r11-open="documents"><strong>Pièces & preuves</strong><small>Suivi et dépôt des documents</small></button>
        <button type="button" data-r11-open="contracts"><strong>Contrats</strong><small>Préparation en lecture seule</small></button>
        <button type="button" data-r11-open="decision"><strong>Décision</strong><small>Repères de revue, sans action métier</small></button>
      </div>
      <div class="workspaceR11Tabs" role="tablist" aria-label="Vues du dossier">
        <button id="workspaceR11Tab-report" type="button" role="tab" aria-selected="true" aria-controls="workspaceR11Panel-report" data-r11-tab="report">Rapport final</button>
        <button id="workspaceR11Tab-documents" type="button" role="tab" aria-selected="false" aria-controls="workspaceR11Panel-documents" data-r11-tab="documents" tabindex="-1">Pièces & preuves</button>
        <button id="workspaceR11Tab-contracts" type="button" role="tab" aria-selected="false" aria-controls="workspaceR11Panel-contracts" data-r11-tab="contracts" tabindex="-1">Contrats</button>
        <button id="workspaceR11Tab-decision" type="button" role="tab" aria-selected="false" aria-controls="workspaceR11Panel-decision" data-r11-tab="decision" tabindex="-1">Décision</button>
      </div>
      <section id="workspaceR11Panel-report" class="workspaceR11Panel" role="tabpanel" aria-labelledby="workspaceR11Tab-report" data-r11-panel="report"></section>
      <section id="workspaceR11Panel-documents" class="workspaceR11Panel" role="tabpanel" aria-labelledby="workspaceR11Tab-documents" data-r11-panel="documents" hidden>
        <p class="sectionSummary">Suivez les pièces visibles pour ce projet et joignez un document depuis cette vue. Formats acceptés : PDF, Office, CSV et images, jusqu’à 25 Mo. La présence d’un fichier ne vaut pas validation; les pièces applicables restent à confirmer par les personnes habilitées.</p>
        <div id="workspaceR11DocumentStatus" class="statusMessage" role="status" aria-live="polite">Sélectionnez un projet autorisé pour afficher et compléter son dossier.</div>
        <div id="workspaceR11DocumentTable" class="workspaceR11Documents"></div>
        <p class="workspaceR11Notice">Les indicateurs portent sur les 7 types référencés par CR-007; ils ne signifient pas que ces 7 pièces sont toutes applicables ou obligatoires pour ce projet. « Présent » signifie qu’un fichier du type est visible pour votre rôle. « Aucun document visible » peut aussi signifier que vous n’avez pas accès à une pièce déjà déposée. Le traitement du fichier ne vaut pas vérification ni approbation. Un rapport déjà généré conserve son propre instantané documentaire.</p>
      </section>
      <section id="workspaceR11Panel-contracts" class="workspaceR11Panel" role="tabpanel" aria-labelledby="workspaceR11Tab-contracts" data-r11-panel="contracts" hidden>
        <p class="sectionSummary">Espace de préparation en lecture seule. Le Workspace ne fournit pas ici de source contractuelle structurée ni d’action d’approbation.</p>
        <div class="workspaceR11InfoGrid">
          <article class="workspaceR11Info"><h3>Parties et représentation</h3><p>À examiner par les personnes habilitées à partir des pièces autorisées.</p></article>
          <article class="workspaceR11Info"><h3>Version et périmètre</h3><p>Identifier les documents contractuels applicables et leur concordance avec le scénario présenté.</p></article>
          <article class="workspaceR11Info"><h3>Conditions et réserves</h3><p>Relever les conditions suspensives, exclusions, dépendances et points restant à clarifier.</p></article>
          <article class="workspaceR11Info"><h3>Traçabilité de revue</h3><p>La façon de consigner une validation contractuelle reste à définir hors de cette R1.</p></article>
        </div>
        <p class="workspaceR11Notice">Aucune validation, signature ou approbation ne peut être saisie ou déduite dans cette vue.</p>
      </section>
      <section id="workspaceR11Panel-decision" class="workspaceR11Panel" role="tabpanel" aria-labelledby="workspaceR11Tab-decision" data-r11-panel="decision" hidden>
        <p class="sectionSummary">La génération et la publication du rapport restent distinctes d’une décision de réalisation.</p>
        <div class="workspaceR11Decision"><b>Critères de restitution CR-007</b><p id="workspaceR11ReportStatus">Consultez les motifs et l’état affichés par le flux de rapport existant.</p><div id="workspaceR11ReportLink"></div></div>
        <div class="workspaceR11InfoGrid">
          <article class="workspaceR11Info"><h3>Inconnues et fraîcheur</h3><p>Conserver les états et sources affichés dans les faits du rapport; aucune valeur n’est complétée par cette vue.</p></article>
          <article class="workspaceR11Info"><h3>Examen humain</h3><p>Les parties responsables examinent les preuves, réserves et conditions applicables au projet.</p></article>
          <article class="workspaceR11Info"><h3>Décision de poursuite</h3><p>Aucune décision de réalisation n’est enregistrée par cette interface. Elle requiert un mécanisme métier validé distinct.</p></article>
          <article class="workspaceR11Info"><h3>Étape suivante</h3><p>À convenir par les personnes autorisées après revue du dossier et de ses conditions.</p></article>
        </div>
        <p class="workspaceR11Notice">« Prêt à engager » n’est pas calculé ici. Aucun statut, ordre de travaux, publication ou accord n’est créé.</p>
      </section>`;

    const reportPanel = shell.querySelector('[data-r11-panel="report"]');
    reportPanel.append(summary, toolbar, history);
    const reportHistory = document.getElementById('reportHistory');
    reportHistory.classList.add('workspaceR11ReportHistory');
    section.append(shell);

    function activate(id, focus = false) {
      const tab = shell.querySelector(`[data-r11-tab="${id}"]`);
      if (!tab) return;
      shell.querySelectorAll('[data-r11-tab]').forEach((item) => {
        const active = item.dataset.r11Tab === id;
        item.setAttribute('aria-selected', String(active));
        item.tabIndex = active ? 0 : -1;
      });
      shell.querySelectorAll('[data-r11-panel]').forEach((panel) => { panel.hidden = panel.dataset.r11Panel !== id; });
      shell.querySelectorAll('[data-r11-open]').forEach((item) => {
        if (item.dataset.r11Open === id) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
      });
      if (focus) tab.focus();
      if (id === 'documents') loadDocuments(currentProjectId);
      if (id === 'decision') syncDecisionSummary();
    }

    shell.querySelectorAll('[data-r11-tab]').forEach((tab, index, tabs) => {
      tab.addEventListener('click', () => activate(tab.dataset.r11Tab));
      tab.addEventListener('keydown', (event) => {
        const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (!offset) return;
        event.preventDefault();
        activate(tabs[(index + offset + tabs.length) % tabs.length].dataset.r11Tab, true);
      });
    });
    shell.querySelectorAll('[data-r11-open]').forEach((button) => button.addEventListener('click', () => activate(button.dataset.r11Open)));
    const documentTable = document.getElementById('workspaceR11DocumentTable');
    documentTable.addEventListener('click', (event) => {
      const button = event.target.closest('[data-r11-select-file]');
      if (!button) return;
      button.closest('[data-r11-document-row]')?.querySelector('[data-r11-document-file]')?.click();
    });
    documentTable.addEventListener('change', (event) => {
      const input = event.target.closest('[data-r11-document-file]');
      const file = input?.files?.[0];
      const row = input?.closest('[data-r11-document-row]');
      if (!file || !row) return;
      uploadDocument(currentProjectId, row.dataset.r11DocumentRow, file).catch((error) => {
        setDocumentStatus(`Le document n’a pas été ajouté : ${error.message}`, 'error');
      }).finally(() => { input.value = ''; });
    });
    document.addEventListener('ozeno:workspace-project-loaded', (event) => {
      currentProjectId = event.detail?.workspace?.project?.id || '';
      if (!currentProjectId) showDocumentMessage('Projet non disponible dans cette session.');
      else if (!shell.querySelector('[data-r11-panel="documents"]').hidden) loadDocuments(currentProjectId);
    });
    document.getElementById('generatedReportLink')?.addEventListener('click', syncDecisionSummary);
    const observer = new MutationObserver(syncDecisionSummary);
    const actionStatus = document.getElementById('reportActionStatus');
    if (actionStatus) observer.observe(actionStatus, { childList: true, characterData: true, subtree: true });
    syncDecisionSummary();
  }

  let currentProjectId = '';
  let requestSequence = 0;

  function showDocumentMessage(message) {
    const node = document.getElementById('workspaceR11DocumentStatus');
    const table = document.getElementById('workspaceR11DocumentTable');
    if (node) node.textContent = message;
    if (table) table.replaceChildren();
  }

  function setDocumentStatus(message, tone = '') {
    const node = document.getElementById('workspaceR11DocumentStatus');
    if (!node) return;
    node.textContent = message;
    node.dataset.tone = tone;
  }

  async function uploadDocument(projectId, documentType, file) {
    if (!projectId) throw new Error('Aucun projet sélectionné.');
    const config = window.SOLARSHIFT_CONFIG || {};
    const sessionKey = config.sessionStorageKey || 'ozeno-supabase-session';
    let session;
    try { session = JSON.parse(localStorage.getItem(sessionKey) || 'null'); } catch { session = null; }
    if (!session?.access_token || !config.supabaseUrl || !config.supabasePublishableKey) {
      throw new Error('Connectez-vous à un projet enregistré pour joindre un document.');
    }
    const row = document.querySelector(`[data-r11-document-row="${CSS.escape(documentType)}"]`);
    const button = row?.querySelector('[data-r11-select-file]');
    if (button) button.disabled = true;
    setDocumentStatus(`Ajout de « ${DOCUMENT_TYPES.find(([type]) => type === documentType)?.[1] || documentType} »…`);
    try {
      const form = new FormData();
      form.set('projectId', projectId);
      form.set('documentType', documentType);
      form.set('file', file, file.name);
      const endpoint = config.projectDocumentEndpoint || `${config.supabaseUrl}/functions/v1/upload-project-document`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${session.access_token}` },
        body: form
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Échec de l’envoi (${response.status}).`);
      setDocumentStatus('Document ajouté au dossier. Actualisation des indicateurs…', 'success');
      await loadDocuments(projectId);
    } finally {
      if (button) button.disabled = false;
    }
  }

  function syncDecisionSummary() {
    const source = document.getElementById('reportActionStatus');
    const target = document.getElementById('workspaceR11ReportStatus');
    const link = document.getElementById('generatedReportLink');
    const linkTarget = document.getElementById('workspaceR11ReportLink');
    if (target && source?.textContent.trim()) target.textContent = source.textContent.trim();
    if (linkTarget && link && !link.hidden) {
      const safeLink = document.createElement('a');
      safeLink.className = 'button secondary';
      safeLink.href = link.href;
      safeLink.target = '_blank';
      safeLink.rel = 'noopener';
      safeLink.textContent = link.textContent || 'Ouvrir le rapport';
      linkTarget.replaceChildren(safeLink);
    } else if (linkTarget) linkTarget.replaceChildren();
  }

  async function loadDocuments(projectId) {
    const node = document.getElementById('workspaceR11DocumentStatus');
    const table = document.getElementById('workspaceR11DocumentTable');
    if (!node || !table) return;
    if (!projectId) return showDocumentMessage('Projet non disponible dans cette session.');
    const sequence = ++requestSequence;
    const config = window.SOLARSHIFT_CONFIG || {};
    const sessionKey = config.sessionStorageKey || 'ozeno-supabase-session';
    let session;
    try { session = JSON.parse(localStorage.getItem(sessionKey) || 'null'); } catch { session = null; }
    if (!session?.access_token || !config.supabaseUrl || !config.supabasePublishableKey) {
      return showDocumentMessage('Connexion et accès projet requis pour afficher le manifeste documentaire.');
    }
    setDocumentStatus('Lecture du dossier documentaire…');
    table.replaceChildren();
    try {
      const endpoint = config.projectDocumentEndpoint || `${config.supabaseUrl}/functions/v1/upload-project-document`;
      const url = new URL(endpoint, location.href);
      url.searchParams.set('projectId', projectId);
      const response = await fetch(url, { headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) {
        if (sequence === requestSequence) showDocumentMessage('Les pièces ne sont pas disponibles pour ce projet ou ce rôle.');
        return;
      }
      const payload = await response.json();
      if (sequence !== requestSequence) return;
      const rows = (payload.documents || []).filter((row) => DOCUMENT_TYPES.some(([type]) => type === row.documentType));
      const latestByType = new Map();
      for (const row of rows) if (!latestByType.has(row.documentType)) latestByType.set(row.documentType, row);
      const presentCount = latestByType.size;
      const pendingCount = [...latestByType.values()].filter((item) => ['PENDING', 'PROCESSING'].includes(item.processingStatus)).length;
      const failedCount = [...latestByType.values()].filter((item) => item.processingStatus === 'FAILED').length;
      const metrics = `<div class="workspaceR11DocMetrics"><article><b>${presentCount} / ${DOCUMENT_TYPES.length}</b><span>types avec document visible</span></article><article><b>${pendingCount}</b><span>en attente de traitement</span></article><article><b>${failedCount}</b><span>traitement en échec</span></article></div>`;
      const body = DOCUMENT_TYPES.map(([type, label]) => {
        const item = latestByType.get(type);
        const state = item ? '<span class="workspaceR11DocState is-present">Présent</span>' : '<span class="workspaceR11DocState is-missing">Aucun document visible</span>';
        const processing = item?.processingStatus ? esc(({ PENDING: 'En attente', PROCESSING: 'En cours', PROCESSED: 'Traité', FAILED: 'Échec' })[item.processingStatus] || item.processingStatus) : '—';
        const date = item ? esc(dateLabel(item.uploadedAt)) : '—';
        const fileLink = item?.downloadUrl ? `<a class="workspaceR11DocLink" href="${esc(item.downloadUrl)}" target="_blank" rel="noopener noreferrer">Ouvrir le document</a>` : (item ? `<span>${esc(item.fileName || 'Document déposé')}</span>` : '');
        return `<tr data-r11-document-row="${esc(type)}"><th scope="row">${esc(label)}<small>${fileLink}</small></th><td>${state}</td><td>${processing}<small>${date}</small></td><td><input type="file" data-r11-document-file hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp"><button class="button secondary workspaceR11Upload" type="button" data-r11-select-file>${item ? 'Ajouter une version' : 'Joindre un document'}</button></td></tr>`;
      }).join('');
      table.innerHTML = `${metrics}<div class="tableWrap"><table class="table workspaceR11DocumentTable"><thead><tr><th>Pièce</th><th>Présence</th><th>Traitement · dernier dépôt</th><th>Action</th></tr></thead><tbody>${body}</tbody></table></div>`;
      setDocumentStatus(`Dossier chargé pour ce projet · ${presentCount} type(s) avec un document accessible. L’ajout est soumis aux droits de dépôt du projet.`, 'success');
    } catch {
      if (sequence === requestSequence) showDocumentMessage('Impossible de charger les pièces de ce projet pour le moment.');
    }
  }

  function init() {
    const section = document.getElementById('section-report');
    if (!section || section.dataset.r11Installed === 'true') return;
    const summary = section.querySelector(':scope > .sectionSummary');
    const toolbar = section.querySelector(':scope > .reportToolbar');
    const history = section.querySelector(':scope > #reportHistory');
    if (!summary || !toolbar || !history) return;
    installStyles();
    section.dataset.r11Installed = 'true';
    createTabs(section);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}());
