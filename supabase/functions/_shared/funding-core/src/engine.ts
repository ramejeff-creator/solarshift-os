import type {
  FundingMatch, FundingProgram, FundingProjectContext, Finding,
  MatchStatus, WindowStatus, PublicFundingHint,
} from "./types.ts";
import { validateCatalog } from "./catalog.ts";

export const FUNDING_RULE_ENGINE_VERSION = "funding-rules-p2.0.1";

function dateMs(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`invalid_iso_date:${value}`);
  const n = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== value)
    throw new Error(`invalid_iso_date:${value}`);
  return n;
}

export function validateContext(ctx: FundingProjectContext): void {
  if (!ctx || !ctx.projectId || !ctx.scenarioId || !ctx.site || !ctx.organization ||
      !ctx.work || !ctx.funding || !ctx.timeline || !Array.isArray(ctx.work.actions))
    throw new Error("invalid_project_context");
  dateMs(ctx.asOf);
  for (const [name, n] of [
    ["work.pvKwc", ctx.work.pvKwc],
    ["work.otherRelatedPvKwc", ctx.work.otherRelatedPvKwc],
    ["work.eligibleCostEur", ctx.work.eligibleCostEur],
    ["work.siteCount", ctx.work.siteCount],
    ["work.administrativeRegionCount", ctx.work.administrativeRegionCount],
  ] as const) {
    if (n !== undefined && (!Number.isFinite(n) || n < 0)) throw new Error(`invalid_number:${name}`);
  }
  for (const [name, n] of [
    ["work.selfConsumptionFraction", ctx.work.selfConsumptionFraction],
    ["work.siteCoverageFraction", ctx.work.siteCoverageFraction],
  ] as const) {
    if (n !== undefined && (!Number.isFinite(n) || n < 0 || n > 1))
      throw new Error(`invalid_fraction:${name}`);
  }
  if (ctx.work.siteCount !== undefined && !Number.isInteger(ctx.work.siteCount))
    throw new Error("invalid_integer:work.siteCount");
  if (ctx.work.administrativeRegionCount !== undefined && !Number.isInteger(ctx.work.administrativeRegionCount))
    throw new Error("invalid_integer:work.administrativeRegionCount");
  if (ctx.work.dcrDate !== undefined) dateMs(ctx.work.dcrDate);
  if (ctx.timeline.projectTiming !== undefined && !["asap", "3-6-months", "later", "unknown"].includes(ctx.timeline.projectTiming))
    throw new Error("invalid_project_timing");
}

function windowOf(p: FundingProgram, asOf: string): WindowStatus {
  if (/clos|fermée|fermé|épuisé/i.test(p.reportedStatus)) return "CLOSED_AT_REFERENCE";
  if (p.deadline && dateMs(p.deadline) < dateMs(asOf)) return "REFERENCE_DEADLINE_PASSED";
  if (/ouvert|en vigueur|applicable|sous conditions/i.test(p.reportedStatus))
    return "REPORTED_OPEN_UNVERIFIED";
  return "STATUS_UNKNOWN";
}

function finding(code: string, kind: Finding["kind"], message: string, field?: string): Finding {
  return { code, kind, message, ...(field ? { field } : {}) };
}

export function evaluateFundingProgram(p: FundingProgram, ctx: FundingProjectContext): FundingMatch {
  validateContext(ctx);
  const fs: Finding[] = [];
  const add = (code: string, kind: Finding["kind"], message: string, field?: string) =>
    fs.push(finding(code, kind, message, field));
  const missing = (code: string, field: string, message: string) => add(code, "MISSING", message, field);
  const exclude = (code: string, field: string, message: string) => add(code, "EXCLUSION", message, field);
  const review = (code: string, field: string, message: string) => add(code, "REVIEW", message, field);
  const windowStatus = windowOf(p, ctx.asOf);

  // Non-professional schemes are excluded from the source register. Double-check the applicant too.
  if (ctx.organization.professional === false || ctx.organization.applicantKind === "INDIVIDUAL")
    exclude("NOT_PROFESSIONAL", "organization.professional", "Ce pilote ne concerne pas les particuliers.");
  else if (ctx.organization.professional !== true)
    missing("PROFESSIONAL_STATUS_UNKNOWN", "organization.professional", "Nature professionnelle du bénéficiaire à confirmer.");

  if (!ctx.site.region) missing("SITE_REGION_MISSING", "site.region", "Région du site d'installation requise.");
  else if (p.region !== "NATIONAL" && p.region !== ctx.site.region)
    exclude("OUT_OF_REGION", "site.region", "Le site est hors du territoire couvert par ce dispositif.");

  if (!p.actionAnyOf.some(a => ctx.work.actions.includes(a)))
    exclude("ACTION_NOT_COVERED", "work.actions", "La dépense prévue dans ce scénario n'est pas celle couverte par le dispositif.");

  // Payer and applicant are different actors in third-party CAPEX structures.
  const requiresBeneficiaryCheck = /Subvention|FEDER|Prime/i.test(p.instrument);
  if (requiresBeneficiaryCheck) {
    if (!ctx.funding.payer || ctx.funding.payer === "UNKNOWN")
      missing("PAYER_UNKNOWN", "funding.payer", "Identifier le financeur effectif du CAPEX ou de l'étude.");
    if (!ctx.organization.applicantKind || ctx.organization.applicantKind === "UNKNOWN")
      missing("APPLICANT_UNKNOWN", "organization.applicantKind", "Vérifier l'identité juridique du demandeur.");
    if (ctx.funding.payer === "THIRD_PARTY" && ctx.funding.beneficiaryRole !== "THIRD_PARTY")
      review("THIRD_PARTY_BENEFICIARY", "funding.beneficiaryRole", "Un tiers paye le projet : vérifier qui peut demander et percevoir l'aide.");
  }

  const possiblePreCommitRestriction = /Subvention|FEDER|Prime|CEE/i.test(p.instrument);
  if (possiblePreCommitRestriction) {
    if (ctx.timeline.orderOrWorkCommittedBeforeApplication === true)
      review("EARLY_COMMITMENT", "timeline.orderOrWorkCommittedBeforeApplication", "Devis, commande ou travaux engagés : vérifier l'effet incitatif et la date de dépôt.");
    else if (ctx.timeline.orderOrWorkCommittedBeforeApplication === undefined)
      missing("COMMITMENT_DATE_UNKNOWN", "timeline.orderOrWorkCommittedBeforeApplication", "Date d'engagement à vérifier avant dépôt.");
  }

  switch (p.id) {
    case "FUND-SUD-001": {
      if (ctx.organization.applicantKind === "INDIVIDUAL_BUSINESS")
        exclude("INDIVIDUAL_BUSINESS_EXCLUDED", "organization.applicantKind", "Le règlement régional exclut les entreprises individuelles.");
      if (ctx.work.mode === undefined) missing("PV_MODE_UNKNOWN", "work.mode", "Choisir ACI ou ACC.");
      else if (ctx.work.mode === "FULL_EXPORT")
        exclude("PV_MODE_EXCLUDED", "work.mode", "Le projet de vente totale n'est pas dans le périmètre d'autoconsommation du dispositif.");
      if (ctx.work.pvKwc === undefined) missing("PV_POWER_UNKNOWN", "work.pvKwc", "Puissance PV à confirmer.");
      else if (ctx.work.pvKwc < 10) exclude("PV_POWER_TOO_LOW", "work.pvKwc", "La page de l'aide indique un seuil de 10 kWc.");
      if (ctx.work.selfConsumptionFraction === undefined)
        missing("SELF_CONSUMPTION_UNKNOWN", "work.selfConsumptionFraction", "Taux d'autoconsommation requis.");
      else if (ctx.work.selfConsumptionFraction <= 0.8)
        exclude("SELF_CONSUMPTION_TOO_LOW", "work.selfConsumptionFraction", "La page de l'aide indique un taux strictement supérieur à 80 %.");
      if (ctx.work.siteCoverageFraction === undefined)
        missing("SITE_COVERAGE_UNKNOWN", "work.siteCoverageFraction", "Taux de couverture à vérifier.");
      else if (ctx.work.siteCoverageFraction <= 0.1)
        exclude("SITE_COVERAGE_TOO_LOW", "work.siteCoverageFraction", "La page de l'aide indique un taux de couverture strictement supérieur à 10 %.");
      if (ctx.funding.publicProductionSupport === "S21" || ctx.funding.publicProductionSupport === "CRE_AO")
        add("PV_PUBLIC_AID_CONFLICT", "CONFLICT", "Conflit de cumul : soutien à la production et aide publique à l'investissement doivent être arbitrés.", "funding.publicProductionSupport");
      else if (!ctx.funding.publicProductionSupport || ctx.funding.publicProductionSupport === "UNKNOWN")
        missing("PRODUCTION_SUPPORT_UNKNOWN", "funding.publicProductionSupport", "Vérifier tout soutien public à la production envisagé.");
      break;
    }
    case "FUND-SUD-002": {
      if (ctx.work.isInnovative === false) exclude("NOT_INNOVATIVE", "work.isInnovative", "Un projet standard ne démontre pas l'innovation requise.");
      else if (ctx.work.isInnovative === undefined) missing("INNOVATION_UNKNOWN", "work.isInnovative", "Décrire et justifier l'innovation.");
      break;
    }
    case "FUND-NA-001":
    case "FUND-NA-002": {
      if (ctx.work.mode === undefined) missing("ACC_MODE_UNKNOWN", "work.mode", "Montage d'autoconsommation collective à confirmer.");
      else if (ctx.work.mode !== "ACC") exclude("NOT_ACC", "work.mode", "Le dispositif vise l'autoconsommation collective.");
      break;
    }
    case "FUND-BR-001": {
      if (ctx.work.mode === undefined) missing("ACC_MODE_UNKNOWN", "work.mode", "ACC à confirmer.");
      else if (ctx.work.mode !== "ACC") exclude("NOT_ACC", "work.mode", "Projet ACC requis.");
      if (!ctx.work.energySources) missing("ENERGY_SOURCES_UNKNOWN", "work.energySources", "Sources d'énergie renouvelable du projet à préciser.");
      else if (new Set(ctx.work.energySources).size < 2)
        exclude("SINGLE_ENERGY_ONLY", "work.energySources", "Le pilote multi-EnR n'est pas adapté à une centrale photovoltaïque seule.");
      if (ctx.funding.otherEuFundingOnSameCosts === true)
        add("EU_DOUBLE_FINANCING", "CONFLICT", "Alerte : contrôler le double financement européen des mêmes dépenses.", "funding.otherEuFundingOnSameCosts");
      break;
    }
    case "FUND-BR-002": {
      if (ctx.work.innovativeStorage === false)
        exclude("STANDARD_STORAGE_ONLY", "work.innovativeStorage", "Un stockage standard ne suffit pas au programme innovant.");
      else if (ctx.work.innovativeStorage === undefined)
        missing("STORAGE_INNOVATION_UNKNOWN", "work.innovativeStorage", "Caractère innovant du stockage à documenter.");
      if (ctx.work.energyManagementSystem === undefined)
        missing("EMS_UNKNOWN", "work.energyManagementSystem", "Système de pilotage EMS à documenter.");
      else if (ctx.work.energyManagementSystem === false)
        review("EMS_NOT_PRESENT", "work.energyManagementSystem", "Vérifier les conditions techniques de pilotage de l'énergie.");
      if (ctx.work.eligibleCostEur === undefined)
        missing("ELIGIBLE_COST_UNKNOWN", "work.eligibleCostEur", "Assiette de dépenses éligibles manquante.");
      else if (ctx.work.eligibleCostEur < 150_000)
        exclude("MIN_ELIGIBLE_COST", "work.eligibleCostEur", "L'assiette éligible minimale recensée est 150 000 euros.");
      break;
    }
    case "FUND-ADEME-002": {
      if (ctx.work.isDEETSubject === undefined) missing("DEET_UNKNOWN", "work.isDEETSubject", "Assujettissement DEET à vérifier.");
      else if (!ctx.work.isDEETSubject) exclude("NOT_DEET", "work.isDEETSubject", "Ce programme vise des sites soumis au DEET.");
      if (ctx.work.siteCount === undefined) missing("SITES_COUNT_UNKNOWN", "work.siteCount", "Nombre de sites requis.");
      else if (ctx.work.siteCount < 5 || ctx.work.siteCount > 20)
        exclude("DETER_SITE_COUNT", "work.siteCount", "Le programme DÉTER vise 5 à 20 sites.");
      if (ctx.work.administrativeRegionCount === undefined)
        missing("SITE_REGIONS_UNKNOWN", "work.administrativeRegionCount", "Nombre de régions administratives requis.");
      else if (ctx.work.administrativeRegionCount < 2)
        exclude("DETER_REGIONS_COUNT", "work.administrativeRegionCount", "Le programme exige au moins deux régions administratives.");
      break;
    }
    case "FUND-IRVE-001": {
      if (ctx.work.heavyVehicleCategory === undefined)
        missing("VEHICLE_CATEGORY_UNKNOWN", "work.heavyVehicleCategory", "Catégorie de véhicules à renseigner.");
      else if (ctx.work.heavyVehicleCategory === "OTHER")
        exclude("HEAVY_VEHICLE_REQUIRED", "work.heavyVehicleCategory", "Pas de prime générique pour des véhicules légers.");
      else if (["M2", "M3"].includes(ctx.work.heavyVehicleCategory))
        review("COACH_SUBCATEGORY_REVIEW", "work.heavyVehicleCategory", "La classe et l'usage des autocars doivent être confirmés.");
      break;
    }
    case "FUND-PV-001": {
      if (ctx.work.pvKwc === undefined) missing("PV_POWER_UNKNOWN", "work.pvKwc", "Puissance PV requise.");
      if (!ctx.work.dcrDate) missing("DCR_DATE_UNKNOWN", "work.dcrDate", "Date de DCR nécessaire pour choisir le plafond S21 applicable.");
      if (ctx.work.pvKwc !== undefined && ctx.work.dcrDate) {
        const recentDcr = dateMs(ctx.work.dcrDate) >= dateMs("2025-09-22");
        if (recentDcr && ctx.work.pvKwc > 100)
          exclude("S21_RECENT_DCR_POWER", "work.pvKwc", "DCR à partir du 22/09/2025 : seuil S21 de 100 kWc.");
        if (!recentDcr && ctx.work.pvKwc > 500)
          exclude("S21_PRIOR_DCR_POWER", "work.pvKwc", "Puissance hors de la tranche antérieure recensée.");
      }
      if (ctx.work.pvKwc !== undefined) {
        if (ctx.work.otherRelatedPvKwc === undefined)
          review("PV_Q_REVIEW", "work.otherRelatedPvKwc", "Vérifier la puissance Q des installations voisines selon le régime applicable.");
        else if (ctx.work.dcrDate) {
          const limit = dateMs(ctx.work.dcrDate) >= dateMs("2025-09-22") ? 100 : 500;
          if (ctx.work.pvKwc + ctx.work.otherRelatedPvKwc > limit)
            exclude("S21_P_PLUS_Q", "work.otherRelatedPvKwc", "P+Q dépasse le plafond S21 applicable à la date de DCR.");
        }
      }
      if (ctx.funding.publicProductionSupport === "CRE_AO")
        add("SUPPORT_PATH_CONFLICT", "CONFLICT", "Le choix de soutien à la production doit être cohérent.");
      break;
    }
    case "FUND-PV-002": {
      if (ctx.work.pvKwc !== undefined && (ctx.work.pvKwc <= 100 || ctx.work.pvKwc > 500))
        exclude("CRE_POWER_RANGE", "work.pvKwc", "AOS : tranche de 100 kWc exclus à 500 kWc inclus, sous réserve de P+Q.");
      if (ctx.timeline.orderOrWorkCommittedBeforeApplication === true)
        review("AOS_EARLY_WORK", "timeline.orderOrWorkCommittedBeforeApplication", "L'absence de travaux avant la date limite de la période doit être vérifiée.");
      break;
    }
  }

  if (p.rulesCoverage === "partial")
    review("RULES_PARTIAL", "program.rulesCoverage", "Le règlement n'est pas entièrement codifié ; instruction humaine obligatoire.");
  const checkedMs = dateMs(p.source.checkedAt);
  if (dateMs(ctx.asOf) - checkedMs > 30 * 86_400_000)
    review("SOURCE_STALE", "program.source.checkedAt", "Le référentiel doit être actualisé auprès de la source officielle.");
  if (dateMs(ctx.asOf) < checkedMs)
    review("SOURCE_AFTER_EVALUATION", "program.source.checkedAt", "La fiche de référence est postérieure à la date évaluée.");
  if (windowStatus === "STATUS_UNKNOWN")
    review("WINDOW_UNVERIFIED", "program.reportedStatus", "Statut du guichet non déterminé à partir du relevé pilote.");

  let status: MatchStatus;
  if (fs.some(f => f.kind === "EXCLUSION")) status = "EXCLUDED";
  else if (windowStatus === "CLOSED_AT_REFERENCE" || windowStatus === "REFERENCE_DEADLINE_PASSED") status = "CLOSED";
  else if (fs.some(f => f.kind === "CONFLICT" || f.kind === "REVIEW")) status = "NEEDS_REVIEW";
  else if (fs.some(f => f.kind === "MISSING")) status = "NEEDS_DATA";
  else status = "POTENTIAL";
  // Closed program is still closed even when project eligibility is uncertain.
  if (windowStatus === "CLOSED_AT_REFERENCE" || windowStatus === "REFERENCE_DEADLINE_PASSED") status = "CLOSED";

  return {
    programId: p.id, programVersion: p.version,
    ruleEngineVersion: FUNDING_RULE_ENGINE_VERSION,
    projectId: ctx.projectId, scenarioId: ctx.scenarioId, evaluatedAt: ctx.asOf,
    status, windowStatus, findings: fs,
    missingFields: [...new Set(fs.filter(f => f.kind === "MISSING").map(f => f.field!).filter(Boolean))],
    blockingIssues: fs.filter(f => f.kind === "EXCLUSION" || f.kind === "CONFLICT").map(f => f.code),
    humanReviewRequired: true, source: { ...p.source },
  };
}

export function evaluateFundingCatalog(programs: readonly FundingProgram[], ctx: FundingProjectContext): FundingMatch[] {
  validateCatalog(programs);
  validateContext(ctx);
  return programs.map(p => evaluateFundingProgram(p, ctx));
}

/** The only intended simulator-facing output: a non-financial copy fragment. */
export function buildPublicFundingHint(matches: readonly FundingMatch[]): PublicFundingHint {
  // The public simulator is a marketing entry point: incomplete matches remain leads to verify,
  // not eligibility decisions. Do not expose pilot program names, amounts, or a grant guarantee.
  if (matches.some(m => !["EXCLUDED", "CLOSED"].includes(m.status)))
    return {
      kind: "POSSIBLE_LEADS",
      title: "Des aides potentielles sont à vérifier",
      subtitle: "Le repérage automatique signale des pistes à examiner selon le site et le montage. Leur éligibilité et leur disponibilité restent à confirmer ; aucune aide n'est garantie et aucune demande n'est déposée.",
      cta: "Vérifier mon éligibilité",
    };
  return {
    kind: "NOTHING_VERIFIED",
    title: "Faites vérifier les aides disponibles",
    subtitle: "Aucun dispositif n'a pu être confirmé à ce stade ; les dispositifs et guichets évoluent.",
    cta: "Vérifier mon éligibilité",
  };
}
