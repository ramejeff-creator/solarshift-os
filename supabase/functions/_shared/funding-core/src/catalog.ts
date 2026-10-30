import type { FundingProgram } from "./types.ts";

export const CATALOG_SCHEMA_VERSION = "funding-catalog-v1";

export function validateCatalog(items: readonly FundingProgram[]): void {
  const ids = new Set<string>();
  for (const item of items) {
    if (!/^FUND-[A-Z]+-\d{3}$/.test(item.id)) throw new Error(`invalid_program_id:${item.id}`);
    if (ids.has(item.id)) throw new Error(`duplicate_program_id:${item.id}`);
    ids.add(item.id);
    if (!item.name.trim() || !item.version.trim() || item.actionAnyOf.length === 0)
      throw new Error(`invalid_program:${item.id}`);
    if (!item.source.url.startsWith("https://") || !/^\d{4}-\d{2}-\d{2}$/.test(item.source.checkedAt))
      throw new Error(`invalid_source:${item.id}`);
    if (item.source.verifiedForLiveUse !== false)
      throw new Error(`pilot_program_cannot_be_approved:${item.id}`);
    if (item.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(item.deadline))
      throw new Error(`invalid_deadline:${item.id}`);
  }
}
