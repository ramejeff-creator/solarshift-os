// Formatting only: financial projections are calculated by the server.
export const PROJECT_TIMING_LABELS = Object.freeze({
  asap: 'Dès que possible', '3-6-months': 'Dans 3 à 6 mois',
  later: 'Dans plus de 6 mois', unknown: 'Je ne sais pas encore'
});
export function projectTimingLabel(value) {
  return PROJECT_TIMING_LABELS[value] ?? PROJECT_TIMING_LABELS.unknown;
}
export function paybackWindow(projection, ready) {
  if (!ready || !Array.isArray(projection) || projection.length < 2) return 'À préciser';
  const rows = [...projection].sort((a, b) => a.year - b.year);
  if (!rows.every((row) => Number.isFinite(row.year) && Number.isFinite(row.cumulativeNetGainEur))) return 'À préciser';
  const crossing = rows.findIndex((row) => row.year > 0 && row.cumulativeNetGainEur >= 0);
  if (crossing < 0) return `Non atteint sur ${rows.at(-1).year} ans`;
  if (crossing === 0) return 'À préciser';
  return `${rows[crossing - 1].year}–${rows[crossing].year} ans`;
}
export function carbonEquivalenceKm(carbonTonnes) {
  // Impact CO₂, moyenne diesel, 142 gCO₂e/km including manufacture and use.
  // https://impactco2.fr/outils/transport/voiturethermique (consulted 2026-10-12).
  return typeof carbonTonnes === 'number' && Number.isFinite(carbonTonnes) && carbonTonnes >= 0
    ? Math.round(carbonTonnes * 1_000_000 / 142) : null;
}
