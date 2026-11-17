/* CR-OOI-001 V0.4 — visualisation seulement, aucune persistance, aucun recalcul métier. */
import { installV10, mountDocumentaryBand, formatPortfolio, portfolioMetadata, portfolioPresentation, showPortfolioPreview, composePrestudyV10 } from './ooi-v10.mjs?v=20261113-portfolio-save-fix-1';
export { portfolioMetadata, portfolioPresentation, showPortfolioPreview };
const FAMILY_LABELS = Object.freeze(['Site', 'Surfaces', 'Énergie', 'Risques', 'Finance']);
const KNOWN = new Set(['filled', 'missing', 'unknown']);

export function isVisualPreviewEnabled(config = {}, hostname = '', search = '') {
  const local = new Set(['localhost', '127.0.0.1', '::1', '[::1]']).has(String(hostname).toLowerCase());
  if (!local) return false;
  return config.OOI_VISUAL_PREVIEW_ENABLED === true ||
    new URLSearchParams(search).get('OOI_VISUAL_PREVIEW_ENABLED') === 'true';
}

// A visual split is allowed only for the current, persisted temporal result whose channel
// volumes reconcile with its own production/conservation record. Percentages are display-only.
export function buildTemporalEnergyDistribution({ eligible = false, method, maturity, matching, productionKwh } = {}) {
  if (!eligible || method !== 'TEMPORAL_MATCHING' || maturity !== 'CANONICAL' || matching?.status !== 'READY') return null;
  const channels = [
    { id: 'ACI', label: 'ACI', valueKwh: matching.aciEnergyKwh },
    { id: 'ACC', label: 'ACC', valueKwh: matching.accEnergyKwh },
    { id: 'SURPLUS', label: 'Surplus', valueKwh: matching.surplusEnergyKwh }
  ];
  const conservation = matching.conservation;
  const volumes = [productionKwh, matching.pvProductionKwh, conservation?.pvKwh, conservation?.aciKwh,
    conservation?.accKwh, conservation?.surplusKwh, ...channels.map((item) => item.valueKwh)];
  if (!volumes.every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0)
    || typeof conservation?.residualKwh !== 'number' || !Number.isFinite(conservation.residualKwh)) return null;
  const tolerance = Math.max(0.01, productionKwh * 0.000001);
  const close = (left, right) => Math.abs(left - right) <= tolerance;
  const totalKwh = channels.reduce((sum, item) => sum + item.valueKwh, 0);
  if (productionKwh <= 0 || !close(matching.pvProductionKwh, productionKwh) || !close(conservation.pvKwh, productionKwh)
    || !close(conservation.aciKwh, channels[0].valueKwh) || !close(conservation.accKwh, channels[1].valueKwh)
    || !close(conservation.surplusKwh, channels[2].valueKwh) || !close(conservation.residualKwh, 0)
    || !close(totalKwh, productionKwh)) return null;
  return {
    totalKwh,
    channels: channels.map((item) => ({ ...item, sharePct: item.valueKwh / totalKwh * 100 }))
  };
}

export function temporalEnergyDistributionMarkup(options = {}) {
  const distribution = buildTemporalEnergyDistribution(options);
  if (!distribution) return '';
  const segments = distribution.channels.map((item) => `<span class="ooiEnergySegment ooiEnergySegment--${item.id.toLowerCase()}" style="width:${item.sharePct.toFixed(4)}%" aria-hidden="true"></span>`).join('');
  const legend = distribution.channels.map((item) => `<li><span class="ooiEnergySwatch ooiEnergySwatch--${item.id.toLowerCase()}" aria-hidden="true"></span><b>${item.label}</b><span>${(item.valueKwh / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} MWh</span><span>${item.sharePct.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %</span></li>`).join('');
  return `<figure class="ooiEnergyDistribution"><figcaption>Répartition annuelle · résultat temporel du run courant · total ${(distribution.totalKwh / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} MWh</figcaption><div class="ooiEnergyBar" role="img" aria-label="Répartition ACI, ACC et surplus du résultat temporel courant">${segments}</div><ul>${legend}</ul></figure>`;
}

// On détermine la disponibilité de la donnée, pas la qualité du projet.
export function portfolioStates(record = {}) {
  const states = ['unknown', 'unknown', 'unknown', 'unknown', 'unknown'];
  if (typeof record.address === 'string') states[0] = record.address.trim() ? 'filled' : 'missing';
  const preview = record.portfolioSummary || record.preview || {};
  const controls = preview.controls || {};
  const metrics = preview.portfolioMetrics || {};
  const roofs = preview.roofs;
  if (Array.isArray(roofs?.surfaces)) {
    const candidates = roofs.surfaces.filter((s) =>
      ['Polygon', 'MultiPolygon'].includes(s?.geometry?.geometry?.type));
    states[1] = candidates.length || (Number(controls.roofTotal) > 0 && Number.isFinite(Number(controls.roofTotal))) ? 'filled' : 'missing';
  } else if (Number(controls.roofTotal) > 0 && Number.isFinite(Number(controls.roofTotal))) {
    states[1] = 'filled';
  }
  const hasProduction = Number.isFinite(Number(metrics.productionKwh)) && Number(metrics.productionKwh) > 0
    || Number.isFinite(Number(controls.annual)) && Number(controls.annual) > 0;
  const hasManualProduction = controls.annualManualFallbackSource === 'MANUAL_ASSUMPTION'
    && Number.isFinite(Number(controls.annualManualFallbackKwh)) && Number(controls.annualManualFallbackKwh) > 0;
  const hasConsumption = Number.isFinite(Number(controls.cons)) && Number(controls.cons) > 0;
  if (hasProduction || hasManualProduction || hasConsumption) states[2] = 'filled';
  if (Array.isArray(preview.risks) && preview.risks.length > 0) states[3] = 'filled';
  const hasSavedFinancialInputs = ['capexPerKwp', 'aciPrice', 'accPrice', 'debtShare']
    .some((key) => controls[key] != null && String(controls[key]).trim() !== '');
  if (Number.isFinite(Number(metrics.capexEur)) && Number(metrics.capexEur) > 0 || hasSavedFinancialInputs) states[4] = 'filled';
  // These indicators describe saved information only. They do not certify
  // the engineering, risk review, funding eligibility, or financial decision.
  return states;
}

export function prestudyStates({ address, surfaceArea, production, risks, finance } = {}) {
  const states = ['unknown', 'unknown', 'unknown', 'unknown', 'unknown'];
  if (typeof address === 'string') states[0] = address.trim() ? 'filled' : 'missing';
  if (Number.isFinite(surfaceArea) && surfaceArea > 0) states[1] = 'filled';
  if (production?.status === 'READY' && Number.isFinite(production.annualKwh) && production.annualKwh > 0) states[2] = 'filled';
  if (Array.isArray(risks) && risks.length) states[3] = 'filled';
  // Liste vide = pas de constat, PAS confirmation d'absence de risque.
  if (finance?.status === 'READY' && Number.isFinite(finance.projectIrrPct)) states[4] = 'filled';
  return states;
}

export function completenessSummary(states) {
  const values = FAMILY_LABELS.map((_, i) => KNOWN.has(states?.[i]) ? states[i] : 'unknown');
  const filled = values.filter((value) => value === 'filled').length;
  const missing = values.filter((value) => value === 'missing').length;
  const unknown = values.filter((value) => value === 'unknown').length;
  return Object.freeze({ filled, missing, unknown, complete: unknown === 0, values });
}

function node(tag, text, className) {
  const item = document.createElement(tag);
  if (text != null) item.textContent = String(text);
  if (className) item.className = className;
  return item;
}

export function completenessElement(states, { compact = false, scope = '' } = {}) {
  const info = completenessSummary(states);
  const root = node('div', null, compact ? 'ooiCompleteness ooiCompletenessCompact' : 'ooiCompleteness');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'État indicatif des informations du dossier');
  const text = info.complete ? `${info.filled}/5 familles renseignées` : 'Complétude partielle · non déterminable';
  root.append(node('div', text, 'ooiCompletenessLabel'));
  const bar = node('div', null, 'ooiSegments');
  FAMILY_LABELS.forEach((label, i) => {
    const segment = node('span', null, `ooiSegment is-${info.values[i]}`);
    segment.title = `${label} : ${info.values[i] === 'filled' ? 'information renseignée' : info.values[i] === 'missing' ? 'à compléter' : 'indéterminé'}`;
    segment.setAttribute('aria-label', segment.title);
    bar.append(segment);
  });
  root.append(bar);
  if (!compact) root.append(node('p', `${info.filled} renseignée(s) · ${info.missing} à compléter · ${info.unknown} indéterminée(s)`, 'ooiCompletenessFoot'));
  if (scope === 'local') root.append(node('small', 'Local — ce navigateur', 'ooiLocalScope'));
  return root;
}

export function appendPortfolioPreview(record, nameCell) {
  if (!nameCell || nameCell.querySelector('.ooiCompleteness')) return;
  nameCell.append(completenessElement(portfolioStates(record), { compact: true, scope: record.scope }));
  formatPortfolio(record, nameCell, portfolioStates(record));
}

function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
function validProduction(production) {
  return production?.status === 'READY' && finite(production.annualKwh) && production.annualKwh > 0;
}
function validIrr(finance) {
  return finance?.status === 'READY' && finite(finance.projectIrrPct);
}
function numberFR(value, digits = 0) { return value.toLocaleString('fr-FR', { maximumFractionDigits: digits }); }
function statusText(status) {
  return ({ READY: 'Disponible · aperçu', PENDING: 'Calcul en cours', UNKNOWN: 'Non disponible', STALE: 'À actualiser' })[status] || 'État non fourni';
}
function sourceText(source, canonical) {
  if (source === 'PVGIS_PREVIEW') return 'Aperçu PVGIS · non canonique';
  if (source) return `Source ${canonical === true ? 'canonique' : 'de l’aperçu'}${canonical === false ? ' · non canonique' : ''}`;
  return canonical === true ? 'Résultat canonique' : canonical === false ? 'Aperçu non canonique' : 'Source non fournie';
}
function metric(label, value, note = '', primary = false) {
  const card = node('div', null, `ooiMetric${primary ? ' ooiMetricPrimary' : ''}`);
  card.append(node('span', label, 'ooiMetricLabel'), node('strong', value, 'ooiMetricValue'));
  if (note) card.append(node('small', note, 'ooiMetricNote'));
  return card;
}
function group(title, eyebrow) {
  const section = node('section', null, 'ooiVisualGroup');
  const heading = node('div', null, 'ooiVisualGroupHead');
  heading.append(node('span', eyebrow, 'ooiVisualEyebrow'), node('h4', title));
  section.append(heading);
  return section;
}
function provenanceItem(label, status, detail) {
  const item = node('div', null, 'ooiProvenanceItem');
  item.append(node('span', label, 'ooiProvenanceLabel'), node('strong', status, 'ooiProvenanceStatus'));
  if (detail) item.append(node('small', detail, 'ooiProvenanceDetail'));
  return item;
}
function floatFromReadout(raw) {
  const cleaned = String(raw || '').replace(/\s/g, '').replace(',', '.');
  const match = cleaned.match(/^(\d+(?:\.\d+)?)(?=m²|m2|$)/i);
  return match ? Number(match[1]) : null;
}
export function readPrestudy() {
  const production = window.SOLARSHIFT_CONFIG?.commercialProductionPreview || null;
  const carbonImpact = window.SOLARSHIFT_CONFIG?.commercialCarbonImpactPreview || null;
  const finance = window.SOLARSHIFT_FINANCIAL_PREVIEW || null;
  // Récupération purement déclarative des constats ; aucun chargement de preuves privées.
  let risks = null;
  try { risks = window.OzenoRiskDraft?.capture?.() ?? null; } catch { /* Source non disponible */ }
  const addressNode = document.getElementById('newProjectAddress');
  const address = addressNode && 'value' in addressNode ? addressNode.value : undefined;
  const surfaceArea = floatFromReadout(document.getElementById('dashRoof')?.textContent);
  const annualAllocation = document.getElementById('decisionEnergyAllocation')?.textContent?.trim() || '';
  return { production, carbonImpact, finance, risks, address, surfaceArea, annualAllocation };
}

// Projection pure des sorties déjà présentes; aucune formule métier ni valeur de remplacement.
export function buildPrestudyVisualModel({ production, carbonImpact, finance, risks, annualAllocation = '' } = {}) {
  const readyProduction = validProduction(production);
  const readyFinance = finance?.status === 'READY';
  const capacity = readyProduction && finite(production?.installedCapacityKwp) && production.installedCapacityKwp > 0
    ? production.installedCapacityKwp
    : readyProduction && finite(production?.sizing?.referenceKwp) && production.sizing.referenceKwp > 0 ? production.sizing.referenceKwp : null;
  const annualText = String(annualAllocation || '').trim();
  const hasAnnualSimulation = /solde annuel théorique|plafond annuel théorique|consommation annuelle inconnue/i.test(annualText);
  return {
    provenance: {
      production: `${statusText(production?.status || 'UNKNOWN')} · ${sourceText(production?.source, production?.canonical)}`,
      finance: `${statusText(finance?.status || 'UNKNOWN')} · aperçu financier de session`,
      financeVersion: finance?.modelVersion || finance?.assumptions?.modelVersion || null
    },
    energy: {
      capacityKwp: capacity,
      annualKwh: readyProduction ? production.annualKwh : null,
      monthlyKwh: readyProduction && Array.isArray(production.monthlyKwh) && production.monthlyKwh.length === 12 && production.monthlyKwh.every(value => finite(value) && value >= 0) ? [...production.monthlyKwh] : null,
      specificYieldKwhKwp: readyProduction && finite(production?.specificYieldKwhKwp) ? production.specificYieldKwhKwp : null,
      productionReady: readyProduction,
      annualSimulationText: readyProduction && hasAnnualSimulation ? annualText : null,
      temporalMatchingAvailable: false
    },
    carbonImpact: carbonImpact?.status === 'ASSUMPTION' && finite(carbonImpact.avoidedCo2eTonnesYear)
      ? { tonnes: carbonImpact.avoidedCo2eTonnesYear, factor: carbonImpact.carbonFactor || null, available: true }
      : { tonnes: null, factor: null, available: false },
    finance: {
      ready: readyFinance,
      projectIrrPct: validIrr(finance) ? finance.projectIrrPct : null,
      projectIrrBasis: validIrr(finance) ? financialBasisLabel(finance.projectIrrBasis) : null,
      horizonYears: readyFinance && finite(finance?.horizonYears) ? finance.horizonYears : null,
      modelVersion: readyFinance ? finance?.modelVersion || finance?.assumptions?.modelVersion || null : null,
      capexEur: readyFinance && finite(finance?.capexEur) ? finance.capexEur : null,
      totalInitialInvestmentEur: readyFinance && finite(finance?.totalInitialInvestmentEur) ? finance.totalInitialInvestmentEur : null,
      debtEur: readyFinance && finite(finance?.debtEur) ? finance.debtEur : null,
      minimumDscr: readyFinance && finite(finance?.minimumDscr) ? finance.minimumDscr : null,
      minimumDscrYear: readyFinance && finite(finance?.minimumDscrYear) ? finance.minimumDscrYear : null,
      threshold: null
    },
    constraints: Array.isArray(risks) ? risks.filter((item) => item && typeof item === 'object') : null
  };
}
export function financialBasisLabel(value) {
  if (value === 'PROJECT_CASHFLOW_BEFORE_TAX_AND_FINANCING') return 'Avant impôts et financement';
  if (!value || /^[A-Z][A-Z0-9_]+$/.test(value)) return null;
  return String(value);
}
function monthlyProductionChart(values) {
  if (!values) return null;
  const figure = node('figure', null, 'ooiMonthlyProduction');
  figure.append(node('figcaption', 'Production mensuelle estimée · PVGIS'));
  const plot = node('div', null, 'ooiMonthlyBars'), maximum = Math.max(...values, 1);
  const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
  values.forEach((value, index) => {
    const column = node('div', null, 'ooiMonthColumn'), bar = node('span', null, 'ooiMonthBar');
    bar.style.height = `${value / maximum * 100}%`; bar.tabIndex = 0;
    bar.title = `${months[index]} : ${numberFR(value)} kWh`; bar.setAttribute('aria-label', bar.title);
    column.append(bar, node('small', months[index])); plot.append(column);
  });
  figure.append(plot); return figure;
}
export function mountPrestudyPanel() {
  const host = document.getElementById('ozeno-summary');
  if (!host) return;
  let panel = host.querySelector('#ooiDiagnosticPanel');
  if (!panel) {
    panel = node('section', null, 'ooiDiagnosticPanel');
    panel.id = 'ooiDiagnosticPanel';
    panel.setAttribute('aria-label', 'Diagnostic rapide OZENO — aperçu indicatif');
  }
  const summaryHeading = host.querySelector(':scope > h2');
  if (summaryHeading) summaryHeading.textContent = 'Synthèse décisionnelle';
  const anchor = host.querySelector(':scope > .ooiSummaryHero') || host.querySelector('.previewNotice') || summaryHeading || host.querySelector('#prestudySummaryEnergyHeading');
  if (anchor && panel.previousElementSibling !== anchor) anchor.insertAdjacentElement('afterend', panel);
  else if (!anchor && panel.parentElement !== host) host.prepend(panel);
  const { production, carbonImpact, finance, risks, address, surfaceArea, annualAllocation } = readPrestudy();
  const model = buildPrestudyVisualModel({ production, carbonImpact, finance, risks, annualAllocation });
  installV10();
  mountDocumentaryBand(prestudyStates({ address, surfaceArea, production, risks, finance }));
  mountSummaryChapterIntro(host);
  composePrestudyV10(model);
  panel.replaceChildren();
  const title = node('div', null, 'ooiDiagnosticHead');
  const titleCopy = node('div', null, 'ooiDiagnosticTitle');
  titleCopy.append(node('h3', 'Diagnostic rapide OZENO'), node('p', 'Potentiel énergétique · performance économique · contraintes', 'ooiDiagnosticSubtitle'));
  title.append(titleCopy, node('span', 'Lecture seule · données existantes', 'ooiDiagnosticBadge'));
  panel.append(title);
  const provenance = node('div', null, 'ooiProvenance');
  provenance.setAttribute('aria-label', 'Provenance et disponibilité des résultats');
  provenance.append(
    provenanceItem('PRODUCTION', statusText(production?.status || 'UNKNOWN'), sourceText(production?.source, production?.canonical)),
    provenanceItem('FINANCE', statusText(finance?.status || 'UNKNOWN'), model.provenance.financeVersion ? `Modèle ${model.provenance.financeVersion} · aperçu non canonique` : 'Aperçu non canonique · modèle non fourni')
  );
  panel.append(provenance);

  const groups = node('div', null, 'ooiVisualGroups');
  const energy = group('Potentiel énergétique', '01 · PRODUCTION');
  const energyMetrics = node('div', null, 'ooiMetricGrid');
  energyMetrics.append(metric('Production annuelle', model.energy.annualKwh != null ? `${numberFR(model.energy.annualKwh / 1000, 1)} MWh/an` : 'Non disponible', model.energy.productionReady ? 'Estimation PVGIS courante' : 'En attente d’un calcul PVGIS valide', true));
  energyMetrics.append(metric('Puissance photovoltaïque', model.energy.capacityKwp != null ? `${numberFR(model.energy.capacityKwp, 1)} kWc` : 'Non disponible', model.energy.capacityKwp != null ? 'Dimensionnement existant' : 'Puissance non fournie'));
  if (model.energy.specificYieldKwhKwp != null) energyMetrics.append(metric('Productivité spécifique', `${numberFR(model.energy.specificYieldKwhKwp)} kWh/kWc/an`, 'Valeur de l’aperçu courant'));
  energy.append(energyMetrics);
  const monthly = monthlyProductionChart(model.energy.monthlyKwh); if (monthly) energy.append(monthly);
  const allocation = node('div', null, 'ooiAllocationStatus');
  allocation.append(node('span', 'ACI / ACC · simulation annuelle', 'ooiMetricLabel'));
  if (model.energy.annualSimulationText) {
    allocation.append(node('strong', 'Matching temporel non établi', 'ooiAllocationTitle'));
    allocation.append(node('p', model.energy.annualSimulationText, 'ooiMetricNote'));
  } else {
    allocation.append(node('strong', 'Répartition temporelle non disponible', 'ooiAllocationTitle'), node('p', 'Aucun résultat ACI / ACC temporel courant n’est exposé dans cette pré-étude.', 'ooiMetricNote'));
  }
  energy.append(allocation);
  groups.append(energy);

  const economy = group('Performance économique', '02 · FINANCE');
  const financeMetrics = node('div', null, 'ooiMetricGrid');
  financeMetrics.append(metric('TRI Projet', model.finance.projectIrrPct != null ? `${numberFR(model.finance.projectIrrPct, 2)} %` : finance?.status === 'READY' ? 'Non calculable' : 'Non disponible',
    model.finance.projectIrrPct != null ? [model.finance.projectIrrBasis, model.finance.horizonYears != null ? `${numberFR(model.finance.horizonYears)} ans` : null].filter(Boolean).join(' · ') || 'Base non fournie' : 'Résultat financier indisponible', true));
  if (model.finance.capexEur != null) financeMetrics.append(metric('CAPEX projet', `${numberFR(model.finance.capexEur)} €`, 'Périmètre du moteur financier'));
  if (model.finance.totalInitialInvestmentEur != null) {
    if (model.finance.totalInitialInvestmentEur === model.finance.capexEur) financeMetrics.lastElementChild.append(node('small', 'Investissement initial : même montant dans cette simulation; périmètre distinct.', 'ooiMetricNote'));
    else financeMetrics.append(metric('Investissement initial', `${numberFR(model.finance.totalInitialInvestmentEur)} €`, 'Valeur fournie par l’aperçu financier'));
  }
  if (model.finance.debtEur === 0) financeMetrics.append(metric('DSCR', 'Non applicable', 'Aucune dette dans cette simulation'));
  else if (model.finance.minimumDscr != null) financeMetrics.append(metric('DSCR minimum', `${numberFR(model.finance.minimumDscr, 2)}×`, model.finance.minimumDscrYear != null ? `Année ${numberFR(model.finance.minimumDscrYear)}` : 'Année non fournie'));
  economy.append(financeMetrics);
  economy.append(node('p', 'Simulation indicative · aucun seuil investisseur applicable fourni.', 'ooiDisclosure'));
  groups.append(economy);

  const constraints = group('Contraintes et points à examiner', '03 · CONSTATS');
  const riskRecords = model.constraints;
  if (riskRecords?.length) {
    constraints.append(node('p', `${riskRecords.length} constat(s) enregistré(s) · sans agrégation`, 'ooiConstraintSummary'));
    const list = node('ul', null, 'ooiConstraintList');
    const options = [...(document.getElementById('riskFactor')?.options || [])];
    riskRecords.forEach((record) => {
      const factorLabel = options.find((option) => option.value === record.factor)?.textContent.replace(/^✓\s*/, '') || record.factor || 'Constat';
      const item = node('li');
      item.append(node('strong', factorLabel));
      if (record.description) item.append(node('span', record.description));
      if (record.source) item.append(node('small', `Source : ${record.source}`));
      if (record.evidence) item.append(node('small', `Élément associé : ${record.evidence}`));
      list.append(item);
    });
    constraints.append(list);
  } else {
    constraints.classList.add('ooiConstraintsEmpty');
    constraints.append(node('strong', 'Registre non évalué', 'ooiAllocationTitle'), node('p', 'Aucun constat enregistré dans cette pré-étude. Cela ne signifie pas « aucun risque ».', 'ooiMetricNote'));
  }
  const riskLink = node('a', 'Consulter les sept contrôles →', 'ooiDetailLink'); riskLink.href = '#prestudy-risks-register'; constraints.append(riskLink);
  groups.append(constraints);
  panel.append(groups);
  panel.append(node('p', 'Lecture seule · indicateurs limités aux sorties déjà présentes dans la pré-étude.', 'ooiDisclosure'));
}

function mountSummaryChapterIntro(summary) {
  const title = document.getElementById('prestudyChapterTitle');
  if (!title) return;
  const visible = summary.getClientRects().length > 0 && !summary.closest('[hidden]');
  const eyebrowId = 'ooiSynthesisChapterEyebrow';
  const descriptionId = 'ooiSynthesisChapterDescription';
  const eyebrow = document.getElementById(eyebrowId);
  const description = document.getElementById(descriptionId);
  if (!visible) {
    eyebrow?.remove(); description?.remove();
    return;
  }
  title.textContent = '6 · Synthèse';
  if (!eyebrow) {
    const label = node('p', 'PRÉ-ÉTUDE / SYNTHÈSE', eyebrowId);
    label.id = eyebrowId;
    title.before(label);
  }
  if (!description) {
    const text = node('p', 'Diagnostic rapide et restitution détaillée : même dossier, mêmes données, présentation améliorée. Les modules actuels restent accessibles.', descriptionId);
    text.id = descriptionId;
    title.after(text);
  }
}
