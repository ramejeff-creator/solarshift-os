(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const validated = new Map();
  const draftObservations = new Map();
  const riskDocuments = new Map();

  function factors() {
    return [...($('riskFactor')?.options || [])].map((option) => ({ id: option.value, label: option.textContent.replace(/^✓\s*/, '') }));
  }

  function renderCoverage() {
    const host = $('riskCoverage');
    if (!host) return;
    const all = factors();
    host.innerHTML = `<div class="riskCoverageHead"><b>Points vérifiés</b><span>${validated.size}/${all.length}</span></div><div class="riskMarkers">${all.map((factor) => `<span class="${validated.has(factor.id) ? 'checked' : ''}"><i>${validated.has(factor.id) ? '✓' : '○'}</i>${factor.label}</span>`).join('')}</div>`;
    [...$('riskFactor').options].forEach((option) => {
      const label = option.textContent.replace(/^✓\s*/, '');
      option.textContent = `${validated.has(option.value) ? '✓ ' : ''}${label}`;
    });
    const marker = $('riskFactorMarker');
    if (marker) {
      const checked = validated.has($('riskFactor').value);
      marker.className = `riskFactorMarker ${checked ? 'checked' : ''}`;
      marker.textContent = checked ? '✓ Validé' : '○ À vérifier';
    }
  }

  function hasProvisionalSurface() {
    const legacySurface = Number($('surface')?.value);
    if (Number.isFinite(legacySurface) && legacySurface > 0) return true;
    const readout = $('roofUsableAreaReadout')?.textContent || '';
    const parsedReadout = Number(readout.replace(/\s/g, '').replace(/[^\d,.-]/g, '').replace(',', '.'));
    return Number.isFinite(parsedReadout) && parsedReadout > 0;
  }

  function hasProvisionalOrientation() {
    if ($('orientation')?.value?.trim()) return true;
    const azimuthField = $('manualAzimuth');
    if (!azimuthField || azimuthField.value.trim() === '') return false;
    const azimuth = Number(azimuthField.value);
    return Number.isFinite(azimuth) && azimuth >= -180 && azimuth <= 180;
  }

  function updateDecisionFromCoverage() {
    const box = $('decisionStatus');
    if (!box) return;
    const surfaceKnown = hasProvisionalSurface();
    const orientationKnown = hasProvisionalOrientation();
    const tri = Number(($('irr')?.textContent || '').replace(',', '.').replace(/[^0-9.-]/g, ''));
    const scores = [...validated.values()];
    const highest = scores.length ? Math.max(...scores) : 0;
    const total = factors().length;
    const riskDetail = validated.size
      ? `${validated.size}/${total} facteurs vérifiés · ${highest >= 100 ? 'risque bloquant documenté' : highest >= 75 ? 'risque important à traiter' : 'aucun risque bloquant documenté'}`
      : `0/${total} facteurs vérifiés · aucun constat documenté`;
    const riskCount = $('dashRiskCount');
    if (riskCount) riskCount.textContent = riskDetail;
    let state = 'pending', title = 'Données insuffisantes', reason = 'Mesurez la toiture, renseignez l’orientation et vérifiez les risques.';
    if (highest >= 100) {
      state = 'nogo'; title = 'NO-GO provisoire'; reason = 'Un risque bloquant a été documenté. Il doit être traité avant une nouvelle décision.';
    } else if (!surfaceKnown || !orientationKnown) {
      reason = !surfaceKnown ? 'Surface exploitable à mesurer ou confirmer.' : 'Orientation de la toiture à renseigner.';
    } else if (validated.size < total) {
      state = validated.size ? 'conditional' : 'pending';
      title = validated.size ? 'Qualification en cours' : 'Données insuffisantes';
      reason = `${validated.size}/${total} points vérifiés. Il reste ${total - validated.size} point${total - validated.size > 1 ? 's' : ''} à contrôler.`;
    } else if (!Number.isNaN(tri) && tri < 7) {
      title = 'À analyser'; reason = 'Tous les points sont vérifiés, mais le TRI annuel reste inférieur au seuil de travail de 7 %.';
    } else if (highest >= 75) {
      state = 'conditional'; title = 'GO conditionnel'; reason = `Les ${total} points sont vérifiés, avec au moins un risque important à traiter avant décision définitive.`;
    } else {
      state = 'conditional'; title = 'GO proposé'; reason = `Les ${total} points de risque sont vérifiés. Le dossier peut passer à la validation finale.`;
    }
    box.className = `decisionStatus ${state}`;
    box.innerHTML = `<small>Qualification & risques</small><strong>${title}</strong><span data-decision-next-action><b>Prochaine action :</b> ${reason}</span><span data-decision-risk>${riskDetail}</span>`;
  }

  function boot() {
    const risk = $('audit-risk');
    const button = $('addRisk');
    if (!risk || !button) return;
    const title = risk.querySelector('.sectionTitle h2');
    if (title) title.textContent = 'Registre de risques et documents';
    const creditOption = [...$('riskFactor').options].find((option) => option.value === 'R06');
    if (creditOption) {
      const energyOption = document.createElement('option');
      energyOption.value = 'B01';
      energyOption.textContent = 'Performance énergétique du bâtiment';
      creditOption.replaceWith(energyOption);
    }
    $('riskFactor').addEventListener('change', () => {
      if ($('riskFactor').value === 'B01' && $('riskHelp')) {
        $('riskHelp').textContent = 'Performance énergétique : joignez si possible un audit énergétique, un DPE ou une étude de consommation. Ce point de qualification bâtiment est distinct du risque de solvabilité R06 du référentiel.';
      }
      renderRiskDocuments($('riskFactor').value);
    });
    const obsolete = [...risk.querySelectorAll('p.fine')].find((node) => /Obligatoire pour une saisie manuelle/i.test(node.textContent));
    obsolete?.remove();
    const coverage = document.createElement('div');
    coverage.id = 'riskCoverage';
    coverage.className = 'riskCoverage';
    button.insertAdjacentElement('beforebegin', coverage);
    const factorLabel = $('riskFactor').closest('label');
    const marker = document.createElement('span');
    marker.id = 'riskFactorMarker';
    marker.className = 'riskFactorMarker';
    marker.textContent = '○ À vérifier';
    factorLabel?.insertBefore(marker, $('riskFactor'));
    const actions = document.createElement('div');
    actions.className = 'riskActions';
    button.insertAdjacentElement('beforebegin', actions);
    actions.appendChild(button);
    const fileLabel = document.createElement('label');
    fileLabel.className = 'riskEvidencePicker';
    fileLabel.textContent = 'Justificatif pour ce point';
    const fileInput = document.createElement('input');
    fileInput.id = 'riskEvidenceFile';
    fileInput.type = 'file';
    fileInput.accept = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.webp';
    fileLabel.appendChild(fileInput);
    const uploadButton = document.createElement('button');
    uploadButton.id = 'riskEvidenceUpload';
    uploadButton.className = 'secondary';
    uploadButton.type = 'button';
    uploadButton.textContent = 'Joindre le document';
    actions.append(fileLabel, uploadButton);
    const uploadStatus = document.createElement('p');
    uploadStatus.id = 'riskEvidenceUploadStatus';
    uploadStatus.className = 'fine riskEvidenceUploadStatus';
    uploadStatus.setAttribute('role', 'status');
    uploadStatus.setAttribute('aria-live', 'polite');
    uploadStatus.textContent = 'Le justificatif sera enregistré dans les documents privés du projet et rattaché au point sélectionné.';
    const documentList = document.createElement('ul');
    documentList.id = 'riskEvidenceDocuments';
    documentList.className = 'riskEvidenceDocuments';
    actions.insertAdjacentElement('afterend', uploadStatus);
    uploadStatus.insertAdjacentElement('afterend', documentList);
    const style = document.createElement('style');
    style.textContent = '.riskFactorMarker{float:right;margin:0 0 4px 8px;padding:3px 8px;border-radius:99px;background:#fff2c9;color:#6b5000;font-size:12px;font-weight:800}.riskFactorMarker.checked{background:#dff0e5;color:#08734c}.riskCoverage{clear:both;margin:14px 0;padding:12px;border:1px solid #cfe0d5;border-radius:9px;background:#f7faf8}.riskCoverageHead{display:flex;justify-content:space-between;gap:10px;margin-bottom:9px}.riskCoverageHead span{font-weight:800;color:#08734c}.riskMarkers{display:flex;flex-wrap:wrap;gap:7px}.riskMarkers span{display:flex;align-items:center;gap:5px;padding:5px 8px;border-radius:99px;background:#fff;border:1px solid #d5e4d8;font-size:12px;color:#587469}.riskMarkers span.checked{background:#dff0e5;border-color:#54a378;color:#073d2a}.riskMarkers i{font-style:normal;font-weight:900}.riskActions{display:flex;flex-wrap:wrap;align-items:end;gap:8px;margin:12px 0 4px}.riskActions #addRisk{margin:0}.riskEvidencePicker{display:grid;gap:4px;min-width:240px;margin:0;font-weight:650}.riskEvidencePicker input{max-width:360px;padding:6px;border:1px solid #cbd9d1;border-radius:6px;background:#fff}.riskActions #riskEvidenceUpload{margin:0}.riskEvidenceUploadStatus{margin:5px 0;color:#587469}.riskEvidenceDocuments{display:grid;gap:5px;margin:5px 0 12px;padding-left:19px}.riskEvidenceDocuments:empty{display:none}.riskEvidenceDocuments li{font-size:12px;color:#315b4b}.decisionStatus span{display:block!important;background:transparent!important;color:inherit!important;border-left:3px solid currentColor!important;padding:7px 8px!important}.decisionStatus strong,.decisionStatus small{color:inherit!important}';
    document.head.appendChild(style);
    renderCoverage();
    $('riskFactor').addEventListener('change', renderCoverage);
    function renderRiskDocuments(factor) {
      if (!documentList) return;
      documentList.replaceChildren();
      const documents = riskDocuments.get(factor) || [];
      documents.forEach((file) => {
        const item = document.createElement('li');
        if (file.downloadUrl) {
          const link = document.createElement('a');
          link.href = file.downloadUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = file.fileName || 'Justificatif';
          item.appendChild(link);
        } else item.textContent = file.fileName || 'Justificatif';
        documentList.appendChild(item);
      });
    }
    async function loadRiskDocuments() {
      const config = window.SOLARSHIFT_CONFIG || {};
      if (!config.projectId || !config.getAccessToken) { renderRiskDocuments($('riskFactor').value); return; }
      try {
        const token = await config.getAccessToken();
        if (!token) return;
        const response = await fetch(`${config.projectDocumentEndpoint || `${config.supabaseUrl}/functions/v1/upload-project-document`}?projectId=${encodeURIComponent(config.projectId)}`, {
          headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${token}` }
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `Erreur ${response.status}`);
        riskDocuments.clear();
        (payload.documents || []).filter((file) => file.documentType === 'RISK_EVIDENCE' && file.riskFactor).forEach((file) => {
          const documents = riskDocuments.get(file.riskFactor) || [];
          documents.push(file);
          riskDocuments.set(file.riskFactor, documents);
        });
        renderRiskDocuments($('riskFactor').value);
      } catch (error) {
        uploadStatus.textContent = `Lecture des justificatifs indisponible : ${error.message}`;
      }
    }
    loadRiskDocuments();
    window.addEventListener('ozeno:project-context-loaded', () => { riskDocuments.clear(); loadRiskDocuments(); });
    uploadButton.addEventListener('click', async () => {
      const file = fileInput.files?.[0];
      if (!file) { uploadStatus.textContent = 'Sélectionnez un justificatif à joindre.'; return; }
      const config = window.SOLARSHIFT_CONFIG || {};
      if (!config.projectId || !config.getAccessToken) {
        uploadStatus.textContent = 'Ouvrez un projet partagé et connectez-vous pour enregistrer le justificatif dans son dossier privé.';
        return;
      }
      uploadButton.disabled = true;
      try {
        const token = await config.getAccessToken();
        if (!token) throw new Error('Session expirée : reconnectez-vous puis réessayez.');
        const form = new FormData();
        form.set('projectId', config.projectId);
        form.set('documentType', 'RISK_EVIDENCE');
        form.set('riskFactor', $('riskFactor').value);
        form.set('file', file, file.name);
        const response = await fetch(config.projectDocumentEndpoint || `${config.supabaseUrl}/functions/v1/upload-project-document`, {
          method: 'POST', headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${token}` }, body: form
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `Échec de l’envoi (${response.status}).`);
        const factor = $('riskFactor').value;
        const documents = riskDocuments.get(factor) || [];
        documents.unshift({ ...payload, downloadUrl: null });
        riskDocuments.set(factor, documents);
        const existingObservation = draftObservations.get(factor);
        if (existingObservation) existingObservation.evidenceDocuments = documents.map(({ documentId, fileName, documentType, riskFactor }) => ({ documentId, fileName, documentType, riskFactor }));
        renderRiskDocuments(factor);
        fileInput.value = '';
        uploadStatus.textContent = `Justificatif joint à « ${factors().find((item) => item.id === factor)?.label || factor} » dans le dossier projet.`;
        window.dispatchEvent(new CustomEvent('ozeno:risk-document-attached', { detail: { riskFactor: factor, documentId: payload.documentId } }));
        await loadRiskDocuments();
      } catch (error) {
        uploadStatus.textContent = `Justificatif non ajouté : ${error.message}`;
      } finally { uploadButton.disabled = false; }
    });
    window.updateDecision = updateDecisionFromCoverage;
    button.addEventListener('click', () => {
      const selectedFactor = $('riskFactor').value;
      validated.set($('riskFactor').value, Number($('riskObservation').value || 0));
      draftObservations.set($('riskFactor').value, {
        factor: selectedFactor, score: Number($('riskObservation').value || 0),
        evidence: $('riskEvidence').value, source: $('riskSource').value,
        description: $('riskList').textContent, recordedAt: new Date().toISOString(),
        evidenceDocuments: (riskDocuments.get(selectedFactor) || []).map(({ documentId, fileName, documentType, riskFactor }) => ({ documentId, fileName, documentType, riskFactor }))
      });
      $('dashRiskCount').textContent = `${validated.size}/${factors().length} points vérifiés`;
      renderCoverage();
      updateDecisionFromCoverage();
    });
    window.OzenoRiskDraft = {
      capture: () => [...draftObservations.values()].map((record) => ({ ...record })),
      restore(records = []) {
        validated.clear(); draftObservations.clear();
        riskDocuments.clear();
        for (const record of records) {
          if (!factors().some((factor) => factor.id === record.factor) || !Number.isFinite(record.score)) continue;
          validated.set(record.factor, record.score); draftObservations.set(record.factor, { ...record });
          if (record.evidenceDocuments?.length) riskDocuments.set(record.factor, record.evidenceDocuments);
        }
        const last = [...draftObservations.values()].at(-1);
        if ($('riskList')) $('riskList').textContent = last?.description || 'Aucun constat documenté.';
        renderRiskDocuments($('riskFactor').value); renderCoverage(); updateDecisionFromCoverage();
      }
    };
    updateDecisionFromCoverage();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
}());
