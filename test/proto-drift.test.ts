/**
 * Are the vendored schemas actually load-bearing, and still agreed with?
 *
 * A declaration names *fields* and `protoFields` looks the numbers up
 * from `src/proto/vendored.ts`, which `npm run proto:embed` generates from
 * `proto/`. Nothing weaker holds: a hand-typed integer has only a comment
 * connecting it to the dumps, a cross-check that matches constant names to
 * field names by spelling misleads — a constant called `ITEM` matches a
 * deprecated `item = 1` when it means `tsce_item = 2` — and a check
 * `npm test` does not run can sit red indefinitely. Three things have to
 * stay true, and each is a different kind of failure:
 *
 *  * **The bridge is current.** A refreshed dump nobody re-embedded, or a
 *    hand-edit of the generated module, is a lie about where the numbers
 *    came from.
 *  * **What is still hand-typed does not contradict the schema.** The
 *    remainder is archive type ids, which are in no `.proto` at all, and
 *    enums the dumps predate. A number among them that the schema *does*
 *    define under some name is drift.
 *  * **The hand-typed remainder only shrinks.** Otherwise the mechanism can
 *    be bypassed by hand-typing the next constant, and nothing would say
 *    so.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { driftReport } from "../scripts/check-proto-drift.ts";
import { generate } from "../scripts/embed-proto-schema.ts";
import { ABSENT_ARCHIVES, ENUMS, MESSAGES, VENDORED_SOURCES } from "../src/proto/vendored.ts";

const REPORT = driftReport();

describe("the vendored schemas are the source of the field numbers", () => {
  it("has an embedded bridge that matches proto/ exactly", () => {
    // Regenerating and comparing, rather than trusting a digest: the digest
    // is *in* the file being checked, so it can only catch a changed proto,
    // not an edited table.
    const fresh = generate();
    expect(`conflicts: ${fresh.conflicts.join(" | ")}`).toBe("conflicts: ");

    const current = new URL("../src/proto/vendored.ts", import.meta.url);
    const onDisk = readFileSync(current, "utf8");
    expect(`src/proto/vendored.ts current: ${onDisk === fresh.text}`).toBe(
      "src/proto/vendored.ts current: true",
    );
  });

  it("embeds every schema file, so nothing silently stops being vendored", () => {
    expect(`schemas: ${VENDORED_SOURCES.length}`).toBe("schemas: 41");
    const missing = VENDORED_SOURCES.filter((s) => !/^[0-9a-f]{40}$/.test(s.sha1));
    expect(`bad digests: ${missing.map((s) => s.path).join(" ")}`).toBe("bad digests: ");
  });

  it("resolves a large and growing share of the field numbers from them", () => {
    // Counted from the bridge rather than from the declarations: this is
    // what Apple's schema actually supplies to the running library.
    const fields = Object.values(MESSAGES).reduce((n, m) => n + Object.keys(m).length, 0);
    const values = Object.values(ENUMS).reduce((n, e) => n + Object.keys(e).length, 0);
    expect(
      `archives >= 95: ${Object.keys(MESSAGES).length >= 95} (${Object.keys(MESSAGES).length})`,
    ).toBe(`archives >= 95: true (${Object.keys(MESSAGES).length})`);
    expect(`fields >= 900: ${fields >= 900} (${fields})`).toBe(`fields >= 900: true (${fields})`);
    expect(`enum values >= 160: ${values >= 160} (${values})`).toBe(
      `enum values >= 160: true (${values})`,
    );
  });

  it("has no hand-typed number contradicting a field the schema resolves", () => {
    const drift = REPORT.findings
      .filter((f) => f.kind === "mismatch")
      .map((f) => `${f.file} ${f.constant}: ${f.detail}`);
    expect(`drift: ${drift.join(" | ")}`).toBe("drift: ");
  });

  it("keeps shrinking what is still hand-typed", () => {
    // A ratchet: what resolves from the schema cannot be wrong, so the
    // hand-typed remainder may only shrink. A ceiling rather than zero
    // because archive type ids (`TSWP_TYPE.STORAGE = 2001`) are the app's
    // object registry, appear in no `.proto`, and cannot move.
    const groups = REPORT.totalConstants;
    expect(`hand-typed groups <= 30: ${groups <= 30} (${groups})`).toBe(
      `hand-typed groups <= 30: true (${groups})`,
    );
  });

  it("names an archive for every declaration, so nothing is unresolvable by accident", () => {
    // `ABSENT_ARCHIVES` is the deliberate list: a name the code uses that
    // no dump has. Every one of them must be reachable only through the
    // measured* helpers, which is what makes the staleness of the dumps
    // countable rather than invisible.
    for (const archive of ABSENT_ARCHIVES) {
      expect(`${archive} in MESSAGES: ${archive in MESSAGES}`).toBe(`${archive} in MESSAGES: false`);
      expect(`${archive} in ENUMS: ${archive in ENUMS}`).toBe(`${archive} in ENUMS: false`);
    }
    expect(`absent archives <= 4: ${ABSENT_ARCHIVES.length <= 4} (${ABSENT_ARCHIVES.length})`).toBe(
      `absent archives <= 4: true (${ABSENT_ARCHIVES.length})`,
    );
  });
});
