/**
 * TSCE function-index → name, measured from a real Numbers install.
 *
 * GENERATED — do not edit by hand. Regenerate with:
 *   node scripts/harvest-functions.ts --ingest <doc.numbers>
 *
 * This mapping exists in no schema; it can only be measured by having
 * Numbers author the formulas. See docs/MANUAL-WORK.md for the protocol
 * and the ledger of who ran it against which version.
 *
 * Harvested: not yet run — the table below is empty by design. The one
 * mapping in effect (168 = SUM) is proven by the fixture corpus and lives
 * in BUILTIN_FUNCTIONS, not here.
 * Coverage:  0 of 298 candidates
 */
export const HARVESTED_FUNCTIONS: ReadonlyMap<number, string> = new Map([
]);

/** Provenance of the table above, surfaced for diagnostics. */
export const HARVEST_PROVENANCE = {
  app: "not yet harvested",
  harvestedAt: "",
  functions: 0,
  candidates: 298,
} as const;
