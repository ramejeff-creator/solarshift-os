(function () {
  'use strict';

  const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  let latestProductionPreview = null;

  function section() {
    return document.getElementById('audit-solar') || [...document.querySelectorAll('section.card')].find((node) => /Fiche terrain et performance/i.test(node.textContent || ''));
  }

  function addStyles() {
    const style = document.getElementById('productionStudyStyles') || document.createElement('style');
    style.id = 'productionStudyStyles';
    style.textContent = `
      .productionStudy{margin-top:18px}.productionStudyGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12px 0 18px}.productionStudy .metric{position:relative;border:1px solid #cfe0d5;border-radius:9px;padding:12px;background:#f5faf7}.productionStudy .metric b{display:block;color:#0a3f2d;font-size:19px;margin:4px 0}.productionStudy .metric small{color:#587469}.monthlyProfile{display:grid;grid-template-columns:repeat(12,1fr);align-items:end;gap:7px;height:150px;padding:10px 4px;border-bottom:1px solid #cfe0d5}.monthlyProfile i{display:block;min-height:4px;border-radius:5px 5px 0 0;background:linear-gradient(#f2bb35,#d99116);position:relative}.monthlyProfile span{display:block;text-align:center;color:#587469;font-size:11px;margin-top:5px}.productionStudy .status{margin-top:12px}.productionStudy .fine{margin-top:12px}.climateYieldPanel{margin-top:18px;padding:16px;border:1px solid #cfe0d5;border-radius:9px;background:#f8fbf9}.climateYieldPanel h3{margin:0 0 6px;color:#0a3f2d}.climateYieldMetrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:12px 0}.climateYieldMetrics>div{min-width:0;padding:10px;border:1px solid #dce9e0;border-radius:7px;background:#fff}.climateYieldMetrics small,.climateYieldMetrics b{display:block}.climateYieldMetrics small{color:#587469}.climateYieldMetrics b{margin-top:4px;color:#0a3f2d;font-size:17px;font-variant-numeric:tabular-nums}.climateYieldSummary{margin:7px 0;color:#315c4b;font-size:13px}.climateHistoryChart{width:100%;overflow:hidden;border:1px solid #e1ebe4;border-radius:7px;background:#fff}.climateHistoryChart svg{display:block;width:100%;height:auto}.climateHistoryBars rect{fill:#5aaa8d}.climateHistoryGuides line{stroke-width:2;stroke-dasharray:7 5}.climateHistoryGuides .climateP50{stroke:#e0ad22}.climateHistoryGuides .climateP90{stroke:#7952a5}.climateHistoryAxis text{fill:#587469;font:11px system-ui,sans-serif}.climateHistoryLegend{display:flex;flex-wrap:wrap;gap:10px 18px;margin:9px 0;color:#315c4b;font-size:13px}.climateHistoryLegend span{display:flex;align-items:center;gap:7px}.climateHistoryLegend i{display:inline-block;width:18px;height:9px;border-radius:2px;background:#5aaa8d}.climateHistoryLegend .climateLegendP50,.climateHistoryLegend .climateLegendP90{height:0;border-top:2px dashed #e0ad22;background:transparent}.climateHistoryLegend .climateLegendP90{border-color:#7952a5}.climateHistorySource{font-size:12px;color:#587469}@media(max-width:760px){.productionStudyGrid{grid-template-columns:repeat(2,1fr)}.monthlyProfile{gap:3px}.climateYieldMetrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
      #profilePoints circle{fill:#f0b52c;stroke:#fff;stroke-width:2;cursor:help}#profilePoints circle:focus-visible{stroke:#073d2a;stroke-width:3;outline:none}#profileBars .profileBar{cursor:help}#profileBars .profileBar:focus-visible{stroke:#073d2a;stroke-width:2;outline:none}
      #profileBars{display:block}#profileP50,#profileConsumption,#profilePoints{display:none!important}.profileBar{fill:#5aaa8d;opacity:.55}.profileConsumptionBar{fill:#8c54b8;opacity:.78;cursor:help}.profileBar,.profileConsumptionBar{transition:opacity .12s}.profileBar:hover,.profileConsumptionBar:hover,.profileBar:focus-visible,.profileConsumptionBar:focus-visible{opacity:1;stroke:#073d2a;stroke-width:1.5;outline:none}.legendProductionBars{width:12px!important;height:9px!important;background:#5aaa8d!important;opacity:.55;border-radius:2px!important}.legendConsumption{width:12px!important;height:9px!important;background:#8c54b8!important;border:0!important;border-radius:2px!important}.consumptionReferenceNote{margin:8px 0;padding:9px 11px;border-left:3px solid #8c54b8;border-radius:5px;background:#f7f1fb;color:#4f3762}.monthlySurplusHint{margin:7px 0;padding:9px 11px;border-left:3px solid #27885f;border-radius:5px;background:#edf7f0;color:#315b45}.monthlySurplusHint b{color:#08734c}
    `;
    if (!style.isConnected) document.head.appendChild(style);
  }

  function barsMarkup() {
    return months.map((month, index) => `<div><i data-month="${index}" style="height:12%" title="${month} : profil en attente"></i><span>${month}</span></div>`).join('');
  }

  function installClimateYieldPanel(card) {
    if (card.querySelector('#climateYieldPanel')) return card.querySelector('#climateYieldPanel');
    const panel = document.createElement('section');
    panel.id = 'climateYieldPanel';
    panel.className = 'climateYieldPanel';
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = '<h3>Variabilité climatique historique · aperçu</h3><p id="climateYieldStatus" class="climateYieldSummary">En attente d’un calcul PVGIS historique.</p><div id="climateYieldResults" hidden><div class="climateYieldMetrics"><div><small>Climate P50 · médiane</small><b id="climateP50Value">UNKNOWN</b></div><div><small>Climate P75 · quantile bas</small><b id="climateP75Value">UNKNOWN</b></div><div><small>Climate P90 · décile bas</small><b id="climateP90Value">UNKNOWN</b></div><div><small>Années complètes</small><b id="climateYearCount">UNKNOWN</b></div></div><p id="climateYieldSummary" class="climateYieldSummary"></p><div id="climateHistoryChart" class="climateHistoryChart" role="img" aria-label="Production PVGIS historique annuelle"></div><div class="climateHistoryLegend" aria-label="Légende du graphique historique"><span><i></i>Production annuelle PVGIS</span><span><i class="climateLegendP50"></i>Climate P50 · médiane</span><span><i class="climateLegendP90"></i>Climate P90 · seuil dépassé par environ 90 % des années observées</span></div><p id="climateYieldSource" class="climateHistorySource"></p></div><p class="fine">Climate P50/P90 décrivent uniquement la variabilité climatique historique PVGIS ; ils ne sont ni un P50/P90 modélisé d’investissement, ni une étude indépendante, ni une garantie de production. Les pertes et ombrages saisis sont appliqués comme hypothèses. Cet aperçu n’est pas enregistré au dossier.</p>';
    const anchor = card.querySelector('#productionChart, .productionCurve, .monthlyProfile, .productionChart') || card.querySelector('#productionConsumptionPanel') || card.lastElementChild;
    if (anchor) anchor.insertAdjacentElement('afterend', panel);
    else card.appendChild(panel);
    return panel;
  }

  function renderClimateYieldPreview(preview) {
    const panel = document.getElementById('climateYieldPanel');
    if (!panel) return;
    const status = document.getElementById('climateYieldStatus');
    const results = document.getElementById('climateYieldResults');
    const reason = preview?.reason;
    const knownMessages = {
      CLIMATE_CALCULATION_IN_PROGRESS: 'Calcul des séries historiques PVGIS en cours…',
      CLIMATE_PREVIEW_NOT_CONFIGURED: 'Le relais de calcul climatique n’est pas configuré.',
      PRODUCTION_PREVIEW_REQUIRED: 'Renseignez et calculez la production estimée avant le calcul climatique.',
      COORDINATES_MISSING: 'Coordonnées du projet indisponibles : calcul climatique non réalisé.',
      INSUFFICIENT_COMPLETE_YEARS_FOR_CLIMATE_VARIABILITY: 'Moins de deux années historiques complètes : variabilité climatique et Climate Pxx restent UNKNOWN.'
    };
    if (preview?.status !== 'READY') {
      if (results) results.hidden = true;
      if (status) status.textContent = knownMessages[reason] || (reason && !/^[A-Z0-9_]+$/.test(reason) ? reason : 'Données historiques insuffisantes ou indisponibles ; Climate P50/P90 restent UNKNOWN.');
      return;
    }

    const annual = Array.isArray(preview.annual_yield_by_year) ? preview.annual_yield_by_year : [];
    const climate = [preview.climateP50Kwh, preview.climateP75Kwh, preview.climateP90Kwh];
    if (annual.length < 2 || climate.some((value) => !Number.isFinite(Number(value)))) {
      renderClimateYieldPreview({ status: 'UNKNOWN', reason: 'INSUFFICIENT_COMPLETE_YEARS_FOR_CLIMATE_VARIABILITY' });
      return;
    }
    const fmt = (value) => `${Math.round(Number(value)).toLocaleString('fr-FR')} kWh/an`;
    const set = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = value; };
    set('climateP50Value', fmt(preview.climateP50Kwh));
    set('climateP75Value', fmt(preview.climateP75Kwh));
    set('climateP90Value', fmt(preview.climateP90Kwh));
    set('climateYearCount', `${annual.length} ans`);
    const cv = preview.coefficientOfVariationPercent == null ? 'UNKNOWN' : `${Number(preview.coefficientOfVariationPercent).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;
    set('climateYieldSummary', `Moyenne ${fmt(preview.meanKwh)} · écart-type annuel ${fmt(preview.standardDeviationKwh)} · coefficient de variation ${cv} · minimum ${fmt(preview.minimumKwh)} · maximum ${fmt(preview.maximumKwh)}.`);

    const chart = document.getElementById('climateHistoryChart');
    if (chart) {
      const width = 860;
      const height = 200;
      const left = 48;
      const right = 12;
      const top = 16;
      const bottom = 34;
      const plotWidth = width - left - right;
      const plotHeight = height - top - bottom;
      const values = annual.map((item) => Number(item.production_kwh));
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = Math.max(max - min, Math.abs(max) * 0.04, 1);
      const y = (value) => top + ((max - value) / range) * plotHeight;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      const grid = document.createElementNS(svg.namespaceURI, 'g');
      grid.setAttribute('class', 'climateHistoryAxis');
      const gridLine = document.createElementNS(svg.namespaceURI, 'line');
      gridLine.setAttribute('x1', String(left));
      gridLine.setAttribute('x2', String(width - right));
      gridLine.setAttribute('y1', String(height - bottom));
      gridLine.setAttribute('y2', String(height - bottom));
      gridLine.setAttribute('stroke', '#dce9e0');
      grid.appendChild(gridLine);
      const bars = document.createElementNS(svg.namespaceURI, 'g');
      bars.setAttribute('class', 'climateHistoryBars');
      const slot = plotWidth / annual.length;
      annual.forEach((item, index) => {
        const bar = document.createElementNS(svg.namespaceURI, 'rect');
        const value = Number(item.production_kwh);
        const barY = y(value);
        const barWidth = Math.max(4, slot * 0.58);
        const x = left + slot * index + (slot - barWidth) / 2;
        bar.setAttribute('x', String(x));
        bar.setAttribute('y', String(barY));
        bar.setAttribute('width', String(barWidth));
        bar.setAttribute('height', String(Math.max(2, height - bottom - barY)));
        bar.setAttribute('rx', '2');
        bar.setAttribute('tabindex', '0');
        bar.setAttribute('aria-label', `${item.year} · ${fmt(value)}`);
        const titleNode = document.createElementNS(svg.namespaceURI, 'title');
        titleNode.textContent = `${item.year} · ${fmt(value)}`;
        bar.appendChild(titleNode);
        bars.appendChild(bar);
        if (index % Math.max(1, Math.ceil(annual.length / 10)) === 0 || index === annual.length - 1) {
          const year = document.createElementNS(svg.namespaceURI, 'text');
          year.setAttribute('x', String(left + slot * index + slot / 2));
          year.setAttribute('y', String(height - 10));
          year.setAttribute('text-anchor', 'middle');
          year.textContent = String(item.year);
          grid.appendChild(year);
        }
      });
      const guides = document.createElementNS(svg.namespaceURI, 'g');
      guides.setAttribute('class', 'climateHistoryGuides');
      [[preview.climateP50Kwh, 'climateP50'], [preview.climateP90Kwh, 'climateP90']].forEach(([value, className]) => {
        const line = document.createElementNS(svg.namespaceURI, 'line');
        line.setAttribute('class', className);
        line.setAttribute('x1', String(left));
        line.setAttribute('x2', String(width - right));
        line.setAttribute('y1', String(y(Number(value))));
        line.setAttribute('y2', String(y(Number(value))));
        guides.appendChild(line);
      });
      svg.append(grid, bars, guides);
      chart.replaceChildren(svg);
      chart.setAttribute('aria-label', `Production annuelle PVGIS de ${annual[0].year} à ${annual.at(-1).year}, avec repères Climate P50 médiane et P90 historique.`);
    }

    const meta = preview.metadata || {};
    const period = meta.calculation_period;
    set('climateYieldSource', `${meta.source || 'Source PVGIS historique'} · ${period?.first_year ?? 'période inconnue'}–${period?.last_year ?? 'inconnue'} · méthode ${preview.method || 'non renseignée'} · Climate P90 = quantile empirique bas (10e percentile).`);
    if (status) status.textContent = preview.canonical === false ? 'Aperçu Climate calculé · non canonique, non enregistré au dossier et non utilisé dans les scénarios financiers.' : 'Calcul Climate disponible.';
    if (results) results.hidden = false;
  }

  function setTooltipPosition(target, tooltip) {
    const chart = target.closest('.productionCurve');
    if (!chart || !tooltip) return;
    const targetRect = target.getBoundingClientRect();
    const chartRect = chart.getBoundingClientRect();
    const halfWidth = tooltip.offsetWidth / 2;
    const center = targetRect.left + targetRect.width / 2 - chartRect.left;
    tooltip.style.left = `${Math.max(halfWidth + 8, Math.min(chartRect.width - halfWidth - 8, center))}px`;
    tooltip.style.top = `${Math.max(8, targetRect.top - chartRect.top - 4)}px`;
  }

  function bindChartTooltip(target) {
    const tooltip = document.getElementById('curveTooltip');
    if (!tooltip || target.dataset.tooltipBound === 'true') return;
    target.dataset.tooltipBound = 'true';
    const show = () => {
      tooltip.textContent = target.getAttribute('aria-label') || target.getAttribute('title') || `${target.dataset.month || ''} · Estimation PVGIS ${target.dataset.estimate || '—'} kWh`;
      tooltip.style.display = 'block';
      setTooltipPosition(target, tooltip);
    };
    const hide = () => {
      if (document.activeElement !== target) tooltip.style.display = 'none';
    };
    target.addEventListener('mouseenter', show);
    target.addEventListener('focus', show);
    target.addEventListener('mouseleave', hide);
    target.addEventListener('blur', () => { tooltip.style.display = 'none'; });
  }

  function update() {
    const source = document.getElementById('dashPerformance');
    const output = document.getElementById('studyYield');
    if (source && output) output.textContent = source.textContent.includes('PVGIS') ? source.textContent.split('·')[0].trim() : 'À calculer';
    const original = [...document.querySelectorAll('.bars i')];
    document.querySelectorAll('.monthlyProfile i').forEach((bar, index) => {
      const height = original[index]?.style.height || '12%';
      bar.style.height = height;
      bar.title = original[index]?.title || `${months[index]} : profil à calculer`;
    });
  }

  function enhanceCommercialPreAnalysis(card) {
    const badge = card.querySelector('.pill');
    const title = card.querySelector('.sectionTitle h2');
    const hint = card.querySelector('.hint');
    const legend = card.querySelector('.curveLegend');
    if (badge) badge.textContent = 'APERÇU · NON CANONIQUE';
    if (title) title.textContent = 'Profil mensuel et références';
    if (hint) hint.textContent = 'Estimation indicative issue de PVGIS pour explorer le projet. Elle ne remplace pas un résultat énergétique canonique.';
    card.querySelectorAll('p.fine').forEach((paragraph) => {
      if (paragraph.textContent.trim() === 'Le profil sera recalibré avec les coordonnées, l’orientation, la pente et l’ombrage.') paragraph.remove();
    });

    card.querySelectorAll('.metric').forEach((metric) => {
      const labelNode = metric.querySelector('b, small');
      const label = labelNode?.textContent?.trim();
      if (label === 'Qualité de donnée' || /^P50(?: statistique)?$|^P90$/i.test(label || '')) {
        metric.remove();
        return;
      }
      if (label === 'Rendement moyen') labelNode.textContent = 'Rendement spécifique estimé';
      if (label === 'Production annuelle moyenne') labelNode.textContent = 'Production annuelle estimée';
    });

    const unit = document.getElementById('productionUnit');
    if (unit) unit.textContent = 'Production mensuelle estimée du site · kWh/mois. Le rendement spécifique, exprimé en kWh/kWc/an, est l’indicateur à comparer entre installations.';
    const status = document.getElementById('studyStatus');
    if (status) status.innerHTML = '<b>Statut :</b> estimation PVGIS indicative, calculée selon les paramètres de pré-analyse.';
    installClimateYieldPanel(card);
    if (window.SOLARSHIFT_CONFIG?.climateYieldPreview) renderClimateYieldPreview(window.SOLARSHIFT_CONFIG.climateYieldPreview);

    card.querySelectorAll('.curveLegend .legendP90').forEach((item) => item.closest('span')?.remove());
    const referenceLegend = card.querySelector('.curveLegend .legendP50')?.closest('span');
    referenceLegend?.remove();
    if (legend && !card.querySelector('.legendProductionBars')) {
      const barsLegend = document.createElement('span');
      const swatch = document.createElement('i');
      swatch.className = 'legendProductionBars';
      barsLegend.append(swatch, document.createTextNode('Production PVGIS estimée'));
      legend.prepend(barsLegend);
    }
    card.querySelector('#profileP90')?.setAttribute('display', 'none');

    const svg = card.querySelector('#productionSvg');
    if (svg && !card.querySelector('#profileConsumptionBars')) {
      const loadBars = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      loadBars.id = 'profileConsumptionBars';
      loadBars.setAttribute('aria-label', 'Consommation mensuelle de référence');
      svg.insertBefore(loadBars, card.querySelector('#profileP90'));
    }
    const pointsGroup = card.querySelector('#profilePoints');
    if (svg && !card.querySelector('#profileConsumption')) {
      const consumptionLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      consumptionLine.id = 'profileConsumption';
      consumptionLine.setAttribute('aria-label', 'Consommation moyenne mensuelle indicative, calculée par consommation annuelle divisée par douze');
      pointsGroup ? svg.insertBefore(consumptionLine, pointsGroup) : svg.appendChild(consumptionLine);
    }
    if (legend && !card.querySelector('#consumptionGuideLegend')) {
      const guide = document.createElement('span');
      guide.id = 'consumptionGuideLegend';
      guide.hidden = true;
      const swatch = document.createElement('i');
      swatch.className = 'legendConsumption';
      guide.append(swatch, document.createTextNode('Consommation moyenne indicative · annuel ÷ 12'));
      legend.appendChild(guide);
    }
    if (legend && !card.querySelector('#consumptionReferenceNote')) {
      const note = document.createElement('p');
      note.id = 'consumptionReferenceNote';
      note.className = 'fine consumptionReferenceNote';
      note.textContent = 'Les courbes comparent la production mensuelle PVGIS et la répartition saisonnière du profil synthétique Enedis sélectionné. Ce profil est un repère fictif, pas la consommation mesurée du site ; le surplus revendable nécessite un matching aux mêmes pas de temps.';
      legend.insertAdjacentElement('afterend', note);
    }
    if (legend && !card.querySelector('#monthlySurplusHint')) {
      const surplus = document.createElement('p');
      surplus.id = 'monthlySurplusHint';
      surplus.className = 'fine monthlySurplusHint';
      surplus.hidden = true;
      legend.insertAdjacentElement('afterend', surplus);
    }
    const climatePanel = card.querySelector('#climateYieldPanel');
    const monthlyProfileEnd = card.querySelector('#consumptionReferenceNote') || legend;
    if (climatePanel && monthlyProfileEnd && monthlyProfileEnd.nextElementSibling !== climatePanel) {
      monthlyProfileEnd.insertAdjacentElement('afterend', climatePanel);
    }
    if (!card.querySelector('#productionConsumptionPanel')) {
      const panel = document.createElement('div');
      panel.id = 'productionConsumptionPanel';
      panel.className = 'productionConsumptionPanel';
      const chartHeading = [...card.querySelectorAll('h3')].find((node) => /profil mensuel/i.test(node.textContent || ''));
      const insertionPoint = chartHeading || card.querySelector('.curveLegend') || card.querySelector('#productionUnit, .monthlyProfile');
      if (insertionPoint) insertionPoint.insertAdjacentElement(chartHeading ? 'beforebegin' : 'afterend', panel);
      else card.appendChild(panel);
    }
    const panel = card.querySelector('#productionConsumptionPanel');
    const chartHeading = [...card.querySelectorAll('h3')].find((node) => /profil mensuel/i.test(node.textContent || ''));
    if (panel && chartHeading && panel.nextElementSibling !== chartHeading) chartHeading.insertAdjacentElement('beforebegin', panel);
    const consumptionReference = document.getElementById('consumptionReferenceGroup');
    if (panel && consumptionReference && consumptionReference.parentElement !== panel) {
      consumptionReference.removeAttribute('hidden');
      panel.appendChild(consumptionReference);
    }

    const points = document.getElementById('profilePoints');
    const tooltip = document.getElementById('curveTooltip');
    if (!points || !tooltip) return;
    points.querySelectorAll('circle').forEach(bindChartTooltip);
    document.getElementById('profileBars')?.querySelectorAll('rect').forEach(bindChartTooltip);
    const observeTargets = (node) => {
      if (node.matches?.('circle, rect')) bindChartTooltip(node);
      node.querySelectorAll?.('circle, rect').forEach(bindChartTooltip);
    };
    new MutationObserver((changes) => changes.forEach((change) => change.addedNodes.forEach(observeTargets)))
      .observe(card.querySelector('#profilePoints')?.parentElement || points.parentElement, { childList: true, subtree: true });
  }

  function observePreviewStatus() {
    function clearUnavailablePreview() {
      ['profileBars', 'profileConsumptionBars', 'profilePoints'].forEach((id) => {
        document.getElementById(id)?.replaceChildren();
      });
      ['profileP50', 'profileConsumption', 'profileP90'].forEach((id) => {
        document.getElementById(id)?.setAttribute('points', '');
      });
      document.getElementById('productionScale')?.querySelectorAll('text').forEach((label) => { label.textContent = '—'; });
      const guide = document.getElementById('consumptionGuideLegend');
      if (guide) guide.hidden = true;
      const monthlySurplus = document.getElementById('monthlySurplusHint');
      if (monthlySurplus) {
        monthlySurplus.hidden = true;
        monthlySurplus.textContent = '';
      }
      const comparisonNote = document.getElementById('consumptionReferenceNote');
      if (comparisonNote) comparisonNote.textContent = 'La comparaison mensuelle sera disponible après un calcul PVGIS réussi.';
      const yieldNode = document.getElementById('studyYield');
      if (yieldNode) yieldNode.textContent = 'UNKNOWN';
      const annualNode = document.getElementById('studyAnnual');
      if (annualNode) annualNode.textContent = 'UNKNOWN';
    }

    window.addEventListener('ozeno:climate-yield-preview', (event) => renderClimateYieldPreview(event.detail || {}));
    window.addEventListener('ozeno:commercial-production-preview', (event) => {
      const preview = event.detail || {};
      latestProductionPreview = preview;
      const monthly = preview.monthlyKwh;
      const valid = preview.status === 'READY' && Array.isArray(monthly) && monthly.length === 12 && monthly.every((value) => Number.isFinite(Number(value)) && Number(value) >= 0);
      const bars = document.getElementById('profileBars');
      const loadBars = document.getElementById('profileConsumptionBars');
      const line = document.getElementById('profileP50');
      const points = document.getElementById('profilePoints');
      const scale = document.getElementById('productionScale');
      const svg = document.getElementById('productionSvg');
      const status = document.getElementById('studyStatus');
      if (!bars || !loadBars || !line || !points || !scale || !svg) return;
      if (!valid && preview.reason === 'PVGIS_CALCULATION_IN_PROGRESS') {
        if (status) status.textContent = 'Calcul PVGIS en cours… le dernier profil disponible reste affiché.';
        return;
      }
      clearUnavailablePreview();
      let monthLabels = document.getElementById('profileMonths');
      if (!monthLabels) {
        monthLabels = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        monthLabels.id = 'profileMonths';
        monthLabels.setAttribute('class', 'curveAxis');
        svg.appendChild(monthLabels);
      }
      monthLabels.replaceChildren(...months.map((month, index) => {
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', String(160 + index * (520 / 11)));
        label.setAttribute('y', '243');
        label.setAttribute('text-anchor', 'middle');
        label.textContent = month;
        return label;
      }));
      if (!valid) {
        if (status) status.textContent = 'Le profil mensuel s’affichera après la saisie ou le tracé d’une surface, ses paramètres et un calcul PVGIS réussi.';
        return;
      }
      const values = monthly.map(Number);
      scale.querySelectorAll('text').forEach((label) => label.setAttribute('x', '126'));
      svg.querySelectorAll('.curveGrid line').forEach((gridline) => gridline.setAttribute('x1', '148'));
      const annualConsumption = window.SolarShiftConsumptionReference?.getAnnualKwh?.() ?? null;
      const averageConsumption = Number.isFinite(annualConsumption) && annualConsumption > 0 ? annualConsumption / 12 : null;
      const loadProfile = window.SOLARSHIFT_SYNTHETIC_LOAD_PROFILE;
      const syntheticMonthly = Array(12).fill(0);
      const monthFormatter = new Intl.DateTimeFormat('en-CA', { month: 'numeric', timeZone: 'Europe/Paris' });
      if (Array.isArray(loadProfile?.points)) loadProfile.points.forEach((point) => {
        const instantValue = point.intervalStart ?? point.start;
        const instant = typeof instantValue === 'number' ? instantValue : Date.parse(instantValue || '');
        const energy = Number(point.kwh ?? point.valueKwh ?? point.value);
        if (!Number.isFinite(instant) || !Number.isFinite(energy) || energy < 0) return;
        const month = Number(monthFormatter.format(new Date(instant))) - 1;
        if (month >= 0 && month < 12) syntheticMonthly[month] += energy;
      });
      const hasSyntheticMonthly = syntheticMonthly.some((value) => value > 0);
      const displayedLoad = hasSyntheticMonthly ? syntheticMonthly : null;
      const max = Math.max(...values, ...(displayedLoad || []), averageConsumption || 0, 1);
      scale.querySelectorAll('text').forEach((label, index) => {
        label.textContent = `${Math.round(max * (4 - index) / 4).toLocaleString('fr-FR')} kWh`;
      });
      const x = (index) => 160 + index * (520 / 11);
      const y = (value) => 220 - (value / max) * 190;
      values.forEach((value, index) => {
        const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bar.setAttribute('x', String(x(index) - 20));
        bar.setAttribute('y', String(y(value)));
        bar.setAttribute('width', '18');
        bar.setAttribute('height', String(220 - y(value)));
        bar.setAttribute('rx', '4');
        bar.setAttribute('class', 'profileBar');
        bar.dataset.month = months[index];
        bar.dataset.estimate = String(Math.round(value).toLocaleString('fr-FR'));
        bar.setAttribute('tabindex', '0');
        bar.setAttribute('aria-label', `${months[index]} · Estimation PVGIS ${bar.dataset.estimate} kWh`);
        bar.setAttribute('title', `${months[index]} · Estimation PVGIS ${bar.dataset.estimate} kWh`);
        bars.appendChild(bar);
        bindChartTooltip(bar);
        if (displayedLoad || averageConsumption != null) {
          const loadValue = displayedLoad ? displayedLoad[index] : averageConsumption;
          const loadBar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          loadBar.setAttribute('x', String(x(index) + 2));
          loadBar.setAttribute('y', String(y(loadValue)));
          loadBar.setAttribute('width', '18');
          loadBar.setAttribute('height', String(220 - y(loadValue)));
          loadBar.setAttribute('rx', '3');
          loadBar.setAttribute('class', 'profileConsumptionBar');
          loadBar.dataset.month = months[index];
          loadBar.dataset.estimate = String(Math.round(loadValue).toLocaleString('fr-FR'));
          loadBar.setAttribute('tabindex', '0');
          const loadDescription = displayedLoad
            ? `Profil Enedis synthétique ${loadProfile.id}`
            : 'Repère moyen de consommation annuelle divisée par douze';
          loadBar.setAttribute('aria-label', `${months[index]} · ${loadDescription} · ${loadBar.dataset.estimate} kWh`);
          loadBar.setAttribute('title', `${months[index]} · ${loadDescription} · ${loadBar.dataset.estimate} kWh`);
          loadBars.appendChild(loadBar);
          bindChartTooltip(loadBar);
        }
      });
      line.setAttribute('points', '');
      const consumptionLine = document.getElementById('profileConsumption');
      const consumptionLegend = document.getElementById('consumptionGuideLegend');
      consumptionLine?.classList.toggle('isSyntheticProfile', Boolean(displayedLoad));
      consumptionLegend?.querySelector('.legendConsumption')?.classList.toggle('isSyntheticProfile', Boolean(displayedLoad));
      if (consumptionLegend) {
        consumptionLegend.hidden = !displayedLoad && averageConsumption == null;
        if (displayedLoad) {
          consumptionLegend.lastChild.textContent = `Profil Enedis synthétique ${loadProfile.id} · répartition mensuelle`;
        } else if (averageConsumption != null) {
          const source = document.getElementById('cons')?.dataset.referenceSource || 'consommation renseignée';
          consumptionLegend.lastChild.textContent = `${source} · repère moyen ${Math.round(averageConsumption).toLocaleString('fr-FR')} kWh/mois (annuel ÷ 12)`;
        }
      }
      const comparisonNote = document.getElementById('consumptionReferenceNote');
      if (comparisonNote) comparisonNote.textContent = displayedLoad
        ? 'Les barres groupées comparent production PVGIS et profil de consommation synthétique, mois par mois. Le profil Enedis est fictif : il ne représente ni le compteur ni la consommation vérifiée de ce site.'
        : 'Les barres violettes sont un simple repère moyen (consommation annuelle ÷ 12), pas un profil réel. Les barres groupées ne démontrent pas le surplus revendable ni la coïncidence ACI/ACC.';
      const monthlySurplus = document.getElementById('monthlySurplusHint');
      if (monthlySurplus) {
        if (displayedLoad) {
          const monthlyGaps = values.map((production, index) => Math.max(0, production - displayedLoad[index]));
          const indicativeExcess = monthlyGaps.reduce((total, value) => total + value, 0);
          const contributingMonths = months.filter((_, index) => monthlyGaps[index] > 0).join(', ');
          monthlySurplus.hidden = false;
          monthlySurplus.innerHTML = `<b>Somme annuelle des écarts mensuels positifs : ${Math.round(indicativeExcess).toLocaleString('fr-FR')} kWh/an.</b> Les mois où la production mensuelle estimée dépasse le profil chargé sont : ${contributingMonths || 'aucun'}. Ce total compare 12 mois agrégés ; il ne prouve pas que l’énergie est disponible à chaque heure ni qu’elle est vendue. La répartition financière affichée séparément est un solde annuel théorique (production − plafond annuel ACI), pas ce cumul mensuel. Le volume revendable réel exige un matching temporel ; le stockage n’est pas modélisé ici.`;
        } else {
          monthlySurplus.hidden = true;
          monthlySurplus.textContent = '';
        }
      }
      const specificYield = Number(preview.specificYieldKwhKwp);
      const yieldNode = document.getElementById('studyYield');
      if (yieldNode) yieldNode.textContent = Number.isFinite(specificYield) ? `${Math.round(specificYield).toLocaleString('fr-FR')} kWh/kWc/an` : 'UNKNOWN';
      const annualNode = document.getElementById('studyAnnual');
      const annual = Number(preview.annualKwh);
      if (annualNode) annualNode.textContent = Number.isFinite(annual) && annual > 0 ? `${Math.round(annual).toLocaleString('fr-FR')} kWh/an` : 'UNKNOWN';
      const capacityNode = document.getElementById('studyCapacity');
      const capacity = Number(preview.installedCapacityKwp);
      if (capacityNode) capacityNode.textContent = Number.isFinite(capacity) && capacity > 0 ? `${capacity.toLocaleString('fr-FR')} kWc` : 'À dimensionner';
      const unit = document.getElementById('productionUnit');
      if (unit) unit.textContent = 'Production mensuelle estimée du site · kWh/mois, calculée par PVGIS selon les surfaces, orientations, inclinaisons et ombrages saisis.';
      if (status) status.textContent = 'Profil mensuel calculé par PVGIS · aperçu commercial non canonique, à confirmer par étude.';
    });
    window.addEventListener('ozeno:pvgis-preview-status', (event) => {
      const message = event.detail?.message;
      if (!message) return;
      const status = document.getElementById('studyStatus');
      if (status) status.textContent = message;
      if (/en cours/i.test(message)) return;
      clearUnavailablePreview();
    });
    window.addEventListener('ozeno:consumption-reference', () => {
      if (latestProductionPreview) window.dispatchEvent(new CustomEvent('ozeno:commercial-production-preview', { detail: latestProductionPreview }));
    });
    window.addEventListener('ozeno:synthetic-load-profile', () => {
      if (latestProductionPreview) window.dispatchEvent(new CustomEvent('ozeno:commercial-production-preview', { detail: latestProductionPreview }));
    });
  }

  function boot() {
    observePreviewStatus();
    const existing = document.querySelector('.productionStudy');
    if (existing) {
      addStyles();
      enhanceCommercialPreAnalysis(existing);
      return;
    }
    const anchor = section();
    if (!anchor) return;
    addStyles();
    const card = document.createElement('section');
    card.className = 'card productionStudy';
    card.id = 'audit-production';
    card.innerHTML = `<div class="sectionTitle"><h2>Profil mensuel et références</h2><span class="pill">APERÇU · NON CANONIQUE</span></div><p class="hint">Profil mensuel estimatif PVGIS · le rendement spécifique est exprimé en kWh/kWc/an.</p><div class="metrics"><div class="metric"><b>Rendement spécifique estimé</b><span id="studyYield">À calculer</span><small>kWh/kWc/an · PVGIS</small></div></div><div id="productionConsumptionPanel" class="productionConsumptionPanel"></div><h3>Profil mensuel estimé</h3><div class="monthlyProfile" aria-label="Profil mensuel estimatif PVGIS">${barsMarkup()}</div><p class="fine">Survolez une barre pour afficher la valeur mensuelle estimée. Le profil dépend des paramètres de pré-analyse.</p><div class="status"><b>Statut :</b> estimation PVGIS indicative, calculée selon les paramètres de pré-analyse.</div>`;
    anchor.insertAdjacentElement('afterend', card);
    enhanceCommercialPreAnalysis(card);
    update();
    ['orientation', 'tilt', 'shade'].forEach((id) => document.getElementById(id)?.addEventListener('change', () => setTimeout(update, 100)));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());

['installer-commission.js', 'installation-cost-reference.js', 'roof-surfaces.js', 'annual-allocation.js', 'financial-assumptions.js', 'equity-cashflow.js', 'finance-controls.js', 'summary-ux.js', 'risk-ux.js', 'commercial-ux.js', 'efficiency-impact-ux.js', 'ozeno-theme.js', 'prestudy-chapters.js', 'prestudy-shell.js', 'project-hub.js'].forEach((file) => {
  const script = document.createElement('script');
  script.src = `./${file}`;
  script.async = false;
  document.head.appendChild(script);
});
