/**
 * End-to-end: documents authored from nothing, and edits only the apps
 * can judge. Same harness and safety rules as roundtrip.e2e.test.ts; the
 * npm script runs e2e files one at a time, because two files driving the
 * same GUI apps concurrently would trip each other's busy guards.
 *
 * What a failure means, per test, is written above each one — a failure
 * here is usually the more informative outcome, so it is worth reading
 * the comment before assuming breakage.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "../harness.ts";
import { KeynoteDocument, NumbersDocument, PagesDocument } from "../../src/index.ts";
import {
  busySkipReason,
  E2ESession,
  osascript,
  posix,
  withDocument,
  type IWorkApp,
} from "./applescript.ts";

const skip: Record<IWorkApp, string | null> = {
  Pages: busySkipReason("Pages"),
  Numbers: busySkipReason("Numbers"),
  Keynote: busySkipReason("Keynote"),
};

const session = skip.Pages && skip.Numbers && skip.Keynote ? undefined : E2ESession.create();

process.on("exit", () => session?.cleanup());

const NUMBERS_FIXTURE = "numbers-parser-v26.1-date-formats.numbers";

describe("e2e: authored from nothing", () => {
  // A failure at `open` means Pages rejects the embedded donor itself —
  // the blank() capability regresses to app-blocked, and the donor (see
  // scripts/make-blanks.ts) needs remaking. A failure on the marker means
  // the donor opened but our edit did not survive.
  // The font readback checks the house typography end to end: the donor's
  // Body style says Palatino, and Pages must agree once real text lands.
  // Text right but font "Helvetica…" means our appended paragraph did not
  // pick up the Body style — a styling bug, not a donor bug.
  it("Pages opens a blank() document and reads our paragraph", { skip: skip.Pages ?? false }, () => {
    session!.remember("Pages");
    const path = session!.path("from-nothing.pages");
    const marker = `authored from nothing ${Date.now()}`;
    const doc = PagesDocument.blank();
    doc.appendParagraph(marker);
    writeFileSync(path, doc.save());
    const reported = withDocument(
      "Pages",
      path,
      `(body text of theDoc) & "|" & (font of word 1 of body text of theDoc)`,
    );
    const [text, font] = reported.split("|");
    expect(text).toContain(marker);
    expect(font).toContain("Palatino");
  });

  // Two questions in one document. The text cell is the acceptance check.
  // The formula cell carries a deliberately wrong cached value (999): if
  // Numbers reports 200 it recomputed on open — meaning the stale per-cell
  // dependency tracker setFormula leaves behind does not mislead the app,
  // the open question behind bisect rungs 19–21. If 999 comes back,
  // Numbers trusted our stale cache, and formula authoring must update
  // the tracker before it can claim app safety.
  it(
    "Numbers opens a blank() spreadsheet and recomputes our formula",
    { skip: skip.Numbers ?? false },
    () => {
      session!.remember("Numbers");
      const path = session!.path("from-nothing.numbers");
      const marker = `made-by-blank ${Date.now()}`;
      const doc = NumbersDocument.blank();
      const table = doc.tables()[0]!;
      table.setCell(1, 0, marker);
      table.setCell(1, 1, 100);
      table.setFormula(2, 1, "=B2*2", { value: 999 });
      writeFileSync(path, doc.save());

      const reported = osascript(
        `tell application "Numbers"\n` +
          `  set theDoc to open ${posix(path)}\n` +
          `  tell table 1 of sheet 1 of theDoc\n` +
          `    set a to value of cell "A2" as string\n` +
          `    set b to value of cell "B3" as string\n` +
          `  end tell\n` +
          `  close theDoc saving no\n` +
          `  return a & "|" & b\n` +
          `end tell`,
      );
      const [text, computed] = reported.split("|");
      expect(text).toBe(marker);
      expect(Number.parseFloat((computed ?? "").replace(",", "."))).toBe(200);
    },
  );

  // The donor deck is Apple's Basic White theme (13.2). A failure at
  // `open` means Keynote rejects the embedded donor itself and it needs
  // remaking (scripts/make-blanks.ts). The body-font readback checks the
  // house typography: the theme's Body style says Palatino, and typed
  // placeholder text must come back serif. A Helvetica answer means the
  // placeholder does not draw from the named Body style — which names
  // the next probe, not a broken deck.
  it("Keynote opens a blank() deck and reads our note", { skip: skip.Keynote ?? false }, () => {
    session!.remember("Keynote");
    const path = session!.path("from-nothing.key");
    const marker = `note from nothing ${Date.now()}`;
    const doc = KeynoteDocument.blank();
    doc.slides()[0]!.notes = marker;
    writeFileSync(path, doc.save());

    const reported = osascript(
      `tell application "Keynote"\n` +
        `  set theDoc to open ${posix(path)}\n` +
        `  set n to presenter notes of slide 1 of theDoc\n` +
        `  tell slide 1 of theDoc\n` +
        `    set object text of default body item to "serif check"\n` +
        `    set f to font of object text of default body item\n` +
        `  end tell\n` +
        `  close theDoc saving no\n` +
        `  return n & "|" & f\n` +
        `end tell`,
    );
    const [note, bodyFont] = reported.split("|");
    expect(note).toContain(marker);
    expect(bodyFont).toContain("Palatino");
  });

  // A merge this library wrote must survive Numbers rewriting the entire
  // package. A failure here means the merge-owner pair or its kind-5
  // dependency ledger is not what Numbers re-emits — the merge write
  // regresses from byte-proven to app-blocked.
  it("a merge we wrote survives Numbers resaving", { skip: skip.Numbers ?? false }, () => {
    session!.remember("Numbers");
    const path = session!.path("merged.numbers");
    const doc = NumbersDocument.load(readFileSync(session!.stageFixture(NUMBERS_FIXTURE)));
    const table = doc.tables()[0]!;
    table.mergeCells(3, 0, 1, 2);
    writeFileSync(path, doc.save());

    withDocument("Numbers", path, "name of theDoc", { save: true });

    const reparsed = NumbersDocument.load(readFileSync(path));
    const merges = reparsed.tables()[0]!.merges();
    expect(merges.some((m) => m.row === 3 && m.column === 0 && m.columnCount === 2)).toBe(true);
  });
});
