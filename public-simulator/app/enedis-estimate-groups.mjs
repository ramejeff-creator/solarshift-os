/** Group latest Enedis activity estimates only when year and population match. */
export function groupComparableEnedisEstimates(rows) {
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.year == null || String(row.year).trim() === '') continue;
    const year = Number(row?.year);
    const annualMwh = Number(row?.annualMwh);
    if (!Number.isInteger(year) || year < 1900 || year > 2200 || !Number.isFinite(annualMwh) || annualMwh < 0) continue;
    const population = row.population || 'UNKNOWN';
    const key = `${year}|${population}`;
    if (!groups.has(key)) groups.set(key, { year, population, rows: [], totalMwh: 0 });
    const group = groups.get(key);
    group.rows.push(row);
    group.totalMwh += annualMwh;
  }
  return [...groups.values()];
}
