(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const make = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
  let riskEditor, revealRisk;
  // Prototype OOI : ne se charge que sur un serveur local avec flag explicite.
  const configOOI = window.SOLARSHIFT_CONFIG || {};
  const OOI_LOCAL_PREVIEW = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname.toLowerCase())
    && (configOOI.OOI_VISUAL_PREVIEW_ENABLED === true
      || new URLSearchParams(location.search).get('OOI_VISUAL_PREVIEW_ENABLED') === 'true');
  let ooiView = null;
  function refreshOOI() { ooiView?.mountPrestudyPanel(); }
  if (OOI_LOCAL_PREVIEW) {
    import('./ooi-visual-v04.mjs?v=20261113-portfolio-save-fix-1').then((module) => {
      ooiView = module;
      if (!document.getElementById('ooiVisualStyle')) {
        const link = make('link'); link.id = 'ooiVisualStyle'; link.rel = 'stylesheet'; link.href = './ooi-visual-v04.css'; document.head.append(link);
      }
      refreshOOI();
    }).catch((error) => console.warn('OOI aperçu indisponible', error));
    // Ne pas écouter l'événement de présentation : la synthèse possède un observateur DOM existant,
    // et un rerendu OOI pourrait provoquer une boucle d'observation.
    ['ozeno:commercial-production-preview', 'ozeno:carbon-impact-preview', 'ozeno:finance-summary-ready', 'ozeno:local-finance', 'ozeno:risk-document-attached', 'ozeno:prestudy-chapter-shown', 'ozeno:project-context-loaded'].forEach((event) => window.addEventListener(event, refreshOOI));
    // Refresh après les gestionnaires existants; cela ne modifie aucune saisie ni aucun résultat.
    window.addEventListener('input', (event) => {
      if (event.target?.closest?.('#audit-finance')) queueMicrotask(refreshOOI);
    });
    window.addEventListener('click', (event) => {
      if (event.target?.closest?.('#addRisk')) queueMicrotask(refreshOOI);
    });
  }


  function section(root, id, label, nodes) {
    const host = make('section', null, 'prestudyDSection'); host.id = id;
    const heading = make('h2', label, 'prestudyDHeading'); heading.id = `${id}-title`;
    host.setAttribute('aria-labelledby', heading.id);
    const panel = make('div', null, 'prestudyDPanel');
    nodes.filter(Boolean).forEach((n) => panel.append(n)); host.append(heading, panel); root.append(host);
    return { host, panel };
  }
  function headingBefore(target, id, text) {
    const h = make('h2', text, 'prestudyDHeading'); h.id = id; target.before(h); return h;
  }
  function presentationHeadingBefore(target, id, text) {
    if (!target || $(id)) return $(id);
    const h = make('h3', text, 'prestudyEHeading'); h.id = id; target.before(h); return h;
  }
  function prepareProject() {
    const root = $('audit-project'), identity = $('ozenoProjectIdentity'), location = root.querySelector('.newProject');
    const provenance = root.querySelector('.siteLocationInfo');
    const locationTitle = location?.querySelector(':scope > b');
    if (locationTitle?.textContent.trim() === 'Localisation') locationTitle.classList.add('prestudySrOnly');
    if (identity) identity.open = true;
    // Le bandeau du shell et le menu Projets conservent les actions de sauvegarde/création.
    // Ce bouton historique ouvre la même boîte de sauvegarde et ferait doublon dans le chapitre.
    const duplicateSave = $('newProject');
    if (duplicateSave) duplicateSave.hidden = true;
    if (identity && !identity.querySelector('.prestudyIdentityActions')) {
      const actions = make('div', null, 'prestudyIdentityActions');
      actions.append(make('p', 'Cette fiche est un résumé en lecture seule. Les coordonnées client restent modifiables dans la boîte « Enregistrer le projet ».', 'fine'));
      const edit = make('button', 'Modifier la fiche projet', 'secondary');
      edit.type = 'button';
      edit.addEventListener('click', () => document.querySelector('.prestudySave')?.click());
      actions.append(edit);
      identity.append(actions);
    }
    section(root, 'prestudyProjectIdentityGroup', 'Fiche projet', [identity]);
    const locationSection = section(root, 'prestudyProjectLocationGroup', 'Localisation', []);
    const workspace = make('div', null, 'prestudyLocationWorkspace');
    const fields = make('div', null, 'prestudyLocationFields'); fields.id = 'prestudyLocationFields';
    fields.append(location);
    const mapPanel = make('section', null, 'prestudyLocationMap'); mapPanel.setAttribute('aria-label', 'Carte de localisation du site');
    const mapTitle = make('h3', 'Localiser et choisir la parcelle');
    const mapSlot = make('div'); mapSlot.id = 'prestudyLocationMapSlot';
    mapPanel.append(mapTitle, make('p', 'Pour déplacer le repère, cliquez sur « Modifier sur la carte », puis cliquez sur l’emplacement souhaité.', 'fine'), mapSlot);
    workspace.append(fields, mapPanel); locationSection.panel.append(workspace);
    const config = window.SOLARSHIFT_CONFIG = window.SOLARSHIFT_CONFIG || {};
    config.parcelQualificationReady = import('./parcel-qualification-ui.mjs?v=20261116-address-confirmation-fix-1').then(module => module.mountParcelQualification(fields));
    const provenanceSection = section(root, 'prestudyProjectProvenanceGroup', 'Origine des données', [provenance]);
    provenanceSection.panel.append(make('p', 'Les sources sont précisées au niveau des champs et résultats concernés ; aucun récapitulatif séparé de provenance n’est disponible dans cette fiche.', 'prestudyProvenanceEmpty'));
  }
  function prepareSurfaces() {
    const root = $('audit-roof'); root.querySelector(':scope > h2')?.classList.add('prestudySrOnly');
    const nature = $('earlySolarProjectType');
    const mapGuide = $('earlySolarMappingGuide');
    if (nature) {
      const h = nature.querySelector('h2');
      if (h) { h.id = 'prestudySurfaceKindTitle'; h.classList.add('prestudyDHeading'); }
      nature.classList.add('prestudyDPanel');
    }
    if (mapGuide) mapGuide.classList.add('prestudyDPanel');
    if (nature && mapGuide && !nature.parentElement?.classList.contains('prestudySurfaceSelectors')) {
      const selectors = make('div', null, 'prestudySurfaceSelectors');
      nature.before(selectors);
      selectors.append(nature, mapGuide);
    }
    headingBefore($('map'), 'prestudySurfaceMapTitle', 'Carte et tracé');
    const mapSlot = make('div'); mapSlot.id = 'prestudySurfaceMapSlot';
    $('map').before(mapSlot); mapSlot.append($('map'));
    const settings = $('manualAreaSettings');
    const settingsForm = settings?.querySelector('.form');
    const roofState = $('roof')?.closest('label');
    const areaForm = $('roofSurfaceGeneral')?.querySelector('.form');
    const manualMaterial = $('manualRoofMaterial')?.closest('label');
    const pitch = $('tilt')?.closest('label');
    const orientation = $('manualAzimuth')?.closest('label');
    const shade = $('shade')?.closest('label');
    const condition = roofState;
    const flatTilt = $('manualFlatTilt')?.closest('label');
    const density = $('manualDensityWcM2')?.closest('label');
    [manualMaterial, pitch, orientation, shade, flatTilt, density].filter(Boolean).forEach((node) => settingsForm?.append(node));
    const qualification = section($('roofSurfaces'), 'prestudySurfaceQualification', 'Qualification des surfaces', [$('roofSurfaceGeneral'), settings, $('roofSurfaceCards')]);
    qualification.host.dataset.surfaceQualification = 'true';
    if (roofState) {
      const labelText = [...roofState.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
      if (labelText) labelText.textContent = 'État apparent du bâtiment';
      $('roof')?.setAttribute('aria-label', 'État apparent du bâtiment');
      if (!root.querySelector('#roofSurfaceCards .roofSurface .form')?.contains(roofState)) qualification.panel.append(roofState);
    }
    const notes = make('div', null, 'prestudySurfacePriorityNotes');
    notes.append(
      make('p', 'Sans toiture tracée, les paramètres généraux servent de référence. Dès qu’une toiture est tracée, ses caractéristiques propres (type, orientation, pente et ombrage) prévalent pour son estimation PVGIS. L’état apparent reste une appréciation unique du bâtiment.', 'fine prestudySurfacePriorityNote'),
      make('p', 'Pour les autres surfaces, renseignez orientation et inclinaison. L’ombrage est facultatif ; sans donnée, aucune réduction supplémentaire n’est appliquée.', 'fine prestudySurfaceOtherNote')
    );
    qualification.panel.prepend(notes);
    if (areaForm) {
      areaForm.classList.add('prestudySurfaceFieldGrid');
      $('roofTotal')?.closest('label')?.classList.add('prestudySurfaceField', 'prestudySurfaceTotalField');
      $('roofRatio')?.closest('label')?.classList.add('prestudySurfaceField', 'prestudySurfaceRatioField');
      $('roofUsableAreaReadout')?.classList.add('prestudySurfaceField', 'prestudySurfaceUsableField');
    }
    settingsForm?.classList.add('prestudySurfaceFieldGrid');
    manualMaterial?.classList.add('prestudySurfaceField', 'prestudySurfaceMaterialField');
    pitch?.classList.add('prestudySurfaceField', 'prestudySurfacePitchField');
    orientation?.classList.add('prestudySurfaceField', 'prestudySurfaceOrientationField');
    shade?.classList.add('prestudySurfaceField', 'prestudySurfaceShadeField');
    condition?.classList.add('prestudySurfaceField', 'prestudySurfaceConditionField');
    flatTilt?.classList.add('prestudySurfaceField', 'prestudySurfaceFlatTiltField');
    density?.classList.add('prestudySurfaceField', 'prestudySurfaceDensityField');
    $('roofSurfaceGeneral')?.classList.add('prestudySurfaceGeneralFields');
    settings?.classList.add('prestudySurfaceManualFields');
    $('roofSurfaceCards')?.classList.add('prestudySurfaceCards');
    const advanced = root.querySelector('.roofExpertSettings');
    if (advanced) { headingBefore(advanced, 'prestudySurfaceAdvancedTitle', 'Paramètres avancés et documents'); advanced.classList.add('prestudyDPanel'); }
    // Emplacements résolus avant l'assemblage des liens du shell; les nœuds restent ceux des formulaires existants.
    if (OOI_LOCAL_PREVIEW) {
      const documents = $('roofInstallerStudyTitle')?.closest('.roofInstallerStudy');
      const partners = make('section', null, 'ooiPartnersSlot'); partners.id = 'ooiPartnersSlot'; root.append(partners);
      if (documents) { documents.id = 'ooiInstallerDocuments'; root.append(documents); }
    }
    // Les deux tuiles restent accessibles dans la production ; retrait du seul bloc de surface redondant.
    $('roofSurfaceGeneral')?.querySelectorAll('.metric').forEach((n) => {
      if (/^(Zones identifiées|Couverture)$/.test(n.querySelector('b,small')?.textContent.trim() || '')) n.hidden = true;
    });
  }
  function preparePerformance() {
    const root = $('audit-solar'), estimate = $('roofEstimate'), study = $('audit-production'), climate = $('climateYieldPanel');
    const legacy = [...root.children];
    const production = section(root, 'prestudyPerformanceProductionGroup', 'Production PVGIS', [estimate]);
    const load = section(root, 'prestudyPerformanceLoadGroup', 'Consommation et profil de charge', [study]);
    const matching = section(root, 'prestudyPerformanceMatchingGroup', 'Adéquation énergétique', []);
    const flowNotice = make('div', null, 'prestudyEnergyFlowNotice');
    flowNotice.setAttribute('role', 'note');
    const flowHeader = make('div', null, 'prestudyEnergyFlowHeader');
    flowHeader.append(
      make('span', 'Production : estimation PVGIS', 'prestudyEnergyFlowBadge'),
      make('span', 'Destinations : non calculées', 'prestudyEnergyFlowBadge isUnavailable')
    );
    flowNotice.append(
      flowHeader,
      make('p', 'Dans cette pré-étude, la production PVGIS est une estimation. Les références annuelles ou mensuelles de consommation ne suffisent pas à calculer les volumes d’autoconsommation, d’injection ou d’ACC.'),
      make('p', 'Les montants associés à ces destinations dans les hypothèses financières restent des scénarios à instruire : ils ne représentent ni des flux mesurés ni un résultat de matching temporel.')
    );
    const financeAction = make('p', null, 'fine prestudyDInlineAction');
    const financeLink = make('a', 'Consulter les hypothèses financières →');
    financeLink.href = '#audit-finance';
    financeAction.append(financeLink);
    matching.panel.append(flowNotice, financeAction);
    if (estimate) {
      const action = make('p', null, 'fine prestudyDInlineAction');
      const link = make('a', 'Ajuster les surfaces et la qualification de toiture →');
      link.href = '#prestudySurfaceQualification';
      action.append(link);
      production.panel.append(action);
    }
    const climateGroup = section(root, 'prestudyPerformanceClimateGroup', 'Variabilité climatique historique', [climate]);
    const placeClimatePanel = () => {
      const currentClimate = $('climateYieldPanel');
      if (currentClimate && !climateGroup.panel.contains(currentClimate)) climateGroup.panel.prepend(currentClimate);
      if (currentClimate && !climateGroup.panel.querySelector('.prestudyDInlineAction')) {
        const action = make('p', null, 'fine prestudyDInlineAction');
        const link = make('a', 'Accéder à Production PVGIS →');
        link.href = '#prestudyPerformanceProductionGroup';
        action.append(link); climateGroup.panel.append(action);
      }
    };
    placeClimatePanel();
    if (!climateGroup.panel.querySelector('#climateYieldPanel')) {
      const climateObserver = new MutationObserver(() => {
        placeClimatePanel();
        if (climateGroup.panel.querySelector('#climateYieldPanel')) climateObserver.disconnect();
      });
      climateObserver.observe(document.body, { childList: true, subtree: true });
    }
    const productionCurve = study?.querySelector('.productionCurve');
    const profileBars = study?.querySelector('#profileBars');
    const profileLine = study?.querySelector('#profileP50');
    if (productionCurve && profileBars && !study.querySelector('.prestudyProductionPending')) {
      const pending = make('p', 'Les repères mensuels restent visibles ; les barres de production apparaîtront après un calcul PVGIS réussi.', 'fine prestudyProductionPending');
      pending.setAttribute('role', 'status');
      productionCurve.insertAdjacentElement('afterend', pending);
      const syncProductionGraph = () => {
        const ready = profileBars.childElementCount >= 12 || Boolean(profileLine?.getAttribute('points')?.trim());
        // Keep the chart frame and month axis in place while PVGIS is pending.
        // Hiding the whole plot made the monthly chart appear to have vanished.
        productionCurve.hidden = false;
        productionCurve.setAttribute('aria-busy', String(!ready));
        pending.hidden = ready;
      };
      syncProductionGraph();
      new MutationObserver(syncProductionGraph).observe(profileBars, { childList: true, subtree: true });
      if (profileLine) new MutationObserver(syncProductionGraph).observe(profileLine, { attributes: true, attributeFilter: ['points'] });
    }
    // Ces contrôles historiques restent en place : leurs identifiants sont encore lus par PVGIS, Risques, Enedis, Finance et la restauration du brouillon.
    const legacyTerrain = make('div', null, 'prestudyTerrainLegacy');
    legacyTerrain.hidden = true;
    legacyTerrain.setAttribute('aria-hidden', 'true');
    legacy.forEach((node) => legacyTerrain.append(node));
    root.append(legacyTerrain);
    production.panel.querySelector(':scope > #roofEstimate > h3')?.classList.add('prestudySrOnly');
    production.panel.querySelector('#roofEstimate > .sectionTitle h2')?.classList.add('prestudySrOnly');
    climate?.querySelector(':scope > h3')?.classList.add('prestudySrOnly');
    load.panel.querySelector('#consumptionReferenceGroup')?.classList.add('prestudyDFlat');
    const consumptionGroup = load.panel.querySelector('#consumptionReferenceGroup');
    if (consumptionGroup && !$('prestudyPrm')) {
      const label = make('label', 'PDL / PRM du site (facultatif)');
      const prm = make('input'); prm.id = 'prestudyPrm'; prm.type = 'text'; prm.inputMode = 'numeric'; prm.maxLength = 14;
      prm.autocomplete = 'off'; prm.placeholder = '14 chiffres, si connu'; prm.setAttribute('aria-describedby', 'prestudyPrmHelp');
      const help = make('small', 'Identifiant du point de livraison / point de référence mesure. À confirmer sur une facture ou auprès du client.'); help.id = 'prestudyPrmHelp';
      label.append(prm, help); consumptionGroup.append(label);
    }
  }
  function prepareRisks() {
    const root = $('audit-risk'), selector = $('riskFactor');
    const form = selector.closest('.form');
    root.querySelector('.sectionTitle h2')?.classList.add('prestudySrOnly');
    const urbanism = section(root, 'prestudyParcelUrbanism', 'Urbanisme de la parcelle', []);
    urbanism.panel.id = 'prestudyParcelUrbanismPanel';
    const installerSection = section(root, 'prestudyInstallerInfoSection', 'Informations pour l’installateur', []);
    const installer = make('details', null, 'prestudyInstallerInfo'); installer.id = 'prestudyInstallerInfo';
    installer.append(make('summary', 'Profil solaire, toiture et raccordement'));
    const installerIntro = make('p', 'Repères de pré-étude pour préparer la visite et les échanges avec le gestionnaire de réseau. Les résultats de proximité ne valent pas une étude de raccordement.', 'fine');
    const installerData = make('div', null, 'prestudyInstallerInfoContent'); installerData.id = 'prestudyInstallerInfoContent';
    installer.append(installerIntro, installerData); installerSection.panel.append(installer);
    const renderInstallerInfo = () => {
      installerData.replaceChildren();
      const facts = make('dl', null, 'prestudyInstallerFacts');
      const config = window.SOLARSHIFT_CONFIG || {};
      const production = config.commercialProductionPreview;
      const addFact = (label, value) => { const row = make('div'); row.append(make('dt', label), make('dd', value || 'À compléter')); facts.append(row); };
      const fmt = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : null;
      addFact('Profil solaire PVGIS', production?.status === 'READY' ? `${fmt(production.annualKwh) || 'À compléter'} kWh/an · ${fmt(production.specificYieldKwhKwp) || 'À compléter'} kWh/kWc/an` : 'En attente du calcul des surfaces');
      addFact('Puissance estimée', production?.status === 'READY' ? `${fmt(production.installedCapacityKwp) || 'À dimensionner'} kWc` : 'À dimensionner');
      const roof = window.OzenoRoofSurfaces?.captureDraft?.();
      const roofConfigs = roof?.surfaces?.length ? roof.surfaces.map(surface => surface.configuration || {}) : [roof?.manualConfiguration || {}];
      const roofParameters = roofConfigs.map((item, index) => {
        const type = item.type === 'PITCHED' ? 'inclinée' : item.type === 'FLAT' ? 'plate' : item.type || '';
        const orientation = item.orientation || (index === 0 ? $('manualAzimuth')?.value : '') || '';
        const tilt = item.pitch || item.flatTilt || '';
        const shade = item.shade || (index === 0 ? $('shade')?.value : '') || '';
        return [type, orientation ? `orientation ${orientation}°` : '', tilt ? `inclinaison ${tilt}°` : '', shade ? `ombrage ${shade}` : ''].filter(Boolean).join(' · ');
      }).filter(Boolean);
      addFact('Paramètres des surfaces', roofParameters.length ? [...new Set(roofParameters)].join(' ; ') : 'À renseigner dans Surfaces solaires');
      const qualification = window.OzenoParcelQualification?.capture?.();
      const networks = qualification?.siteContext?.networks;
      if (networks) {
        import('./site-context-view.mjs').then(({ networkSummary }) => {
          if (!facts.isConnected) return;
          for (const [label, kind] of [['Réseau BT', 'BT'], ['Réseau HTA', 'HTA'], ['Poste HTA/BT', 'POSTE']]) addFact(label, networkSummary(networks, kind));
        });
      } else {
        addFact('Réseaux électriques', 'À rechercher après confirmation de la parcelle');
      }
      installerData.append(facts);
      const limitation = make('p', 'Distances indicatives à vol d’oiseau depuis la parcelle ; elles ne donnent ni le tracé, ni la capacité, ni le coût du raccordement.', 'fine'); installerData.append(limitation);
      const horizonHost = make('div', null, 'prestudyInstallerHorizon');
      installerData.append(horizonHost);
      if (qualification?.horizon) import('./qualification-horizon.mjs').then(({ appendHorizon }) => {
        if (installerData.isConnected) appendHorizon(horizonHost, qualification.horizon);
      });
      else horizonHost.append(make('p', 'Profil du relief et courses du soleil : à compléter après consultation PVGIS.', 'fine'));
      if (qualification && (!networks || networks.state !== 'AVAILABLE' || qualification.horizon?.state !== 'AVAILABLE')) {
        const retry = make('button', 'Rechercher les réseaux et le profil du relief'); retry.type = 'button'; retry.className = 'secondary';
        retry.addEventListener('click', async () => {
          retry.disabled = true; retry.textContent = 'Consultation des sources…';
          try { await window.OzenoParcelQualification?.refreshContext?.(); }
          finally { retry.disabled = false; retry.textContent = 'Rechercher les réseaux et le profil du relief'; }
        });
        installerData.append(retry);
      } else if (!qualification) {
        const resume = make('a', 'Reprendre la sélection de la parcelle →'); resume.href = '#prestudy-project-location'; installerData.append(resume);
      }
      const surfaceLink = make('a', 'Voir les surfaces et paramètres de toiture →'); surfaceLink.href = '#prestudySurfaceQualification'; installerData.append(surfaceLink);
    };
    renderInstallerInfo();
    window.addEventListener('ozeno:parcel-qualification-updated', renderInstallerInfo);
    window.addEventListener('ozeno:commercial-production-preview', renderInstallerInfo);
    window.addEventListener('ozeno:project-context-loaded', renderInstallerInfo);
    const register = section(root, 'prestudyRiskRegister', 'Registre des sept contrôles', []);
    window.SOLARSHIFT_CONFIG?.parcelQualificationReady?.then(() => window.OzenoParcelQualification?.mountUrbanism(urbanism.panel));
    const editorNodes = [form, $('riskHelp'), root.querySelector('.riskActions'), $('riskEvidenceUploadStatus'), $('riskEvidenceDocuments')];
    riskEditor = make('div', null, 'prestudyRiskEditor'); riskEditor.id = 'prestudyRiskEditor';
    register.panel.append(riskEditor);
    editorNodes.filter(Boolean).forEach((n) => riskEditor.append(n));
    const factorLabel = selector.closest('label');
    if (factorLabel) factorLabel.hidden = true;
    const factorHeading = make('h3', '', 'prestudyRiskFactorHeading');
    factorHeading.id = 'prestudyRiskFactorHeading';
    riskEditor.prepend(factorHeading);
    const rows = new Map(); let active = selector.value, pending = null, internalChange = false, restoringContext = false;
    const source = $('riskSource'), observation = $('riskObservation'), evidence = $('riskEvidence'), file = $('riskEvidenceFile'), upload = $('riskEvidenceUpload');
    const values = () => JSON.stringify([observation.value, evidence.value, source.value]);
    const initialValue = (select) => ([...select.options].find((o) => o.defaultSelected) || select.options[0]).value;
    const initialEditor = [initialValue(observation), initialValue(evidence), source.defaultValue];
    let baseline = values();
    const hasFile = () => Boolean(file.files?.length);
    const changed = () => values() !== baseline || hasFile() || upload.disabled;
    const records = () => window.OzenoRiskDraft?.capture() || [];
    const guard = make('dialog', null, 'prestudyRiskGuard'); guard.setAttribute('aria-labelledby', 'prestudyRiskGuardTitle');
    guard.innerHTML = '<h2 id="prestudyRiskGuardTitle">Édition en cours</h2><p>Conservez cette ligne pour terminer votre saisie, appliquez le constat avec l’action existante, ou abandonnez cette édition avant de changer de point.</p><p id="prestudyRiskGuardFile" role="status"></p><div><button type="button" data-risk-continue>Continuer la saisie</button><button type="button" data-risk-apply>Appliquer le constat</button><button type="button" data-risk-discard>Abandonner l’édition</button></div>';
    document.body.append(guard);
    const syncGuard = () => {
      guard.querySelector('[data-risk-apply]').disabled = hasFile() || upload.disabled;
      guard.querySelector('[data-risk-discard]').disabled = upload.disabled;
      $('prestudyRiskGuardFile').textContent = upload.disabled ? 'Envoi en cours : attendez sa fin avant de changer de point.' : hasFile() ? 'Un justificatif est sélectionné. Joignez-le depuis la ligne actuelle, ou abandonnez explicitement sa sélection.' : '';
    };
    function refresh() {
      // Le hub annonce le contexte avant de restaurer les constats : attendre le rendu de couverture existant.
      if (restoringContext) { loadSelectedRecord(); baseline = values(); restoringContext = false; }
      const byFactor = new Map(records().map((r) => [r.factor, r]));
      rows.forEach(({ status, state }, key) => {
        const record = byFactor.get(key);
        status.textContent = record ? 'Constat enregistré' : 'À vérifier';
        const scoreLabel = record ? [...observation.options].find((o) => Number(o.value) === record.score)?.textContent || 'Constat disponible' : 'Aucun constat documenté';
        const sourceLabel = record?.source?.trim() || '';
        state.querySelector('.prestudyRiskObservation').textContent = scoreLabel;
        state.querySelector('.prestudyRiskSource').textContent = sourceLabel ? `Source : ${sourceLabel}` : '';
        state.querySelector('.prestudyRiskSource').hidden = !sourceLabel;
      });
    }
    function open(factor, focus = true) {
      active = factor;
      const row = rows.get(factor); row.host.append(riskEditor); riskEditor.hidden = false;
      factorHeading.textContent = row.label.textContent;
      rows.forEach((item, key) => item.button.setAttribute('aria-expanded', String(key === factor)));
      if (focus) { observation.focus({ preventScroll: true }); row.host.scrollIntoView({ block: 'nearest' }); }
    }
    function select(factor) {
      if (factor !== active) {
        selector.value = factor; internalChange = true; selector.dispatchEvent(new Event('change')); internalChange = false;
        loadSelectedRecord();
        active = factor; baseline = values();
      }
      open(factor);
    }
    function loadSelectedRecord() {
      const record = records().find((r) => r.factor === selector.value);
      if (record) { observation.value = String(record.score); evidence.value = record.evidence; source.value = record.source || ''; }
      else { [observation.value, evidence.value, source.value] = initialEditor; }
    }
    function request(factor) {
      if (factor !== active && changed()) { pending = factor; syncGuard(); guard.showModal(); return; }
      select(factor);
    }
    [...selector.options].forEach((option) => {
      const host = make('div', null, 'prestudyRiskRow'); host.id = `prestudy-risk-${option.value.toLowerCase()}`;
      const line = make('div', null, 'prestudyRiskLine'), label = make('strong', option.textContent.replace(/^✓\s*/, ''));
      const state = make('span', null, 'prestudyRiskState'), status = make('span', null, 'prestudyRiskStatus');
      state.append(make('span', null, 'prestudyRiskObservation'), make('small', null, 'prestudyRiskSource'));
      const button = make('button', 'Examiner'); button.type = 'button'; button.dataset.riskExamine = option.value;
      button.setAttribute('aria-label', `Examiner : ${label.textContent}`); button.setAttribute('aria-controls', riskEditor.id); button.setAttribute('aria-expanded', 'false');
      button.addEventListener('click', () => request(option.value));
      line.append(label, state, status, button); host.append(line); register.panel.append(host); rows.set(option.value, { host, button, status, state, label });
    });
    // Le contrôle existant reste utilisable : intercepter avant ses handlers seulement en cas de changement de ligne.
    selector.addEventListener('change', (event) => {
      if (internalChange) return;
      const requested = selector.value;
      if (requested !== active) { event.stopImmediatePropagation(); selector.value = active; request(requested); }
    }, true);
    guard.querySelector('[data-risk-continue]').onclick = () => guard.close();
    guard.querySelector('[data-risk-apply]').onclick = () => { $('addRisk').click(); const next = pending; guard.close(); select(next); };
    guard.querySelector('[data-risk-discard]').onclick = () => { file.value = ''; const next = pending; guard.close(); select(next); };
    guard.addEventListener('close', () => rows.get(active)?.button.focus({ preventScroll: true }));
    $('addRisk').addEventListener('click', () => { baseline = values(); refresh(); });
    new MutationObserver(refresh).observe($('riskCoverage'), { childList: true, subtree: true });
    new MutationObserver(syncGuard).observe(upload, { attributes: true, attributeFilter: ['disabled'] });
    window.addEventListener('ozeno:risk-document-attached', refresh);
    window.addEventListener('ozeno:project-context-loaded', () => {
      guard.close(); file.value = ''; active = selector.value; restoringContext = true; baseline = values();
      riskEditor.hidden = true; rows.forEach((row) => row.button.setAttribute('aria-expanded', 'false'));
    });
    revealRisk = () => open(active, false);
    root.addEventListener('invalid', revealRisk, true);
    riskEditor.hidden = true; refresh();
  }
  function prepareFinancePresentation() {
    const root = $('audit-finance');
    if (root && !root.querySelector('#prestudyFinanceDecisionGuide')) {
      const guide = make('aside', null, 'prestudyFinanceDecisionGuide');
      guide.id = 'prestudyFinanceDecisionGuide';
      guide.setAttribute('aria-label', 'Lecture des résultats financiers');
      const heading = make('h3', 'Lecture des résultats');
      const grid = make('div', null, 'prestudyFinanceDecisionGrid');
      const addItem = (id, label, value) => {
        const item = make('div'); item.append(make('small', label));
        const result = make('strong', value); result.id = id; item.append(result); grid.append(item);
      };
      addItem('prestudyFinanceBeneficiary', 'Bénéficiaire retenu', 'À sélectionner');
      addItem('prestudyFinanceBasis', 'Base affichée', 'Hypothèses actives');
      addItem('prestudyFinanceCompare', 'Comparaison', 'Une option à la fois');
      const note = make('p', 'Les recettes ACI, ACC et surplus reposent sur les parts et prix annuels saisis. Elles restent des hypothèses tant qu’un matching temporel lié au projet et au scénario n’est pas établi.', 'fine');
      note.id = 'prestudyFinanceDecisionNote';
      guide.append(heading, grid, note);
      const hint = root.querySelector(':scope > .hint');
      if (hint) hint.insertAdjacentElement('afterend', guide);
      else root.prepend(guide);
    }
    const updateDecisionGuide = () => {
      if (!root) return;
      const owner = $('financialAnalysis')?.value !== 'investor';
      const horizon = Number($('term')?.value);
      const debtShare = Number($('debtShare')?.value);
      const preview = window.SOLARSHIFT_FINANCIAL_PREVIEW || {};
      const ready = preview.status === 'READY';
      const beneficiary = $('prestudyFinanceBeneficiary');
      const basis = $('prestudyFinanceBasis');
      const comparison = $('prestudyFinanceCompare');
      if (beneficiary) beneficiary.textContent = owner ? 'Propriétaire exploitant' : 'Tiers investisseur / SPV';
      if (basis) basis.textContent = `${ready ? 'Aperçu recalculé' : 'À calculer'}${Number.isFinite(horizon) && horizon > 0 ? ` · ${horizon} ans` : ''} · avant IS`;
      if (comparison) comparison.textContent = 'Une configuration active · comparaison indisponible';
      const note = $('prestudyFinanceDecisionNote');
      if (note) {
        const debt = Number.isFinite(debtShare) && debtShare > 0
          ? `Dette saisie : ${debtShare.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % ; le DSCR n’est pertinent que si le modèle fournit ce ratio sur la période de dette.`
          : 'Aucune dette saisie : le DSCR est non applicable.';
        note.textContent = `${debt} Les recettes ACI, ACC et surplus reposent sur les parts et prix annuels saisis ; elles restent des hypothèses tant qu’un matching temporel lié au projet et au scénario n’est pas établi.`;
      }
    };
    const funding = root?.querySelector('.financeFundingConfiguration');
    const irve = root?.querySelector('#irveInvestmentGroup');
    if (funding && irve) irve.before(funding);
    presentationHeadingBefore(root?.querySelector('.financeInvestmentCostRow'), 'prestudyFinanceCapexHeading', 'CAPEX');
    presentationHeadingBefore(funding, 'prestudyFinanceFundingHeading', 'Financement');
    presentationHeadingBefore(root?.querySelector('.financeRevenueGroups'), 'prestudyFinanceValuationHeading', 'Valorisation énergétique');
    presentationHeadingBefore(root?.querySelector('.financePreviewMetrics'), 'prestudyFinanceResultsHeading', 'Résultats financiers · aperçu');
    updateDecisionGuide();
    if (root && root.dataset.decisionGuideListeners !== 'true') {
      root.dataset.decisionGuideListeners = 'true';
      root.addEventListener('input', updateDecisionGuide);
      root.addEventListener('change', updateDecisionGuide);
      window.addEventListener('ozeno:finance-summary-ready', updateDecisionGuide);
      window.addEventListener('ozeno:local-finance', updateDecisionGuide);
      window.addEventListener('ozeno:project-context-loaded', updateDecisionGuide);
    }
  }
  function addPreviewMetric(grid, id, label, valueId, noteId, description) {
    if (!grid || $(id)) return;
    const card = make('div', null, 'decisionMetricUnavailable'); card.id = id;
    const value = make('strong', 'À calculer'); value.id = valueId;
    const note = make('small', description); note.id = noteId;
    card.append(make('small', label), value, note);
    grid.append(card);
  }
  function prepareSummaryPresentation() {
    const root = $('ozeno-summary');
    const energyGrid = root?.querySelector('.decisionGrid');
    if (energyGrid && !energyGrid.id) energyGrid.id = 'prestudySummaryEnergyGrid';
    presentationHeadingBefore(energyGrid, 'prestudySummaryEnergyHeading', 'Indicateurs énergétiques');
    if (root && energyGrid && !root.querySelector('#prestudySummaryStatus')) {
      const status = make('aside', null, 'prestudySummaryStatus');
      status.id = 'prestudySummaryStatus';
      status.setAttribute('role', 'note');
      status.textContent = 'Aperçu commercial · non canonique. Les indicateurs reprennent l’option et les hypothèses financières actives. Les recettes ACI et ACC issues de parts annuelles restent théoriques tant qu’un matching temporel lié au même projet et scénario n’est pas établi.';
      energyGrid.before(status);
    }
    const profile = root?.querySelector('.decisionProductionProfile');
    if (profile && !profile.id) profile.id = 'prestudySummaryProduction';
    const financeGrid = $('decisionFinanceMetricGrid') || $('decisionFinanceMetrics')?.querySelector('.decisionFinanceMetricGrid');
    if (financeGrid) {
      addPreviewMetric(financeGrid, 'prestudyProjectIrrAvailability', 'TRI Projet', 'decisionFinanceProjectIrr', 'decisionFinanceProjectIrrNote', 'CAPEX initial, puis revenus moins OPEX, avant financement et impôts · aperçu indicatif.');
      addPreviewMetric(financeGrid, 'prestudyDscrAvailability', 'DSCR minimum · période de dette', 'decisionFinanceDscr', 'decisionFinanceDscrNote', 'Flux disponible avant dette ÷ intérêts et principal ; minimum pendant la durée de dette.');
    }
    const lcoe = $('dashLcoe')?.closest('.decisionFinanceMetric');
    if (lcoe) {
      if (!lcoe.id) lcoe.id = 'prestudySummaryLcoe';
      if (!lcoe.querySelector('.decisionLcoeMethod')) {
        const method = make('small', 'Méthode : CAPEX total du projet (y compris IRVE) + OPEX et renouvellements − valeur terminale, divisés par la production cumulée dégradée. Ratio non actualisé, avant impôts et intérêts ; le coût IRVE augmente donc le coût par kWh solaire, même sans recette IRVE.', 'decisionLcoeMethod');
        $('dashLcoe').insertAdjacentElement('afterend', method);
      }
    }
    const revenue = $('decisionRevenue');
    if (revenue) {
      revenue.setAttribute('aria-label', 'Économies ACI et recettes ACC, IRVE et surplus estimées pour l’année 1');
      if (!revenue.querySelector('.decisionRevenuePeriodNote')) {
        const note = make('small', 'Ventilation par canal disponible pour l’année 1. Le moteur actuel ne fournit pas de détail annuel par canal sur toute la durée de projection.', 'decisionRevenuePeriodNote');
        revenue.querySelector('.decisionRevenueHeading')?.insertAdjacentElement('afterend', note);
      }
    }
    window.dispatchEvent(new CustomEvent('ozeno:prestudy-summary-presentation-ready'));
  }
  function prepareEfficiencyPresentation() {
    const form = $('efficiencyImpactForm');
    const primaryGrid = form?.querySelector(':scope > .efficiencyGrid');
    presentationHeadingBefore(primaryGrid, 'prestudyEfficiencyInputsHeading', 'Hypothèses de l’action');
    form?.querySelectorAll('label').forEach((label) => {
      const name = label.querySelector('[name]')?.name || '';
      if (/source|referenceDate|ficheCode/i.test(name)) label.classList.add('efficiencySourceField');
    });
    const ceeGrid = form?.querySelector('.efficiencyCee > .form');
    presentationHeadingBefore(ceeGrid, 'prestudyEfficiencyCeeHeading', 'Données de valorisation CEE');
    const results = $('efficiencyImpactResults');
    if (results) results.setAttribute('aria-label', 'Résultats de l’aperçu efficacité énergétique, CO₂ et CEE');
  }
  function prepare() {
    if (!$('audit-project') || $('audit-project').classList.contains('prestudyChapterD')) return;
    // Vérifiable avant/après composition : aucune copie de contrôle ni nouvelle valeur métier.
    const link = make('link'); link.rel = 'stylesheet'; link.href = './prestudy-chapters.css?v=20261115-crux13-performance-1'; document.head.append(link);
    ['audit-project', 'audit-roof', 'audit-solar', 'audit-risk'].forEach((id) => $(id).classList.add('prestudyChapterD'));
    const phaseEStyle = make('link'); phaseEStyle.id = 'prestudyPhaseEStyles'; phaseEStyle.rel = 'stylesheet'; phaseEStyle.href = './prestudy-phase-e.css?v=20261115-crux13-finance-summary-1'; document.head.append(phaseEStyle);
    ['audit-finance', 'audit-efficiency', 'ozeno-summary'].forEach((id) => $(id)?.classList.add('prestudyChapterE'));
    document.querySelector('.reportEditor')?.classList.add('prestudyChapterE');
    prepareProject(); prepareSurfaces(); preparePerformance(); prepareRisks();
    prepareFinancePresentation(); prepareEfficiencyPresentation(); prepareSummaryPresentation();
    window.addEventListener('ozeno:finance-summary-ready', prepareSummaryPresentation);
    const summary = $('ozeno-summary');
    if (summary) new MutationObserver(prepareSummaryPresentation).observe(summary, { childList: true, subtree: true });
  }
  function placeSharedMap(chapter) {
    const map = $('map'), locationMode = chapter === 'project';
    const target = $(locationMode ? 'prestudyLocationMapSlot' : 'prestudySurfaceMapSlot');
    if (!map || !target) return;
    const moved = map.parentElement !== target;
    const config = window.SOLARSHIFT_CONFIG = window.SOLARSHIFT_CONFIG || {};
    if (config.siteLocationMapActive !== locationMode) window.dispatchEvent(new CustomEvent('ozeno:site-map-mode-cancel'));
    config.siteLocationMapActive = locationMode;
    // Legacy demonstration pins must never appear as the location of a new project.
    if (locationMode && typeof marks !== 'undefined') Object.values(marks).forEach(marker => window.solarMap?.removeLayer(marker));
    map.dataset.mapPurpose = locationMode ? 'location' : 'surfaces';
    if (map.parentElement !== target) target.append(map);
    window.dispatchEvent(new CustomEvent('ozeno:shared-map-placed', { detail: { chapter } }));
    // Leaflet caches its dimensions when constructed in the original roof panel.
    // Recalculate after the chapter becomes visible and the new panel has laid out.
    requestAnimationFrame(() => {
      window.solarMap?.invalidateSize({ pan: false });
      requestAnimationFrame(() => {
        window.solarMap?.invalidateSize({ pan: false });
        if (moved) {
          // Reload visible tiles after the shared map has moved out of its hidden chapter.
          window.solarMap?.eachLayer?.((layer) => {
            if (layer._url && typeof layer.redraw === 'function') layer.redraw();
          });
        }
      });
    });
  }
  window.OzenoPrestudyChapters = Object.freeze({ prepare, placeSharedMap, refreshSummaryPresentation: prepareSummaryPresentation, reveal(target) { if (riskEditor?.contains(target)) revealRisk(); } });
}());
