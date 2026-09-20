/** Versioned CR-001 data contracts and the approved Energy Engine v1 service contract. */
export type CalculationQuality = 'Q0' | 'Q1' | 'Q2' | 'Q3' | 'Q4';
export type CalculationRunStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'INVALIDATED';
export type ScenarioKind = 'CONFIGURATION' | 'SENSITIVITY' | 'STRESS';
export type ScenarioStatus = 'DRAFT' | 'CALCULATED' | 'VALIDATED' | 'PUBLISHED' | 'RETIRED' | 'REJECTED';
export type EnergyProfileKind = 'PV_PRODUCTION' | 'LOAD';
export type EnergyProfileGranularity = 'THIRTY_MINUTES' | 'HOURLY' | 'NORMALIZED' | 'ANNUAL';
export type SimulationStatus = 'WORKING' | 'FROZEN' | 'PROMOTED' | 'EXPIRED' | 'RETIRED';
export type ExternalEngineResultKind = 'THEORETICAL_PRODUCTION' | 'MONTHLY_PRODUCTION' | 'HOURLY_PRODUCTION' | 'SPECIFIC_YIELD' | 'P50' | 'P90' | 'SHADING_LOSS' | 'SYSTEM_LOSS';

export interface Provenance { sourceType: string; sourceReference?: string; evidenceId?: string; [key: string]: unknown }
export interface EnergyProfile { id: string; projectId: string; profileKind: EnergyProfileKind; granularity: EnergyProfileGranularity; qualityLevel: CalculationQuality; unit: 'kWh' | 'kW'; version: number; supersedesId?: string; assumptions: Record<string, unknown>; provenance: Provenance }
export interface EnergyProfilePoint { energyProfileId: string; intervalStart: string; intervalEnd: string; value: number; qualityFlag?: string }
export interface ScenarioSet { id: string; projectId: string; name: string; optimizerVersion: string; generationMethod: string; objectives: unknown[]; constraintsSnapshot: Record<string, unknown> }
export interface Scenario { id: string; projectId: string; scenarioSetId?: string; kind: ScenarioKind; status: ScenarioStatus; name: string; generationMethod: string; technicalConfiguration: Record<string, unknown>; technicalConfigurationId?: string; sourceSimulationId?: string; contractualConfiguration: Record<string, unknown>; financingConfiguration: Record<string, unknown>; assumptions: Record<string, unknown>; version: number }
export interface CalculationRun { id: string; projectId: string; scenarioId?: string; engineVersion: string; financialModelVersion: string; status: CalculationRunStatus; qualityLevel: CalculationQuality; inputSnapshot: Record<string, unknown>; inputSnapshotHash: string; assumptionsSnapshot: Record<string, unknown>; missingInputs: unknown[]; warnings: unknown[] }
export interface CalculatedKpi { id: string; projectId: string; scenarioId?: string; calculationRunId: string; code: string; valueNumeric?: number; valueJson?: unknown; unit: string; formulaVersion: string; qualityLevel: CalculationQuality; canonicalParameterCode?: 'C03' | 'C09'; isValidatedReference: boolean; provenance: Provenance }

/** CR-002 phase 2.2. Nullable fields are UNKNOWN, never implicit zero. */
export interface TechnicalConfiguration {
  id: string;
  projectId: string;
  version: number;
  supersedesId?: string;
  pvCapacityKwp?: number;
  moduleCount?: number;
  moduleManufacturer?: string;
  moduleModel?: string;
  modulePowerWp?: number;
  inverterManufacturer?: string;
  inverterModel?: string;
  inverterCount?: number;
  orientationDeg?: number;
  tiltDeg?: number;
  productionSource?: string;
  systemLossesPct?: number;
  degradationPctPerYear?: number;
  externalEngineReference?: string;
  evidenceId?: string;
  provenance: Provenance;
  isFrozen: boolean;
}

export interface ExternalEngineResult {
  id: string;
  projectId: string;
  scenarioId?: string;
  technicalConfigurationId?: string;
  sourceEngine: string;
  sourceReference: string;
  resultKind: ExternalEngineResultKind;
  valueNumeric?: number;
  valueJson?: unknown;
  unit: string;
  methodology?: string;
  evidenceId?: string;
  qualityLevel: CalculationQuality;
  validationStatus: 'UNKNOWN' | 'PENDING' | 'PROVISIONAL' | 'VALIDATED' | 'REJECTED' | 'OVERRIDDEN';
  provenance: Provenance;
  version: number;
}

/** A persisted preview. It is always non-canonical and may be edited only while WORKING. */
export interface SimulationSession {
  id: string;
  projectId: string;
  name: string;
  status: SimulationStatus;
  isCanonical: false;
  revision: number;
  workingAssumptions: Record<string, unknown>;
  workingConfiguration: Record<string, unknown>;
  technicalConfigurationId?: string;
  latestCalculationRunId?: string;
  retentionDays: number;
  lastActivityAt: string;
  expiresAt: string;
  frozenSnapshot?: Record<string, unknown>;
  frozenSnapshotHash?: string;
  promotedScenarioId?: string;
}

export interface FreezeSimulationCommand {
  simulationId: string;
  scenarioName: string;
  scenarioKind: ScenarioKind;
}

export interface PublishScenarioCommand {
  scenarioId: string;
  investorUserIds: string[];
  reason?: string;
}

export interface ScenarioGovernanceService {
  updateWorkingSimulation(simulationId: string, expectedRevision: number, patch: Partial<Pick<SimulationSession, 'name' | 'workingAssumptions' | 'workingConfiguration' | 'technicalConfigurationId' | 'latestCalculationRunId'>>): Promise<SimulationSession>;
  freezeSimulation(command: FreezeSimulationCommand): Promise<Scenario>;
  markScenarioCalculated(scenarioId: string, calculationRunId: string): Promise<Scenario>;
  validateScenario(scenarioId: string, comment?: string): Promise<Scenario>;
  publishScenario(command: PublishScenarioCommand): Promise<Scenario>;
  revokeScenarioPublication(scenarioId: string, reason: string): Promise<Scenario>;
  retireScenario(scenarioId: string, reason: string): Promise<Scenario>;
}

export interface EngineeringRepository {
  appendTechnicalConfiguration(configuration: TechnicalConfiguration): Promise<void>;
  appendExternalEngineResult(result: ExternalEngineResult): Promise<void>;
  getScenarioTechnicalConfiguration(scenarioId: string): Promise<TechnicalConfiguration | undefined>;
}

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
  simulationId?: string;
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
