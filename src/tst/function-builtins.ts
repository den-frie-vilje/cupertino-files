/**
 * Known `AST_function_node_index` values, proven one at a time.
 *
 * Deliberately tiny. Apple's index is not published, and a table of
 * confident-looking guesses is worse than an honest gap: a formula
 * rendered as `AVERAGE(...)` when it is really `MEDIAN(...)` is a silent
 * lie, whereas `FUNCTION_42(...)` is a visible one.
 *
 * Every entry here is backed by arithmetic in the fixture corpus or by a
 * measured exchange with the live app:
 *
 *  - **168 = SUM** — `libetonyek-pages5-extra-dir.pages` has `FUNCTION_168`
 *    over a column whose cached result (7920) is exactly the sum of the
 *    cells above it (5500 + 1170 + 1250), and the "Cats" table in
 *    `numbers-parser-*-issue102.numbers` uses the same id for its TOTAL row.
 *  - **212 = DURATION** — in `numbers-parser-v26.1-custom-formats.numbers`,
 *    `=$A$11+FUNCTION_212(,,8,22,11,500)` lands exactly 8h 22m 11.5s after
 *    A11's midnight, and sibling rows differing only in the third argument
 *    (8 → 12 → 24) shift by exactly that many hours. Six arguments, the
 *    last four hours/minutes/seconds/milliseconds, the first two omitted:
 *    `DURATION(weeks, days, hours, minutes, seconds, milliseconds)`.
 *  - **86 = MEDIAN** — the e2e function harvest (a live, current-format
 *    Numbers install) had the app author eight probe formulas; seven
 *    rendered under their harvested names and the run reported exactly one
 *    unnamed id, 86, leaving `=MEDIAN(B1:B3)` as the only unaccounted
 *    probe. The locally alphabetical neighbourhood — MAX is 84, MIN is
 *    88 — agrees.
 *
 * **The index is not alphabetical.** SUM and DURATION rule it out — D sorts
 * before S, yet DURATION is 212 and SUM is 168 — and they rule out
 * category-then-name ordering for the same reason. There is no shortcut:
 * the table has to be measured against a real install.
 *
 * This is its own module — rather than living beside the renderer in
 * `formulas.ts` — so the formula *builder* can invert it without importing
 * the renderer, whose import chain reaches back through `tables.ts` into
 * the builder.
 */
export const BUILTIN_FUNCTIONS: ReadonlyMap<number, string> = new Map([
  [86, "MEDIAN"],
  [168, "SUM"],
  [212, "DURATION"],
]);
