/** Versioned CR-001 data contracts and the approved Energy Engine v1 service contract. */
export type CalculationQuality = 'Q0' | 'Q1' | 'Q2' | 'Q3' | 'Q4';
export type CalculationRunStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'INVALIDATED';
export type ScenarioKind = 'CONFIGURATION' | 'SENSITIVITY' | 'STRESS';
export type ScenarioStatus = 'DRAFT' | 'CALCULATED' | 'VALIDATED' | 'PUBLISHED' | 'RETIRED' | 'REJECTED';
export type EnergyProfileKind = 'PV_PRODUCTION' | 'LOAD';
export type EnergyProfileGranularity = 'THIRTY_MINUTES' | 'HOURLY' | 'NORMALIZED' | 'ANNUAL';

export interface Provenance { sourceType: string; sourceReference?: string; evidenceId?: string; [key: string]: unknown }
export interface EnergyProfile { id: string; projectId: string; profileKind: EnergyProfileKind; granularity: EnergyProfileGranularity; qualityLevel: CalculationQuality; unit: 'kWh' | 'kW'; version: number; supersedesId?: string; assumptions: Record<string, unknown>; provenance: Provenance }
export interface EnergyProfilePoint { energyProfileId: string; intervalStart: string; intervalEnd: string; value: number; qualityFlag?: string }
export interface ScenarioSet { id: string; projectId: string; name: string; optimizerVersion: string; generationMethod: string; objectives: unknown[]; constraintsSnapshot: Record<string, unknown> }
export interface Scenario { id: string; projectId: string; scenarioSetId?: string; kind: ScenarioKind; status: ScenarioStatus; name: string; generationMethod: string; technicalConfiguration: Record<string, unknown>; contractualConfiguration: Record<string, unknown>; financingConfiguration: Record<string, unknown>; assumptions: Record<string, unknown>; version: number }
export interface CalculationRun { id: string; projectId: string; scenarioId?: string; engineVersion: string; financialModelVersion: string; status: CalculationRunStatus; qualityLevel: CalculationQuality; inputSnapshot: Record<string, unknown>; inputSnapshotHash: string; assumptionsSnapshot: Record<string, unknown>; missingInputs: unknown[]; warnings: unknown[] }
export interface CalculatedKpi { id: string; projectId: string; scenarioId?: string; calculationRunId: string; code: string; valueNumeric?: number; valueJson?: unknown; unit: string; formulaVersion: string; qualityLevel: CalculationQuality; canonicalParameterCode?: 'C03' | 'C09'; isValidatedReference: boolean; provenance: Provenance }

export interface EnergyFoundationRepository {
  createProfile(profile: EnergyProfile, points: EnergyProfilePoint[]): Promise<void>;
  createScenarioSet(set: ScenarioSet, scenarios: Scenario[]): Promise<void>;
  createCalculationRun(run: CalculationRun): Promise<void>;
  appendCalculatedKpis(kpis: CalculatedKpi[]): Promise<void>;
  promoteValidatedReference(kpiId: string, reason: string): Promise<string>;
}

export interface EnergyCalculationService {
  calculateEnergyScenario(input: EnergyScenarioInput): Promise<EnergyCalculationResult>;
}

export interface EnergyInputPoint {
  intervalStart: string;
  intervalEnd: string;
  valueKwh: number;
}

export interface EnergyProfileInput {
  profileId?: string;
  granularity: EnergyProfileGranularity;
  qualityLevel: CalculationQuality;
  points?: EnergyInputPoint[];
  annualKwh?: number;
  provenance: Provenance;
}

export interface ReplacementCost {
  year: number;
  amountEur: number;
  label: string;
}

export interface FinancialAssumptions {
  horizonYears: number;
  capexEur: number;
  initialEquityEur: number;
  discountRatePct: number;
  gridImportPriceYear1EurPerKwh: number;
  solarEnergyPriceYear1EurPerKwh: number;
  exportPriceYear1EurPerKwh: number;
  fixedGridChargeBeforeYear1Eur?: number;
  fixedGridChargeAfterYear1Eur?: number;
  fixedProjectRevenueYear1Eur?: number;
  opexYear1Eur: number;
  leaseYear1Eur?: number;
  pvDegradationPct?: number;
  gridPriceEscalationPct?: number;
  solarPriceEscalationPct?: number;
  exportPriceEscalationPct?: number;
  fixedRevenueEscalationPct?: number;
  opexEscalationPct?: number;
  leaseEscalationPct?: number;
  replacementCosts?: ReplacementCost[];
  debtServiceByYearEur?: number[];
  terminalValueEur?: number;
}

export interface ValidatedProductionBenchmarks {
  p50Kwh?: number;
  p90Kwh?: number;
  methodology: 'VALIDATED_EXTERNAL_STUDY';
  provenance: Provenance;
}

export interface EnergyScenarioInput {
  projectId: string;
  scenarioId?: string;
  pvProduction: EnergyProfileInput;
  load?: EnergyProfileInput;
  financial?: FinancialAssumptions;
  productionBenchmarks?: ValidatedProductionBenchmarks;
}

export interface CalculationWarning {
  code: string;
  message: string;
}

export interface EnergyBalanceResult {
  pvProductionAnnualKwh: number;
  loadAnnualKwh?: number;
  directSelfConsumptionKwh?: number;
  selfConsumptionRatePct?: number;
  selfSufficiencyRatePct?: number;
  gridImportKwh?: number;
  gridExportKwh?: number;
  surplusKwh?: number;
}

export interface FinancialResult {
  electricityBillBaselineYear1Eur: number;
  electricityBillProjectYear1Eur: number;
  clientSavingsYear1Eur: number;
  clientSavingsLifecycleEur: number;
  projectRevenueYear1Eur: number;
  projectOpexYear1Eur: number;
  operatingMarginYear1Eur: number;
  projectCashFlowEur: number[];
  investorCashFlowEur: number[];
  irrPct?: number;
  npvEur: number;
  paybackYears?: number;
  lcoeEurPerKwh: number;
}

export interface EnergyCalculationResult {
  engineVersion: string;
  formulaVersion: string;
  qualityLevel: CalculationQuality;
  energy: EnergyBalanceResult;
  financial?: FinancialResult;
  productionBenchmarks?: ValidatedProductionBenchmarks;
  warnings: CalculationWarning[];
  missingInputs: string[];
}
