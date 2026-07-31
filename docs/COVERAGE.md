# Coverage matrix

**Generated — do not edit.** Run `npm run coverage` to regenerate; `npm run coverage:check`
fails when this file is out of date with the fixtures and capability table.

Support status is declared in `scripts/coverage-matrix.ts`. Validation is *measured*: each
capability is probed against every fixture, so a row can read “implemented” and “validated by
zero fixtures” at the same time — which is exactly the thing worth knowing.

## Version coverage

| App | iwork13 | iwork16 | iwork19 | modern | current | Total | Newest format | Newest build |
|---|---:|---:|---:|---:|---:|---:|---|---|
| **Pages** | 1 | 4 | 5 | 6 | 3 | 19 | 26.1.0 | `M15.2.1-7048.0.3-2` |
| **Numbers** | · | 1 | · | 3 | 6 | 10 | 26.1.0 | `M15.2.1-7048.0.3-2` |
| **Keynote** | · | 2 | 1 | 2 | 3 | 8 | 26.1.0 | `M15.2.1-7048.0.3-2` |

Eras are classified from `fileFormatVersion`; see `docs/FORMAT.md` §11. 
Corpus: **37 documents**. Every one round-trips byte-identically.

## Feature coverage

Legend: ✅ read + write · 🔍 read only · ⚠️ experimental · ○ roadmap · ✗ out of scope

### Container

| Capability | Apps | Status | Fixtures | Eras validated |
|---|---|---|---:|---|
| Flat zip layout | all | ✅ read + write | 35 | all |
| Nested Index.zip layout | all | ✅ read + write | 2 | iwork19→iwork19 |
| Wrapper-directory layout | all | ✅ read + write | **0** | — |
| Byte-identical round-trip of untouched content<br><sub>enforced for every fixture by the compatibility suite</sub> | all | ✅ read + write | 37 | all |
| Edit cycle: open → edit → save → reopen<br><sub>every modern document in the corpus is edited and re-read by test/edit-cycle.test.ts, which also compares a census — objects, components, text, tables, cells, formulas, merges, charts, styles, unknown archive types — before and after, so an edit that lands while dropping something else fails</sub> | all | ✅ read + write | 37 | all |
| Mixed-codec packages (LZFSE component beside Snappy)<br><sub>undecodable components stay opaque and are preserved, never fatal</sub> | all | 🔍 read only | **0** | — |
| iWork '09 XML documents<br><sub>detected and rejected with a clear error</sub> | all | ✗ out of scope | n/a | — |
| Password-protected documents<br><sub>detected via .iwph and rejected</sub> | all | ✗ out of scope | n/a | — |

### Object graph

| Capability | Apps | Status | Fixtures | Eras validated |
|---|---|---|---:|---|
| Unknown type IDs preserved across edits<br><sub>forward compatibility; registerTypes() can name them at runtime</sub> | all | ✅ read + write | 1 | iwork13→iwork13 |
| Multi-payload archives | all | 🔍 read only | 27 | iwork19→current |
| Older-reader compatibility diffs (type-0 patches)<br><sub>preserved verbatim; not recomputed when the base message changes</sub> | all | 🔍 read only | 9 | modern→current |
| Versioned style snapshots (styles_for_*) | all | 🔍 read only | 23 | modern→current |

### Text & styles

| Capability | Apps | Status | Fixtures | Eras validated |
|---|---|---|---:|---|
| Text read/edit with full attribute-table fixup | all | ✅ read + write | 37 | all |
| Paragraph & character styles (by name, plus creation and editing) | all | ✅ read + write | 37 | all |
| Character properties (font, colour, highlight, underline, strike, caps, shadow…) | all | ✅ read + write | 37 | all |
| Paragraph properties (indents, spacing, keeps, hyphenation, outline level) | all | ✅ read + write | 37 | all |
| Tab stops (position, alignment, leader) | all | ✅ read + write | 33 | all |
| Paragraph background & borders (rule stroke + positions)<br><sub>border_positions semantics inferred, not proven by rendering</sub> | all | ✅ read + write | 20 | all |
| Shared style values (colour incl. P3, gradients, strokes, shadows, padding)<br><sub>one vocabulary shared by text, table and drawable styling</sub> | all | ✅ read + write | 37 | all |
| List styles | all | ✅ read + write | 19 | all |
| Hyperlinks | all | ✅ read + write | 9 | iwork16→current |
| Page numbers and page counts (insert, read, remove)<br><sub>an attachment at a U+FFFC placeholder, not text; the rendered value comes from pagination and is never invented</sub> | all | ✅ read + write | 23 | iwork16→current |
| Smart fields (page number, date, merge, …) | all | 🔍 read only | 12 | iwork16→current |
| Date fields and bookmarks (read + create)<br><sub>a date field spans real text the app rewrites, so the display text is supplied rather than formatted here</sub> | all | ✅ read + write | 4 | iwork16→modern |
| Bookmarks | all | 🔍 read only | 3 | iwork16→modern |
| Comment creation and removal<br><sub>reuses the document's existing annotation author rather than duplicating them</sub> | all | ✅ read + write | 2 | iwork16→iwork19 |
| Footnote creation and removal<br><sub>the reference is a U+000E in its own table; the note is a separate storage of footnote kind</sub> | Pages | ✅ read + write | 1 | iwork19→iwork19 |
| Footnotes / endnotes<br><sub>creating footnotes is not implemented</sub> | Pages | 🔍 read only | 1 | iwork19→iwork19 |
| Comments<br><sub>creating comments is not implemented</sub> | all | 🔍 read only | 2 | iwork16→iwork19 |
| Change tracking (insertions/deletions)<br><sub>tables preserved and index-shifted correctly; no semantic API</sub> | all | 🔍 read only | 1 | modern→modern |
| Table of contents (rules read + write, cached entries read)<br><sub>collection rules are editable; cached entries are a layout result this library will not invent</sub> | Pages | ✅ read + write | 2 | iwork19→iwork19 |

### Drawables & media

| Capability | Apps | Status | Fixtures | Eras validated |
|---|---|---|---:|---|
| Placement (copy onto a page/slide/sheet, remove, reorder in z)<br><sub>one abstraction over three containers; copies are deep so the two objects are independent</sub> | all | ✅ read + write | 27 | iwork16→current |
| Drawable style (fill, stroke, opacity, shadow, reflection)<br><sub>where shadows live — cell and table styles have no shadow field at all</sub> | all | ✅ read + write | 37 | all |
| Drawable shadows (enabled, angle, offset, blur, opacity) | all | ✅ read + write | 37 | all |
| Geometry (enumerate, move, resize) | all | ✅ read + write | 34 | iwork16→current |
| Image filters / adjustments | all | ✅ read + write | 2 | iwork16→modern |
| Image cropping (set, move, remove a mask) | all | ✅ read + write | 14 | iwork16→current |
| Image masks | all | 🔍 read only | 14 | iwork16→current |
| Media variant resolution (unmaterialized originals) | all | 🔍 read only | 9 | iwork16→current |
| Inline image insertion<br><sub>Data/ plumbing with SHA-1 dedupe; not verified in the app</sub> | Pages | ⚠️ experimental | n/a | — |
| Floating (non-inline) drawable placement<br><sub>per-page groups, each entry wrapped in a TP.DrawableEntry; copies are deep, sharing styles and themes</sub> | Pages | ✅ read + write | 9 | iwork16→current |

### Pages

| Capability | Apps | Status | Fixtures | Eras validated |
|---|---|---|---:|---|
| Sections (read + insert)<br><sub>validation counts multi-section documents only</sub> | Pages | ✅ read + write | 5 | iwork19→current |
| Headers & footers (3 columns × first/even/odd) | Pages | ✅ read + write | 6 | iwork19→modern |
| Master-page drawables | Pages | 🔍 read only | 1 | iwork19→iwork19 |
| Page setup (size, margins, orientation) | Pages | ✅ read + write | 19 | all |
| Page-layout (body-less) documents | Pages | ✅ read + write | 2 | iwork16→modern |
| Text boxes | Pages | ✅ read + write | 8 | iwork16→current |
| Document settings (hyphenation, ligatures, footnote config) | Pages | ✅ read + write | 19 | all |

### Numbers & tables

| Capability | Apps | Status | Fixtures | Eras validated |
|---|---|---|---:|---|
| Sheets (add, duplicate, rename, move, remove)<br><sub>a duplicated sheet deep-copies its tables, so the two tabs edit different cells</sub> | Numbers | ✅ read + write | 10 | iwork16→current |
| Table cell reading — modern BNC/v5 storage<br><sub>numbers, text, rich text, dates, booleans, durations, merges</sub> | all | 🔍 read only | 18 | iwork19→current |
| Table cell reading — pre-BNC storage (iWork '13/'15)<br><sub>text, numbers and dates. Layout measured from the corpus itself (`npm run prebnc`), not documented anywhere; a record shape that was not measured is refused and counted by undecodedPreBncCells() rather than guessed. Writing this storage is out of scope — a current app converts these files on open</sub> | all | 🔍 read only | 4 | iwork16→iwork16 |
| Table cell writing (text, number, date, bool, duration)<br><sub>string-table refcounting, offsets and legacy stubs rebuilt; formats and styles on the cell preserved</sub> | all | ✅ read + write | 18 | iwork19→current |
| Cell styling (fill, four borders, padding, alignment, wrap) | all | ✅ read + write | 18 | iwork19→current |
| Table styling (banded rows, grid strokes, visibility) | all | ✅ read + write | 22 | iwork16→current |
| Table structure (rows, columns, bands, sizes, freeze, repeat)<br><sub>row and column insert/delete rebuild tiles, headers and the row-tile tree</sub> | all | ✅ read + write | 22 | iwork16→current |
| Merged cell ranges<br><sub>mergeCells/unmergeCells. A merge we build for a rectangle Apple also merged is byte-identical to Apple's own node — cross-table info, sticky bits, tract and the SUM wrapper — reconstructed from the object graph, not copied</sub> | all | ✅ read + write | 5 | modern→current |
| Cell display formats (number, currency, percentage, date, duration, text, boolean)<br><sub>category comes from which record flag carries the id, not from the format's own type code; custom formats are read and preserved but cannot be authored</sub> | all | ✅ read + write | 17 | iwork19→current |
| Formula reading (AST rendered to text)<br><sub>not a Numbers feature — Pages and Keynote tables carry the same calc-engine archives</sub> | all | 🔍 read only | 7 | iwork19→current |
| Formula function names<br><sub>only ids proven by arithmetic are named; the rest render as FUNCTION_<id>. Extend with registerFormulaFunctions()</sub> | all | ⚠️ experimental | 6 | iwork19→current |
| Cross-table formula references resolved to table names<br><sub>via the calc-engine owner map; all 1020 cross-table references in the corpus name their table</sub> | all | 🔍 read only | 1 | current→current |
| Cell controls (checkbox, star rating, slider, stepper, pop-up menu)<br><sub>NO FIXTURE in this repository: interaction_type was measured from public widget-demo documents, read and discarded (4 stepper, 5 slider, 6 star rating, 7 pop-up menu, 8 checkbox). Shape is still classified by populated fields, so an unrecognised code degrades rather than misreads</sub> | Numbers | 🔍 read only | **0** | — |
| Formula writing (authoring an AST)<br><sub>setFormula parses infix text and compiles it: operators, parentheses, relative and anchored references, ranges, nested calls, omitted arguments, and any of the 271 harvested functions. Nothing evaluates — pass the cached result as `value`. Cross-table references and arrays are refused: both need a calc-engine identity registered elsewhere</sub> | all | ⚠️ experimental | n/a | — |
| Charts (type, categories, series, values) | all | 🔍 read only | 2 | iwork16→iwork16 |
| Add and remove tables on a sheet<br><sub>copies an existing table and renames it — Numbers addresses tables by name, so a duplicate makes cross-table formulas ambiguous</sub> | Numbers | ✅ read + write | 10 | iwork16→current |
| Chart data editing (values, names, series, categories)<br><sub>the grid's id map and the sparse per-series style arrays are kept in step; chart appearance is not modelled</sub> | all | ✅ read + write | 2 | iwork16→iwork16 |
| Chart appearance (type, colours, axes, legend)<br><sub>read as opaque style references; changing them needs the TSCH style model</sub> | all | ○ roadmap | n/a | — |
| Conditional formatting rules<br><sub>conditions decoded from the rule's formula, which states the comparison; predicate_type carried through opaque</sub> | all | 🔍 read only | 1 | current→current |
| Conditional formatting: apply an existing rule set to more cells | all | ✅ read + write | 1 | current→current |
| Conditional formatting: authoring new rules<br><sub>needs a predicate_type value for each condition the UI offers; only 2 of the enum's members appear in the corpus</sub> | all | ○ roadmap | n/a | — |
| Filters (mode, enable state, per-column rules)<br><sub>every filter set in the corpus is empty, so rule reading is schema-derived; the container, mode and enable flag are fixture-proven</sub> | all | 🔍 read only | 12 | modern→current |
| Filters: enable, disable, combining mode | all | ✅ read + write | 12 | modern→current |
| Categories (row grouping, nesting, date bucketing)<br><sub>group membership cross-checked against cell contents; every group in every fixture agrees</sub> | all | 🔍 read only | 1 | current→current |
| Categories: enable or disable grouping | all | ✅ read + write | 12 | modern→current |
| Categories: authoring a grouping, and per-group summaries<br><sub>grouping means computing the tree, which is the app's job; no fixture has a non-empty aggregate list, so summary rows are read but unexercised</sub> | all | ○ roadmap | n/a | — |
| Row and column identities (TST.ColumnRowUIDMapArchive)<br><sub>resolves the UIDs categories, hidden states and the calc engine use back to positions</sub> | all | 🔍 read only | 22 | iwork16→current |
| Filters: authoring rules and recomputing hidden rows<br><sub>a rule set alone does not hide rows — TST.HiddenStateExtentArchive records the result, and recomputing it means evaluating the predicates</sub> | all | ○ roadmap | n/a | — |

### Keynote

| Capability | Apps | Status | Fixtures | Eras validated |
|---|---|---|---:|---|
| Slide management (add, duplicate, move, remove)<br><sub>new slides deep-copy their content and share their layout, styles and theme</sub> | Keynote | ✅ read + write | 8 | iwork16→current |
| Slide tree (both generations, presentation order) | Keynote | ✅ read + write | 8 | iwork16→current |
| Speaker notes | Keynote | ✅ read + write | 2 | iwork16→iwork16 |
| Transitions<br><sub>validation requires a deck with a non-'none' effect</sub> | Keynote | ✅ read + write | **0** | — |
| Presentation settings (mode, loop, autoplay delays, slide size)<br><sub>defaults come from the schema, not from zero — every corpus deck omits several and relies on them</sub> | Keynote | ✅ read + write | 8 | iwork16→current |
| Slide placeholders (title, body, slide number) — read and fill<br><sub>fills a placeholder the slide already carries; creating one needs the theme's geometry for that role</sub> | Keynote | ✅ read + write | 8 | iwork16→current |
| Master / layout slides | Keynote | 🔍 read only | 8 | iwork16→current |
| Builds (animations): read and retime<br><sub>NO FIXTURE: schema-derived. Reads and retimes existing builds; will not create one — see docs/BLOCKERS.md priority 4</sub> | Keynote | 🔍 read only | **0** | — |
| Builds: creating an animation<br><sub>withheld until a real animation confirms the read model; a build the app drops is indistinguishable from one never written</sub> | Keynote | ○ roadmap | n/a | — |

### Concurrency

| Capability | Apps | Status | Fixtures | Eras validated |
|---|---|---|---:|---|
| Editing a document open in an app<br><sub>the app rewrites the whole package on autosave; see FORMAT.md §13.1</sub> | all | ✗ out of scope | n/a | — |
| Live iCloud collaboration<br><sub>server-mediated OT over an authenticated protocol; see FORMAT.md §13.2</sub> | all | ✗ out of scope | n/a | — |

## Claims that need a Mac

31 capabilities make a claim the offline suite structurally cannot settle — whether **Apple's own apps** accept what we wrote, as opposed to whether we read Apple's files
correctly. They are listed with their reasoning and repro steps in
[`docs/VERIFICATION.md`](VERIFICATION.md):

- 🔴 high — Container → **Edit cycle: open → edit → save → reopen** *(covered by `npm run test:e2e`)*
- 🟡 low — Text & styles → **Character properties (font, colour, highlight, underline, strike, caps, shadow…)**
- 🟠 medium — Text & styles → **Paragraph background & borders (rule stroke + positions)**
- 🟡 low — Text & styles → **Shared style values (colour incl. P3, gradients, strokes, shadows, padding)**
- 🟠 medium — Text & styles → **Page numbers and page counts (insert, read, remove)**
- 🟠 medium — Text & styles → **Comment creation and removal**
- 🟠 medium — Text & styles → **Footnote creation and removal**
- 🟡 low — Text & styles → **Table of contents (rules read + write, cached entries read)**
- 🔴 high — Drawables & media → **Placement (copy onto a page/slide/sheet, remove, reorder in z)**
- 🟡 low — Drawables & media → **Drawable shadows (enabled, angle, offset, blur, opacity)**
- 🟠 medium — Drawables & media → **Image cropping (set, move, remove a mask)**
- 🟠 medium — Drawables & media → **Floating (non-inline) drawable placement**
- 🔴 high — Numbers & tables → **Sheets (add, duplicate, rename, move, remove)**
- 🔴 high — Numbers & tables → **Table cell writing (text, number, date, bool, duration)** *(covered by `npm run test:e2e`)*
- 🔴 high — Numbers & tables → **Cell styling (fill, four borders, padding, alignment, wrap)**
- 🟠 medium — Numbers & tables → **Table styling (banded rows, grid strokes, visibility)**
- 🟠 medium — Numbers & tables → **Table structure (rows, columns, bands, sizes, freeze, repeat)**
- 🟠 medium — Numbers & tables → **Merged cell ranges**
- 🟠 medium — Numbers & tables → **Cell display formats (number, currency, percentage, date, duration, text, boolean)**
- 🟠 medium — Numbers & tables → **Formula reading (AST rendered to text)**
- 🟠 medium — Numbers & tables → **Formula function names** *(covered by `npm run test:e2e`)*
- 🟠 medium — Numbers & tables → **Cell controls (checkbox, star rating, slider, stepper, pop-up menu)**
- 🔴 high — Numbers & tables → **Formula writing (authoring an AST)**
- 🟠 medium — Numbers & tables → **Add and remove tables on a sheet**
- 🟠 medium — Numbers & tables → **Chart data editing (values, names, series, categories)**
- 🟡 low — Numbers & tables → **Conditional formatting rules**
- 🟠 medium — Numbers & tables → **Conditional formatting: apply an existing rule set to more cells**
- 🟠 medium — Numbers & tables → **Filters: enable, disable, combining mode**
- 🟡 low — Numbers & tables → **Categories: enable or disable grouping**
- 🔴 high — Keynote → **Slide management (add, duplicate, move, remove)**
- 🔴 high — Keynote → **Builds (animations): read and retime**

## Validation gaps

**Implemented but exercised by no fixture** — spec-derived only:

- Container → **Wrapper-directory layout**
- Container → **Mixed-codec packages (LZFSE component beside Snappy)**
- Numbers & tables → **Cell controls (checkbox, star rating, slider, stepper, pop-up menu)**
- Keynote → **Transitions**
- Keynote → **Builds (animations): read and retime**

**Thinly validated** (1–2 fixtures — no cross-check if an encoding varies):

- Container → **Nested Index.zip layout** (2)
- Object graph → **Unknown type IDs preserved across edits** (1)
- Text & styles → **Comment creation and removal** (2)
- Text & styles → **Footnote creation and removal** (1)
- Text & styles → **Footnotes / endnotes** (1)
- Text & styles → **Comments** (2)
- Text & styles → **Change tracking (insertions/deletions)** (1)
- Text & styles → **Table of contents (rules read + write, cached entries read)** (2)
- Drawables & media → **Image filters / adjustments** (2)
- Pages → **Master-page drawables** (1)
- Pages → **Page-layout (body-less) documents** (2)
- Numbers & tables → **Cross-table formula references resolved to table names** (1)
- Numbers & tables → **Charts (type, categories, series, values)** (2)
- Numbers & tables → **Chart data editing (values, names, series, categories)** (2)
- Numbers & tables → **Conditional formatting rules** (1)
- Numbers & tables → **Conditional formatting: apply an existing rule set to more cells** (1)
- Numbers & tables → **Categories (row grouping, nesting, date bucketing)** (1)
- Keynote → **Speaker notes** (2)

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
