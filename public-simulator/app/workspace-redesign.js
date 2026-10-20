(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const labels = { VERIFIED: 'Vérifié', ASSUMPTION: 'Estimation', UNKNOWN: 'À compléter', STALE: 'À actualiser', PARTIAL: 'Couverture partielle', READY: 'Disponible', INCOMPLETE: 'À compléter', DRAFT: 'Brouillon', CALCULATED: 'Calculé', VALIDATED: 'Validé', PUBLISHED: 'Publié', RETIRED: 'Archivé', LEAD: 'Prospection', QUALIFICATION: 'Qualification', DATA_COLLECTION: 'Collecte de données', ANALYSIS: 'Analyse', VALIDATION: 'Validation', PRE_FINANCEABLE: 'Pré-finançable', FINANCEABLE: 'Finançable', CONTRACTING: 'Contractualisation', EXECUTION: 'Réalisation', OPERATING: 'En exploitation', ARCHIVED: 'Archivé', CONFIGURATION: 'Configuration', LOCAL_SELF_CONSUMPTION: 'Autoconsommation locale', FULL_SALE: 'Vente totale', CANONICAL: 'Matching temporel', TEMPORAL_MATCHING: 'Matching temporel · Canonique', ANNUAL_PREVIEW: 'Estimation annuelle', EXPORT: 'Vente réseau', CURTAILMENT: 'Écrêtement', ACI: 'ACI', ACC: 'ACC', SURPLUS: 'Surplus', FULL_SALE_CHANNEL: 'Vente totale', PROJECT_SPV: 'SPV', CLIENT: 'Client', INVESTOR: 'Investisseur', SOLARSHIFT: 'SolarShift', OWNER: 'Porteur / propriétaire', SITE_OWNER: 'Propriétaire du site', PV_ASSET_OWNER: 'Propriétaire de la centrale PV', ENERGY_CONSUMER: 'Consommateur', LENDER: 'Prêteur', GRID_IMPORT: 'Réseau', CLIENT_SAVING: 'Économie client', ENERGY_PAYMENT: 'Paiement énergie', PROJECT_REVENUE: 'Revenu projet', GRID_EXPORT_REVENUE: 'Revenu vente réseau', RENT: 'Loyer', FEE: 'Frais', OPEX: 'Charges opérationnelles', irr: 'TRI', npv: 'VAN', payback_years: 'Temps de retour', lcoe: 'Coût solaire / kWh' };
  const label = (value) => labels[value] || value || 'À compléter';
  const fmt = (value, unit = '', digits = 2) => value == null || !Number.isFinite(Number(value)) ? 'À compléter' : `${Number(value).toLocaleString('fr-FR', { maximumFractionDigits: digits })}${unit ? ` ${unit}` : ''}`;
  const date = (value) => { if (!value) return 'À compléter'; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? 'À compléter' : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'UTC' }).format(parsed); };
  const badge = (node, state, text = label(state)) => { if (!node) return; node.dataset.state = state || 'UNKNOWN'; node.textContent = text; };
  const card = (title, value, meta = '', state = 'ASSUMPTION') => `<article class="resultCard"><small>${esc(title)}</small><b>${esc(value)}</b>${meta ? `<p>${esc(meta)}</p>` : ''}<span class="statusBadge" data-state="${esc(state)}">${esc(label(state))}</span></article>`;
  const empty = (text) => `<p class="emptyState">${esc(text)}</p>`;
  const navState = (section, state) => { const link = document.querySelector(`[data-section-link="${section}"]`); if (!link) return; link.dataset.state = state || 'UNKNOWN'; link.dataset.statusLabel = label(state); };
  let projectData = null;
  let scenarioData = null;
  let activeProjectId = null;
  let sectionObserver = null;
  let navEventsInstalled = false;

  function projectIdentity(data) {
    const project = data?.project || {};
    $('headerProject').textContent = project.name || project.project_reference || 'Projet';
    $('navProjectName').textContent = project.name || project.project_reference || 'Projet';
    const projectFields = [
      ['Nom', project.name], ['Référence', project.project_reference], ['Statut', label(project.status)],
      ['Organisation', project.organization_name || project.organization?.name || project.organization?.legal_name], ['Client', project.client_name || project.customer_name]
    ];
    const cards = projectFields.map(([title, value]) => `<article class="identityCard"><span class="eyebrow">${esc(title)}</span><p>${esc(value || 'À compléter')}</p></article>`);
    const actors = scenarioData?.actors || [];
    cards.push(`<article class="identityCard"><span class="eyebrow">Acteurs principaux</span><p>${actors.length ? actors.map((actor) => `${esc(label(actor.actor_role))} · ${esc(label(actor.validation_status))}`).join('<br>') : 'À compléter'}</p></article>`);
    $('projectIdentity').innerHTML = cards.join('');
    badge($('projectSectionStatus'), project.name && project.project_reference ? 'PARTIAL' : 'UNKNOWN', project.name && project.project_reference ? 'Identité partielle' : label('UNKNOWN'));
    const sites = data?.sites || [];
    $('headerSite').textContent = sites.map((site) => [site.name, site.city].filter(Boolean).join(' · ')).filter(Boolean).join(' / ') || [project.city, project.postal_code].filter(Boolean).join(' ') || 'Site à qualifier';
    const nav = document.querySelector('.sectionNav');
    if (!navEventsInstalled) {
      nav?.querySelectorAll('[data-section-link]').forEach((link) => link.addEventListener('click', () => {
        nav.querySelectorAll('[data-section-link]').forEach((item) => item.removeAttribute('aria-current'));
        link.setAttribute('aria-current', 'location');
      }));
      navEventsInstalled = true;
    }
    if ('IntersectionObserver' in window) {
      sectionObserver?.disconnect();
      sectionObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        nav?.querySelectorAll('[data-section-link]').forEach((item) => item.toggleAttribute('aria-current', item.dataset.sectionLink === entry.target.dataset.section));
      }), { rootMargin: '-25% 0px -65% 0px' });
      document.querySelectorAll('.workspaceSection[data-section]').forEach((section) => sectionObserver.observe(section));
    }
    const readiness = data?.readiness || {};
    const readinessMap = [['Consommation', readiness.consumption], ['Production PV', readiness.production], ['Configuration', readiness.technicalConfiguration], ['Scénarios', readiness.scenarios], ['Points à traiter', readiness.blockingIssues]];
    $('readiness').innerHTML = readinessMap.map(([name, value]) => `<div class="metric"><small>${esc(name)}</small><b>${esc(value == null ? 'À compléter' : typeof value === 'number' ? fmt(value) : label(value))}</b></div>`).join('');
    const profiles = data?.profiles || [];
    badge($('energyDataStatus'), profiles.length ? (profiles.some((profile) => profile.quality_level === 'VERIFIED') ? 'VERIFIED' : 'ASSUMPTION') : 'UNKNOWN');
    badge($('siteSectionStatus'), sites.length ? (sites.every((site) => site.validation_status === 'VALIDATED') ? 'VERIFIED' : 'ASSUMPTION') : 'UNKNOWN');
    navState('project', 'PARTIAL');
    navState('site', sites.length ? sites.every((site) => site.validation_status === 'VALIDATED') ? 'VERIFIED' : 'ASSUMPTION' : 'UNKNOWN');
    navState('energy-data', profiles.length ? profiles.some((profile) => profile.quality_level === 'VERIFIED') ? 'VERIFIED' : 'ASSUMPTION' : 'UNKNOWN');
    navState('solar-config', data?.technicalConfigurations?.length ? 'ASSUMPTION' : 'UNKNOWN');
  }

  const byRun = (data, runId) => (data?.calculatedKpis || []).filter((kpi) => kpi.calculation_run_id === runId);
  const findKpi = (rows, code) => rows.find((row) => row.kpi_code === code) || null;
  const numeric = (rows, code) => findKpi(rows, code)?.value_numeric ?? null;
  const structured = (rows, code) => findKpi(rows, code)?.value_json ?? null;
  const canonicalRun = (data) => (data?.calculationRuns || []).find((run) => run.id === data?.scenario?.canonical_calculation_run_id) || null;
  const inputsCurrent = (data) => data?.scenario?.inputs_revision != null && data?.scenario?.canonical_inputs_revision != null && data.scenario.inputs_revision === data.scenario.canonical_inputs_revision;

  function renderProduction(data, rows, run) {
    const configuration = (data.technicalConfigurations || []).find((item) => item.id === data.scenario.technical_configuration_id);
    const production = numeric(rows, 'pv_production_annual_kwh');
    const p50 = (data.externalResults || []).find((item) => item.id === data.scenario.p50_result_id && item.result_kind === 'P50');
    const p90 = (data.externalResults || []).find((item) => item.id === data.scenario.p90_result_id && item.result_kind === 'P90');
    const output = [
      card('Puissance installée', configuration?.pv_capacity_kwp == null ? null : fmt(configuration.pv_capacity_kwp, 'kWc'), configuration ? `Configuration v${configuration.version}` : 'Configuration associée non disponible', configuration?.pv_capacity_kwp == null ? 'UNKNOWN' : 'ASSUMPTION'),
      card('Production annuelle', production == null ? null : fmt(production, 'kWh/an', 0), run ? `Run ${run.engine_version || run.engine_code || ''} · ${date(run.completed_at || run.created_at)}` : 'Aucun run énergie canonique', production == null ? 'UNKNOWN' : 'ASSUMPTION'),
      card('Rendement spécifique', numeric(rows, 'specific_yield_kwh_per_kwp') == null ? null : fmt(numeric(rows, 'specific_yield_kwh_per_kwp'), 'kWh/kWc/an', 0), 'Uniquement si présent dans le résultat sauvegardé', numeric(rows, 'specific_yield_kwh_per_kwp') == null ? 'UNKNOWN' : 'ASSUMPTION'),
      card('P50 externe', p50?.value_numeric == null ? null : fmt(p50.value_numeric, p50.unit || 'kWh/an', 0), p50 ? `Étude externe v${p50.version} · ${label(p50.validation_status)}` : 'Aucune étude externe P50 associée', p50?.value_numeric == null ? 'UNKNOWN' : p50.validation_status === 'VALIDATED' ? 'VERIFIED' : 'ASSUMPTION'),
      card('P90 externe', p90?.value_numeric == null ? null : fmt(p90.value_numeric, p90.unit || 'kWh/an', 0), p90 ? `Étude externe v${p90.version} · ${label(p90.validation_status)}` : 'Aucune étude externe P90 associée', p90?.value_numeric == null ? 'UNKNOWN' : p90.validation_status === 'VALIDATED' ? 'VERIFIED' : 'ASSUMPTION')
    ];
    const stale = Boolean(run && !inputsCurrent(data));
    if (stale) output[1] = card('Production annuelle', null, 'Le scénario a changé depuis le run source.', 'STALE');
    $('productionContent').innerHTML = output.join('');
    badge($('productionStatus'), stale ? 'STALE' : run?.status === 'SUCCEEDED' && production != null ? 'ASSUMPTION' : 'UNKNOWN');
    navState('production', stale ? 'STALE' : run?.status === 'SUCCEEDED' && production != null ? 'ASSUMPTION' : 'UNKNOWN');
  }

  function renderMatching(data, rows, run) {
    const decision = structured(rows, 'cr011_scenario_decision');
    const request = decision?.request || {};
    const match = decision?.cr009_matching_result || {};
    const isFullSale = request.scenario_mode === 'FULL_SALE';
    const method = request.allocation_method;
    const canonical = run?.status === 'SUCCEEDED' && request.decision_maturity === 'CANONICAL' && method === 'TEMPORAL_MATCHING' && match.status === 'READY';
    if (run && !inputsCurrent(data)) {
      $('matchingContent').innerHTML = `<p class="statusMessage warn">Résultat historique non courant : les entrées ont changé. Recalculez le scénario pour afficher de nouveaux volumes.</p>`;
      badge($('matchingStatus'), 'STALE'); navState('matching', 'STALE'); return;
    }
    const production = numeric(rows, 'pv_production_annual_kwh');
    const channels = isFullSale ? [['Vente totale', production]] : [['ACI', match.aciEnergyKwh ?? match.aci_kwh], ['ACC', match.accEnergyKwh ?? match.acc_kwh], ['Surplus', match.surplusEnergyKwh ?? match.surplus_kwh]];
    const methodLabel = isFullSale ? 'Production PV canonique · vente totale' : label(method || 'UNKNOWN');
    const meta = isFullSale ? 'La vente totale est valorisée sur la production ; aucun profil de consommation requis.' : `Canaux : ${(request.enabled_channels || []).map(label).join(' → ') || 'À compléter'} · priorité : ${(request.allocation_priority || []).map(label).join(' → ') || 'À compléter'} · résiduel : ${label(request.residual_policy)}`;
    const values = channels.map(([name, value]) => `<article class="channelCard"><b>${esc(name)}</b><strong>${esc(fmt(value, 'kWh/an', 0))}</strong><small>${esc(isFullSale ? 'Production canonique' : methodLabel)}</small></article>`).join('');
    const provenance = [data.scenario.pv_profile_id ? `Profil PV associé` : null, data.scenario.load_profile_id ? 'Profil consommation associé' : null].filter(Boolean).join(' · ') || 'Profil utilisé : à compléter';
    const conservation = match.conservation || {};
    const conservationText = isFullSale ? 'Sans objet pour la vente totale' : [`production ${fmt(conservation.pvKwh, 'kWh')}`, `ACI ${fmt(conservation.aciKwh, 'kWh')}`, `ACC ${fmt(conservation.accKwh, 'kWh')}`, `surplus ${fmt(conservation.surplusKwh, 'kWh')}`, `résiduel ${fmt(conservation.residualKwh, 'kWh')}`].join(' · ');
    $('matchingContent').innerHTML = `<div class="channelGrid">${values}</div><p class="methodNote"><b>Méthode :</b> ${esc(methodLabel)} · <b>État :</b> ${esc(canonical ? 'Matching temporel canonique' : isFullSale ? 'Production de référence' : method === 'ANNUAL_PREVIEW' ? 'Prévisualisation commerciale, non temporelle' : label('UNKNOWN'))}<br>${esc(meta)}<br>${esc(provenance)} · Couverture ${esc(fmt(match.coverageRatePct ?? match.coveragePct ?? match.coverage_pct, '%', 1))}<br><b>Conservation source :</b> ${esc(conservationText)}</p>`;
    badge($('matchingStatus'), canonical ? 'VERIFIED' : isFullSale && production != null ? 'ASSUMPTION' : method === 'ANNUAL_PREVIEW' ? 'ASSUMPTION' : 'UNKNOWN', isFullSale ? 'Production seule' : label(canonical ? 'VERIFIED' : method === 'ANNUAL_PREVIEW' ? 'ASSUMPTION' : 'UNKNOWN'));
    navState('matching', canonical || isFullSale && production != null ? 'VERIFIED' : method === 'ANNUAL_PREVIEW' ? 'ASSUMPTION' : 'UNKNOWN');
  }

  function renderScenarioDecision(data, rows) {
    const snapshot = structured(rows, 'cr011_scenario_decision');
    const request = snapshot?.request || {};
    if (!snapshot) { $('scenarioDecisionSummary').innerHTML = empty('Contrat de décision CR-011 non présent dans le run sélectionné.'); return; }
    if (!inputsCurrent(data)) { $('scenarioDecisionSummary').innerHTML = `<p class="statusMessage warn">Décision CR-011 à actualiser après modification des entrées.</p>`; return; }
    const values = [
      ['Mode', label(request.scenario_mode)], ['Canaux activés', (request.enabled_channels || []).map(label).join(' → ') || 'À compléter'],
      ['Ordre de priorité', (request.allocation_priority || []).map(label).join(' → ') || 'À compléter'], ['Traitement du résiduel', label(request.residual_policy)],
      ['Méthode d’allocation', label(request.allocation_method)], ['Maturité', request.decision_maturity === 'CANONICAL' ? 'Scénario canonique' : request.decision_maturity === 'PROSPECTING_PREVIEW' ? 'Aperçu de prospection' : 'À compléter']
    ];
    $('scenarioDecisionSummary').innerHTML = `<div class="decisionSummaryGrid">${values.map(([name, value]) => `<div><small>${esc(name)}</small><b>${esc(value)}</b></div>`).join('')}</div>`;
  }

  function renderTariffs(rows) {
    const provenance = rows.map((row) => row.provenance?.cr012_tariff_resolution || row.provenance?.tariff_resolution).find(Boolean);
    const decision = structured(rows, 'cr011_scenario_decision');
    const flowResult = structured(rows, 'financial_multichannel_result');
    const flows = flowResult?.annualEconomicFlows || [];
    const channels = ['GRID_IMPORT', 'ACI', 'ACC', 'SURPLUS', 'FULL_SALE'];
    const channelName = { GRID_IMPORT: 'Réseau', ACI: 'ACI', ACC: 'ACC', SURPLUS: 'Surplus', FULL_SALE: 'Vente totale' };
    if (scenarioData && canonicalRun(scenarioData) && !inputsCurrent(scenarioData)) { $('tariffContent').innerHTML = `<p class="statusMessage warn">Résolution tarifaire liée à un run historique. Recalculez avant de la considérer comme courante.</p>`; navState('tariffs', 'STALE'); return; }
    const tariffRows = channels.map((channel) => {
      const flow = flows.find((item) => (item.source_energy_channel || item.sourceEnergyChannel) === channel && (item.unit_price ?? item.unitPrice) != null);
      const reference = (provenance?.prices || provenance?.references || []).find((item) => item.channel === channel);
      const price = flow?.unit_price ?? flow?.unitPrice ?? reference?.unit_price ?? reference?.price_eur_per_kwh ?? null;
      const status = price == null ? 'UNKNOWN' : 'ASSUMPTION';
      return `<tr><td>${esc(channelName[channel])}</td><td>${esc(price == null ? 'À compléter' : fmt(price, '€/kWh', 5))}</td><td>${esc(reference?.tax_basis || flow?.tax_basis || flow?.taxBasis || 'À compléter')}</td><td>${esc(reference?.version || provenance?.ruleset?.version || 'À compléter')}</td><td>${esc(reference?.source || reference?.reference_code || flow?.pricing_reference_id || flow?.pricingReferenceId || 'À compléter')}</td><td><span class="statusBadge" data-state="${status}">${esc(label(status))}</span></td></tr>`;
    }).join('');
    $('tariffContent').innerHTML = `<div class="tableWrap"><table class="table"><thead><tr><th>Canal</th><th>Valeur résolue</th><th>Base</th><th>Version</th><th>Source / référence</th><th>État</th></tr></thead><tbody>${tariffRows}</tbody></table></div><p class="methodNote">Les références absentes restent « À compléter ». Aucun tarif n’est inféré depuis un autre canal.</p>`;
    navState('tariffs', flows.length ? 'ASSUMPTION' : 'UNKNOWN');
  }

  function renderFinance(rows, run) {
    const result = structured(rows, 'financial_multichannel_result');
    const host = $('financeContent');
    if (scenarioData && canonicalRun(scenarioData) && !inputsCurrent(scenarioData)) { host.innerHTML = `<p class="statusMessage warn">Résultats financiers historiques masqués : les entrées du scénario ont changé depuis le calcul.</p>`; badge($('financeStatus'), 'STALE'); navState('finance', 'STALE'); return; }
    if (!result) {
      const legacy = ['irr', 'npv', 'payback_years', 'lcoe'].some((code) => findKpi(rows, code)?.value_numeric != null);
      if (!legacy) { host.innerHTML = empty('Aucun résultat financier enregistré pour ce scénario. Les hypothèses et résultats restent inconnus, sans conversion en zéro.'); badge($('financeStatus'), 'UNKNOWN'); navState('finance', 'UNKNOWN'); return; }
      const available = ['irr', 'npv', 'payback_years', 'lcoe'].map((code) => { const item = findKpi(rows, code); return item ? card(label(code), fmt(item.value_numeric, item.unit), `Financial Engine · ${item.formula_version || run?.financial_model_version || 'version non précisée'}`, item.value_numeric == null ? 'UNKNOWN' : 'ASSUMPTION') : ''; }).join('');
      host.innerHTML = `<div class="resultGrid">${available}</div><p class="methodNote">Contrat historique · KPI repris du run, non recalculés.</p>`;
      badge($('financeStatus'), 'ASSUMPTION'); navState('finance', 'ASSUMPTION'); return;
    }
    const perspectives = result.perspectives || [];
    if (!perspectives.length) { host.innerHTML = empty('Le run financier ne contient aucune perspective persistée.'); badge($('financeStatus'), 'PARTIAL'); navState('finance', 'PARTIAL'); return; }
    const selector = `<label class="perspectiveLabel">Perspective enregistrée<select id="workspacePerspective">${perspectives.map((item, index) => `<option value="${index}">${esc(label(item.actorRole))} · partie ${esc(String(item.partyId || '').slice(0, 8) || 'à compléter')}</option>`).join('')}</select></label><div id="financePerspectiveResult"></div>`;
    host.innerHTML = selector;
    const paint = () => {
      const selected = perspectives[Number($('workspacePerspective').value)] || {};
      const cards = [card('TRI', selected.irrPct == null ? null : fmt(selected.irrPct, '%'), label(selected.returnBasis), selected.irrPct == null ? 'UNKNOWN' : 'ASSUMPTION'), card('VAN', selected.npvEur == null ? null : fmt(selected.npvEur, '€'), 'Perspective sélectionnée', selected.npvEur == null ? 'UNKNOWN' : 'ASSUMPTION'), card('Payback', selected.paybackYears == null ? null : fmt(selected.paybackYears, 'ans'), 'Perspective sélectionnée', selected.paybackYears == null ? 'UNKNOWN' : 'ASSUMPTION'), card('EBITDA · année 1', selected.annualEbitdaEur?.[1] == null ? null : fmt(selected.annualEbitdaEur[1], '€'), 'Valeur du Financial Engine', selected.annualEbitdaEur?.[1] == null ? 'UNKNOWN' : 'ASSUMPTION')];
      const cash = Array.isArray(selected.annualCashFlowEur) ? selected.annualCashFlowEur : [];
      const flows = result.annualEconomicFlows || [];
      const ownFlows = flows.filter((flow) => (flow.payer_party_id || flow.payerPartyId) === selected.partyId || (flow.recipient_party_id || flow.recipientPartyId) === selected.partyId);
      const cashRows = cash.map((amount, index) => `<tr><td>${index === 0 ? 'Année 0' : `Année ${index}`}</td><td>${esc(fmt(amount, '€'))}</td></tr>`).join('');
      $('financePerspectiveResult').innerHTML = `<div class="resultGrid">${cards.join('')}</div><p class="methodNote">Partie ${esc(selected.partyId || 'À compléter')} · ${esc(label(selected.actorRole))} · Résultats fournis par le Financial Engine.</p><details class="details"><summary>Flux annuels de cette perspective (${ownFlows.length})</summary>${ownFlows.length ? `<div class="tableWrap"><table class="table"><thead><tr><th>Canal</th><th>Nature</th><th>Énergie</th><th>Prix</th><th>Montant</th><th>Contrepartie</th></tr></thead><tbody>${ownFlows.map((flow) => { const payer = flow.payer_party_id || flow.payerPartyId; const recipient = flow.recipient_party_id || flow.recipientPartyId; return `<tr><td>${esc(label(flow.source_energy_channel || flow.sourceEnergyChannel))}</td><td>${esc(label(flow.economic_nature || flow.economicNature))}</td><td>${esc(fmt(flow.energy_kwh ?? flow.energyKwh, 'kWh'))}</td><td>${esc(fmt(flow.unit_price ?? flow.unitPrice, '€/kWh', 5))}</td><td>${esc(fmt(flow.amount_eur ?? flow.amountEur, '€'))}</td><td>${esc(payer === selected.partyId ? recipient : payer || 'À compléter')}</td></tr>`; }).join('')}</tbody></table></div>` : empty('Aucun flux attribué à cette partie dans le résultat disponible.')}</details><details class="details"><summary>Trésorerie annuelle (${cash.length} périodes)</summary>${cashRows ? `<div class="tableWrap"><table class="table"><thead><tr><th>Période</th><th>Cashflow</th></tr></thead><tbody>${cashRows}</tbody></table></div>` : empty('Flux annuels non projetés dans le résultat.')}</details>`;
    };
    $('workspacePerspective').addEventListener('change', paint); paint(); badge($('financeStatus'), 'ASSUMPTION'); navState('finance', 'ASSUMPTION');
  }

  function renderDerived(data) {
    const energy = canonicalRun(data);
    const energyRows = byRun(data, energy?.id);
    const energyHash = energy?.input_snapshot_hash || null;
    const sourceId = energy?.id || null;
    renderProduction(data, energyRows, energy);
    renderMatching(data, energyRows, energy);
    renderScenarioDecision(data, energyRows);
    renderTariffs(energyRows);
    renderFinance(energyRows, energy);
    const carbonRun = (data.calculationRuns || []).find((run) => run.engine_code === 'CARBON_IMPACT_ENGINE');
    const carbonKpi = carbonRun ? structured(byRun(data, carbonRun.id), 'carbon_impact_result') : null;
    const carbonCurrent = Boolean(carbonRun && carbonKpi && carbonKpi.energy_source_run_id === sourceId && carbonKpi.energy_source_snapshot_hash === energyHash && inputsCurrent(data));
    if (!carbonKpi) {
      $('carbonContent').innerHTML = empty('Aucun résultat carbone associé à ce scénario.'); badge($('carbonStatus'), 'UNKNOWN'); navState('carbon', 'UNKNOWN');
    } else if (!carbonCurrent) {
      $('carbonContent').innerHTML = `<p class="statusMessage warn">Résultat carbone historique non courant : la référence énergie ne correspond pas au run canonique affiché.</p>`; badge($('carbonStatus'), 'STALE'); navState('carbon', 'STALE');
    } else {
      const compatibility = carbonKpi.pv_module_valorization_rate == null ? null : `${fmt(carbonKpi.pv_module_valorization_rate, '%', 0)} · référence contextuelle`;
      $('carbonContent').innerHTML = `<div class="resultGrid">${card('CO₂e évité estimé', carbonKpi.avoided_co2e_t_year == null ? null : fmt(carbonKpi.avoided_co2e_t_year, 'tCO₂e/an', 3), `Facteur ${fmt(carbonKpi.carbon_factor?.value ?? carbonKpi.carbon_factor_g_per_kwh, 'gCO₂e/kWh', 1)} · référence ${esc(carbonKpi.reference_year || 'À compléter')}`, 'ASSUMPTION')}${card('Équivalent voiture', carbonKpi.thermal_car_equivalent_km == null ? null : fmt(carbonKpi.thermal_car_equivalent_km, 'km/an', 0), 'Indicateur pédagogique · non utilisé ailleurs', 'ASSUMPTION')}${card('Valorisation panneaux', compatibility || 'Non applicable ou à compléter', 'Silicium cristallin + cadre aluminium requis', compatibility ? 'ASSUMPTION' : 'UNKNOWN')}</div><details class="details"><summary>Source et méthode</summary><p class="muted">${esc(carbonKpi.methodology || 'Estimation des émissions directes du réseau théoriquement évitées.')} · Run source ${esc(sourceId || 'À compléter')} · empreinte ${esc(energyHash || 'À compléter')}</p></details>`;
      badge($('carbonStatus'), 'ASSUMPTION'); navState('carbon', 'ASSUMPTION');
    }
    const supportRuns = (data.calculationRuns || []).filter((run) => run.engine_code === 'CR015_SUPPORT_ELIGIBILITY_ENGINE');
    const supportItems = supportRuns.flatMap((run) => byRun(data, run.id).filter((kpi) => kpi.kpi_code === 'support_eligibility_result').map((kpi) => ({ run, result: kpi.value_json, current: run.status === 'SUCCEEDED' && kpi.value_json?.scenario_version === data.scenario.version && kpi.value_json?.input_snapshot_hash === run.input_snapshot_hash })));
    const supportMarkup = supportItems.length ? supportItems.map(({ result, current }) => {
      const names = { CR015_S21: 'S21', CR015_AOS_PETIT_PV: 'AOS Petit PV', CR015_EFICAS: 'EFICAS' };
      const status = result?.eligibility_status || 'UNKNOWN';
      const procedural = result?.procedural_status || 'UNKNOWN';
      const missing = [...(result?.missing_conditions || []), ...(result?.missing_documents || [])];
      return `<article class="resultCard"><small>${esc(names[result?.scheme_code] || result?.scheme_code || 'Dispositif')}</small><b>${esc(current ? status === 'POTENTIALLY_ELIGIBLE' || status === 'ELIGIBLE_TO_APPLY' ? 'Pré-éligibilité indicative · à confirmer sur pièces' : status === 'NOT_ELIGIBLE' ? 'Non compatible selon les critères vérifiés' : 'À compléter' : 'Évaluation historique · à actualiser')}</b><p>${esc(current ? procedural === 'PERIOD_CLOSED' ? 'Période fermée' : procedural === 'REQUIRES_TENDER' ? 'Procédure d’appel d’offres' : label(procedural) : 'Les entrées ou la version du scénario ne correspondent plus à cette évaluation.')}</p><span class="statusBadge" data-state="${current ? status === 'POTENTIALLY_ELIGIBLE' || status === 'ELIGIBLE_TO_APPLY' ? 'ASSUMPTION' : status === 'NOT_ELIGIBLE' ? 'VERIFIED' : 'UNKNOWN' : 'STALE'}">${esc(label(current ? status === 'POTENTIALLY_ELIGIBLE' || status === 'ELIGIBLE_TO_APPLY' ? 'ASSUMPTION' : status === 'NOT_ELIGIBLE' ? 'VERIFIED' : 'UNKNOWN' : 'STALE'))}</span>${current && missing.length ? `<details class="details"><summary>Critères et pièces à traiter (${missing.length})</summary><ul>${missing.map((item) => `<li>${esc(typeof item === 'string' ? item : item.label || item.code || 'À compléter')}</li>`).join('')}</ul></details>` : ''}</article>`;
    }).join('') : `<article class="resultCard"><small>S21</small><b>Pré-éligibilité indicative</b><p>À confirmer sur pièces · hors détermination de tarif ou prime.</p><span class="statusBadge" data-state="PARTIAL">Couverture partielle</span></article><article class="resultCard"><small>AOS Petit PV</small><b>Période P2 fermée</b><p>Information historique sur la période vérifiée.</p><span class="statusBadge" data-state="PARTIAL">Information de période</span></article>`;
    $('supportContent').innerHTML = `<div class="resultGrid">${supportMarkup}</div><p class="coverageNote">Le catalogue est partiel : aucun autre dispositif identifié dans le catalogue actuellement vérifié. Cela ne signifie pas qu’aucune aide n’existe.</p>`;
    navState('support', supportItems.length ? supportItems.some((item) => !item.current) ? 'STALE' : 'ASSUMPTION' : 'PARTIAL');
  }

  function clearScenarioView() {
    scenarioData = null;
    $('headerScenario').textContent = 'Aucun scénario sélectionné';
    badge($('headerLifecycle'), 'UNKNOWN');
    badge($('headerCurrentness'), 'UNKNOWN');
    for (const id of ['recalculateScenario', 'validateScenario', 'freezeScenario']) $(id).disabled = true;
    $('scenarioPanel').classList.add('hidden');
    $('productionContent').innerHTML = empty('Sélectionnez un scénario disposant d’un calcul énergie pour afficher ses résultats.');
    $('matchingContent').innerHTML = empty('Le matching sera présenté à partir du résultat sauvegardé du scénario.');
    $('tariffContent').innerHTML = empty('Aucune référence tarifaire persistée pour le scénario sélectionné.');
    $('financeContent').innerHTML = empty('Aucun résultat financier enregistré pour ce scénario.');
    $('carbonContent').innerHTML = empty('Aucun résultat carbone courant associé à ce scénario.');
    $('supportContent').innerHTML = empty('S21 : pré-éligibilité indicative à confirmer sur pièces. AOS Petit PV : période P2 fermée. Catalogue partiel.');
    for (const id of ['productionStatus', 'matchingStatus', 'financeStatus', 'carbonStatus', 'reportSectionStatus']) badge($(id), 'UNKNOWN');
    for (const section of ['production', 'matching', 'scenarios', 'tariffs', 'finance', 'carbon', 'report']) navState(section, 'UNKNOWN');
    navState('support', 'PARTIAL');
  }

  async function reportHistory(scenarioId) {
    const config = window.SOLARSHIFT_CONFIG || {};
    const sessionKey = config.sessionStorageKey || 'ozeno-supabase-session';
    let session = null;
    try { session = JSON.parse(localStorage.getItem(sessionKey) || 'null'); } catch { /* session illisible : laisser l’historique indisponible */ }
    if (!session?.access_token || !config.supabaseUrl || !config.supabasePublishableKey) return;
    try {
      const query = new URLSearchParams({ select: 'id,report_type,financial_viewpoint,status,version,source_scenario_version,generated_at,published_at', scenario_id: `eq.${scenarioId}`, order: 'version.desc', limit: '5' });
      const response = await fetch(`${config.supabaseUrl}/rest/v1/scenario_reports?${query}`, { headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${session.access_token}` } });
      if (!response.ok) return;
      const reports = await response.json();
      $('reportHistory').innerHTML = reports.length ? `<div class="tableWrap"><table class="table"><thead><tr><th>Version</th><th>Type</th><th>Perspective</th><th>État</th><th>Généré le</th><th></th></tr></thead><tbody>${reports.map((item) => `<tr><td>v${esc(item.version)}</td><td>${esc(label(item.report_type))}</td><td>${esc(label(item.financial_viewpoint))}</td><td>${esc(label(item.status))}</td><td>${esc(date(item.generated_at || item.published_at))}</td><td><a href="./scenario-report.html?id=${encodeURIComponent(item.id)}" target="_blank" rel="noopener">Ouvrir</a></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aucun rapport antérieur enregistré.</p>';
    } catch { $('reportHistory').innerHTML = '<p class="muted">Historique du rapport non disponible dans cette session.</p>'; }
  }

  window.addEventListener('ozeno:workspace-project-loaded', (event) => {
    projectData = event.detail?.workspace || null;
    if (!projectData) return;
    if (activeProjectId && activeProjectId !== projectData.project?.id) clearScenarioView();
    activeProjectId = projectData.project?.id || activeProjectId;
    projectIdentity(projectData);
  });
  window.addEventListener('ozeno:workspace-scenario-loaded', (event) => {
    scenarioData = event.detail?.scenarioData || null;
    if (!scenarioData) return;
    if (projectData) projectIdentity(projectData);
    const scenario = scenarioData.scenario || {};
    $('headerScenario').textContent = `${scenario.name || 'Scénario'} · v${scenario.version || '?'}`;
    badge($('headerLifecycle'), scenario.status || 'UNKNOWN');
    const run = canonicalRun(scenarioData);
    const isCurrent = Boolean(run && run.id === scenario.canonical_calculation_run_id && run.status === 'SUCCEEDED' && inputsCurrent(scenarioData));
    badge($('headerCurrentness'), isCurrent ? 'VERIFIED' : run ? 'STALE' : 'UNKNOWN', isCurrent ? 'Résultats à jour' : run ? 'À actualiser' : 'Aucun calcul courant');
    renderDerived(scenarioData);
    badge($('reportSectionStatus'), ['VALIDATED', 'PUBLISHED'].includes(scenario.status) ? 'VERIFIED' : 'UNKNOWN', ['VALIDATED', 'PUBLISHED'].includes(scenario.status) ? 'Scénario validé' : 'Validation requise');
    navState('scenarios', ['VALIDATED', 'PUBLISHED'].includes(scenario.status) ? 'VERIFIED' : 'ASSUMPTION');
    navState('report', ['VALIDATED', 'PUBLISHED'].includes(scenario.status) ? 'ASSUMPTION' : 'UNKNOWN');
    reportHistory(scenario.id);
  });
  document.getElementById('printWorkspace')?.addEventListener('click', () => window.print());
}());
