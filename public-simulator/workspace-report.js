(function () {
  'use strict';
  const config = window.SOLARSHIFT_CONFIG || {};
  const endpoint = config.frozenScenarioReportEndpoint || `${config.supabaseUrl}/functions/v1/frozen-scenario-report`;
  const sessionKey = config.sessionStorageKey || 'ozeno-supabase-session';
  const status = document.getElementById('reportActionStatus');
  const button = document.getElementById('generateScenarioReport');
  const type = document.getElementById('reportTypeSelect');
  const viewpoint = document.getElementById('reportViewpointSelect');
  let selectedScenarioId = new URLSearchParams(location.search).get('scenarioId') || '';
  let selectedScenarioStatus = '';
  const getSession = () => { try { return JSON.parse(localStorage.getItem(sessionKey) || 'null'); } catch { return null; } };
  const setStatus = (text, tone = '') => { status.textContent = text; status.className = `muted ${tone}`; };
  const reportHeading = button.closest('#scenarioPanel')?.querySelector('hr + h3');
  const reportDescription = reportHeading?.nextElementSibling;
  if (reportHeading) reportHeading.textContent = 'Rapport décisionnel · CR-007';
  if (reportDescription) reportDescription.textContent = 'Rapport en six sections, assemblé sans recalcul depuis un scénario validé et son instantané FREEZE concordant. Les faits absents restent UNKNOWN ; si des données manquent ou sont périmées, le document porte le statut « Rapport provisoire ». La publication reste soumise à ses prérequis.';
  button.textContent = 'Générer le rapport CR-007';
  const setType = () => {
    if (type.value === 'OWNER') {
      viewpoint.innerHTML = '<option value="OWNER">Propriétaire / porteur</option>';
    } else {
      viewpoint.innerHTML = '<option value="INVESTOR">Investisseur</option><option value="SPV">SPV</option>';
    }
  };
  type.addEventListener('change', setType);
  setType();

  document.addEventListener('click', (event) => {
    const open = event.target.closest('[data-open-scenario]');
    if (!open) return;
    selectedScenarioId = open.dataset.openScenario || '';
    selectedScenarioStatus = '';
    button.disabled = !selectedScenarioId;
    document.getElementById('generatedReportLink').hidden = true;
    setStatus(selectedScenarioId ? 'Rapport prêt à être généré pour ce scénario après FREEZE et validation.' : 'Ouvrez d’abord un scénario.');
  }, true);

  window.addEventListener('ozeno:workspace-scenario-selected', (event) => {
    selectedScenarioId = event.detail?.scenarioId || '';
    selectedScenarioStatus = event.detail?.status || '';
    const reportable = ['VALIDATED', 'PUBLISHED'].includes(selectedScenarioStatus);
    button.disabled = !selectedScenarioId || !reportable;
    document.getElementById('generatedReportLink').hidden = true;
    setStatus(reportable
      ? 'Scénario figé et validé sélectionné. Le rapport peut être assemblé sans recalcul.'
      : `Scénario ${selectedScenarioStatus || 'UNKNOWN'} sélectionné. Terminez le calcul et la validation avant la génération du rapport.`);
  });

  button.addEventListener('click', async () => {
    const session = getSession();
    if (!selectedScenarioId) return setStatus('Ouvrez un scénario dans la liste avant de générer son rapport.', 'error');
    if (!session?.access_token) return setStatus('Connexion requise pour générer un rapport.', 'error');
    button.disabled = true;
    setStatus('Assemblage du rapport depuis le scénario figé…');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', scenarioId: selectedScenarioId, reportType: type.value, financialViewpoint: viewpoint.value })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Erreur ${response.status}`);
      const presentation = window.OzenoReportStatus.frozenReportPresentationStatus(result);
      const publication = result.publication_gate?.ready
        ? 'Prérequis de publication satisfaits.'
        : `Publication bloquée par ${result.publication_gate?.blockers?.length || 0} donnée(s) requise(s).`;
      const missing = presentation.unresolvedCount
        ? ` ${presentation.unresolvedCount} donnée(s) restent UNKNOWN ou périmée(s).`
        : '';
      setStatus(`${presentation.label}.${missing} ${publication}`, presentation.provisional ? 'warn' : '');
      const link = document.getElementById('generatedReportLink');
      link.href = `./scenario-report.html?id=${encodeURIComponent(result.report.id)}`;
      link.textContent = presentation.provisional ? 'Ouvrir le rapport provisoire' : 'Ouvrir le rapport';
      link.hidden = false;
    } catch (error) {
      setStatus(error.message || 'Impossible de générer le rapport.', 'error');
    } finally {
      button.disabled = false;
    }
  });

  if (selectedScenarioId) button.disabled = false;
})();
