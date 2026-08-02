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

Of 29 claims, **2** are covered by `npm run test:e2e`, which drives the real apps through AppleScript on a Mac. The rest need a
person to look at a rendered document, because the scripting dictionaries expose no way to ask.

## The list

| # | Risk | Capability | Claim | Automated? |
|---:|---|---|---|---|
| 1 | 🔴 high | Keynote → Builds (animations): read and retime | the build model reads a real animation correctly | manual |
| 2 | 🔴 high | Keynote → Slide management (add, duplicate, move, remove) | Keynote opens a deck we added, duplicated, moved or removed slides in, and shows them in order. | manual |
| 3 | 🔴 high | Numbers & tables → Cell styling (fill, four borders, padding, alignment, wrap) | A cell style we create is picked up by the app and rendered, and the style table stays consistent. | manual |
| 4 | 🔴 high | Numbers & tables → Formula writing (authoring an AST) | Numbers computes what a formula we authored says, and does not report it as damaged. | manual |
| 5 | 🔴 high | Numbers & tables → Sheets (add, duplicate, rename, move, remove) | Numbers opens a document whose sheets we added, duplicated, renamed or reordered. | manual |
| 6 | 🔴 high | Numbers & tables → Table cell writing (text, number, date, bool, duration) | Numbers, Pages and Keynote open a package whose cells we rewrote, and display the values we wrote. | `test:e2e` |
| 7 | 🟠 medium | Drawables & media → Floating (non-inline) drawable placement | a drawable copied into a page's floating list is placed and rendered by Pages | manual |
| 8 | 🟠 medium | Drawables & media → Image cropping (set, move, remove a mask) | a mask this library writes crops the way Apple's does | manual |
| 9 | 🟠 medium | Keynote → Presentation settings (mode, loop, autoplay delays, slide size) | Keynote renders a deck whose canvas this library resized. | manual |
| 10 | 🟠 medium | Keynote → Skipped slides | Keynote treats a slide this library marked skipped as skipped. | manual |
| 11 | 🟠 medium | Keynote → Slide placeholders (title, body, slide number) — read and fill | Keynote shows placeholder text this library wrote, styled by the layout. | manual |
| 12 | 🟠 medium | Keynote → Speaker notes | Keynote shows presenter notes this library wrote. | manual |
| 13 | 🟠 medium | Keynote → Transitions | Keynote honours automatic advance written into the transition attributes. | manual |
| 14 | 🟠 medium | Numbers & tables → Add and remove tables on a sheet | a table added this way is editable in Numbers as a table, not just present in the file | manual |
| 15 | 🟠 medium | Numbers & tables → Cell display formats (number, currency, percentage, date, duration, text, boolean) | A format we write makes Numbers display the value the way the inspector would. | manual |
| 16 | 🟠 medium | Numbers & tables → Chart data editing (values, names, series, categories) | a series added or removed here leaves the chart's styling on the right series | manual |
| 17 | 🟠 medium | Numbers & tables → Conditional formatting: apply an existing rule set to more cells | re-pointing a cell's conditional-style key makes Numbers apply that rule set to it | manual |
| 18 | 🟠 medium | Numbers & tables → Filters: enable, disable, combining mode | enabling a filter set makes Numbers apply its rules | manual |
| 19 | 🟠 medium | Numbers & tables → Formula function names | The function-index table is incomplete, and every unnamed id is visible rather than guessed. | `test:e2e` |
| 20 | 🟠 medium | Numbers & tables → Formula reading (AST rendered to text) | Rendered formula text matches what the app shows in its formula bar. | manual |
| 21 | 🟠 medium | Numbers & tables → Merged cell ranges | Numbers accepts a merge this library wrote, and shows it where we put it. | manual |
| 22 | 🟠 medium | Numbers & tables → Table structure (rows, columns, bands, sizes, freeze, repeat) | Changed band counts, freeze and repeating-header flags, row heights and column widths take effect. | manual |
| 23 | 🟠 medium | Numbers & tables → Table styling (banded rows, grid strokes, visibility) | Banded rows, grid strokes and the visibility toggles render as set. | manual |
| 24 | 🟠 medium | Text & styles → Paragraph background & borders (rule stroke + positions) | border_positions 0/1/2/3/4 means none / top / bottom / top and bottom / all. | manual |
| 25 | 🟡 low | Drawables & media → Drawable shadows (enabled, angle, offset, blur, opacity) | A shadow we enable or re-parameterise renders in the app with the geometry we set. | manual |
| 26 | 🟡 low | Numbers & tables → Categories: enable or disable grouping | flipping is_enabled makes Numbers group or ungroup the rows | manual |
| 27 | 🟡 low | Numbers & tables → Conditional formatting rules | the second conditional id in a cell record (COND_RULE_STYLE_ID) is a cache the app rewrites, so preserving it verbatim is enough | manual |
| 28 | 🟡 low | Text & styles → Shared style values (colour incl. P3, gradients, strokes, shadows, padding) | A Display-P3 colour we write renders as P3, and a dashed stroke renders with our dash lengths. | manual |
| 29 | 🟡 low | Text & styles → Table of contents (rules read + write, cached entries read) | Pages regenerates a TOC whose collection rules we changed, and honours the new rule set. | manual |

### 1. Builds (animations): read and retime

**Risk if wrong:** 🔴 high  
**Group:** Keynote  
**Status in the matrix:** 🔍 read only

**Claim.** the build model reads a real animation correctly

**Why the suite cannot settle it.** not one of the eight decks in the corpus, spanning 2013 to 26.1, contains an animation

**How to settle it.** a three-slide deck with a different effect on each and one text build delivered by line, then `npm run probe -- animated.key`

### 2. Slide management (add, duplicate, move, remove)

**Risk if wrong:** 🔴 high  
**Group:** Keynote  
**Status in the matrix:** ✅ read + write

**Claim.** Keynote opens a deck we added, duplicated, moved or removed slides in, and shows them in order.

**Why the suite cannot settle it.** A slide is only as valid as the graph around it — placeholders, builds, the master reference. Our copies reload through this library and keep the package round-trippable, but whether Keynote considers the result a well-formed slide is its call, not ours. The first offline audit of these rungs already found four defects (an undeclared slide node, orphaned clones, undeclared guide storage, placeholders declaring their slide) — what remains is the app's verdict.

**How to settle it.** `npm run keynote:docs -- <dir>` and open the K04 (add), K05 (duplicate), K06 (remove) and K07 (reorder) files — each slide states on its face what the deck should look like. A refusal or a wrong navigator order names the rung; K00 failing instead means the container layer.

### 3. Cell styling (fill, four borders, padding, alignment, wrap)

**Risk if wrong:** 🔴 high  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** A cell style we create is picked up by the app and rendered, and the style table stays consistent.

**Why the suite cannot settle it.** We add a TST.CellStyleArchive and a style-table entry, then point the cell record at the new key. Nothing offline proves the app resolves that key, nor that cloning a style without its name and identifier is acceptable. The scripting dictionary exposes no cell formatting, so even e2e cannot assert it.

**How to settle it.** Write a fill, four borders, padding and vertical alignment into a cell, open in Numbers, and compare against the same formatting applied by hand in the inspector. Then re-save from the app and diff our style object against what Numbers rewrote.

### 4. Formula writing (authoring an AST)

**Risk if wrong:** 🔴 high  
**Group:** Numbers & tables  
**Status in the matrix:** ⚠️ experimental

**Claim.** Numbers computes what a formula we authored says, and does not report it as damaged.

**Why the suite cannot settle it.** Round-tripping proves the writer and the renderer agree, which is real evidence but not the engine's opinion. Nothing offline can say whether the engine wants dependency records beside the AST that we are not writing.

**How to settle it.** setFormula a few shapes — an arithmetic expression, a range SUM, an anchored reference — save, open in Numbers, and check the values recompute rather than showing an error.

### 5. Sheets (add, duplicate, rename, move, remove)

**Risk if wrong:** 🔴 high  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** Numbers opens a document whose sheets we added, duplicated, renamed or reordered.

**Why the suite cannot settle it.** A sheet is valid only in the context of the calc engine and the document's own bookkeeping. Our copies reload and round-trip, but whether Numbers accepts a duplicated tab — and whether its formulas still resolve against the copy rather than the original — only the app can say.

**How to settle it.** Duplicate a sheet with formulas, rename and reorder, save, and open in Numbers: check the tab bar, that the copy's formulas point within the copy, and that editing one tab leaves the other alone.

### 6. Table cell writing (text, number, date, bool, duration)

**Risk if wrong:** 🔴 high  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** Numbers, Pages and Keynote open a package whose cells we rewrote, and display the values we wrote.

**Why the suite cannot settle it.** Every offline check is self-referential: our encoder round-trips through our decoder. Apple's reader is the only authority on whether the rebuilt row buffers, offset array, cell counts and legacy stubs are all acceptable together.

**How to settle it.** npm run test:e2e on a Mac — 'writes cells that Numbers itself reads back' asserts the app reports our text and number. Then open the file by hand and check the edited cells look normal (no red triangle, no reformatting) and that undo/redo behaves.

> Already exercised by `npm run test:e2e` on a Mac with the app installed.

### 7. Floating (non-inline) drawable placement

**Risk if wrong:** 🟠 medium  
**Group:** Drawables & media  
**Status in the matrix:** ✅ read + write

**Claim.** a drawable copied into a page's floating list is placed and rendered by Pages

**Why the suite cannot settle it.** the suite proves the copy resolves, keeps its media and survives a save, not that the app lays it out

**How to settle it.** copy an image onto a page at a known position, open in Pages, and confirm it appears there and is independently editable from its source

### 8. Image cropping (set, move, remove a mask)

**Risk if wrong:** 🟠 medium  
**Group:** Drawables & media  
**Status in the matrix:** ✅ read + write

**Claim.** a mask this library writes crops the way Apple's does

**Why the suite cannot settle it.** the crop is a rendering result; the suite proves the geometry and path round-trip, not what appears on the page

**How to settle it.** crop an image to a known rectangle, open in Pages, and confirm the visible region matches — then drag the image inside the mask and re-read to check the window is where this library says

### 9. Presentation settings (mode, loop, autoplay delays, slide size)

**Risk if wrong:** 🟠 medium  
**Group:** Keynote  
**Status in the matrix:** ✅ read + write

**Claim.** Keynote renders a deck whose canvas this library resized.

**Why the suite cannot settle it.** slideSize is one TSP.Size on the show; nothing else references it, so nothing offline can prove the app re-lays content out rather than ignoring or refusing the change.

**How to settle it.** `npm run keynote:docs -- <dir>`, open the K10 file: the title says the deck should be 4:3 (1024×768), visibly squarer than the base's 16:9. A still-widescreen canvas is the failure.

### 10. Skipped slides

**Risk if wrong:** 🟠 medium  
**Group:** Keynote  
**Status in the matrix:** ✅ read + write

**Claim.** Keynote treats a slide this library marked skipped as skipped.

**Why the suite cannot settle it.** The write is one bool on the slide node. No corpus deck carries it true, so even the read side rests on the schema alone — this rung is the first evidence in either direction.

**How to settle it.** `npm run keynote:docs -- <dir>`, open the K09 file: slide 1 states that the next slide is skipped — collapsed in the navigator, absent when playing. It presenting anyway is the failure.

### 11. Slide placeholders (title, body, slide number) — read and fill

**Risk if wrong:** 🟠 medium  
**Group:** Keynote  
**Status in the matrix:** ✅ read + write

**Claim.** Keynote shows placeholder text this library wrote, styled by the layout.

**Why the suite cannot settle it.** Placeholder text goes through the shared storage writer into a shape the layout styles. Pages confirmed the writer; whether Keynote accepts it inside a KN.PlaceholderArchive is untested.

**How to settle it.** `npm run keynote:docs -- <dir>`, open K01 (title) and K02 (body): each slide's text states what it should read. Text missing, unstyled, or on the wrong slide names the placeholder path.

### 12. Speaker notes

**Risk if wrong:** 🟠 medium  
**Group:** Keynote  
**Status in the matrix:** ✅ read + write

**Claim.** Keynote shows presenter notes this library wrote.

**Why the suite cannot settle it.** Notes reuse the shared text-storage writer, which is app-confirmed in Pages — but a NOTE-kind storage hangs off a KN.NoteArchive no Pages document has, and only Keynote can say the chain holds.

**How to settle it.** `npm run keynote:docs -- <dir>`, open the K03 file, View ▸ Show Presenter Notes: the slide's title states the exact text the notes pane should show. Notes missing or stale means the note storage write does not take; the title changing but notes not narrows it to the KN.NoteArchive chain.

### 13. Transitions

**Risk if wrong:** 🟠 medium  
**Group:** Keynote  
**Status in the matrix:** ✅ read + write

**Claim.** Keynote honours automatic advance written into the transition attributes.

**Why the suite cannot settle it.** The animationAttributes chain is where both auto-advance and named effects live. Auto-advance uses only corpus-verified fields (is_automatic, delay), so it is the half we can claim; a pass also proves the chain itself accepts our writes, which is the prerequisite for effects later.

**How to settle it.** `npm run keynote:docs -- <dir>`, open the K08 file and press Play: the first slide states it should advance by itself after ~2 seconds. Having to click means the write did not take.

### 14. Add and remove tables on a sheet

**Risk if wrong:** 🟠 medium  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** a table added this way is editable in Numbers as a table, not just present in the file

**Why the suite cannot settle it.** the suite proves it reloads with its own cells and a unique name, not that the app treats it as a first-class table

**How to settle it.** add a blank table, open in Numbers, type into it and reference it from a formula on another table

### 15. Cell display formats (number, currency, percentage, date, duration, text, boolean)

**Risk if wrong:** 🟠 medium  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** A format we write makes Numbers display the value the way the inspector would.

**Why the suite cannot settle it.** The type codes were established by correlating every format in the corpus against the flag that referenced it — strong evidence for the categories, but rendering is still the app's.

**How to settle it.** Write a currency, percentage and date format, open in Numbers, and compare each cell against the same format applied through the Cell inspector on an untouched copy.

### 16. Chart data editing (values, names, series, categories)

**Risk if wrong:** 🟠 medium  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** a series added or removed here leaves the chart's styling on the right series

**Why the suite cannot settle it.** styling is applied at render time from arrays indexed by series position; the suite proves the indexes shift, not what the app draws

**How to settle it.** take a chart with distinctly coloured series, remove the middle one, open in the app and confirm the remaining series keep their own colours rather than shifting

### 17. Conditional formatting: apply an existing rule set to more cells

**Risk if wrong:** 🟠 medium  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** re-pointing a cell's conditional-style key makes Numbers apply that rule set to it

**Why the suite cannot settle it.** the fixture suite proves the key changes and the file reloads, not that the app honours it — evaluation happens in the calc engine

**How to settle it.** open a document with two conditional rules, move a cell onto the other set with setConditionalStyleKey, open in Numbers and confirm the cell picks up the second rule's styling

### 18. Filters: enable, disable, combining mode

**Risk if wrong:** 🟠 medium  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** enabling a filter set makes Numbers apply its rules

**Why the suite cannot settle it.** no fixture has a populated filter set, so the suite can only prove an empty one round-trips with the flag flipped

**How to settle it.** build a Numbers table with a filter rule, save, flip is_enabled with this library, reopen and confirm the row visibility changes

### 19. Formula function names

**Risk if wrong:** 🟠 medium  
**Group:** Numbers & tables  
**Status in the matrix:** ⚠️ experimental

**Claim.** The function-index table is incomplete, and every unnamed id is visible rather than guessed.

**Why the suite cannot settle it.** AST_function_node_index is an index into an Apple-internal list that appears in no public schema. The corpus proves exactly one entry (168 = SUM, by arithmetic). Shipping a table of plausible-looking guesses would turn a visible gap into silent wrong answers.

**How to settle it.** Run `node scripts/harvest-functions.ts --drive` on a Mac — it writes ~300 candidate functions through Numbers and reads every index back in one pass, producing data/function-index.json and a generated table. Without a Mac to hand, `--emit-sheet` produces a file to open and save in Numbers by hand, then `--ingest`. Protocol 1 in docs/MANUAL-WORK.md.

> Already exercised by `npm run test:e2e` on a Mac with the app installed.

### 20. Formula reading (AST rendered to text)

**Risk if wrong:** 🟠 medium  
**Group:** Numbers & tables  
**Status in the matrix:** 🔍 read only

**Claim.** Rendered formula text matches what the app shows in its formula bar.

**Why the suite cannot settle it.** Operators, references and ranges are decoded structurally and check out against cached values, but the archive records no brackets and no function names, so the rendering is a reconstruction. Only the app can confirm the reconstruction reads the same.

**How to settle it.** Open libetonyek-pages5-extra-dir.pages in Pages and numbers-parser-v14.4-issue102.numbers in Numbers, click the formula cells, and compare the formula bar with cellFormula(). Expect =B2*C2 and =SUM(C3:K6).

### 21. Merged cell ranges

**Risk if wrong:** 🟠 medium  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** Numbers accepts a merge this library wrote, and shows it where we put it.

**Why the suite cannot settle it.** The bytes we write match Apple's exactly for the same rectangle, which is the strongest offline evidence available — but byte equality of one node is not the same as the engine accepting the document, and no scripting API reports merges.

**How to settle it.** Merge a rectangle with mergeCells, save, and open in Numbers. Reading is separately checkable: open iwork-mcp-v14.5-earnings.numbers and confirm merges() matches (Key Metrics: rows 0 and 1 span all 4 columns).

### 22. Table structure (rows, columns, bands, sizes, freeze, repeat)

**Risk if wrong:** 🟠 medium  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** Changed band counts, freeze and repeating-header flags, row heights and column widths take effect.

**Why the suite cannot settle it.** These are presentation fields the offline suite can only verify it wrote and can read back. Whether the app agrees a header count is legal for a given table — and whether frozen or repeating headers need companion state we are not writing — only the app can say.

**How to settle it.** Set headerRows/footerRows plus freezeHeaderRows and repeatHeaderRows, open in Numbers, and check the header/footer controls in the inspector show what we set and that scrolling freezes correctly. For repeating headers, print to PDF from Pages and confirm the header repeats on page 2.

### 23. Table styling (banded rows, grid strokes, visibility)

**Risk if wrong:** 🟠 medium  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** Banded rows, grid strokes and the visibility toggles render as set.

**Why the suite cannot settle it.** TableStylePropertiesArchive has separate strokes for the body grid and the outer border plus a set of visibility booleans; which combination the app honours for a given theme is a rendering question no archive inspection answers. Our 'body border' setter writes both the horizontal and vertical border strokes on the assumption the inspector's single control does the same.

**How to settle it.** Set bandedRows with a banded fill and a body grid stroke, open in Numbers, and compare against the same settings applied through the Table inspector on an untouched copy.

### 24. Paragraph background & borders (rule stroke + positions)

**Risk if wrong:** 🟠 medium  
**Group:** Text & styles  
**Status in the matrix:** ✅ read + write

**Claim.** border_positions 0/1/2/3/4 means none / top / bottom / top and bottom / all.

**Why the suite cannot settle it.** The mapping is inferred, not observed. It fits three independent constraints — the field is a plain int32 rather than a set, the deprecated enum it replaced packs a position in 0..4 beside a line style, and the Pages inspector offers exactly five choices — but every value in the corpus is 0, 1 or 2, so 3 and 4 are unconfirmed and even 1-vs-2 could be inverted.

**How to settle it.** Set borderPositions to each of 1..4 on a paragraph with a thick coloured rule, open in Pages, and read the Borders & Rules control. Ten minutes settles the whole mapping.

### 25. Drawable shadows (enabled, angle, offset, blur, opacity)

**Risk if wrong:** 🟡 low  
**Group:** Drawables & media  
**Status in the matrix:** ✅ read + write

**Claim.** A shadow we enable or re-parameterise renders in the app with the geometry we set.

**Why the suite cannot settle it.** Angle, offset and blur radius are rendering parameters. Fixtures prove we read Apple's values correctly and re-encode them identically, but not that a shadow we author from scratch on a shape that had none is picked up rather than ignored.

**How to settle it.** Enable a shadow at angle 90, offset 10, radius 20 on a shape, open in Keynote or Pages, and compare with the Shadow section of the Style inspector.

### 26. Categories: enable or disable grouping

**Risk if wrong:** 🟡 low  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** flipping is_enabled makes Numbers group or ungroup the rows

**Why the suite cannot settle it.** the suite proves the flag round-trips and the tree survives, not that the app acts on it

**How to settle it.** take a categorised table, disable it with setEnabled(false), open in Numbers and confirm the rows are flat and the category can be switched back on

### 27. Conditional formatting rules

**Risk if wrong:** 🟡 low  
**Group:** Numbers & tables  
**Status in the matrix:** ✅ read + write

**Claim.** the second conditional id in a cell record (COND_RULE_STYLE_ID) is a cache the app rewrites, so preserving it verbatim is enough

**Why the suite cannot settle it.** its value contradicts the obvious reading — every cell on a one-rule set carries 15 regardless of content, and cells on other sets carry 0, which is not a valid key in any of the table's lists

**How to settle it.** author two conditional rules, note the value on cells matching each, then change a cell's content so a different rule fires and re-read; if it tracks the match it is a live cache, if not it means something else

### 28. Shared style values (colour incl. P3, gradients, strokes, shadows, padding)

**Risk if wrong:** 🟡 low  
**Group:** Text & styles  
**Status in the matrix:** ✅ read + write

**Claim.** A Display-P3 colour we write renders as P3, and a dashed stroke renders with our dash lengths.

**Why the suite cannot settle it.** Colour space and dash patterns are rendering behaviour. We know 26.x files tag colours with rgbspace and that the dash array is repeated float, but not that a colour we author with space: 'p3' is treated as wide-gamut rather than reinterpreted.

**How to settle it.** Write a saturated P3 green and the same values as sRGB side by side, open on a P3 display, and confirm they differ. For dashes, write [4, 2] and compare against a 4/2 dash set in the inspector.

### 29. Table of contents (rules read + write, cached entries read)

**Risk if wrong:** 🟡 low  
**Group:** Text & styles  
**Status in the matrix:** ✅ read + write

**Claim.** Pages regenerates a TOC whose collection rules we changed, and honours the new rule set.

**Why the suite cannot settle it.** Rules are an instruction the app acts on at its next repagination. Nothing offline repaginates, so the change is visible in the archive but its effect is not.

**How to settle it.** Turn a heading style off in the TOC settings, save, open in Pages, and check the TOC drops those headings after it redraws.

## Settled

17 claims have been checked in the app and moved off the list above. The reasoning is kept, because it is what makes the
result mean something; what changed is that it is no longer a request.

### ✅ Categories: regrouping rows after an edit

**Was claimed.** a row whose grouping value changed appears under its new group heading in Numbers, and per-group summaries — where a table has any — follow it

**Why it needed an app.** the offline check reads the tree this library just wrote, using the reader that shares its assumptions. Whether Numbers honours a rebuilt tree, or recomputes its own and ignores ours, is not visible from the file.

**Outcome.** **Confirmed in Numbers — the move half.** Bear appears under Fruit. The summaries half is untested and cannot be tested here: that fixture declares **zero** TST.ColumnAggregateArchive entries, so its group headings show no counts or totals at all, and there is nothing for a regroup to get wrong. regroupCategories does not touch aggregates, which is correct only if Numbers recomputes them; on a table that does declare a summary, moving a row between groups would change both groups' totals, and nothing here establishes whether ours would go stale. Needs a categorised fixture with a per-column summary, which this repository does not have

### ✅ Cell controls (checkbox, star rating, slider, stepper, pop-up menu)

**Was claimed.** interaction_type 4 is the stepper and 5 the slider, rather than the other way round

**Why it needed an app.** the other three widgets identify themselves — a checkbox row holds FALSE/TRUE, a star row is bounded [0…5], a pop-up carries a chooser model. Stepper and slider store the identical field set, so nothing in a file separates them. The pairing rests on one slider whose bounds match a published test, plus elimination.

**Outcome.** **Confirmed in Numbers.** All four range and toggle widgets — checkbox, star rating, slider and stepper — were opened and each drew as its label said, so the 4/5 pairing is observed rather than inferred. This also settled the larger question underneath it: a control needs a *format* as well as a spec, and without one the cell renders its value and the widget never appears (FORMAT.md §14.7.1). That was invisible to every offline check and is why the widgets had never once been seen before this.

### ✅ Character properties (font, colour, highlight, underline, strike, caps, shadow…)

**Was claimed.** Clearing a property by writing its *_null flag reads as 'none', not as 'inherit'.

**Why it needed an app.** We infer that a set *_null flag with the value absent means an explicit clear. Fixtures show the encoding but never disambiguate it from plain absence, because both render the same whenever the parent sets nothing either.

**Outcome.** **Partly settled, and it found a bug.** Opening an authored document in Pages showed a character style applying its `bold` and ignoring its `font_color` — the word rendered black. Text colour comes from `tsd_fill` (field 46), not `font_color` (7); a style with only the latter is valid, round-trips, and does nothing visible (FORMAT.md). Both are now written, **the fix is confirmed in Pages on a current-format document** — the word renders bold and red — and `test/pages-authored-shape.test.ts` guards the pairing against the fixture corpus. The *_null question in the claim above is still open; what is settled is that an authored colour reaches the page

### ✅ Chart appearance: type and series colours

**Was claimed.** a recoloured series shows the new colour, and only in the chart that was edited

**Why it needed an app.** the suite proves the archives and declarations are right, not that Numbers draws them

**Outcome.** **Half confirmed in Numbers.** The recoloured series drew red and the chart was otherwise correct — so the clone-and-repoint worked where it is observable: five other series kept their colours despite the shared archive. The cross-chart half is still unobserved, because the only chart fixture here has a single chart, and a copy-on-write that leaks would need a second chart to leak into. Same mechanism, so the risk stays low

### ✅ Comment creation and removal

**Was claimed.** a comment this library creates is readable and attributed in the app

**Why it needed an app.** the suite proves the three archives and the highlight run round-trip; what an author must carry before the comment UI will draw at all took three app rounds

**Outcome.** **Confirmed — "P08 Comment works" — on the third round, each round a distinct finding.** Round one (Pages for iOS): unreadable placeholder — the comment carried no author where every corpus comment references one. Round two: with a name-only author, Pages crashed on open — both corpus authors carry the identical comment-yellow `TSP.Color` and explicit `is_public_author = false`, and the comment UI draws the author's tint; the corpus rosters also declare `refs=[]`, and the round-one fix had made ours declare the author — the container rule reintroduced by our own repair. Round three, with the author byte-for-byte Apple's shape and the roster declaring nothing: readable and attributed.

### ✅ Date fields and bookmarks (read + create)

**Was claimed.** a date field and a bookmark this library inserts are live in Pages, not literal text

**Why it needed an app.** both are attachments whose meaning comes from the app resolving them; the suite proves the archive and the anchor round-trip, not that the app treats them as fields

**Outcome.** **Confirmed, and the bookmark half found a bug.** The date field renders set to 1 January and is editable. The bookmark rung marked a 13-character phrase and Pages bookmarked one character — "the B character is a bookmark" — because the writer derived `ranged` from the *name* and wrote `ranged=false` over a 13-character run, a combination no corpus bookmark has. The corpus ties the flag to run length (true at 13 and 46 characters, false at exactly 1) with the name orthogonal, and Pages resolved our contradiction in the flag's favour. `ranged` now derives from the run, and the corrected form is confirmed: the re-emitted named bookmark with `ranged=true` spans its full 13-character phrase in Pages — a name-plus-range combination the corpus itself never shows, accepted by the app

### ✅ Edit cycle: open → edit → save → reopen

**Was claimed.** Pages, Numbers and Keynote open a document this library has edited and saved.

**Why it needed an app.** The offline suite proves self-consistency: we read back what we wrote. Only the apps can say whether they accept it.

**Outcome.** **Confirmed for Pages and Numbers; Keynote untested.** A current-format Pages document (file format 26.1.0) was edited, saved and opened with its formatting intact — appending a paragraph, applying character formatting, and applying a named paragraph style. Getting there took four separate defects, none of which any offline check could see, and each is now guarded: text colour must go in `tsd_fill` as well as `font_color`; a storage must not declare its stylesheet in `object_references`; paragraphs end at U+0004/U+0005/U+000C as well as U+000A but not at U+2028; and `table_para_style` is dense while the list and layout tables are sparse. Numbers is covered separately by the widget and regrouping checks. Keynote has never been opened at all

### ✅ Footnote creation and removal

**Was claimed.** a footnote this library creates is numbered and laid out by Pages

**Why it needed an app.** numbering and layout are the app's; the suite proves the archives and anchors round-trip, and three app rounds proved what the archives must also carry

**Outcome.** **Confirmed in Pages — "P09 pass" — after three rounds, each of which found a distinct defect class.** Round one crashed the app: every newly created attribute table was seeded with an objectless entry at index 0, fatal in the point-anchored `table_footnote`/`table_attachment` where an entry is an object at a position (107 such tables in the corpus, zero objectless entries — the seed is now shape-aware). Round two rendered and numbered the note but drew the reference on the baseline: every corpus mark, body U+000E and note U+FFFC alike, is covered by one shared anonymous character style whose whole bag is `superscript = 1`, and we wrote none. Round three: the note renders small in Footnote style, the mark is a raised number, and the note storage carries the six attribute tables all 2676 corpus storages have.

### ✅ Headers & footers (3 columns × first/even/odd)

**Was claimed.** header and footer text written into the section masters renders on the page

**Why it needed an app.** headers live on section page masters; only layout proves the storages are the ones drawn

**Outcome.** **Confirmed in Pages — "P05 pass".** Centre-column header and footer text written into every page-master variant renders in the page chrome.

### ✅ Hyperlinks

**Was claimed.** a hyperlink this library inserts is live in the app

**Why it needed an app.** a link is a smartfield run plus a URL ref; the field makes it live, the Link style makes it look live, and only the app proves either

**Outcome.** **Click confirmed — "P04 pass" — appearance was not, and is now written.** The linked words were a live hyperlink and did not look like one: every native link run in the corpus is covered by the document's Link character style (identifier `character-style-hyperlink`, name "Link", bag exactly `{underline: 1}`), which every corpus template ships and `insertLink` never applied. It now applies it by default, with `characterStyle: false` to skip and an id or identifier to override; the underlined form is unverified in the app

### ✅ Inline image insertion

**Was claimed.** an image this library inserts inline appears on the page at the size asked for

**Why it needed an app.** The shape audit found the archive incomplete in exactly the way a cell control with no format was — every omission optional, nothing offline objecting.

**Outcome.** **Confirmed in Pages — "P11 pass".** A 1x1 red PNG inserted inline and scaled to 72pt renders as a red square at the size asked, on the current-format base. This was the rung that had never been opened at all, and it shipped with four shape-audit fixes applied together: the theme's `image-0-imageStyle` reference (all 83 corpus images carry one), `naturalSize` alongside `originalSize`, `flags`/`interpretsUntaggedImageDataAsGeneric`, and the four attachment offset fields (101 of 101 corpus attachments). All four rode in one file, so which were necessary rather than merely corpus-true is not isolated — they are cheap, measured, and stay

### ✅ Page numbers and page counts (insert, read, remove)

**Was claimed.** a page-number attachment this library inserts renders as a live number

**Why it needed an app.** the value comes from pagination, which nothing here performs — the suite proves the archive and anchor round-trip, not what appears on the page

**Outcome.** **Confirmed in Pages.** A page number inserted into the body renders as a live number ("P06 pass"), a page count updates when a page is inserted, and a date field renders and is editable as a date. All on current-format documents

### ✅ Page setup (size, margins, orientation)

**Was claimed.** page size and orientation this library writes are what Pages lays out

**Why it needed an app.** layout geometry is the app's; the fields could have been advisory

**Outcome.** **Confirmed in Pages — "P10 pass".** A rung written as corpus-exact A4 landscape (841.89 x 595.28 pt, orientation 1) renders as a page noticeably wider than tall. The first round was unjudgeable and taught the encoding: every corpus document stores its real geometry in the width/height fields — the one wide document is 2880x2304 with orientation 1 — so the flag is metadata and swapping the dimensions is what makes landscape

### ✅ Paragraph & character styles (by name, plus creation and editing)

**Was claimed.** a paragraph style this library creates appears in the app's paragraph styles panel, so a person can reapply it

**Why it needed an app.** Nothing offline distinguishes a listed style from an unlisted one except by correlation with the corpus, and every correlation found so far has been necessary at best. Four rounds of guess-and-check is where guessing stops paying.

**Outcome.** **Confirmed in Pages — "P15 works now".** A created style applies as asked and appears in the paragraph styles panel, on the current-format ladder base. What it took, cumulatively: a `super.name`; a `super.identifier` plus a matching `identifier_to_style_map` entry; both property bags; and an entry in `TSWP.ThemePresetsArchive.paragraph_style_presets` — the theme list the panel reads. The earlier failures were real: the first three alone left the style applying but unlisted. One fine point went unrecorded: the confirming report did not itemise the density pair (P15b, bags copied from Body, against P15c, three properties), so whether a sparse property bag alone lists is not established — `copyOf` exists either way

### ✅ Placement (copy onto a page/slide/sheet, remove, reorder in z)

**Was claimed.** A drawable we copied onto another page/slide/sheet appears there, at the geometry we set.

**Why it needed an app.** The three apps store the list differently — two lists in Keynote, one in Numbers, per-page wrapped entries in Pages — and each app decides for itself whether an object it owns is renderable. Reloading through this library proves the wiring, not the rendering.

**Outcome.** **Confirmed in Pages for both placement shapes — "Both p19 work now".** A drawable copied onto the page it already lived on, and onto a fresh page needing a new page group, both render. What it took beyond the page group: the copy must join the document-level `TP.DrawablesZOrderArchive`, the paint order — a drawable in a page group but absent from it does not draw at all, with no warning. Pages keeps paint order per document where Keynote and Numbers keep it in-container, so this is the one app where attach() alone was never enough. Keynote and Numbers placement is still unverified in-app

### ✅ Pop-up menu creation (TST.PopUpMenuModel)

**Was claimed.** a TST.PopUpMenuModel built from the schema is one Numbers will open and draw

**Why it needed an app.** every other control was measured against a real one before being written. This one could not be, and the failure mode just demonstrated by cell controls is precisely a structure that is valid in every offline respect and still does not render — required fields present, reader agrees, app shows nothing. A menu has more surface for that than the others: it is two archives and a cross-object reference rather than one flag.

**Outcome.** **Confirmed in Numbers, after the first attempt was quietly wrong.** The model was accepted and the menu drew, but offered one fewer choice than it was given — the first. Three candidate readings of `tsce_item[0]` were written as three documents, and the decisive one was putting a copy of the selected value there: all choices came back, but the menu marked none of them current, so slot 0 is the None entry rather than a selection. It takes a bare NIL_TYPE, the choices start at index 1, and `chooser_control_start_w_first` governs only whether that entry is offered as a row (FORMAT.md §14.7.2). Text and numeric menus both verified.

### ✅ Sections (read + insert)

**Was claimed.** a section break this library inserts starts a new section on a new page

**Why it needed an app.** pagination is the app's; the table entry alone was well-formed, listed in the sidebar, and paginated nothing

**Outcome.** **Confirmed in Pages — "P07 passed" — on the second round.** The first check failed ("not on a new page") and taught the rule: all 28 section boundaries across the five multi-section fixtures put U+0004 where the previous paragraph's newline was, and we wrote only the `table_section` entry — Pages listed the section and kept the text flowing, because the table names a section and the character breaks the page. With `insertSectionBreak` swapping the terminator (same length, so every attribute-table index survives) and keeping the clone's name, the second paragraph renders on its own page.

## Recording an outcome

When a claim is checked by hand, do not delete its entry — add `settled:` to its `manualProof`
block saying what was observed. The claim moves to the section above, keeping the reasoning that
made it worth checking. If the check *fails*, that is a bug report with a reproduction already
written.
