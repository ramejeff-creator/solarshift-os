(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let summaryMonthlyProduction = null;

  function installProfileTooltip() {
    const bars = document.querySelector('.decisionBottom .bars');
    if (!bars || document.getElementById('dashboardProfileTooltip')) return;
    bars.style.position = 'relative';
    const tooltip = document.createElement('div');
    tooltip.id = 'dashboardProfileTooltip';
    tooltip.className = 'dashboardProfileTooltip';
    bars.appendChild(tooltip);
    [...bars.querySelectorAll('i')].forEach((bar, index) => {
      bar.tabIndex = 0;
      const show = () => {
        const label = bar.title || `Mois ${index + 1} · valeur en cours de calcul`;
        tooltip.textContent = label.replace(/^Mois\s+(\d+)/, (_, month) => ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'][Number(month) - 1]);
        tooltip.style.display = 'block';
        tooltip.style.left = `${bar.offsetLeft + bar.offsetWidth / 2}px`;
        tooltip.style.top = `${Math.max(0, bar.offsetTop - 8)}px`;
      };
      const hide = () => { tooltip.style.display = 'none'; };
      bar.addEventListener('mouseenter', show);
      bar.addEventListener('mouseleave', hide);
      bar.addEventListener('focus', show);
      bar.addEventListener('blur', hide);
    });
  }

  function clarifyDecision() {
    const box = $('decisionStatus');
    if (!box || box.dataset.clarified === box.textContent) return;
    const title = box.querySelector('strong');
    const reason = box.querySelector('[data-decision-next-action]') || box.querySelector('span');
    if (!title || !reason) return;
    const originalTitle = title.textContent.trim();
    const originalReason = reason.textContent.trim().replace(/^Prochaine action\s*:\s*/i, '');
    const riskSummary = box.querySelector('[data-decision-risk]')?.textContent.trim().replace(/^Risques\s*:\s*/i, '');
    const readableTitle = originalTitle === 'À compléter' ? 'Données insuffisantes' : originalTitle;
    box.innerHTML = `<small>Qualification & risques</small><strong>${readableTitle}</strong><span data-decision-next-action><b>Prochaine action :</b> ${originalReason}</span>${riskSummary ? `<span data-decision-risk><b>Risques :</b> ${riskSummary}</span>` : ''}`;
    box.dataset.clarified = box.textContent;
  }

  function mergeRiskAndQualification() {
    const more = document.querySelector('.decisionMore');
    const riskTile = $('dashRisk')?.closest('.decisionMore > div');
    if (more && riskTile) {
      riskTile.hidden = true;
      more.classList.add('qualificationRisksMerged');
    }
  }

  function mergePriceIntoRevenueSummary() {
    const more = document.querySelector('.decisionMore');
    const priceTile = $('dashMix')?.closest('.decisionMore > div');
    if (priceTile) priceTile.hidden = true;
    if (more) more.classList.add('revenuePricesMerged');
  }

  function arrangeProductionAndDecision() {
    const decision = document.querySelector('.decision');
    const bottom = decision?.querySelector('.decisionBottom');
    const profile = bottom && [...bottom.children].find((child) => !child.classList.contains('actions'));
    const actions = bottom?.querySelector(':scope > .actions');
    const gain = $('dashNetGain')?.closest('.decisionMore > div');
    const lcoe = $('dashLcoe')?.closest('.decisionMore > div');
    const decisionGrid = decision?.querySelector('.decisionGrid');
    const financeMetrics = $('decisionFinanceMetrics');
    const financeMetricGrid = financeMetrics?.querySelector('.decisionFinanceMetricGrid');
    if (!bottom || !profile || !actions || !gain || !lcoe || !decisionGrid || !financeMetrics || !financeMetricGrid || bottom.querySelector('.decisionAnalysisRow')) return;
    const row = document.createElement('div');
    row.className = 'decisionAnalysisRow';
    profile.classList.add('decisionProductionProfile');
    gain.classList.add('decisionFinanceMetric');
    lcoe.classList.add('decisionFinanceMetric');
    financeMetricGrid.append(gain, lcoe);
    const performance = $('dashPerformance')?.closest('.decisionMore > div');
    if (performance) {
      performance.classList.add('decisionPerformanceMetric');
      decisionGrid.append(performance);
      performance.hidden = false;
    }
    const duplicateIrr = $('dashIrr')?.closest('.decisionGrid > div');
    if (duplicateIrr) duplicateIrr.hidden = true;
    row.append(profile);
    const energySummary = decision.querySelector('#decisionRevenue');
    if (energySummary) row.append(energySummary);
    bottom.prepend(row);
    bottom.insertBefore(financeMetrics, actions);
    bottom.appendChild(actions);
    const more = decision.querySelector('.decisionMore');
    if (more) more.hidden = true;
    const bars = profile.querySelector('.bars');
    if (bars) {
      if (!profile.querySelector('.decisionConsumptionGuide')) {
        const guide = document.createElement('span');
        guide.className = 'decisionConsumptionGuide';
        guide.hidden = true;
        guide.setAttribute('aria-hidden', 'true');
        bars.appendChild(guide);
      }
      if (!profile.querySelector('.decisionProductionDetails')) {
        const detailPanel = document.createElement('div');
        detailPanel.className = 'decisionProductionDetails';
        detailPanel.hidden = true;
        const detailLabel = document.createElement('small');
        detailLabel.className = 'decisionProductionDetailsLabel';
        detailLabel.textContent = 'Détail mensuel estimé · kWh';
        const detailValues = document.createElement('div');
        detailValues.className = 'decisionProductionValues';
        detailValues.setAttribute('role', 'group');
        detailValues.setAttribute('aria-label', 'Valeurs mensuelles de production estimée en kilowattheures');
        detailPanel.append(detailLabel, detailValues);
        bars.insertAdjacentElement('afterend', detailPanel);
      }
      if (!profile.querySelector('.decisionProfileLegend')) {
        const legendRow = document.createElement('div');
        legendRow.className = 'decisionProfileLegend';
        const productionLegend = document.createElement('span');
        productionLegend.className = 'decisionProfileLegendItem';
        productionLegend.hidden = true;
        const productionSwatch = document.createElement('i');
        productionSwatch.className = 'decisionLegendProduction';
        productionLegend.append(productionSwatch, document.createTextNode('Production mensuelle estimée'));
        const legend = document.createElement('small');
        legend.className = 'decisionConsumptionLegend';
        legend.hidden = true;
        const swatch = document.createElement('i');
        const description = document.createElement('span');
        legend.append(swatch, description);
        legendRow.append(productionLegend, legend);
        const detailPanel = profile.querySelector('.decisionProductionDetails');
        (detailPanel || bars).insertAdjacentElement('afterend', legendRow);
      }
    }
  }

  function updateDecisionConsumptionGuide(monthlyValues = summaryMonthlyProduction) {
    const profile = document.querySelector('.decisionProductionProfile');
    const bars = profile?.querySelector('.bars');
    const monthLabels = profile?.querySelector('.ozenoSummaryMonths');
    const guide = profile?.querySelector('.decisionConsumptionGuide');
    const detailPanel = profile?.querySelector('.decisionProductionDetails');
    const detailValues = profile?.querySelector('.decisionProductionValues');
    const productionLegend = profile?.querySelector('.decisionProfileLegendItem');
    const legend = profile?.querySelector('.decisionConsumptionLegend');
    const status = profile?.querySelector(':scope > small');
    if (!bars || !guide || !detailPanel || !detailValues || !productionLegend || !legend) return;
    const productionBars = [...bars.querySelectorAll(':scope > i')];
    const values = Array.isArray(monthlyValues) && monthlyValues.length === 12
      ? monthlyValues.map(Number)
      : null;
    if (!values || values.some((value) => !Number.isFinite(value) || value < 0) || productionBars.length !== 12) {
      bars.hidden = true;
      guide.hidden = true;
      detailPanel.hidden = true;
      productionLegend.hidden = true;
      legend.hidden = true;
      if (monthLabels) monthLabels.hidden = true;
      if (status) status.textContent = 'Profil mensuel indisponible : lancez un calcul PVGIS réussi pour afficher le graphique.';
      return;
    }
    bars.hidden = false;
    if (monthLabels) monthLabels.hidden = false;
    if (status) status.textContent = 'Production mensuelle estimée issue du dernier calcul PVGIS réussi.';
    productionLegend.hidden = false;
    detailValues.replaceChildren(...values.map((value, index) => {
      const cell = document.createElement('span');
      const month = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'][index];
      cell.textContent = Math.round(value).toLocaleString('fr-FR');
      cell.title = `${month} · ${cell.textContent} kWh`;
      cell.setAttribute('aria-label', `${month} : ${cell.textContent} kilowattheures`);
      return cell;
    }));
    detailPanel.hidden = false;
    const input = $('cons');
    const annualConsumption = window.SolarShiftConsumptionReference?.getAnnualKwh?.() ?? null;
    const averageMonthlyConsumption = input?.value?.trim() && Number.isFinite(annualConsumption) && annualConsumption > 0
      ? annualConsumption / 12
      : null;
    const maximum = Math.max(...values, averageMonthlyConsumption || 0, 1);
    productionBars.forEach((bar, index) => { bar.style.height = `${100 * values[index] / maximum}%`; });
    guide.hidden = averageMonthlyConsumption == null;
    legend.hidden = averageMonthlyConsumption == null;
    if (averageMonthlyConsumption == null) return;
    guide.style.bottom = `${100 * averageMonthlyConsumption / maximum}%`;
    const source = input.dataset.referenceSource || 'consommation annuelle renseignée';
    const year = input.dataset.referenceYear ? ` · ${input.dataset.referenceYear}` : '';
    const value = Math.round(averageMonthlyConsumption).toLocaleString('fr-FR');
    guide.title = `${source}${year} · moyenne de ${value} kWh/mois (annuel ÷ 12), sans profil de charge réel`;
    legend.lastElementChild.textContent = `Pointillés = consommation moyenne · ${value} kWh/mois · ${source}${year} (annuel ÷ 12)`;
  }

  function makeReportOptional() {
    const report = document.querySelector('.reportEditor');
    const title = report?.querySelector('.sectionTitle');
    if (!report || !title || report.querySelector('.reportOptional')) return;
    const contents = [...report.children].filter((child) => child !== title);
    const details = document.createElement('details');
    details.className = 'reportOptional';
    details.innerHTML = '<summary>Préparer une note de décision (facultatif)</summary><p class="fine">Cette note reprend la synthèse pour relecture ou export PDF ; elle n’est pas nécessaire à la simulation.</p>';
    report.appendChild(details);
    contents.forEach((child) => details.appendChild(child));
    let wasOpen = false;
    window.addEventListener('beforeprint', () => { wasOpen = details.open; details.open = true; });
    window.addEventListener('afterprint', () => { details.open = wasOpen; });
  }

  function clarifyPreview() {
    const decision = document.querySelector('.decision');
    const eyebrow = decision?.querySelector('.eyebrow');
    if (eyebrow) eyebrow.textContent = 'APERÇU COMMERCIAL · NON CANONIQUE';
    const title = decision?.querySelector('h2');
    if (title && !decision.querySelector('.previewNotice')) {
      const note = document.createElement('p');
      note.className = 'previewNotice';
      note.textContent = 'Estimations de travail à confirmer — elles ne sont pas des résultats OZENO validés.';
      title.insertAdjacentElement('afterend', note);
    }
    const productionLabel = decision?.querySelector('#dashProd')?.previousElementSibling;
    if (productionLabel) productionLabel.textContent = 'Production estimée · aperçu';
    const surfaceLabel = decision?.querySelector('#dashRoof')?.previousElementSibling;
    if (surfaceLabel) surfaceLabel.textContent = 'Surface de panneaux estimée';
    const surfaceNote = decision?.querySelector('#dashRoof')?.nextElementSibling;
    if (surfaceNote) surfaceNote.textContent = 'Emprise des modules selon l’abaque';
    const performance = $('dashPerformance');
    const performanceDescription = 'Rendement PVGIS pondéré selon les surfaces, orientations, pentes et ombrages.';
    const performanceLabel = performance?.previousElementSibling;
    if (performanceLabel) {
      performanceLabel.title = performanceDescription;
      performanceLabel.setAttribute('aria-label', `${performanceLabel.textContent.trim()}. ${performanceDescription}`);
      const help = document.createElement('span');
      help.className = 'decisionMetricHelp';
      help.textContent = 'i';
      help.title = performanceDescription;
      help.setAttribute('role', 'img');
      help.setAttribute('aria-label', performanceDescription);
      performanceLabel.append(' ', help);
    }
    if (performance?.nextElementSibling) performance.nextElementSibling.hidden = true;
    const irrLabel = decision?.querySelector('#dashIrr')?.previousElementSibling;
    if (irrLabel) irrLabel.textContent = 'TRI annuel simulé · aperçu';
    const reportGrid = document.querySelector('.reportPreview .reportGrid');
    if (reportGrid) {
      const reportIrr = reportGrid.querySelector('#reportIrr')?.previousElementSibling;
      if (reportIrr) reportIrr.textContent = 'TRI annuel';
      const reportRoof = reportGrid.querySelector('#reportRoof')?.previousElementSibling;
      if (reportRoof) reportRoof.textContent = 'Surface de panneaux / puissance';
    }
  }

  function formatDecisionMetricUnits() {
    const outputs = ['dashRoof', 'dashCapacity', 'dashProd', 'dashIrr', 'dashPerformance']
      .map((id) => $(id))
      .filter(Boolean);
    outputs.forEach((output) => {
      if (output.querySelector('.decisionMetricUnit')) return;
      const value = output.textContent.trim();
      const match = value.match(/^([+\-−]?[\d\s\u202f.,]+?)\s+(kWh\/kWc\/an|kWh\/an|kWh|kWc|m²|€\/an|€|%)(.*)$/);
      if (!match) return;
      const number = document.createElement('span');
      number.className = 'decisionMetricNumber';
      number.textContent = match[1].trim();
      const unit = document.createElement('span');
      unit.className = 'decisionMetricUnit';
      unit.textContent = match[2];
      output.replaceChildren(number, document.createTextNode(' '), unit);
      if (match[3].trim()) {
        const suffix = document.createElement('span');
        suffix.className = 'decisionMetricSuffix';
        suffix.textContent = match[3].trim();
        output.appendChild(suffix);
      }
    });
    outputs.forEach((output) => {
      if (output.dataset.metricUnitObserver === 'true') return;
      output.dataset.metricUnitObserver = 'true';
      new MutationObserver(formatDecisionMetricUnits).observe(output, { childList: true, characterData: true, subtree: true });
    });
  }

  function boot() {
    const style = document.createElement('style');
    style.textContent = '.dashboardProfileTooltip{position:absolute;z-index:20;display:none;transform:translate(-50%,-100%);white-space:nowrap;background:#fff;color:#073d2a;border-radius:6px;padding:6px 8px;font-size:12px;box-shadow:0 3px 12px #0005}.decisionStatus>small{font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.75}.decisionStatus span b{display:inline;font-size:inherit;color:inherit;margin:0}.decisionMore.qualificationRisksMerged{grid-template-columns:repeat(2,minmax(0,1fr))}.decisionMore.revenuePricesMerged{grid-template-columns:1fr}.decisionMore>div[hidden]{display:none!important}.reportOptional{margin-top:12px;padding:12px 14px;border:1px solid #cfe0d5;border-radius:9px;background:#f8fbf9}.reportOptional summary{font-weight:700;color:#0a3f2d;cursor:pointer}.reportOptional[open]>summary{margin-bottom:12px}.reportOptional>p:first-of-type{margin:0 0 12px}.previewNotice{display:inline-block;padding:8px 10px;border-radius:7px;background:#fff2c9;color:#493500;font-size:14px}.decisionGrid em,.reportPreview .reportGrid{font-variant-numeric:tabular-nums}@media print{.reportEditor .reportOptional[open]>summary{display:none}.reportEditor .reportOptional{border:0;padding:0;margin:0}}#profileP90{display:none!important}@media(max-width:760px){.decisionMore.qualificationRisksMerged,.decisionMore.revenuePricesMerged{grid-template-columns:1fr}}';
    style.textContent += '.decisionGrid{grid-template-columns:repeat(3,minmax(0,1fr))}.decisionPerformanceMetric,.decisionFinanceMetric{min-width:0}.decisionAnalysisRow{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr);align-items:stretch;gap:18px;border-top:1px solid #284336;padding-top:16px;margin-top:16px;width:100%}.decisionProductionProfile{position:relative;min-width:0;width:100%;padding:12px;border-radius:9px;background:#0c2119}.decisionConsumptionGuide{position:absolute;z-index:3;left:0;right:0;bottom:0;height:0;border-top:2px dashed #7bd3d0;pointer-events:none}.decisionProfileLegend{display:flex;flex-wrap:wrap;align-items:center;gap:7px 18px;margin-top:7px;color:#b5d5c3;font-size:10px;line-height:1.45}.decisionProfileLegendItem,.decisionConsumptionLegend{display:flex;align-items:center;gap:7px;color:#b5d5c3;font-size:10px;line-height:1.45}.decisionProfileLegendItem[hidden],.decisionConsumptionLegend[hidden]{display:none!important}.decisionLegendProduction{flex:0 0 10px;width:10px;height:10px;border-radius:2px;background:#ffd34e}.decisionConsumptionLegend{margin:0}.decisionConsumptionLegend i{flex:0 0 18px;border-top:2px dashed #7bd3d0}.decisionBottom>.actions{grid-column:1/-1;margin-top:16px;padding-top:16px;border-top:1px solid #284336}.decisionBottom>.actions>.decisionStatus{max-width:none}@media(max-width:1100px){.decisionGrid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:760px){.decisionGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.decisionAnalysisRow{grid-template-columns:1fr;gap:10px}}';
    style.textContent += '.decisionConsumptionLegend{margin:0;padding:5px 9px;border:1px solid #7bd3d0;border-radius:6px;background:#16453f;color:#edffff;font-size:11px;font-weight:700;line-height:1.4;box-shadow:0 0 0 1px #7bd3d01f}.decisionConsumptionLegend i{flex:0 0 24px;border-top:3px dashed #7bd3d0}';
    document.head.appendChild(style);
    installProfileTooltip();
    clarifyDecision();
    clarifyPreview();
    formatDecisionMetricUnits();
    mergeRiskAndQualification();
    mergePriceIntoRevenueSummary();
    arrangeProductionAndDecision();
    window.addEventListener('ozeno:finance-summary-ready', () => {
      mergePriceIntoRevenueSummary();
      arrangeProductionAndDecision();
    });
    window.addEventListener('ozeno:commercial-production-preview', (event) => {
      const preview = event.detail || {};
      summaryMonthlyProduction = preview.status === 'READY' && Array.isArray(preview.monthlyKwh)
        ? preview.monthlyKwh
        : null;
      updateDecisionConsumptionGuide();
    });
    window.addEventListener('ozeno:consumption-reference', () => updateDecisionConsumptionGuide());
    const initialPreview = window.SOLARSHIFT_CONFIG?.commercialProductionPreview;
    if (initialPreview?.status === 'READY') summaryMonthlyProduction = initialPreview.monthlyKwh;
    updateDecisionConsumptionGuide();
    makeReportOptional();
    const decision = $('decisionStatus');
    if (decision) new MutationObserver(() => queueMicrotask(clarifyDecision)).observe(decision, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());
