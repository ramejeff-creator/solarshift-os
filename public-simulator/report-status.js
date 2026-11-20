(function (root) {
  'use strict';
  const unresolvedStates = new Set(['UNKNOWN', 'STALE']);

  function frozenReportPresentationStatus(input = {}) {
    const report = input.report || input;
    const payload = report.payload || input.payload || {};
    const facts = Array.isArray(payload.facts) ? payload.facts : [];
    const unresolvedFacts = facts.filter((fact) => unresolvedStates.has(fact.status));
    const gate = input.publication_gate || payload.publication_gate || { ready: false, blockers: [] };
    if (report.status === 'PUBLISHED') {
      return {
        label: 'Rapport publié',
        provisional: false,
        unresolvedCount: unresolvedFacts.length,
        blockers: []
      };
    }
    const provisional = unresolvedFacts.length > 0 || gate.ready !== true;

    if (provisional) {
      return {
        label: 'Rapport provisoire',
        provisional: true,
        unresolvedCount: unresolvedFacts.length,
        blockers: Array.isArray(gate.blockers) ? gate.blockers : []
      };
    }

    const label = report.status === 'REVOKED' ? 'Rapport révoqué' : 'Rapport généré';
    return { label, provisional: false, unresolvedCount: 0, blockers: [] };
  }

  root.OzenoReportStatus = Object.freeze({ frozenReportPresentationStatus });
}(window));
