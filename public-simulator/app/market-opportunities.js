(() => {
  const NOTICE_KEY = 'ozeno.market-notices.v1';
  const OPPORTUNITY_KEY = 'ozeno.market-opportunities.v1';
  const DCE_META_KEY = 'ozeno.opportunity-dce.v1';
  const MARKET_SYNC_KEY = 'ozeno.market-sync-state.v1';
  const DB_NAME = 'ozeno-opportunity-dce-local';
  const DB_VERSION = 1;
  const noticeStatuses = { TO_QUALIFY: 'À qualifier', NEEDS_INFO: 'À compléter', NO_GO: 'Classé sans suite', TRANSFERRED: 'Transféré au portefeuille' };
  const stages = { DCE_TO_COLLECT: 'DCE à récupérer', DCE_TO_ANALYZE: 'DCE à analyser', GO_NO_GO: 'Go / no-go', RESPONSE_PREP: 'Réponse en préparation', AWARDED: 'Attribuée', LOST: 'Perdue', CLOSED: 'Clôturée' };
  const sectors = { pv: 'Photovoltaïque', canopy: 'Ombrières', irve: 'IRVE', renovation: 'Rénovation énergétique tertiaire', maintenance: 'Exploitation / maintenance', other: 'Autre' };
  const documentTypes = { RC: 'Règlement de consultation', CCAP: 'CCAP', CCTP: 'CCTP', AE: 'Acte d’engagement', DQE: 'DQE / bordereau financier', ANNEX: 'Annexe', OTHER: 'Autre pièce' };
  const findingKinds = { REQUIREMENT: 'Exigence', CRITERION: 'Critère de jugement', INFORMATION: 'Information', QUESTION: 'Question à poser' };
  const reviewStates = { TO_REVIEW: 'À vérifier', CONFIRMED: 'Confirmé par l’équipe', AMBIGUOUS: 'Ambigu / à instruire' };
  const $ = (id) => document.getElementById(id);
  const load = (key) => { try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };
  const save = (key, rows) => localStorage.setItem(key, JSON.stringify(rows));
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const dateLabel = (value) => { if (!value) return 'Date limite inconnue'; const text = String(value); const d = new Date(text.includes('T') ? text : `${text.slice(0, 10)}T12:00:00`); if (Number.isNaN(d.getTime())) return 'Date limite à vérifier'; const date = d.toLocaleDateString('fr-FR'); const time = text.includes('T') ? ` à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''; return `Dépôt · ${date}${time}`; };
  const officialUrl = (value) => { try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
  const formatSize = (bytes) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
  let activeOpportunityId = null;
  let databasePromise;

  function openDatabase() {
    if (!('indexedDB' in window)) return Promise.reject(new Error('Ce navigateur ne prend pas en charge le stockage local des pièces.'));
    if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' }); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Ouverture du stockage local impossible.'));
    });
    return databasePromise;
  }

  async function putFile(record) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(record);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error || new Error('Enregistrement de la pièce impossible.'));
      tx.onabort = () => reject(tx.error || new Error('Enregistrement interrompu.'));
    });
  }

  async function getFile(id) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction('files', 'readonly').objectStore('files').get(id);
      request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error);
    });
  }

  async function sha256(file) {
    if (!crypto.subtle) return null;
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
  }

  const activeOpportunity = () => load(OPPORTUNITY_KEY).find((row) => row.id === activeOpportunityId) || null;
  const dceMeta = () => { const all = load(DCE_META_KEY); return all.find((row) => row.opportunityId === activeOpportunityId) || { opportunityId: activeOpportunityId, documents: [], findings: [] }; };
  function saveDceMeta(meta) { const all = load(DCE_META_KEY).filter((row) => row.opportunityId !== meta.opportunityId); all.push(meta); save(DCE_META_KEY, all); }

  const normalized = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').replace(/[^a-z0-9]+/g, ' ').trim();

  function renderMarketSourceStates() {
    const target = $('hubMarketSourceStates'); if (!target) return;
    const state = (() => { try { return JSON.parse(localStorage.getItem(MARKET_SYNC_KEY) || '{}'); } catch { return {}; } })();
    const names = { BOAMP: 'BOAMP · DILA', TED: 'TED · JOUE' };
    target.innerHTML = Object.entries(names).map(([key, label]) => {
      const item = state[key];
      const status = item?.status === 'READY' ? 'Synchronisé' : item?.status === 'UNAVAILABLE' ? 'Indisponible' : 'Pas encore consulté';
      return `<div class="hubMarketSourceState"><strong>${label}</strong><span class="${item?.status === 'UNAVAILABLE' ? 'isUnavailable' : ''}">${status}</span><small>${item?.checkedAt ? `Vérifié le ${new Date(item.checkedAt).toLocaleString('fr-FR')}` : 'Aucune date de synchronisation'}</small>${item?.message ? `<small>${esc(item.message)}</small>` : ''}</div>`;
    }).join('');
    const latest = Object.values(state).map((item) => item?.checkedAt).filter(Boolean).sort().at(-1);
    const status = $('hubMarketSyncStatus');
    if (status && latest) status.textContent = `Dernière vérification : ${new Date(latest).toLocaleString('fr-FR')} · synchronisation lancée manuellement.`;
  }

  function mergeMarketFeed(incoming) {
    const notices = load(NOTICE_KEY);
    for (const fresh of incoming) {
      const match = notices.find((row) => row.sourceId === fresh.sourceId && row.source === fresh.source)
        || notices.find((row) => {
          if (normalized(row.title) !== normalized(fresh.title) || normalized(row.buyer) !== normalized(fresh.buyer) || !row.deadline || !fresh.deadline) return false;
          return String(row.deadline).slice(0, 10) === String(fresh.deadline).slice(0, 10);
        });
      if (match) {
        const refs = [...(match.sourceRefs || [])];
        for (const sourceRef of fresh.sourceRefs || []) if (!refs.some((item) => item.source === sourceRef.source && item.id === sourceRef.id)) refs.push(sourceRef);
        match.sourceRefs = refs;
        match.sources = [...new Set([...(match.sources || [match.source || 'MANUAL']), fresh.source])];
        match.lastSeenAt = new Date().toISOString();
        match.events ||= [];
        if (fresh.deadline && match.deadline && String(fresh.deadline) !== String(match.deadline)) {
          match.events.unshift({ type: 'DEADLINE_CHANGED', at: new Date().toISOString(), before: match.deadline, after: fresh.deadline, source: fresh.source });
          match.deadline = fresh.deadline;
        } else if (!match.deadline && fresh.deadline) match.deadline = fresh.deadline;
        if (fresh.noticeStatus && match.noticeStatus && fresh.noticeStatus !== match.noticeStatus) {
          match.events.unshift({ type: 'SOURCE_STATUS_CHANGED', at: new Date().toISOString(), before: match.noticeStatus, after: fresh.noticeStatus, source: fresh.source });
          match.noticeStatus = fresh.noticeStatus;
        } else if (!match.noticeStatus && fresh.noticeStatus) match.noticeStatus = fresh.noticeStatus;
        if (fresh.updatedAt && fresh.updatedAt !== match.updatedAt) match.updatedAt = fresh.updatedAt;
        continue;
      }
      notices.unshift({ ...fresh, id: crypto.randomUUID(), sources: [fresh.source], status: fresh.source === 'APPROCH' ? 'ANTICIPATE' : 'TO_QUALIFY', events: [], firstSeenAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() });
    }
    save(NOTICE_KEY, notices);
  }

  async function syncMarketSources() {
    const button = $('hubMarketSync'); const status = $('hubMarketSyncStatus');
    if (button) { button.disabled = true; button.textContent = 'Actualisation…'; }
    if (status) status.textContent = 'Consultation des sources publiques BOAMP et TED…';
    try {
      const response = await fetch('/__local/market-notice-feed?source=all', { headers: { Accept: 'application/json' } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Erreur ${response.status}`);
      const state = (() => { try { return JSON.parse(localStorage.getItem(MARKET_SYNC_KEY) || '{}'); } catch { return {}; } })();
      Object.assign(state, payload.results || {});
      localStorage.setItem(MARKET_SYNC_KEY, JSON.stringify(state));
      mergeMarketFeed(payload.notices || []);
      renderMarketSourceStates(); renderNotices();
      const ready = Object.values(payload.results || {}).filter((item) => item.status === 'READY').length;
      if (status) status.textContent = `${payload.notices?.length || 0} avis reçus · ${ready}/2 sources disponibles. Vérifiez la source officielle avant toute qualification.`;
    } catch (error) {
      if (status) status.textContent = `Synchronisation impossible : ${error.message || 'service local indisponible'}. Les avis déjà enregistrés restent consultables.`;
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Actualiser BOAMP + TED'; }
    }
  }

  function renderNotices() {
    const list = $('hubMarketNoticeList'); if (!list) return;
    const term = ($('hubMarketSearch')?.value || '').trim().toLocaleLowerCase('fr');
    const filter = $('hubMarketStatus')?.value || 'open';
    const sector = $('hubMarketSector')?.value || 'pv';
    const source = $('hubMarketSource')?.value || 'all';
    const territory = ($('hubMarketTerritory')?.value || '').trim().toLocaleLowerCase('fr');
    const deadlineFilter = $('hubMarketDeadline')?.value || 'all';
    const rows = load(NOTICE_KEY).filter((row) => {
      const searchable = `${row.title} ${row.buyer} ${row.territory} ${row.reference || ''} ${row.sourceId || ''}`.toLocaleLowerCase('fr');
      const rowSources = row.sources || [row.source || 'MANUAL'];
      const statusMatch = filter === 'all' || (filter === 'transferred' ? row.status === 'TRANSFERRED' : filter === 'closed' ? row.status === 'NO_GO' : filter === 'anticipate' ? row.source === 'APPROCH' || row.status === 'ANTICIPATE' : ['TO_QUALIFY', 'NEEDS_INFO'].includes(row.status) && row.source !== 'APPROCH');
      const deadline = row.deadline ? new Date(String(row.deadline).includes('T') ? row.deadline : `${String(row.deadline).slice(0, 10)}T12:00:00`) : null;
      const deadlineMatch = deadlineFilter === 'all' || (deadlineFilter === 'unknown' ? !row.deadline : deadlineFilter === 'expired' ? deadline && deadline < new Date() : deadline && deadline >= new Date() && deadline <= new Date(Date.now() + 30 * 86400000));
      return statusMatch && searchable.includes(term) && (!territory || String(row.territory || '').toLocaleLowerCase('fr').includes(territory)) && deadlineMatch && (sector === 'all' || row.sector === sector) && (source === 'all' || rowSources.includes(source) || row.source === source);
    });
    $('hubMarketCount').textContent = String(rows.length);
    list.innerHTML = rows.length ? rows.map((row) => {
      const refs = row.sourceRefs || [{ source: row.source || 'MANUAL', id: row.sourceId || '', url: row.sourceUrl || '' }];
      const primary = refs[0] || {};
      const sourceLabel = [...new Set(refs.map((ref) => ref.source))].join(' + ') || 'Ajout manuel';
      const deadline = row.deadline ? dateLabel(row.deadline) : 'Date limite inconnue · à vérifier';
      const changed = row.updatedAt ? ` · dernière mise à jour source ${new Date(row.updatedAt).toLocaleDateString('fr-FR')}` : '';
      const changedBadge = (row.events || []).length ? '<span class="hubMarketCorrection">Modification de source détectée</span>' : '';
      const history = (row.events || []).length ? `<details class="hubMarketHistory"><summary>Historique des modifications (${row.events.length})</summary>${row.events.map((event) => `<p>${esc(new Date(event.at).toLocaleString('fr-FR'))} · ${esc(event.type === 'DEADLINE_CHANGED' ? `Échéance : ${event.before} → ${event.after}` : `Statut source : ${event.before} → ${event.after}`)} · ${esc(event.source)}</p>`).join('')}</details>` : '';
      const references = refs.length > 1 ? `<details class="hubMarketHistory"><summary>${refs.length} références de source rapprochées</summary>${refs.map((ref) => `<p>${esc(ref.source)} · ${esc(ref.id || 'référence non fournie')} · <a href="${esc(officialUrl(ref.url))}" target="_blank" rel="noopener noreferrer">Ouvrir ↗</a></p>`).join('')}</details>` : '';
      const statusLabel = row.source === 'APPROCH' ? 'À anticiper' : (noticeStatuses[row.status] || noticeStatuses.TO_QUALIFY);
      return `<article class="hubMarketCard"><div class="hubMarketCardHead"><div><span class="hubMarketKicker">${esc(sectors[row.sector] || 'Marché public')} · ${esc(sourceLabel)}</span><h3>${esc(row.title)} ${changedBadge}</h3><p>${esc(row.buyer)}${row.territory ? ` · ${esc(row.territory)}` : ''}</p></div><span class="hubMarketStatus">${esc(statusLabel)}</span></div><div class="hubMarketMeta"><span>${esc(deadline)}${esc(changed)}</span><a href="${esc(officialUrl(primary.url || row.sourceUrl))}" target="_blank" rel="noopener noreferrer">Voir la source officielle ↗</a></div>${history}${references}<div class="hubMarketActions">${row.status !== 'TRANSFERRED' && row.source !== 'APPROCH' ? `<button type="button" data-market-action="qualify" data-id="${esc(row.id)}" class="hubPrimary">Qualifier et ajouter au portefeuille</button><button type="button" data-market-action="complete" data-id="${esc(row.id)}" class="hubSecondary">Marquer à compléter</button><button type="button" data-market-action="close" data-id="${esc(row.id)}" class="hubSecondary">Classer sans suite</button>` : row.source === 'APPROCH' ? '<span class="hubMarketNote">Projet d’achat en amont · pas encore une consultation ouverte.</span>' : '<span class="hubMarketNote">Le dossier qualifié est dans Portefeuille › Opportunités.</span>'}</div></article>`;
    }).join('') : '<p class="hubEmpty">Aucun avis dans cette sélection. Actualisez les sources ou ajustez les filtres.</p>';
  }

  function renderOpportunities() {
    const list = $('hubOpportunityList'); if (!list) return;
    const filter = $('hubOpportunityStage')?.value || 'all';
    const rows = load(OPPORTUNITY_KEY).filter((row) => filter === 'all' || row.stage === filter);
    $('hubOpportunityCount').textContent = String(rows.length);
    list.innerHTML = rows.length ? rows.map((row) => `<article class="hubMarketCard"><div class="hubMarketCardHead"><div><span class="hubMarketKicker">${esc(sectors[row.sector] || 'Marché public')} · qualification humaine</span><h3>${esc(row.title)}</h3><p>${esc(row.buyer)}${row.territory ? ` · ${esc(row.territory)}` : ''}</p></div><span class="hubMarketStatus">${esc(stages[row.stage] || stages.DCE_TO_COLLECT)}</span></div><div class="hubMarketMeta"><span>${esc(dateLabel(row.deadline))}</span><a href="${esc(officialUrl(row.sourceUrl))}" target="_blank" rel="noopener noreferrer">Ouvrir la source officielle ↗</a></div><label class="hubMarketStage"><span>Étape du dossier</span><select data-market-stage="${esc(row.id)}">${Object.entries(stages).map(([key, label]) => `<option value="${key}"${row.stage === key ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select></label><div class="hubMarketActions"><button type="button" class="hubPrimary" data-open-dce="${esc(row.id)}">Ouvrir le dossier DCE</button></div><p class="hubMarketNote">Avis transféré le ${esc(new Date(row.qualifiedAt).toLocaleDateString('fr-FR'))}. Le DCE doit être récupéré sur le profil acheteur officiel.</p></article>`).join('') : '<p class="hubEmpty">Aucune opportunité qualifiée. Les avis n’entrent ici qu’après validation explicite d’une personne OZENO.</p>';
  }

  function renderDceDocuments() {
    const target = $('hubDceDocuments'); if (!target || !activeOpportunityId) return;
    const docs = [...dceMeta().documents].sort((a, b) => b.importedAt.localeCompare(a.importedAt));
    const groups = new Map();
    for (const doc of docs) { const group = groups.get(doc.groupKey) || []; group.push(doc); groups.set(doc.groupKey, group); }
    target.innerHTML = docs.length ? [...groups.values()].map((versions) => {
      versions.sort((a, b) => b.version - a.version);
      const latest = versions[0];
      return `<article class="hubDceDocument"><div class="hubDceDocumentHead"><span class="hubDceFileIcon">${esc(latest.extension.toUpperCase() || 'DOC')}</span><div><strong>${esc(latest.fileName)}</strong><small>${esc(documentTypes[latest.documentType] || 'Autre pièce')} · ${versions.length} version${versions.length === 1 ? '' : 's'} conservée${versions.length === 1 ? '' : 's'}</small></div><button type="button" class="hubSecondary" data-dce-download="${esc(latest.fileId)}">Télécharger l’original</button></div><p class="hubDceVersionMeta">V${latest.version} · importée le ${new Date(latest.importedAt).toLocaleString('fr-FR')} · ${formatSize(latest.size)} · SHA-256 ${latest.sha256 ? esc(latest.sha256.slice(0, 16)) + '…' : 'non disponible'}</p>${versions.length > 1 ? `<details class="hubDceOlder"><summary>Historique des versions (${versions.length - 1})</summary>${versions.slice(1).map((doc) => `<div class="hubDceOldVersion"><span>V${doc.version} · ${new Date(doc.importedAt).toLocaleString('fr-FR')} · ${formatSize(doc.size)}</span><button type="button" class="hubSecondary" data-dce-download="${esc(doc.fileId)}">Télécharger</button></div>`).join('')}</details>` : ''}</article>`;
    }).join('') : '<p class="hubEmpty">Aucune pièce déposée dans ce dossier.</p>';
    const findingSelect = $('hubDceFindingDocument');
    if (findingSelect) findingSelect.innerHTML = docs.length ? `<option value="">Choisir une pièce</option>${docs.map((doc) => `<option value="${esc(doc.id)}">${esc(doc.fileName)} · V${doc.version}</option>`).join('')}` : '<option value="">Ajouter d’abord une pièce</option>';
  }

  function renderDceFindings() {
    const target = $('hubDceFindings'); if (!target || !activeOpportunityId) return;
    const meta = dceMeta();
    target.innerHTML = meta.findings.length ? meta.findings.map((finding) => {
      const doc = meta.documents.find((row) => row.id === finding.documentId);
      return `<article class="hubDceFinding"><div class="hubDceFindingTop"><span class="hubDceFindingKind">${esc(findingKinds[finding.kind] || 'Information')}</span><label><span class="visuallyHidden">Revue humaine</span><select data-dce-review="${esc(finding.id)}">${Object.entries(reviewStates).map(([key, label]) => `<option value="${key}"${finding.review === key ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select></label></div><strong>${esc(finding.title)}</strong><p>${doc ? `<button type="button" class="hubDceSourceLink" data-dce-download="${esc(doc.fileId)}">${esc(doc.fileName)} · V${doc.version}</button>` : 'Pièce source indisponible'} · ${esc(finding.reference)}</p>${finding.note ? `<small>${esc(finding.note)}</small>` : ''}<small>Relevé le ${new Date(finding.createdAt).toLocaleString('fr-FR')} · revue humaine requise</small></article>`;
    }).join('') : '<p class="hubEmpty">Aucun élément relevé. Les dates, critères et obligations restent inconnus tant qu’ils n’ont pas été lus dans une pièce.</p>';
  }

  function openDce(opportunityId) {
    const opportunity = load(OPPORTUNITY_KEY).find((row) => row.id === opportunityId); if (!opportunity) return;
    activeOpportunityId = opportunityId;
    $('hubDceTitle').textContent = opportunity.title;
    $('hubDceSubtitle').textContent = `${opportunity.buyer}${opportunity.territory ? ` · ${opportunity.territory}` : ''} · ${dateLabel(opportunity.deadline)}`;
    $('hubDceWorkspace').hidden = false;
    $('hubDceWorkspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
    renderDceDocuments(); renderDceFindings();
  }

  async function importDceFiles(form) {
    const input = form.elements.files; const files = [...(input.files || [])]; if (!files.length) return;
    const meta = dceMeta(); const type = String(form.elements.documentType.value || 'OTHER');
    const status = $('hubDceUploadStatus'); status.textContent = 'Conservation des pièces et calcul de leurs empreintes…';
    let imported = 0; const errors = [];
    for (const file of files) {
      try {
        const checksum = await sha256(file);
        if (checksum && meta.documents.some((doc) => doc.sha256 === checksum)) { errors.push(`${file.name} : doublon exact déjà conservé.`); continue; }
        const baseName = file.name.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').replace(/[^a-z0-9]+/g, ' ').trim();
        const groupKey = `${type}:${baseName}`;
        const version = Math.max(0, ...meta.documents.filter((doc) => doc.groupKey === groupKey).map((doc) => doc.version)) + 1;
        const fileId = crypto.randomUUID();
        await putFile({ id: fileId, opportunityId: activeOpportunityId, fileName: file.name, mimeType: file.type || 'application/octet-stream', blob: file });
        meta.documents.push({ id: crypto.randomUUID(), opportunityId: activeOpportunityId, fileId, fileName: file.name, extension: file.name.split('.').pop() || '', documentType: type, groupKey, version, size: file.size, sha256: checksum, importedAt: new Date().toISOString(), sourceUrl: activeOpportunity()?.sourceUrl || null });
        imported++;
      } catch (error) { errors.push(`${file.name} : ${error.message || 'stockage indisponible'}`); }
    }
    try { saveDceMeta(meta); } catch { status.textContent = 'Indexation impossible : espace local insuffisant.'; return; }
    form.reset(); renderDceDocuments(); renderDceFindings();
    status.textContent = `${imported} pièce${imported > 1 ? 's' : ''} conservée${imported > 1 ? 's' : ''}.${errors.length ? ` ${errors.join(' ')}` : ''}`;
  }

  async function downloadDceFile(fileId) {
    const file = await getFile(fileId); if (!file) { window.alert('L’original n’est plus présent dans le stockage local de ce navigateur.'); return; }
    const url = URL.createObjectURL(file.blob); const link = document.createElement('a'); link.href = url; link.download = file.fileName; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function bind() {
    $('hubMarketNoticeForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.currentTarget; const values = new FormData(form); const sourceUrl = officialUrl(values.get('sourceUrl'));
      if (!sourceUrl) { form.elements.sourceUrl.setCustomValidity('Saisissez un lien http ou https vers la source officielle.'); form.elements.sourceUrl.reportValidity(); return; }
      form.elements.sourceUrl.setCustomValidity(''); const rows = load(NOTICE_KEY);
      const source = String(values.get('source') || 'MANUAL');
      rows.unshift({ id: crypto.randomUUID(), title: String(values.get('title')).trim(), buyer: String(values.get('buyer')).trim(), sector: String(values.get('sector')), territory: String(values.get('territory') || '').trim(), deadline: String(values.get('deadline') || ''), source, sourceId: null, sourceUrl, sourceRefs: [{ source, id: '', url: sourceUrl }], sources: [source], status: 'TO_QUALIFY', createdAt: new Date().toISOString() });
      try { save(NOTICE_KEY, rows); form.reset(); renderNotices(); } catch { window.alert('Le navigateur ne permet pas l’enregistrement local de cet avis.'); }
    });
    $('hubMarketNoticeList')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-market-action]'); if (!button) return;
      const notices = load(NOTICE_KEY); const row = notices.find((item) => item.id === button.dataset.id); if (!row) return;
      if (button.dataset.marketAction === 'complete') row.status = 'NEEDS_INFO';
      else if (button.dataset.marketAction === 'close') row.status = 'NO_GO';
      else if (button.dataset.marketAction === 'qualify') {
        if (!window.confirm('Confirmer la qualification humaine et le transfert de cet avis vers Portefeuille › Opportunités ?')) return;
        const opportunities = load(OPPORTUNITY_KEY);
        if (!opportunities.some((item) => item.originNoticeId === row.id)) opportunities.unshift({ ...row, id: crypto.randomUUID(), originNoticeId: row.id, stage: 'DCE_TO_COLLECT', qualifiedAt: new Date().toISOString() });
        row.status = 'TRANSFERRED'; save(OPPORTUNITY_KEY, opportunities); renderOpportunities();
      }
      save(NOTICE_KEY, notices); renderNotices();
    });
    $('hubMarketSearch')?.addEventListener('input', renderNotices);
    ['hubMarketStatus', 'hubMarketSector', 'hubMarketSource', 'hubMarketDeadline'].forEach((id) => $(id)?.addEventListener('change', renderNotices));
    $('hubMarketTerritory')?.addEventListener('input', renderNotices);
    $('hubMarketSync')?.addEventListener('click', syncMarketSources);
    $('hubOpportunityStage')?.addEventListener('change', renderOpportunities);
    $('hubOpportunityList')?.addEventListener('click', (event) => { const button = event.target.closest('[data-open-dce]'); if (button) openDce(button.dataset.openDce); });
    $('hubDceBack')?.addEventListener('click', () => { $('hubDceWorkspace').hidden = true; activeOpportunityId = null; $('hubOpportunityList')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    $('hubDceUploadForm')?.addEventListener('submit', (event) => { event.preventDefault(); importDceFiles(event.currentTarget).catch((error) => { $('hubDceUploadStatus').textContent = error.message || 'Le stockage local des pièces est indisponible.'; }); });
    $('hubDceDocuments')?.addEventListener('click', (event) => { const button = event.target.closest('[data-dce-download]'); if (button) downloadDceFile(button.dataset.dceDownload).catch(() => window.alert('Téléchargement local impossible.')); });
    $('hubDceFindingForm')?.addEventListener('submit', (event) => {
      event.preventDefault(); if (!activeOpportunityId) return;
      const form = event.currentTarget; const values = new FormData(form); const meta = dceMeta();
      if (!meta.documents.some((doc) => doc.id === values.get('documentId'))) { $('hubDceUploadStatus').textContent = 'Ajoutez une pièce avant de relever une exigence.'; return; }
      meta.findings.unshift({ id: crypto.randomUUID(), title: String(values.get('title')).trim(), kind: String(values.get('kind')), documentId: String(values.get('documentId')), reference: String(values.get('reference')).trim(), review: String(values.get('review')), note: String(values.get('note') || '').trim(), createdAt: new Date().toISOString() });
      try { saveDceMeta(meta); form.reset(); renderDceDocuments(); renderDceFindings(); } catch { window.alert('Enregistrement local du relevé impossible.'); }
    });
    $('hubDceFindings')?.addEventListener('change', (event) => {
      const select = event.target.closest('[data-dce-review]'); if (!select || !activeOpportunityId) return;
      const meta = dceMeta(); const finding = meta.findings.find((row) => row.id === select.dataset.dceReview); if (!finding) return;
      finding.review = select.value; finding.reviewedAt = new Date().toISOString(); saveDceMeta(meta); renderDceFindings();
    });
    $('hubDceFindings')?.addEventListener('click', (event) => { const button = event.target.closest('[data-dce-download]'); if (button) downloadDceFile(button.dataset.dceDownload).catch(() => window.alert('Téléchargement local impossible.')); });
    $('hubOpportunityList')?.addEventListener('change', (event) => {
      const select = event.target.closest('[data-market-stage]'); if (!select) return;
      const rows = load(OPPORTUNITY_KEY); const row = rows.find((item) => item.id === select.dataset.marketStage); if (!row) return;
      row.stage = select.value; row.updatedAt = new Date().toISOString(); save(OPPORTUNITY_KEY, rows); renderOpportunities();
    });
    window.addEventListener('storage', (event) => { if ([NOTICE_KEY, OPPORTUNITY_KEY].includes(event.key)) { renderNotices(); renderOpportunities(); } });
  }

  window.ozenoMarketOpportunities = { activate(moduleName) { if (moduleName === 'markets') { renderMarketSourceStates(); renderNotices(); const state = (() => { try { return JSON.parse(localStorage.getItem(MARKET_SYNC_KEY) || '{}'); } catch { return {}; } })(); const last = Object.values(state).map((item) => Date.parse(item?.checkedAt || '')).filter(Number.isFinite).sort((a,b) => b-a)[0] || 0; if (Date.now() - last > 86400000) syncMarketSources(); } if (moduleName === 'opportunities') renderOpportunities(); } };
  bind();
})();
