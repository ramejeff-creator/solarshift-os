import './installer-commission.js';

export function projectInstallerCommission(project) {
  return globalThis.OzenoInstallerCommission.fromPreview(project?.preview);
}

export function summarizeInstallerCommissions(records = []) {
  const seen = new Set();
  const result = { estimatedProjects: 0, missingProjects: 0, lowEur: 0, highEur: 0, invoicedRevenueEur: null };
  for (const project of records) {
    if (seen.has(project.id) || ['ABANDONED', 'DELETED'].includes(project.commercialStatus)) continue;
    if (project.id) seen.add(project.id);
    const commission = projectInstallerCommission(project);
    if (!commission) { result.missingProjects++; continue; }
    result.estimatedProjects++; result.lowEur += commission.lowEur; result.highEur += commission.highEur;
  }
  return result;
}

export const COMMERCIAL_PROJECT_STATUS_LABELS = Object.freeze({
  IN_PROGRESS: 'En cours',
  VALIDATED: 'Validé commercialement',
  ABANDONED: 'Abandonné',
  DELETED: 'Supprimé'
});

const text = (value) => String(value ?? '').trim();
const timestamp = (record) => {
  const value = Date.parse(record?.updatedAt || '');
  return Number.isFinite(value) ? value : null;
};

export function summarizeAccessibleProjects(records = []) {
  const projects = Array.isArray(records) ? records : [];
  const counts = { total: projects.length, inProgress: 0, validated: 0, other: 0 };
  for (const project of projects) {
    const status = text(project?.commercialStatus).toUpperCase();
    if (status === 'IN_PROGRESS') counts.inProgress += 1;
    else if (status === 'VALIDATED') counts.validated += 1;
    else counts.other += 1;
  }
  return counts;
}

export function filterAccessibleProjects(records = [], {
  search = '',
  status = 'ALL',
  periodDays = 0,
  now = Date.now()
} = {}) {
  const query = text(search).toLocaleLowerCase('fr-FR');
  const days = Number(periodDays) || 0;
  const cutoff = days > 0 ? Number(now) - days * 24 * 60 * 60 * 1000 : null;
  return (Array.isArray(records) ? records : [])
    .filter((project) => {
      const projectStatus = text(project?.commercialStatus).toUpperCase();
      if (status !== 'ALL' && projectStatus !== status) return false;
      if (cutoff != null) {
        const updatedAt = timestamp(project);
        if (updatedAt == null || updatedAt < cutoff) return false;
      }
      if (!query) return true;
      return [project?.name, project?.clientName, project?.address, project?.city]
        .some((value) => text(value).toLocaleLowerCase('fr-FR').includes(query));
    })
    .slice()
    .sort((a, b) => (timestamp(b) ?? -Infinity) - (timestamp(a) ?? -Infinity));
}

export function normalizeAccessibleProject(record = {}) {
  const data = record?.data && typeof record.data === 'object' ? record.data : {};
  return { ...data, ...record };
}
