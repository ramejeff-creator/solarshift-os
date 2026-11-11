(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const FORM_ID = 'prestudyEnvelopeHeatingForm';
  let fundingRequest = null, fundingTimer = 0, requestVersion = 0;

  const selectOptions = {
    wallCurrent: [['UNKNOWN', 'Je ne sais pas'], ['INSIDE', 'Isolation par l’intérieur (ITI)'], ['OUTSIDE', 'Isolation par l’extérieur (ITE)'], ['BOTH', 'Les deux selon les zones'], ['PARTIAL', 'Partiellement isolé / mixte'], ['NONE_KNOWN', 'Aucune isolation connue']],
    wallPlan: [['UNKNOWN', 'Je ne sais pas'], ['NONE', 'Aucun travaux prévu'], ['ITI', 'Isolation par l’intérieur (ITI)'], ['ITE', 'Isolation par l’extérieur (ITE)'], ['BOTH', 'Les deux / selon les zones'], ['OTHER', 'Autre solution à définir']],
    heating: [['UNKNOWN', 'Je ne sais pas'], ['GAS_BOILER', 'Chaudière gaz'], ['OIL_BOILER', 'Chaudière fioul'], ['COAL_BOILER', 'Chaudière charbon'], ['PROPANE_BOILER', 'Chaudière propane'], ['DIRECT_ELECTRIC', 'Chauffage électrique direct'], ['HEAT_PUMP', 'Pompe à chaleur'], ['HEAT_NETWORK', 'Réseau de chaleur'], ['BIOMASS', 'Chaudière biomasse'], ['OTHER', 'Autre système']],
    heatingSecondary: [['NONE', 'Aucun appoint connu'], ['UNKNOWN', 'Je ne sais pas'], ['GAS_BOILER', 'Chaudière gaz'], ['OIL_BOILER', 'Chaudière fioul'], ['COAL_BOILER', 'Chaudière charbon'], ['PROPANE_BOILER', 'Chaudière propane'], ['DIRECT_ELECTRIC', 'Chauffage électrique direct'], ['HEAT_PUMP', 'Pompe à chaleur'], ['HEAT_NETWORK', 'Réseau de chaleur'], ['BIOMASS', 'Chaudière biomasse'], ['OTHER', 'Autre système']],
    heatPlan: [['UNKNOWN', 'Je ne sais pas'], ['KEEP', 'Conserver ou régler le système'], ['HEAT_NETWORK', 'Réseau de chaleur'], ['HP_AIR_WATER', 'Pompe à chaleur air/eau'], ['HP_WATER_WATER', 'Pompe à chaleur eau/eau'], ['GEOTHERMAL', 'Géothermie'], ['BIOMASS', 'Biomasse'], ['OTHER', 'Autre solution à définir']],
    yesNoUnknown: [['UNKNOWN', 'Je ne sais pas'], ['YES', 'Oui'], ['NO', 'Non']],
    sources: [['UNKNOWN', 'Non renseignée'], ['OWNER_OPERATOR', 'Propriétaire ou exploitant'], ['DPE', 'DPE tertiaire'], ['ENERGY_AUDIT', 'Audit énergétique'], ['BILL_OR_INVENTORY', 'Facture ou inventaire technique'], ['SITE_VISIT', 'Visite du site'], ['OTHER', 'Autre source']],
    proof: [['UNKNOWN', 'Non précisé'], ['DECLARED', 'Information déclarée'], ['DOCUMENT_RECEIVED', 'Document reçu'], ['PERSON_VERIFIED', 'Vérifié lors d’une visite ou mesure']]
  };

  function field(labelText, name, options, id) {
    const label = document.createElement('label'); label.textContent = labelText;
    const control = document.createElement('select'); control.id = id; control.name = name;
    for (const [value, text] of options) { const option = document.createElement('option'); option.value = value; option.textContent = text; control.append(option); }
    label.append(control); return label;
  }
  function textField(labelText, name, id, placeholder) {
    const label = document.createElement('label'); label.textContent = labelText;
    const input = document.createElement('input'); input.id = id; input.name = name; input.type = 'text'; input.maxLength = 240; input.placeholder = placeholder;
    label.append(input); return label;
  }
  function buildGroup(title, items) {
    const group = document.createElement('fieldset'); group.className = 'prestudyEnvelopeGroup';
    const legend = document.createElement('legend'); legend.textContent = title; group.append(legend);
    const grid = document.createElement('div'); grid.className = 'form'; items.forEach((item) => grid.append(item)); group.append(grid); return group;
  }
  function form() { return $(FORM_ID); }
  function controlValues() {
    const result = {};
    form()?.querySelectorAll('[name]').forEach((control) => { result[control.name] = control.value; });
    return result;
  }
  function triggerSearch() {
    const values = controlValues();
    const section = $('prestudyFundingLeads');
    const list = $('prestudyFundingLeadList');
    if (!section || !list) return;
    fundingRequest?.abort();
    clearTimeout(fundingTimer);
    const version = ++requestVersion;
    const wallWorkPlanned = ['ITI', 'ITE', 'BOTH'].includes(values.wallInsulationPlan);
    const heatWorkPlanned = values.heatingReplacementPlanned === 'YES';
    if (!wallWorkPlanned && !heatWorkPlanned) {
      list.replaceChildren();
      const note = document.createElement('p'); note.className = 'fine'; note.textContent = values.wallInsulationPlan === 'UNKNOWN' || values.heatingReplacementPlanned === 'UNKNOWN'
        ? 'Précisez les travaux envisagés pour rechercher des pistes adaptées. Une réponse inconnue ne signifie pas qu’aucune aide existe.'
        : 'Aucun travail d’enveloppe ou de chauffage n’est déclaré comme prévu pour le moment.'; list.append(note);
      return;
    }
    list.replaceChildren();
    const loading = document.createElement('p'); loading.className = 'fine'; loading.textContent = 'Recherche indicative des pistes correspondantes…'; list.append(loading);
    fundingTimer = setTimeout(async () => {
      try {
        const config = window.SOLARSHIFT_CONFIG || {};
        const endpoint = config.prestudyFundingLeadsEndpoint;
        const token = await config.getAccessToken?.();
        if (!endpoint || !token) throw new Error('Connexion requise pour rechercher les pistes Funding de la pré-étude.');
        fundingRequest = new AbortController();
        const response = await fetch(endpoint, {
          method: 'POST',
          signal: fundingRequest.signal,
          headers: { apikey: config.supabasePublishableKey || '', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallInsulationPlan: values.wallInsulationPlan,
            heatingReplacementPlanned: values.heatingReplacementPlanned,
            currentHeatingSystem: values.currentHeatingSystem,
            plannedHeatingSystem: values.plannedHeatingSystem,
            buildingOlderThanTwoYears: values.buildingOlderThanTwoYears,
            workAlreadyCommitted: values.workAlreadyCommitted
          })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || `La recherche Funding a échoué (${response.status}).`);
        if (version !== requestVersion) return;
        list.replaceChildren();
        if (Array.isArray(result.leads) && result.leads.length) {
          result.leads.forEach((lead) => {
            const card = document.createElement('article'); card.className = 'prestudyFundingLead';
            const heading = document.createElement('h3'); heading.textContent = lead.title || 'Piste à examiner';
            const status = document.createElement('span'); status.className = 'prestudyFundingLeadStatus'; status.textContent = lead.status || 'À vérifier';
            const description = document.createElement('p'); description.textContent = lead.description || '';
            const link = document.createElement('a'); link.href = lead.sourceUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Consulter la source officielle';
            const checked = document.createElement('small'); checked.textContent = `Source consultée le ${lead.sourceCheckedAt || 'date non précisée'} · conditions à revalider.`;
            card.append(status, heading, description, link, checked); list.append(card);
          });
        }
        const note = document.createElement('p'); note.className = 'fine'; note.textContent = result.note || 'Aucune aide n’est garantie. Cette recherche ne dépose pas de demande et ne modifie pas les indicateurs financiers.'; list.append(note);
      } catch (error) {
        if (error?.name === 'AbortError' || version !== requestVersion) return;
        list.replaceChildren(); const note = document.createElement('p'); note.className = 'fine'; note.setAttribute('role', 'status'); note.textContent = error instanceof Error ? error.message : 'Recherche indicative indisponible pour le moment.'; list.append(note);
      }
    }, 220);
  }

  function mountRisk(root, makeSection) {
    if (!root || $(FORM_ID)) return;
    const formNode = document.createElement('form'); formNode.id = FORM_ID; formNode.noValidate = true;
    formNode.addEventListener('submit', (event) => event.preventDefault());
    const wall = buildGroup('Isolation des murs', [
      field('État actuel, selon les informations disponibles', 'wallCurrentState', selectOptions.wallCurrent, 'wallCurrentState'),
      field('Travaux d’isolation des murs envisagés', 'wallInsulationPlan', selectOptions.wallPlan, 'wallInsulationPlan'),
      field('Origine de l’information', 'wallSource', selectOptions.sources, 'wallSource'),
      field('Niveau de preuve', 'wallProofStatus', selectOptions.proof, 'wallProofStatus'),
      textField('Référence ou précision (facultatif)', 'wallSourceReference', 'wallSourceReference', 'Ex. audit énergétique, date, page')
    ]);
    const heat = buildGroup('Chauffage et travaux envisagés', [
      field('Système principal actuel', 'currentHeatingSystem', selectOptions.heating, 'currentHeatingSystem'),
      field('Système d’appoint (si connu)', 'secondaryHeatingSystem', selectOptions.heatingSecondary, 'secondaryHeatingSystem'),
      field('Le système produit-il aussi l’eau chaude sanitaire ?', 'heatingAlsoHotWater', selectOptions.yesNoUnknown, 'heatingAlsoHotWater'),
      field('Origine de l’information', 'heatingSource', selectOptions.sources, 'heatingSource'),
      field('Niveau de preuve', 'heatingProofStatus', selectOptions.proof, 'heatingProofStatus'),
      textField('Référence ou précision (facultatif)', 'heatingSourceReference', 'heatingSourceReference', 'Ex. inventaire, facture, DPE, date'),
      field('Un remplacement du chauffage est-il envisagé ?', 'heatingReplacementPlanned', [['UNKNOWN', 'Je ne sais pas'], ['NO', 'Non'], ['YES', 'Oui']], 'heatingReplacementPlanned'),
      field('Système de remplacement envisagé', 'plannedHeatingSystem', selectOptions.heatPlan, 'plannedHeatingSystem'),
      field('Le bâtiment a-t-il plus de deux ans ?', 'buildingOlderThanTwoYears', selectOptions.yesNoUnknown, 'buildingOlderThanTwoYears'),
      field('Devis signé, commande ou travaux déjà engagés ?', 'workAlreadyCommitted', selectOptions.yesNoUnknown, 'workAlreadyCommitted')
    ]);
    formNode.append(wall, heat);
    const help = document.createElement('p'); help.className = 'fine';
    help.textContent = 'Ces informations restent déclaratives jusqu’à vérification des documents et des règles du dispositif. Une donnée inconnue n’est pas assimilée à une inéligibilité.';
    const section = makeSection(root, 'prestudyEnvelopeHeating', 'Enveloppe et chauffage', [help, formNode]);
    section.host.classList.add('prestudyEnvelopeHeating');
    $('plannedHeatingSystem').closest('label').hidden = true;
    $('buildingOlderThanTwoYears').closest('label').hidden = true;
    $('workAlreadyCommitted').closest('label').hidden = true;
    $('heatingReplacementPlanned').addEventListener('change', () => {
      const planned = $('heatingReplacementPlanned').value === 'YES';
      ['plannedHeatingSystem', 'buildingOlderThanTwoYears', 'workAlreadyCommitted'].forEach((id) => { $(id).closest('label').hidden = !planned; });
    });
    formNode.addEventListener('change', (event) => {
      if (event.target?.name) { formNode.dataset.updatedAt = new Date().toISOString(); triggerSearch(); }
    });
    formNode.addEventListener('input', (event) => { if (event.target?.name) formNode.dataset.updatedAt = new Date().toISOString(); });
    triggerSearch();
  }

  function mountFunding(root) {
    if (!root || $('prestudyFundingLeads')) return;
    const section = document.createElement('section'); section.id = 'prestudyFundingLeads'; section.className = 'prestudyFundingLeads'; section.setAttribute('aria-labelledby', 'prestudyFundingLeadsHeading');
    const heading = document.createElement('h3'); heading.id = 'prestudyFundingLeadsHeading'; heading.textContent = 'Pistes d’aides à examiner';
    const list = document.createElement('div'); list.id = 'prestudyFundingLeadList'; list.setAttribute('aria-live', 'polite');
    section.append(heading, list);
    const anchor = root.querySelector('.financeFundingConfiguration');
    if (anchor) anchor.insertAdjacentElement('afterend', section); else root.append(section);
    window.SOLARSHIFT_CONFIG = window.SOLARSHIFT_CONFIG || {};
    if (!window.SOLARSHIFT_CONFIG.prestudyFundingLeadsEndpoint && window.SOLARSHIFT_CONFIG.supabaseUrl)
      window.SOLARSHIFT_CONFIG.prestudyFundingLeadsEndpoint = `${window.SOLARSHIFT_CONFIG.supabaseUrl}/functions/v1/prestudy-funding-leads`;
    triggerSearch();
  }

  function capture() {
    if (!form()) return null;
    return { schemaVersion: 1, capturedAt: form().dataset.updatedAt || null, answers: controlValues() };
  }
  function restore(value) {
    if (!form() || !value || typeof value !== 'object' || !value.answers) return;
    form().querySelectorAll('[name]').forEach((control) => {
      if (typeof value.answers[control.name] === 'string' && [...control.options].some((option) => option.value === value.answers[control.name])) control.value = value.answers[control.name];
    });
    form().dataset.updatedAt = typeof value.capturedAt === 'string' ? value.capturedAt : '';
    $('heatingReplacementPlanned').dispatchEvent(new Event('change', { bubbles: true }));
    triggerSearch();
  }

  window.OzenoBuildingEnergyPrestudy = Object.freeze({ mountRisk, mountFunding, capture, restore });
}());
