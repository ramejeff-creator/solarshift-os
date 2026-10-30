import { buildPublicFundingHint, evaluateFundingCatalog } from './funding-core/src/engine.ts';

const REGIONS = new Set([
  'SUD', 'NOUVELLE_AQUITAINE', 'BRETAGNE', 'AUVERGNE_RHONE_ALPES',
  'BOURGOGNE_FRANCHE_COMTE', 'CENTRE_VAL_DE_LOIRE', 'CORSE', 'GRAND_EST',
  'HAUTS_DE_FRANCE', 'ILE_DE_FRANCE', 'NORMANDIE', 'OCCITANIE',
  'PAYS_DE_LA_LOIRE', 'OTHER_FRANCE'
]);
const REGION_DEPARTMENTS = new Map([
  ['AUVERGNE_RHONE_ALPES', ['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74']],
  ['BOURGOGNE_FRANCHE_COMTE', ['21', '25', '39', '58', '70', '71', '89', '90']],
  ['BRETAGNE', ['22', '29', '35', '56']],
  ['CENTRE_VAL_DE_LOIRE', ['18', '28', '36', '37', '41', '45']],
  ['CORSE', ['2A', '2B']],
  ['GRAND_EST', ['08', '10', '51', '52', '54', '55', '57', '67', '68', '88']],
  ['HAUTS_DE_FRANCE', ['02', '59', '60', '62', '80']],
  ['ILE_DE_FRANCE', ['75', '77', '78', '91', '92', '93', '94', '95']],
  ['NORMANDIE', ['14', '27', '50', '61', '76']],
  ['NOUVELLE_AQUITAINE', ['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87']],
  ['OCCITANIE', ['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82']],
  ['PAYS_DE_LA_LOIRE', ['44', '49', '53', '72', '85']],
  ['SUD', ['04', '05', '06', '13', '83', '84']]
]);
const PROJECT_MODES = Object.freeze({
  ACI: 'ACI', ACC: 'ACC', FULL_EXPORT: 'FULL_EXPORT',
  'self-consumption': 'ACI', 'full-sale-acc': 'ACC', 'full-sale': 'FULL_EXPORT'
});
const PROJECT_TIMINGS = new Set(['asap', '3-6-months', 'later', 'unknown']);

function departmentCodeFrom(input) {
  const raw = String(input.siteDepartmentCode || input.siteCityCode || input.sitePostalCode || '').trim().toUpperCase();
  const code = raw.match(/^(2[AB]|\d{2,3})/)?.[1];
  if (!code) return undefined;
  if (code.startsWith('97') || code.startsWith('98')) return code.slice(0, 3);
  if (code === '20') return undefined;
  return code.slice(0, 2);
}

function regionFromDepartment(code) {
  if (!code) return undefined;
  if (code.startsWith('97') || code.startsWith('98')) return 'OTHER_FRANCE';
  for (const [region, departments] of REGION_DEPARTMENTS) {
    if (departments.includes(code)) return region;
  }
  return undefined;
}

function optionalFiniteNumber(value, name) {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`invalid_number:${name}`);
  return number;
}

/** Build a deliberately narrow, anonymous context from the public simulator estimate. */
export function buildPublicFundingContext(input, asOf) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_public_funding_input');
  const suppliedRegion = typeof input.siteRegion === 'string' && REGIONS.has(input.siteRegion) ? input.siteRegion : undefined;
  const region = suppliedRegion || regionFromDepartment(departmentCodeFrom(input));
  const pvKwc = optionalFiniteNumber(input.pvKwc, 'pvKwc');
  if (pvKwc !== undefined && pvKwc > 100000) throw new Error('invalid_number:pvKwc');
  const mode = PROJECT_MODES[input.projectMode];
  const projectTiming = PROJECT_TIMINGS.has(input.projectTiming) ? input.projectTiming : undefined;
  return {
    projectId: 'PUBLIC_SIMULATOR',
    scenarioId: 'PUBLIC_ESTIMATE',
    asOf,
    site: region ? { region } : {},
    organization: { professional: true, applicantRole: 'OWNER' },
    work: { actions: ['PV'], ...(pvKwc === undefined ? {} : { pvKwc }), ...(mode ? { mode } : {}) },
    funding: { payer: 'OWNER', beneficiaryRole: 'OWNER' },
    timeline: projectTiming ? { projectTiming } : {}
  };
}

export function evaluatePublicFundingHint(input, catalog, asOf) {
  const context = buildPublicFundingContext(input, asOf);
  return buildPublicFundingHint(evaluateFundingCatalog(catalog, context));
}
