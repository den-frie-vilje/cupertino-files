# Coverage matrix

**Generated — do not edit.** Run `npm run coverage` to regenerate; `npm run coverage:check`
fails when this file is out of date with the fixtures and capability table.

Support status is declared in `scripts/coverage-matrix.ts`. Validation is *measured*: each
capability is probed against every fixture, so a row can read “implemented” and “validated by
zero fixtures” at the same time — which is exactly the thing worth knowing.

## Version coverage

| App | iwork13 | iwork16 | iwork19 | modern | current | Total | Newest format | Newest build |
|---|---:|---:|---:|---:|---:|---:|---|---|
| **Pages** | 1 | 4 | 5 | 7 | 10 | 27 | 26.3.1 | `M15.3.1-7050.1.1-2` |
| **Numbers** | · | 1 | · | 3 | 15 | 19 | 26.3.1 | `M15.3.1-7050.1.1-2` |
| **Keynote** | · | 2 | 1 | 2 | 4 | 9 | 26.3.1 | `M15.3-7050.0.24-2` |

Eras are classified from `fileFormatVersion`; see `docs/FORMAT.md` §11. 
Corpus: **55 documents**. Every one round-trips byte-identically.

## Feature coverage

Legend: ✅ read + write · 🔍 read only · ⚠️ experimental · ○ roadmap · ✗ out of scope

### Container

| Capability | Apps | Status | Fixtures | Eras validated |
|---|---|---|---:|---|
| Flat zip layout | all | ✅ read + write | 53 | all |
| Nested Index.zip layout | all | ✅ read + write | 2 | iwork19→iwork19 |
| Wrapper-directory layout | all | ✅ read + write | **0** | — |
| Byte-identical round-trip of untouched content<br><sub>enforced for every fixture by the compatibility suite</sub> | all | ✅ read + write | 55 | all |
| Edit cycle: open → edit → save → reopen<br><sub>every modern document in the corpus is edited and re-read by test/edit-cycle.test.ts, which also compares a census — objects, components, text, tables, cells, formulas, merges, charts, styles, unknown archive types — before and after, so an edit that lands while dropping something else fails</sub> | all | ✅ read + write | 55 | all |
| New document from a template (blankFrom)<br><sub>empties a real document rather than synthesising one: every identity, style and master stays as an Apple app wrote it. There is no from-nothing constructor — that graph could be written but not checked, and unverifiable inventions are the one thing this project refuses to ship</sub> | all | ✅ read + write | 55 | all |
| New document from nothing (blank)<br><sub>blank() instantiates a donor embedded in the package — a corpus fixture emptied by blankFrom at build time (scripts/make-blanks.ts records which and why), previews stripped, Pages re-papered to A4 with byte-measured values, Numbers already iso-a4, Keynote 1920×1080, all dressed in the house typography (Palatino body, Helvetica Neue display, terracotta accent) through the public style API. The apps do the same: a new document is a bundled template, instantiated. blanks:check pins the embedded bytes to data/blanks/ and asserts the house contract</sub> | all | ✅ read + write | 55 | all |
| Compaction (drop unreachable archives)<br><sub>correct but currently collects little: removing a sheet leaves calc-engine references to its tables, so they stay reachable. A no-op on every untouched fixture, which is the property that matters</sub> | all | ✅ read + write | 55 | all |
| Mixed-codec packages (LZFSE component beside Snappy)<br><sub>decodeLzfseStream reads the container (raw and LZVN blocks; FSE blocks refused precisely) and the probe reports its reading of any opaque component; the document model keeps such components opaque and byte-preserved because no redistributable specimen exists to measure the payload against — see docs/BLOCKERS.md</sub> | all | 🔍 read only | **0** | — |
| iWork '09 XML documents<br><sub>detected and rejected with a clear error</sub> | all | ✗ out of scope | n/a | — |
| Password-protected documents<br><sub>detected via .iwph and rejected</sub> | all | ✗ out of scope | n/a | — |

### Object graph

| Capability | Apps | Status | Fixtures | Eras validated |
|---|---|---|---:|---|
| Unknown type IDs preserved across edits<br><sub>forward compatibility; registerTypes() can name them at runtime</sub> | all | ✅ read + write | 1 | iwork13→iwork13 |
| Multi-payload archives | all | 🔍 read only | 45 | iwork19→current |
| Older-reader compatibility diffs (type-0 patches)<br><sub>preserved verbatim; not recomputed when the base message changes</sub> | all | 🔍 read only | 18 | modern→current |
| Versioned style snapshots (styles_for_*) | all | 🔍 read only | 41 | modern→current |

### Text & styles

| Capability | Apps | Status | Fixtures | Eras validated |
|---|---|---|---:|---|
| Text read/edit with full attribute-table fixup | all | ✅ read + write | 55 | all |
| Paragraph & character styles (by name, plus creation and editing) | all | ✅ read + write | 55 | all |
| Character properties (font, colour, highlight, underline, strike, caps, shadow…) | all | ✅ read + write | 55 | all |
| Paragraph properties (indents, spacing, keeps, hyphenation, outline level) | all | ✅ read + write | 55 | all |
| Tab stops (position, alignment, leader) | all | ✅ read + write | 51 | all |
| Paragraph background & borders (rule stroke + positions)<br><sub>border_positions is a bitmask with logical side bits (1 top, 2 bottom, 4 leading, 8 trailing — app-settled 2026-08-03); the stroke is written with cap, join, miter 4 and the full pattern message, the shape of all 167 corpus paragraph border strokes</sub> | all | ✅ read + write | 29 | all |
| Paragraph rule offset (text-to-border distance)<br><sub>historical_rule_offset, a TSP.Point whose slots agree in 8637 of 8638 corpus instances — a number writes both, a pair states them separately; the null flag is never used. Rendering measured: 0 is the default gap (the app back-fills (0, 0) on resave), negative pulls the rules toward and into the text (−12 overlaps; the templates' −3 tightens), and the app preserves values beyond what its inspector displays (−12 stored, −2 shown)</sub> | all | ✅ read + write | 55 | all |
| Shared style values (colour incl. P3, gradients, strokes, shadows, padding)<br><sub>one vocabulary shared by text, table and drawable styling</sub> | all | ✅ read + write | 55 | all |
| List styles | all | ✅ read + write | 27 | all |
| Hyperlinks | all | ✅ read + write | 9 | iwork16→current |
| Page numbers and page counts (insert, read, remove)<br><sub>an attachment at a U+FFFC placeholder, not text; the rendered value comes from pagination and is never invented</sub> | all | ✅ read + write | 33 | iwork16→current |
| Smart fields (page number, date, merge, …) | all | 🔍 read only | 13 | iwork16→current |
| Paragraph writing direction (read + write)<br><sub>the storage's bidi pair, written as the app's own direction control writes it — (1, 0) RTL, (0, 0) LTR, (65535, 65535) natural; the style bag's writing_direction is vestigial and untouched even by the app</sub> | all | ✅ read + write | 55 | all |
| Placeholder text (list, fill, define)<br><sub>the template tap-to-replace mechanism. Filling sheds the marking the way typing does; defineAsPlaceholder writes the measured shape (smart-field super + varint 1, uniform across 73 app-written instances). A placeholder over an attachment's U+FFFC is a body document's image placeholder — same field, no drawable archive</sub> | Pages | ✅ read + write | 5 | iwork19→current |
| Date fields and bookmarks (read + create)<br><sub>a date field spans real text the app rewrites, so the display text is supplied rather than formatted here</sub> | all | ✅ read + write | 5 | iwork16→modern |
| Comment creation and removal<br><sub>reuses the document's existing annotation author rather than duplicating them</sub> | all | ✅ read + write | 5 | iwork16→current |
| Footnote creation and removal<br><sub>the reference is a U+000E in its own table; the note is a separate storage of footnote kind — endnotes are the same machinery under kind 1 (document) or 2 (section), read by the same accessor</sub> | Pages | ✅ read + write | 1 | iwork19→iwork19 |
| Change tracking (insertions/deletions)<br><sub>tables preserved and index-shifted correctly; no semantic API</sub> | all | 🔍 read only | 1 | modern→modern |
| Table of contents (rules read + write, cached entries read)<br><sub>collection rules are editable; cached entries are a layout result this library will not invent</sub> | Pages | ✅ read + write | 2 | iwork19→iwork19 |

### Drawables & media

| Capability | Apps | Status | Fixtures | Eras validated |
|---|---|---|---:|---|
| Placement (copy onto a page/slide/sheet, remove, reorder in z)<br><sub>one abstraction over three containers; copies are deep so the two objects are independent. In Pages a page with no floating objects has no page_groups entry at all, so placing the first drawable on a page needs floatingDrawables(page, { create: true }) — the created group carries the two fields every group in the corpus carries, page index and drawable list, inserted in page order</sub> | all | ✅ read + write | 38 | iwork16→current |
| Drawable style (fill, stroke, opacity, shadow, reflection)<br><sub>where shadows live — cell and table styles have no shadow field at all; writes copy a shared archive on first edit and repoint this drawable, the app's own one-object-styled behaviour</sub> | all | ✅ read + write | 55 | all |
| Drawable shadows (enabled, angle, offset, blur, opacity) | all | ✅ read + write | 55 | all |
| Geometry (enumerate, move, resize) | all | ✅ read + write | 47 | iwork16→current |
| Image filters / adjustments | all | ✅ read + write | 2 | iwork16→modern |
| Image cropping (set, move, remove a mask) | all | ✅ read + write | 17 | iwork16→current |
| Media variant resolution (unmaterialized originals) | all | 🔍 read only | 11 | iwork16→current |
| Inline image insertion<br><sub>Data/ plumbing with SHA-1 dedupe; anchored at a U+FFFC in table_attachment, with the in-the-text-flow exterior_text_wrap so the picture sits in the text column and moves with its indent</sub> | Pages | ✅ read + write | n/a | — |
| Inline image placement in an indented column<br><sub>exterior_text_wrap type 0 — the mode on 56 of the corpus's 102 inline attachments and on none of its 175 floating drawables; the other values place the drawable against the page and are unnamed in any published schema</sub> | Pages | ✅ read + write | n/a | — |
| Floating (non-inline) drawable placement<br><sub>per-page groups, each entry wrapped in a TP.DrawableEntry; copies are deep, sharing styles and themes</sub> | Pages | ✅ read + write | 10 | iwork16→current |

### Pages

| Capability | Apps | Status | Fixtures | Eras validated |
|---|---|---|---:|---|
| Sections (read + insert)<br><sub>validation counts multi-section documents only</sub> | Pages | ✅ read + write | 5 | iwork19→current |
| Headers & footers (3 columns × first/even/odd) | Pages | ✅ read + write | 6 | iwork19→modern |
| Master-page drawables | Pages | 🔍 read only | 2 | iwork19→modern |
| Page setup (size, margins, orientation) | Pages | ✅ read + write | 27 | all |
| Page-layout (body-less) documents | Pages | ✅ read + write | 2 | iwork16→modern |
| Text boxes | Pages | ✅ read + write | 9 | iwork16→current |
| Document settings (hyphenation, ligatures, footnote config) | Pages | ✅ read + write | 27 | all |

### Numbers & tables

| Capability | Apps | Status | Fixtures | Eras validated |
|---|---|---|---:|---|
| Sheets (add, duplicate, rename, move, remove)<br><sub>a duplicated sheet deep-copies its tables, so the two tabs edit different cells. Tab order does not decide where the document opens — Numbers keeps the selected sheet in its UI state's TN.SheetSelectionArchive references, which setActiveSheet re-points</sub> | Numbers | ✅ read + write | 19 | iwork16→current |
| Table cell reading — modern BNC/v5 storage<br><sub>numbers, text, rich text, dates, booleans, durations, merges</sub> | all | 🔍 read only | 27 | iwork19→current |
| Table cell reading — pre-BNC storage (iWork '13/'15)<br><sub>text, numbers and dates. Layout measured from the corpus itself (`npm run prebnc`), not documented anywhere; a record shape that was not measured is refused and counted by undecodedPreBncCells() rather than guessed. Writing this storage is out of scope — a current app converts these files on open</sub> | all | 🔍 read only | 4 | iwork16→iwork16 |
| Table cell writing (text, number, date, bool, duration)<br><sub>string-table refcounting, offsets and legacy stubs rebuilt; formats and styles on the cell preserved. A fresh value is stamped with its type's default format — the automatic number, text, boolean or date archive the app writes for a typed value, none missing across every plain value cell in the corpus — because a number cell without one renders left-aligned while the inspector calls its alignment automatic, until the cell is manually re-entered</sub> | all | ✅ read + write | 27 | iwork19→current |
| Cell styling (fill, four borders, padding, alignment, wrap) | all | ✅ read + write | 27 | iwork19→current |
| Table styling (banded rows, grid strokes, visibility) | all | ✅ read + write | 31 | iwork16→current |
| Table structure (rows, columns, bands, sizes, freeze, repeat)<br><sub>row and column insert/delete rebuild tiles, headers and the row-tile tree</sub> | all | ✅ read + write | 31 | iwork16→current |
| Merged cell ranges<br><sub>mergeCells/unmergeCells, complete with the calc engine's dependency ledger: the kind-5 owner's (row 0, column = formula_index) record, tile minted on first use. Deleting Apple's last merge in issue102 and remaking it through mergeCells reproduces the whole saved file byte for byte</sub> | all | ✅ read + write | 5 | modern→current |
| Cell display formats (number, currency, percentage, date, duration, text, boolean)<br><sub>category comes from which record flag carries the id, not from the format's own type code; custom formats are read and preserved but cannot be authored</sub> | all | ✅ read + write | 26 | iwork19→current |
| Formula reading (AST rendered to text)<br><sub>not a Numbers feature — Pages and Keynote tables carry the same calc-engine archives</sub> | all | 🔍 read only | 9 | iwork19→current |
| Formula function names<br><sub>only ids proven by arithmetic are named; the rest render as FUNCTION_&lt;id&gt;. Extend with registerFormulaFunctions()</sub> | all | ⚠️ experimental | 8 | iwork19→current |
| Cross-table formula references resolved to table names<br><sub>via the calc-engine owner map; all 1020 cross-table references in the corpus name their table</sub> | all | 🔍 read only | 3 | current→current |
| Cell controls (checkbox, star rating, slider, stepper, pop-up menu)<br><sub>interaction_type was measured from public widget-demo documents, read and discarded (4 stepper, 5 slider, 6 star rating, 7 pop-up menu, 8 checkbox); the corpus now carries one carrier, olekristensen-v26.3-demo07-rules-returned.numbers. setCellControl writes all five widgets, sharing one spec between cells that want the same one, and all five are confirmed drawing in Numbers — the menu's model on its own row below. Shape is still classified by populated fields, so an unrecognised code degrades rather than misreads</sub> | Numbers | ✅ read + write | 4 | current→current |
| Pop-up menu creation (TST.PopUpMenuModel)<br><sub>The one widget built from the schema rather than measured. A menu is the only control needing a second archive — the model holding its choices — and no document available here contains one, so its shape comes from the vendored proto2 definition: repeated TSCE.CellValueArchive, each item carrying the TSK.FormatStructArchive its schema marks required. Cells sharing choices share one model. Reading, round-tripping and the cell's own format are all checked offline; none of that is the app's opinion</sub> | Numbers | ✅ read + write | n/a | — |
| Formula writing (authoring an AST)<br><sub>setFormula parses infix text and compiles it: operators, parentheses, relative and anchored references, ranges, cross-table references (`Other::A1`, resolved to the target's owner UUID), nested calls, omitted arguments, and any of the 272 measured functions. Whole-column spans (`SUM(D)`) write too. Every parseable corpus formula rebuilds byte-identical to Apple's AST (1242 of 1242), and replacing a formula with its own text saves the whole document byte-identical to the original. Nothing evaluates — pass the cached result as `value`. Arrays and #REF! are refused</sub> | all | ✅ read + write | n/a | — |
| Charts (type, categories, series, values) | all | 🔍 read only | 2 | iwork16→iwork16 |
| Add and remove tables on a sheet<br><sub>copies an existing table and renames it — Numbers addresses tables by name, so a duplicate makes cross-table formulas ambiguous. The copy's calc-engine identity is re-minted too (the whole derived owner family off one fresh base UUID): a byte-copied identity is one table with two names, and the engine resolves either name to whichever registered first — measured when a formula naming a clone read the donor's cells instead</sub> | Numbers | ✅ read + write | 19 | iwork16→current |
| Chart data editing (values, names, series, categories)<br><sub>the grid's id map and the sparse per-series style arrays are kept in step; appearance has its own rows below</sub> | all | ✅ read + write | 2 | iwork16→iwork16 |
| Chart appearance: type and series colours<br><sub>chart type reads and writes against the full TSCHArchives_Common enum (a test parses the proto, so the next value Apple adds fails the suite rather than a document). Series colour copies on write: style archives are shared — one is referenced by ten charts in a borrowed document — so setSeriesFill clones a shared archive, repoints this chart's slot and retargets the reference declaration, instead of recolouring every chart at once</sub> | all | ✅ read + write | 1 | iwork16→iwork16 |
| Chart appearance: axes, legend, gridlines<br><sub>axis visibility, gridlines, tick marks and gridline strokes read and write, per axis and per kind. Nearly every axis property exists twice — once for category, once for value — and an archive fills only its own family, so reading the wrong one returns undefined for everything and looks like an empty archive rather than a bug; the chart names the two kinds in separate fields, so nothing is inferred. Writes copy on write like series fills. Legend fill, stroke and opacity write the same way</sub> | all | ✅ read + write | 2 | iwork16→iwork16 |
| Conditional formatting rules<br><sub>conditions decoded from the rule's formula, which states the comparison. setConditionalRules writes all six comparisons — every predicate_type code is observed, the last two (&gt; at 7, &gt;= at 8) measured 2026-08-03 from seed documents whose formulas state the operators. A rule built for a condition Apple also wrote is byte-identical to Apple's, all 424 bytes</sub> | all | ✅ read + write | 5 | current→current |
| Conditional formatting: apply an existing rule set to more cells | all | ✅ read + write | 5 | current→current |
| Conditional formatting: authoring new rules<br><sub>all six comparisons write. = &lt;&gt; &lt; &lt;= were observed in the corpus; &gt; (7) and &gt;= (8) were measured 2026-08-03, closing the menu-order enum — codes were refused until observed because a rule filed under a wrong code reads back correctly while showing the wrong condition in the editor. A rule built for a condition Apple also wrote is byte-identical to Apple's, all 424 bytes. Every covered cell is also registered in the calc engine's dependency ledger — a CellRecordExpandedArchive under the table's kind-3 owner, one edge naming the cell itself — the shape 1973 corpus records state unanimously</sub> | all | ✅ read + write | n/a | — |
| Filters (mode, enable state, per-column rules)<br><sub>rule reading is pinned against the populated two-rule set in olekristensen-v26.3-mac-filters.numbers — columns, switches, predicates and their formulas, sharing the conditional-formatting encoding — alongside the empty sets every template-era fixture carries</sub> | all | 🔍 read only | 21 | modern→current |
| Filters: enable, disable, combining mode | all | ✅ read + write | 21 | modern→current |
| Categories (row grouping, nesting, date bucketing)<br><sub>group membership cross-checked against cell contents; every group in every fixture agrees</sub> | all | 🔍 read only | 1 | current→current |
| Categories: enable or disable grouping | all | ✅ read + write | 21 | modern→current |
| Categories: regrouping rows after an edit<br><sub>regroupCategories puts rows back in the groups their values now call for, and writes only the index sets that changed — regrouping unchanged data reproduces Apple's archive byte for byte across every by-value table in the fixture. Creating or removing a group is refused: which rows are "Animal" the data answers, but a new group's identity, its sort position and the per-column fields beside the tree are things only the app knows</sub> | all | ✅ read + write | 1 | current→current |
| Categories: creating a grouping, and per-group summaries<br><sub>creating a group needs its identity, its sort position and the several per-column and per-row fields written alongside the tree, none of which any fixture explains; and no fixture has a non-empty aggregate list, so summary rows are read but unexercised</sub> | all | ○ roadmap | n/a | — |
| Row and column identities (TST.ColumnRowUIDMapArchive)<br><sub>resolves the UIDs categories, hidden states and the calc engine use back to positions; row/column insert and delete keep the map in lockstep, minting and retiring identities — read-only means no direct authoring API</sub> | all | 🔍 read only | 31 | iwork16→current |
| Filters: authoring rules and recomputing hidden rows<br><sub>a rule set alone does not hide rows — TST.HiddenStateExtentArchive records the result, and recomputing it means evaluating the predicates</sub> | all | ○ roadmap | n/a | — |

### Keynote

| Capability | Apps | Status | Fixtures | Eras validated |
|---|---|---|---:|---|
| Slide management (add, duplicate, move, remove)<br><sub>new slides deep-copy their content and share their layout, styles and theme</sub> | Keynote | ✅ read + write | 9 | iwork16→current |
| Slide tree (both generations, presentation order) | Keynote | ✅ read + write | 9 | iwork16→current |
| Speaker notes | Keynote | ✅ read + write | 3 | iwork16→current |
| Transitions<br><sub>named effects were blocked on evidence — every corpus slide says effect "none" — until the e2e suite began manufacturing it: Keynote applies a real dissolve and the library reads it back, and Keynote reads back a duration and effect the library wrote (both confirmed 2026-08-03, 17 of 17); written effects copy a string measured from the app that run, never a guess</sub> | Keynote | ✅ read + write | **0** | — |
| Presentation settings (mode, loop, autoplay delays, slide size)<br><sub>defaults come from the schema, not from zero — every corpus deck omits several and relies on them</sub> | Keynote | ✅ read + write | 9 | iwork16→current |
| Slide placeholders (title, body, slide number) — read and fill<br><sub>fills a placeholder the slide already carries; creating one needs the theme's geometry for that role</sub> | Keynote | ✅ read + write | 9 | iwork16→current |
| Skipped slides<br><sub>NO FIXTURE: no corpus deck skips a slide; the flag is read off SlideNodeArchive.isSkipped and written as a bool on the node</sub> | Keynote | ✅ read + write | **0** | — |
| Master / layout slides | Keynote | 🔍 read only | 9 | iwork16→current |
| Builds (animations): read and retime<br><sub>effect, timing, delivery, trigger and per-stage chunks all read, pinned against the three app-authored builds in olekristensen-v26.3-mac-builds-effects.key; effect and timing decode from KN.AnimationAttributesArchive with database_* fallback, and retiming writes the same fields. Will not create a build — see docs/BLOCKERS.md</sub> | Keynote | ✅ read + write | 1 | current→current |
| Builds: creating an animation<br><sub>withheld until a real animation confirms the read model; a build the app drops is indistinguishable from one never written</sub> | Keynote | ○ roadmap | n/a | — |

### Concurrency

| Capability | Apps | Status | Fixtures | Eras validated |
|---|---|---|---:|---|
| Editing a document open in an app<br><sub>the app rewrites the whole package on autosave; see FORMAT.md §13.1</sub> | all | ✗ out of scope | n/a | — |
| Live iCloud collaboration<br><sub>server-mediated OT over an authenticated protocol; see FORMAT.md §13.2</sub> | all | ✗ out of scope | n/a | — |

## Claims that need a Mac

54 capabilities make a claim the offline suite structurally cannot settle — whether **Apple's own apps** accept what we wrote, as opposed to whether we read Apple's files
correctly. They are listed with their reasoning and repro steps in
[`docs/VERIFICATION.md`](VERIFICATION.md):

- 🔴 high — Container → **Edit cycle: open → edit → save → reopen** *(covered by `npm run test:e2e`)*
- 🟠 medium — Container → **New document from nothing (blank)** *(covered by `npm run test:e2e`)*
- 🟠 medium — Text & styles → **Paragraph & character styles (by name, plus creation and editing)**
- 🟡 low — Text & styles → **Character properties (font, colour, highlight, underline, strike, caps, shadow…)**
- 🟡 low — Text & styles → **Paragraph background & borders (rule stroke + positions)**
- 🟡 low — Text & styles → **Paragraph rule offset (text-to-border distance)**
- 🟡 low — Text & styles → **Shared style values (colour incl. P3, gradients, strokes, shadows, padding)**
- 🟡 low — Text & styles → **Hyperlinks**
- 🟠 medium — Text & styles → **Page numbers and page counts (insert, read, remove)**
- 🟡 low — Text & styles → **Paragraph writing direction (read + write)**
- 🟡 low — Text & styles → **Placeholder text (list, fill, define)**
- 🟠 medium — Text & styles → **Date fields and bookmarks (read + create)**
- 🟠 medium — Text & styles → **Comment creation and removal**
- 🟠 medium — Text & styles → **Footnote creation and removal**
- 🟡 low — Text & styles → **Table of contents (rules read + write, cached entries read)**
- 🔴 high — Drawables & media → **Placement (copy onto a page/slide/sheet, remove, reorder in z)**
- 🟡 low — Drawables & media → **Drawable style (fill, stroke, opacity, shadow, reflection)**
- 🟡 low — Drawables & media → **Drawable shadows (enabled, angle, offset, blur, opacity)**
- 🟡 low — Drawables & media → **Image cropping (set, move, remove a mask)**
- 🔴 high — Drawables & media → **Inline image insertion**
- 🔴 high — Drawables & media → **Inline image placement in an indented column**
- 🟠 medium — Drawables & media → **Floating (non-inline) drawable placement**
- 🟠 medium — Pages → **Sections (read + insert)**
- 🟡 low — Pages → **Headers & footers (3 columns × first/even/odd)**
- 🟡 low — Pages → **Page setup (size, margins, orientation)**
- 🔴 high — Numbers & tables → **Sheets (add, duplicate, rename, move, remove)**
- 🔴 high — Numbers & tables → **Table cell writing (text, number, date, bool, duration)** *(covered by `npm run test:e2e`)*
- 🟡 low — Numbers & tables → **Cell styling (fill, four borders, padding, alignment, wrap)**
- 🟠 medium — Numbers & tables → **Table styling (banded rows, grid strokes, visibility)**
- 🟠 medium — Numbers & tables → **Table structure (rows, columns, bands, sizes, freeze, repeat)**
- 🟠 medium — Numbers & tables → **Merged cell ranges**
- 🟡 low — Numbers & tables → **Cell display formats (number, currency, percentage, date, duration, text, boolean)**
- 🟠 medium — Numbers & tables → **Formula reading (AST rendered to text)**
- 🟠 medium — Numbers & tables → **Formula function names** *(covered by `npm run test:e2e`)*
- 🟠 medium — Numbers & tables → **Cell controls (checkbox, star rating, slider, stepper, pop-up menu)**
- 🟠 medium — Numbers & tables → **Pop-up menu creation (TST.PopUpMenuModel)**
- 🔴 high — Numbers & tables → **Formula writing (authoring an AST)**
- 🟠 medium — Numbers & tables → **Add and remove tables on a sheet**
- 🟡 low — Numbers & tables → **Chart data editing (values, names, series, categories)**
- 🟡 low — Numbers & tables → **Chart appearance: type and series colours**
- 🟡 low — Numbers & tables → **Chart appearance: axes, legend, gridlines**
- 🟡 low — Numbers & tables → **Conditional formatting rules**
- 🟠 medium — Numbers & tables → **Conditional formatting: apply an existing rule set to more cells**
- 🔴 high — Numbers & tables → **Conditional formatting: authoring new rules**
- 🟠 medium — Numbers & tables → **Filters: enable, disable, combining mode**
- 🟡 low — Numbers & tables → **Categories: enable or disable grouping**
- 🟠 medium — Numbers & tables → **Categories: regrouping rows after an edit**
- 🔴 high — Keynote → **Slide management (add, duplicate, move, remove)**
- 🟠 medium — Keynote → **Speaker notes**
- 🟠 medium — Keynote → **Transitions**
- 🟠 medium — Keynote → **Presentation settings (mode, loop, autoplay delays, slide size)**
- 🟠 medium — Keynote → **Slide placeholders (title, body, slide number) — read and fill**
- 🟠 medium — Keynote → **Skipped slides**
- 🔴 high — Keynote → **Builds (animations): read and retime**

## Validation gaps

**Implemented but exercised by no fixture** — spec-derived only:

- Container → **Wrapper-directory layout**
- Container → **Mixed-codec packages (LZFSE component beside Snappy)**
- Keynote → **Transitions**
- Keynote → **Skipped slides**

**Thinly validated** (1–2 fixtures — no cross-check if an encoding varies):

- Container → **Nested Index.zip layout** (2)
- Object graph → **Unknown type IDs preserved across edits** (1)
- Text & styles → **Footnote creation and removal** (1)
- Text & styles → **Change tracking (insertions/deletions)** (1)
- Text & styles → **Table of contents (rules read + write, cached entries read)** (2)
- Drawables & media → **Image filters / adjustments** (2)
- Pages → **Master-page drawables** (2)
- Pages → **Page-layout (body-less) documents** (2)
- Numbers & tables → **Charts (type, categories, series, values)** (2)
- Numbers & tables → **Chart data editing (values, names, series, categories)** (2)
- Numbers & tables → **Chart appearance: type and series colours** (1)
- Numbers & tables → **Chart appearance: axes, legend, gridlines** (2)
- Numbers & tables → **Categories (row grouping, nesting, date bucketing)** (1)
- Numbers & tables → **Categories: regrouping rows after an edit** (1)
- Keynote → **Builds (animations): read and retime** (1)

## Fixture inventory

| File | App | Era | Format | Build |
|---|---|---|---|---|
| `compphysics-poster-images-masks.pages` | Pages | iwork16 | 2.2.4 | `M6.2-4582-1` |
| `desmarais-notes-comments-tables.pages` | Pages | iwork19 | 4.1.7 | `M8.1-6369-2` |
| `desmarais-notes-sections-hyperlinks.pages` | Pages | iwork19 | 4.1.7 | `M8.1-6369-2` |
| `draftjs-v2.3-comments.pages` | Pages | iwork16 | 2.3.4 | `M6.3.1-5249-2` |
| `gomap-v26.1-newest-writer.pages` | Pages | current | 26.1.0 | `M15.2.1-7048.0.3-2` |
| `iwork-mcp-v14.5-earnings.numbers` | Numbers | modern | 14.4.1 | `M14.5-7045.0.17-4` |
| `iwork-mcp-v14.5-sample.key` | Keynote | modern | 14.4.1 | `M14.5-7045.0.17-4` |
| `iwork-mcp-v14.5-sample.pages` | Pages | modern | 14.4.1 | `M14.5-7045.0.17-4` |
| `libetonyek-pages5-extra-dir.pages` | Pages | iwork19 | 3.2.13 | `G-r320-3C102` |
| `libetonyek-pages5-file.pages` | Pages | iwork13 | 1.5.0 | `M5.5.3-2152-2` |
| `ndpi-v10.0-change-tracking.pages` | Pages | modern | 10.0.10 | `M10.0-6748-2` |
| `npm-keynote-extractor-v2.0.24-macos-images-masks.key` | Keynote | iwork16 | 2.0.24 | `M6.6.2-2571-1` |
| `numbers-parser-v14.4-issue102.numbers` | Numbers | modern | 14.4.1 | `M14.5-7045.0.17-4` |
| `numbers-parser-v26.0-categories.numbers` | Numbers | current | 26.0.0 | `M15.1-7044.0.271-2` |
| `numbers-parser-v26.0-issue102.numbers` | Numbers | current | 26.0.0 | `M15.1-7044.0.271-2` |
| `numbers-parser-v26.1-custom-formats.numbers` | Numbers | current | 26.1.0 | `M15.2.1-7048.0.3-2` |
| `numbers-parser-v26.1-date-formats.numbers` | Numbers | current | 26.1.0 | `M15.2.1-7048.0.3-2` |
| `numbers-parser-v26.1-form-sheet.numbers` | Numbers | current | 26.1.0 | `M15.2-7046.0.71-2` |
| `numbers-parser-v26.1-xlsx-lineage.numbers` | Numbers | current | 26.1.0 | `M15.2.1-7048.0.3-2` |
| `olekristensen-v14.4-placeholders-image.pages` | Pages | modern | 14.4.1 | `M14.4-7043.0.93-4` |
| `olekristensen-v26.3-demo06-formulas-returned.numbers` | Numbers | current | 26.3.1 | `M15.3.1-7050.1.1-2` |
| `olekristensen-v26.3-demo06-formulas-round2.numbers` | Numbers | current | 26.3.1 | `M15.3.1-7050.1.1-2` |
| `olekristensen-v26.3-demo07-rules-returned.numbers` | Numbers | current | 26.3.1 | `M15.3.1-7050.1.1-2` |
| `olekristensen-v26.3-demo07-rules-round2.numbers` | Numbers | current | 26.3.1 | `T15.3 (7375.0.54)` |
| `olekristensen-v26.3-demo07-rules-round3.numbers` | Numbers | current | 26.3.1 | `M15.3.1-7050.1.1-2` |
| `olekristensen-v26.3-demo08-structure-round2.numbers` | Numbers | current | 26.3.1 | `M15.3.1-7050.1.1-2` |
| `olekristensen-v26.3-demo11-shadows-returned.pages` | Pages | current | 26.3.1 | `M15.3.1-7050.1.1-2` |
| `olekristensen-v26.3-ios-borders-logical.pages` | Pages | current | 26.3.1 | `T15.3 (7375.0.54)` |
| `olekristensen-v26.3-ios-placeholder-consumed.pages` | Pages | current | 26.3.1 | `T15.3 (7375.0.54)` |
| `olekristensen-v26.3-ios-rtl-direction.pages` | Pages | current | 26.3.1 | `T15.3 (7375.0.54)` |
| `olekristensen-v26.3-mac-borders-logical.pages` | Pages | current | 26.3.1 | `M15.3-7050.0.24-2` |
| `olekristensen-v26.3-mac-builds-effects.key` | Keynote | current | 26.3.1 | `M15.3-7050.0.24-2` |
| `olekristensen-v26.3-mac-conditional-rules.numbers` | Numbers | current | 26.3.1 | `M15.3-7050.0.24-2` |
| `olekristensen-v26.3-mac-filters.numbers` | Numbers | current | 26.3.1 | `M15.3-7050.0.24-2` |
| `olekristensen-v26.3-mac-placeholder-consumed.pages` | Pages | current | 26.3.1 | `M15.3-7050.0.24-2` |
| `olekristensen-v26.3-seed-checkbox-returned.numbers` | Numbers | current | 26.3.1 | `M15.3.1-7050.1.1-2` |
| `olekristensen-v26.3-seed-crop-returned.pages` | Pages | current | 26.3.1 | `M15.3.1-7050.1.1-2` |
| `patrickomatic-pages26-sections-masks.pages` | Pages | current | 26.1.0 | `M15.2.1-7048.0.3-2` |
| `patrickomatic-termpaper-footers-masks.pages` | Pages | current | 26.1.0 | `M15.2.1-7048.0.3-2` |
| `picodocs-v14.4-headers-tables.pages` | Pages | modern | 14.4.1 | `M14.5-7045.0.17-4` |
| `picopalette-v3.2-multisection-footnotes.pages` | Pages | iwork19 | 3.2.13 | `M7.2-5869-2` |
| `pypi-numbers-parser-v14.1.1-empty-template.numbers` | Numbers | modern | 14.1.1 | `M14.1-7040.0.73-4` |
| `rougier-v13.1-image-filters-masks.pages` | Pages | modern | 13.1.2 | `M13.1-7037.0.101-2` |
| `threatconnect-v11.1-headers-footers-sections.pages` | Pages | modern | 11.1.2 | `M11.1-7031.0.102-2` |
| `tika-testKeynote2013.key` | Keynote | iwork16 | 2.0.24 | `T2.6.1 (2180)` |
| `tika-testKeynote2018.key` | Keynote | iwork19 | 3.2.13 | `G-r320-3D139` |
| `tika-testNumbers2013.numbers` | Numbers | iwork16 | 2.0.24 | `T2.6.1 (2163)` |
| `tika-testPages2013.pages` | Pages | iwork16 | 2.0.24 | `T2.6.1 (2160)` |
| `tudortmund-v14.1-footers-table.pages` | Pages | modern | 14.1.1 | `M14.1-7040.0.73-4` |
| `tudortmund-v4.2-footers-table.pages` | Pages | iwork19 | 4.2.3 | `M8.2-6520-2` |
| `vertx-v2.2-image-filters.pages` | Pages | iwork16 | 2.2.4 | `M6.2-4582-1` |
| `zenodo-v13.1-tables-images.key` | Keynote | modern | 13.1.2 | `M13.1-7037.0.101-2` |
| `zenodo-v26.0-ios-writer.key` | Keynote | current | 26.0.0 | `T15.1 (7373.0.281)` |
| `zenodo-v26.1-hyperlinks-masks.key` | Keynote | current | 26.1.0 | `M15.2.1-7048.0.3-2` |
| `zenodo-v26.1-pptx-lineage.key` | Keynote | current | 26.1.0 | `M15.2.1-7048.0.3-2` |

See `fixtures/ATTRIBUTION.md` for sources, licences and the fixture privacy policy.
