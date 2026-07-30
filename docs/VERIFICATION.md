# Claims we cannot prove offline

Everything in the test suite proves this library agrees with *its own reading* of Apple's
files: that it decodes what the apps wrote and re-encodes it byte for byte. That is a real
guarantee, and it is not the same as proving the apps accept something we invented.

The claims below are the ones where the only authority is the application itself. Each says
what is being claimed, why the offline suite structurally cannot settle it, and what would.

**This file is generated.** Claims live in `manualProof` blocks beside their capability in
`scripts/coverage-matrix.ts`; run `npm run coverage` to regenerate. A test fails if it goes stale.

Where a claim can be settled by a *repeatable procedure* rather than a one-off look, that
procedure lives in [`docs/MANUAL-WORK.md`](MANUAL-WORK.md) along with a ledger of what has
actually been run and against which app version.

## How much is already automated

Of 12 claims, **2** are covered by `npm run test:e2e`, which drives the real apps through AppleScript on a Mac. The rest need a
person to look at a rendered document, because the scripting dictionaries expose no way to ask.

## The list

| # | Risk | Capability | Claim | Automated? |
|---:|---|---|---|---|
| 1 | 🔴 high | Keynote → Slide management (add, duplicate, move, remove) | Keynote opens a deck we added, duplicated, moved or removed slides in, and shows them in order. | manual |
| 2 | 🔴 high | Numbers & tables → Cell styling (fill, four borders, padding, alignment, wrap) | A cell style we create is picked up by the app and rendered, and the style table stays consistent. | manual |
| 3 | 🔴 high | Numbers & tables → Table cell writing (text, number, date, bool, duration) | Numbers, Pages and Keynote open a package whose cells we rewrote, and display the values we wrote. | `test:e2e` |
| 4 | 🟠 medium | Numbers & tables → Formula function names | The function-index table is incomplete, and every unnamed id is visible rather than guessed. | `test:e2e` |
| 5 | 🟠 medium | Numbers & tables → Formula reading (AST rendered to text) | Rendered formula text matches what the app shows in its formula bar. | manual |
| 6 | 🟠 medium | Numbers & tables → Merged cell ranges | The merge rectangles we decode from the merge-owner formula store match what the app displays. | manual |
| 7 | 🟠 medium | Numbers & tables → Table structure (rows, columns, bands, sizes, freeze, repeat) | Changed band counts, freeze and repeating-header flags, row heights and column widths take effect. | manual |
| 8 | 🟠 medium | Numbers & tables → Table styling (banded rows, grid strokes, visibility) | Banded rows, grid strokes and the visibility toggles render as set. | manual |
| 9 | 🟠 medium | Text & styles → Paragraph background & borders (rule stroke + positions) | border_positions 0/1/2/3/4 means none / top / bottom / top and bottom / all. | manual |
| 10 | 🟡 low | Drawables & media → Drawable shadows (enabled, angle, offset, blur, opacity) | A shadow we enable or re-parameterise renders in the app with the geometry we set. | manual |
| 11 | 🟡 low | Text & styles → Character properties (font, colour, highlight, underline, strike, caps, shadow…) | Clearing a property by writing its *_null flag reads as 'none', not as 'inherit'. | manual |
| 12 | 🟡 low | Text & styles → Shared style values (colour incl. P3, gradients, strokes, shadows, padding) | A Display-P3 colour we write renders as P3, and a dashed stroke renders with our dash lengths. | manual |

### 1. Slide management (add, duplicate, move, remove)

**Risk if wrong:** 🔴 high  
**Group:** Keynote  
**Status in the matrix:** ✅ read + write

**Claim.** Keynote opens a deck we added, duplicated, moved or removed slides in, and shows them in order.

**Why the suite cannot settle it.** A slide is only as valid as the graph around it — placeholders, builds, the master reference. Our copies reload through this library and keep the package round-trippable, but whether Keynote considers the result a well-formed slide is its call, not ours.

**How to settle it.** Add and duplicate a slide, reorder, save, and open in Keynote: check the navigator order, that the new slide is blank on the right layout, and that editing the duplicate leaves the original alone.

### 2. Cell styling (fill, four borders, padding, alignment, wrap)

**Risk if wrong:** 🔴 high  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** A cell style we create is picked up by the app and rendered, and the style table stays consistent.

**Why the suite cannot settle it.** We add a TST.CellStyleArchive and a style-table entry, then point the cell record at the new key. Nothing offline proves the app resolves that key, nor that cloning a style without its name and identifier is acceptable. The scripting dictionary exposes no cell formatting, so even e2e cannot assert it.

**How to settle it.** Write a fill, four borders, padding and vertical alignment into a cell, open in Numbers, and compare against the same formatting applied by hand in the inspector. Then re-save from the app and diff our style object against what Numbers rewrote.

### 3. Table cell writing (text, number, date, bool, duration)

**Risk if wrong:** 🔴 high  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** Numbers, Pages and Keynote open a package whose cells we rewrote, and display the values we wrote.

**Why the suite cannot settle it.** Every offline check is self-referential: our encoder round-trips through our decoder. Apple's reader is the only authority on whether the rebuilt row buffers, offset array, cell counts and legacy stubs are all acceptable together.

**How to settle it.** npm run test:e2e on a Mac — 'writes cells that Numbers itself reads back' asserts the app reports our text and number. Then open the file by hand and check the edited cells look normal (no red triangle, no reformatting) and that undo/redo behaves.

> Already exercised by `npm run test:e2e` on a Mac with the app installed.

### 4. Formula function names

**Risk if wrong:** 🟠 medium  
**Group:** Numbers & tables  
**Status in the matrix:** ⚠️ experimental

**Claim.** The function-index table is incomplete, and every unnamed id is visible rather than guessed.

**Why the suite cannot settle it.** AST_function_node_index is an index into an Apple-internal list that appears in no public schema. The corpus proves exactly one entry (168 = SUM, by arithmetic). Shipping a table of plausible-looking guesses would turn a visible gap into silent wrong answers.

**How to settle it.** Run `node scripts/harvest-functions.ts --drive` on a Mac — it writes ~300 candidate functions through Numbers and reads every index back in one pass, producing data/function-index.json and a generated table. Without a Mac to hand, `--emit-sheet` produces a file to open and save in Numbers by hand, then `--ingest`. Protocol 1 in docs/MANUAL-WORK.md.

> Already exercised by `npm run test:e2e` on a Mac with the app installed.

### 5. Formula reading (AST rendered to text)

**Risk if wrong:** 🟠 medium  
**Group:** Numbers & tables  
**Status in the matrix:** 🔍 read only

**Claim.** Rendered formula text matches what the app shows in its formula bar.

**Why the suite cannot settle it.** Operators, references and ranges are decoded structurally and check out against cached values, but the archive records no brackets and no function names, so the rendering is a reconstruction. Only the app can confirm the reconstruction reads the same.

**How to settle it.** Open libetonyek-pages5-extra-dir.pages in Pages and numbers-parser-v14.4-issue102.numbers in Numbers, click the formula cells, and compare the formula bar with cellFormula(). Expect =B2*C2 and =SUM(C3:K6).

### 6. Merged cell ranges

**Risk if wrong:** 🟠 medium  
**Group:** Numbers & tables  
**Status in the matrix:** 🔍 read only

**Claim.** The merge rectangles we decode from the merge-owner formula store match what the app displays.

**Why the suite cannot settle it.** Decoding is validated only by internal consistency: anchors hold values, covered cells never do, and both format eras of the same document agree. That is strong evidence, not proof — no fixture carries a merge_region_map to cross-check against, and no scripting API reports merges.

**How to settle it.** Open iwork-mcp-v14.5-earnings.numbers and numbers-parser-v26.0-issue102.numbers in Numbers and confirm the merges match what merges() reports (Key Metrics: rows 0 and 1 span all 4 columns; Cats: r0c2 8 wide, r2c0 4 tall, r6c0 2 wide, r6c2 9 wide).

### 7. Table structure (rows, columns, bands, sizes, freeze, repeat)

**Risk if wrong:** 🟠 medium  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** Changed band counts, freeze and repeating-header flags, row heights and column widths take effect.

**Why the suite cannot settle it.** These are presentation fields the offline suite can only verify it wrote and can read back. Whether the app agrees a header count is legal for a given table — and whether frozen or repeating headers need companion state we are not writing — only the app can say.

**How to settle it.** Set headerRows/footerRows plus freezeHeaderRows and repeatHeaderRows, open in Numbers, and check the header/footer controls in the inspector show what we set and that scrolling freezes correctly. For repeating headers, print to PDF from Pages and confirm the header repeats on page 2.

### 8. Table styling (banded rows, grid strokes, visibility)

**Risk if wrong:** 🟠 medium  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** Banded rows, grid strokes and the visibility toggles render as set.

**Why the suite cannot settle it.** TableStylePropertiesArchive has separate strokes for the body grid and the outer border plus a set of visibility booleans; which combination the app honours for a given theme is a rendering question no archive inspection answers. Our 'body border' setter writes both the horizontal and vertical border strokes on the assumption the inspector's single control does the same.

**How to settle it.** Set bandedRows with a banded fill and a body grid stroke, open in Numbers, and compare against the same settings applied through the Table inspector on an untouched copy.

### 9. Paragraph background & borders (rule stroke + positions)

**Risk if wrong:** 🟠 medium  
**Group:** Text & styles  
**Status in the matrix:** ✅ read + write

**Claim.** border_positions 0/1/2/3/4 means none / top / bottom / top and bottom / all.

**Why the suite cannot settle it.** The mapping is inferred, not observed. It fits three independent constraints — the field is a plain int32 rather than a set, the deprecated enum it replaced packs a position in 0..4 beside a line style, and the Pages inspector offers exactly five choices — but every value in the corpus is 0, 1 or 2, so 3 and 4 are unconfirmed and even 1-vs-2 could be inverted.

**How to settle it.** Set borderPositions to each of 1..4 on a paragraph with a thick coloured rule, open in Pages, and read the Borders & Rules control. Ten minutes settles the whole mapping.

### 10. Drawable shadows (enabled, angle, offset, blur, opacity)

**Risk if wrong:** 🟡 low  
**Group:** Drawables & media  
**Status in the matrix:** ✅ read + write

**Claim.** A shadow we enable or re-parameterise renders in the app with the geometry we set.

**Why the suite cannot settle it.** Angle, offset and blur radius are rendering parameters. Fixtures prove we read Apple's values correctly and re-encode them identically, but not that a shadow we author from scratch on a shape that had none is picked up rather than ignored.

**How to settle it.** Enable a shadow at angle 90, offset 10, radius 20 on a shape, open in Keynote or Pages, and compare with the Shadow section of the Style inspector.

### 11. Character properties (font, colour, highlight, underline, strike, caps, shadow…)

**Risk if wrong:** 🟡 low  
**Group:** Text & styles  
**Status in the matrix:** ✅ read + write

**Claim.** Clearing a property by writing its *_null flag reads as 'none', not as 'inherit'.

**Why the suite cannot settle it.** We infer that a set *_null flag with the value absent means an explicit clear. Fixtures show the encoding but never disambiguate it from plain absence, because both render the same whenever the parent sets nothing either.

**How to settle it.** Create a style with a font colour, derive a child, clear the colour on the child, open in Pages and confirm the child shows the default colour rather than inheriting the parent's.

### 12. Shared style values (colour incl. P3, gradients, strokes, shadows, padding)

**Risk if wrong:** 🟡 low  
**Group:** Text & styles  
**Status in the matrix:** ✅ read + write

**Claim.** A Display-P3 colour we write renders as P3, and a dashed stroke renders with our dash lengths.

**Why the suite cannot settle it.** Colour space and dash patterns are rendering behaviour. We know 26.x files tag colours with rgbspace and that the dash array is repeated float, but not that a colour we author with space: 'p3' is treated as wide-gamut rather than reinterpreted.

**How to settle it.** Write a saturated P3 green and the same values as sRGB side by side, open on a P3 display, and confirm they differ. For dashes, write [4, 2] and compare against a 4/2 dash set in the inspector.

## Recording an outcome

When a claim is checked by hand, do not delete its entry — replace the `manualProof` block with
a `note` recording what was observed, so the finding survives in the matrix. If the check *fails*,
that is a bug report with a reproduction already written.
