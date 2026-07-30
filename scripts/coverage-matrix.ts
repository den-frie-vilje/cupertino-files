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

/** Never let one malformed document abort the whole survey. */
const safe = (fn: () => boolean): boolean => {
  try {
    return fn();
  } catch {
    return false;
  }
};

const CAPABILITIES: Capability[] = [
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
    name: "Mixed-codec packages (LZFSE component beside Snappy)",
    apps: "all",
    status: "read",
    probe: (c) => c.report.probe.opaqueComponents.length > 0,
    note: "undecodable components stay opaque and are preserved, never fatal",
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
    note: "border_positions semantics inferred, not proven by rendering",
    manualProof: {
      claim: "border_positions 0/1/2/3/4 means none / top / bottom / top and bottom / all.",
      why:
        "The mapping is inferred, not observed. It fits three independent constraints — the field is a " +
        "plain int32 rather than a set, the deprecated enum it replaced packs a position in 0..4 beside a " +
        "line style, and the Pages inspector offers exactly five choices — but every value in the corpus " +
        "is 0, 1 or 2, so 3 and 4 are unconfirmed and even 1-vs-2 could be inverted.",
      how:
        "Set borderPositions to each of 1..4 on a paragraph with a thick coloured rule, open in Pages, and " +
        "read the Borders & Rules control. Ten minutes settles the whole mapping.",
      risk: "medium",
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
    probe: (c) => safe(() => c.doc.textStorages().some((s) => s.links().length > 0)),
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
    name: "Bookmarks",
    apps: "all",
    status: "read",
    probe: (c) => safe(() => c.doc.textStorages().some((s) => s.bookmarks().length > 0)),
  },
  {
    group: "Text & styles",
    name: "Footnotes / endnotes",
    apps: ["pages"],
    status: "read",
    probe: (c) => safe(() => c.doc.textStorages().some((s) => s.footnotes().length > 0)),
    note: "creating footnotes is not implemented",
  },
  {
    group: "Text & styles",
    name: "Comments",
    apps: "all",
    status: "read",
    probe: (c) => safe(() => c.doc.textStorages().some((s) => s.comments().length > 0)),
    note: "creating comments is not implemented",
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
    name: "Table of contents",
    apps: ["pages"],
    status: "roadmap",
  },

  // --------------------------------------------------------------- drawables
  {
    group: "Drawables & media",
    name: "Drawable style (fill, stroke, opacity, shadow, reflection)",
    apps: "all",
    status: "read+write",
    probe: (c) => safe(() => drawableStylesOf(c.doc.store).some((h) => h.read().stroke !== undefined)),
    note: "where shadows live — cell and table styles have no shadow field at all",
  },
  {
    group: "Drawables & media",
    name: "Drawable shadows (enabled, angle, offset, blur, opacity)",
    apps: "all",
    status: "read+write",
    probe: (c) => safe(() => drawableStylesOf(c.doc.store).some((h) => h.read().shadow?.enabled === true)),
    manualProof: {
      claim: "A shadow we enable or re-parameterise renders in the app with the geometry we set.",
      why:
        "Angle, offset and blur radius are rendering parameters. Fixtures prove we read Apple's values " +
        "correctly and re-encode them identically, but not that a shadow we author from scratch on a " +
        "shape that had none is picked up rather than ignored.",
      how:
        "Enable a shadow at angle 90, offset 10, radius 20 on a shape, open in Keynote or Pages, and " +
        "compare with the Shadow section of the Style inspector.",
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
    name: "Image masks",
    apps: "all",
    status: "read",
    probe: (c) => safe(() => c.doc.images().some((i) => i.hasMask)),
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
    status: "experimental",
    note: "Data/ plumbing with SHA-1 dedupe; not verified in the app",
  },
  {
    group: "Drawables & media",
    name: "Floating (non-inline) image placement",
    apps: ["pages"],
    status: "roadmap",
  },

  // ------------------------------------------------------------------- pages
  {
    group: "Pages",
    name: "Sections (read + insert)",
    apps: ["pages"],
    status: "read+write",
    probe: (c) => safe(() => (c.pages?.sections().length ?? 0) > 1),
    note: "validation counts multi-section documents only",
  },
  {
    group: "Pages",
    name: "Headers & footers (3 columns × first/even/odd)",
    apps: ["pages"],
    status: "read+write",
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
    name: "Sheets",
    apps: ["numbers"],
    status: "read",
    probe: (c) => safe(() => (c.numbers?.sheets().length ?? 0) > 0),
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
    name: "Table cell reading — pre-BNC storage",
    apps: "all",
    status: "out-of-scope",
    probe: (c) => c.report.probe.cellStorage === "preBNC",
    note: "undocumented layout; reported explicitly, never guessed",
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
      risk: "high",
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
    status: "read",
    probe: (c) => safe(() => c.doc.tables().some((t) => t.merges().length > 0)),
    note: "writing a merge needs calc-engine owner bookkeeping",
    manualProof: {
      claim: "The merge rectangles we decode from the merge-owner formula store match what the app displays.",
      why:
        "Decoding is validated only by internal consistency: anchors hold values, covered cells never do, " +
        "and both format eras of the same document agree. That is strong evidence, not proof — no fixture " +
        "carries a merge_region_map to cross-check against, and no scripting API reports merges.",
      how:
        "Open iwork-mcp-v14.5-earnings.numbers and numbers-parser-v26.0-issue102.numbers in Numbers and " +
        "confirm the merges match what merges() reports (Key Metrics: rows 0 and 1 span all 4 columns; " +
        "Cats: r0c2 8 wide, r2c0 4 tall, r6c0 2 wide, r6c2 9 wide).",
      risk: "medium",
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
        "in Numbers by hand, then `--ingest`. Protocol 1 in docs/MANUAL-WORK.md.",
      e2e: true,
      risk: "medium",
    },
  },
  {
    group: "Numbers & tables",
    name: "Formula writing (authoring an AST)",
    apps: "all",
    status: "roadmap",
    note: "needs a function-name table plus calc-engine dependency records; writing a literal correctly clears an existing formula",
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
    name: "Chart writing",
    apps: "all",
    status: "roadmap",
  },

  // ----------------------------------------------------------------- keynote
  {
    group: "Keynote",
    name: "Slide tree (both generations, presentation order)",
    apps: ["keynote"],
    status: "read",
    probe: (c) => safe(() => (c.keynote?.slideCount() ?? 0) > 0),
  },
  {
    group: "Keynote",
    name: "Speaker notes",
    apps: ["keynote"],
    status: "read+write",
    probe: (c) => safe(() => c.keynote?.slides().some((s) => s.notes.trim().length > 0) ?? false),
  },
  {
    group: "Keynote",
    name: "Transitions",
    apps: ["keynote"],
    status: "read+write",
    probe: (c) => safe(() => c.keynote?.slides().some((s) => s.transition()?.enabled) ?? false),
    note: "validation requires a deck with a non-'none' effect",
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
    name: "Builds (animations)",
    apps: ["keynote"],
    status: "roadmap",
    note: "build count is exposed; the model is not",
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
        capability.apps === "all" ? APPS : (capability.apps as IWorkApp[]);
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
      const note = capability.note ? `<br><sub>${capability.note}</sub>` : "";
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
  const pending = CAPABILITIES.filter((c) => c.manualProof).sort(
    (a, b) =>
      RISK_ORDER[a.manualProof!.risk] - RISK_ORDER[b.manualProof!.risk] ||
      a.group.localeCompare(b.group) ||
      a.name.localeCompare(b.name),
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
    "procedure lives in [`docs/MANUAL-WORK.md`](MANUAL-WORK.md) along with a ledger of what has",
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
      `| ${i + 1} | ${RISK_LABEL[proof.risk]} | ${c.group} → ${c.name} | ${proof.claim} | ` +
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
    out.push(`**Claim.** ${proof.claim}`);
    out.push("");
    out.push(`**Why the suite cannot settle it.** ${proof.why}`);
    out.push("");
    out.push(`**How to settle it.** ${proof.how}`);
    out.push("");
    if (proof.e2e) {
      out.push("> Already exercised by `npm run test:e2e` on a Mac with the app installed.");
      out.push("");
    }
  }

  out.push("## Recording an outcome");
  out.push("");
  out.push(
    "When a claim is checked by hand, do not delete its entry — replace the `manualProof` block with",
    "a `note` recording what was observed, so the finding survives in the matrix. If the check *fails*,",
    "that is a bug report with a reproduction already written.",
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
