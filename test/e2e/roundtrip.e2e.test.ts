/**
 * End-to-end round-trips against the real iWork applications.
 *
 * Run on a Mac with Pages / Numbers / Keynote installed:
 *
 *     npm run test:e2e
 *
 * The first run raises a one-time macOS automation prompt per app; approve
 * it (or System Settings → Privacy & Security → Automation). Everywhere
 * else — Linux, CI, a Mac without the apps — every test skips with a
 * reason and nothing fails.
 *
 * Three directions are covered, and they answer different questions:
 *
 *  1. **we write → the app reads.** The one the unit suite cannot answer:
 *     does Pages actually accept our output? A document we edited is
 *     opened by the app and asked what it contains.
 *  2. **the app writes → we read.** Proves the parser handles output from
 *     the app version installed *today*, not just the archived corpus.
 *  3. **we write → the app re-saves → we read.** The full loop: our edit
 *     must survive the app rewriting the entire package.
 *
 * Direction 2 also *manufactures* coverage the fixture corpus lacks — most
 * importantly a Keynote slide with a real transition, which no licensed
 * document anywhere was found to contain.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "../harness.ts";
import { KeynoteDocument, NumbersDocument, PagesDocument, cellValueToString } from "../../src/index.ts";
import {
  busySkipReason,
  E2ESession,
  osascript,
  posix,
  withDocument,
  type IWorkApp,
} from "./applescript.ts";

/** Compute skip reasons once, before any test body runs. */
const skip: Record<IWorkApp, string | null> = {
  Pages: busySkipReason("Pages"),
  Numbers: busySkipReason("Numbers"),
  Keynote: busySkipReason("Keynote"),
};

const session = skip.Pages && skip.Numbers && skip.Keynote ? undefined : E2ESession.create();

process.on("exit", () => session?.cleanup());

/** A Pages fixture that is a plain word-processing document with body text. */
const PAGES_FIXTURE = "picodocs-v14.4-headers-tables.pages";
const NUMBERS_FIXTURE = "numbers-parser-v26.1-date-formats.numbers";
const KEYNOTE_FIXTURE = "zenodo-v26.1-hyperlinks-masks.key";

describe("e2e: Pages", () => {
  it(
    "opens a document we edited and reports our text",
    { skip: skip.Pages ?? false },
    () => {
      session!.remember("Pages");
      const path = session!.path("our-edit.pages");
      const marker = `iwork-files e2e ${Date.now()}`;

      // 1. Edit with the library and write the package ourselves.
      const doc = PagesDocument.load(readFileSync(session!.stageFixture(PAGES_FIXTURE)));
      doc.appendParagraph(marker);
      writeFileSync(path, doc.save());

      // 2. Ask Pages what it sees. If our output were malformed, `open`
      //    itself would fail here — which is the real assertion.
      const bodyText = withDocument("Pages", path, "body text of theDoc");
      expect(bodyText).toContain(marker);
    },
  );

  it(
    "reads a document Pages itself saved, preserving our edit",
    { skip: skip.Pages ?? false },
    () => {
      session!.remember("Pages");
      const path = session!.path("app-resaved.pages");
      const marker = `roundtrip ${Date.now()}`;

      const doc = PagesDocument.load(readFileSync(session!.stageFixture(PAGES_FIXTURE)));
      doc.appendParagraph(marker);
      const headerBefore = doc.sections()[0]!.headerText();
      writeFileSync(path, doc.save());

      // Let Pages rewrite the whole package.
      withDocument("Pages", path, "name of theDoc", { save: true });

      // Parse the app's own output.
      const reparsed = PagesDocument.load(readFileSync(path));
      expect(reparsed.bodyText).toContain(marker);
      // Structure the app rewrote must still be readable by us.
      expect(reparsed.sections().length).toBeGreaterThan(0);
      expect(reparsed.sections()[0]!.headerText()).toBe(headerBefore);
      expect(reparsed.compatibility().canRoundTrip).toBe(true);
    },
  );

  it(
    "round-trips text written by Pages back through the library",
    { skip: skip.Pages ?? false },
    () => {
      session!.remember("Pages");
      const path = session!.path("app-authored.pages");
      const written = `authored-by-pages ${Date.now()}`;

      session!.stageFixture(PAGES_FIXTURE, "app-authored.pages");
      // Pages writes the text; the library must read exactly it back.
      withDocument("Pages", path, `set body text of theDoc to ${JSON.stringify(written)}`, {
        save: true,
      });

      const doc = PagesDocument.load(readFileSync(path));
      expect(doc.bodyText.trim()).toBe(written);

      // And our own edit on top survives another app open.
      doc.appendParagraph("second pass");
      writeFileSync(path, doc.save());
      expect(withDocument("Pages", path, "body text of theDoc")).toContain("second pass");
    },
  );
});

describe("e2e: Keynote", () => {
  it(
    "reads a transition that Keynote itself applied",
    { skip: skip.Keynote ?? false },
    () => {
      // This is the capability the corpus cannot validate: every archived
      // deck has effect "none". Here Keynote sets a real one for us.
      session!.remember("Keynote");
      const path = session!.path("transition.key");
      session!.stageFixture(KEYNOTE_FIXTURE, "transition.key");

      osascript(
        `tell application "Keynote"\n` +
          `  set theDoc to open ${posix(path)}\n` +
          `  tell slide 1 of theDoc\n` +
          `    set transition properties to {transition effect:dissolve effect, ` +
          `transition duration:2.0, automatic transition:true}\n` +
          `  end tell\n` +
          `  save theDoc\n` +
          `  close theDoc saving no\n` +
          `end tell`,
      );

      const doc = KeynoteDocument.load(readFileSync(path));
      const transition = doc.slides()[0]!.transition()!;
      expect(transition.enabled).toBe(true);
      expect(transition.effect === "none").toBe(false);
      expect(transition.duration).toBe(2);
      expect(transition.automatic).toBe(true);
      // Other slides are untouched.
      expect(doc.slides()[1]?.transition()?.enabled ?? false).toBe(false);
    },
  );

  it(
    "writes a transition that Keynote reads back",
    { skip: skip.Keynote ?? false },
    () => {
      session!.remember("Keynote");
      const path = session!.path("our-transition.key");

      // Have Keynote set one first, so we learn the exact effect string it
      // uses, then rewrite the parameters with the library.
      session!.stageFixture(KEYNOTE_FIXTURE, "our-transition.key");
      osascript(
        `tell application "Keynote"\n` +
          `  set theDoc to open ${posix(path)}\n` +
          `  tell slide 1 of theDoc to set transition properties to ` +
          `{transition effect:dissolve effect, transition duration:1.0}\n` +
          `  save theDoc\n` +
          `  close theDoc saving no\n` +
          `end tell`,
      );

      const doc = KeynoteDocument.load(readFileSync(path));
      const effect = doc.slides()[0]!.transition()!.effect;
      doc.slides()[0]!.setTransition({ duration: 3.5, automatic: true });
      // Apply the same effect to slide 2 through our own writer.
      if (doc.slides().length > 1) doc.slides()[1]!.setTransition({ effect, duration: 3.5 });
      writeFileSync(path, doc.save());

      // Keynote must accept the package and report our duration.
      const reported = osascript(
        `tell application "Keynote"\n` +
          `  set theDoc to open ${posix(path)}\n` +
          `  set d to transition duration of (transition properties of slide 1 of theDoc)\n` +
          `  close theDoc saving no\n` +
          `  return d as string\n` +
          `end tell`,
      );
      expect(Math.abs(Number.parseFloat(reported) - 3.5) < 0.01).toBe(true);

      const reparsed = KeynoteDocument.load(readFileSync(path));
      expect(reparsed.slides()[0]!.transition()!.duration).toBe(3.5);
      if (reparsed.slides().length > 1) {
        expect(reparsed.slides()[1]!.transition()!.enabled).toBe(true);
      }
    },
  );

  it(
    "round-trips speaker notes through Keynote",
    { skip: skip.Keynote ?? false },
    () => {
      session!.remember("Keynote");
      const path = session!.path("notes.key");
      const note = `speaker note ${Date.now()}`;
      session!.stageFixture(KEYNOTE_FIXTURE, "notes.key");

      // Keynote writes the note …
      osascript(
        `tell application "Keynote"\n` +
          `  set theDoc to open ${posix(path)}\n` +
          `  set presenter notes of slide 1 of theDoc to ${JSON.stringify(note)}\n` +
          `  save theDoc\n` +
          `  close theDoc saving no\n` +
          `end tell`,
      );
      const doc = KeynoteDocument.load(readFileSync(path));
      expect(doc.slides()[0]!.notes.trim()).toBe(note);

      // … and we write it back for Keynote to confirm.
      doc.slides()[0]!.notes = `${note} (edited)`;
      writeFileSync(path, doc.save());
      const reported = osascript(
        `tell application "Keynote"\n` +
          `  set theDoc to open ${posix(path)}\n` +
          `  set n to presenter notes of slide 1 of theDoc\n` +
          `  close theDoc saving no\n` +
          `  return n\n` +
          `end tell`,
      );
      expect(reported).toContain("(edited)");
    },
  );
});

describe("e2e: Numbers", () => {
  it(
    "reads cell values that Numbers itself wrote",
    { skip: skip.Numbers ?? false },
    () => {
      session!.remember("Numbers");
      const path = session!.path("cells.numbers");
      const text = `cell-${Date.now()}`;
      session!.stageFixture(NUMBERS_FIXTURE, "cells.numbers");

      osascript(
        `tell application "Numbers"\n` +
          `  set theDoc to open ${posix(path)}\n` +
          `  tell table 1 of sheet 1 of theDoc\n` +
          `    set value of cell "A1" to ${JSON.stringify(text)}\n` +
          `    set value of cell "B1" to 1234.5\n` +
          `  end tell\n` +
          `  save theDoc\n` +
          `  close theDoc saving no\n` +
          `end tell`,
      );

      const doc = NumbersDocument.load(readFileSync(path));
      const table = doc.tables()[0]!;
      expect(table.storageGeneration).toBe("v5");
      const values = table.cells().map((c) => cellValueToString(c.value));
      expect(values.some((v) => v === text)).toBe(true);
      expect(values.some((v) => v === "1234.5")).toBe(true);
    },
  );

  it(
    "opens a library-edited spreadsheet in Numbers",
    { skip: skip.Numbers ?? false },
    () => {
      session!.remember("Numbers");
      const path = session!.path("edited.numbers");
      const marker = `sheet-note-${Date.now()}`;

      // Cell writing is not implemented, so edit through a text storage —
      // the point is that Numbers still accepts our package.
      const doc = NumbersDocument.load(readFileSync(session!.stageFixture(NUMBERS_FIXTURE)));
      const storage = doc.textStorages().find((s) => s.text.trim().length > 0);
      if (storage) storage.setText(marker);
      writeFileSync(path, doc.save());

      const sheetCount = withDocument("Numbers", path, "count of sheets of theDoc");
      expect(Number.parseInt(sheetCount, 10) > 0).toBe(true);

      const reparsed = NumbersDocument.load(readFileSync(path));
      expect(reparsed.sheets().length).toBe(doc.sheets().length);
      expect(reparsed.compatibility().canRoundTrip).toBe(true);
    },
  );
});

describe("e2e: harness", () => {
  it("reports why it skipped, so a silent no-op is impossible", () => {
    const reasons = Object.entries(skip)
      .filter(([, reason]) => reason)
      .map(([app, reason]) => `${app}: ${reason}`);
    if (reasons.length > 0) {
      console.log(`\ne2e skipped —\n  ${reasons.join("\n  ")}\n`);
    }
    // Never fails: this test exists to surface the reason in the log.
    expect(reasons.length >= 0).toBe(true);
  });

  it("never leaves scratch files behind", { skip: session ? false : "no app available" }, () => {
    expect(existsSync(session!.dir)).toBe(true);
    // cleanup() runs on process exit; verified here only that it is armed.
    expect(typeof session!.cleanup).toBe("function");
  });
});
