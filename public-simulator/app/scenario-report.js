(function () {
  'use strict';
  const config = window.SOLARSHIFT_CONFIG || {};
  const endpoint = config.frozenScenarioReportEndpoint || `${config.supabaseUrl}/functions/v1/frozen-scenario-report`;
  const sessionKey = config.sessionStorageKey || 'ozeno-supabase-session';
  const query = new URLSearchParams(location.search);
  const reportId = query.get('id');
  const $ = (id) => document.getElementById(id);
  let reportRecord = null;
  const labels = {
    'project.name': 'Projet', 'project.site': 'Site', 'scenario.name': 'Scénario', 'scenario.viewpoint': 'Point de vue financier',
    'technical.configuration': 'Configuration technique', 'technical.capacity_kwp': 'Capacité photovoltaïque',
    'energy.production.annual': 'Production annuelle', 'energy.load.annual': 'Consommation annuelle',
    'energy.modelled_p50': 'P50 modélisé', 'energy.modelled_p90': 'P90 modélisé', 'energy.climate_p50': 'Production historique médiane (P50)', 'energy.climate_p75': 'Production historique prudente (P75)', 'energy.climate_p90': 'Production historique basse (P90)',
    'capex.total': 'CAPEX estimé', 'opex.annual': 'OPEX confirmé', 'opex.assumption.annual': 'OPEX hypothèse intégré au calcul du TRI', 'financial.run': 'Simulation financière enregistrée',
    'financial.irr_or_not_applicable': 'TRI', 'financial.npv_or_not_applicable': 'VAN', 'financial.payback_or_not_applicable': 'Temps de retour',
    'financial.owner_savings_year_1': 'Économies propriétaire · année 1', 'financial.project_revenue_year_1': 'Recettes projet · année 1',
    'financial.project_opex_year_1': 'OPEX projet · année 1', 'actors.snapshot': 'Parties prenantes confirmées', 'data.cutoff': 'Rapport généré le',
    'technical.solar_areas': 'Surface solaire confirmée', 'risk.score': 'Score de risque', 'resilience.score': 'Indicateur de résilience', 'contracts.status': 'État des contrats',
    'scenario.canonical': 'Scénario de référence', 'scenario.freeze': 'Instantané du scénario', 'scenario.validation': 'Validation du scénario'
  };
  const preliminaryInternalFields = new Set(['scenario.canonical', 'scenario.freeze', 'scenario.validation', 'financial.run', 'actors.snapshot', 'risk.score', 'resilience.score', 'contracts.status', 'data.cutoff', 'energy.modelled_p50', 'energy.modelled_p90']);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const session = () => { try { return JSON.parse(localStorage.getItem(sessionKey) || 'null'); } catch { return null; } };
  function setMessage(message, tone = '') { $('reportStatus').textContent = message; $('reportStatus').className = `loading status ${tone}`; }
  function val(fact) {
    if (fact.status === 'UNKNOWN') return 'Non disponible';
    if (fact.status === 'STALE') return 'Périmé';
    if (fact.status === 'NOT_APPLICABLE') return 'Non applicable';
    const value = fact.value && typeof fact.value === 'object' ? JSON.stringify(fact.value) : String(fact.value ?? '');
    return `${value}${fact.unit ? ` ${fact.unit}` : ''}`;
  }
  function card(fact, preliminary = false) {
    const source = [fact.source_type, fact.source_reference, fact.calculation_method, fact.engine_version].filter(Boolean).join(' · ');
    const reason = fact.status === 'UNKNOWN' ? fact.unknown_reason : fact.status === 'STALE' ? fact.stale_reason : '';
    const statusLabel = preliminary ? ({ ASSUMPTION: 'Hypothèse', UNKNOWN: 'À confirmer', STALE: 'À actualiser', VERIFIED: 'Vérifié' })[fact.status] || fact.status : fact.status;
    const plainReason = preliminary && fact.status === 'UNKNOWN' ? 'À renseigner lorsque les justificatifs et données de l’étude seront disponibles.' : reason;
    const plainSource = preliminary && fact.status === 'ASSUMPTION'
      ? fact.field_code?.startsWith('energy.climate_') ? 'Calcul indicatif fondé sur l’historique climatique PVGIS.' : 'Valeur issue de l’étude préalable.'
      : source;
    return `<article class="fact" data-field-code="${esc(fact.field_code)}" data-status="${esc(fact.status)}"><span class="fact-label">${esc(fact.label || labels[fact.field_code] || fact.field_code)}</span><strong>${esc(val(fact))}</strong><span class="fact-status">${esc(statusLabel)}</span>${plainReason ? `<small>${esc(plainReason)}</small>` : ''}${plainSource ? `<small class="provenance">${esc(plainSource)}</small>` : ''}</article>`;
  }
  function factsFor(payload, section, preliminary = false) {
    const facts = (payload.facts || []).filter((fact) => fact.section === section && !(preliminary && preliminaryInternalFields.has(fact.field_code)) && !(preliminary && section === 'risks' && /risque documente|facteurs verifies/i.test(fact.label || '')));
    return facts.map(fact => card(fact, preliminary)).join('') || '<p class="small">Aucune donnée renseignée à ce stade.</p>';
  }
  function renderSummaryOverview(payload, preliminary) {
    const facts = payload.facts || [];
    const findFact = codes => facts.find(fact => codes.includes(fact.field_code));
    const statusName = status => preliminary
      ? ({ ASSUMPTION: 'Hypothèse', UNKNOWN: 'À confirmer', STALE: 'À actualiser', VERIFIED: 'Vérifié' })[status] || status
      : status;
    const definitions = [
      { label: 'Production attendue', codes: ['energy.production.annual'] },
      { label: 'Climate P50', codes: ['energy.climate_p50'] },
      { label: 'P90 modélisé', codes: ['energy.modelled_p90'] },
      { label: preliminary ? 'TRI fonds propres · avant impôts' : 'TRI annuel', codes: ['financial.irr', 'financial.irr_or_not_applicable'] },
      { label: 'CAPEX global', codes: ['capex.total'] }
    ];
    const kpis = $('reportSummaryKpis');
    if (kpis) definitions.forEach(definition => {
      const fact = findFact(definition.codes) || { field_code: definition.codes[0], value: null, unit: '', status: 'UNKNOWN' };
      const tile = document.createElement('article');
      tile.className = 'summaryKpi'; tile.dataset.status = fact.status;
      const label = document.createElement('span'); label.className = 'summaryKpiLabel'; label.textContent = definition.label;
      const value = document.createElement('strong'); value.textContent = val(fact);
      const status = document.createElement('small'); status.className = 'summaryKpiStatus'; status.textContent = statusName(fact.status);
      tile.append(label, value, status); kpis.appendChild(tile);
    });
    const chart = $('reportSummaryClimate');
    const climateWorked = appendClimateBenchmarkChart(chart, payload.visuals?.production, payload.visuals?.climate)
      || appendClimateChart(chart, payload.visuals?.climate);
    if (!climateWorked && chart) {
      const empty = document.createElement('p'); empty.className = 'summaryUnknown';
      empty.textContent = 'Historique annuel ou repères climatiques non disponibles dans les données de ce rapport.';
      chart.replaceChildren(empty);
    }
    const list = $('reportSummaryFacts');
    if (!list) return;
    const listCodes = [
      'energy.load.annual', 'energy.specific_yield', 'technical.capacity_kwp', 'technical.configuration',
      'financial.project_revenue_year_1', 'financial.owner_savings_year_1', 'opex.assumption.annual', 'opex.annual',
      'financial.npv_or_not_applicable', 'financial.payback_or_not_applicable'
    ];
    const rows = facts.filter(fact => listCodes.includes(fact.field_code));
    if (!rows.length) {
      const empty = document.createElement('p'); empty.className = 'summaryUnknown';
      empty.textContent = 'Les repères complémentaires apparaîtront dès qu’ils seront présents dans le scénario.';
      list.appendChild(empty);
      return;
    }
    rows.slice(0, 8).forEach(fact => {
      const row = document.createElement('div'); row.className = 'summaryFactRow'; row.dataset.status = fact.status;
      const label = document.createElement('span'); label.textContent = labels[fact.field_code] || fact.label || fact.field_code;
      const value = document.createElement('b'); value.textContent = val(fact);
      row.append(label, value);
      if (fact.status !== 'VERIFIED') {
        const status = document.createElement('small'); status.textContent = statusName(fact.status); row.appendChild(status);
      }
      list.appendChild(row);
    });
  }
  function svgNode(name, attributes = {}, text = '') {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (text) node.textContent = text;
    return node;
  }
  function appendProductionChart(container, production) {
    const values = production?.monthlyKwh;
    if (!container || !Array.isArray(values) || values.length !== 12 || !values.every(value => Number.isFinite(value) && value >= 0)) return false;
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    const width = 900, height = 250, left = 48, right = 18, top = 16, bottom = 38;
    const averageConsumption = Number.isFinite(production.consumptionAnnualKwh) && production.consumptionAnnualKwh > 0 ? production.consumptionAnnualKwh / 12 : null;
    const max = Math.max(...values, averageConsumption || 0, 1);
    const y = value => top + (height - top - bottom) * (1 - value / max);
    const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'Profil mensuel de production solaire estimée par PVGIS' });
    svg.appendChild(svgNode('line', { x1: left, y1: height - bottom, x2: width - right, y2: height - bottom, class: 'chart-axis' }));
    const slot = (width - left - right) / 12;
    values.forEach((value, index) => {
      const barWidth = slot * .58, barX = left + slot * index + (slot - barWidth) / 2, barY = y(value);
      const bar = svgNode('rect', { x: barX, y: barY, width: barWidth, height: Math.max(2, height - bottom - barY), rx: 3, class: 'climate-bar' });
      bar.appendChild(svgNode('title', {}, `${months[index]} · ${Math.round(value).toLocaleString('fr-FR')} kWh`));
      svg.appendChild(bar);
      svg.appendChild(svgNode('text', { x: left + slot * index + slot / 2, y: height - 10, 'text-anchor': 'middle' }, months[index]));
    });
    if (averageConsumption != null) {
      const guideY = y(averageConsumption);
      svg.appendChild(svgNode('line', { x1: left, y1: guideY, x2: width - right, y2: guideY, class: 'consumption-guide' }));
      svg.appendChild(svgNode('text', { x: width - right - 3, y: guideY - 4, 'text-anchor': 'end', class: 'chart-guide-label' }, `Moyenne annuelle ÷ 12 · ${Math.round(averageConsumption).toLocaleString('fr-FR')} kWh/mois`));
    }
    container.replaceChildren(svg);
    return true;
  }
  function appendClimateChart(container, climate) {
    if (!container || !Array.isArray(climate?.annual) || climate.annual.length < 2) return false;
    const annual = climate.annual;
    const width = 900, height = 250, left = 62, right = 18, top = 16, bottom = 38;
    const values = annual.map(item => item.productionKwh);
    const guides = [climate.p50Kwh, climate.p90Kwh].filter(Number.isFinite);
    const min = Math.min(...values, ...guides), max = Math.max(...values, ...guides);
    const range = Math.max(max - min, Math.abs(max) * .04, 1);
    const y = value => top + (max - value) / range * (height - top - bottom);
    const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `Production historique annuelle PVGIS de ${annual[0].year} à ${annual.at(-1).year}, avec repères P50 et P90` });
    svg.appendChild(svgNode('line', { x1: left, y1: height - bottom, x2: width - right, y2: height - bottom, class: 'chart-axis' }));
    const slot = (width - left - right) / annual.length;
    annual.forEach((item, index) => {
      const barWidth = Math.max(4, slot * .58), barX = left + slot * index + (slot - barWidth) / 2, barY = y(item.productionKwh);
      const bar = svgNode('rect', { x: barX, y: barY, width: barWidth, height: Math.max(2, height - bottom - barY), rx: 2, class: 'climate-bar' });
      bar.appendChild(svgNode('title', {}, `${item.year} · ${Math.round(item.productionKwh).toLocaleString('fr-FR')} kWh/an`));
      svg.appendChild(bar);
      if (index % Math.max(1, Math.ceil(annual.length / 10)) === 0 || index === annual.length - 1) {
        svg.appendChild(svgNode('text', { x: left + slot * index + slot / 2, y: height - 10, 'text-anchor': 'middle' }, item.year));
      }
    });
    [[climate.p50Kwh, 'P50 · médiane', 'climate-p50'], [climate.p90Kwh, 'P90 · année basse', 'climate-p90']].forEach(([value, label, className]) => {
      if (!Number.isFinite(value)) return;
      const lineY = y(value);
      svg.appendChild(svgNode('line', { x1: left, y1: lineY, x2: width - right, y2: lineY, class: className }));
      svg.appendChild(svgNode('text', { x: width - right - 3, y: lineY - 4, 'text-anchor': 'end', class: 'chart-guide-label' }, `${label} · ${Math.round(value).toLocaleString('fr-FR')} kWh`));
    });
    container.replaceChildren(svg);
    return true;
  }
  function appendClimateBenchmarkChart(container, production, climate) {
    if (!container) return false;
    const benchmarks = [
      { label: 'Production annuelle estimée · PVGIS', value: Number(production?.annualKwh), className: 'production' },
      { label: 'Climate P50 · historique PVGIS', value: Number(climate?.p50Kwh), className: 'p50' },
      { label: 'Climate P75 · historique PVGIS', value: Number(climate?.p75Kwh), className: 'p75' },
      { label: 'Climate P90 · historique PVGIS', value: Number(climate?.p90Kwh), className: 'p90' }
    ].filter(item => Number.isFinite(item.value) && item.value > 0);
    if (benchmarks.length < 2) return false;
    const max = Math.max(...benchmarks.map(item => item.value));
    const list = document.createElement('div');
    list.className = 'reportBenchmarkList';
    list.setAttribute('role', 'list');
    benchmarks.forEach(item => {
      const row = document.createElement('div');
      row.className = 'reportBenchmarkRow';
      row.setAttribute('role', 'listitem');
      const label = document.createElement('span');
      label.className = 'reportBenchmarkLabel';
      label.textContent = item.label;
      const track = document.createElement('span');
      track.className = 'reportBenchmarkTrack';
      track.setAttribute('aria-hidden', 'true');
      const bar = document.createElement('span');
      bar.className = `reportBenchmarkBar ${item.className}`;
      bar.style.width = `${Math.max(1, item.value / max * 100)}%`;
      track.appendChild(bar);
      const value = document.createElement('b');
      value.className = 'reportBenchmarkValue';
      value.textContent = `${Math.round(item.value).toLocaleString('fr-FR')} kWh/an`;
      row.setAttribute('aria-label', `${item.label} : ${value.textContent}`);
      row.append(label, track, value);
      list.appendChild(row);
    });
    container.replaceChildren(list);
    return true;
  }
  function appendSatelliteCrop(container, satellite) {
    if (!container) return false;
    const valid = satellite && satellite.zoom >= 0 && satellite.zoom <= 19
      && satellite.columns === 4 && satellite.rows === 3
      && Array.isArray(satellite.tiles) && satellite.tiles.length === 12
      && satellite.tiles.every(tile => Number.isInteger(tile.x) && tile.x >= 0 && tile.x < 2 ** satellite.zoom
        && Number.isInteger(tile.y) && tile.y >= 0 && tile.y < 2 ** satellite.zoom
        && Number.isInteger(tile.column) && tile.column >= 0 && tile.column < satellite.columns
        && Number.isInteger(tile.row) && tile.row >= 0 && tile.row < satellite.rows)
      && Array.isArray(satellite.polygons) && satellite.polygons.length > 0
      && (satellite.panX == null || Number.isFinite(satellite.panX) && Math.abs(satellite.panX) <= 128)
      && (satellite.panY == null || Number.isFinite(satellite.panY) && Math.abs(satellite.panY) <= 128)
      && satellite.polygons.every(points => Array.isArray(points) && points.length >= 3
        && points.every(point => Array.isArray(point) && point.length >= 2
          && Number.isFinite(point[0]) && point[0] >= 0 && point[0] <= 1024
          && Number.isFinite(point[1]) && point[1] >= 0 && point[1] <= 768));
    const crop = document.createElement('div');
    crop.className = 'coverSatelliteCrop';
    if (!valid) {
      const fallback = document.createElement('p');
      fallback.className = 'coverSatelliteUnknown';
      fallback.textContent = 'Vue satellite indisponible pour ce contour. Vérifiez l’emplacement sur la carte de l’étude.';
      crop.appendChild(fallback);
      container.replaceChildren(crop);
      return false;
    }
    const scene = document.createElement('div');
    scene.className = 'coverSatelliteScene';
    const points = satellite.polygons.flat();
    const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
    const inferredPan = (values, midpoint) => Math.max(-128, Math.min(128,
      Math.round(midpoint - (Math.min(...values) + Math.max(...values)) / 2)));
    const panX = Number.isFinite(satellite.panX) ? satellite.panX : inferredPan(xs, satellite.width / 2);
    const panY = Number.isFinite(satellite.panY) ? satellite.panY : inferredPan(ys, satellite.height / 2);
    scene.style.width = `${100 / (1 - 2 * Math.abs(panX) / satellite.width)}%`;
    scene.style.setProperty('--satellite-pan-x', `${panX / (satellite.columns * 256) * 100}%`);
    scene.style.setProperty('--satellite-pan-y', `${panY / (satellite.rows * 256) * 100}%`);
    const mosaic = document.createElement('div');
    mosaic.className = 'coverSatelliteTiles';
    satellite.tiles.forEach(tile => {
      const image = document.createElement('img');
      image.alt = '';
      image.decoding = 'async';
      image.loading = 'eager';
      image.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${satellite.zoom}/${tile.y}/${tile.x}`;
      image.style.gridColumn = String(tile.column + 1);
      image.style.gridRow = String(tile.row + 1);
      image.addEventListener('error', () => {
        crop.classList.add('has-tile-errors');
        image.removeAttribute('src');
      }, { once: true });
      mosaic.appendChild(image);
    });
    const overlay = svgNode('svg', { viewBox: '0 0 1024 768', preserveAspectRatio: 'none', role: 'img', 'aria-label': 'Contours indicatifs de toiture reportés sur la vue satellite' });
    satellite.polygons.forEach(points => overlay.appendChild(svgNode('polygon', {
      points: points.map(([x, y]) => `${x},${y}`).join(' '), class: 'reportSatelliteFootprint'
    })));
    const fallback = document.createElement('span');
    fallback.className = 'coverSatelliteError';
    fallback.textContent = 'Vue satellite partiellement indisponible · schéma toiture conservé';
    scene.append(mosaic, overlay);
    crop.append(scene, fallback);
    container.replaceChildren(crop);
    return true;
  }
  function renderCoverDetails(payload, preliminary) {
    const cover = $('reportContent').querySelector('.report-page.cover');
    const meta = cover?.querySelector('.coverMeta');
    if (!cover || !meta) return;
    const intro = cover.firstElementChild;
    if (!intro) return;
    const hero = document.createElement('div');
    hero.className = 'coverHero';
    const introContent = document.createElement('div');
    introContent.className = 'coverIntro';
    introContent.append(...intro.childNodes);
    const brandLogo = document.createElement('img');
    brandLogo.className = 'reportBrandLogo';
    brandLogo.src = './ozeno-wordmark.png';
    brandLogo.alt = 'OZENO';
    introContent.prepend(brandLogo);
    const details = document.createElement('div');
    details.className = 'coverDetails';
    const contactPanel = document.createElement('section');
    contactPanel.className = 'coverPanel coverContact';
    const contactHeading = document.createElement('h2');
    contactHeading.textContent = 'Mandataire / contact du dossier';
    const contactContent = document.createElement('div');
    contactContent.className = 'coverContactContent';
    const contactFields = document.createElement('div');
    contactFields.className = 'coverContactFields';
    const representative = payload.representative || {};
    const displayName = String(representative.name || '').trim();
    const initials = (displayName || String(representative.email || '').split('@')[0] || 'M')
      .split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(part => part[0].toLocaleUpperCase('fr-FR')).join('') || 'M';
    const portrait = document.createElement('div');
    portrait.className = 'coverPortrait';
    portrait.setAttribute('role', 'img');
    portrait.setAttribute('aria-label', displayName ? `Emplacement portrait de ${displayName}` : 'Emplacement portrait du mandataire');
    const portraitInitials = document.createElement('span');
    portraitInitials.textContent = initials;
    const portraitLabel = document.createElement('small');
    portraitLabel.textContent = 'Photo';
    portrait.append(portraitInitials, portraitLabel);
    [['Nom', representative.name], ['Téléphone', representative.phone], ['E-mail', representative.email]].forEach(([labelText, valueText]) => {
      const row = document.createElement('div'); row.className = 'coverContactField';
      const label = document.createElement('span'); label.textContent = labelText;
      const value = document.createElement('b'); value.textContent = String(valueText || 'À renseigner');
      row.append(label, value); contactFields.appendChild(row);
    });
    const contactNote = document.createElement('p');
    contactNote.className = 'coverContactNote';
    contactNote.textContent = preliminary
      ? 'Coordonnées reprises du compte professionnel connecté ; les informations absentes restent à compléter.'
      : 'Les coordonnées personnelles ne sont pas incluses dans le scénario figé.';
    contactContent.append(contactFields, portrait);
    contactPanel.append(contactHeading, contactContent, contactNote);
    hero.append(introContent, contactPanel);
    const roofPanel = document.createElement('section');
    roofPanel.className = 'coverPanel coverRoof';
    const roofHeading = document.createElement('h2'); roofHeading.textContent = 'Toiture et vue du site';
    const satellite = document.createElement('div');
    satellite.className = 'coverSatelliteHost';
    const hasSatellite = appendSatelliteCrop(satellite, payload.visuals?.roof?.satellite);
    const satelliteCaption = document.createElement('p');
    satelliteCaption.className = 'roofCaption coverSatelliteCaption';
    satelliteCaption.textContent = hasSatellite
      ? 'Imagerie © Esri · vue indicative, contours à vérifier sur site.'
      : 'Vue satellite indisponible · emplacement à confirmer sur la carte de l’étude.';
    if (!hasSatellite) roofPanel.classList.add('coverRoof--no-satellite');
    roofPanel.append(roofHeading, satellite, satelliteCaption);
    details.append(roofPanel);
    intro.replaceWith(hero);
    hero.after(meta, details);
  }
  function appendRevenueChart(container, revenue) {
    const items = (revenue?.items || []).filter(item => Number.isFinite(item.value) && item.value >= 0);
    const total = items.reduce((sum, item) => sum + item.value, 0);
    if (!container || !items.length || total <= 0) return false;
    const svg = svgNode('svg', { viewBox: '0 0 900 78', role: 'img', 'aria-label': `${revenue.title} : ${Math.round(total).toLocaleString('fr-FR')} euros par an` });
    let x = 0;
    items.forEach(item => {
      if (item.value <= 0) return;
      const width = item.value / total * 900;
      const rect = svgNode('rect', { x, y: 16, width, height: 38, rx: 5, fill: item.color });
      rect.appendChild(svgNode('title', {}, `${item.label} : ${Math.round(item.value).toLocaleString('fr-FR')} €/an · ${(item.value / total * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`));
      svg.appendChild(rect);
      x += width;
    });
    const legend = document.createElement('div');
    legend.className = 'report-chart-legend';
    items.forEach(item => {
      const row = document.createElement('div');
      const swatch = document.createElement('i'); swatch.style.backgroundColor = item.color;
      const name = document.createElement('span'); name.textContent = item.label;
      const amount = document.createElement('b'); amount.textContent = `${Math.round(item.value).toLocaleString('fr-FR')} €/an · ${(item.value / total * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
      row.append(swatch, name, amount); legend.appendChild(row);
    });
    const totalLabel = document.createElement('p'); totalLabel.className = 'report-chart-total';
    totalLabel.textContent = `Total estimé · année 1 : ${Math.round(total).toLocaleString('fr-FR')} €/an`;
    container.replaceChildren(svg, legend, totalLabel);
    return true;
  }
  function appendCashflowChart(container, cashflow) {
    const values = cashflow?.cumulativeEur;
    if (!container || !Array.isArray(values) || values.length < 2 || !values.every(Number.isFinite)) return false;
    const width = 900, height = 250, left = 74, right = 20, top = 20, bottom = 38;
    const rawMin = Math.min(0, ...values), rawMax = Math.max(0, ...values), padding = Math.max(1, (rawMax - rawMin) * .08);
    const min = rawMin - padding, max = rawMax + padding;
    const x = year => left + (width - left - right) * year / (values.length - 1);
    const y = amount => top + (max - amount) / (max - min) * (height - top - bottom);
    const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `Trésorerie cumulée estimée des fonds propres avant impôts sur ${values.length - 1} ans, dette incluse` });
    [min, 0, max].forEach(amount => {
      const yy = y(amount);
      svg.appendChild(svgNode('line', { x1: left, y1: yy, x2: width - right, y2: yy, class: amount === 0 ? 'cashflow-zero' : 'chart-axis' }));
      svg.appendChild(svgNode('text', { x: left - 8, y: yy + 4, 'text-anchor': 'end' }, `${Math.round(amount).toLocaleString('fr-FR')} €`));
    });
    svg.appendChild(svgNode('polyline', { points: values.map((amount, year) => `${x(year)},${y(amount)}`).join(' '), class: 'cashflow-line' }));
    const crossing = values.findIndex((amount, year) => year > 0 && amount >= 0);
    [...new Set([0, Math.round((values.length - 1) / 2), values.length - 1])].forEach(year => {
      svg.appendChild(svgNode('text', { x: x(year), y: height - 10, 'text-anchor': year === 0 ? 'start' : year === values.length - 1 ? 'end' : 'middle' }, `Année ${year}`));
    });
    container.replaceChildren(svg);
    const explanation = document.createElement('p'); explanation.className = 'report-chart-total';
    explanation.textContent = crossing > 0
      ? `Flux cumulés des fonds propres avant impôts ; la dette et son remboursement sont intégrés. Le cumul repasse au-dessus de zéro vers l’année ${crossing}.`
      : `Flux cumulés des fonds propres avant impôts ; la dette et son remboursement sont intégrés. Le cumul reste négatif à l’horizon étudié (${values.length - 1} ans).`;
    container.appendChild(explanation);
    return true;
  }
  function appendAnnualCashflowTable(container, cashflow) {
    const rows = cashflow?.annualRows;
    if (!container || !Array.isArray(rows) || rows.length < 2 || rows.length > 101
      || rows[0].year !== 0 || rows.some((row, index) => row.year !== index
        || !Number.isFinite(row.equityCashflowEur) || !Number.isFinite(row.cumulativeEquityCashflowEur))) return false;
    const euro = value => Number.isFinite(value) ? `${Math.round(value).toLocaleString('fr-FR')} €` : 'Non disponible';
    const kwh = value => Number.isFinite(value) ? `${Math.round(value).toLocaleString('fr-FR')} kWh` : 'Non disponible';
    const price = value => Number.isFinite(value) ? `${value.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} €/kWh` : '—';
    const table = document.createElement('table'); table.className = 'financialScheduleTable';
    table.setAttribute('aria-label', `Flux annuels des fonds propres avant impôts sur ${rows.length - 1} ans`);
    const headers = ['Année', 'Production', 'Valeur moyenne', 'CA / valeur énergie', 'OPEX hypothèse', 'Service de la dette', 'Flux net fonds propres', 'Flux cumulé'];
    const thead = document.createElement('thead'), heading = document.createElement('tr');
    headers.forEach(label => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = label; heading.appendChild(th); });
    thead.appendChild(heading); table.appendChild(thead);
    const tbody = document.createElement('tbody');
    rows.forEach(row => {
      const tr = document.createElement('tr');
      const year = document.createElement('th'); year.scope = 'row'; year.textContent = row.year === 0 ? '0 · apport' : String(row.year); tr.appendChild(year);
      [kwh(row.productionKwh), price(row.weightedEnergyValueEurPerKwh), euro(row.energyValueEur)].forEach(value => { const td = document.createElement('td'); td.textContent = value; tr.appendChild(td); });
      const opex = document.createElement('td');
      opex.append(document.createTextNode(euro(row.opexEur)));
      if (row.year > 0) { const detail = document.createElement('small'); detail.textContent = `Maint. ${euro(row.maintenanceEur)} · assur. ${euro(row.insuranceEur)} · commission ${euro(row.managementCommissionEur)}${row.rentEur ? ` · loyer ${euro(row.rentEur)}` : ''}`; opex.appendChild(detail); }
      tr.appendChild(opex);
      const debt = document.createElement('td'); debt.append(document.createTextNode(euro(row.debtServiceEur)));
      if (row.year > 0 && row.debtServiceEur > 0) { const detail = document.createElement('small'); detail.textContent = `Intérêts ${euro(row.debtInterestEur)} · principal ${euro(row.debtPrincipalEur)}`; debt.appendChild(detail); }
      tr.appendChild(debt);
      [euro(row.equityCashflowEur), euro(row.cumulativeEquityCashflowEur)].forEach(value => { const td = document.createElement('td'); td.textContent = value; td.className = 'financialScheduleTotal'; tr.appendChild(td); });
      if (row.year === 0) { tr.className = 'financialScheduleInitial'; const detail = document.createElement('small'); detail.textContent = `CAPEX ${euro(row.initialCapexEur)} · commission initiale ${euro(row.initialProjectCommissionEur)} · investissement initial ${euro(row.totalInitialInvestmentEur)} · dette tirée ${euro(row.debtDrawdownEur)}`; year.appendChild(detail); }
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    const note = document.createElement('p'); note.className = 'small financialScheduleNote';
    note.textContent = 'TRI des fonds propres avant impôts : année 0 = apport initial (CAPEX + commission initiale de projet − dette tirée) ; flux annuels = revenus bruts d’exploitation moins les frais de gestion, autres OPEX et remboursements de dette. Le calcul exclut IS et IR. Les OPEX affichés ici sont des hypothèses ; l’OPEX confirmé reste à documenter.';
    container.replaceChildren(table, note); container.hidden = false;
    return true;
  }
  function markChartUnavailable(chart, message) {
    if (!chart) return;
    const heading = chart.previousElementSibling;
    if (heading?.tagName === 'H3') heading.hidden = true;
    const note = document.createElement('p');
    note.className = 'small';
    note.textContent = message;
    chart.after(note);
  }
  function appendMatchingEnergyChart(container, matching) {
    const rows = matching?.monthlyScenarios || [];
    const chosen = rows.find(row => row.scenarioId === matching.referenceScenarioId) || (rows.length === 1 ? rows[0] : null);
    const monthly = chosen?.monthly;
    if (!container || !Array.isArray(monthly) || monthly.length !== 12 || new Set(monthly.map(row => row.year)).size !== 1
      || monthly.some(row => !Number.isFinite(row.productionKwh) || !Number.isFinite(row.totalLoadKwh))) return false;
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    const width = 900, height = 270, left = 48, right = 18, top = 18, bottom = 42;
    const max = Math.max(...monthly.flatMap(row => [row.productionKwh, row.totalLoadKwh]), 1);
    const chartHeight = height - top - bottom;
    const slot = (width - left - right) / 12;
    const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'Production solaire et consommation mensuelles issues du profil prospectif sélectionné' });
    svg.appendChild(svgNode('line', { x1: left, y1: height - bottom, x2: width - right, y2: height - bottom, class: 'chart-axis' }));
    monthly.forEach((row, index) => {
      [[row.productionKwh, '#59a987'], [row.totalLoadKwh, '#315d8c']].forEach(([value, color], seriesIndex) => {
        const barWidth = slot * .31, x = left + slot * index + slot * (.16 + seriesIndex * .38), barHeight = value / max * chartHeight;
        const bar = svgNode('rect', { x, y: top + chartHeight - barHeight, width: barWidth, height: Math.max(1, barHeight), rx: 2, fill: color });
        bar.appendChild(svgNode('title', {}, `${months[index]} · ${seriesIndex === 0 ? 'Production' : 'Consommation'} · ${Math.round(value).toLocaleString('fr-FR')} kWh`));
        svg.appendChild(bar);
      });
      svg.appendChild(svgNode('text', { x: left + slot * index + slot / 2, y: height - 12, 'text-anchor': 'middle' }, months[index]));
    });
    const legend = document.createElement('div'); legend.className = 'report-chart-legend';
    [['#59a987', 'Production solaire'], ['#315d8c', 'Consommation du profil sélectionné']].forEach(([color, text]) => {
      const item = document.createElement('div'); const swatch = document.createElement('i'); swatch.style.backgroundColor = color;
      const label = document.createElement('span'); label.textContent = text; item.append(swatch, label); legend.appendChild(item);
    });
    container.replaceChildren(svg, legend);
    return true;
  }
  function appendMatchingProfileProvenance(container, matching) {
    const profiles = matching?.profileProvenance;
    if (!container || !Array.isArray(profiles) || profiles.length === 0) return false;
    const sourceLabels = {
      ENEDIS_SYNTHETIC_NAF: 'Profil synthétique Enedis · NAF',
      ENEDIS_AGGREGATE_SEGMENT: 'Agrégat Enedis',
      ENEDIS_PROFILE_COEFFICIENTS: 'Coefficients de profil Enedis',
      USER_SUPPLIED_PROFILE: 'Profil fourni par le mandataire / client',
      VERIFIED_METER_PROFILE: 'Courbe de compteur validée'
    };
    const maturityLabels = {
      SYNTHETIC_PROSPECTING: 'synthétique · prospection',
      PUBLIC_AGGREGATE: 'agrégat public',
      CUSTOMER_DECLARED: 'déclaré · à confirmer',
      VERIFIED_METER: 'mesuré · validé'
    };
    const selectionLabels = {
      EXACT_ACTIVITY_POWER_GEOGRAPHY: 'correspondance exacte activité, puissance et zone',
      EXACT_ACTIVITY_POWER: 'correspondance exacte activité et puissance',
      PARENT_ACTIVITY_POWER: 'activité parente et puissance',
      CUSTOMER_CLASS_POWER: 'classe client et puissance',
      GENERIC_CUSTOMER_CLASS: 'profil générique de classe client'
    };
    const list = document.createElement('ul');
    list.className = 'matchingProfileSources';
    profiles.forEach(profile => {
      const item = document.createElement('li');
      const details = [
        sourceLabels[profile.sourceType] || profile.sourceType || 'Source inconnue',
        profile.activityCode ? `NAF ${profile.activityCode}` : null,
        selectionLabels[profile.selectionMatchLevel] || null,
        profile.selectionStatus === 'AMBIGUOUS' ? 'plusieurs profils au même niveau de correspondance' : null,
        maturityLabels[profile.maturity] || (profile.maturity && profile.maturity !== 'UNKNOWN' ? profile.maturity : null),
        profile.confidence && profile.confidence !== 'UNKNOWN' ? `niveau de confiance : ${profile.confidence}` : null,
        profile.referenceYear ? `année de référence : ${profile.referenceYear}` : null,
        profile.resolutionMinutes ? `pas de ${profile.resolutionMinutes} min` : null,
        profile.sourceVersion ? `version ${profile.sourceVersion}` : null
      ].filter(Boolean);
      item.textContent = details.join(' · ');
      list.appendChild(item);
    });
    const note = document.createElement('p');
    note.className = 'small';
    note.textContent = 'Les profils synthétiques ou agrégés sont des références de prospection, pas une courbe réelle du site. Une courbe compteur validée reste une source distincte.';
    container.replaceChildren(list, note);
    return true;
  }
  function appendMatchingCorridor(container, matching) {
    if (!container || matching?.status !== 'READY' || !matching.metrics) return false;
    const labelsByMetric = [
      ['aciEnergyKwh', 'Énergie ACI', 'kWh'], ['accEnergyKwh', 'Potentiel ACC agrégé', 'kWh'],
      ['surplusEnergyKwh', 'Surplus', 'kWh'], ['gridImportKwh', 'Import réseau', 'kWh'],
      ['selfConsumptionRatePct', 'Utilisation locale de la production', '%'], ['coverageRatePct', 'Couverture de la consommation', '%']
    ];
    const rows = labelsByMetric.map(([key, label, unit]) => ({ label, unit, ...(matching.metrics[key] || {}) }))
      .filter(row => ['low', 'median', 'high', 'reference'].some(key => Number.isFinite(row[key])));
    if (!rows.length) return false;
    const table = document.createElement('table'); table.className = 'data-room matchingCorridorTable';
    const thead = document.createElement('thead'); const heading = document.createElement('tr');
    const hasCorridor = Boolean(matching.quantiles && matching.profileCount > 1);
    const q = matching.quantiles;
    const columns = hasCorridor ? ['reference', 'low', 'median', 'high'] : ['reference'];
    ['Indicateur', 'Référence', ...(hasCorridor ? [`Prudent · Q${q.low}`, `Médian · Q${q.median}`, `Favorable · Q${q.high}`] : [])].forEach(value => { const th = document.createElement('th'); th.textContent = value; heading.appendChild(th); });
    thead.appendChild(heading); table.appendChild(thead);
    const tbody = document.createElement('tbody');
    rows.forEach(row => {
      const tr = document.createElement('tr');
      [row.label, ...columns.map(key => Number.isFinite(row[key]) ? `${row[key].toLocaleString('fr-FR', { maximumFractionDigits: 1 })} ${row.unit}` : '—')].forEach((value, index) => {
        const cell = document.createElement(index === 0 ? 'th' : 'td'); cell.textContent = value; tr.appendChild(cell);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    const note = document.createElement('p'); note.className = 'small';
    const interpretation = matching.corridorType === 'EMPIRICAL_MATCHING_CORRIDOR_NOT_PROJECT_PROBABILITY'
      ? 'Corridor empirique issu des profils synthétiques compatibles disponibles ; il décrit la dispersion des matching testés, pas une probabilité du projet et pas des P50/P90.'
      : 'Un seul profil compatible est disponible : le résultat de référence est affiché sans inventer de corridor.';
    const provenance = [matching.profileCount ? `${matching.profileCount} profil(s) compatible(s)` : null, matching.methodVersion ? `méthode ${matching.methodVersion}` : null, matching.calculatedAt ? `calculé le ${new Date(matching.calculatedAt).toLocaleDateString('fr-FR')}` : null].filter(Boolean).join(' · ');
    note.textContent = `${interpretation}${provenance ? ` ${provenance}.` : ''}`;
    container.replaceChildren(table, note);
    return true;
  }
  function appendPricingCases(container, pricing) {
    if (!container || !pricing) return false;
    const rows = [
      ['Prix de vente ACC', pricing.accPriceCorridor, 'priceEurPerKwh', '€/kWh']
    ];
    const usable = rows.filter(([, cases, valueKey]) => cases && ['low', 'reference', 'high'].some(key => Number.isFinite(cases[key]?.[valueKey])));
    if (!usable.length) return false;
    const table = document.createElement('table'); table.className = 'data-room pricingCorridorTable';
    const thead = document.createElement('thead'); const header = document.createElement('tr');
      ['Résultat', 'Prudent', 'Référence', 'Favorable'].forEach(value => { const th = document.createElement('th'); th.textContent = value; header.appendChild(th); });
    thead.appendChild(header); table.appendChild(thead);
    const tbody = document.createElement('tbody');
    usable.forEach(([label, cases, valueKey, unit]) => {
      const tr = document.createElement('tr'); const title = document.createElement('th'); title.textContent = label; tr.appendChild(title);
      ['low', 'reference', 'high'].forEach(key => {
        const value = cases[key]?.[valueKey]; const cell = document.createElement('td');
        cell.textContent = Number.isFinite(value) ? `${value.toLocaleString('fr-FR', { maximumFractionDigits: 3 })} ${unit}` : '—'; tr.appendChild(cell);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    const sourceNote = document.createElement('p'); sourceNote.className = 'small';
    const caseLabels = { low: 'Prudent', reference: 'Référence', high: 'Favorable' };
    const sourceDetails = ['low', 'reference', 'high'].map(key => {
      const item = pricing.accPriceCorridor?.cases?.[key];
      if (!item) return null;
      const details = [
        item.sourceType || null,
        item.sourceReference || null,
        item.sourceVersion ? `version ${item.sourceVersion}` : null,
        item.effectiveFrom ? `applicable depuis le ${item.effectiveFrom}` : null,
        item.confidence ? `confiance : ${item.confidence}` : null
      ].filter(Boolean);
      return details.length ? `${caseLabels[key]} : ${details.join(' · ')}` : null;
    }).filter(Boolean);
    const corridor = pricing.accPriceCorridor;
    const basisLabel = ({ EUR_KWH_HT: 'Prix HT, hors taxes et TVA', EUR_KWH_TTC: 'Prix TTC, taxes et TVA incluses', 'EUR/KWH_HT': 'Prix HT, hors taxes et TVA', 'EUR/KWH_TTC': 'Prix TTC, taxes et TVA incluses' })[corridor?.unitBasis] || corridor?.unitBasis || null;
    sourceNote.textContent = [basisLabel, corridor?.taxBasis ? `base taxes ${corridor.taxBasis}` : null, corridor?.vatBasis === 'INCLUDED' ? 'TVA incluse' : corridor?.vatBasis === 'EXCLUDED' ? 'TVA exclue' : null, pricing.engineVersion ? `Moteur ${pricing.engineVersion}` : null, pricing.calculatedAt ? `calculé le ${new Date(pricing.calculatedAt).toLocaleDateString('fr-FR')}` : null, ...sourceDetails].filter(Boolean).join(' · ');
    container.replaceChildren(table, sourceNote);
    return true;
  }
  const reportStatusLabels = Object.freeze({ VERIFIED: 'Vérifié', ASSUMPTION: 'Estimation', UNKNOWN: 'À compléter', STALE: 'À actualiser', PARTIAL: 'Couverture partielle' });
  const reportValueLabels = Object.freeze({
    LOCAL_SELF_CONSUMPTION: 'Autoconsommation collective / locale', FULL_SALE: 'Vente totale',
    TEMPORAL_MATCHING: 'Matching temporel', ANNUAL_PREVIEW: 'Prévisualisation annuelle',
    CANONICAL: 'Canonique', PROSPECTING_PREVIEW: 'Aperçu de prospection', READY: 'Disponible',
    UNKNOWN: 'À compléter', NOT_APPLICABLE: 'Non applicable', PERIOD_CLOSED: 'Période fermée',
    REQUIRES_TENDER: 'Appel d’offres requis', POTENTIALLY_ELIGIBLE: 'Pré-éligibilité indicative',
    PROJECT_SPV: 'Société de projet', ENERGY_CONSUMER: 'Consommateur d’énergie', SITE_OWNER: 'Propriétaire du site',
    PV_ASSET_OWNER: 'Propriétaire de la centrale', INVESTOR: 'Investisseur', OWNER: 'Propriétaire / porteur de projet',
    ACI: 'Autoconsommation individuelle', ACC: 'Autoconsommation collective', SURPLUS: 'Surplus injecté',
    EXPORT: 'Injection réseau', CURTAILMENT: 'Écrêtement', S21: 'S21 · surplus photovoltaïque',
    AOS: 'AOS Petit PV', AOS_PETIT_PV: 'AOS Petit PV', PARTIAL: 'Couverture partielle', CASH_TRANSFER: 'Flux monétaire', NON_CASH_BENEFIT: 'Avantage non monétaire',
    MULTICHANNEL_ANNUAL_FLOWS: 'Flux économiques annuels multi-canaux', LEGACY_SCALAR: 'Contrat financier historique',
    CASH_ONLY: 'Flux monétaires uniquement', CASH_PLUS_OWN_NON_CASH_BENEFITS: 'Flux monétaires et avantages propres',
    ENERGY_PAYMENT: 'Paiement d’énergie', GRID_EXPORT_REVENUE: 'Revenu d’injection réseau', CLIENT_SAVING: 'Économie client',
    PROJECT_REVENUE: 'Revenu du projet', RENT: 'Loyer', FEE: 'Frais de service', OPEX: 'Coût d’exploitation',
    DEBT_SERVICE: 'Service de la dette', RESOLVED: 'Résolu', HT: 'Hors taxes', GRID: 'Réseau'
  });
  const reportFieldLabels = Object.freeze({
    'project.name': 'Projet', 'project.site': 'Adresse du site', 'scenario.name': 'Scénario', 'scenario.viewpoint': 'Point de vue financier',
    'technical.configuration': 'Configuration solaire', 'technical.capacity_kwp': 'Puissance photovoltaïque', 'technical.solar_areas': 'Surfaces solaires',
    'energy.production.annual': 'Production annuelle', 'energy.load.annual': 'Consommation annuelle', 'energy.matching': 'Matching énergétique',
    'energy.channels': 'Canaux et méthode d’allocation', 'cr008.valuation': 'Valorisation de l’énergie', 'cr012.tariff_references': 'Références tarifaires',
    'capex.total': 'CAPEX', 'opex.annual': 'OPEX annuel', 'financial.contract': 'Contrat financier', 'financial.perspective': 'Perspective financière',
    'financial.irr_or_not_applicable': 'TRI', 'financial.npv_or_not_applicable': 'VAN', 'financial.payback_or_not_applicable': 'Payback',
    'financial.ebitda': 'EBITDA annuel', 'financial.lcoe': 'Coût solaire / kWh', 'financial.cash_flows': 'Flux de trésorerie',
    'financial.economic_flows': 'Flux économiques par canal', 'financial.run': 'Run financier',
    'carbon.avoided_co2e_t_year': 'CO₂e évité estimé', 'carbon.thermal_car_equivalent_km': 'Équivalent voiture thermique',
    'carbon.pv_module_valorization_rate': 'Valorisation des panneaux', 'carbon.methodology': 'Méthode carbone',
    'carbon.factor_gco2e_per_kwh': 'Facteur carbone de référence', 'carbon.reference_year': 'Année de référence',
    'support.results': 'Dispositifs évalués', 'support.catalogue_coverage': 'Couverture du catalogue',
    'actors.snapshot': 'Parties prenantes', 'risk.score': 'Risques', 'resilience.score': 'Résilience',
    'contracts.status': 'État contractuel', 'decision.status': 'Décision / avis'
  });
  const detailLabels = Object.freeze({
    version: 'Version', pv_capacity_kwp: 'Puissance', module_count: 'Nombre de modules', production_source: 'Source de production',
    status: 'Statut', method_version: 'Version de méthode', allocation_method: 'Méthode d’allocation', decision_maturity: 'Maturité',
    scenario_mode: 'Mode de scénario', enabled_channels: 'Canaux activés', allocation_priority: 'Ordre de priorité', residual_policy: 'Traitement du résiduel',
    aci_kwh: 'ACI', acc_kwh: 'ACC', surplus_kwh: 'Surplus', pv_production_kwh: 'Production PV', full_sale_kwh: 'Énergie vendue', coverage_pct: 'Couverture',
    financial_contract_type: 'Contrat', contract_version: 'Version du contrat', financial_perspective: 'Perspective', party_id: 'Partie associée',
    actor_role: 'Rôle', return_basis: 'Base de calcul', ruleset: 'Ruleset', references: 'Références', channel: 'Canal', reference_code: 'Référence',
    effective_date: 'Date d’effet', effective_year: 'Année d’effet', tax_basis: 'Base fiscale', source: 'Source',
    name: 'Zone', area_kind: 'Type de surface', gross_area_m2: 'Surface brute', usable_area_pct: 'Part exploitable', usable_area_estimate_m2: 'Surface exploitable estimée',
    orientation_deg: 'Orientation', tilt_deg: 'Inclinaison', mounting_type: 'Montage', provenance: 'Origine',
    scheme_code: 'Dispositif', scheme_version: 'Version du dispositif', eligibility_status: 'Pré-éligibilité', procedural_status: 'État de la période',
    confidence_level: 'Niveau de confiance', missing_conditions: 'Conditions à confirmer', missing_documents: 'Pièces à fournir', source_references: 'Sources officielles',
    catalogue_coverage_status: 'Couverture du catalogue', catalogue_coverage_note: 'Note de couverture',
    flow_id: 'Référence du flux', year_index: 'Année du flux', calendar_year: 'Année civile', flow_class: 'Nature du flux', economic_nature: 'Type économique',
    source_energy_channel: 'Canal énergétique', payer_actor_role: 'Payeur', recipient_actor_role: 'Bénéficiaire', energy_kwh: 'Énergie', unit_price: 'Prix unitaire',
    amount_eur: 'Montant', currency: 'Devise', pricing_reference_id: 'Référence tarifaire', engine_code: 'Moteur', engine_version: 'Version moteur',
    id: 'Identifiant de provenance', run_id: 'Run source', run_hash: 'Empreinte source', ruleset_id: 'Identifiant ruleset', input_snapshot_hash: 'Empreinte des entrées'
  });
  const humanValue = (value) => {
    if (value == null || value === '') return 'À compléter';
    if (Array.isArray(value)) return value.map(humanValue).join(' · ');
    if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${detailLabels[key] || key.replaceAll('_', ' ')} : ${humanValue(item)}`).join(' · ');
    return reportValueLabels[value] || String(value);
  };
  const detailValue = (key, value) => {
    const unit = ({
      pv_capacity_kwp: ' kWc', gross_area_m2: ' m²', usable_area_estimate_m2: ' m²',
      usable_area_pct: ' %', orientation_deg: '°', tilt_deg: '°', aci_kwh: ' kWh', acc_kwh: ' kWh',
      surplus_kwh: ' kWh', pv_production_kwh: ' kWh', full_sale_kwh: ' kWh', energy_kwh: ' kWh',
      amount_eur: ' €', unit_price: ' €/kWh', coverage_pct: ' %'
    })[key] || '';
    return `${humanValue(value)}${unit}`;
  };
  const factByCode = (payload, code) => (payload.facts || []).find((fact) => fact.field_code === code);
  const sourceDisclosure = (fact) => {
    const values = [
      fact.source_type ? `Source : ${humanValue(fact.source_type)}` : null,
      fact.source_reference ? `Référence : ${fact.source_reference}` : null,
      fact.calculation_method ? `Méthode : ${humanValue(fact.calculation_method)}` : null,
      fact.engine_version ? `Version : ${fact.engine_version}` : null,
      fact.verified_at || fact.calculated_at ? `Date : ${new Date(fact.verified_at || fact.calculated_at).toLocaleDateString('fr-FR')}` : null,
      fact.provenance && typeof fact.provenance === 'object' ? `Provenance : ${humanValue(fact.provenance)}` : null
    ].filter(Boolean);
    return values.length ? `<details class="sourceDisclosure"><summary>Source & méthode</summary><p>${esc(values.join(' · '))}</p></details>` : '';
  };
  function reportFactValue(fact) {
    if (fact.status === 'UNKNOWN') return 'À compléter';
    if (fact.status === 'STALE') return 'À actualiser';
    if (fact.status === 'NOT_APPLICABLE') return 'Non applicable';
    if (fact.value == null) return 'À compléter';
    if (Array.isArray(fact.value) && fact.value.every((item) => typeof item !== 'object' || item === null)) return fact.value.map(humanValue).join(' · ');
    if (typeof fact.value === 'object') return '';
    const displayed = typeof fact.value === 'number' ? fact.value.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : humanValue(fact.value);
    return `${displayed}${fact.unit ? ` ${fact.unit}` : ''}`;
  }
  function renderFact(fact, opts = {}) {
    const statusLabel = reportStatusLabels[fact.status] || 'À compléter';
    const label = reportFieldLabels[fact.field_code] || fact.label || fact.field_code;
    const value = reportFactValue(fact);
    let details = '';
    if (fact.value && typeof fact.value === 'object' && !(Array.isArray(fact.value) && fact.value.every((item) => typeof item !== 'object' || item === null)) && fact.status !== 'UNKNOWN' && fact.status !== 'STALE') {
      const valueRows = Array.isArray(fact.value)
        ? fact.value.map((item, index) => {
          if (typeof item !== 'object' || item === null) return `<li><b>Valeur ${index + 1}</b><span>${esc(humanValue(item))}</span></li>`;
          return `<li><b>${esc(humanValue(item.scheme_code || item.name || item.flow_id || `Valeur ${index + 1}`))}</b><span>${esc(humanValue(Object.fromEntries(Object.entries(item).filter(([key]) => !['scheme_code', 'name', 'flow_id'].includes(key)))))}</span></li>`;
        }).join('')
        : Object.entries(fact.value).map(([key, item]) => `<li><b>${esc(detailLabels[key] || key.replaceAll('_', ' '))}</b><span>${esc(detailValue(key, item))}</span></li>`).join('');
      details = valueRows ? `<ul class="factDetails">${valueRows}</ul>` : '';
    }
    const note = fact.status === 'UNKNOWN' ? fact.unknown_reason : fact.status === 'STALE' ? fact.stale_reason : null;
    return `<article class="redesignFact" data-status="${esc(fact.status || 'UNKNOWN')}"><div class="redesignFactTop"><span>${esc(label)}</span><b class="statusBadge" data-status="${esc(fact.status || 'UNKNOWN')}">${esc(statusLabel)}</b></div>${value ? `<strong class="redesignFactValue">${esc(value)}</strong>` : ''}${details}${note ? `<p class="redesignNote">${esc(note)}</p>` : ''}${sourceDisclosure(fact)}</article>`;
  }
  const factsSection = (payload, codes, { exclude = [] } = {}) => {
    const facts = (payload.facts || []).filter((fact) => codes.includes(fact.field_code) && !exclude.includes(fact.field_code));
    return facts.length ? facts.map((fact) => renderFact(fact)).join('') : '<p class="emptyState">Aucune donnée présente dans cette version du scénario.</p>';
  };
  function renderFlowTable(fact) {
    if (!Array.isArray(fact?.value) || !fact.value.length) return renderFact(fact || { field_code: 'financial.economic_flows', status: 'UNKNOWN', unknown_reason: 'Aucun flux économique détaillé n’est disponible pour cette perspective.' });
    const rows = fact.value.map((flow) => `<tr><td data-label="Année">${esc(humanValue(flow.calendar_year ?? flow.year_index))}</td><td data-label="Canal">${esc(humanValue(flow.source_energy_channel))}</td><td data-label="Flux">${esc(humanValue(flow.economic_nature))}</td><td data-label="Parties">${esc(`${humanValue(flow.payer_actor_role)} → ${humanValue(flow.recipient_actor_role)}`)}</td><td data-label="Énergie">${esc(flow.energy_kwh == null ? '—' : `${humanValue(flow.energy_kwh)} kWh`)}</td><td data-label="Prix">${esc(flow.unit_price == null ? '—' : `${humanValue(flow.unit_price)} €/kWh`)}</td><td data-label="Montant">${esc(`${humanValue(flow.amount_eur)} €`)}</td></tr>`).join('');
    return `<div class="flowTableWrap"><table class="flowTable"><thead><tr><th>Année</th><th>Canal</th><th>Flux</th><th>Parties</th><th>Énergie</th><th>Prix unitaire</th><th>Montant</th></tr></thead><tbody>${rows}</tbody></table></div>${sourceDisclosure(fact)}`;
  }
  function renderSupport(payload) {
    const fact = factByCode(payload, 'support.results');
    const support = Array.isArray(fact?.value) ? fact.value : [];
    const schemeLabels = { S21: 'S21 · surplus photovoltaïque', AOS: 'AOS Petit PV' };
    const cards = support.map((item) => {
      const closed = item.procedural_status === 'PERIOD_CLOSED';
      const potentiallyEligible = item.eligibility_status === 'POTENTIALLY_ELIGIBLE';
      const headline = item.scheme_code === 'S21' ? 'Pré-éligibilité indicative' : closed ? 'Période P2 vérifiée fermée' : humanValue(item.procedural_status);
      const text = item.scheme_code === 'S21' ? 'À confirmer sur pièces. Cette pré-évaluation ne détermine ni tarif, ni prime, ni droit définitif.' : closed ? 'La période documentée est close ; aucune période de candidature ouverte n’est présentée ici.' : 'Statut informatif selon la version de règles affichée.';
      return `<article class="supportCard"><div class="redesignFactTop"><span>${esc(schemeLabels[item.scheme_code] || humanValue(item.scheme_code))}</span><b class="statusBadge" data-status="${potentiallyEligible ? 'ASSUMPTION' : closed ? 'STALE' : 'UNKNOWN'}">${esc(closed ? 'Période fermée' : potentiallyEligible ? 'Estimation' : 'À compléter')}</b></div><strong>${esc(headline)}</strong><p>${esc(text)}</p><small>Version ${esc(item.scheme_version || 'non renseignée')}${item.source_references?.length ? ` · ${esc(item.source_references.map(humanValue).join(' · '))}` : ''}</small></article>`;
    }).join('');
    const coverage = factByCode(payload, 'support.catalogue_coverage') || payload.catalogue_coverage;
    const note = coverage?.value?.catalogue_coverage_note || coverage?.note || 'Aucun autre dispositif identifié dans le catalogue actuellement vérifié.';
    return `${cards || '<p class="emptyState">Aucun résultat de dispositif lié à cette version. Cela ne signifie pas qu’aucune aide n’existe.</p>'}<article class="coverageCard"><b class="statusBadge" data-status="PARTIAL">Couverture partielle</b><p>${esc(note)}</p><p class="small">Le catalogue vérifié n’est pas exhaustif pour les dispositifs régionaux et locaux.</p></article>`;
  }
  function renderFrozenReport(report, payload, gate, presentation) {
    const titleFact = factByCode(payload, 'project.name');
    const siteFact = factByCode(payload, 'project.site');
    const title = titleFact?.value || payload.scenario?.name || 'Rapport de scénario';
    const date = payload.generated_at || report.generated_at;
    const viewpoint = ({ OWNER: 'Propriétaire / porteur de projet', INVESTOR: 'Investisseur', SPV: 'Société de projet' })[payload.financial_viewpoint] || 'À compléter';
    const projectReference = payload.project?.reference || '';
    const kpiLabels = {
      'technical.capacity_kwp': 'Puissance', 'energy.production.annual': 'Production annuelle', 'capex.total': 'CAPEX',
      'financial.lcoe': 'Coût solaire / kWh', 'financial.irr_or_not_applicable': 'TRI',
      'financial.payback_or_not_applicable': 'Payback', 'carbon.avoided_co2e_t_year': 'CO₂e évité estimé'
    };
    const kpiFacts = (payload.executive_kpis || []).slice(0, 7).map((code) => factByCode(payload, code)).filter(Boolean);
    const kpis = kpiFacts.map((fact) => `<article class="executiveKpi" data-status="${esc(fact.status)}"><span>${esc(kpiLabels[fact.field_code] || reportFieldLabels[fact.field_code] || fact.field_code)}</span><strong>${esc(reportFactValue(fact))}</strong><small class="statusBadge" data-status="${esc(fact.status)}">${esc(reportStatusLabels[fact.status] || 'À compléter')}</small></article>`).join('');
    const matching = factByCode(payload, 'energy.matching');
    const channels = factByCode(payload, 'energy.channels');
    const financeContract = factByCode(payload, 'financial.contract');
    const financeStatus = financeContract?.value?.status === 'READY' ? 'Résultats disponibles selon la perspective choisie' : 'Résultats financiers à compléter pour cette perspective';
    const blockers = (gate.blockers || []).map((code) => `<li>${esc(reportFieldLabels[code] || labels[code] || code)} · à compléter ou actualiser</li>`).join('');
    const required = (payload.data_room?.required_types || []).map((doc) => `<tr><td data-label="Pièce attendue">${esc(humanValue(doc.document_type))}</td><td data-label="État">${esc(doc.status === 'PRESENT' ? 'Présent' : 'À compléter')}</td></tr>`).join('');
    const docs = (payload.data_room?.files || []).map((doc) => `<li><b>${esc(humanValue(doc.document_type))}</b><span>${esc(humanValue(doc.processing_status))} · ${esc(doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString('fr-FR') : 'date non renseignée')}</span></li>`).join('');
    const content = $('reportContent');
    content.classList.add('report--frozen');
    content.innerHTML = `
      <section class="report-page redesignPage redesignSummary" aria-labelledby="p1-title"><header class="pageKicker"><span>OZENO · RAPPORT DÉCISIONNEL</span><span>P1 — 06</span></header><div class="reportHeading"><div><p class="eyebrow">${esc(payload.report_type || 'Rapport de scénario')}</p><h1 id="p1-title">${esc(title)}</h1><p class="siteLine">${esc(humanValue(siteFact?.value))}</p></div><span class="reportState ${presentation.provisional ? 'provisional' : 'complete'}">${esc(presentation.label)}</span></div><div class="metadataLine"><span>${esc(projectReference || 'Référence non renseignée')}</span><span>Scénario v${esc(payload.scenario?.version ?? '—')}</span><span>Perspective · ${esc(viewpoint)}</span><span>${esc(date ? new Date(date).toLocaleDateString('fr-FR') : 'Date non renseignée')}</span></div><div class="executiveKpis" aria-label="Indicateurs clés">${kpis || '<p class="emptyState">Aucun indicateur de synthèse n’est disponible.</p>'}</div><div class="decisionBrief"><div><span>Scénario énergétique</span><strong>${esc(humanValue(channels?.value?.scenario_mode || matching?.value?.scenario_mode))}</strong><small>${esc(humanValue(channels?.value?.allocation_method || matching?.value?.allocation_method))}${channels?.value?.decision_maturity ? ` · ${esc(humanValue(channels.value.decision_maturity))}` : ''}</small></div><div><span>Situation financière</span><strong>${esc(financeStatus)}</strong><small>${esc(viewpoint)}</small></div><div><span>Décision / avis</span><strong>À compléter</strong><small>Aucune recommandation automatique n’est produite.</small></div></div><p class="notice neutralNotice">Cette synthèse restitue les données rattachées à une version figée. Les données inconnues restent à compléter ; elles ne sont ni estimées ni remplacées par un calcul d’interface.</p></section>
      <section class="report-page redesignPage" aria-labelledby="p2-title"><header class="pageKicker"><span>SITE & CENTRALE</span><span>P2 — 06</span></header><h2 class="pageTitle" id="p2-title">Le site et sa configuration solaire</h2><p class="lead">Identité, surfaces et paramètres techniques tels qu’ils sont enregistrés dans la version du scénario.</p><div class="factGrid">${factsSection(payload, ['project.site', 'technical.configuration', 'technical.capacity_kwp', 'technical.solar_areas'])}</div><div class="siteVisualMissing"><div aria-hidden="true">⌖</div><strong>Plan du site</strong><p>Aucun plan ou visuel du site n’est inclus dans le payload figé de ce rapport.</p></div></section>
      <section class="report-page redesignPage" aria-labelledby="p3-title"><header class="pageKicker"><span>PRODUCTION & ÉNERGIE</span><span>P3 — 06</span></header><h2 class="pageTitle" id="p3-title">Production, consommation et allocation</h2><p class="lead">Les volumes d’énergie sont repris des données canoniques du scénario. Un total annuel ne permet pas de déduire un matching temporel.</p><div class="factGrid">${factsSection(payload, ['energy.production.annual', 'energy.load.annual', 'energy.matching'])}</div><div class="graphUnavailable"><span aria-hidden="true">↗</span><div><b>Profil annuel de production</b><p>Aucune série de production par période n’est disponible dans ce payload figé. Le total annuel est conservé sans fabriquer de courbe ni d’allocation.</p></div></div><p class="small">Les valeurs de matching indiquent leur méthode et leur maturité dans les détails. Une prévisualisation annuelle n’est pas présentée comme matching temporel canonique.</p></section>
      <section class="report-page redesignPage" aria-labelledby="p4-title"><header class="pageKicker"><span>ÉCONOMIE & FINANCE</span><span>P4 — 06</span></header><h2 class="pageTitle" id="p4-title">Résultats selon la perspective ${esc(viewpoint.toLowerCase())}</h2><p class="lead">Seuls les résultats financiers rattachés à la partie et au point de vue sélectionnés sont présentés. Aucune perspective ne sert de substitut à une autre.</p><div class="factGrid">${factsSection(payload, ['capex.total', 'opex.annual', 'financial.contract', 'financial.perspective', 'financial.irr_or_not_applicable', 'financial.npv_or_not_applicable', 'financial.payback_or_not_applicable', 'financial.ebitda', 'financial.lcoe'])}</div><p class="small">Le coût solaire / kWh reste « À compléter » lorsqu’aucun KPI canonique n’est fourni pour ce contrat.</p></section>
      <section class="report-page redesignPage" aria-labelledby="p4-flow-title"><header class="pageKicker"><span>ÉCONOMIE & FINANCE · DÉTAIL</span><span>P4 — FLUX</span></header><h2 class="pageTitle" id="p4-flow-title">Flux associés à la perspective ${esc(viewpoint.toLowerCase())}</h2><p class="lead">Détail des flux déjà enregistrés pour la partie sélectionnée. Les lignes financières ne sont pas utilisées pour recalculer les volumes énergétiques.</p><div class="factGrid">${factsSection(payload, ['financial.cash_flows', 'cr008.valuation'])}</div><h3>Flux économiques par canal et par acteur</h3>${renderFlowTable(factByCode(payload, 'financial.economic_flows'))}<p class="small">Les années, canaux, prix et montants sont affichés tels qu’ils figurent dans le snapshot de cette perspective.</p></section>
      <section class="report-page redesignPage" aria-labelledby="p5-title"><header class="pageKicker"><span>IMPACT & AIDES</span><span>P5 — 06</span></header><h2 class="pageTitle" id="p5-title">Impact annuel et dispositifs</h2><div class="impactBlock"><div><p class="eyebrow">IMPACT CARBONE</p><div class="factGrid">${factsSection(payload, ['carbon.avoided_co2e_t_year', 'carbon.thermal_car_equivalent_km', 'carbon.pv_module_valorization_rate'])}</div><p class="small">Méthode et année de référence · détails ci-dessous.</p></div><div class="supportBlock"><p class="eyebrow">AIDES & DISPOSITIFS</p>${renderSupport(payload)}<p class="small">Aucun montant d’aide n’est calculé ou annoncé.</p></div></div><details class="methodDisclosure"><summary>Sources et méthode carbone</summary><div class="factGrid">${factsSection(payload, ['carbon.methodology', 'carbon.factor_gco2e_per_kwh', 'carbon.reference_year'])}</div></details></section>
      <section class="report-page redesignPage" aria-labelledby="p6-title"><header class="pageKicker"><span>RISQUES, HYPOTHÈSES & DÉCISION</span><span>P6 — 06</span></header><h2 class="pageTitle" id="p6-title">Ce qui reste à confirmer</h2><div class="factGrid">${factsSection(payload, ['actors.snapshot', 'risk.score', 'resilience.score', 'contracts.status', 'decision.status'])}</div><div class="completionGrid"><section><h3>Points requis pour la publication</h3>${blockers ? `<ul>${blockers}</ul>` : '<p>Les prérequis déclarés de publication sont renseignés.</p>'}</section><section><h3>Pièces attendues</h3><div class="mobileTable"><table class="data-room"><tbody>${required || '<tr><td>Aucune liste de pièces disponible.</td></tr>'}</tbody></table></div></section></div><div class="humanDecision"><span>Décision / avis humain autorisé</span><strong>À compléter</strong><p>Le rapport n’émet ni GO / NO GO, ni score d’investissement, ni recommandation automatique.</p></div></section>
      <section class="report-page redesignPage redesignAnnex" aria-labelledby="annex-title"><header class="pageKicker"><span>ANNEXES & PROVENANCE</span><span>ANNEXES</span></header><h2 class="pageTitle" id="annex-title">Traçabilité de cette version</h2><p class="lead">Sources, moteurs, versions et pièces recensées pour permettre la vérification des éléments affichés.</p><div class="completionGrid"><section><h3>Pièces présentes</h3><ul class="documentList">${docs || '<li>Aucun document recensé dans cette version.</li>'}</ul><h3>Pièces attendues</h3><div class="mobileTable"><table class="data-room"><tbody>${required || '<tr><td>Aucune exigence documentaire disponible.</td></tr>'}</tbody></table></div></section><section><h3>Empreintes et références de version</h3><div class="factGrid">${factsSection(payload, ['financial.run', 'data.cutoff'])}<article class="redesignFact"><span>Version du rapport</span><strong>${esc(`r${report.report_version ?? '—'} · ${payload.engine_version || 'moteur non renseigné'}`)}</strong><details class="sourceDisclosure"><summary>Empreintes du scénario et du rapport</summary><p>${esc(`Scénario : ${payload.scenario?.frozen_snapshot_hash || 'non disponible'} · Rapport : ${report.payload_hash || 'non disponible'}`)}</p></details></article></div></section></div></section>`;
    const header = document.querySelector('.reportHeader span');
    if (header) header.textContent = 'Rapport décisionnel · CR-007';
    $('reportContent').hidden = false;
    $('reportStatus').hidden = true;
    $('publishReport').hidden = report.status !== 'GENERATED';
    $('publishReport').disabled = !gate.ready;
    $('revokeReport').hidden = report.status !== 'PUBLISHED';
    window.document.title = `${title} — Rapport décisionnel`;
  }
  function render(report) {
    reportRecord = report;
    const payload = report.payload || {};
    const preliminary = payload.report_mode === 'PRELIMINARY_DRAFT';
    const gate = payload.publication_gate || { ready: false, blockers: [] };
    const presentation = window.OzenoReportStatus.frozenReportPresentationStatus({ report, publication_gate: gate });
    if (!preliminary) return renderFrozenReport(report, payload, gate, presentation);
    const energy = factsFor(payload, 'energy', preliminary);
    const technical = factsFor(payload, 'technical', preliminary);
    const financial = factsFor(payload, 'financial', preliminary);
    const risks = factsFor(payload, 'risks', preliminary);
    const required = (payload.data_room?.required_types || []).map((doc) => `<tr><th>${esc(doc.document_type)}</th><td>${esc(doc.status === 'PRESENT' ? 'Présent' : 'Non disponible')}</td></tr>`).join('');
    const docs = (payload.data_room?.files || []).map((doc) => `<li>${esc(doc.document_type)} · ${esc(doc.processing_status)} · ${esc(doc.uploaded_at || 'date inconnue')}</li>`).join('') || '<li>Aucun document de projet recensé dans cette version du rapport.</li>';
    const blockers = preliminary
      ? '<p>Le rapport provisoire local ne peut pas être publié. Une génération canonique distincte nécessitera un scénario validé et un instantané FREEZE concordant.</p>'
      : gate.blockers?.length ? `<ul>${gate.blockers.map((field) => `<li>${esc(labels[field] || field)} : donnée non disponible ou périmée</li>`).join('')}</ul>` : '<p>Les prérequis de publication de la version actuelle sont renseignés.</p>';
    const titleFact = (payload.facts || []).find((fact) => fact.field_code === 'project.name');
    const siteFact = (payload.facts || []).find((fact) => fact.field_code === 'project.site');
    const site = siteFact?.value || '';
    const title = titleFact?.value || payload.scenario?.name || (preliminary ? 'Étude préalable' : 'Rapport de scénario figé');
    const viewpoint = ({ OWNER: 'porteur du projet / propriétaire', INVESTOR: 'investisseur', SPV: 'société de projet' })[payload.financial_viewpoint] || 'à préciser';
    const header = document.querySelector('.reportHeader span');
    if (header) header.textContent = preliminary ? 'Rapport provisoire · étude préalable' : 'Rapport de scénario figé';
    const backLink = document.querySelector('.reportHeader a');
    if (preliminary && payload.return_url && backLink) {
      try {
        const returnUrl = new URL(payload.return_url, location.href);
        if (returnUrl.origin === location.origin) { backLink.href = returnUrl.href; backLink.textContent = '← Retour à l’étude'; }
      } catch { /* Keep the safe projects-page link. */ }
    }
    $('reportContent').innerHTML = `
      <section class="report-page cover"><div><span class="eyebrow">OZENO · ${preliminary ? 'Étude préalable' : 'Rapport de scénario figé'}</span><h1>${esc(title)}</h1><p class="muted">${esc(site || titleFact?.value || '')} · lecture ${esc(viewpoint)}</p><p class="reportState ${presentation.provisional ? 'provisional' : 'complete'}" role="status">${esc(presentation.label)}${preliminary ? '' : presentation.unresolvedCount ? ` · ${presentation.unresolvedCount} donnée(s) UNKNOWN ou périmée(s)` : ''}</p></div><div class="coverMeta">${preliminary ? `<div><small>Document</small><br><b>Étude préalable · provisoire</b></div><div><small>Destinataire</small><br><b>${esc(viewpoint)}</b></div>` : `<div><small>Scénario figé</small><br><b>${esc(payload.scenario?.status || 'UNKNOWN')} · v${esc(payload.scenario?.version || '?')}</b></div><div><small>Version du rapport</small><br><b>r${esc(report.report_version)}</b></div>`}<div><small>${preliminary ? 'Édité le' : 'Généré le'}</small><br><b>${esc(new Date(payload.generated_at || report.generated_at).toLocaleDateString('fr-FR'))}</b></div></div><p class="muted">${preliminary ? 'Les indicateurs connus de l’étude sont repris ici. Les coûts et résultats encore estimatifs sont signalés comme hypothèses ; les informations à documenter restent à confirmer.' : 'Document reproductible basé sur un scénario figé. Il restitue les données et leurs sources ; il ne recalcule ni production ni rentabilité.'}</p></section>
      <section class="report-page"><h2 class="pageTitle">${preliminary ? '01 · Synthèse du projet' : 'Synthèse exécutive'}</h2><p class="lead">${preliminary ? `Vue d’ensemble pour le/la ${esc(viewpoint)}. Les chiffres sont ceux affichés dans l’étude au moment de la génération.` : `Lecture adaptée au point de vue ${esc(viewpoint)}. Une économie du propriétaire n’est jamais assimilée à une recette investisseur.`}</p><div id="reportSummaryKpis" class="summaryKpis"></div><div class="summaryDashboard"><article class="summaryPanel"><h3>Production et repères climatiques</h3><div id="reportSummaryClimate" class="reportChart"></div><p class="small">P50/P90 climatiques décrivent l’historique, pas une garantie ni un P90 d’investissement.</p></article><article class="summaryPanel"><h3>Repères du projet</h3><div id="reportSummaryFacts" class="summaryFacts"></div></article></div><div class="notice ${preliminary ? '' : 'unknown'}">${preliminary ? 'Cette synthèse décrit une pré-étude : elle ne constitue pas encore une recommandation d’investissement.' : 'Décision / recommandation : non disponible. Les éléments manquants ne sont ni estimés ni remplacés par un score.'}</div></section>
      <section class="report-page"><h2 class="pageTitle">${preliminary ? '02 · Performance solaire' : 'Énergie et rendement'}</h2><p class="lead">${preliminary ? 'Production estimée et variabilité observée dans l’historique climatique, lorsqu’elle a été calculée dans l’étude.' : 'Les résultats d’étude externes restent distincts des valeurs climatiques et modélisées. Aucun P90 climatique n’est présenté comme P90 modélisé.'}</p><div class="facts">${energy}</div>${preliminary ? '<h3>Profil mensuel estimé</h3><div id="reportProductionChart" class="reportChart" hidden></div><p class="small">La ligne de consommation, si disponible, représente seulement la consommation annuelle divisée par 12 ; ce n’est pas une courbe de charge réelle et elle ne démontre pas la coïncidence horaire.</p><h3>Variabilité climatique observée</h3><div id="reportClimateChart" class="reportChart" hidden></div><p id="reportClimateNote" class="small"></p>' : ''}<div class="notice">${preliminary ? 'P50 et P90 climatiques décrivent la dispersion des productions historiques PVGIS. Ce ne sont ni des garanties, ni des niveaux de confiance d’investissement. La comparaison annuelle ne permet pas de déduire une coïncidence horaire avec la consommation.' : 'Les résultats sont restitués tels que fournis par le run ou l’étude citée. Ce rapport n’en déduit aucun profil horaire ou coïncidence de consommation.'}</div></section>
      <section class="report-page"><h2 class="pageTitle">${preliminary ? '03 · Configuration et coûts' : 'Technique, CAPEX et OPEX'}</h2><p class="lead">${preliminary ? 'Les surfaces, équipements et coûts sont des hypothèses tant qu’ils ne sont pas confirmés par les pièces et études nécessaires.' : 'Le CAPEX correspond au coût d’investissement hors coût de la dette. Les intérêts éventuels relèvent du financement et ne sont pas incorporés au CAPEX.'}</p><div class="facts">${technical}</div>${preliminary ? '<div class="notice">L’OPEX affiché comme hypothèse est celui utilisé dans le calcul actuel du TRI. Il sera remplacé par une estimation documentée lorsque les coûts d’assurance, de maintenance et les autres frais seront connus.</div>' : `<h3>État des pièces attendues</h3><table class="data-room"><tbody>${required}</tbody></table><ul class="small">${docs}</ul>`}</section>
      <section class="report-page"><h2 class="pageTitle">${preliminary ? '04 · Résultats financiers' : 'Scénario financier'}</h2><p class="lead">${preliminary ? `Estimations reprises de l’étude pour le point de vue ${esc(viewpoint)}. Le rapport restitue les flux calculés dans l’étude, sans les recalculer à la génération.` : `Point de vue : ${esc(viewpoint)}. Aucun KPI n’est réinterprété ; les retours ne sont affichés que si le run canonique identifie le même point de vue. Les économies propriétaire ne remplacent jamais un rendement investisseur.`}</p><div class="facts">${financial}</div>${preliminary ? '<h3>Répartition des ventes et économies · année 1</h3><div id="reportRevenueChart" class="reportChart" hidden></div><h3>Flux cumulés des fonds propres · avant impôts</h3><div id="reportCashflowChart" class="reportChart" hidden></div><div id="reportAnnualCashflow" class="financialSchedule" hidden></div>' : ''}<div class="notice ${preliminary ? '' : 'unknown'}">${preliminary ? 'Résultats indicatifs fondés sur les hypothèses actuellement saisies ; ils ne constituent ni une offre bancaire ni un engagement de rentabilité.' : 'Les sensibilités, charges ou retours absents ne sont pas inventés et restent à confirmer.'}</div></section>
      <section class="report-page"><h2 class="pageTitle">${preliminary ? '05 · Risques et prochaines vérifications' : 'Risques, contrats et décision'}</h2>${preliminary ? '<p class="lead">Les informations ci-dessous reprennent les notes présentes dans le projet ; l’absence de constat dans le brouillon ne signifie pas absence de risque.</p>' : ''}<div class="facts">${risks}</div>${preliminary ? '<h3>À vérifier avant toute décision</h3><ul class="decisionChecks"><li>Confirmer les surfaces, l’état de la toiture et la faisabilité structurelle.</li><li>Remplacer les estimations d’investissement par les devis et conditions de raccordement.</li><li>Documenter l’assurance, la maintenance et les autres frais d’exploitation.</li><li>Vérifier les acteurs, contrats et pièces propres au projet.</li></ul>' : ''}<div class="notice ${presentation.provisional ? 'unknown' : ''}"><b>Statut du rapport : ${esc(presentation.label)}</b>${preliminary ? '<br>Des pièces et données restent à confirmer ; le rapport ne peut pas être publié.' : presentation.unresolvedCount ? `<br>${presentation.unresolvedCount} donnée(s) restent UNKNOWN ou périmée(s).` : ''}</div>${preliminary ? '<p class="small">Le rapport a été édité à la date indiquée en couverture. Il reste modifiable et ne valide aucune donnée du dossier.</p>' : `<div class="gate ${gate.ready ? '' : 'blocked'}"><b>${gate.ready ? 'Prérequis de publication satisfaits' : `Publication bloquée · ${gate.blockers?.length || 0} donnée(s) requise(s) manquante(s)`}</b>${blockers}</div><div class="notice unknown">Aucun score de risque ni avis d’investissement automatique n’est calculé par ce rapport.</div><p class="small">Empreinte du scénario : ${esc(payload.scenario?.frozen_snapshot_hash || 'UNKNOWN')} · Empreinte du rapport : ${esc(report.payload_hash || 'UNKNOWN')} · Moteur de rapport : ${esc(payload.engine_version || 'UNKNOWN')}</p>`}</section>`;
    if (preliminary) compactPreStudyPages(payload);
    renderCoverDetails(payload, preliminary);
    renderSummaryOverview(payload, preliminary);
    if (preliminary) {
      const performanceHeading = [...$('reportContent').querySelectorAll('.pageTitle')].find(node => node.textContent.includes('Performance solaire'));
      const performanceFacts = performanceHeading?.closest('.report-page')?.querySelector('.facts');
      if (performanceFacts) {
        const benchmarkHeading = document.createElement('h3');
        benchmarkHeading.textContent = 'Comparaison des repères annuels';
        const benchmarkChart = document.createElement('div');
        benchmarkChart.id = 'reportClimateBenchmarkChart';
        benchmarkChart.className = 'reportChart';
        benchmarkChart.hidden = true;
        const benchmarkNote = document.createElement('p');
        benchmarkNote.className = 'small';
        benchmarkNote.textContent = 'Même unité (kWh/an), mais deux références distinctes : la valeur PVGIS de l’étude et les repères issus de l’historique climatique. Cette comparaison visuelle ne modifie pas le scénario et ne constitue pas une garantie de production.';
        performanceFacts.after(benchmarkHeading, benchmarkChart, benchmarkNote);
        if (appendClimateBenchmarkChart(benchmarkChart, payload.visuals?.production, payload.visuals?.climate)) benchmarkChart.hidden = false;
        else { benchmarkHeading.remove(); benchmarkChart.remove(); benchmarkNote.remove(); }
      }
      const productionChart = $('reportProductionChart');
      if (appendProductionChart(productionChart, payload.visuals?.production)) productionChart.hidden = false;
      const climate = payload.visuals?.climate;
      const climateChart = $('reportClimateChart');
      if (appendClimateChart(climateChart, climate)) {
        climateChart.hidden = false;
        $('reportClimateNote').textContent = climate.interpretation || '';
      }
      const revenueChart = $('reportRevenueChart');
      if (appendRevenueChart(revenueChart, payload.visuals?.revenue)) revenueChart.hidden = false;
      else markChartUnavailable(revenueChart, 'Répartition non disponible : les volumes d’électricité valorisables ne sont pas renseignés ou validés.');
      const cashflowChart = $('reportCashflowChart');
      const cashflowChartAvailable = appendCashflowChart(cashflowChart, payload.visuals?.cashflow);
      if (cashflowChartAvailable) cashflowChart.hidden = false;
      const annualCashflowAvailable = appendAnnualCashflowTable($('reportAnnualCashflow'), payload.visuals?.cashflow);
      if (!cashflowChartAvailable && !annualCashflowAvailable) {
        markChartUnavailable(cashflowChart, 'Flux cumulés non disponibles : aucune série financière correspondante n’est présente dans les données reprises au rapport.');
      }
    }
    $('reportContent').hidden = false;
    $('reportStatus').hidden = true;
    $('publishReport').hidden = preliminary || report.status !== 'GENERATED';
    $('publishReport').disabled = !gate.ready;
    $('revokeReport').hidden = preliminary || report.status !== 'PUBLISHED';
    window.document.title = `${title} — ${preliminary ? 'Rapport provisoire' : 'Rapport scénario figé'}`;
    if (preliminary) { $('publishReport').hidden = true; $('revokeReport').hidden = true; }
  }

  function compactPreStudyPages(payload) {
    const content = $('reportContent');
    content.classList.add('report--prestudy');
    const pages = [...content.querySelectorAll('.report-page')];
    const pageWith = (fragment) => pages.find(page => page.querySelector('.pageTitle')?.textContent.includes(fragment));
    const cover = content.querySelector('.report-page.cover');
    const summary = pageWith('Synthèse du projet');
    const solar = pageWith('Performance solaire');
    const technical = pageWith('Configuration et coûts');
    const finance = pageWith('Résultats financiers');
    const risks = pageWith('Risques et prochaines vérifications');
    if (!cover || !summary || !solar || !technical || !finance || !risks) return;
    cover.classList.add('preStudyCover');
    solar.classList.add('preStudySolarPage');
    finance.classList.add('preStudyFinancePage');

    const summaryTitle = summary.querySelector('.pageTitle');
    if (summaryTitle) summaryTitle.textContent = 'Synthèse · repères du projet';
    const consumption = document.createElement('section');
    consumption.className = 'report-page preStudyConsumptionPage';
    consumption.innerHTML = '<h2 class="pageTitle">03 · Consommation et adéquation solaire</h2><p class="lead">Le profil présenté est un repère prospectif lorsqu’il est synthétique ; il ne représente pas la courbe réelle du compteur.</p><div class="facts" id="reportLoadFacts"></div><h3>Profil(s) de référence et provenance</h3><div id="reportMatchingProfileSources" class="matchingProvenance" hidden></div><h3>Production et consommation mensuelles</h3><div id="reportMatchingMonthlyChart" class="reportChart" hidden></div><p id="reportMatchingMonthlyUnknown" class="small">Profil mensuel compatible non disponible : aucun matching temporel n’est déduit d’un total annuel seul.</p><h3>Quantités valorisables · corridor de matching</h3><div id="reportMatchingCorridor" class="reportChart" hidden></div><p class="small">Les quantiles de matching sont empiriques et restent distincts des P50/P90 de production.</p>';
    const loadFact = solar.querySelector('[data-field-code="energy.load.annual"]');
    if (loadFact) consumption.querySelector('#reportLoadFacts').appendChild(loadFact);
    solar.after(consumption);

    const technicalFacts = technical.querySelector('.facts');
    const financeFacts = finance.querySelector('.facts');
    if (technicalFacts && financeFacts) financeFacts.before(technicalFacts);
    const financeTitle = finance.querySelector('.pageTitle');
    if (financeTitle) financeTitle.textContent = '04 · Économie et modèle commercial';
    const financeLead = finance.querySelector('.lead');
    if (financeLead) financeLead.textContent = 'CAPEX, OPEX et flux sont restitués selon le point de vue sélectionné. Le TRI des fonds propres inclut la dette et est calculé avant IS/IR.';
    const pricingHeading = document.createElement('h3'); pricingHeading.textContent = 'Corridor de prix ACC'; pricingHeading.hidden = true;
    const pricingChart = document.createElement('div'); pricingChart.id = 'reportPricingCases'; pricingChart.className = 'reportChart'; pricingChart.hidden = true;
    financeFacts?.after(pricingHeading, pricingChart);
    technical.remove();
    const risksTitle = risks.querySelector('.pageTitle');
    if (risksTitle) risksTitle.textContent = '05 · Faisabilité et prochaines étapes';

    const profileSources = consumption.querySelector('#reportMatchingProfileSources');
    if (appendMatchingProfileProvenance(profileSources, payload.visuals?.matching)) profileSources.hidden = false;
    else profileSources.previousElementSibling.hidden = true;
    appendMatchingEnergyChart(consumption.querySelector('#reportMatchingMonthlyChart'), payload.visuals?.matching);
    if (!consumption.querySelector('#reportMatchingMonthlyChart').hidden) consumption.querySelector('#reportMatchingMonthlyUnknown').hidden = true;
    const corridor = consumption.querySelector('#reportMatchingCorridor');
    if (appendMatchingCorridor(corridor, payload.visuals?.matching)) corridor.hidden = false;
    if (appendPricingCases(pricingChart, payload.visuals?.pricing)) { pricingChart.hidden = false; pricingHeading.hidden = false; }
  }
  async function canWrite() {
    const active = session();
    if (!active?.access_token || !reportRecord?.project_id) return false;
    const config = window.SOLARSHIFT_CONFIG || {};
    const base = config.supabaseUrl;
    const response = await fetch(`${base}/rest/v1/rpc/can_write_project`, {
      method: 'POST', headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${active.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_project: reportRecord.project_id })
    });
    return response.ok && await response.json().catch(() => false) === true;
  }
  async function act(action, reason = '') {
    const active = session();
    const config = window.SOLARSHIFT_CONFIG || {};
    if (!active?.access_token) throw new Error('Connexion requise.');
    const response = await fetch(endpoint, {
      method: 'POST', headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${active.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reportId: reportRecord.id, reason })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Erreur ${response.status}`);
    return result.report;
  }
  async function load() {
    const localId = query.get('local');
    if (localId) {
      const key = `ozeno-provisional-report:${localId}`;
      let saved;
      try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch { saved = null; }
      if (!saved?.report || saved.expiresAt < Date.now()) {
        localStorage.removeItem(key);
        return setMessage('Rapport provisoire absent ou expiré. Retournez à l’étude pour en générer un nouveau.', 'warn');
      }
      render(saved.report);
      $('publishReport').hidden = true;
      $('revokeReport').hidden = true;
      return;
    }
    if (!reportId) return setMessage('Identifiant de rapport manquant.', 'error');
    const active = session();
    if (!active?.access_token) return setMessage('Connexion requise. Ouvrez le rapport depuis votre session OZENO.', 'warn');
    const response = await fetch(`${endpoint}?id=${encodeURIComponent(reportId)}`, {
      headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${active.access_token}` }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return setMessage(result.error || `Rapport inaccessible (${response.status}).`, 'error');
    render(result.report);
    if (await canWrite()) {
      $('publishReport').hidden = reportRecord.status !== 'GENERATED';
      $('revokeReport').hidden = reportRecord.status !== 'PUBLISHED';
    } else {
      $('publishReport').hidden = true;
      $('revokeReport').hidden = true;
    }
  }
  $('printReport').addEventListener('click', () => window.print());
  $('publishReport').addEventListener('click', async () => {
    $('publishReport').disabled = true;
    try { await act('publish'); await load(); } catch (error) { setMessage(error.message, 'error'); }
  });
  $('revokeReport').addEventListener('click', async () => {
    const reason = window.prompt('Motif de révocation du rapport');
    if (!reason) return;
    $('revokeReport').disabled = true;
    try { await act('revoke', reason); await load(); } catch (error) { setMessage(error.message, 'error'); }
    finally { $('revokeReport').disabled = false; }
  });
  load().catch((error) => setMessage(error.message, 'error'));
})();
