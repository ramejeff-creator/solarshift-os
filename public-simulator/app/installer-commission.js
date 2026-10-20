(function installInstallerCommission(global) {
  'use strict';
  const VERSION = 'OZENO-INSTALLER-COMMISSION-2026-10-12.1';
  // Product decision: the installer pays OZENO, independently of customer cashflows.
  function estimate({ installationBaseEur, ratePct = null, basis = 'UNKNOWN', taxBasis = 'UNSPECIFIED', costModelVersion = null } = {}) {
    const base = Number(installationBaseEur);
    if (installationBaseEur == null || installationBaseEur === '' || !Number.isFinite(base) || base <= 0) return null;
    const rate = ratePct == null || ratePct === '' ? null : Number(ratePct);
    if (rate !== null && (!Number.isFinite(rate) || rate < 8 || rate > 10)) return null;
    return Object.freeze({ modelVersion: VERSION, status: 'ESTIMATE_NOT_INVOICED', payer: 'INSTALLER', beneficiary: 'OZENO',
      installationBaseEur: base, basis, taxBasis, costModelVersion, lowRatePct: 8, highRatePct: 10,
      lowEur: base * .08, highEur: base * .10, selectedRatePct: rate,
      selectedEur: rate === null ? null : base * rate / 100, customerCapexAdjustmentEur: 0 });
  }
  function fromPreview(preview) {
    const saved = preview?.commercialRemuneration;
    if (!saved || saved.modelVersion !== VERSION || saved.payer !== 'INSTALLER' || saved.beneficiary !== 'OZENO'
      || saved.status !== 'ESTIMATE_NOT_INVOICED') return null;
    // Recompute from the explicit base: never trust a stored total or a stale energy gain.
    return estimate({ installationBaseEur: saved.installationBaseEur, ratePct: saved.selectedRatePct,
      basis: saved.basis, taxBasis: saved.taxBasis, costModelVersion: saved.costModelVersion });
  }
  global.OzenoInstallerCommission = Object.freeze({ VERSION, estimate, fromPreview });
})(globalThis);
