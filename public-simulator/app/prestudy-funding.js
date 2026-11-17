(function () {
  'use strict';

  const CR015_BY_FUNDING_ID = Object.freeze({
    'FUND-PV-001': ['CR015_S21'],
    'FUND-PV-002': ['CR015_AOS_PETIT_PV', 'CR015_AOS_PETIT_PV_P2']
  });
  const STATUS_LABELS = Object.freeze({
    POTENTIAL: 'Piste potentielle · à confirmer',
    NEEDS_DATA: 'Données à compléter',
    NEEDS_REVIEW: 'Revue humaine requise',
    EXCLUDED: 'Écart identifié selon les critères du pilote',
    CLOSED: 'Période de référence fermée',
    POTENTIALLY_ELIGIBLE: 'Pré-éligibilité indicative · à confirmer sur pièces',
    ELIGIBLE_TO_APPLY: 'Conditions à confirmer avant toute candidature',
    NOT_ELIGIBLE: 'Non compatible selon les critères vérifiés',
    PERIOD_CLOSED: 'Période fermée',
    REQUIRES_TENDER: 'Procédure d’appel d’offres',
    UNKNOWN: 'À vérifier',
    REPORTED_OPEN_UNVERIFIED: 'Ouverture signalée · non vérifiée en direct',
    STATUS_UNKNOWN: 'État du guichet à confirmer',
    CLOSED_AT_REFERENCE: 'Fermé à la date de référence',
    REFERENCE_DEADLINE_PASSED: 'Date limite de référence dépassée'
  });
  const $ = (id) => document.getElementById(id);
  const finance = $('audit-finance');
  const efficiency = $('audit-efficiency');
  if ((!finance && !efficiency) || $('prestudyFundingQualification')) return;

  const panel = document.createElement('fieldset');
  panel.id = 'prestudyFundingQualification';
  panel.className = 'financeGroup prestudyFundingPanel';
  panel.innerHTML = '<legend>Aides potentielles</legend><p>Le repérage indicatif réutilise les informations disponibles du projet. Les dispositifs, l’éligibilité et les périodes restent à confirmer sur pièces ; aucune aide n’est garantie et aucune demande n’est déposée.</p><div id="prestudyIndicativeFundingHint" role="status" aria-live="polite">Le repérage des aides se mettra à jour avec les données disponibles de la pré-étude.</div><div id="prestudyFundingResults" role="status" aria-live="polite">Les résultats d’aides déjà associés au scénario apparaîtront ici lorsqu’ils auront été qualifiés. Les pistes liées à l’isolation et au chauffage apparaissent sous les questions.</div><fieldset id="prestudyEnvelopeHeating" class="prestudyEnvelopeHeating"><legend>Isolation et chauffage</legend><p>Quelques réponses permettent de repérer automatiquement des pistes à examiner. Elles restent indicatives et ne modifient aucun indicateur financier.</p><form id="prestudyEnvelopeHeatingForm" class="form" autocomplete="off"><label>Isolation actuelle des murs<select name="wallCurrentState"><option value="UNKNOWN">Je ne sais pas</option><option value="INSIDE">Par l’intérieur</option><option value="OUTSIDE">Par l’extérieur</option><option value="BOTH">Les deux, selon les zones</option><option value="NONE_KNOWN">Aucune isolation connue</option></select></label><label>Isolation des murs envisagée<select name="wallInsulationPlan"><option value="UNKNOWN">Je ne sais pas</option><option value="NONE">Aucun travail prévu</option><option value="ITI">Isolation par l’intérieur (ITI)</option><option value="ITE">Isolation par l’extérieur (ITE)</option><option value="BOTH">Les deux, selon les zones</option><option value="OTHER">Autre solution à définir</option></select></label><label>Mode de chauffage actuel<select name="currentHeatingSystem"><option value="UNKNOWN">Je ne sais pas</option><option value="GAS_BOILER">Chaudière gaz</option><option value="OIL_BOILER">Chaudière fioul</option><option value="COAL_BOILER">Chaudière charbon</option><option value="PROPANE_BOILER">Chaudière propane</option><option value="DIRECT_ELECTRIC">Chauffage électrique direct</option><option value="HEAT_PUMP">Pompe à chaleur</option><option value="HEAT_NETWORK">Réseau de chaleur</option><option value="BIOMASS">Chaudière biomasse</option><option value="OTHER">Autre système</option></select></label><label>Un remplacement du chauffage est-il envisagé ?<select name="heatingReplacementPlanned"><option value="UNKNOWN">Je ne sais pas</option><option value="NO">Non</option><option value="YES">Oui</option></select></label><label id="plannedHeatingSystemField" hidden>Système de remplacement envisagé<select name="plannedHeatingSystem"><option value="UNKNOWN">Je ne sais pas</option><option value="NONE">À définir</option><option value="HEAT_NETWORK">Réseau de chaleur</option><option value="HP_AIR_WATER">Pompe à chaleur air/eau</option><option value="HP_WATER_WATER">Pompe à chaleur eau/eau</option><option value="GEOTHERMAL">Géothermie</option><option value="BIOMASS">Biomasse</option><option value="OTHER">Autre solution</option></select></label></form><div id="prestudyFundingLeadList" role="status" aria-live="polite">Les pistes correspondantes seront recherchées automatiquement après vos réponses.</div></fieldset>';
  const fundingHeading = $('prestudyFinanceFundingHeading');
  const fundingAnchor = finance?.querySelector('.financeFundingConfiguration');
  function mountFundingPanel() {
    const target = $('audit-efficiency');
    if (!target) return false;
    // Keep Funding after efficiency and before the navigation footer.
    const footer = target.querySelector(':scope > .prestudyChapterFooter');
    if (footer) {
      if (panel.parentElement !== target || panel.nextElementSibling !== footer) footer.before(panel);
    } else if (panel.parentElement !== target || target.lastElementChild !== panel) target.append(panel);
    return true;
  }
  if (!mountFundingPanel()) {
    if (fundingHeading?.parentElement === finance) fundingHeading.insertAdjacentElement('afterend', panel);
    else if (fundingAnchor) fundingAnchor.append(panel);
    else finance.append(panel);
    const mountObserver = new MutationObserver(() => {
      if (mountFundingPanel()) mountObserver.disconnect();
    });
    mountObserver.observe(document.querySelector('.auditJourney') || document.body, { childList: true, subtree: true });
  }
  const efficiencyOrderObserver = new MutationObserver(() => { mountFundingPanel(); });
  const currentEfficiency = $('audit-efficiency');
  if (currentEfficiency) efficiencyOrderObserver.observe(currentEfficiency, { childList: true });
  const emptyMessage = 'Aucun résultat Funding n’est encore associé au projet et au scénario actifs.';
  let hintTimer = 0, hintRequest = 0;
  const qualificationForm = $('prestudyEnvelopeHeatingForm');
  let leadTimer = 0, leadRequest = null, leadVersion = 0;
  const leadList = $('prestudyFundingLeadList');

  function qualificationValues() {
    return Object.fromEntries([...qualificationForm.querySelectorAll('[name]')].map((node) => [node.name, node.value]));
  }
  function captureQualification() {
    if (!qualificationForm) return null;
    return { schemaVersion: 1, capturedAt: qualificationForm.dataset.updatedAt || null, answers: qualificationValues() };
  }
  function restoreQualification(saved) {
    if (!qualificationForm || !saved || typeof saved !== 'object' || !saved.answers) return;
    qualificationForm.querySelectorAll('[name]').forEach((node) => {
      const value = saved.answers[node.name];
      if (typeof value === 'string' && [...node.options].some((option) => option.value === value)) node.value = value;
    });
    qualificationForm.dataset.updatedAt = typeof saved.capturedAt === 'string' ? saved.capturedAt : '';
    updatePlannedSystemVisibility();
    scheduleLeadSearch();
  }
  function updatePlannedSystemVisibility() {
    const planned = qualificationForm?.elements.heatingReplacementPlanned?.value === 'YES';
    const field = $('plannedHeatingSystemField');
    if (field) field.hidden = !planned;
  }
  function scheduleLeadSearch() {
    window.clearTimeout(leadTimer);
    leadTimer = window.setTimeout(() => { void searchFundingLeads(); }, 220);
  }
  async function searchFundingLeads() {
    if (!qualificationForm || !leadList) return;
    leadRequest?.abort();
    const requestVersion = ++leadVersion;
    const values = qualificationValues();
    const wallWork = ['ITI', 'ITE', 'BOTH'].includes(values.wallInsulationPlan);
    const heatingWork = values.heatingReplacementPlanned === 'YES';
    if (!wallWork && !heatingWork) {
      leadList.textContent = values.wallInsulationPlan === 'UNKNOWN' || values.heatingReplacementPlanned === 'UNKNOWN'
        ? 'Précisez les travaux envisagés pour rechercher des pistes adaptées. Une réponse inconnue ne signifie pas qu’aucune aide existe.'
        : 'Aucun travail d’isolation des murs ou de chauffage n’est déclaré comme prévu pour le moment.';
      return;
    }
    const config = window.SOLARSHIFT_CONFIG || {};
    const endpoint = config.prestudyFundingLeadsEndpoint || (config.supabaseUrl ? `${config.supabaseUrl}/functions/v1/prestudy-funding-leads` : '');
    if (!endpoint || typeof config.getAccessToken !== 'function') {
      leadList.textContent = 'Connectez-vous pour rechercher les pistes Funding de la pré-étude.';
      return;
    }
    leadList.textContent = 'Recherche indicative des pistes correspondantes…';
    leadRequest = new AbortController();
    try {
      const token = await config.getAccessToken();
      if (!token) throw new Error('Connectez-vous pour rechercher les pistes Funding de la pré-étude.');
      const response = await fetch(endpoint, {
        method: 'POST', signal: leadRequest.signal,
        headers: { apikey: config.supabasePublishableKey || '', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallInsulationPlan: values.wallInsulationPlan, currentHeatingSystem: values.currentHeatingSystem, heatingReplacementPlanned: values.heatingReplacementPlanned, plannedHeatingSystem: values.plannedHeatingSystem })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `La recherche Funding a échoué (${response.status}).`);
      if (requestVersion !== leadVersion) return;
      leadList.replaceChildren();
      if (Array.isArray(result.leads) && result.leads.length) {
        result.leads.forEach((lead) => {
          const card = document.createElement('article'); card.className = 'prestudyFundingLead';
          const title = document.createElement('strong'); title.textContent = lead.title || 'Piste à examiner';
          const status = document.createElement('span'); status.className = 'prestudyFundingLeadStatus'; status.textContent = lead.status || 'À vérifier';
          const description = document.createElement('p'); description.textContent = lead.description || '';
          card.append(status, title, description);
          if (typeof lead.sourceUrl === 'string' && /^https:\/\//i.test(lead.sourceUrl)) {
            const source = document.createElement('a'); source.href = lead.sourceUrl; source.target = '_blank'; source.rel = 'noopener noreferrer'; source.textContent = 'Consulter la source officielle'; card.append(source);
          }
          if (lead.sourceCheckedAt) { const checked = document.createElement('small'); checked.textContent = `Source consultée le ${lead.sourceCheckedAt} · conditions à revalider.`; card.append(checked); }
          leadList.append(card);
        });
      } else {
        const noMatch = document.createElement('p'); noMatch.textContent = result.title || 'Aucune piste ciblée avec ces réponses'; leadList.append(noMatch);
      }
      const note = document.createElement('p'); note.className = 'fine'; note.textContent = result.note || 'Aucune aide n’est garantie. Cette recherche ne dépose pas de demande et ne modifie pas les indicateurs financiers.'; leadList.append(note);
    } catch (error) {
      if (error?.name === 'AbortError' || requestVersion !== leadVersion) return;
      leadList.textContent = error instanceof Error ? error.message : 'Recherche indicative indisponible pour le moment.';
    }
  }
  qualificationForm?.addEventListener('change', (event) => {
    if (!event.target?.name) return;
    qualificationForm.dataset.updatedAt = new Date().toISOString();
    updatePlannedSystemVisibility();
    scheduleLeadSearch();
    renderSummaryFunding();
  });
  qualificationForm?.addEventListener('input', (event) => {
    if (event.target?.name) qualificationForm.dataset.updatedAt = new Date().toISOString();
  });
  window.OzenoBuildingEnergyPrestudy = Object.freeze({ capture: captureQualification, restore: restoreQualification });
  scheduleLeadSearch();

  function departmentCode() {
    const config = window.SOLARSHIFT_CONFIG || {};
    const source = config.commercialAddressForLookup || {};
    const raw = String(source.cityCode || config.projectContext?.city_code || source.postalCode || config.projectContext?.postal_code || window.OzenoParcelQualification?.capture?.()?.parcel?.cityCode || '').trim().toUpperCase();
    const match = raw.match(/^(2[AB]|\d{2,3})/);
    if (!match || match[1] === '20') return '';
    return match[1].startsWith('97') || match[1].startsWith('98') ? match[1].slice(0, 3) : match[1].slice(0, 2);
  }

  async function refreshIndicativeHint() {
    const output = $('prestudyIndicativeFundingHint');
    if (!output) return;
    const config = window.SOLARSHIFT_CONFIG || {};
    const preview = config.commercialProductionPreview;
    const pvKwc = Number(preview?.installedCapacityKwp);
    const department = departmentCode();
    const endpoint = config.publicFundingHintEndpoint;
    const requestId = ++hintRequest;
    if (!Number.isFinite(pvKwc) || pvKwc <= 0) {
      output.textContent = 'La puissance photovoltaïque n’est pas encore calculée. Terminez le repérage des surfaces pour lancer le repérage indicatif des aides.';
      return;
    }
    if (!endpoint) {
      output.textContent = `Puissance prise en compte : ${pvKwc.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kWc${department ? ` · département ${department}` : ''}. Le service de repérage n’est pas disponible dans cet environnement.`;
      return;
    }
    output.textContent = `Vérification indicative en cours · ${pvKwc.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kWc${department ? ` · département ${department}` : ''}…`;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: config.supabasePublishableKey || '' },
        body: JSON.stringify({ pvKwc, ...(department ? { siteDepartmentCode: department } : {}), projectTiming: 'unknown' })
      });
      if (!response.ok) throw new Error(`funding_hint_http_${response.status}`);
      const hint = await response.json();
      if (requestId !== hintRequest) return;
      const context = `Repérage indicatif · ${pvKwc.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kWc${department ? ` · département ${department}` : ''}.`;
      output.replaceChildren();
      const title = document.createElement('strong');
      title.textContent = typeof hint.title === 'string' ? hint.title : 'Les aides restent à vérifier';
      const note = document.createElement('span');
      note.textContent = `${context} ${typeof hint.subtitle === 'string' ? hint.subtitle : 'Les critères du bénéficiaire, du montage et les pièces justificatives restent à examiner.'}`;
      output.append(title, note);
    } catch {
      if (requestId !== hintRequest) return;
      output.textContent = `Repérage indisponible pour le moment · ${pvKwc.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kWc${department ? ` · département ${department}` : ''}. Les aides seront à vérifier à partir du bénéficiaire, du montage et des pièces du projet.`;
    }
  }

  function scheduleIndicativeHint() {
    window.clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => { void refreshIndicativeHint(); }, 250);
  }
  for (const name of ['ozeno:commercial-production-preview', 'ozeno:site-location-updated', 'ozeno:project-context-loaded', 'ozeno:parcel-qualification-updated']) {
    window.addEventListener(name, scheduleIndicativeHint);
  }
  scheduleIndicativeHint();

  function clear() {
    const output = $('prestudyFundingResults');
    if (output) output.textContent = emptyMessage;
    renderSummaryFunding();
  }

  function text(element, value) { element.textContent = value; return element; }
  function appendMatch(list, match, program, sourceLabel) {
    const item = document.createElement('li');
    const name = text(document.createElement('strong'), program?.name || match.programId || match.scheme_code || 'Dispositif');
    const statusKey = match.eligibility_status || match.status || match.procedural_status || 'UNKNOWN';
    const status = text(document.createElement('span'), STATUS_LABELS[statusKey] || 'À vérifier');
    const details = document.createElement('small');
    const windowStatus = match.windowStatus || match.procedural_status;
    details.textContent = [sourceLabel, windowStatus && STATUS_LABELS[windowStatus], match.humanReviewRequired ? 'Revue humaine requise' : null].filter(Boolean).join(' · ');
    item.append(name, status, details);
    const sourceUrl = program?.source?.url;
    if (typeof sourceUrl === 'string' && /^https:\/\//i.test(sourceUrl)) {
      const source = document.createElement('a');
      source.href = sourceUrl;
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      source.textContent = [program.source.publisher, program.source.checkedAt && `Source contrôlée le ${program.source.checkedAt}`].filter(Boolean).join(' · ') || 'Source officielle';
      item.append(source);
    }
    const findings = Array.isArray(match.findings) ? match.findings : [];
    const missing = Array.isArray(match.missingFields) ? match.missingFields : [];
    if (findings.length || missing.length) {
      const disclosure = document.createElement('details');
      const summary = text(document.createElement('summary'), 'Points à vérifier');
      const reasons = document.createElement('ul');
      for (const finding of findings) {
        const value = typeof finding === 'string' ? finding : finding.message;
        if (typeof value === 'string') reasons.append(text(document.createElement('li'), value));
      }
      for (const field of missing) reasons.append(text(document.createElement('li'), `Donnée manquante : ${field}`));
      disclosure.append(summary, reasons);
      item.append(disclosure);
    }
    list.append(item);
  }

  function render(payload = {}) {
    const output = $('prestudyFundingResults');
    if (!output) return;
    const projectId = typeof payload.projectId === 'string' ? payload.projectId : '';
    const scenarioId = typeof payload.scenarioId === 'string' ? payload.scenarioId : '';
    if (!projectId || !scenarioId) { clear(); return; }
    const matches = Array.isArray(payload.matches) ? payload.matches.filter((match) => match.current === true && match.projectId === projectId && match.scenarioId === scenarioId) : [];
    const programs = new Map((Array.isArray(payload.programs) ? payload.programs : []).map((program) => [program.id, program]));
    const cr015Results = Array.isArray(payload.cr015Results) ? payload.cr015Results.filter((result) => result.current === true && result.project_id === projectId && result.scenario_id === scenarioId) : [];
    const cr015Codes = new Set(cr015Results.map((result) => result.scheme_code));
    const selected = matches.filter((match) => {
      const linkedCodes = CR015_BY_FUNDING_ID[match.programId] || [];
      return !linkedCodes.some((code) => cr015Codes.has(code));
    });
    output.replaceChildren();
    const list = document.createElement('ul');
    for (const result of cr015Results) appendMatch(list, result, null, 'CR-015 · résultat versionné');
    for (const match of selected) appendMatch(list, match, programs.get(match.programId), 'Funding Core P2 · pilote documentaire');
    if (!list.children.length) {
      output.textContent = Array.isArray(payload.matches) || Array.isArray(payload.cr015Results)
        ? 'Aucun résultat exploitable à présenter pour ce projet et ce scénario.'
        : emptyMessage;
      renderSummaryFunding();
      return;
    }
    output.append(list);
    renderSummaryFunding();
  }

  let renderedSummaryFundingSignature = null;
  function renderSummaryFunding() {
    const summary = $('ozeno-summary');
    if (!summary) return;
    let card = $('prestudySummaryFunding');
    if (!card) {
      card = document.createElement('section');
      card.id = 'prestudySummaryFunding';
      card.className = 'prestudySummaryFunding';
      card.setAttribute('aria-labelledby', 'prestudySummaryFundingTitle');
      card.innerHTML = '<div class="prestudySummaryFundingHead"><span class="prestudySummaryFundingIcon" aria-hidden="true">✦</span><div><p>Aides potentielles</p><h3 id="prestudySummaryFundingTitle">Des pistes restent à vérifier</h3></div></div><div class="prestudySummaryFundingBody"></div><p class="prestudySummaryFundingDisclaimer">Repérage indicatif : l’éligibilité et la disponibilité restent à confirmer. Aucune demande n’est déposée ; les aides ne modifient pas les indicateurs financiers.</p><a class="prestudySummaryFundingLink" href="#prestudy-efficiency-funding">Voir les aides et compléter les informations →</a>';
      const style = document.createElement('style');
      style.id = 'prestudySummaryFundingStyles';
      style.textContent = '.prestudySummaryFunding{margin:22px 0;padding:18px 20px;border:1px solid #cfe4d8;border-radius:12px;background:#f2f8f4;color:#244b3c}.prestudySummaryFundingHead{display:flex;align-items:center;gap:12px}.prestudySummaryFundingIcon{display:grid;place-items:center;flex:0 0 36px;width:36px;height:36px;border-radius:50%;background:#e4f3df;color:#25834f;font-size:23px}.prestudySummaryFundingHead p{margin:0;color:#698674;font-size:12px}.prestudySummaryFundingHead h3{margin:2px 0 0;color:#165d40;font-size:18px}.prestudySummaryFundingBody{display:grid;gap:8px;margin-top:12px}.prestudySummaryFundingItem{margin:0;padding:10px 12px;border-radius:7px;background:#fff;font-size:13px;line-height:1.5}.prestudySummaryFundingItem ul{margin:6px 0 0;padding-left:20px}.prestudySummaryFundingItem a{color:#235a46;font-weight:650}.prestudySummaryFundingDisclaimer{margin:12px 0 0;color:#61796b;font-size:12px;line-height:1.5}.prestudySummaryFundingLink{display:inline-block;margin-top:10px;color:#135e42;font-weight:700;text-underline-offset:3px}';
      if (!document.getElementById(style.id)) document.head.append(style);
    }
    const anchor = summary.querySelector('#ooiDiagnosticPanel') || summary.querySelector('.decision');
    if (anchor && card.previousElementSibling !== anchor) anchor.insertAdjacentElement('afterend', card);
    else if (!card.isConnected) summary.append(card);
    const body = card.querySelector('.prestudySummaryFundingBody');
    if (!body) return;
    const sections = [
      ['Repérage photovoltaïque', $('prestudyIndicativeFundingHint')],
      ['Dispositifs associés au projet', $('prestudyFundingResults')],
    ['Travaux déclarés', buildDeclaredWorksSummary()],
    ['Isolation et chauffage', $('prestudyFundingLeadList')]
    ];
    const signature = JSON.stringify(sections.map(([label, source]) => [label, source?.innerHTML || source?.textContent || '']));
    if (signature === renderedSummaryFundingSignature) return;
    renderedSummaryFundingSignature = signature;
    body.replaceChildren();
    for (const [label, source] of sections) {
      if (!source || !source.textContent.trim()) continue;
      const item = document.createElement('div');
      item.className = 'prestudySummaryFundingItem';
      const heading = document.createElement('strong'); heading.textContent = label;
      const copy = source.cloneNode(true);
      copy.removeAttribute?.('id');
      copy.querySelectorAll?.('[id]').forEach((element) => element.removeAttribute('id'));
      item.append(heading, copy);
      body.append(item);
    }
  }

  function buildDeclaredWorksSummary() {
    if (!qualificationForm) return null;
    const names = ['wallCurrentState', 'wallInsulationPlan', 'currentHeatingSystem', 'heatingReplacementPlanned', 'plannedHeatingSystem'];
    const list = document.createElement('ul');
    for (const name of names) {
      const field = qualificationForm.elements.namedItem(name);
      if (!field || field.value === 'UNKNOWN' || !field.value) continue;
      const label = field.closest('label')?.childNodes[0]?.textContent?.trim() || name;
      const answer = field.selectedOptions?.[0]?.textContent?.trim() || field.value;
      const item = document.createElement('li');
      item.textContent = `${label} : ${answer}`;
      list.append(item);
    }
    return list.childElementCount ? list : null;
  }

  ['prestudyIndicativeFundingHint', 'prestudyFundingResults', 'prestudyFundingLeadList'].forEach((id) => {
    const source = $(id);
    if (source) new MutationObserver(() => queueMicrotask(renderSummaryFunding)).observe(source, { childList: true, characterData: true, subtree: true });
  });
  window.addEventListener('ozeno:prestudy-summary-presentation-ready', renderSummaryFunding);
  window.addEventListener('ozeno:prestudy-chapter-shown', renderSummaryFunding);
  qualificationForm?.addEventListener('change', renderSummaryFunding);
  renderSummaryFunding();

  window.OZENO_FUNDING_PRESTUDY = Object.freeze({ render, clear });
  window.addEventListener('ozeno:funding-results-ready', (event) => render(event.detail));
})();
