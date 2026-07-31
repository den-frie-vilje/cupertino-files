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

Of 31 claims, **3** are covered by `npm run test:e2e`, which drives the real apps through AppleScript on a Mac. The rest need a
person to look at a rendered document, because the scripting dictionaries expose no way to ask.

## The list

| # | Risk | Capability | Claim | Automated? |
|---:|---|---|---|---|
| 1 | 🔴 high | Container → Edit cycle: open → edit → save → reopen | Pages, Numbers and Keynote open a document this library has edited and saved. | `test:e2e` |
| 2 | 🔴 high | Drawables & media → Placement (copy onto a page/slide/sheet, remove, reorder in z) | A drawable we copied onto another page/slide/sheet appears there, at the geometry we set. | manual |
| 3 | 🔴 high | Keynote → Builds (animations): read and retime | the build model reads a real animation correctly | manual |
| 4 | 🔴 high | Keynote → Slide management (add, duplicate, move, remove) | Keynote opens a deck we added, duplicated, moved or removed slides in, and shows them in order. | manual |
| 5 | 🔴 high | Numbers & tables → Cell styling (fill, four borders, padding, alignment, wrap) | A cell style we create is picked up by the app and rendered, and the style table stays consistent. | manual |
| 6 | 🔴 high | Numbers & tables → Formula writing (authoring an AST) | Numbers computes what a formula we authored says, and does not report it as damaged. | manual |
| 7 | 🔴 high | Numbers & tables → Sheets (add, duplicate, rename, move, remove) | Numbers opens a document whose sheets we added, duplicated, renamed or reordered. | manual |
| 8 | 🔴 high | Numbers & tables → Table cell writing (text, number, date, bool, duration) | Numbers, Pages and Keynote open a package whose cells we rewrote, and display the values we wrote. | `test:e2e` |
| 9 | 🟠 medium | Drawables & media → Floating (non-inline) drawable placement | a drawable copied into a page's floating list is placed and rendered by Pages | manual |
| 10 | 🟠 medium | Drawables & media → Image cropping (set, move, remove a mask) | a mask this library writes crops the way Apple's does | manual |
| 11 | 🟠 medium | Numbers & tables → Add and remove tables on a sheet | a table added this way is editable in Numbers as a table, not just present in the file | manual |
| 12 | 🟠 medium | Numbers & tables → Cell controls (checkbox, star rating, slider, stepper, pop-up menu) | interaction_type 4 is the stepper and 5 the slider, rather than the other way round | manual |
| 13 | 🟠 medium | Numbers & tables → Cell display formats (number, currency, percentage, date, duration, text, boolean) | A format we write makes Numbers display the value the way the inspector would. | manual |
| 14 | 🟠 medium | Numbers & tables → Chart data editing (values, names, series, categories) | a series added or removed here leaves the chart's styling on the right series | manual |
| 15 | 🟠 medium | Numbers & tables → Conditional formatting: apply an existing rule set to more cells | re-pointing a cell's conditional-style key makes Numbers apply that rule set to it | manual |
| 16 | 🟠 medium | Numbers & tables → Filters: enable, disable, combining mode | enabling a filter set makes Numbers apply its rules | manual |
| 17 | 🟠 medium | Numbers & tables → Formula function names | The function-index table is incomplete, and every unnamed id is visible rather than guessed. | `test:e2e` |
| 18 | 🟠 medium | Numbers & tables → Formula reading (AST rendered to text) | Rendered formula text matches what the app shows in its formula bar. | manual |
| 19 | 🟠 medium | Numbers & tables → Merged cell ranges | Numbers accepts a merge this library wrote, and shows it where we put it. | manual |
| 20 | 🟠 medium | Numbers & tables → Table structure (rows, columns, bands, sizes, freeze, repeat) | Changed band counts, freeze and repeating-header flags, row heights and column widths take effect. | manual |
| 21 | 🟠 medium | Numbers & tables → Table styling (banded rows, grid strokes, visibility) | Banded rows, grid strokes and the visibility toggles render as set. | manual |
| 22 | 🟠 medium | Text & styles → Comment creation and removal | a comment this library creates appears in the app's comment pane, attributed correctly | manual |
| 23 | 🟠 medium | Text & styles → Footnote creation and removal | a footnote this library creates is numbered and laid out by Pages | manual |
| 24 | 🟠 medium | Text & styles → Page numbers and page counts (insert, read, remove) | a page-number attachment this library inserts renders as a live number | manual |
| 25 | 🟠 medium | Text & styles → Paragraph background & borders (rule stroke + positions) | border_positions 0/1/2/3/4 means none / top / bottom / top and bottom / all. | manual |
| 26 | 🟡 low | Drawables & media → Drawable shadows (enabled, angle, offset, blur, opacity) | A shadow we enable or re-parameterise renders in the app with the geometry we set. | manual |
| 27 | 🟡 low | Numbers & tables → Categories: enable or disable grouping | flipping is_enabled makes Numbers group or ungroup the rows | manual |
| 28 | 🟡 low | Numbers & tables → Conditional formatting rules | the second conditional id in a cell record (COND_RULE_STYLE_ID) is a cache the app rewrites, so preserving it verbatim is enough | manual |
| 29 | 🟡 low | Text & styles → Character properties (font, colour, highlight, underline, strike, caps, shadow…) | Clearing a property by writing its *_null flag reads as 'none', not as 'inherit'. | manual |
| 30 | 🟡 low | Text & styles → Shared style values (colour incl. P3, gradients, strokes, shadows, padding) | A Display-P3 colour we write renders as P3, and a dashed stroke renders with our dash lengths. | manual |
| 31 | 🟡 low | Text & styles → Table of contents (rules read + write, cached entries read) | Pages regenerates a TOC whose collection rules we changed, and honours the new rule set. | manual |

### 1. Edit cycle: open → edit → save → reopen

**Risk if wrong:** 🔴 high  
**Group:** Container  
**Status in the matrix:** ✅ read + write

**Claim.** Pages, Numbers and Keynote open a document this library has edited and saved.

**Why the suite cannot settle it.** The offline suite proves self-consistency: we read back what we wrote. Only the apps can say whether they accept it.

**How to settle it.** npm run test:e2e on a Mac opens each edited document in its app.

> Already exercised by `npm run test:e2e` on a Mac with the app installed.

### 2. Placement (copy onto a page/slide/sheet, remove, reorder in z)

**Risk if wrong:** 🔴 high  
**Group:** Drawables & media  
**Status in the matrix:** ✅ read + write

**Claim.** A drawable we copied onto another page/slide/sheet appears there, at the geometry we set.

**Why the suite cannot settle it.** The three apps store the list differently — two lists in Keynote, one in Numbers, per-page wrapped entries in Pages — and each app decides for itself whether an object it owns is renderable. Reloading through this library proves the wiring, not the rendering.

**How to settle it.** Copy a shape to another slide and a table to another sheet, save, and open both apps: the object should appear where placed, be selectable, and editing it should not change the original.

### 3. Builds (animations): read and retime

**Risk if wrong:** 🔴 high  
**Group:** Keynote  
**Status in the matrix:** 🔍 read only

**Claim.** the build model reads a real animation correctly

**Why the suite cannot settle it.** not one of the eight decks in the corpus, spanning 2013 to 26.1, contains an animation

**How to settle it.** a three-slide deck with a different effect on each and one text build delivered by line, then `npm run probe -- animated.key`

### 4. Slide management (add, duplicate, move, remove)

**Risk if wrong:** 🔴 high  
**Group:** Keynote  
**Status in the matrix:** ✅ read + write

**Claim.** Keynote opens a deck we added, duplicated, moved or removed slides in, and shows them in order.

**Why the suite cannot settle it.** A slide is only as valid as the graph around it — placeholders, builds, the master reference. Our copies reload through this library and keep the package round-trippable, but whether Keynote considers the result a well-formed slide is its call, not ours.

**How to settle it.** Add and duplicate a slide, reorder, save, and open in Keynote: check the navigator order, that the new slide is blank on the right layout, and that editing the duplicate leaves the original alone.

### 5. Cell styling (fill, four borders, padding, alignment, wrap)

**Risk if wrong:** 🔴 high  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** A cell style we create is picked up by the app and rendered, and the style table stays consistent.

**Why the suite cannot settle it.** We add a TST.CellStyleArchive and a style-table entry, then point the cell record at the new key. Nothing offline proves the app resolves that key, nor that cloning a style without its name and identifier is acceptable. The scripting dictionary exposes no cell formatting, so even e2e cannot assert it.

**How to settle it.** Write a fill, four borders, padding and vertical alignment into a cell, open in Numbers, and compare against the same formatting applied by hand in the inspector. Then re-save from the app and diff our style object against what Numbers rewrote.

### 6. Formula writing (authoring an AST)

**Risk if wrong:** 🔴 high  
**Group:** Numbers & tables  
**Status in the matrix:** ⚠️ experimental

**Claim.** Numbers computes what a formula we authored says, and does not report it as damaged.

**Why the suite cannot settle it.** Round-tripping proves the writer and the renderer agree, which is real evidence but not the engine's opinion. Nothing offline can say whether the engine wants dependency records beside the AST that we are not writing.

**How to settle it.** setFormula a few shapes — an arithmetic expression, a range SUM, an anchored reference — save, open in Numbers, and check the values recompute rather than showing an error.

### 7. Sheets (add, duplicate, rename, move, remove)

**Risk if wrong:** 🔴 high  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** Numbers opens a document whose sheets we added, duplicated, renamed or reordered.

**Why the suite cannot settle it.** A sheet is valid only in the context of the calc engine and the document's own bookkeeping. Our copies reload and round-trip, but whether Numbers accepts a duplicated tab — and whether its formulas still resolve against the copy rather than the original — only the app can say.

**How to settle it.** Duplicate a sheet with formulas, rename and reorder, save, and open in Numbers: check the tab bar, that the copy's formulas point within the copy, and that editing one tab leaves the other alone.

### 8. Table cell writing (text, number, date, bool, duration)

**Risk if wrong:** 🔴 high  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** Numbers, Pages and Keynote open a package whose cells we rewrote, and display the values we wrote.

**Why the suite cannot settle it.** Every offline check is self-referential: our encoder round-trips through our decoder. Apple's reader is the only authority on whether the rebuilt row buffers, offset array, cell counts and legacy stubs are all acceptable together.

**How to settle it.** npm run test:e2e on a Mac — 'writes cells that Numbers itself reads back' asserts the app reports our text and number. Then open the file by hand and check the edited cells look normal (no red triangle, no reformatting) and that undo/redo behaves.

> Already exercised by `npm run test:e2e` on a Mac with the app installed.

### 9. Floating (non-inline) drawable placement

**Risk if wrong:** 🟠 medium  
**Group:** Drawables & media  
**Status in the matrix:** ✅ read + write

**Claim.** a drawable copied into a page's floating list is placed and rendered by Pages

**Why the suite cannot settle it.** the suite proves the copy resolves, keeps its media and survives a save, not that the app lays it out

**How to settle it.** copy an image onto a page at a known position, open in Pages, and confirm it appears there and is independently editable from its source

### 10. Image cropping (set, move, remove a mask)

**Risk if wrong:** 🟠 medium  
**Group:** Drawables & media  
**Status in the matrix:** ✅ read + write

**Claim.** a mask this library writes crops the way Apple's does

**Why the suite cannot settle it.** the crop is a rendering result; the suite proves the geometry and path round-trip, not what appears on the page

**How to settle it.** crop an image to a known rectangle, open in Pages, and confirm the visible region matches — then drag the image inside the mask and re-read to check the window is where this library says

### 11. Add and remove tables on a sheet

**Risk if wrong:** 🟠 medium  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** a table added this way is editable in Numbers as a table, not just present in the file

**Why the suite cannot settle it.** the suite proves it reloads with its own cells and a unique name, not that the app treats it as a first-class table

**How to settle it.** add a blank table, open in Numbers, type into it and reference it from a formula on another table

### 12. Cell controls (checkbox, star rating, slider, stepper, pop-up menu)

**Risk if wrong:** 🟠 medium  
**Group:** Numbers & tables  
**Status in the matrix:** ⚠️ experimental

**Claim.** interaction_type 4 is the stepper and 5 the slider, rather than the other way round

**Why the suite cannot settle it.** the other three widgets identify themselves — a checkbox row holds FALSE/TRUE, a star row is bounded [0…5], a pop-up carries a chooser model. Stepper and slider store the identical field set, so nothing in a file separates them. The pairing rests on one slider whose bounds match a published test, plus elimination.

**How to settle it.** a Numbers file with one slider and one stepper, then `npm run probe -- controls.numbers`: if 4 and 5 come out swapped against the column they are in, the names are wrong.

### 13. Cell display formats (number, currency, percentage, date, duration, text, boolean)

**Risk if wrong:** 🟠 medium  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** A format we write makes Numbers display the value the way the inspector would.

**Why the suite cannot settle it.** The type codes were established by correlating every format in the corpus against the flag that referenced it — strong evidence for the categories, but rendering is still the app's.

**How to settle it.** Write a currency, percentage and date format, open in Numbers, and compare each cell against the same format applied through the Cell inspector on an untouched copy.

### 14. Chart data editing (values, names, series, categories)

**Risk if wrong:** 🟠 medium  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** a series added or removed here leaves the chart's styling on the right series

**Why the suite cannot settle it.** styling is applied at render time from arrays indexed by series position; the suite proves the indexes shift, not what the app draws

**How to settle it.** take a chart with distinctly coloured series, remove the middle one, open in the app and confirm the remaining series keep their own colours rather than shifting

### 15. Conditional formatting: apply an existing rule set to more cells

**Risk if wrong:** 🟠 medium  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** re-pointing a cell's conditional-style key makes Numbers apply that rule set to it

**Why the suite cannot settle it.** the fixture suite proves the key changes and the file reloads, not that the app honours it — evaluation happens in the calc engine

**How to settle it.** open a document with two conditional rules, move a cell onto the other set with setConditionalStyleKey, open in Numbers and confirm the cell picks up the second rule's styling

### 16. Filters: enable, disable, combining mode

**Risk if wrong:** 🟠 medium  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** enabling a filter set makes Numbers apply its rules

**Why the suite cannot settle it.** no fixture has a populated filter set, so the suite can only prove an empty one round-trips with the flag flipped

**How to settle it.** build a Numbers table with a filter rule, save, flip is_enabled with this library, reopen and confirm the row visibility changes

### 17. Formula function names

**Risk if wrong:** 🟠 medium  
**Group:** Numbers & tables  
**Status in the matrix:** ⚠️ experimental

**Claim.** The function-index table is incomplete, and every unnamed id is visible rather than guessed.

**Why the suite cannot settle it.** AST_function_node_index is an index into an Apple-internal list that appears in no public schema. The corpus proves exactly one entry (168 = SUM, by arithmetic). Shipping a table of plausible-looking guesses would turn a visible gap into silent wrong answers.

**How to settle it.** Run `node scripts/harvest-functions.ts --drive` on a Mac — it writes ~300 candidate functions through Numbers and reads every index back in one pass, producing data/function-index.json and a generated table. Without a Mac to hand, `--emit-sheet` produces a file to open and save in Numbers by hand, then `--ingest`. Protocol 1 in docs/MANUAL-WORK.md.

> Already exercised by `npm run test:e2e` on a Mac with the app installed.

### 18. Formula reading (AST rendered to text)

**Risk if wrong:** 🟠 medium  
**Group:** Numbers & tables  
**Status in the matrix:** 🔍 read only

**Claim.** Rendered formula text matches what the app shows in its formula bar.

**Why the suite cannot settle it.** Operators, references and ranges are decoded structurally and check out against cached values, but the archive records no brackets and no function names, so the rendering is a reconstruction. Only the app can confirm the reconstruction reads the same.

**How to settle it.** Open libetonyek-pages5-extra-dir.pages in Pages and numbers-parser-v14.4-issue102.numbers in Numbers, click the formula cells, and compare the formula bar with cellFormula(). Expect =B2*C2 and =SUM(C3:K6).

### 19. Merged cell ranges

**Risk if wrong:** 🟠 medium  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** Numbers accepts a merge this library wrote, and shows it where we put it.

**Why the suite cannot settle it.** The bytes we write match Apple's exactly for the same rectangle, which is the strongest offline evidence available — but byte equality of one node is not the same as the engine accepting the document, and no scripting API reports merges.

**How to settle it.** Merge a rectangle with mergeCells, save, and open in Numbers. Reading is separately checkable: open iwork-mcp-v14.5-earnings.numbers and confirm merges() matches (Key Metrics: rows 0 and 1 span all 4 columns).

### 20. Table structure (rows, columns, bands, sizes, freeze, repeat)

**Risk if wrong:** 🟠 medium  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** Changed band counts, freeze and repeating-header flags, row heights and column widths take effect.

**Why the suite cannot settle it.** These are presentation fields the offline suite can only verify it wrote and can read back. Whether the app agrees a header count is legal for a given table — and whether frozen or repeating headers need companion state we are not writing — only the app can say.

**How to settle it.** Set headerRows/footerRows plus freezeHeaderRows and repeatHeaderRows, open in Numbers, and check the header/footer controls in the inspector show what we set and that scrolling freezes correctly. For repeating headers, print to PDF from Pages and confirm the header repeats on page 2.

### 21. Table styling (banded rows, grid strokes, visibility)

**Risk if wrong:** 🟠 medium  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** Banded rows, grid strokes and the visibility toggles render as set.

**Why the suite cannot settle it.** TableStylePropertiesArchive has separate strokes for the body grid and the outer border plus a set of visibility booleans; which combination the app honours for a given theme is a rendering question no archive inspection answers. Our 'body border' setter writes both the horizontal and vertical border strokes on the assumption the inspector's single control does the same.

**How to settle it.** Set bandedRows with a banded fill and a body grid stroke, open in Numbers, and compare against the same settings applied through the Table inspector on an untouched copy.

### 22. Comment creation and removal

**Risk if wrong:** 🟠 medium  
**Group:** Text & styles  
**Status in the matrix:** ✅ read + write

**Claim.** a comment this library creates appears in the app's comment pane, attributed correctly

**Why the suite cannot settle it.** the suite proves the three archives and the highlight run round-trip, not that the app renders them as a comment

**How to settle it.** add a comment, open in Pages, and confirm it shows in the sidebar with the right author, date and highlighted range

### 23. Footnote creation and removal

**Risk if wrong:** 🟠 medium  
**Group:** Text & styles  
**Status in the matrix:** ✅ read + write

**Claim.** a footnote this library creates is numbered and laid out by Pages

**Why the suite cannot settle it.** numbering depends on how many footnotes precede it and on the document's footnote settings, both resolved during layout

**How to settle it.** add footnotes at two positions, open in Pages, and confirm they number in document order and render at the page foot

### 24. Page numbers and page counts (insert, read, remove)

**Risk if wrong:** 🟠 medium  
**Group:** Text & styles  
**Status in the matrix:** ✅ read + write

**Claim.** a page-number attachment this library inserts renders as a live number

**Why the suite cannot settle it.** the value comes from pagination, which nothing here performs — the suite proves the archive and anchor round-trip, not what appears on the page

**How to settle it.** insert a page number into a footer, open in Pages across a multi-page document, and confirm it counts up rather than showing a literal or a blank

### 25. Paragraph background & borders (rule stroke + positions)

**Risk if wrong:** 🟠 medium  
**Group:** Text & styles  
**Status in the matrix:** ✅ read + write

**Claim.** border_positions 0/1/2/3/4 means none / top / bottom / top and bottom / all.

**Why the suite cannot settle it.** The mapping is inferred, not observed. It fits three independent constraints — the field is a plain int32 rather than a set, the deprecated enum it replaced packs a position in 0..4 beside a line style, and the Pages inspector offers exactly five choices — but every value in the corpus is 0, 1 or 2, so 3 and 4 are unconfirmed and even 1-vs-2 could be inverted.

**How to settle it.** Set borderPositions to each of 1..4 on a paragraph with a thick coloured rule, open in Pages, and read the Borders & Rules control. Ten minutes settles the whole mapping.

### 26. Drawable shadows (enabled, angle, offset, blur, opacity)

**Risk if wrong:** 🟡 low  
**Group:** Drawables & media  
**Status in the matrix:** ✅ read + write

**Claim.** A shadow we enable or re-parameterise renders in the app with the geometry we set.

**Why the suite cannot settle it.** Angle, offset and blur radius are rendering parameters. Fixtures prove we read Apple's values correctly and re-encode them identically, but not that a shadow we author from scratch on a shape that had none is picked up rather than ignored.

**How to settle it.** Enable a shadow at angle 90, offset 10, radius 20 on a shape, open in Keynote or Pages, and compare with the Shadow section of the Style inspector.

### 27. Categories: enable or disable grouping

**Risk if wrong:** 🟡 low  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** flipping is_enabled makes Numbers group or ungroup the rows

**Why the suite cannot settle it.** the suite proves the flag round-trips and the tree survives, not that the app acts on it

**How to settle it.** take a categorised table, disable it with setEnabled(false), open in Numbers and confirm the rows are flat and the category can be switched back on

### 28. Conditional formatting rules

**Risk if wrong:** 🟡 low  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** the second conditional id in a cell record (COND_RULE_STYLE_ID) is a cache the app rewrites, so preserving it verbatim is enough

**Why the suite cannot settle it.** its value contradicts the obvious reading — every cell on a one-rule set carries 15 regardless of content, and cells on other sets carry 0, which is not a valid key in any of the table's lists

**How to settle it.** author two conditional rules, note the value on cells matching each, then change a cell's content so a different rule fires and re-read; if it tracks the match it is a live cache, if not it means something else

### 29. Character properties (font, colour, highlight, underline, strike, caps, shadow…)

**Risk if wrong:** 🟡 low  
**Group:** Text & styles  
**Status in the matrix:** ✅ read + write

**Claim.** Clearing a property by writing its *_null flag reads as 'none', not as 'inherit'.

**Why the suite cannot settle it.** We infer that a set *_null flag with the value absent means an explicit clear. Fixtures show the encoding but never disambiguate it from plain absence, because both render the same whenever the parent sets nothing either.

**How to settle it.** Create a style with a font colour, derive a child, clear the colour on the child, open in Pages and confirm the child shows the default colour rather than inheriting the parent's.

### 30. Shared style values (colour incl. P3, gradients, strokes, shadows, padding)

**Risk if wrong:** 🟡 low  
**Group:** Text & styles  
**Status in the matrix:** ✅ read + write

**Claim.** A Display-P3 colour we write renders as P3, and a dashed stroke renders with our dash lengths.

**Why the suite cannot settle it.** Colour space and dash patterns are rendering behaviour. We know 26.x files tag colours with rgbspace and that the dash array is repeated float, but not that a colour we author with space: 'p3' is treated as wide-gamut rather than reinterpreted.

**How to settle it.** Write a saturated P3 green and the same values as sRGB side by side, open on a P3 display, and confirm they differ. For dashes, write [4, 2] and compare against a 4/2 dash set in the inspector.

### 31. Table of contents (rules read + write, cached entries read)

**Risk if wrong:** 🟡 low  
**Group:** Text & styles  
**Status in the matrix:** ✅ read + write

**Claim.** Pages regenerates a TOC whose collection rules we changed, and honours the new rule set.

**Why the suite cannot settle it.** Rules are an instruction the app acts on at its next repagination. Nothing offline repaginates, so the change is visible in the archive but its effect is not.

**How to settle it.** Turn a heading style off in the TOC settings, save, open in Pages, and check the TOC drops those headings after it redraws.

## Recording an outcome

When a claim is checked by hand, do not delete its entry — replace the `manualProof` block with
a `note` recording what was observed, so the finding survives in the matrix. If the check *fails*,
that is a bug report with a reproduction already written.
