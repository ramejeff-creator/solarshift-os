(function installFinancialAssumptions(global) {
  'use strict';

  const MODEL_VERSION = 'FINANCIAL-PREVIEW-1.4';
  const PARAMETERS = Object.freeze([
    { key: 'productionDegradationRate', id: 'assumptionProductionDegradationPct', label: 'Dégradation annuelle de la production', unit: '%/an', defaultPct: 0.4, min: 0, max: 10, step: 0.1, note: 'Référence générique du modèle ; remplacez-la si une étude projet le justifie.' },
    { key: 'energyPriceEscalationRate', id: 'assumptionEnergyPriceEscalationPct', label: 'Indexation annuelle ACI / ACC / IRVE', unit: '%/an', defaultPct: 1, min: 0, max: 20, step: 0.1, note: 'Hypothèse générique ; à distinguer d’un tarif contractuel ou réglementé.' },
    { key: 's21SurplusEscalationRate', id: 'assumptionS21SurplusEscalationPct', label: 'Indexation annuelle du surplus · S21', unit: '%/an', defaultPct: 2, min: 0, max: 20, step: 0.1, note: 'Hypothèse de projection, pas une garantie d’évolution future du tarif.' },
    { key: 'contractSurplusEscalationRate', id: 'assumptionContractSurplusEscalationPct', label: 'Indexation annuelle du surplus · contrat', unit: '%/an', defaultPct: 1, min: 0, max: 20, step: 0.1, note: 'Hypothèse générique si le contrat ne précise pas d’indexation.' },
    { key: 'maintenanceCapexRate', id: 'assumptionMaintenanceCapexPct', label: 'Maintenance rapportée au CAPEX client', unit: '%/an', defaultPct: 2.5, min: 0, max: 20, step: 0.1, note: 'Appliquée chaque année au CAPEX client, sans ajout de la commission facturée à l’installateur.' },
    { key: 'insuranceCapexRate', id: 'assumptionInsuranceCapexPct', label: 'Assurance rapportée au CAPEX client', unit: '%/an', defaultPct: 0.4, min: 0, max: 20, step: 0.1, note: 'Appliquée chaque année au CAPEX client, sans ajout de la commission facturée à l’installateur.' },
    { key: 'initialProjectCommissionRate', id: 'assumptionInitialProjectCommissionPct', label: 'Commission facturée à l’installateur · hors investissement client', unit: '% CAPEX installation', defaultPct: 10, min: 8, max: 10, step: 0.1, note: 'Fourchette OZENO : 8 à 10 % de la base travaux estimée. Facturée à l’installateur, sans ajout ni déduction du CAPEX client. Estimation de CA potentiel, pas une facture émise.' },
    { key: 'investorManagementFeeRate', id: 'assumptionManagementFeePct', label: 'Frais de gestion annuels sur les revenus bruts d’exploitation', unit: '% revenus bruts/an', defaultPct: 10, min: 0, max: 100, step: 0.1, note: 'Appliqués chaque année à la valeur brute de l’énergie (production × prix moyen), uniquement au scénario tiers investisseur.' },
    { key: 'rentEscalationRate', id: 'assumptionRentEscalationPct', label: 'Indexation annuelle du loyer', unit: '%/an', defaultPct: 1, min: 0, max: 20, step: 0.1, note: 'Hypothèse générique ; le bail signé doit prévaloir.' },
    { key: 'discountRate', id: 'discountRate', label: 'Taux d’actualisation', unit: '%/an', defaultPct: 5, min: 0, max: 100, step: 0.1, note: 'Il ramène les coûts et revenus futurs en euros d’aujourd’hui pour les comparer.' }
  ]);

  function getValues(documentRef = global.document) {
    const values = {};
    for (const parameter of PARAMETERS) {
      const raw = documentRef?.getElementById?.(parameter.id)?.value;
      const pct = raw == null || raw.trim?.() === '' ? parameter.defaultPct : Number(raw);
      if (!Number.isFinite(pct) || pct < parameter.min || pct > parameter.max) return null;
      values[parameter.key] = pct / 100;
      values[`${parameter.key}Pct`] = pct;
    }
    return { modelVersion: MODEL_VERSION, values };
  }

  function renderEditor(container, documentRef = global.document) {
    if (!container || !documentRef) return;
    container.replaceChildren();
    const intro = documentRef.createElement('p');
    intro.className = 'fine';
    intro.textContent = `Références génériques ${MODEL_VERSION} (colonne de gauche) et valeurs retenues pour ce projet (éditables). Les références ne sont pas des tarifs officiels ni des valeurs validées pour ce site.`;
    const disclosure = documentRef.createElement('details');
    disclosure.className = 'financialAssumptionDisclosure';
    const summary = documentRef.createElement('summary');
    summary.textContent = 'Références génériques';
    disclosure.append(summary, intro);
    const scroll = documentRef.createElement('div');
    scroll.className = 'financialAssumptionScroll';
    const table = documentRef.createElement('table');
    table.className = 'financialAssumptionTable';
    table.setAttribute('aria-label', 'Hypothèses financières du projet');
    const head = documentRef.createElement('thead');
    const headerRow = documentRef.createElement('tr');
    ['Paramètre', 'Référence générique', 'Valeur retenue pour ce projet'].forEach((title) => {
      const cell = documentRef.createElement('th');
      cell.scope = 'col';
      cell.textContent = title;
      headerRow.appendChild(cell);
    });
    head.appendChild(headerRow);
    table.appendChild(head);
    const body = documentRef.createElement('tbody');
    PARAMETERS.forEach((parameter) => {
      const row = documentRef.createElement('tr');
      const label = documentRef.createElement('th');
      label.scope = 'row';
      label.textContent = `${parameter.label} (${parameter.unit})`;
      if (parameter.key === 'discountRate') {
        const help = documentRef.createElement('span');
        help.className = 'financeHelp';
        const button = documentRef.createElement('button');
        button.type = 'button';
        button.className = 'financeHelpButton';
        button.setAttribute('aria-label', 'À propos du taux d’actualisation');
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-describedby', `${parameter.id}Help`);
        button.textContent = 'i';
        const bubble = documentRef.createElement('span');
        bubble.id = `${parameter.id}Help`;
        bubble.className = 'financeHelpBubble';
        bubble.setAttribute('role', 'tooltip');
        bubble.textContent = parameter.note;
        help.append(button, bubble);
        button.addEventListener('click', (event) => {
          event.preventDefault();
          const open = help.classList.toggle('is-open');
          button.setAttribute('aria-expanded', String(open));
        });
        documentRef.addEventListener('click', (event) => {
          if (help.contains(event.target)) return;
          help.classList.remove('is-open');
          button.setAttribute('aria-expanded', 'false');
        });
        button.addEventListener('keydown', (event) => {
          if (event.key !== 'Escape') return;
          help.classList.remove('is-open');
          button.setAttribute('aria-expanded', 'false');
          button.blur();
        });
        label.appendChild(help);
      }
      const input = documentRef.createElement('input');
      input.id = parameter.id;
      input.type = 'number';
      input.min = String(parameter.min);
      input.max = String(parameter.max);
      input.step = String(parameter.step);
      input.value = String(parameter.defaultPct);
      input.dataset.modelDefault = String(parameter.defaultPct);
      input.setAttribute('aria-describedby', parameter.key === 'discountRate' ? `${parameter.id}Help` : `${parameter.id}Note`);
      const note = documentRef.createElement('small');
      note.id = `${parameter.id}Note`;
      note.className = 'fine';
      note.textContent = parameter.note;
      const referenceCell = documentRef.createElement('td');
      referenceCell.textContent = `${parameter.defaultPct.toLocaleString('fr-FR')} ${parameter.unit}`;
      const projectCell = documentRef.createElement('td');
      projectCell.className = 'financialAssumptionValue';
      projectCell.append(input);
      if (parameter.key !== 'discountRate') projectCell.append(note);
      row.append(label, referenceCell, projectCell);
      body.appendChild(row);
    });
    table.appendChild(body);
    const actions = documentRef.createElement('div');
    actions.className = 'financialAssumptionActions';
    const reset = documentRef.createElement('button');
    reset.type = 'button';
    reset.className = 'secondary';
    reset.id = 'resetFinancialAssumptions';
    reset.textContent = 'Rétablir les valeurs par défaut';
    actions.appendChild(reset);
    scroll.appendChild(table);
    disclosure.append(scroll, actions);
    container.appendChild(disclosure);
  }

  global.SolarShiftFinancialAssumptions = Object.freeze({ MODEL_VERSION, PARAMETERS, getValues, renderEditor });
}(globalThis));
