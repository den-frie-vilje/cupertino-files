/**
 * Do our field numbers still agree with Apple's schema?
 *
 * The library does not read a `.proto` at runtime. Every field number is a
 * hand-written constant in the per-family `schema.ts` files, because parsing 41
 * schema files to look up `field 5` on every archive would be absurd — and
 * because the vendored dumps are Numbers 14.4 and Pages 5.0, older than the
 * documents this reads. The constants are the source of truth in the code;
 * the protos are the source of truth about Apple.
 *
 * `scripts/check-proto-drift.ts` keeps the two honest, and it was the only
 * check not wired into `npm test`. It had been failing — `PopUpMenuModel`'s
 * `ITEM = 2` matched the schema's deprecated `item = 1` rather than the
 * `tsce_item = 2` it meant — and a red check nobody runs is not a check.
 *
 * Two assertions, deliberately different in kind:
 *
 *  * **No drift.** A constant that contradicts a resolvable schema field is
 *    a bug, full stop, and the count must be zero rather than budgeted.
 *  * **No shrinking coverage.** Drift can only be found where a constant's
 *    docblock names an archive that is in a vendored dump. Deleting the
 *    docblock line would make the first assertion pass by checking nothing,
 *    so the number of verified fields has a floor.
 */
import { describe, expect, it } from "./harness.ts";
import { driftReport } from "../scripts/check-proto-drift.ts";

const REPORT = driftReport();

describe("hand-written field numbers match the vendored schemas", () => {
  it("has no constant contradicting a field the schema resolves", () => {
    const drift = REPORT.findings
      .filter((f) => f.kind === "mismatch")
      .map((f) => `${f.file} ${f.constant}: ${f.detail}`);
    expect(`drift: ${drift.join(" | ")}`).toBe("drift: ");
  });

  it("keeps checking at least as much as it does today", () => {
    // 410 field numbers across 72 constant groups. A constant whose
    // docblock names no archive is invisible to this check — there are 46
    // such groups — so the floor is what stops the gap widening quietly.
    expect(`fields verified >= 410: ${REPORT.checkedFields >= 410} (${REPORT.checkedFields})`).toBe(
      `fields verified >= 410: true (${REPORT.checkedFields})`,
    );
    expect(
      `constants matched >= 72: ${REPORT.matchedConstants >= 72} (${REPORT.matchedConstants})`,
    ).toBe(`constants matched >= 72: true (${REPORT.matchedConstants})`);
  });

  it("loaded every vendored dump, not just the shared families", () => {
    // Guards the guard. `loadProtos` walking the wrong directory would
    // resolve no archive, report no drift, and pass both assertions above
    // — which is exactly how the Pages family stayed unnamed in the shape
    // audit until someone looked.
    expect(REPORT.messages > 1000).toBe(true);
  });
});
