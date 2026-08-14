#!/usr/bin/env node
/**
 * Generate docs/COVERAGE.md — the living feature/version matrix.
 *
 *   node scripts/coverage-matrix.ts            # write docs/COVERAGE.md
 *   node scripts/coverage-matrix.ts --check    # fail if the file is stale
 *   node scripts/coverage-matrix.ts --stdout   # print, don't write
 *
 * Two axes, and only one of them is hand-written:
 *
 *  - **Support status** per capability is declared in CAPABILITIES below.
 *    That is a claim about the code, so it lives in code review.
 *  - **Validation** is measured: each capability carries a probe, and the
 *    generator counts how many real fixtures exercise it and which format
 *    eras those fixtures span.
 *
 * The distinction matters. "Implemented" and "proven against Apple's own
 * output" are different things, and a matrix that conflates them is worse
 * than none. A capability can be `read+write` yet validated by zero
 * fixtures — the matrix says so out loud.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { IWorkDocument } from "../src/tsa/document.ts";
import { PagesDocument } from "../src/pages/document.ts";
import { KeynoteDocument } from "../src/keynote/document.ts";
import { NumbersDocument } from "../src/numbers/document.ts";
import { IWORK_ERAS, type IWorkEra, type CompatibilityReport } from "../src/tsp/version.ts";
import type { IWorkApp } from "../src/tsp/registry.ts";
import { drawableStylesOf } from "../src/tsd/drawables.ts";
import { tablesOfContents } from "../src/tswp/toc.ts";
import { chartsOf } from "../src/tsch/charts.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const OUTPUT = new URL("../docs/COVERAGE.md", import.meta.url);
const VERIFICATION_OUTPUT = new URL("../docs/VERIFICATION.md", import.meta.url);

/** How much of a capability the library implements. */
type Status = "read+write" | "read" | "experimental" | "roadmap" | "out-of-scope";

const STATUS_LABEL: Record<Status, string> = {
  "read+write": "✅ read + write",
  read: "🔍 read only",
  experimental: "⚠️ experimental",
  roadmap: "○ roadmap",
  "out-of-scope": "✗ out of scope",
};

/** Everything a probe may need, computed once per fixture. */
interface DocContext {
  app: IWorkApp;
  doc: IWorkDocument;
  report: CompatibilityReport;
  pages: PagesDocument | undefined;
  keynote: KeynoteDocument | undefined;
  numbers: NumbersDocument | undefined;
}

/**
 * A claim no amount of offline testing can settle.
 *
 * The fixture suite proves we agree with *our reading* of Apple's files:
 * that we decode what they wrote and re-encode it identically. It cannot
 * prove Apple accepts something we invented, because the only authority on
 * that is the app. Anything in this shape needs a human in front of a Mac.
 */
interface ManualProof {
  /** What is being claimed, in one line. */
  claim: string;
  /** Why the offline suite cannot settle it. */
  why: string;
  /** Concrete steps that would settle it. */
  how: string;
  /** Set when `npm run test:e2e` already covers it on a Mac. */
  e2e?: boolean;
  /**
   * What was observed when someone actually did it, if they have.
   *
   * A verification page that never shrinks is a page nobody trusts. When a
   * claim is checked in the app, the finding goes here and the row moves
   * out of the outstanding list — the reasoning is kept, because it is what
   * makes the result mean something, but it stops being a request.
   */
  settled?: string;
  /** How bad it is if the claim turns out false. */
  risk: "high" | "medium" | "low";
}

interface Capability {
  group: string;
  name: string;
  apps: IWorkApp[] | "all";
  status: Status;
  /** True when this document exercises the capability. Omit if unmeasurable. */
  probe?: (c: DocContext) => boolean;
  note?: string;
  /** Declared here so the list of unproven claims cannot drift from the code. */
  manualProof?: ManualProof;
}

/**
 * Free text headed for the docs site must not read as markup: VitePress
 * runs every page through Vue's template compiler, and a `<outDir>` in a
 * proof's instructions is an unclosed element to it — the build fails.
 */
function vueSafe(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Never let one malformed document abort the whole survey. */
const safe = (fn: () => boolean): boolean => {
  try {
    return fn();
  } catch {
    return false;
  }
};

export const CAPABILITIES: Capability[] = [
  // ---------------------------------------------------------------- container
  {
    group: "Container",
    name: "Flat zip layout",
    apps: "all",
    status: "read+write",
    probe: (c) => c.report.probe.containerLayout === "flat",
  },
  {
    group: "Container",
    name: "Nested Index.zip layout",
    apps: "all",
    status: "read+write",
    probe: (c) => c.report.probe.containerLayout === "nested-index-zip",
  },
  {
    group: "Container",
    name: "Wrapper-directory layout",
    apps: "all",
    status: "read+write",
    probe: (c) => c.report.probe.containerLayout === "wrapper-directory",
  },
  {
    group: "Container",
    name: "Byte-identical round-trip of untouched content",
    apps: "all",
    status: "read+write",
    probe: () => true,
    note: "enforced for every fixture by the compatibility suite",
  },
  {
    group: "Container",
    name: "Edit cycle: open → edit → save → reopen",
    apps: "all",
    status: "read+write",
    probe: () => true,
    note:
      "every modern document in the corpus is edited and re-read by test/edit-cycle.test.ts, " +
      "which also compares a census — objects, components, text, tables, cells, formulas, " +
      "merges, charts, styles, unknown archive types — before and after, so an edit that " +
      "lands while dropping something else fails",
    manualProof: {
      claim: "Pages, Numbers and Keynote open a document this library has edited and saved.",
      why:
        "The offline suite proves self-consistency: we read back what we wrote. Only the apps " +
        "can say whether they accept it.",
      how: "npm run test:e2e on a Mac opens each edited document in its app.",
      e2e: true,
      settled:
        "**Confirmed for all three apps.** A current-format Pages document " +
        "(file format 26.1.0) was edited, saved and opened with its formatting intact — appending " +
        "a paragraph, applying character formatting, and applying a named paragraph style. " +
        "Getting there took four separate defects, none of which any offline check could see, " +
        "and each is now guarded: text colour must go in `tsd_fill` as well as `font_color`; a " +
        "storage must not declare its stylesheet in `object_references`; paragraphs end at " +
        "U+0004/U+0005/U+000C as well as U+000A but not at U+2028; and `table_para_style` is " +
        "dense while the list and layout tables are sparse. Numbers is covered separately by the " +
        "widget and regrouping checks — and directly on 2026-08-03, when the e2e suite's " +
        "cell-write round-trip passed: Numbers opened a package whose cells we wrote and read " +
        "our values back. Keynote joined the same day: the speaker-notes round-trip — our edit " +
        "of the notes storage, opened and reported back by Keynote — passed on a current " +
        "install, and Keynote also opened the deck whose transition we wrote",
      risk: "high",
    },
  },
  {
    group: "Container",
    name: "New document from a template (blankFrom)",
    apps: "all",
    status: "read+write",
    probe: () => true,
    note:
      "empties a real document rather than synthesising one: every identity, style and master " +
      "stays as an Apple app wrote it. There is no from-nothing constructor — that graph could " +
      "be written but not checked, and unverifiable inventions are the one thing this project " +
      "refuses to ship",
  },
  {
    group: "Container",
    name: "New document from nothing (blank)",
    apps: "all",
    status: "read+write",
    probe: () => true,
    note:
      "blank() instantiates a donor embedded in the package — a corpus fixture emptied by " +
      "blankFrom at build time (scripts/make-blanks.ts records which and why), previews " +
      "stripped, Pages re-papered to A4 with byte-measured values, Numbers already iso-a4, " +
      "Keynote 1920×1080, all dressed in the house typography (Palatino body, Helvetica Neue " +
      "display, terracotta accent) through the public style API. The apps do the same: a new " +
      "document is a bundled template, instantiated. blanks:check pins the embedded bytes to " +
      "data/blanks/ and asserts the house contract",
    manualProof: {
      claim: "Pages, Numbers and Keynote each open a blank() document and read our edits back.",
      settled:
        "**Confirmed in all three apps (2026-08-03, 17 of 17 — twice)** — Pages reported our " +
        "paragraph, Numbers our cell and recomputed formula, Keynote our presenter note, each " +
        "from a preview-stripped blank(); the Basic White Keynote donor passed the same suite " +
        "the day it replaced the 2018-era deck. The house restyle that followed (Palatino " +
        "body, gray secondary, terracotta accent) is checked by the font read-backs the suite " +
        "now carries: Pages and Keynote each report the typed text's font, so a donor whose " +
        "styling the app ignores fails visibly",
      why:
        "The donors round-trip offline and take edits, but only the apps can say they accept a " +
        "package whose previews are stripped.",
      how:
        "npm run test:e2e on a Mac: the 'authored from nothing' suite writes one blank() " +
        "document per app, has the app report our marker back, and says what each failure means.",
      e2e: true,
      risk: "medium",
    },
  },
  {
    group: "Container",
    name: "Compaction (drop unreachable archives)",
    apps: "all",
    status: "read+write",
    probe: () => true,
    note:
      "correct but currently collects little: removing a sheet leaves calc-engine references to " +
      "its tables, so they stay reachable. A no-op on every untouched fixture, which is the " +
      "property that matters",
  },
  {
    group: "Container",
    name: "Mixed-codec packages (LZFSE component beside Snappy)",
    apps: "all",
    status: "read",
    probe: (c) => c.report.probe.opaqueComponents.length > 0,
    note:
      "decodeLzfseStream reads the container (raw and LZVN blocks; FSE blocks refused " +
      "precisely) and the probe reports its reading of any opaque component; the document " +
      "model keeps such components opaque and byte-preserved because no redistributable " +
      "specimen exists to measure the payload against — see docs/BLOCKERS.md",
  },
  {
    group: "Container",
    name: "iWork '09 XML documents",
    apps: "all",
    status: "out-of-scope",
    note: "detected and rejected with a clear error",
  },
  {
    group: "Container",
    name: "Password-protected documents",
    apps: "all",
    status: "out-of-scope",
    note: "detected via .iwph and rejected",
  },

  // ------------------------------------------------------------ object graph
  {
    group: "Object graph",
    name: "Unknown type IDs preserved across edits",
    apps: "all",
    status: "read+write",
    probe: (c) => c.report.probe.unknownTypeIds.length > 0,
    note: "forward compatibility; registerTypes() can name them at runtime",
  },
  {
    group: "Object graph",
    name: "Multi-payload archives",
    apps: "all",
    status: "read",
    probe: (c) => c.report.probe.multiPayloadArchiveCount > 0,
  },
  {
    group: "Object graph",
    name: "Older-reader compatibility diffs (type-0 patches)",
    apps: "all",
    status: "read",
    probe: (c) => c.report.probe.patchArchiveCount > 0,
    note: "preserved verbatim; not recomputed when the base message changes",
  },
  {
    group: "Object graph",
    name: "Versioned style snapshots (styles_for_*)",
    apps: "all",
    status: "read",
    probe: (c) => c.report.probe.hasVersionedStyleSnapshots,
  },

  // -------------------------------------------------------------------- text
  {
    group: "Text & styles",
    name: "Text read/edit with full attribute-table fixup",
    apps: "all",
    status: "read+write",
    probe: (c) => safe(() => c.doc.textStorages().some((s) => s.text.length > 0)),
  },
  {
    group: "Text & styles",
    name: "Paragraph & character styles (by name, plus creation and editing)",
    apps: "all",
    status: "read+write",
    probe: (c) => safe(() => c.doc.stylesheets().length > 0),
    manualProof: {
      claim:
        "a paragraph style this library creates appears in the app's paragraph styles panel, " +
        "so a person can reapply it",
      settled:
        "**Confirmed in Pages — \"P15 works now\".** A created style applies as asked and " +
        "appears in the paragraph styles panel, on the current-format ladder base. What it " +
        "took, cumulatively: a `super.name`; a `super.identifier` plus a matching " +
        "`identifier_to_style_map` entry; both property bags; and an entry in " +
        "`TSWP.ThemePresetsArchive.paragraph_style_presets` — the theme list the panel " +
        "reads. The earlier failures were real: the first three alone left the style " +
        "applying but unlisted. One fine point went unrecorded: the confirming report did " +
        "not itemise the density pair (P15b, bags copied from Body, against P15c, three " +
        "properties), so whether a sparse property bag alone lists is not established — " +
        "`copyOf` exists either way",
      why:
        "Nothing offline distinguishes a listed style from an unlisted one except by " +
        "correlation with the corpus, and every correlation found so far has been necessary " +
        "at best. Four rounds of guess-and-check is where guessing stops paying.",
      how:
        "`npm run pages:docs` emits P15a/P15b/P15c. P15a removes a name Pages certainly shows " +
        "and changes nothing else: if it vanishes, the preset list is the panel's source and " +
        "the fault is in the entry we append; if it stays, the panel reads something else " +
        "entirely and four fixes were aimed at the wrong archive. P15b adds a style whose " +
        "property bags are a full copy of Body's, P15c the sparse one shipped today — the " +
        "pair says whether density is the disqualifier.",
      risk: "medium",
    },
  },
  {
    group: "Text & styles",
    name: "Character properties (font, colour, highlight, underline, strike, caps, shadow…)",
    apps: "all",
    status: "read+write",
    probe: (c) =>
      safe(() =>
        c.doc
          .stylesheets()
          .some((sheet) =>
            sheet
              .characterStyles()
              .some((info) => Object.keys(sheet.style(info.id)?.character() ?? {}).length > 0),
          ),
      ),
    manualProof: {
      claim: "Clearing a property by writing its *_null flag reads as 'none', not as 'inherit'.",
      settled:
        "**Partly settled, and it found a bug.** Opening an authored document in Pages showed a " +
        "character style applying its `bold` and ignoring its `font_color` — the word rendered " +
        "black. Text colour comes from `tsd_fill` (field 46), not `font_color` (7); a style with " +
        "only the latter is valid, round-trips, and does nothing visible (FORMAT.md). Both are " +
        "now written, **the fix is confirmed in Pages on a current-format document** — the word " +
        "renders bold and red — and " +
        "`test/pages-authored-shape.test.ts` guards the pairing against the fixture corpus. The " +
        "*_null question in the claim above is still open; what is settled is that an authored " +
        "colour reaches the page",
      why:
        "We infer that a set *_null flag with the value absent means an explicit clear. Fixtures show the " +
        "encoding but never disambiguate it from plain absence, because both render the same whenever the " +
        "parent sets nothing either.",
      how:
        "Create a style with a font colour, derive a child, clear the colour on the child, open in Pages " +
        "and confirm the child shows the default colour rather than inheriting the parent's.",
      risk: "low",
    },
  },
  {
    group: "Text & styles",
    name: "Paragraph properties (indents, spacing, keeps, hyphenation, outline level)",
    apps: "all",
    status: "read+write",
    probe: (c) =>
      safe(() =>
        c.doc
          .stylesheets()
          .some((sheet) =>
            sheet
              .paragraphStyles()
              .some((info) => Object.keys(sheet.style(info.id)?.paragraph() ?? {}).length > 0),
          ),
      ),
  },
  {
    group: "Text & styles",
    name: "Tab stops (position, alignment, leader)",
    apps: "all",
    status: "read+write",
    probe: (c) =>
      safe(() =>
        c.doc
          .stylesheets()
          .some((sheet) =>
            sheet.paragraphStyles().some((info) => (sheet.style(info.id)?.paragraph().tabs?.length ?? 0) > 0),
          ),
      ),
  },
  {
    group: "Text & styles",
    name: "Paragraph background & borders (rule stroke + positions)",
    apps: "all",
    status: "read+write",
    probe: (c) =>
      safe(() =>
        c.doc
          .stylesheets()
          .some((sheet) =>
            sheet.paragraphStyles().some((info) => {
              const paragraph = sheet.style(info.id)?.paragraph();
              return paragraph?.border !== undefined || paragraph?.backgroundColor !== undefined;
            }),
          ),
      ),
    note:
      "border_positions is a bitmask with logical side bits (1 top, 2 bottom, 4 leading, 8 trailing — " +
      "app-settled 2026-08-03); the stroke is written with cap, join, miter 4 and the full pattern " +
      "message, the shape of all 167 corpus paragraph border strokes",
    manualProof: {
      claim:
        "A border authored by this library draws in Pages: complete stroke, border_positions and " +
        "deprecated_borders together.",
      why:
        "The positions bitmask is settled app knowledge, but every rung that drew a border had the " +
        "app author the stroke. Two rounds of demo-01 T-10 found two faults under each other: an " +
        "abbreviated stroke read as «Ingen» (fixed — the writer states the 167-of-167 corpus " +
        "shape), and with the stroke honoured the side toggles stayed unselected — the inspector " +
        "keys on deprecated_borders, the historical enum the app writes beside the bitmask on " +
        "every bordered corpus style. The writer now states both.",
      how:
        "npm run demos -- out, open demo-01-tekst.pages, T-10: one line with rules above and below, " +
        "one with a red leading edge, one with a blue trailing edge, and the position toggles " +
        "selected in the inspector. Failure = toggles selected but nothing drawn would point at " +
        "rule_width; toggles still unselected would mean the enum mapping is wrong for 3.",
      settled:
        "**Confirmed on the third round (2026-08-10, Pages macOS): all three border lines drew.** " +
        "Two faults sat under each other, each named by in-document feedback — the abbreviated " +
        "stroke read as «Ingen» (round one), then honoured colours/type/width with the side " +
        "toggles unselected (round two), which identified deprecated_borders as the field the " +
        "toggles key on. The rendered gap between text and horizontal rules is the app's default " +
        "— neither we nor the app's own authored border styles write a rule offset. Settled as " +
        "part of demo-01 whole: all fourteen checks, character formatting through decimal tabs.",
      risk: "low",
    },
  },
  {
    group: "Text & styles",
    name: "Paragraph rule offset (text-to-border distance)",
    apps: "all",
    status: "read+write",
    probe: (c) =>
      safe(() =>
        c.doc
          .stylesheets()
          .some((sheet) =>
            sheet.paragraphStyles().some((info) => sheet.style(info.id)?.paragraph().ruleOffset !== undefined),
          ),
      ),
    note:
      "historical_rule_offset, a TSP.Point whose slots agree in 8637 of 8638 corpus instances — a " +
      "number writes both, a pair states them separately; the null flag is never used. Rendering " +
      "measured: 0 is the default gap (the app back-fills (0, 0) on resave), negative pulls the " +
      "rules toward and into the text (−12 overlaps; the templates' −3 tightens), and the app " +
      "preserves values beyond what its inspector displays (−12 stored, −2 shown)",
    manualProof: {
      claim: "A positive ruleOffset moves the border rules away from the text.",
      why:
        "The negative direction is app-measured — −12 rendered the rules overlapping the " +
        "paragraph — and zero is the app's own stated default. But every non-zero corpus value " +
        "is negative, so outward movement is implied by symmetry, never shown; and the " +
        "inspector displayed −2 for the stored −12, so the control and the archive are not the " +
        "same scale, or the display clamps.",
      how:
        "npm run demos -- out, open demo-01-tekst.pages, T-15: rules above and below with " +
        "ruleOffset +12. Pass = the gap is clearly larger than T-10's. Unchanged or overlapping " +
        "= positive is ignored or clamped, and outward spacing would need spaceBefore/spaceAfter " +
        "instead; also note the inspector's displayed offset, which calibrates the UI scale.",
      settled:
        "**Confirmed (2026-08-12, Pages macOS): +12 renders the wider gap, and the two " +
        "inspector readings calibrate the scale — stored 0 displays 6 pt, stored +12 displays " +
        "18 pt, so the stored value is relative to the 6 pt default and the inspector shows " +
        "the absolute offset. Demo-01 settled whole, all fifteen checks.**",
      risk: "low",
    },
  },
  {
    group: "Text & styles",
    name: "Shared style values (colour incl. P3, gradients, strokes, shadows, padding)",
    apps: "all",
    status: "read+write",
    probe: (c) => safe(() => c.doc.stylesheets().length > 0),
    note: "one vocabulary shared by text, table and drawable styling",
    manualProof: {
      claim: "A Display-P3 colour we write renders as P3, and a dashed stroke renders with our dash lengths.",
      why:
        "Colour space and dash patterns are rendering behaviour. We know 26.x files tag colours with " +
        "rgbspace and that the dash array is repeated float, but not that a colour we author with " +
        "space: 'p3' is treated as wide-gamut rather than reinterpreted.",
      how:
        "Write a saturated P3 green and the same values as sRGB side by side, open on a P3 display, and " +
        "confirm they differ. For dashes, write [4, 2] and compare against a 4/2 dash set in the inspector.",
      risk: "low",
    },
  },
  {
    group: "Text & styles",
    name: "List styles",
    apps: "all",
    status: "read+write",
    probe: (c) => safe(() => (c.pages?.listStyles().length ?? 0) > 0),
  },
  {
    group: "Text & styles",
    name: "Hyperlinks",
    apps: "all",
    status: "read+write",
    manualProof: {
      claim: "a hyperlink this library inserts is live in the app",
      settled:
        "**Click confirmed — \"P04 pass\" — appearance was not, and is now written.** The " +
        "linked words were a live hyperlink and did not look like one: every native link " +
        "run in the corpus is covered by the document's Link character style (identifier " +
        "`character-style-hyperlink`, name \"Link\", bag exactly `{underline: 1}`), which " +
        "every corpus template ships and `insertLink` never applied. It now applies it by " +
        "default, with `characterStyle: false` to skip and an id or identifier to " +
        "override; the underlined form is unverified in the app",
      why:
        "a link is a smartfield run plus a URL ref; the field makes it live, the Link " +
        "style makes it look live, and only the app proves either",
      how:
        "`npm run pages:docs` emits P04-hyperlink; the page says the words should be a " +
        "link and be underlined",
      risk: "low",
    },
    probe: (c) => safe(() => c.doc.textStorages().some((s) => s.links().length > 0)),
  },
  {
    group: "Text & styles",
    name: "Page numbers and page counts (insert, read, remove)",
    apps: "all",
    status: "read+write",
    probe: (c) =>
      safe(() => c.doc.textStorages().some((s) => s.pageNumberFields().length > 0)),
    note: "an attachment at a U+FFFC placeholder, not text; the rendered value comes from pagination and is never invented",
    manualProof: {
      claim: "a page-number attachment this library inserts renders as a live number",
      settled:
        "**Confirmed in Pages.** A page number inserted into the body renders as a live " +
        "number (\"P06 pass\"), a page count updates when a page is inserted, and a date " +
        "field renders and is editable as a date. All on current-format documents",
      why: "the value comes from pagination, which nothing here performs — the suite proves the archive and anchor round-trip, not what appears on the page",
      how: "insert a page number into a footer, open in Pages across a multi-page document, and confirm it counts up rather than showing a literal or a blank",
      risk: "medium",
    },
  },
  {
    group: "Text & styles",
    name: "Smart fields (page number, date, merge, …)",
    apps: "all",
    status: "read",
    probe: (c) => safe(() => c.doc.textStorages().some((s) => s.smartFields().length > 0)),
  },
  {
    group: "Text & styles",
    name: "Paragraph writing direction (read + write)",
    apps: "all",
    status: "read+write",
    probe: (c) =>
      safe(() =>
        c.doc
          .textStorages()
          .some((s) => s.paragraphs().some((p) => s.paragraphDirection(p.index) !== "natural")),
      ),
    note:
      "the storage's bidi pair, written as the app's own direction control writes it — (1, 0) " +
      "RTL, (0, 0) LTR, (65535, 65535) natural; the style bag's writing_direction is vestigial " +
      "and untouched even by the app",
    manualProof: {
      claim: "a paragraph this library sets to RTL renders right-to-left in Pages",
      settled:
        "**Confirmed in the same round trip that taught the mechanism** (2026-08-03, iOS " +
        "Pages, T15.3 writer): the pair was copied from an app-flipped paragraph, and a " +
        "library-written (1, 0) then survived the app's resave untouched with the paragraph " +
        "behaving as RTL — its left-edge border control stored the trailing bit, which only an " +
        "RTL paragraph does",
      why: "rendering direction is editor behaviour nothing offline can observe",
      how: "setParagraphDirection on a Hebrew paragraph, open in Pages, confirm right alignment",
      risk: "low",
    },
  },
  {
    group: "Text & styles",
    name: "Placeholder text (list, fill, define)",
    apps: ["pages"],
    status: "read+write",
    probe: (c) => safe(() => c.doc.textStorages().some((s) => s.placeholders().length > 0)),
    note:
      "the template tap-to-replace mechanism. Filling sheds the marking the way typing does; " +
      "defineAsPlaceholder writes the measured shape (smart-field super + varint 1, uniform " +
      "across 73 app-written instances). A placeholder over an attachment's U+FFFC is a body " +
      "document's image placeholder — same field, no drawable archive",
    manualProof: {
      claim:
        "a span this library defines as placeholder behaves as one in Pages — a click selects the whole span and typing replaces it — and a filled placeholder behaves as plain text",
      settled:
        "**Confirmed in full, through the native lifecycle** (2026-08-03, iOS Pages, T15.3 " +
        "writer, via seed-placeholder): one tap selected the library-defined span whole, typing " +
        "replaced the entire span, and the returned resave shows the field consumed — exactly " +
        "what the app does to its own placeholders. The filled line edited as plain text, so " +
        "fillPlaceholder sheds the marking correctly. The round trip is also the project's " +
        "first iOS-written artifact over library-authored bytes",
      why:
        "the written archive is byte-shaped like the app's own, but tap-to-replace is editor " +
        "behaviour nothing offline can observe",
      how:
        "define a placeholder over a bracketed token in a blank document, fill another, open in " +
        "Pages: click the defined one (whole-span selection expected), click and type in the " +
        "filled one (ordinary editing expected)",
      risk: "low",
    },
  },
  {
    group: "Text & styles",
    name: "Date fields and bookmarks (read + create)",
    apps: "all",
    status: "read+write",
    probe: (c) =>
      safe(() =>
        c.doc.textStorages().some((s) => s.bookmarks().length > 0 || s.dateFields().length > 0),
      ),
    note: "a date field spans real text the app rewrites, so the display text is supplied rather than formatted here",
    manualProof: {
      claim: "a date field and a bookmark this library inserts are live in Pages, not literal text",
      settled:
        "**Confirmed, and the bookmark half found a bug.** The date field renders set to " +
        "1 January and is editable. The bookmark rung marked a 13-character phrase and " +
        "Pages bookmarked one character — \"the B character is a bookmark\" — because the " +
        "writer derived `ranged` from the *name* and wrote `ranged=false` over a " +
        "13-character run, a combination no corpus bookmark has. The corpus ties the flag " +
        "to run length (true at 13 and 46 characters, false at exactly 1) with the name " +
        "orthogonal, and Pages resolved our contradiction in the flag's favour. `ranged` " +
        "now derives from the run, and the corrected form is confirmed: the re-emitted " +
        "named bookmark with `ranged=true` spans its full 13-character phrase in Pages — " +
        "a name-plus-range combination the corpus itself never shows, accepted by the app",
      why:
        "both are attachments whose meaning comes from the app resolving them; the suite " +
        "proves the archive and the anchor round-trip, not that the app treats them as fields",
      how: "insert each, open in Pages, and check the date is editable and the bookmark listed",
      risk: "medium",
    },
  },
  {
    group: "Text & styles",
    name: "Comment creation and removal",
    apps: "all",
    manualProof: {
      claim: "a comment this library creates is readable and attributed in the app",
      settled:
        "**Confirmed — \"P08 Comment works\" — on the third round, each round a distinct " +
        "finding.** Round one (Pages for iOS): unreadable placeholder — the comment " +
        "carried no author where every corpus comment references one. Round two: with a " +
        "name-only author, Pages crashed on open — both corpus authors carry the identical " +
        "comment-yellow `TSP.Color` and explicit `is_public_author = false`, and the " +
        "comment UI draws the author's tint; the corpus rosters also declare `refs=[]`, " +
        "and the round-one fix had made ours declare the author — the container rule " +
        "reintroduced by our own repair. Round three, with the author byte-for-byte " +
        "Apple's shape and the roster declaring nothing: readable and attributed.",
      why:
        "the suite proves the three archives and the highlight run round-trip; what an " +
        "author must carry before the comment UI will draw at all took three app rounds",
      how: "`npm run pages:docs` emits P08-comment; the phrase and the comment name themselves",
      risk: "medium",
    },
    status: "read+write",
    probe: (c) => safe(() => c.doc.textStorages().some((s) => s.comments().length > 0)),
    note: "reuses the document's existing annotation author rather than duplicating them",
  },
  {
    group: "Text & styles",
    name: "Footnote creation and removal",
    apps: ["pages"],
    status: "read+write",
    probe: (c) => safe(() => c.doc.textStorages().some((s) => s.footnotes().length > 0)),
    note: "the reference is a U+000E in its own table; the note is a separate storage of footnote kind — endnotes are the same machinery under kind 1 (document) or 2 (section), read by the same accessor",
    manualProof: {
      claim: "a footnote this library creates is numbered and laid out by Pages",
      settled:
        "**Confirmed in Pages — \"P09 pass\" — after three rounds, each of which found a " +
        "distinct defect class.** Round one crashed the app: every newly created attribute " +
        "table was seeded with an objectless entry at index 0, fatal in the point-anchored " +
        "`table_footnote`/`table_attachment` where an entry is an object at a position (107 " +
        "such tables in the corpus, zero objectless entries — the seed is now shape-aware). " +
        "Round two rendered and numbered the note but drew the reference on the baseline: " +
        "every corpus mark, body U+000E and note U+FFFC alike, is covered by one shared " +
        "anonymous character style whose whole bag is `superscript = 1`, and we wrote none. " +
        "Round three: the note renders small in Footnote style, the mark is a raised " +
        "number, and the note storage carries the six attribute tables all 2676 corpus " +
        "storages have.",
      why:
        "numbering and layout are the app's; the suite proves the archives and anchors " +
        "round-trip, and three app rounds proved what the archives must also carry",
      how:
        "add footnotes at two positions, open in Pages, and confirm they number in document " +
        "order, render at the page foot, and are set in the document's Footnote style rather " +
        "than in the body face",
      risk: "medium",
    },
  },
  {
    group: "Text & styles",
    name: "Change tracking (insertions/deletions)",
    apps: "all",
    status: "read",
    probe: (c) =>
      safe(() =>
        c.doc.textStorages().some((s) => s.object.message.has(21) || s.object.message.has(22)),
      ),
    note: "tables preserved and index-shifted correctly; no semantic API",
  },
  {
    group: "Text & styles",
    name: "Table of contents (rules read + write, cached entries read)",
    apps: ["pages"],
    status: "read+write",
    probe: (c) => safe(() => tablesOfContents(c.doc.store).length > 0),
    note: "collection rules are editable; cached entries are a layout result this library will not invent",
    manualProof: {
      claim: "Pages regenerates a TOC whose collection rules we changed, and honours the new rule set.",
      why:
        "Rules are an instruction the app acts on at its next repagination. Nothing offline repaginates, " +
        "so the change is visible in the archive but its effect is not.",
      how:
        "Turn a heading style off in the TOC settings, save, open in Pages, and check the TOC drops those " +
        "headings after it redraws.",
      risk: "low",
    },
  },

  // --------------------------------------------------------------- drawables
  {
    group: "Drawables & media",
    name: "Placement (copy onto a page/slide/sheet, remove, reorder in z)",
    apps: "all",
    status: "read+write",
    probe: (c) =>
      safe(
        () =>
          (c.keynote?.slides().some((s) => s.container().ids().length > 0) ?? false) ||
          (c.numbers?.sheets().some((s) => c.numbers!.sheetContainer(s.id).ids().length > 0) ?? false) ||
          (c.pages?.floatingDrawablePages().length ?? 0) > 0,
      ),
    note:
      "one abstraction over three containers; copies are deep so the two objects are independent. " +
      "In Pages a page with no floating objects has no page_groups entry at all, so placing the " +
      "first drawable on a page needs floatingDrawables(page, { create: true }) — the created " +
      "group carries the two fields every group in the corpus carries, page index and drawable " +
      "list, inserted in page order",
    manualProof: {
      claim: "A drawable we copied onto another page/slide/sheet appears there, at the geometry we set.",
      settled:
        "**Confirmed in Pages for both placement shapes — \"Both p19 work now\".** A " +
        "drawable copied onto the page it already lived on, and onto a fresh page needing a " +
        "new page group, both render. What it took beyond the page group: the copy must " +
        "join the document-level `TP.DrawablesZOrderArchive`, the paint order — a drawable " +
        "in a page group but absent from it does not draw at all, with no warning. Pages " +
        "keeps paint order per document where Keynote and Numbers keep it in-container, so " +
        "this is the one app where attach() alone was never enough. Keynote and Numbers " +
        "placement is still unverified in-app",
      why:
        "The three apps store the list differently — two lists in Keynote, one in Numbers, per-page " +
        "wrapped entries in Pages — and each app decides for itself whether an object it owns is " +
        "renderable. Reloading through this library proves the wiring, not the rendering.",
      how:
        "Copy a shape to another slide and a table to another sheet, save, and open both apps: the " +
        "object should appear where placed, be selectable, and editing it should not change the original.",
      risk: "high",
    },
  },
  {
    group: "Drawables & media",
    name: "Drawable style (fill, stroke, opacity, shadow, reflection)",
    apps: "all",
    status: "read+write",
    probe: (c) => safe(() => drawableStylesOf(c.doc.store).some((h) => h.read().stroke !== undefined)),
    note:
      "where shadows live — cell and table styles have no shadow field at all; writes copy a shared " +
      "archive on first edit and repoint this drawable, the app's own one-object-styled behaviour",
    manualProof: {
      claim: "a reflection this library writes renders as a fading mirror below the drawable",
      why:
        "reflection is a single opacity float on the style archive; the suite proves it round-trips, " +
        "not that the app draws the mirror",
      how:
        "open demo-11, S-11: the dark-blue square should mirror below itself at half strength, with " +
        "the inspector's Reflection ticked at 50%. No mirror = the float alone does not switch the " +
        "effect on, and the delta against an app-made reflection is the next measurement",
      settled:
        "**Confirmed in Pages — »ja, det virker«.** The single reflection float mirrors the " +
        "square below itself; demo-11 S-11, second round",
      risk: "low",
    },
  },
  {
    group: "Drawables & media",
    name: "Drawable shadows (enabled, angle, offset, blur, opacity)",
    apps: "all",
    status: "read+write",
    probe: (c) => safe(() => drawableStylesOf(c.doc.store).some((h) => h.read().shadow?.enabled === true)),
    manualProof: {
      claim:
        "A shadow we parameterise renders with the geometry we set, the enabled flag gates it, the " +
        "contact and curved types draw as their kind — and the app survives editing our shadow in " +
        "its own inspector.",
      why:
        "Angle, offset and blur radius are rendering parameters, and the type and enabled fields are " +
        "pure app behaviour. The first round proved rendering (S-01–S-07, S-09, S-10 confirmed) and " +
        "found the harder half: re-enabling the disabled shadow through the app's popup aborted " +
        "Pages whole — the archive rendered but asserted under edit, missing the type field all 929 " +
        "corpus shadows carry, on an override style shaped like no app file's. Both are rewritten " +
        "to the measured shape; the toggle is the remaining check.",
      how:
        "open demo-11 (skygger): S-08, the black square — confirm no shadow draws, then re-enable " +
        "the shadow via the popup (Slagskygge). The app surviving the switch and drawing the shadow " +
        "is the pass; a crash again means the remaining delta is beyond the byte-visible set and " +
        "the instructions in the document say so. The other rungs are confirmed",
      settled:
        "**Confirmed in Pages, whole — »det virkede«.** Every parameter renders as written (both " +
        "angle checks on the calibrated scale, offset, blur, opacity, colour, the disabled state, " +
        "contact and curved types), and the seven-field rewrite survived the app's own popup where " +
        "the six-field archive aborted it. The toggle wrote the app's fresh preset over our " +
        "archive — stored angle 90/inspector 270°, offset 2, blur 5, 50 % — and the round's " +
        "returned file is a corpus fixture carrying the popup preset, the contact sub-archive and " +
        "the first curvedShadow sub-archive",
      risk: "low",
    },
  },
  {
    group: "Drawables & media",
    name: "Geometry (enumerate, move, resize)",
    apps: "all",
    status: "read+write",
    probe: (c) => safe(() => c.doc.drawables().length > 0),
  },
  {
    group: "Drawables & media",
    name: "Image filters / adjustments",
    apps: "all",
    status: "read+write",
    probe: (c) => safe(() => c.doc.images().some((i) => i.hasFilters)),
  },
  {
    group: "Drawables & media",
    name: "Image cropping (set, move, remove a mask)",
    apps: "all",
    status: "read+write",
    probe: (c) => safe(() => c.doc.images().some((i) => i.hasMask)),
    manualProof: {
      claim: "a mask this library writes crops the way Apple's does, and the app's mask editor opens it",
      why: "the crop is a rendering result; the suite proves the geometry and path round-trip, not what appears on the page. The editor is the harder half: rendering has been confirmed for three rounds while double-click editing kept refusing, and each round has closed one measured difference (full drawable super, window space, size semantics, traced_path, the modern super with lock pair and stand-in title/caption)",
      how: "open demo-03, confirm the cropped wave shows the stated window, then double-click it: the mask slider appearing is the pass. Reset (nulstil) working while editing refuses means the crop model is accepted and the gate is still open",
      settled:
        "**Confirmed in Pages, whole — »der åbnede den!«** The crop renders in both " +
        "arrangements; the mask editor engages on the floating cropped copy and refuses the " +
        "in-flow one, which is the app's behavior for images in the text flow, not a property " +
        "of the file. The crop-delta seed corroborates from the other side: the app's own crop " +
        "over a library-inserted image produced the same shape setCrop writes, field for field",
      risk: "low",
    },
  },
  {
    group: "Drawables & media",
    name: "Media variant resolution (unmaterialized originals)",
    apps: "all",
    status: "read",
    probe: (c) => safe(() => c.doc.images().some((i) => !i.isMaterialized && i.data() !== undefined)),
  },
  {
    group: "Drawables & media",
    name: "Inline image insertion",
    apps: ["pages"],
    status: "read+write",
    note:
      "Data/ plumbing with SHA-1 dedupe; anchored at a U+FFFC in table_attachment, with the " +
      "in-the-text-flow exterior_text_wrap so the picture sits in the text column and moves " +
      "with its indent",
    manualProof: {
      claim: "an image this library inserts inline appears on the page at the size asked for",
      settled:
        "**Confirmed in Pages — \"P11 pass\".** A 1x1 red PNG inserted inline and scaled to " +
        "72pt renders as a red square at the size asked, on the current-format base. This " +
        "was the rung that had never been opened at all, and it shipped with four " +
        "shape-audit fixes applied together: the theme's `image-0-imageStyle` reference " +
        "(all 83 corpus images carry one), `naturalSize` alongside `originalSize`, " +
        "`flags`/`interpretsUntaggedImageDataAsGeneric`, and the four attachment offset " +
        "fields (101 of 101 corpus attachments). All four rode in one file, so which were " +
        "necessary rather than merely corpus-true is not isolated — they are cheap, " +
        "measured, and stay",
      why:
        "The shape audit found the archive incomplete in exactly the way a cell control " +
        "with no format was — every omission optional, nothing offline objecting.",
      how:
        "`npm run pages:docs` emits P11-inline-image: a 1x1 red PNG scaled up. A red square " +
        "on the page is a pass.",
      risk: "high",
    },
  },
  {
    group: "Drawables & media",
    name: "Inline image placement in an indented column",
    apps: ["pages"],
    status: "read+write",
    note:
      "exterior_text_wrap type 0 — the mode on 56 of the corpus's 102 inline attachments and " +
      "on none of its 175 floating drawables; the other values place the drawable against " +
      "the page and are unnamed in any published schema",
    manualProof: {
      claim:
        "an inline image sits in the text column of an indented paragraph, not at the page margin",
      why:
        "Reported from a real build: in a template whose body styles are indented, an " +
        "inserted picture drew from the page margin instead of the column, and the next " +
        "paragraph flowed up beside it into the running footer. The drawable carried no " +
        "exterior_text_wrap at all — the field every corpus inline image has — and geometry " +
        "could not move it, because for an in-flow attachment the position is a cache the " +
        "app recomputes.",
      how:
        "`npm run seeds -- out` writes seed-inline-image.pages: two pictures in a paragraph " +
        "indented well in from the margin, one in-flow and one page-placed, each labelled " +
        "with what it should look like. The in-flow picture starting where its own paragraph " +
        "starts is the pass.",
      risk: "high",
    },
  },
  {
    group: "Drawables & media",
    name: "Floating (non-inline) drawable placement",
    apps: ["pages"],
    status: "read+write",
    probe: (c) => safe(() => (c.pages?.floatingDrawablePages().length ?? 0) > 0),
    note: "per-page groups, each entry wrapped in a TP.DrawableEntry; copies are deep, sharing styles and themes",
    manualProof: {
      claim: "a drawable copied into a page's floating list is placed and rendered by Pages",
      why: "the suite proves the copy resolves, keeps its media and survives a save, not that the app lays it out",
      how: "copy an image onto a page at a known position, open in Pages, and confirm it appears there and is independently editable from its source",
      risk: "medium",
    },
  },

  // ------------------------------------------------------------------- pages
  {
    group: "Pages",
    name: "Sections (read + insert)",
    apps: ["pages"],
    status: "read+write",
    probe: (c) => safe(() => (c.pages?.sections().length ?? 0) > 1),
    note: "validation counts multi-section documents only",
    manualProof: {
      claim: "a section break this library inserts starts a new section on a new page",
      settled:
        "**Confirmed in Pages — \"P07 passed\" — on the second round.** The first check " +
        "failed (\"not on a new page\") and taught the rule: all 28 section boundaries " +
        "across the five multi-section fixtures put U+0004 where the previous paragraph's " +
        "newline was, and we wrote only the `table_section` entry — Pages listed the " +
        "section and kept the text flowing, because the table names a section and the " +
        "character breaks the page. With `insertSectionBreak` swapping the terminator " +
        "(same length, so every attribute-table index survives) and keeping the clone's " +
        "name, the second paragraph renders on its own page.",
      why:
        "pagination is the app's; the table entry alone was well-formed, listed in the " +
        "sidebar, and paginated nothing",
      how:
        "`npm run pages:docs` emits P07-section-break; the page states its own expected " +
        "result",
      risk: "medium",
    },
  },
  {
    group: "Pages",
    name: "Headers & footers (3 columns × first/even/odd)",
    apps: ["pages"],
    status: "read+write",
    manualProof: {
      claim:
        "Header text written by the library renders in the page-wide field, with the " +
        "alignment its storage's paragraph style states.",
      why:
        "Two demo rounds measured the model whole: modern Pages draws one page-wide header " +
        "field bound to storage slot 1 — of SPALTE-A/B/C only B appeared, left-aligned at " +
        "the page edge, while »Sektion 1« in the same slot rendered centred under its " +
        "donor's centring style — and slots 0/2 are the legacy three-field layout's outer " +
        "slots, whose mode switch no candidate byte survived (document 49, settings 13, " +
        "section 28 all refuted). The same rounds verified the master-cloning fix (section " +
        "3's own header) and fields, bookmarks, footnotes, comments and placeholders " +
        "silently.",
      how:
        "npm run demos -- out, open demo-02-felter.pages, S-01: section 1's header reads " +
        "»Sektion 1« centred, section 2's »Sektion 2 · sidehoved« left-aligned — the " +
        "difference is the point, alignment follows the field's own paragraph style. " +
        "Failure = a header missing or misaligned names the storage's paragraph-style " +
        "completion as the next measurement.",
      settled:
        "**Confirmed on the third round (2026-08-11, Pages macOS): demo-02 settled whole.** " +
        "Three rounds, each converting a fault into a model: round one found the shared " +
        "masters and the undrawn empty-slot writes, round two measured the page-wide " +
        "slot-1 field and the style-borne alignment, round three rendered the stated " +
        "expectations. Sections, headers and footers with live page numbers, the date " +
        "field, bookmark, footnote, comment, both placeholder behaviours and the cloned " +
        "section masters all render as written.",
      risk: "low",
    },
    probe: (c) =>
      safe(
        () =>
          c.pages?.sections().some((s) => s.headerText().trim() || s.footerText().trim()) ?? false,
      ),
  },
  {
    group: "Pages",
    name: "Master-page drawables",
    apps: ["pages"],
    status: "read",
    probe: (c) =>
      safe(
        () =>
          c.pages
            ?.sections()
            .some((s) => s.masterDrawables().some((m) => m.drawables.length > 0)) ?? false,
      ),
  },
  {
    group: "Pages",
    name: "Page setup (size, margins, orientation)",
    apps: ["pages"],
    status: "read+write",
    manualProof: {
      claim: "page size and orientation this library writes are what Pages lays out",
      settled:
        "**Confirmed in Pages — \"P10 pass\".** A rung written as corpus-exact A4 " +
        "landscape (841.89 x 595.28 pt, orientation 1) renders as a page noticeably wider " +
        "than tall. The first round was unjudgeable and taught the encoding: every corpus " +
        "document stores its real geometry in the width/height fields — the one wide " +
        "document is 2880x2304 with orientation 1 — so the flag is metadata and swapping " +
        "the dimensions is what makes landscape",
      why: "layout geometry is the app's; the fields could have been advisory",
      how: "`npm run pages:docs` emits P10-page-setup, which states its own shape on the page",
      risk: "low",
    },
    probe: (c) => safe(() => c.pages?.pageSetup().pageWidth !== undefined),
  },
  {
    group: "Pages",
    name: "Page-layout (body-less) documents",
    apps: ["pages"],
    status: "read+write",
    probe: (c) => safe(() => c.pages?.isPageLayout ?? false),
  },
  {
    group: "Pages",
    name: "Text boxes",
    apps: ["pages"],
    status: "read+write",
    probe: (c) => safe(() => (c.pages?.textBoxes().length ?? 0) > 0),
  },
  {
    group: "Pages",
    name: "Document settings (hyphenation, ligatures, footnote config)",
    apps: ["pages"],
    status: "read+write",
    probe: (c) => safe(() => c.pages?.settings !== undefined),
  },

  // ----------------------------------------------------------------- numbers
  {
    group: "Numbers & tables",
    name: "Sheets (add, duplicate, rename, move, remove)",
    apps: ["numbers"],
    status: "read+write",
    probe: (c) => safe(() => (c.numbers?.sheets().length ?? 0) > 0),
    note:
      "a duplicated sheet deep-copies its tables, so the two tabs edit different cells. Tab order " +
      "does not decide where the document opens — Numbers keeps the selected sheet in its UI " +
      "state's TN.SheetSelectionArchive references, which setActiveSheet re-points",
    manualProof: {
      claim: "Numbers opens a document whose sheets we added, duplicated, renamed or reordered.",
      why:
        "A sheet is valid only in the context of the calc engine and the document's own bookkeeping. " +
        "Our copies reload and round-trip, but whether Numbers accepts a duplicated tab — and whether " +
        "its formulas still resolve against the copy rather than the original — only the app can say.",
      how:
        "Duplicate a sheet with formulas, rename and reorder, save, and open in Numbers: check the tab " +
        "bar, that the copy's formulas point within the copy, and that editing one tab leaves the other alone.",
      settled:
        "**The structural half is confirmed; where the document opens was the surprise.** A " +
        "library-added sheet (cloned, renamed, moved first) opened alongside the original with " +
        "both tabs named as written and the cloned table's cells intact. But the app opened on " +
        "the *other* tab: tab order does not pick the active sheet — the UI state's stored sheet " +
        "selections do, and the demo had left them pointing at the donor sheet. setActiveSheet " +
        "re-points them; whether Numbers honours the re-pointed selection is the open rung of " +
        "the next demo round.",
      risk: "high",
    },
  },
  {
    group: "Numbers & tables",
    name: "Table cell reading — modern BNC/v5 storage",
    apps: "all",
    status: "read",
    probe: (c) => c.report.probe.cellStorage === "v5",
    note: "numbers, text, rich text, dates, booleans, durations, merges",
  },
  {
    group: "Numbers & tables",
    name: "Table cell reading — pre-BNC storage (iWork '13/'15)",
    apps: "all",
    status: "read",
    probe: (c) => c.report.probe.cellStorage === "preBNC",
    note:
      "text, numbers and dates. Layout measured from the corpus itself (`npm run prebnc`), not " +
      "documented anywhere; a record shape that was not measured is refused and counted by " +
      "undecodedPreBncCells() rather than guessed. Writing this storage is out of scope — a " +
      "current app converts these files on open",
  },
  {
    group: "Numbers & tables",
    name: "Table cell writing (text, number, date, bool, duration)",
    apps: "all",
    status: "read+write",
    probe: (c) => c.report.probe.cellStorage === "v5",
    note: "string-table refcounting, offsets and legacy stubs rebuilt; formats and styles on the cell preserved",
    manualProof: {
      claim: "Numbers, Pages and Keynote open a package whose cells we rewrote, and display the values we wrote.",
      why:
        "Every offline check is self-referential: our encoder round-trips through our decoder. " +
        "Apple's reader is the only authority on whether the rebuilt row buffers, offset array, " +
        "cell counts and legacy stubs are all acceptable together.",
      how:
        "npm run test:e2e on a Mac — 'writes cells that Numbers itself reads back' asserts the app " +
        "reports our text and number. Then open the file by hand and check the edited cells look " +
        "normal (no red triangle, no reformatting) and that undo/redo behaves.",
      e2e: true,
      risk: "high",
    },
  },
  {
    group: "Numbers & tables",
    name: "Cell styling (fill, four borders, padding, alignment, wrap)",
    apps: "all",
    status: "read+write",
    probe: (c) =>
      safe(() => c.doc.tables().some((t) => t.storageGeneration === "v5" && t.bandStyle("body") !== undefined)),
    manualProof: {
      claim: "A cell style we create is picked up by the app and rendered, and the style table stays consistent.",
      why:
        "We add a TST.CellStyleArchive and a style-table entry, then point the cell record at the new key. " +
        "Nothing offline proves the app resolves that key, nor that cloning a style without its name and " +
        "identifier is acceptable. The scripting dictionary exposes no cell formatting, so even e2e cannot assert it.",
      how:
        "Write a fill, four borders, padding and vertical alignment into a cell, open in Numbers, and compare " +
        "against the same formatting applied by hand in the inspector. Then re-save from the app and diff " +
        "our style object against what Numbers rewrote.",
      settled:
        "**Confirmed in Numbers — demo-05, four rounds.** Fill, padding and vertical alignment " +
        "drew from the first round; borders drew once they moved to the stroke sidecar with the " +
        "grid brought to the table's size (»2pt terrakotta hele vejen rundt«); the centred merge " +
        "confirmed horizontal alignment riding the cell's text style. The person's own " +
        "app-written border in a returned round matched our runs byte for byte",
      risk: "low",
    },
  },
  {
    group: "Numbers & tables",
    name: "Table styling (banded rows, grid strokes, visibility)",
    apps: "all",
    status: "read+write",
    probe: (c) => safe(() => c.doc.tables().some((t) => t.tableStyle() !== undefined)),
    manualProof: {
      claim: "Banded rows, grid strokes and the visibility toggles render as set.",
      why:
        "TableStylePropertiesArchive has separate strokes for the body grid and the outer border plus a " +
        "set of visibility booleans; which combination the app honours for a given theme is a rendering " +
        "question no archive inspection answers. Our 'body border' setter writes both the horizontal and " +
        "vertical border strokes on the assumption the inspector's single control does the same.",
      how:
        "Set bandedRows with a banded fill and a body grid stroke, open in Numbers, and compare against " +
        "the same settings applied through the Table inspector on an untouched copy.",
      risk: "medium",
    },
  },
  {
    group: "Numbers & tables",
    name: "Table structure (rows, columns, bands, sizes, freeze, repeat)",
    apps: "all",
    status: "read+write",
    probe: (c) => safe(() => c.doc.tables().some((t) => t.rowCount > 0)),
    note: "row and column insert/delete rebuild tiles, headers and the row-tile tree",
    manualProof: {
      claim: "Changed band counts, freeze and repeating-header flags, row heights and column widths take effect.",
      why:
        "These are presentation fields the offline suite can only verify it wrote and can read back. " +
        "Whether the app agrees a header count is legal for a given table — and whether frozen or repeating " +
        "headers need companion state we are not writing — only the app can say.",
      how:
        "Set headerRows/footerRows plus freezeHeaderRows and repeatHeaderRows, open in Numbers, and check " +
        "the header/footer controls in the inspector show what we set and that scrolling freezes correctly. " +
        "For repeating headers, print to PDF from Pages and confirm the header repeats on page 2.",
      risk: "medium",
    },
  },
  {
    group: "Numbers & tables",
    name: "Merged cell ranges",
    apps: "all",
    status: "read+write",
    probe: (c) => safe(() => c.doc.tables().some((t) => t.merges().length > 0)),
    note:
      "mergeCells/unmergeCells, complete with the calc engine's dependency ledger: the " +
      "kind-5 owner's (row 0, column = formula_index) record, tile minted on first use. " +
      "Deleting Apple's last merge in issue102 and remaking it through mergeCells " +
      "reproduces the whole saved file byte for byte",
    manualProof: {
      claim: "Numbers accepts a merge this library wrote, and shows it where we put it.",
      settled:
        "**Accepted and re-emitted (2026-08-03, 17 of 17).** The e2e merge-survival test " +
        "writes a fresh merge — ledger tile minted — into a fixture, has Numbers resave the " +
        "entire package, and finds the merge intact in the app's own rewrite: the engine " +
        "accepted our records and re-encoded them from its model. The visual half (one cell " +
        "spanning, text intact) rides along with any future rung-06 glance, but acceptance " +
        "is no longer in question",
      why:
        "Recreating one of Apple's merges reproduces the whole file byte-for-byte, which is as " +
        "far as offline proof reaches — a *fresh* merge additionally mints a ledger tile object, " +
        "and whether the engine is satisfied with it is the app's call alone.",
      how: "npm run test:e2e on a Mac — the 'merge we wrote survives Numbers resaving' test.",
      risk: "medium",
    },
  },
  {
    group: "Numbers & tables",
    name: "Cell display formats (number, currency, percentage, date, duration, text, boolean)",
    apps: "all",
    status: "read+write",
    probe: (c) =>
      safe(() =>
        c.doc
          .tables()
          .some(
            (t) =>
              t.storageGeneration === "v5" &&
              t.cells().some((cell) => t.cellFormat(cell.row, cell.column) !== undefined),
          ),
      ),
    note: "category comes from which record flag carries the id, not from the format's own type code; custom formats are read and preserved but cannot be authored",
    manualProof: {
      claim: "A format we write makes Numbers display the value the way the inspector would.",
      why:
        "The type codes were established by correlating every format in the corpus against the flag " +
        "that referenced it — strong evidence for the categories, but rendering is still the app's.",
      how:
        "Write a currency, percentage and date format, open in Numbers, and compare each cell against " +
        "the same format applied through the Cell inspector on an untouched copy.",
      settled:
        "**Confirmed in Numbers — demo-05.** Currency (kr., two decimals, record type 10 with the " +
        "full format tail), percentage, number decimals, date and duration all display as the " +
        "inspector states them, and the checkbox draws once written as the app writes it — " +
        "format 263 plus the record's control id plus the control-spec entry, the trio the " +
        "returned one-delta seed measured (»Checkboks vist«). Custom formats remain read-only",
      risk: "low",
    },
  },
  {
    group: "Numbers & tables",
    name: "Formula reading (AST rendered to text)",
    apps: "all",
    status: "read",
    probe: (c) => safe(() => c.doc.tables().some((t) => t.storageGeneration === "v5" && t.formulas().length > 0)),
    note: "not a Numbers feature — Pages and Keynote tables carry the same calc-engine archives",
    manualProof: {
      claim: "Rendered formula text matches what the app shows in its formula bar.",
      why:
        "Operators, references and ranges are decoded structurally and check out against cached " +
        "values, but the archive records no brackets and no function names, so the rendering is a " +
        "reconstruction. Only the app can confirm the reconstruction reads the same.",
      how:
        "Open libetonyek-pages5-extra-dir.pages in Pages and numbers-parser-v14.4-issue102.numbers " +
        "in Numbers, click the formula cells, and compare the formula bar with cellFormula(). " +
        "Expect =B2*C2 and =SUM(C3:K6).",
      risk: "medium",
    },
  },
  {
    group: "Numbers & tables",
    name: "Formula function names",
    apps: "all",
    status: "experimental",
    probe: (c) =>
      safe(() =>
        c.doc
          .tables()
          .some(
            (t) =>
              t.storageGeneration === "v5" &&
              t.formulas().some((f) => /[A-Z]+\(/.test(f.formula) && !f.formula.includes("FUNCTION_")),
          ),
      ),
    note: "only ids proven by arithmetic are named; the rest render as FUNCTION_<id>. Extend with registerFormulaFunctions()",
    manualProof: {
      claim: "The function-index table is incomplete, and every unnamed id is visible rather than guessed.",
      why:
        "AST_function_node_index is an index into an Apple-internal list that appears in no public " +
        "schema. The corpus proves exactly one entry (168 = SUM, by arithmetic). Shipping a table of " +
        "plausible-looking guesses would turn a visible gap into silent wrong answers.",
      how:
        "Run `node scripts/harvest-functions.ts --drive` on a Mac — it writes ~300 candidate functions " +
        "through Numbers and reads every index back in one pass, producing data/function-index.json " +
        "and a generated table. Without a Mac to hand, `--emit-sheet` produces a file to open and save " +
        "in Numbers by hand, then `--ingest`. Procedure in docs/BLOCKERS.md.",
      e2e: true,
      risk: "medium",
    },
  },
  {
    group: "Numbers & tables",
    name: "Cross-table formula references resolved to table names",
    apps: "all",
    status: "read",
    probe: (c) =>
      safe(() =>
        c.doc
          .tables()
          .some(
            (t) =>
              t.storageGeneration === "v5" && t.formulas().some((f) => f.formula.includes("::")),
          ),
      ),
    note: "via the calc-engine owner map; all 1020 cross-table references in the corpus name their table",
  },
  {
    group: "Numbers & tables",
    name: "Cell controls (checkbox, star rating, slider, stepper, pop-up menu)",
    apps: ["numbers"],
    status: "read+write",
    probe: (c) => safe(() => c.doc.tables().some((t) => t.controls().size > 0)),
    note:
      "interaction_type was measured from public widget-demo documents, read and discarded " +
      "(4 stepper, 5 slider, 6 star rating, 7 pop-up menu, 8 checkbox); the corpus now carries " +
      "one carrier, olekristensen-v26.3-demo07-rules-returned.numbers. setCellControl writes " +
      "all five widgets, sharing one spec between cells that want the same one, and all five " +
      "are confirmed drawing in Numbers — the menu's model on its own row below. Shape is " +
      "still classified by populated fields, so an unrecognised code degrades rather than " +
      "misreads",
    manualProof: {
      claim: "interaction_type 4 is the stepper and 5 the slider, rather than the other way round",
      why:
        "the other three widgets identify themselves — a checkbox row holds FALSE/TRUE, a star " +
        "row is bounded [0…5], a pop-up carries a chooser model. Stepper and slider store the " +
        "identical field set, so nothing in a file separates them. The pairing rests on one " +
        "slider whose bounds match a published test, plus elimination.",
      how:
        "a Numbers file with one slider and one stepper, then `npm run probe -- controls.numbers`: " +
        "if 4 and 5 come out swapped against the column they are in, the names are wrong.",
      settled:
        "**Confirmed in Numbers.** All four range and toggle widgets — checkbox, star rating, " +
        "slider and stepper — were opened and each drew as its label said, so the 4/5 pairing is " +
        "observed rather than inferred. This also settled the larger question underneath it: a " +
        "control needs a *format* as well as a spec, and without one the cell renders its value " +
        "and the widget never appears (FORMAT.md §14.7.1). That was invisible to every offline " +
        "check and is why the widgets had never once been seen before this.",
      risk: "medium",
    },
  },
  {
    group: "Numbers & tables",
    name: "Pop-up menu creation (TST.PopUpMenuModel)",
    apps: ["numbers"],
    status: "read+write",
    note:
      "The one widget built from the schema rather than measured. A menu is the only control " +
      "needing a second archive — the model holding its choices — and no document available " +
      "here contains one, so its shape comes from the vendored proto2 definition: repeated " +
      "TSCE.CellValueArchive, each item carrying the TSK.FormatStructArchive its schema marks " +
      "required. Cells sharing choices share one model. Reading, round-tripping and the cell's " +
      "own format are all checked offline; none of that is the app's opinion",
    manualProof: {
      claim: "a TST.PopUpMenuModel built from the schema is one Numbers will open and draw",
      why:
        "every other control was measured against a real one before being written. This one " +
        "could not be, and the failure mode just demonstrated by cell controls is precisely a " +
        "structure that is valid in every offline respect and still does not render — required " +
        "fields present, reader agrees, app shows nothing. A menu has more surface for that than " +
        "the others: it is two archives and a cross-object reference rather than one flag.",
      how:
        "`npm run bisect:docs` writes a document whose menu column offers three choices. Open it " +
        "in Numbers: the cell should show a disclosure chevron and clicking it should list the " +
        "three items. A cell showing the bare text with no chevron means the model was ignored; " +
        "a repair warning means it was rejected.",
      settled:
        "**Confirmed in Numbers, after the first attempt was quietly wrong.** The model was " +
        "accepted and the menu drew, but offered one fewer choice than it was given — the " +
        "first. Three candidate readings of `tsce_item[0]` were written as three documents, " +
        "and the decisive one was putting a copy of the selected value there: all choices came " +
        "back, but the menu marked none of them current, so slot 0 is the None entry rather " +
        "than a selection. It takes a bare NIL_TYPE, the choices start at index 1, and " +
        "`chooser_control_start_w_first` governs only whether that entry is offered as a row " +
        "(FORMAT.md §14.7.2). Text and numeric menus both verified.",
      risk: "medium",
    },
  },
  {
    group: "Numbers & tables",
    name: "Formula writing (authoring an AST)",
    apps: "all",
    status: "read+write",
    note:
      "setFormula parses infix text and compiles it: operators, parentheses, relative and " +
      "anchored references, ranges, cross-table references (`Other::A1`, resolved to the " +
      "target's owner UUID), nested calls, omitted arguments, and any of the 272 measured " +
      "functions. Whole-column spans (`SUM(D)`) write too. Every parseable corpus formula " +
      "rebuilds byte-identical to Apple's AST (1242 of 1242), and replacing a formula with " +
      "its own text saves the whole document byte-identical to the original. Nothing " +
      "evaluates — pass the cached result as `value`. Arrays and #REF! are refused",
    manualProof: {
      claim:
        "Numbers recalculates a formula this library wrote — replaced or fresh — rather than " +
        "trusting the stale dependency tracker beside it.",
      settled:
        "**Confirmed — Numbers recomputes.** The e2e recompute probe (2026-08-03, 17 of 17): " +
        "a fresh formula written with a deliberately wrong cached value (`=B2*2` cached as 999 " +
        "over B2 = 100) opened in Numbers reporting 200 — the recomputed truth, not our cache. " +
        "So the engine does not trust the per-cell dependency tracker setFormula leaves stale; " +
        "it rebuilds on open, and no tracker write is needed for app correctness. The probe " +
        "runs on every e2e pass (test/e2e/authoring.e2e.test.ts), so a future Numbers that " +
        "starts trusting the tracker fails loudly. Bisect rungs 19–21 are superseded",
      why:
        "The calc engine keeps a per-cell dependency tracker (TSCE.FormulaOwnerDependenciesArchive " +
        "lists exactly the formula cells, with precedent edges — measured on the issue102 " +
        "fixture), and setFormula does not update it: a replaced formula keeps stale edges, and " +
        "a fresh formula cell is missing from the tracker entirely. A same-text replace is " +
        "proven byte-identical and needs no app check; whether the engine rebuilds the tracker " +
        "on open, or trusts it, only Numbers can say.",
      how:
        "npm run test:e2e on a Mac — the 'recomputes our formula' test carries the probe.",
      risk: "high",
    },
  },
  {
    group: "Numbers & tables",
    name: "Charts (type, categories, series, values)",
    apps: "all",
    status: "read",
    probe: (c) => safe(() => c.doc.charts().length > 0),
  },
  {
    group: "Numbers & tables",
    name: "Add and remove tables on a sheet",
    apps: ["numbers"],
    status: "read+write",
    probe: (c) => safe(() => (c.numbers?.sheets().length ?? 0) > 0),
    note:
      "copies an existing table and renames it — Numbers addresses tables by name, so a " +
      "duplicate makes cross-table formulas ambiguous. The copy's calc-engine identity is " +
      "re-minted too (the whole derived owner family off one fresh base UUID): a byte-copied " +
      "identity is one table with two names, and the engine resolves either name to whichever " +
      "registered first — measured when a formula naming a clone read the donor's cells instead",
    manualProof: {
      claim: "a table added this way is editable in Numbers as a table, not just present in the file",
      why: "the suite proves it reloads with its own cells and a unique name, not that the app treats it as a first-class table",
      how: "add a blank table, open in Numbers, type into it and reference it from a formula on another table",
      risk: "medium",
    },
  },
  {
    group: "Numbers & tables",
    name: "Chart data editing (values, names, series, categories)",
    apps: "all",
    status: "read+write",
    probe: (c) => safe(() => c.doc.charts().length > 0),
    note: "the grid's id map and the sparse per-series style arrays are kept in step; appearance has its own rows below",
    manualProof: {
      claim: "a series added or removed here leaves the chart's styling on the right series",
      why: "styling is applied at render time from arrays indexed by series position; the suite proves the indexes shift, not what the app draws",
      how: "take a chart with distinctly coloured series, remove the middle one, open in the app and confirm the remaining series keep their own colours rather than shifting",
      settled:
        "**Confirmed in Pages — demo-04 pass, whole.** Library-rewritten data (two series by " +
        "four categories), renamed series and categories, all drawn as written in the corpus " +
        "document's own column chart. The remove-a-middle-series case is untested, but the id " +
        "map and sparse arrays the demo exercised are the same machinery",
      risk: "low",
    },
  },
  {
    group: "Numbers & tables",
    name: "Chart appearance: type and series colours",
    apps: "all",
    status: "read+write",
    probe: (c) => safe(() => chartsOf(c.doc.store).some((chart) => chart.seriesStyles().length > 0)),
    note:
      "chart type reads and writes against the full TSCHArchives_Common enum (a test parses the " +
      "proto, so the next value Apple adds fails the suite rather than a document). Series colour " +
      "copies on write: style archives are shared — one is referenced by ten charts in a borrowed " +
      "document — so setSeriesFill clones a shared archive, repoints this chart's slot and " +
      "retargets the reference declaration, instead of recolouring every chart at once",
    manualProof: {
      claim: "a recoloured series shows the new colour, and only in the chart that was edited",
      why: "the suite proves the archives and declarations are right, not that Numbers draws them",
      how:
        "`npm run bisect:docs` rung 12 recolours series 0 of the chart in " +
        "tika-testNumbers2013.numbers to pure red. That fixture holds **one** chart with six " +
        "series, so it settles the within-chart half only; the cross-chart half needs a document " +
        "with several charts sharing a style archive, which this repository does not have",
      settled:
        "**Half confirmed in Numbers.** The recoloured series drew red and the chart was " +
        "otherwise correct — so the clone-and-repoint worked where it is observable: five other " +
        "series kept their colours despite the shared archive. The cross-chart half is still " +
        "unobserved, because the only chart fixture here has a single chart, and a copy-on-write " +
        "that leaks would need a second chart to leak into. Same mechanism, so the risk stays low",
      risk: "low",
    },
  },
  {
    group: "Numbers & tables",
    name: "Chart appearance: axes, legend, gridlines",
    apps: "all",
    status: "read+write",
    probe: (c) => safe(() => chartsOf(c.doc.store).some((chart) => chart.axisStyles().length > 0)),
    note:
      "axis visibility, gridlines, tick marks and gridline strokes read and write, per axis and " +
      "per kind. Nearly every axis property exists twice — once for category, once for value — " +
      "and an archive fills only its own family, so reading the wrong one returns undefined for " +
      "everything and looks like an empty archive rather than a bug; the chart names the two " +
      "kinds in separate fields, so nothing is inferred. Writes copy on write like series fills. " +
      "Legend fill, stroke and opacity write the same way",
    manualProof: {
      claim: "Pages draws the chart without the gridlines this library switched off.",
      why:
        "The archives round-trip and copy-on-write correctly, which is the file's side of the " +
        "story; only the app can say the toggle changes what is drawn rather than being ignored.",
      how:
        "npm run pages:docs -- <outDir>, open P20-chart-gridlines: the page states its own pass " +
        "— the column chart should show no horizontal gridlines behind its bars.",
      settled:
        "**Confirmed in Pages — demo-04 pass.** The value axis's horizontal gridlines were " +
        "switched off by the library and the app drew the chart without them, with the " +
        "library-rewritten data and renamed series drawn as written",
      risk: "low",
    },
  },
  {
    group: "Numbers & tables",
    name: "Conditional formatting rules",
    apps: "all",
    status: "read+write",
    probe: (c) => safe(() => c.doc.tables().some((t) => t.conditionalStyleSets().size > 0)),
    note:
      "conditions decoded from the rule's formula, which states the comparison. setConditionalRules " +
      "writes all six comparisons — every predicate_type code is observed, the last two (> at 7, " +
      ">= at 8) measured 2026-08-03 from seed documents whose formulas state the operators. A rule " +
      "built for a condition Apple also wrote is byte-identical to Apple's, all 424 bytes",
    manualProof: {
      claim:
        "the second conditional id in a cell record (COND_RULE_STYLE_ID) is a cache the app rewrites, so preserving it verbatim is enough",
      why: "its value contradicts the obvious reading — every cell on a one-rule set carries 15 regardless of content, and cells on other sets carry 0, which is not a valid key in any of the table's lists",
      how: "author two conditional rules, note the value on cells matching each, then change a cell's content so a different rule fires and re-read; if it tracks the match it is a live cache, if not it means something else",
      risk: "low",
    },
  },
  {
    group: "Numbers & tables",
    name: "Conditional formatting: apply an existing rule set to more cells",
    apps: "all",
    status: "read+write",
    probe: (c) => safe(() => c.doc.tables().some((t) => t.conditionalStyleSets().size > 0)),
    manualProof: {
      claim: "re-pointing a cell's conditional-style key makes Numbers apply that rule set to it",
      why: "the fixture suite proves the key changes and the file reloads, not that the app honours it — evaluation happens in the calc engine",
      how: "open a document with two conditional rules, move a cell onto the other set with setConditionalStyleKey, open in Numbers and confirm the cell picks up the second rule's styling",
      risk: "medium",
    },
  },
  {
    group: "Numbers & tables",
    name: "Conditional formatting: authoring new rules",
    apps: "all",
    status: "read+write",
    note:
      "all six comparisons write. = <> < <= were observed in the corpus; > (7) and >= (8) were " +
      "measured 2026-08-03, closing the menu-order enum — codes were refused until observed " +
      "because a rule filed under a wrong code reads back correctly while showing the wrong " +
      "condition in the editor. A rule built for a condition Apple also wrote is byte-identical " +
      "to Apple's, all 424 bytes. Every covered cell is also registered in the calc engine's " +
      "dependency ledger — a CellRecordExpandedArchive under the table's kind-3 owner, one edge " +
      "naming the cell itself — the shape 1973 corpus records state unanimously",
    manualProof: {
      claim: "a rule set this library authors draws its fills the moment Numbers opens the document",
      why:
        "The first demo round proved the halfway state: rules written without ledger records " +
        "showed correctly in the inspector and never evaluated — no fill until a covered cell " +
        "was deleted and re-typed, at which point the app registered exactly the re-typed cells " +
        "(olekristensen-v26.3-demo07-rules-returned.numbers carries that aftermath). This is the " +
        "opposite behaviour of cell formulas, which the engine recomputes on open with no " +
        "tracker write at all — so the ledger cannot be assumed either way; each owner kind had " +
        "to be measured. The registration now written matches the corpus shape offline; whether " +
        "it is what the app was waiting for, only reopening decides. The same round observed " +
        "library-written number cells rendering left-aligned until the same re-commit — " +
        "plausibly the same cause, unproven.",
      how:
        "npm run demos, open demo-07-regler.numbers in Numbers: the C-column fills (green, " +
        "yellow, blue) must be visible immediately, and the numbers right-aligned, without " +
        "touching any cell. Having to re-type a value first means the registration is not " +
        "sufficient — note which cells.",
      risk: "high",
    },
  },
  {
    group: "Numbers & tables",
    name: "Filters (mode, enable state, per-column rules)",
    apps: "all",
    status: "read",
    probe: (c) =>
      safe(() =>
        c.doc.tables().some((t) => {
          const { rows, columns } = t.filterSets();
          return rows !== undefined || columns !== undefined;
        }),
      ),
    note:
      "rule reading is pinned against the populated two-rule set in " +
      "olekristensen-v26.3-mac-filters.numbers — columns, switches, predicates and their " +
      "formulas, sharing the conditional-formatting encoding — alongside the empty sets " +
      "every template-era fixture carries",
  },
  {
    group: "Numbers & tables",
    name: "Filters: enable, disable, combining mode",
    apps: "all",
    status: "read+write",
    probe: (c) =>
      safe(() => c.doc.tables().some((t) => t.filterSets().rows !== undefined)),
    manualProof: {
      claim: "enabling a filter set makes Numbers apply its rules",
      why:
        "the corpus now carries a populated, enabled set the app itself wrote, but a flag " +
        "flipped by this library has never been reopened in the app — and hidden rows are " +
        "recomputed there, not here",
      how: "take olekristensen-v26.3-mac-filters.numbers, flip is_enabled off with this library, reopen and confirm all rows show",
      settled:
        "**Confirmed in Numbers, both directions.** The demo built on that very document — " +
        "filter set disabled by this library — opened with all ten data rows visible, and " +
        "re-enabling the filter through the app's own panel hid the non-matching rows " +
        "(»Da jeg slog dem til fungerede det«). A library-flipped flag is one the app honours " +
        "and can flip back.",
      risk: "medium",
    },
  },
  {
    group: "Numbers & tables",
    name: "Categories (row grouping, nesting, date bucketing)",
    apps: "all",
    status: "read",
    probe: (c) => safe(() => c.doc.tables().some((t) => t.activeCategories() !== undefined)),
    note: "group membership cross-checked against cell contents; every group in every fixture agrees",
  },
  {
    group: "Numbers & tables",
    name: "Categories: enable or disable grouping",
    apps: "all",
    status: "read+write",
    probe: (c) => safe(() => c.doc.tables().some((t) => t.categories().length > 0)),
    manualProof: {
      claim: "flipping is_enabled makes Numbers group or ungroup the rows",
      why: "the suite proves the flag round-trips and the tree survives, not that the app acts on it",
      how: "take a categorised table, disable it with setEnabled(false), open in Numbers and confirm the rows are flat and the category can be switched back on",
      risk: "low",
    },
  },
  {
    group: "Numbers & tables",
    name: "Categories: regrouping rows after an edit",
    apps: "all",
    status: "read+write",
    probe: (c) =>
      safe(() => c.doc.tables().some((t) => (t.activeCategories()?.groups().length ?? 0) > 0)),
    note:
      "regroupCategories puts rows back in the groups their values now call for, and writes only " +
      "the index sets that changed — regrouping unchanged data reproduces Apple's archive byte for " +
      "byte across every by-value table in the fixture. Creating or removing a group is refused: " +
      "which rows are \"Animal\" the data answers, but a new group's identity, its sort position " +
      "and the per-column fields beside the tree are things only the app knows",
    manualProof: {
      claim:
        "a row whose grouping value changed appears under its new group heading in Numbers, and " +
        "per-group summaries — where a table has any — follow it",
      why:
        "the offline check reads the tree this library just wrote, using the reader that shares " +
        "its assumptions. Whether Numbers honours a rebuilt tree, or recomputes its own and " +
        "ignores ours, is not visible from the file.",
      how:
        "`npm run bisect:docs` rung 11 moves the Bear row from Animal to Fruit in " +
        "numbers-parser-v26.0-categories.numbers and rebuilds the tree. Open it: Bear should sit " +
        "under the Fruit heading.",
      settled:
        "**Confirmed in Numbers — the move half.** Bear appears under Fruit. The summaries half " +
        "is untested and cannot be tested here: that fixture declares **zero** " +
        "TST.ColumnAggregateArchive entries, so its group headings show no counts or totals at " +
        "all, and there is nothing for a regroup to get wrong. regroupCategories does not touch " +
        "aggregates, which is correct only if Numbers recomputes them; on a table that does " +
        "declare a summary, moving a row between groups would change both groups' totals, and " +
        "nothing here establishes whether ours would go stale. Needs a categorised fixture with " +
        "a per-column summary, which this repository does not have",
      risk: "medium",
    },
  },
  {
    group: "Numbers & tables",
    name: "Categories: creating a grouping, and per-group summaries",
    apps: "all",
    status: "roadmap",
    note:
      "creating a group needs its identity, its sort position and the several per-column and " +
      "per-row fields written alongside the tree, none of which any fixture explains; and no " +
      "fixture has a non-empty aggregate list, so summary rows are read but unexercised",
  },
  {
    group: "Numbers & tables",
    name: "Row and column identities (TST.ColumnRowUIDMapArchive)",
    apps: "all",
    status: "read",
    probe: (c) => safe(() => c.doc.tables().some((t) => t.uidMap().columnCount > 0)),
    note:
      "resolves the UIDs categories, hidden states and the calc engine use back to positions; " +
      "row/column insert and delete keep the map in lockstep, minting and retiring identities — " +
      "read-only means no direct authoring API",
  },
  {
    group: "Numbers & tables",
    name: "Filters: authoring rules and recomputing hidden rows",
    apps: "all",
    status: "roadmap",
    note: "a rule set alone does not hide rows — TST.HiddenStateExtentArchive records the result, and recomputing it means evaluating the predicates",
  },

  // ----------------------------------------------------------------- keynote
  {
    group: "Keynote",
    name: "Slide management (add, duplicate, move, remove)",
    apps: ["keynote"],
    status: "read+write",
    probe: (c) => safe(() => (c.keynote?.slideCount() ?? 0) > 1),
    note: "new slides deep-copy their content and share their layout, styles and theme",
    manualProof: {
      claim: "Keynote opens a deck we added, duplicated, moved or removed slides in, and shows them in order.",
      why:
        "A slide is only as valid as the graph around it — placeholders, builds, the master reference. " +
        "The offline audit removed four defects before any Mac (an undeclared slide node, orphaned " +
        "clones, undeclared guide storage, placeholders declaring their slide). The app then found a " +
        "fifth the audit could not see: \"K04 added an empty slide\" — the add-without-content path " +
        "stripped owned_drawables and drawables_z_order wholesale, and on decks that list their " +
        "placeholders there (8 of 12 on the ladder base; 0 of 33 on another — which is why no " +
        "ubiquity threshold fired), Keynote painted nothing, our written title included. The copy now " +
        "keeps its cloned placeholders in whichever lists its source used.",
      how:
        "`npm run keynote:docs -- <dir>` and open the K04 file: its last slide must SHOW its stated " +
        "title on the right layout (an entirely empty slide is the old paint-order defect, and would " +
        "mean the lists were not the whole story). Duplicate, remove and reorder are already " +
        "confirmed — \"K05 passed / K06 passed / K07 passed\" — so only the add path is in question.",
      risk: "high",
      settled:
        "**Confirmed in Keynote — \"K05 passed / K06 passed / K07 passed\", then \"K02 and K04 pass " +
        "now\".** Add, duplicate, remove and reorder all hold on the current-format base. It took " +
        "two rounds of measurement: the offline audit removed four graph defects before any Mac " +
        "(undeclared slide node, orphaned clones, undeclared guide storage, placeholders declaring " +
        "their slide), and the app then exposed the fifth no threshold could see — stripping the " +
        "paint-order lists on a deck that lists its placeholders there rendered the added slide " +
        "empty. The copy now follows its source's own listing convention, and the app draws it.",
    },
  },
  {
    group: "Keynote",
    name: "Slide tree (both generations, presentation order)",
    apps: ["keynote"],
    status: "read+write",
    probe: (c) => safe(() => (c.keynote?.slideCount() ?? 0) > 0),
  },
  {
    group: "Keynote",
    name: "Speaker notes",
    apps: ["keynote"],
    status: "read+write",
    probe: (c) => safe(() => c.keynote?.slides().some((s) => s.notes.trim().length > 0) ?? false),
    manualProof: {
      claim: "Keynote shows presenter notes this library wrote.",
      why:
        "Notes reuse the shared text-storage writer, which is app-confirmed in Pages — but a NOTE-kind " +
        "storage hangs off a KN.NoteArchive no Pages document has, and only Keynote can say the chain holds.",
      how:
        "`npm run keynote:docs -- <dir>`, open the K03 file, View ▸ Show Presenter Notes: the slide's " +
        "title states the exact text the notes pane should show. Notes missing or stale means the note " +
        "storage write does not take; the title changing but notes not narrows it to the KN.NoteArchive chain.",
      risk: "medium",
      settled:
        "**Confirmed in Keynote — \"K00 - 03 passed\"** on the first decks this library ever put in " +
        "front of the app (current 26.1.0 base; K03 is the presenter-notes rung). The container " +
        "layer, title and body placeholder writes, and the KN.NoteArchive chain all held on first " +
        "contact — after the offline shape audit had already removed four defects no app ever saw.",
    },
  },
  {
    group: "Keynote",
    name: "Transitions",
    apps: ["keynote"],
    status: "read+write",
    probe: (c) => safe(() => c.keynote?.slides().some((s) => s.transition()?.enabled) ?? false),
    note: "named effects were blocked on evidence — every corpus slide says effect \"none\" — until the e2e suite began manufacturing it: Keynote applies a real dissolve and the library reads it back, and Keynote reads back a duration and effect the library wrote (both confirmed 2026-08-03, 17 of 17); written effects copy a string measured from the app that run, never a guess",
    manualProof: {
      claim: "Keynote honours automatic advance written into the transition attributes.",
      why:
        "The animationAttributes chain is where both auto-advance and named effects live. Auto-advance " +
        "uses only corpus-verified fields (is_automatic, delay), so it is the half we can claim; a pass " +
        "also proves the chain itself accepts our writes, which is the prerequisite for effects later.",
      how:
        "`npm run keynote:docs -- <dir>`, open the K08 file and press Play: the first slide states it " +
        "should advance by itself after ~2 seconds. Having to click means the write did not take.",
      risk: "medium",
      settled:
        "**Confirmed in Keynote — \"K08 passed\".** The deck advanced by itself after ~2 seconds on " +
        "the current-format base, which also proves the animationAttributes chain accepts our " +
        "writes — the prerequisite for named effects, which stay blocked on measuring a real effect " +
        "string (the corpus knows only \"none\"; the animated.key ask in docs/BLOCKERS.md settles it).",
    },
  },
  {
    group: "Keynote",
    name: "Presentation settings (mode, loop, autoplay delays, slide size)",
    apps: ["keynote"],
    status: "read+write",
    probe: (c) => safe(() => c.keynote?.slideSize() !== undefined),
    note: "defaults come from the schema, not from zero — every corpus deck omits several and relies on them",
    manualProof: {
      claim: "Keynote renders a deck whose canvas this library resized.",
      why:
        "slideSize is one TSP.Size on the show; nothing else references it, so nothing offline can " +
        "prove the app re-lays content out rather than ignoring or refusing the change.",
      how:
        "`npm run keynote:docs -- <dir>`, open the K10 file: the title says the deck should be 4:3 " +
        "(1024×768), visibly squarer than the base's 16:9. A still-widescreen canvas is the failure.",
      risk: "medium",
      settled:
        "**Confirmed — \"K10 size was 4:3 on iPhone\".** The resized canvas renders 4:3 in Keynote " +
        "for iOS, the second platform this ladder has been checked on (the Pages comment rung was " +
        "the first). One TSP.Size on the show is all it takes, and the app re-lays out for it.",
    },
  },
  {
    group: "Keynote",
    name: "Slide placeholders (title, body, slide number) — read and fill",
    apps: ["keynote"],
    status: "read+write",
    probe: (c) => safe(() => (c.keynote?.slides() ?? []).some((s) => s.placeholders().length > 0)),
    note: "fills a placeholder the slide already carries; creating one needs the theme's geometry for that role",
    manualProof: {
      claim: "Keynote shows placeholder text this library wrote, styled by the layout.",
      why:
        "Placeholder text goes through the shared storage writer into a shape the layout styles. " +
        "First round: the text half passed — \"K00 - 03 passed\", K01's title and K02's body both " +
        "rendered — but K02's subtitle styling did not: \"the textareas default style of subtitle " +
        "was replaced by normal\". Measured cause: the base's empty storage carries one paragraph " +
        "entry at 0, the rebuild misread it (`0 === 0`) as a trailing terminator, and the refilled " +
        "table gained an end-of-text entry Apple never writes — the app dropped the style run. " +
        "Fixed; the paragraph entries are now exactly the paragraph starts.",
      how:
        "`npm run keynote:docs -- <dir>`, open the K02 file: the body text should render in the " +
        "layout's subtitle style — same size and weight the placeholder's ghost text had — not as " +
        "plain body text. Still-normal text means the terminator was not the (whole) cause, and the " +
        "next suspect is a character-level convention the app writes on placeholder text.",
      risk: "medium",
      settled:
        "**Confirmed in Keynote — \"K02 and K04 pass now\"**, after one round each way. K01's title " +
        "passed first contact; K02's body text rendered but lost its subtitle styling, because " +
        "filling the base's *empty* storage misread its one paragraph entry at 0 (`0 === 0`) as a " +
        "trailing terminator and manufactured an end-of-text entry Apple never writes. With the " +
        "entries restored to exactly the paragraph starts, the subtitle style survives the fill — " +
        "the app confirmed it, and the corpus settled the bystander question on the way: " +
        "object-less inherit entries are Apple's own majority convention (2379 of 3416).",
    },
  },
  {
    group: "Keynote",
    name: "Skipped slides",
    apps: ["keynote"],
    status: "read+write",
    probe: (c) => safe(() => (c.keynote?.slides() ?? []).some((s) => s.isSkipped)),
    note: "NO FIXTURE: no corpus deck skips a slide; the flag is read off SlideNodeArchive.isSkipped and written as a bool on the node",
    manualProof: {
      claim: "Keynote treats a slide this library marked skipped as skipped.",
      why:
        "The write is one bool on the slide node. No corpus deck carries it true, so even the read " +
        "side rests on the schema alone — this rung is the first evidence in either direction.",
      how:
        "`npm run keynote:docs -- <dir>`, open the K09 file: slide 1 states that the next slide is " +
        "skipped — collapsed in the navigator, absent when playing. It presenting anyway is the failure.",
      risk: "medium",
      settled:
        "**Confirmed in Keynote — \"K09 passed\".** One bool on the slide node, and the app honours " +
        "it: the marked slide stayed out of the presentation. First evidence in either direction for " +
        "this flag — no corpus deck carries it true.",
    },
  },
  {
    group: "Keynote",
    name: "Master / layout slides",
    apps: ["keynote"],
    status: "read",
    probe: (c) => safe(() => (c.keynote?.masterSlides().length ?? 0) > 0),
  },
  {
    group: "Keynote",
    name: "Builds (animations): read and retime",
    apps: ["keynote"],
    status: "read+write",
    probe: (c) => safe(() => (c.keynote?.slides() ?? []).some((s) => s.builds().length > 0)),
    note:
      "effect, timing, delivery, trigger and per-stage chunks all read, pinned against the " +
      "three app-authored builds in olekristensen-v26.3-mac-builds-effects.key; effect and " +
      "timing decode from KN.AnimationAttributesArchive with database_* fallback, and " +
      "retiming writes the same fields. Will not create a build — see docs/BLOCKERS.md",
    manualProof: {
      claim: "the build model reads a real animation correctly",
      settled:
        "**Half confirmed, half refuted (2026-08-03, the first animated deck anywhere), then " +
        "closed whole when the deck's bytes arrived.** Confirmed: three builds survive " +
        "authoring and resave, the slide↔build graph reads correctly, and delivery stores " +
        "English display strings (\"All at Once\", \"By Paragraph\") even under a Danish UI. " +
        "Refuted: every database_* field read for effect and timing was absent from the " +
        "app-authored builds — including one given 3 s duration and 1 s delay by hand — so " +
        "modern Keynote packs effect and timing into animationAttributes. The returned deck " +
        "settled that field as KN.AnimationAttributesArchive (in the vendored schema all " +
        "along): effect strings in two schemes, duration/delay doubles, and per-chunk timing " +
        "on staged delivery. The deck is now the fixture the readers are pinned against",
      why: "not one of the eight decks in the corpus, spanning 2013 to 26.1, contains an animation",
      how: "a three-slide deck with a different effect on each and one text build delivered by line, then `npm run probe -- animated.key`",
      risk: "high",
    },
  },
  {
    group: "Keynote",
    name: "Builds: creating an animation",
    apps: ["keynote"],
    status: "roadmap",
    note: "withheld until a real animation confirms the read model; a build the app drops is indistinguishable from one never written",
  },

  // ------------------------------------------------------------- concurrency
  {
    group: "Concurrency",
    name: "Editing a document open in an app",
    apps: "all",
    status: "out-of-scope",
    note: "the app rewrites the whole package on autosave; see FORMAT.md §13.1",
  },
  {
    group: "Concurrency",
    name: "Live iCloud collaboration",
    apps: "all",
    status: "out-of-scope",
    note: "server-mediated OT over an authenticated protocol; see FORMAT.md §13.2",
  },
];

interface FixtureFacts {
  file: string;
  app: IWorkApp;
  era: IWorkEra;
  version: string;
  build: string;
  exercises: Set<string>;
}

function surveyFixtures(): FixtureFacts[] {
  const dir = fileURLToPath(FIXTURES);
  const facts: FixtureFacts[] = [];
  for (const file of readdirSync(dir).sort()) {
    if (!/\.(pages|numbers|key)$/.test(file)) continue;
    const bytes = new Uint8Array(readFileSync(new URL(file, FIXTURES)));
    let doc: IWorkDocument;
    try {
      doc = IWorkDocument.open(bytes);
    } catch {
      continue; // legacy '09 contrast file
    }
    const report = doc.compatibility();
    const app = doc.app;
    const context: DocContext = {
      app,
      doc,
      report,
      pages: app === "pages" ? safeLoad(() => PagesDocument.load(bytes)) : undefined,
      keynote: app === "keynote" ? safeLoad(() => KeynoteDocument.load(bytes)) : undefined,
      numbers: app === "numbers" ? safeLoad(() => NumbersDocument.load(bytes)) : undefined,
    };
    const exercises = new Set<string>();
    for (const capability of CAPABILITIES) {
      if (!capability.probe) continue;
      if (capability.apps !== "all" && !capability.apps.includes(app)) continue;
      if (safe(() => capability.probe!(context))) exercises.add(key(capability));
    }
    facts.push({
      file,
      app,
      era: report.era,
      version: report.formatVersion?.toString() ?? "—",
      build: report.appBuilds.at(-1) ?? "—",
      exercises,
    });
  }
  return facts;
}

function safeLoad<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

const key = (c: Capability): string => `${c.group}/${c.name}`;

const APPS: IWorkApp[] = ["pages", "numbers", "keynote"];
const APP_LABEL: Record<IWorkApp, string> = {
  pages: "Pages",
  numbers: "Numbers",
  keynote: "Keynote",
};
const SURVEYED_ERAS = IWORK_ERAS.filter((e) => e !== "future");

function render(facts: FixtureFacts[]): string {
  const out: string[] = [];
  out.push("# Coverage matrix");
  out.push("");
  out.push(
    "**Generated — do not edit.** Run `npm run coverage` to regenerate; `npm run coverage:check`",
  );
  out.push("fails when this file is out of date with the fixtures and capability table.");
  out.push("");
  out.push(
    "Support status is declared in `scripts/coverage-matrix.ts`. Validation is *measured*: each",
  );
  out.push(
    "capability is probed against every fixture, so a row can read “implemented” and “validated by",
  );
  out.push("zero fixtures” at the same time — which is exactly the thing worth knowing.");
  out.push("");

  // ------------------------------------------------------------- version axis
  out.push("## Version coverage");
  out.push("");
  out.push(`| App | ${SURVEYED_ERAS.join(" | ")} | Total | Newest format | Newest build |`);
  out.push(`|---|${SURVEYED_ERAS.map(() => "---:").join("|")}|---:|---|---|`);
  for (const app of APPS) {
    const mine = facts.filter((f) => f.app === app);
    const cells = SURVEYED_ERAS.map((era) => {
      const n = mine.filter((f) => f.era === era).length;
      return n === 0 ? "·" : String(n);
    });
    const newest = [...mine].sort((a, b) => compareVersion(a.version, b.version)).at(-1);
    out.push(
      `| **${APP_LABEL[app]}** | ${cells.join(" | ")} | ${mine.length} | ` +
        `${newest?.version ?? "—"} | \`${newest?.build ?? "—"}\` |`,
    );
  }
  out.push("");
  out.push(`Eras are classified from \`fileFormatVersion\`; see \`docs/FORMAT.md\` §11. `);
  out.push(`Corpus: **${facts.length} documents**. Every one round-trips byte-identically.`);
  out.push("");

  // ------------------------------------------------------------- feature axis
  out.push("## Feature coverage");
  out.push("");
  out.push("Legend: " + Object.values(STATUS_LABEL).join(" · "));
  out.push("");
  const groups = [...new Set(CAPABILITIES.map((c) => c.group))];
  for (const group of groups) {
    out.push(`### ${group}`);
    out.push("");
    out.push("| Capability | Apps | Status | Fixtures | Eras validated |");
    out.push("|---|---|---|---:|---|");
    for (const capability of CAPABILITIES.filter((c) => c.group === group)) {
      const applicable =
        capability.apps === "all" ? APPS : (capability.apps);
      const matching = facts.filter((f) => f.exercises.has(key(capability)));
      const eras = [...new Set(matching.map((f) => f.era))].sort(
        (a, b) => IWORK_ERAS.indexOf(a) - IWORK_ERAS.indexOf(b),
      );
      const count = capability.probe
        ? matching.length === 0
          ? "**0**"
          : String(matching.length)
        : "n/a";
      const eraText = capability.probe
        ? eras.length === 0
          ? "—"
          : eras.length === SURVEYED_ERAS.length
            ? "all"
            : `${eras[0]}→${eras.at(-1)}`
        : "—";
      const apps =
        capability.apps === "all" ? "all" : applicable.map((a) => APP_LABEL[a]).join(", ");
      // Notes land inside literal <sub> HTML, where a bare "<" in prose
      // (FUNCTION_<id>, <file>) reads as an unclosed tag — Vue-based
      // renderers refuse the whole page over it. Escape, always.
      const escaped = capability.note ? vueSafe(capability.note) : undefined;
      const note = escaped ? `<br><sub>${escaped}</sub>` : "";
      out.push(
        `| ${capability.name}${note} | ${apps} | ${STATUS_LABEL[capability.status]} | ${count} | ${eraText} |`,
      );
    }
    out.push("");
  }

  // ------------------------------------------------------------------- gaps
  const unvalidated = CAPABILITIES.filter(
    (c) =>
      c.probe &&
      c.status !== "roadmap" &&
      c.status !== "out-of-scope" &&
      facts.every((f) => !f.exercises.has(key(c))),
  );
  const thin = CAPABILITIES.filter((c) => {
    if (!c.probe || c.status === "roadmap" || c.status === "out-of-scope") return false;
    const n = facts.filter((f) => f.exercises.has(key(c))).length;
    return n > 0 && n <= 2;
  });

  const unproven = CAPABILITIES.filter((c) => c.manualProof);
  out.push("## Claims that need a Mac");
  out.push("");
  out.push(
    `${unproven.length} capabilities make a claim the offline suite structurally cannot settle — ` +
      "whether **Apple's own apps** accept what we wrote, as opposed to whether we read Apple's files",
    "correctly. They are listed with their reasoning and repro steps in",
    "[`docs/VERIFICATION.md`](VERIFICATION.md):",
    "",
  );
  for (const c of unproven) {
    const proof = c.manualProof!;
    out.push(`- ${RISK_LABEL[proof.risk]} — ${c.group} → **${c.name}**${proof.e2e ? " *(covered by `npm run test:e2e`)*" : ""}`);
  }
  out.push("");

  out.push("## Validation gaps");
  out.push("");
  if (unvalidated.length > 0) {
    out.push("**Implemented but exercised by no fixture** — spec-derived only:");
    out.push("");
    for (const c of unvalidated) out.push(`- ${c.group} → **${c.name}**`);
    out.push("");
  } else {
    out.push("Every implemented capability is exercised by at least one fixture.");
    out.push("");
  }
  if (thin.length > 0) {
    out.push("**Thinly validated** (1–2 fixtures — no cross-check if an encoding varies):");
    out.push("");
    for (const c of thin) {
      const n = facts.filter((f) => f.exercises.has(key(c))).length;
      out.push(`- ${c.group} → **${c.name}** (${n})`);
    }
    out.push("");
  }

  // ---------------------------------------------------------------- fixtures
  out.push("## Fixture inventory");
  out.push("");
  out.push("| File | App | Era | Format | Build |");
  out.push("|---|---|---|---|---|");
  for (const f of facts) {
    out.push(
      `| \`${f.file}\` | ${APP_LABEL[f.app]} | ${f.era} | ${f.version} | \`${f.build}\` |`,
    );
  }
  out.push("");
  out.push("See `fixtures/ATTRIBUTION.md` for sources, licences and the fixture privacy policy.");
  out.push("");
  return out.join("\n");
}

function compareVersion(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Compact terminal view, for reporting progress without opening the file. */
function summarize(facts: FixtureFacts[]): string {
  const lines: string[] = [];
  const pad = (s: string, n: number) => s.padEnd(n);
  lines.push(pad("app", 10) + SURVEYED_ERAS.map((e) => pad(e, 10)).join("") + "newest");
  for (const app of APPS) {
    const mine = facts.filter((f) => f.app === app);
    const cells = SURVEYED_ERAS.map((era) =>
      pad(String(mine.filter((f) => f.era === era).length || "·"), 10),
    );
    const newest = [...mine].sort((a, b) => compareVersion(a.version, b.version)).at(-1);
    lines.push(pad(APP_LABEL[app], 10) + cells.join("") + (newest?.version ?? "—"));
  }
  const counted = CAPABILITIES.filter((c) => c.probe);
  const validated = counted.filter((c) => facts.some((f) => f.exercises.has(key(c))));
  const implemented = CAPABILITIES.filter(
    (c) => c.status === "read+write" || c.status === "read" || c.status === "experimental",
  );
  lines.push("");
  lines.push(
    `capabilities: ${implemented.length} implemented, ` +
      `${CAPABILITIES.filter((c) => c.status === "roadmap").length} roadmap, ` +
      `${CAPABILITIES.filter((c) => c.status === "out-of-scope").length} out of scope`,
  );
  lines.push(`validated:    ${validated.length}/${counted.length} probed capabilities have ≥1 fixture`);
  lines.push(`fixtures:     ${facts.length}`);
  return lines.join("\n");
}

const RISK_LABEL: Record<"high" | "medium" | "low", string> = {
  high: "🔴 high",
  medium: "🟠 medium",
  low: "🟡 low",
};

const RISK_ORDER: Record<"high" | "medium" | "low", number> = { high: 0, medium: 1, low: 2 };

/**
 * Render docs/VERIFICATION.md — every claim that needs a human and a Mac.
 *
 * Generated rather than hand-written for the same reason the coverage
 * matrix is: a hand-kept list of "things we should check some day" goes
 * stale the moment someone ships a feature and forgets to add a line. This
 * one is derived from `manualProof` declarations sitting next to the
 * capabilities they belong to, so it can only drift if the code does.
 */
function renderVerification(): string {
  const withProof = CAPABILITIES.filter((c) => c.manualProof);
  const settled = withProof
    .filter((c) => c.manualProof!.settled)
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)); // code-unit order: generated docs
  const pending = withProof
    .filter((c) => !c.manualProof!.settled)
    .sort(
    (a, b) =>
      RISK_ORDER[a.manualProof!.risk] - RISK_ORDER[b.manualProof!.risk] ||
      (a.group < b.group ? -1 : a.group > b.group ? 1 : 0) ||
        (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
  const out: string[] = [];
  out.push("# Claims we cannot prove offline");
  out.push("");
  out.push(
    "Everything in the test suite proves this library agrees with *its own reading* of Apple's",
    "files: that it decodes what the apps wrote and re-encodes it byte for byte. That is a real",
    "guarantee, and it is not the same as proving the apps accept something we invented.",
    "",
    "The claims below are the ones where the only authority is the application itself. Each says",
    "what is being claimed, why the offline suite structurally cannot settle it, and what would.",
    "",
    "**This file is generated.** Claims live in `manualProof` blocks beside their capability in",
    "`scripts/coverage-matrix.ts`; run `npm run coverage` to regenerate. A test fails if it goes stale.",
    "",
    "Where a claim can be settled by a *repeatable procedure* rather than a one-off look, that",
    "procedure lives in [`docs/BLOCKERS.md`](BLOCKERS.md) along with a ledger of what has",
    "actually been run and against which app version.",
    "",
  );

  const byE2E = pending.filter((c) => c.manualProof!.e2e);
  out.push("## How much is already automated");
  out.push("");
  out.push(
    `Of ${pending.length} claims, **${byE2E.length}** ${byE2E.length === 1 ? "is" : "are"} covered by ` +
      "`npm run test:e2e`, which drives the real apps through AppleScript on a Mac. The rest need a",
    "person to look at a rendered document, because the scripting dictionaries expose no way to ask.",
    "",
  );

  out.push("## The list");
  out.push("");
  out.push("| # | Risk | Capability | Claim | Automated? |");
  out.push("|---:|---|---|---|---|");
  pending.forEach((c, i) => {
    const proof = c.manualProof!;
    out.push(
      `| ${i + 1} | ${RISK_LABEL[proof.risk]} | ${c.group} → ${c.name} | ${vueSafe(proof.claim)} | ` +
        `${proof.e2e ? "`test:e2e`" : "manual"} |`,
    );
  });
  out.push("");

  for (const [i, c] of pending.entries()) {
    const proof = c.manualProof!;
    out.push(`### ${i + 1}. ${c.name}`);
    out.push("");
    out.push(`**Risk if wrong:** ${RISK_LABEL[proof.risk]}  `);
    out.push(`**Group:** ${c.group}  `);
    out.push(`**Status in the matrix:** ${STATUS_LABEL[c.status]}`);
    out.push("");
    out.push(`**Claim.** ${vueSafe(proof.claim)}`);
    out.push("");
    out.push(`**Why the suite cannot settle it.** ${vueSafe(proof.why)}`);
    out.push("");
    out.push(`**How to settle it.** ${vueSafe(proof.how)}`);
    out.push("");
    if (proof.e2e) {
      out.push("> Already exercised by `npm run test:e2e` on a Mac with the app installed.");
      out.push("");
    }
  }

  if (settled.length) {
    out.push("## Settled");
    out.push("");
    out.push(
      `${settled.length} claim${settled.length === 1 ? " has" : "s have"} been checked in the app` +
        " and moved off the list above. The reasoning is kept, because it is what makes the",
      "result mean something; what changed is that it is no longer a request.",
      "",
    );
    for (const c of settled) {
      const proof = c.manualProof!;
      out.push(`### ✅ ${c.name}`);
      out.push("");
      out.push(`**Was claimed.** ${vueSafe(proof.claim)}`);
      out.push("");
      out.push(`**Why it needed an app.** ${vueSafe(proof.why)}`);
      out.push("");
      out.push(`**Outcome.** ${vueSafe(proof.settled ?? "")}`);
      out.push("");
    }
  }

  out.push("## Recording an outcome");
  out.push("");
  out.push(
    "When a claim is checked by hand, do not delete its entry — add `settled:` to its `manualProof`",
    "block saying what was observed. The claim moves to the section above, keeping the reasoning that",
    "made it worth checking. If the check *fails*, that is a bug report with a reproduction already",
    "written.",
    "",
  );
  return out.join("\n");
}

function main(): void {
  const facts = surveyFixtures();
  const markdown = render(facts);
  const args = process.argv.slice(2);

  const verification = renderVerification();

  if (args.includes("--stdout")) {
    console.log(markdown);
    return;
  }
  if (args.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(OUTPUT, "utf8");
    } catch {
      /* missing counts as stale */
    }
    let currentVerification = "";
    try {
      currentVerification = readFileSync(VERIFICATION_OUTPUT, "utf8");
    } catch {
      /* missing counts as stale */
    }
    const stale = [
      current !== markdown ? "docs/COVERAGE.md" : undefined,
      currentVerification !== verification ? "docs/VERIFICATION.md" : undefined,
    ].filter(Boolean);
    if (stale.length > 0) {
      console.error(
        `${stale.join(" and ")} out of date with fixtures/ and the capability table.\n` +
          "Run: npm run coverage",
      );
      process.exit(1);
    }
    console.log("up to date");
    return;
  }
  writeFileSync(OUTPUT, markdown);
  writeFileSync(VERIFICATION_OUTPUT, verification);
  console.log(summarize(facts));
  console.log(`\nwrote ${fileURLToPath(OUTPUT)}`);
  console.log(`wrote ${fileURLToPath(VERIFICATION_OUTPUT)}`);
}

main();
