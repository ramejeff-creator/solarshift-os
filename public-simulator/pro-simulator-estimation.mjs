/** First-pass capacity estimate aligned with the current CR-010 roof-density assumptions. */
export const CR010_SIZING_VERSION = 'CR-010-V2.1';

export const PRO_SIMULATOR_ROOF_DENSITIES = Object.freeze({
  pitched: Object.freeze({ low: 195, reference: 210, high: 220 }),
  flatEastWest: Object.freeze({ low: 175, reference: 190, high: 205 }),
  flatSouth: Object.freeze({ low: 140, reference: 155, high: 175 }),
  flatOther: Object.freeze({ low: 140, reference: 175, high: 205 })
});

export const PRO_SIMULATOR_TILT_ANGLES = Object.freeze({ '0-6': 3, '7-14': 10.5, '15-30': 22.5, '30plus': 45 });

const MODULE_POWER_WC = 450;
const MODULE_LENGTH_M = 1.95;
const MODULE_WIDTH_M = 1.134;
const MODULE_AREA_M2 = MODULE_LENGTH_M * MODULE_WIDTH_M;
const MODULE_DENSITY_WC_M2 = MODULE_POWER_WC / MODULE_AREA_M2;

/** V0: two symmetric roof planes, opposite azimuths and equal installed power. */
export function solarRoofPlanes({ roofType, roofPans, orientation }) {
  const azimuth = Number(orientation);
  if (!Number.isFinite(azimuth) || azimuth < 0 || azimuth > 315 || azimuth % 45 !== 0) throw new TypeError('Orientation invalide.');
  return roofType === 'pitched' && roofPans === 'two'
    ? [{ orientation: azimuth, weight: .5 }, { orientation: (azimuth + 180) % 360, weight: .5 }]
    : [{ orientation: azimuth, weight: 1 }];
}

export function combinePlaneProduction(results, planes) {
  if (!results.length || results.length !== planes.length) throw new TypeError('Résultats des pans incomplets.');
  return {
    ...results[0],
    annual_kwh_kwc: results.reduce((sum, result, index) => sum + Number(result.annual_kwh_kwc) * planes[index].weight, 0),
    monthly_kwh_kwc: Array.from({ length: 12 }, (_, month) => results.reduce((sum, result, index) => sum + Number(result.monthly_kwh_kwc[month]) * planes[index].weight, 0))
  };
}

function categoryForOrientation(orientation) {
  const azimuth = Number(orientation);
  if ((azimuth >= 45 && azimuth <= 135) || (azimuth >= 225 && azimuth <= 315)) return 'eastWest';
  if (azimuth >= 135 && azimuth <= 225) return 'south';
  return 'other';
}

function densityForFlatSouthAtTilt(tilt) {
  const beta = tilt * Math.PI / 180;
  const atSolarAltitude = (solarAltitudeDeg) => {
    const alpha = solarAltitudeDeg * Math.PI / 180;
    const rowPitch = MODULE_LENGTH_M * Math.cos(beta) + MODULE_LENGTH_M * Math.sin(beta) / Math.tan(alpha);
    return MODULE_POWER_WC / (MODULE_WIDTH_M * rowPitch);
  };
  return { low: atSolarAltitude(20), reference: atSolarAltitude(25), high: atSolarAltitude(30) };
}

function capToModule(density) {
  return Object.fromEntries(['low', 'reference', 'high'].map((key) => [key, Math.min(density[key], MODULE_DENSITY_WC_M2)]));
}

export function estimateSolarCapacity({ roofType, orientation, tiltBand, grossArea, usablePercent = 65 }) {
  const area = Number(grossArea);
  const usable = Number(usablePercent);
  const azimuth = Number(orientation);
  const tilt = PRO_SIMULATOR_TILT_ANGLES[tiltBand];
  if (!['flat', 'pitched'].includes(roofType) || !Number.isFinite(azimuth) || azimuth < 0 || azimuth > 315 || azimuth % 45 !== 0
      || !Number.isFinite(area) || area <= 0 || !Number.isFinite(usable) || usable < 0 || usable > 100 || !Number.isFinite(tilt)) {
    throw new TypeError('Les hypothèses de surface, inclinaison et orientation doivent être valides.');
  }

  const orientationFamily = categoryForOrientation(azimuth);
  let density = roofType === 'pitched'
    ? PRO_SIMULATOR_ROOF_DENSITIES.pitched
    : orientationFamily === 'eastWest'
      ? PRO_SIMULATOR_ROOF_DENSITIES.flatEastWest
      : orientationFamily === 'south' && tilt <= 15
        ? PRO_SIMULATOR_ROOF_DENSITIES.flatSouth
        : orientationFamily === 'south'
          ? densityForFlatSouthAtTilt(tilt)
          : PRO_SIMULATOR_ROOF_DENSITIES.flatOther;
  density = capToModule(density);
  const usableArea = area * usable / 100;
  const capacity = Object.fromEntries(['low', 'reference', 'high'].map((key) => [
    `${key}Kwp`, usableArea * density[key] / 1000
  ]));
  return Object.freeze({
    version: CR010_SIZING_VERSION,
    status: 'ASSUMPTION',
    basis: 'CR010_ROOF_DENSITY_ESTIMATE',
    grossAreaM2: area,
    usablePercent: usable,
    usableAreaM2: usableArea,
    densityWcM2: Object.freeze(density),
    ...capacity,
    modulePowerWc: MODULE_POWER_WC,
    moduleAreaM2: MODULE_AREA_M2,
    moduleCount: Math.ceil(capacity.referenceKwp * 1000 / MODULE_POWER_WC),
    layoutWarning: roofType === 'flat' && orientationFamily === 'south' && tilt > 15
  });
}

