/**
 * SolarShift pre-study building and electricity assumptions V1.
 * These versioned values are commercial estimates, never canonical data.
 */
export const PRESTUDY_BENCHMARK_REFERENCE = Object.freeze({
  id: 'PRESTUDY_BUILDING_BENCHMARKS',
  version: '2026.10.1',
  validFrom: '2026-10-11',
  sourceType: 'BUILDING_BENCHMARK',
  priceSourceType: 'PUBLIC_TARIFF_BENCHMARK',
  status: 'ASSUMPTION'
});

const BUILDINGS = Object.freeze({
  offices: Object.freeze({ type: 'OFFICE_TERTIARY', low: 70, ref: 120, high: 190, confidence: 'MEDIUM', power: '37_100_KVA', profile: 'OFFICE_DAYTIME' }),
  logistics: Object.freeze({ type: 'WAREHOUSE_LOGISTICS', low: 20, ref: 45, high: 90, confidence: 'MEDIUM', power: '101_250_KVA', profile: 'LOGISTICS_DRY', subtypes: Object.freeze({
    dry: Object.freeze({ low: 20, ref: 45, high: 90, confidence: 'MEDIUM', profile: 'LOGISTICS_DRY' }),
    cold: Object.freeze({ low: 150, ref: 280, high: 500, confidence: 'MEDIUM', profile: 'LOGISTICS_COLD_CONTINUOUS' }),
    unknown: Object.freeze({ low: 20, ref: 60, high: 280, confidence: 'LOW', profile: null })
  }) }),
  industry: Object.freeze({ type: 'INDUSTRY_WORKSHOP', low: 60, ref: 150, high: 300, confidence: 'LOW', power: 'GT_250_KVA_BT', profile: null }),
  retail: Object.freeze({ type: 'RETAIL_LARGE_STORE', low: 120, ref: 220, high: 400, confidence: 'MEDIUM', power: '101_250_KVA', profile: 'RETAIL_EXTENDED_DAYTIME' }),
  public: Object.freeze({ type: 'PUBLIC_FACILITY', low: 50, ref: 110, high: 220, confidence: 'MEDIUM', power: '37_100_KVA', profile: 'PUBLIC_DAYTIME' }),
  other: Object.freeze({ type: 'OTHER_PROFESSIONAL', low: 60, ref: 150, high: 300, confidence: 'LOW', power: '101_250_KVA', profile: 'GENERIC_PROFESSIONAL' })
});

const PRICE_REFERENCE = Object.freeze({
  LE_36_KVA: Object.freeze({ grid: [0.16, 0.19, 0.23], aci: [0.12, 0.15, 0.18] }),
  '37_100_KVA': Object.freeze({ grid: [0.14, 0.17, 0.21], aci: [0.10, 0.13, 0.16] }),
  '101_250_KVA': Object.freeze({ grid: [0.13, 0.16, 0.20], aci: [0.09, 0.12, 0.15] }),
  GT_250_KVA_BT: Object.freeze({ grid: [0.12, 0.15, 0.19], aci: [0.08, 0.11, 0.14] }),
  HTA: Object.freeze({ grid: [0.10, 0.14, 0.18], aci: [0.07, 0.10, 0.13] })
});

const INDUSTRY_PROFILES = Object.freeze({
  DAYTIME: 'INDUSTRY_DAYTIME', TWO_SHIFT: 'INDUSTRY_TWO_SHIFT', THREE_SHIFT: 'INDUSTRY_THREE_SHIFT', UNKNOWN: null
});

function validNonNegative(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
}

/** Use the map-measured outline as the site's building footprint, not as floor area. */
export function resolveBuildingConsumptionBenchmark({ buildingUse, subtype = 'unknown', industrySchedule = 'UNKNOWN', areaM2 } = {}) {
  const building = BUILDINGS[buildingUse];
  if (!building || !validNonNegative(areaM2) || Number(areaM2) <= 0) return null;
  const subtypeKey = String(subtype).toLowerCase();
  const selected = building.subtypes?.[subtypeKey] || building;
  const profile = buildingUse === 'industry'
    ? INDUSTRY_PROFILES[industrySchedule] ?? null
    : selected.profile;
  const area = Number(areaM2);
  return Object.freeze({
    buildingType: building.type,
    buildingSubtype: buildingUse === 'logistics' ? ({ dry: 'DRY', cold: 'COLD_STORAGE', unknown: 'UNKNOWN' }[subtypeKey] || 'UNKNOWN')
      : buildingUse === 'industry' ? industrySchedule : null,
    consumptionLowKwhYear: Math.round(area * selected.low),
    consumptionRefKwhYear: Math.round(area * selected.ref),
    consumptionHighKwhYear: Math.round(area * selected.high),
    intensityLowKwhM2Year: selected.low,
    intensityRefKwhM2Year: selected.ref,
    intensityHighKwhM2Year: selected.high,
    areaM2: area,
    areaBasis: 'MAPPED_BUILDING_FOOTPRINT',
    areaDescription: 'Emprise au sol du bâtiment mesurée sur le contour de la carte ; ce n’est pas la surface de plancher.',
    status: 'ASSUMPTION',
    sourceType: PRESTUDY_BENCHMARK_REFERENCE.sourceType,
    sourceNote: 'Benchmark SolarShift V1 construit à partir de références publiques ; valeur indicative, non mesurée et non officielle.',
    benchmarkId: PRESTUDY_BENCHMARK_REFERENCE.id,
    benchmarkVersion: PRESTUDY_BENCHMARK_REFERENCE.version,
    confidence: selected.confidence,
    usageProfileId: profile,
    suggestedPowerBand: building.power
  });
}

/** Real meter or invoice data wins; customer input wins over a benchmark. Zero is retained. */
export function resolveAnnualConsumption({ verifiedKwh, declaredKwh, benchmark } = {}) {
  if (validNonNegative(verifiedKwh)) return Object.freeze({ valueKwh: Number(verifiedKwh), status: 'VERIFIED', sourceType: 'VERIFIED_METER' });
  if (validNonNegative(declaredKwh)) return Object.freeze({ valueKwh: Number(declaredKwh), status: 'DECLARED', sourceType: 'CUSTOMER_DECLARATION' });
  if (validNonNegative(benchmark?.consumptionRefKwhYear)) return Object.freeze({
    valueKwh: Number(benchmark.consumptionRefKwhYear),
    corridorKwh: Object.freeze({ low: benchmark.consumptionLowKwhYear, ref: benchmark.consumptionRefKwhYear, high: benchmark.consumptionHighKwhYear }),
    status: 'ASSUMPTION', sourceType: 'BUILDING_BENCHMARK', benchmarkVersion: benchmark.benchmarkVersion,
    confidence: benchmark.confidence, usageProfileId: benchmark.usageProfileId, areaBasis: benchmark.areaBasis
  });
  return Object.freeze({ valueKwh: null, status: 'UNKNOWN', sourceType: null });
}

export function resolvePowerBand({ buildingUse, selectedBand, exactKva } = {}) {
  if (Number.isFinite(Number(exactKva)) && Number(exactKva) > 0) {
    const kva = Number(exactKva);
    const band = kva <= 36 ? 'LE_36_KVA' : kva <= 100 ? '37_100_KVA' : kva <= 250 ? '101_250_KVA' : 'GT_250_KVA_BT';
    return Object.freeze({ value: kva, band, status: 'DECLARED', sourceType: 'CUSTOMER_DECLARATION' });
  }
  if (selectedBand && selectedBand !== 'UNKNOWN') return Object.freeze({ value: null, band: selectedBand, status: 'DECLARED', sourceType: 'CUSTOMER_DECLARATION' });
  const suggested = selectedBand === 'UNKNOWN' ? null : BUILDINGS[buildingUse]?.power || null;
  return suggested
    ? Object.freeze({ value: null, band: suggested, status: 'ASSUMPTION', sourceType: 'BUILDING_BENCHMARK', benchmarkVersion: PRESTUDY_BENCHMARK_REFERENCE.version })
    : Object.freeze({ value: null, band: null, status: 'UNKNOWN', sourceType: null });
}

/** HT benchmarks are deliberately not compared with a TTC declaration. */
export function resolveElectricityPrice({ selectedBand, declaredEurPerKwh, declaredBasis = 'HT' } = {}) {
  if (validNonNegative(declaredEurPerKwh)) {
    return Object.freeze({ valueEurPerKwh: Number(declaredEurPerKwh), basis: declaredBasis, status: declaredBasis === 'HT' ? 'DECLARED' : 'PARTIAL', sourceType: 'CUSTOMER_DECLARATION', usableForHtEconomics: declaredBasis === 'HT' });
  }
  const prices = PRICE_REFERENCE[selectedBand];
  if (!prices) return Object.freeze({ valueEurPerKwh: null, basis: 'HT', status: 'UNKNOWN', sourceType: null, usableForHtEconomics: false });
  return Object.freeze({
    valueEurPerKwh: prices.grid[1],
    corridorEurPerKwh: Object.freeze({ low: prices.grid[0], ref: prices.grid[1], high: prices.grid[2] }),
    aciAvoidableCorridorEurPerKwh: Object.freeze({ low: prices.aci[0], ref: prices.aci[1], high: prices.aci[2] }),
    basis: 'HT', status: 'ASSUMPTION', sourceType: 'PUBLIC_TARIFF_BENCHMARK',
    benchmarkVersion: PRESTUDY_BENCHMARK_REFERENCE.version, usableForHtEconomics: true,
    sourceNote: 'Benchmark SolarShift construit à partir de références publiques ; ne constitue pas un tarif CRE.'
  });
}

export const PRESTUDY_BUILDING_TYPES = Object.freeze(Object.fromEntries(Object.entries(BUILDINGS).map(([key, value]) => [key, value.type])));
