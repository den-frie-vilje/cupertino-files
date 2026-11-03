/**
 * The Keynote ladder on the 14.4.1 base, answered by Keynote itself.
 *
 * Keynote converts a 14.x deck on open, a different code path from
 * loading a current one, so every rung of scripts/make-keynote-docs.ts
 * is built against the old deck and opened in the app, which reports
 * what each rung changed through its scripting dictionary; the slide
 * background, which the dictionary does not expose, is read off the
 * app's PDF export. The build's playing is the one rung a person still
 * watches.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "../harness.ts";
import { KeynoteDocument } from "../../src/index.ts";
import { BASES, RUNGS } from "../../scripts/make-keynote-docs.ts";
import { busySkipReason, countPixels, E2ESession, exportDocument, osajs, popplerSkipReason, rasterize } from "./applescript.ts";

const skip = busySkipReason("Keynote");
const poppler = popplerSkipReason();
const session = skip ? undefined : E2ESession.create();
process.on("exit", () => session?.cleanup());

const base = BASES.find((b) => b.tag === "v14")!;

/** Build a rung on the v14 base and have Keynote evaluate `expr` over its slides `s`. */
function askKeynote(rung: string, expr: string): unknown {
  session!.remember("Keynote");
  const path = session!.path(`v14-${rung}.key`);
  const doc = KeynoteDocument.load(new Uint8Array(readFileSync(base.url)));
  RUNGS.find((r) => r.name === rung)!.build(doc);
  writeFileSync(path, doc.save());
  const out = osajs(
    `const d = Application('Keynote').open(Path(${JSON.stringify(path)})); const s = d.slides();` +
      `let out; try { out = JSON.stringify(${expr}); } finally { d.close({ saving: 'no' }); } out;`,
  );
  return JSON.parse(out);
}

const titles = "s.map(x => x.defaultTitleItem.objectText())";
const layouts = "s.map(x => x.baseLayout.name())";

describe("keynote ladder, v14 base: Keynote reports each rung's change", () => {
  const cases: [string, string, unknown][] = [
    ["K00-untouched", "[d.slides.length, d.width(), d.height()]", [3, 1920, 1080]],
    ["K01-title", `${titles}[0].startsWith("K01")`, true],
    ["K02-body", "s[0].defaultBodyItem.objectText().split('\\n')[0]", "This body text replaced the slide's original content."],
    ["K03-presenter-notes", "s[0].presenterNotes()", "KEYNOTE LADDER NOTE."],
    ["K04-add-slide", `[d.slides.length, ${titles}[3].startsWith("K04")]`, [4, true]],
    ["K05-duplicate-slide", `[d.slides.length, ${titles}[0] === ${titles}[1]]`, [4, true]],
    ["K06-remove-slide", "d.slides.length", 2],
    ["K07-reorder", `${titles}[2].startsWith("K07")`, true],
    ["K08-auto-advance", "[s[0].transitionProperties().automaticTransition, s[0].transitionProperties().transitionDelay]", [true, 2]],
    ["K09-skip-slide", "s.map(x => x.skipped())", [false, true, false]],
    ["K10-slide-size", "[d.width(), d.height()]", [1024, 768]],
    ["K12-text-box", "s[0].textItems().some(t => t.objectText() === 'Written by cupertino-files')", true],
    ["K13-slide-from-layout", `[d.slides.length, ${layouts}[3], s[3].defaultBodyItem.objectText()]`, [4, "Title & Bullets", "This body sits where the layout puts it."]],
    ["K15-table", "s[0].tables().map(t => [t.rowCount(), t.columnCount(), t.ranges.byName('A1:B3').cells().map(c => c.value())])", [[3, 2, ["Item", "Count", "Apples", 3, "Pears", 5]]]],
    ["K16-set-layout", `[${layouts}[0], ${titles}[0].startsWith("K16")]`, ["Title & Bullets", true]],
  ];
  for (const [rung, expr, expected] of cases) {
    it(rung, { skip: skip ?? false }, () => {
      expect(askKeynote(rung, expr)).toEqual(expected);
    });
  }

  it("K14-slide-background: the first slide exports dark green", { skip: skip ?? poppler ?? false }, () => {
    session!.remember("Keynote");
    const path = session!.path("v14-K14-slide-background.key");
    const doc = KeynoteDocument.load(new Uint8Array(readFileSync(base.url)));
    RUNGS.find((r) => r.name === "K14-slide-background")!.build(doc);
    writeFileSync(path, doc.save());
    const pdf = path.replace(/\.key$/, ".pdf");
    exportDocument("Keynote", path, pdf, "PDF");
    const page = rasterize(pdf, 1, 18);
    expect(countPixels(page, [25, 59, 41], 20)).toBeGreaterThan(page.width * page.height * 0.5);
  });
});
