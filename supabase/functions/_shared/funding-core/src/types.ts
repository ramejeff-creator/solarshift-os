/** Isolated Funding contract. No PV or finance engine imports. */
export type Region =
  | "SUD" | "NOUVELLE_AQUITAINE" | "BRETAGNE"
  | "AUVERGNE_RHONE_ALPES" | "BOURGOGNE_FRANCHE_COMTE" | "CENTRE_VAL_DE_LOIRE"
  | "CORSE" | "GRAND_EST" | "HAUTS_DE_FRANCE" | "ILE_DE_FRANCE"
  | "NORMANDIE" | "OCCITANIE" | "PAYS_DE_LA_LOIRE" | "OTHER_FRANCE";

export type Action =
  | "PV" | "ACC_STUDY" | "STORAGE_INNOVATIVE" | "SOLAR_THERMAL"
  | "TERTIARY_RENOVATION" | "TERTIARY_ENGINEERING" | "INDUSTRIAL_AUDIT"
  | "DECARBONISATION_ADVICE" | "INDUSTRIAL_ENGINEERING" | "EQUIPMENT_ELECTRIFICATION"
  | "GEOTHERMAL" | "BIOMASS_HEAT" | "WASTE_HEAT" | "RENEWABLE_HEAT_PORTFOLIO"
  | "IRVE_HEAVY" | "ROOF_INSULATION" | "WALL_INSULATION"
  | "FLOOR_INSULATION" | "FLAT_ROOF_INSULATION" | "SOLAR_THERMAL_WATER"
  | "BMS" | "HEAT_NETWORK_CONNECTION";

export type Mode = "ACI" | "ACC" | "FULL_EXPORT";
export type Support = "NONE" | "S21" | "CRE_AO" | "OTHER_PUBLIC" | "UNKNOWN";
export type ApplicantKind = "PRIVATE_LEGAL_ENTITY" | "PUBLIC_LEGAL_ENTITY" | "INDIVIDUAL_BUSINESS" | "INDIVIDUAL" | "UNKNOWN";
export type Payer = "OWNER" | "OPERATOR" | "PROJECT_COMPANY" | "THIRD_PARTY" | "UNKNOWN";
export type ProjectTiming = "asap" | "3-6-months" | "later" | "unknown";

export interface FundingProjectContext {
  projectId: string;
  scenarioId: string;
  asOf: string; // ISO yyyy-mm-dd; explicit clock for reproducibility.
  site: { region?: Region; address?: string };
  organization: {
    professional?: boolean;
    /** Rôle du demandeur par rapport au site ; distinct de sa forme juridique. */
    applicantRole?: Payer;
    applicantKind?: ApplicantKind;
    sector?: "TERTIARY" | "INDUSTRY" | "CRAFT" | "OTHER";
  };
  work: {
    actions: Action[];
    pvKwc?: number;
    /** Date de demande complète de raccordement, si connue. */
    dcrDate?: string;
    /** Puissance Q ou autres installations à prendre en compte dans P+Q. */
    otherRelatedPvKwc?: number;
    mode?: Mode;
    selfConsumptionFraction?: number; // [0, 1]
    siteCoverageFraction?: number; // [0, 1]
    energySources?: string[]; // e.g. PV, SOLAR_THERMAL, WIND
    innovativeStorage?: boolean;
    energyManagementSystem?: boolean;
    eligibleCostEur?: number;
    heavyVehicleCategory?: "N2" | "N3" | "M2" | "M3" | "OTHER";
    siteCount?: number;
    administrativeRegionCount?: number;
    isDEETSubject?: boolean;
    isInnovative?: boolean;
  };
  funding: {
    publicProductionSupport?: Support;
    payer?: Payer;
    beneficiaryRole?: Payer;
    otherEuFundingOnSameCosts?: boolean;
  };
  timeline: {
    orderOrWorkCommittedBeforeApplication?: boolean;
    /** Déclaratif, fourni par le simulateur marketing ; distinct de la date d'engagement. */
    projectTiming?: ProjectTiming;
  };
}

export type WindowStatus =
  | "CLOSED_AT_REFERENCE" | "REFERENCE_DEADLINE_PASSED"
  | "REPORTED_OPEN_UNVERIFIED" | "STATUS_UNKNOWN";
export type MatchStatus = "POTENTIAL" | "NEEDS_DATA" | "NEEDS_REVIEW" | "EXCLUDED" | "CLOSED";
export type FindingKind = "PASS" | "MISSING" | "REVIEW" | "EXCLUSION" | "CONFLICT";

export interface SourceInfo {
  url: string;
  checkedAt: string;
  publisher: string;
  verifiedForLiveUse: false;
}

export interface FundingProgram {
  id: string;
  version: string;
  name: string;
  region: Region | "NATIONAL";
  family: string;
  instrument: string;
  eligibleBeneficiaries: string;
  eligibleObject: string;
  conditionsText: string;
  fundingFormulaText: string;
  deadline?: string;
  reportedStatus: string;
  channel: string;
  source: SourceInfo;
  actionAnyOf: Action[];
  /** Coverage is "partial" when a regulation is not fully executable as rules. */
  rulesCoverage: "partial" | "targeted";
}

export interface Finding {
  code: string;
  kind: FindingKind;
  message: string;
  field?: string;
}

export interface FundingMatch {
  programId: string;
  programVersion: string;
  ruleEngineVersion: string;
  projectId: string;
  scenarioId: string;
  evaluatedAt: string;
  status: MatchStatus;
  windowStatus: WindowStatus;
  findings: Finding[];
  missingFields: string[];
  blockingIssues: string[];
  humanReviewRequired: true;
  source: SourceInfo;
  /** Deliberately no euro amounts, grant eligibility declarations or financial mutations. */
}

export interface PublicFundingHint {
  kind: "POSSIBLE_LEADS" | "MORE_INFORMATION_REQUIRED" | "NOTHING_VERIFIED";
  title: string;
  subtitle: string;
  leads?: string[];
  cta: "Vérifier mon éligibilité";
}
