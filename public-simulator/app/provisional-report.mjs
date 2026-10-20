const requiredDocuments = ['EPC_QUOTATION', 'STRUCTURAL_STUDY', 'ROOF_RIGHT', 'MANDATE', 'GRID_CONNECTION', 'ENERGY_STUDY', 'P50_P90_STUDY'];

const clean = value => String(value ?? '').trim();
const unknownValue = value => !clean(value) || /^(?:à calculer|non renseigné|non disponible|unknown(?:\s*[·:].*)?|répartition à corriger|—|-)$/i.test(clean(value));

function sectionForLabel(label) {
  const value = clean(label).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/risque|preuve|document|contrat|acteur|donnee|unknown|manquant/.test(value)) return 'risks';
  if (/capex|opex|cout|investissement|surface|capacite|panneau|configuration|toiture/.test(value)) return 'technical';
  if (/production|consommation|energie|rendement|performance|pvgis|p50|p90|kwh/.test(value)) return 'energy';
  if (/tri|irr|van|recette|revenu|vente|economie|fonds propres|retour|dette|financ/.test(value)) return 'financial';
  return 'executive';
}

function metricCode(label, index) {
  const value = clean(label).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/opex.*hypoth|hypoth.*opex/.test(value)) return 'opex.assumption.annual';
  if (/climate.*p50|p50.*climate/.test(value)) return 'energy.climate_p50';
  if (/climate.*p75|p75.*climate/.test(value)) return 'energy.climate_p75';
  if (/climate.*p90|p90.*climate/.test(value)) return 'energy.climate_p90';
  if (/capex/.test(value)) return 'capex.total';
  if (/opex/.test(value)) return 'opex.annual';
  if (/rendement specifique|kwh\/kwc|specific yield/.test(value)) return 'energy.specific_yield';
  if (/production/.test(value)) return 'energy.production.annual';
  if (/consommation/.test(value)) return 'energy.load.annual';
  if (/tri|irr/.test(value)) return 'financial.irr';
  if (/van|npv/.test(value)) return 'financial.npv';
  if (/retour|payback/.test(value)) return 'financial.payback';
  if (/recette|revenu|vente|economie/.test(value)) {
    if (/30\s*ans|30\s*years/.test(value)) return 'financial.project_revenue_30_years';
    if (/annee\s*1|an\s*1|year\s*1/.test(value)) return 'financial.project_revenue_year_1';
    return `financial.project_revenue.${index + 1}`;
  }
  return `preliminary.metric.${index + 1}`;
}

function fact(fieldCode, label, value, section, generatedAt) {
  const present = !unknownValue(value);
  return {
    field_code: fieldCode,
    label,
    value: present ? clean(value) : null,
    unit: '',
    status: present ? 'ASSUMPTION' : 'UNKNOWN',
    source_type: present ? 'LOCAL_COMMERCIAL_DRAFT' : null,
    source_reference: null,
    document_id: null,
    calculation_method: present ? 'Valeur issue du brouillon d’étude préalable ; non canonique' : null,
    engine_version: null,
    calculated_at: generatedAt,
    verified_at: null,
    unknown_reason: present ? null : 'Valeur canonique ou justificatif non disponible au stade de l’étude préalable.',
    stale_reason: null,
    section
  };
}

function roofRings(snapshot) {
  const rings = [];
  for (const surface of Array.isArray(snapshot?.surfaces) ? snapshot.surfaces : []) {
    const geometry = surface?.geometry?.geometry || surface?.geometry;
    const sourceRings = geometry?.type === 'Polygon'
      ? [geometry.coordinates?.[0]]
      : geometry?.type === 'MultiPolygon'
        ? geometry.coordinates?.map(polygon => polygon?.[0]) || []
        : [];
    for (const source of sourceRings) {
      const points = (Array.isArray(source) ? source : [])
        .map(point => [Number(point?.[0]), Number(point?.[1])])
        .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
      if (points.length > 1 && points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1]) points.pop();
      if (points.length < 3) continue;
      const stride = Math.max(1, Math.ceil(points.length / 80));
      const sampled = points.filter((_, index) => index % stride === 0).slice(0, 80);
      if (sampled.length >= 3) rings.push(sampled);
      if (rings.length >= 8) break;
    }
    if (rings.length >= 8) break;
  }
  return rings;
}

function normalizeRoofDrawing(snapshot) {
  const rings = roofRings(snapshot);
  const allPoints = rings.flat();
  if (!allPoints.length) return [];
  const xs = allPoints.map(([x]) => x), ys = allPoints.map(([, y]) => y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = maxX - minX, height = maxY - minY;
  if (width <= 0 || height <= 0) return [];
  const scale = Math.min(940 / width, 520 / height);
  const offsetX = (1000 - width * scale) / 2, offsetY = (600 - height * scale) / 2;
  return rings.map(ring => ring.map(([x, y]) => [
    Math.round(offsetX + (x - minX) * scale),
    Math.round(offsetY + (maxY - y) * scale)
  ]));
}

function buildRoofSatellitePreview(snapshot) {
  const rings = roofRings(snapshot);
  const geographicRings = rings.filter(ring => ring.every(([longitude, latitude]) =>
    longitude >= -180 && longitude <= 180 && latitude >= -85 && latitude <= 85
  ));
  if (!geographicRings.length) return null;
  const allPoints = geographicRings.flat();
  const longitudes = allPoints.map(([longitude]) => longitude);
  const latitudes = allPoints.map(([, latitude]) => latitude);
  const centerLongitude = (Math.min(...longitudes) + Math.max(...longitudes)) / 2;
  const centerLatitude = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
  const columns = 4, rows = 3, tileSize = 256;
  const zoomFor = (longitude, latitude, zoom) => {
    const worldSize = tileSize * 2 ** zoom;
    const sinLatitude = Math.sin(latitude * Math.PI / 180);
    return {
      x: (longitude + 180) / 360 * worldSize,
      y: (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * worldSize
    };
  };
  let zoom = 10;
  for (let candidate = 19; candidate >= 10; candidate--) {
    const projected = allPoints.map(([longitude, latitude]) => zoomFor(longitude, latitude, candidate));
    const width = Math.max(...projected.map(point => point.x)) - Math.min(...projected.map(point => point.x));
    const height = Math.max(...projected.map(point => point.y)) - Math.min(...projected.map(point => point.y));
    if (width <= 740 && height <= 150) { zoom = candidate; break; }
  }
  const center = zoomFor(centerLongitude, centerLatitude, zoom);
  const worldTiles = 2 ** zoom;
  const startX = Math.max(0, Math.min(worldTiles - columns, Math.round(center.x / tileSize - columns / 2)));
  const startY = Math.max(0, Math.min(worldTiles - rows, Math.floor(center.y / tileSize) - Math.floor(rows / 2)));
  const roofCenterX = center.x - startX * tileSize;
  const roofCenterY = center.y - startY * tileSize;
  const panX = Math.round((columns * tileSize / 2) - roofCenterX);
  const panY = Math.round((rows * tileSize / 2) - roofCenterY);
  const polygons = geographicRings.map(ring => ring.map(([longitude, latitude]) => {
    const point = zoomFor(longitude, latitude, zoom);
    return [Math.round(point.x - startX * tileSize), Math.round(point.y - startY * tileSize)];
  }));
  if (polygons.flat().some(([x, y]) => x < 0 || x > columns * tileSize || y < 0 || y > rows * tileSize)) return null;
  const tiles = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      tiles.push({ x: startX + column, y: startY + row, column, row });
    }
  }
  return { zoom, columns, rows, width: columns * tileSize, height: rows * tileSize, panX, panY, tiles, polygons };
}

const finite = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

function reportMatching(matching) {
  if (!matching || typeof matching !== 'object') return null;
  const metricNames = ['aciEnergyKwh', 'accEnergyKwh', 'surplusEnergyKwh', 'gridImportKwh', 'selfConsumptionRatePct', 'coverageRatePct', 'temporalMatchPct'];
  const metrics = Object.fromEntries(metricNames.map(name => [name, Object.fromEntries(['reference', 'low', 'median', 'high'].map(key => [key, finite(matching.metrics?.[name]?.[key])]))]));
  const cleanMonthly = rows => Array.isArray(rows) ? rows.slice(0, 12).filter(row => Number.isInteger(Number(row?.year)) && Number.isInteger(Number(row?.month)) && Number(row.month) >= 1 && Number(row.month) <= 12)
    .map(row => ({ year: Number(row.year), month: Number(row.month), productionKwh: finite(row.productionKwh), totalLoadKwh: finite(row.totalLoadKwh), producerLoadKwh: finite(row.producerLoadKwh), accPoolLoadKwh: finite(row.accPoolLoadKwh), aciEnergyKwh: finite(row.aciEnergyKwh), accEnergyKwh: finite(row.accEnergyKwh), surplusEnergyKwh: finite(row.surplusEnergyKwh), gridImportKwh: finite(row.gridImportKwh) })) : [];
  const monthlyScenarios = Array.isArray(matching.monthlyScenarios)
    ? matching.monthlyScenarios.slice(0, 100).map((row, index) => ({ scenarioId: clean(row?.scenarioId) || `profile-${index + 1}`, sourceIds: Array.isArray(row?.sourceIds) ? row.sourceIds.slice(0, 20).map(clean) : [], profileProvenance: cleanProfileProvenance(row?.profileProvenance), monthly: cleanMonthly(row?.monthly) }))
    : Array.isArray(matching.monthly) ? [{ scenarioId: clean(matching.scenarioId) || 'reference', sourceIds: Array.isArray(matching.sourceIds) ? matching.sourceIds.slice(0, 20).map(clean) : [], profileProvenance: cleanProfileProvenance(matching.profileProvenance), monthly: cleanMonthly(matching.monthly) }] : [];
  const profileProvenance = monthlyScenarios.flatMap(row => row.profileProvenance).filter((profile, index, profiles) => profiles.findIndex(other => JSON.stringify(other) === JSON.stringify(profile)) === index);
  return {
    status: clean(matching.status) || 'UNKNOWN', methodVersion: clean(matching.methodVersion) || null,
    calculatedAt: clean(matching.calculatedAt) || null, corridorType: clean(matching.corridorType) || null,
    profileCount: Number.isInteger(matching.profileCount) ? matching.profileCount : null,
    quantiles: matching.quantiles && typeof matching.quantiles === 'object' ? { low: finite(matching.quantiles.low), median: finite(matching.quantiles.median), high: finite(matching.quantiles.high) } : null,
    referenceScenarioId: clean(matching.referenceScenarioId) || (monthlyScenarios.length === 1 ? monthlyScenarios[0].scenarioId : null),
    sourceIds: Array.isArray(matching.sourceIds) ? matching.sourceIds.slice(0, 100).map(clean) : [],
    profileProvenance, metrics, monthlyScenarios
  };
}

function cleanProfileProvenance(profiles) {
  if (!Array.isArray(profiles)) return [];
  return profiles.slice(0, 20).filter(profile => profile && typeof profile === 'object').map(profile => ({
    sourceType: clean(profile.sourceType) || 'UNKNOWN',
    sourceVersion: clean(profile.sourceVersion) || null,
    sourceReference: clean(profile.sourceReference) || null,
    activityCode: clean(profile.activityCode) || null,
    selectionMatchLevel: clean(profile.selectionMatchLevel) || null,
    selectionStatus: clean(profile.selectionStatus) || null,
    maturity: clean(profile.maturity) || 'UNKNOWN',
    confidence: clean(profile.confidence) || 'UNKNOWN',
    referenceYear: Number.isInteger(profile.referenceYear) ? profile.referenceYear : null,
    resolutionMinutes: Number.isFinite(Number(profile.resolutionMinutes)) && profile.resolutionMinutes > 0 ? Number(profile.resolutionMinutes) : null
  }));
}

function reportPricing(pricing) {
  if (!pricing || typeof pricing !== 'object') return null;
  const priceCorridor = pricing.accPriceCorridor;
  const cases = Object.fromEntries(['low', 'reference', 'high'].map(key => {
    const item = priceCorridor?.[key];
    return [key, item ? {
      caseId: clean(item.caseId), priceEurPerKwh: finite(item.priceEurPerKwh), sourceType: clean(item.sourceType),
      sourceReference: clean(item.sourceReference), sourceVersion: clean(item.sourceVersion), effectiveFrom: clean(item.effectiveFrom),
      unitBasis: clean(item.unitBasis), taxBasis: clean(item.taxBasis), vatBasis: clean(item.vatBasis), confidence: clean(item.confidence)
    } : null];
  }));
  return {
    status: clean(pricing.status) || clean(priceCorridor?.status) || 'UNKNOWN',
    engineVersion: clean(pricing.engineVersion) || clean(priceCorridor?.engineVersion) || null,
    calculatedAt: clean(pricing.calculatedAt) || clean(priceCorridor?.calculatedAt) || null,
    accPriceCorridor: {
      status: clean(priceCorridor?.status) || 'UNKNOWN', unitBasis: clean(priceCorridor?.unitBasis) || null,
      taxBasis: clean(priceCorridor?.taxBasis) || null, vatBasis: clean(priceCorridor?.vatBasis) || null, cases
    }
  };
}

/** Create a local, explicitly non-canonical CR-007-shaped preliminary report. */
export function buildProvisionalReport({ id, title, site, financialViewpoint = 'OWNER', representative = {}, metrics = [], sections = [], visuals = {}, generatedAt = new Date().toISOString() }) {
  const safeViewpoint = ['INVESTOR', 'SPV'].includes(financialViewpoint) ? financialViewpoint : 'OWNER';
  const safeType = safeViewpoint === 'OWNER' ? 'OWNER' : 'INVESTOR';
  const facts = [
    fact('project.name', 'Projet', title, 'executive', generatedAt),
    fact('project.site', 'Site', site, 'executive', generatedAt)
  ];

  metrics.forEach((metric, index) => {
    const label = clean(metric?.label) || `Indicateur commercial ${index + 1}`;
    facts.push(fact(metricCode(label, index), label, metric?.value, sectionForLabel(label), generatedAt));
  });
  sections.forEach((item, index) => {
    const text = clean(item?.text);
    if (text) facts.push(fact(`preliminary.note.${index + 1}`, clean(item.title) || 'Note de l’étude préalable', text, sectionForLabel(item.title), generatedAt));
  });

  const unknownFacts = [
    ['scenario.canonical', 'Scénario canonique'], ['scenario.freeze', 'Instantané FREEZE'], ['scenario.validation', 'Validation canonique'],
    ['energy.modelled_p50', 'Modelled P50'], ['energy.modelled_p90', 'Modelled P90'],
    ['energy.climate_p50', 'Production historique médiane (P50)'], ['energy.climate_p75', 'Production historique prudente (P75)'], ['energy.climate_p90', 'Production historique basse (P90)'],
    ['technical.solar_areas', 'Surface solaire confirmée'], ['opex.annual', 'OPEX confirmé'],
    ['financial.run', 'Simulation financière enregistrée'], ['actors.snapshot', 'Parties prenantes confirmées'],
    ['risk.score', 'Score de risque'], ['resilience.score', 'Indicateur de résilience'], ['contracts.status', 'État des contrats']
  ];
  const existingCodes = new Set(facts.map(item => item.field_code));
  unknownFacts.forEach(([code, label]) => {
    if (!existingCodes.has(code)) facts.push(fact(code, label, null, code.startsWith('energy.') ? 'energy' : code.startsWith('technical.') || code.startsWith('opex.') ? 'technical' : code.startsWith('financial.') ? 'financial' : 'risks', generatedAt));
  });
  facts.push({
    field_code: 'data.cutoff', label: 'Rapport généré le', value: generatedAt, unit: '', status: 'ASSUMPTION',
    source_type: 'LOCAL_REPORT_ASSEMBLY', source_reference: null, document_id: null, calculation_method: 'Date de création du rapport provisoire',
    engine_version: 'CR-007 preliminary local V1', calculated_at: generatedAt, verified_at: null, unknown_reason: null, stale_reason: null, section: 'risks'
  });

  const blockers = ['scenario.canonical', 'scenario.freeze', 'scenario.validation', ...unknownFacts.map(([code]) => code)];
  return {
    id,
    project_id: null,
    status: 'PROVISIONAL',
    report_version: 1,
    generated_at: generatedAt,
    payload: {
      report_mode: 'PRELIMINARY_DRAFT',
      report_type: safeType,
      financial_viewpoint: safeViewpoint,
      representative: {
        name: clean(representative.name),
        email: clean(representative.email),
        phone: clean(representative.phone)
      },
      generated_at: generatedAt,
      engine_version: 'CR-007 preliminary local V1',
      scenario: { id: null, name: 'Étude préalable · brouillon local', status: 'DRAFT', version: 'local', frozen_snapshot_hash: null },
      facts,
      visuals: {
        roof: { polygons: normalizeRoofDrawing(visuals.roof), satellite: buildRoofSatellitePreview(visuals.roof) },
        matching: reportMatching(visuals.matching),
        pricing: reportPricing(visuals.pricing),
        climate: Array.isArray(visuals.climate?.annual) ? {
          annual: visuals.climate.annual.filter(item => Number.isFinite(Number(item?.year)) && Number.isFinite(Number(item?.productionKwh))).map(item => ({ year: Number(item.year), productionKwh: Number(item.productionKwh) })),
          p50Kwh: visuals.climate.p50Kwh != null && Number.isFinite(Number(visuals.climate.p50Kwh)) ? Number(visuals.climate.p50Kwh) : null,
          p75Kwh: visuals.climate.p75Kwh != null && Number.isFinite(Number(visuals.climate.p75Kwh)) ? Number(visuals.climate.p75Kwh) : null,
          p90Kwh: visuals.climate.p90Kwh != null && Number.isFinite(Number(visuals.climate.p90Kwh)) ? Number(visuals.climate.p90Kwh) : null,
          interpretation: clean(visuals.climate.interpretation)
        } : null,
        production: Array.isArray(visuals.production?.monthlyKwh) && visuals.production.monthlyKwh.length === 12 ? {
          monthlyKwh: visuals.production.monthlyKwh.map(Number).filter(value => Number.isFinite(value) && value >= 0),
          annualKwh: visuals.production.annualKwh != null && Number.isFinite(Number(visuals.production.annualKwh)) ? Number(visuals.production.annualKwh) : null,
          consumptionAnnualKwh: visuals.production.consumptionAnnualKwh != null && Number.isFinite(Number(visuals.production.consumptionAnnualKwh)) ? Number(visuals.production.consumptionAnnualKwh) : null
        } : null,
        revenue: Array.isArray(visuals.revenue?.items) ? {
          title: clean(visuals.revenue.title) || 'Répartition des économies et recettes · année 1',
          unit: clean(visuals.revenue.unit) || '€/an',
          items: visuals.revenue.items.filter(item => Number.isFinite(Number(item?.value)) && Number(item.value) >= 0).map(item => ({ label: clean(item.label), value: Number(item.value), color: /^#[0-9a-f]{6}$/i.test(item.color || '') ? item.color : '#5aaa8d' }))
        } : null,
        cashflow: Array.isArray(visuals.cashflow?.cumulativeEur) ? {
          cumulativeEur: visuals.cashflow.cumulativeEur.filter(Number.isFinite),
          interpretation: clean(visuals.cashflow.interpretation),
          horizonYears: Number(visuals.cashflow.horizonYears) || null,
          basis: clean(visuals.cashflow.basis),
          financing: {
            capexEur: Number.isFinite(Number(visuals.cashflow.financing?.capexEur)) ? Number(visuals.cashflow.financing.capexEur) : null,
            installationCapexEur: Number.isFinite(Number(visuals.cashflow.financing?.installationCapexEur)) ? Number(visuals.cashflow.financing.installationCapexEur) : null,
            totalCapexEur: Number.isFinite(Number(visuals.cashflow.financing?.totalCapexEur)) ? Number(visuals.cashflow.financing.totalCapexEur) : null,
            initialProjectCommissionEur: Number.isFinite(Number(visuals.cashflow.financing?.initialProjectCommissionEur)) ? Number(visuals.cashflow.financing.initialProjectCommissionEur) : null,
            totalInitialInvestmentEur: Number.isFinite(Number(visuals.cashflow.financing?.totalInitialInvestmentEur)) ? Number(visuals.cashflow.financing.totalInitialInvestmentEur) : null,
            equityEur: Number.isFinite(Number(visuals.cashflow.financing?.equityEur)) ? Number(visuals.cashflow.financing.equityEur) : null,
            debtEur: Number.isFinite(Number(visuals.cashflow.financing?.debtEur)) ? Number(visuals.cashflow.financing.debtEur) : null
          },
          annualRows: Array.isArray(visuals.cashflow.annualRows) ? visuals.cashflow.annualRows.slice(0, 101).filter(row => row && Number.isInteger(Number(row.year)) && Number.isFinite(Number(row.equityCashflowEur)) && Number.isFinite(Number(row.cumulativeEquityCashflowEur))).map(row => ({
            year: Number(row.year),
            productionKwh: Number.isFinite(Number(row.productionKwh)) ? Number(row.productionKwh) : null,
            weightedEnergyValueEurPerKwh: row.weightedEnergyValueEurPerKwh == null || !Number.isFinite(Number(row.weightedEnergyValueEurPerKwh)) ? null : Number(row.weightedEnergyValueEurPerKwh),
            energyValueEur: Number.isFinite(Number(row.energyValueEur)) ? Number(row.energyValueEur) : null,
            maintenanceEur: Number.isFinite(Number(row.maintenanceEur)) ? Number(row.maintenanceEur) : null,
            insuranceEur: Number.isFinite(Number(row.insuranceEur)) ? Number(row.insuranceEur) : null,
            managementCommissionEur: Number.isFinite(Number(row.managementCommissionEur)) ? Number(row.managementCommissionEur) : null,
            initialProjectCommissionEur: Number.isFinite(Number(row.initialProjectCommissionEur)) ? Number(row.initialProjectCommissionEur) : null,
            totalInitialInvestmentEur: Number.isFinite(Number(row.totalInitialInvestmentEur)) ? Number(row.totalInitialInvestmentEur) : null,
            rentEur: Number.isFinite(Number(row.rentEur)) ? Number(row.rentEur) : null,
            opexEur: Number.isFinite(Number(row.opexEur)) ? Number(row.opexEur) : null,
            debtInterestEur: Number.isFinite(Number(row.debtInterestEur)) ? Number(row.debtInterestEur) : null,
            debtPrincipalEur: Number.isFinite(Number(row.debtPrincipalEur)) ? Number(row.debtPrincipalEur) : null,
            debtServiceEur: Number.isFinite(Number(row.debtServiceEur)) ? Number(row.debtServiceEur) : null,
            equityCashflowEur: Number(row.equityCashflowEur),
            cumulativeEquityCashflowEur: Number(row.cumulativeEquityCashflowEur),
            initialCapexEur: Number.isFinite(Number(row.initialCapexEur)) ? Number(row.initialCapexEur) : null,
            debtDrawdownEur: Number.isFinite(Number(row.debtDrawdownEur)) ? Number(row.debtDrawdownEur) : null
          })) : []
        } : null
      },
      publication_gate: { ready: false, blockers },
      data_room: {
        required_types: requiredDocuments.map(document_type => ({ document_type, status: 'UNKNOWN' })),
        files: []
      }
    }
  };
}
