(function installInstallationCosts(global) {
  'use strict';
  const VERSION = 'INSTALLATION-COST-2026-11-14.1';

  // OZENO planning assumption, not a quotation or a directly published ADEME tariff.
  // The ADEME 2024 cost study covers 2012-2022; its rooftop CAPEX series gives a
  // 2020 value of 1,115 €/HT/kWc for existing medium rooftops (36-100 kWc). This
  // is a historical anchor, not an exact match for the full 10-100 kWc band or
  // current market prices.
  // The Sumène 2020 quote is 825 €/kWc for PV equipment+installation, excluding
  // 14,175 € HT of roof renovation (1,239 €/kWc for the full quote scope).
  // Shared by the project preview and the server-side public-simulator adapter.
  function resolve({ referenceKwp, siteKind = 'building', buildingUse = null, externalSurfaceType = null } = {}) {
    if (typeof referenceKwp !== 'number' || !Number.isFinite(referenceKwp) || referenceKwp <= 0
        || !['building', 'land'].includes(siteKind)
        || (buildingUse != null && !['offices', 'logistics', 'industry', 'retail', 'public', 'other'].includes(buildingUse))
        || (externalSurfaceType != null && !['parking', 'terrain', 'agriculture'].includes(externalSurfaceType))) {
      throw new TypeError('Invalid installation cost reference inputs');
    }
    let band = [900, 900, 900, 'Forfait générique · hypothèse de travail'];
    if (siteKind === 'land' && externalSurfaceType === 'terrain') band = [750, 750, 750, 'Centrale au sol · repère indicatif'];
    else if (siteKind === 'land' && externalSurfaceType === 'parking' && referenceKwp > 250) band = [1000, 1125, 1250, 'Ombrière >250 kWc · repère indicatif'];
    else if (siteKind === 'building' && referenceKwp >= 10 && referenceKwp < 100) band = [900, 1100, 1400, 'Toiture commerciale 10–100 kWc · repère indicatif'];
    else if (siteKind === 'building' && referenceKwp >= 100 && referenceKwp <= 250) band = [750, 850, 1200, 'Toiture commerciale 100–250 kWc · repère indicatif'];
    else if (siteKind === 'building' && buildingUse === 'industry' && referenceKwp > 250) band = [750, 800, 1000, 'Toiture industrielle >250 kWc · repère indicatif'];
    return { version: VERSION, lowEurPerKwp: band[0], referenceEurPerKwp: band[1], highEurPerKwp: band[2], label: band[3] };
  }

  global.SolarShiftInstallationCosts = Object.freeze({ VERSION, resolve });
})(globalThis);
