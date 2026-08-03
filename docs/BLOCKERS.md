# Open questions, and exactly how to settle each one

Everything not done, with the one fact it is blocked on and the shortest
path to that fact. Settled work is not narrated here: app-verified claims
live in [VERIFICATION.md](VERIFICATION.md) (generated, with the evidence
quoted), measured findings live in the ledger at the bottom, and the full
history is in git.

Three kinds of blocker exist. **A:** an integer enum Apple never published
— reading works (the value is carried through), writing cannot, because a
wrong code produces a file that loads and misbehaves. **B:** a structure
no fixture contains — the schema lets the code be written, nothing proves
it right. **C:** a layout nobody wrote down in files that already exist —
no app needed, just measurement. Before writing a manual procedure, check
the question is not really kind C: most of this page's history was.

Both A and B are settled the same way: one document made in the app, read
back with `npm run probe -- <file>` (reports every unknown in one pass) or
`npm run stress -- <dir>` (every reader over every file; what throws?).

---

## Needs a Mac — three documents to make and three files to open, ~15 minutes total

**1. `rules.numbers` — 5 min.** One numeric column. Add a
conditional-formatting rule using **greater than** and another using
**greater than or equal to** — those two specifically; `=`, `<>`, `<`,
`<=` are already observed (codes 5, 6, 9, 10, exactly where Numbers'
condition menu predicts). Then `npm run harvest:predicates --
rules.numbers` — it ends in `CONFIRMED` or `REFUTED` against the
prediction recorded in `PREDICATE_TYPE_HYPOTHESIS`
(`src/tst/predicates.ts`, never used when reading). While there, add
"between", "text contains" and "is blank": those compile to function
calls and widen the function table.
→ Unblocks the last two conditional-formatting operators. Authoring for
the four observed codes is already byte-identical to Apple's.

**2. `animated.key` — 5 min.** Three slides, a different build effect on
each (say Dissolve, Move In, Anvil); on one, animate a text box delivered
**by line** so the build has chunks; give one build a non-default
duration and delay. Then `npm run probe -- animated.key` — section 4
prints each build's delivery string, effect name and populated attribute
fields.
→ The only gap with no data anywhere: fifteen decks across two borrowed
corpora, 2013–26.1, contain zero animations, so
`src/keynote/builds.ts` is schema-derived with nothing to check it. Also
harvests the **transition effect vocabulary** (the corpus knows only
`"none"`, which is why the Keynote ladder tests auto-advance instead of a
named effect), and settles whether builds survive `duplicateSlide`.

**3. `borders.pages` — 2 min.** Four paragraphs, each with a paragraph
border at a different position — top, bottom, top-and-bottom, all — each
with a distinct rule colour. Then `npm run probe -- borders.pages`.
→ Settles which edge `border_positions` 1 and 2 draw. Established from
4335 corpus styles: **0 is "none"**; but only four styles in the corpus
use a non-zero position, so 1 and 2 may be inverted and 3/4 are
unobserved. Nobody needs to report back: the package's own
`preview.jpg` renders the answer. The trap that wasted 128 documents:
Apple's templates *define* bordered styles that documents never apply —
the paragraphs must carry the border, and `probe` labels each `USED` or
`(defined but unused)` so it cannot be missed twice.

Record each run in the ledger below, then `npm run coverage`.

**Before making any of these**, remember the technique that closed most
of this page: somebody has already made the document you need. Parser
projects keep per-feature test files; public spreadsheets demonstrate
whole function libraries. The rule that keeps borrowing clean: **read the
properties, keep the measurement, discard the file** — nothing borrowed
is committed; what survives is constants naming their evidence and tests
that rebuild the structures from them.

---

## Blocked on evaluation or the app — not on format knowledge

- **Formula authoring: the function table's edge.** Authoring is shipped
  and proven — every parseable corpus formula rebuilds byte-identical to
  Apple's AST, and the e2e recompute probe settled the dependency-ledger
  question (Numbers rebuilds it on open; see VERIFICATION). What remains
  is coverage: any function outside the 272 with measured ids has no
  index. Widening the table is the same harvest against more documents:
  `npm run harvest -- --ingest doc.numbers`, `--emit-sheet probe.tsv`,
  or `--drive` (macOS, drives Numbers directly). It refuses to guess — a
  name is accepted only when every observation agrees.
- **Creating a Keynote build.** Reading ships; creation is withheld
  until the app confirms it — a build the app silently drops looks
  exactly like one never written. (Cell-control creation shipped and is
  app-confirmed; see VERIFICATION.)
- **Creating a category group.** Regrouping shipped (byte-identical on
  unchanged data). Creation is blocked on a group's identity, sort
  position and eight unexplained sidecar fields; bucketed groupings
  ("dates by quarter") additionally mean evaluating the grouping
  formula. **Recomputing filtered rows** is the same class: which rows a
  filter hides lives in `TST.HiddenStateExtentArchive`, and computing it
  means evaluating predicates. (Filter *rule* layout itself is
  schema-derived: every filter set in the corpus is empty — 164 sets,
  163 empty, mode "all" — measured, not unlucky.)
- **Chart appearance: only the app's word left.** Type, series colours,
  axis visibility and gridlines, tick marks and legend styling all read
  and write, copy-on-write against shared style archives. Remaining:
  Pages ladder rung `P20-chart-gridlines` in the app (the corpus still
  has only two charts, so a document with several chart types would
  widen the evidence).
- **Keynote v14 upgrade path.** The current-format ladder (v26, all
  eleven rungs) is app-confirmed; the same rungs against the 14.4.1 base
  — the deck Keynote converts on open, a different code path — are
  generated (`npm run keynote:docs`) and unchecked.

## Standing caveats — deliberate, not pending

- **Pre-BNC (iWork '13-era) cell storage: read-only, by position.** All
  123 corpus records decode and mean something (a month of 2009
  transactions in date order). The reader anchors on the record *end*
  and refuses unmeasured shapes; bit 2's size, the leading words and the
  trailing word stay unnamed and are reported raw. Writing pre-BNC is
  not planned — current apps convert on open, and saving modern is the
  useful operation. Formulas there are not decoded (`isFormula` false
  throughout, never guessed). Re-derive the measurements:
  `npm run prebnc`.
- **Password-protected documents are refused** (`EncryptedDocumentError`)
  — a legal load-bearing property (docs/LEGAL.md), not a TODO.
- **iWork '09 XML is detected and rejected**, never mis-parsed.
- **Editing a document an app has open, and live iCloud collaboration,
  are out of scope** (FORMAT.md §13).
- **Transition effect strings are opaque.** Exposed raw, never invented;
  the vocabulary arrives with `animated.key` above.
- **Eleven corpus components came from a stronger Snappy encoder.**
  They decode as perfectly ordinary Snappy in standard 64 KiB chunks —
  the codec is not in question — but their matches are found better than
  google's greedy encoder finds them (a 263 KiB stylesheet in 42 KiB),
  so re-encoding one with the byte-exact port produces a valid, larger
  component rather than Apple's bytes. Some old iOS-era builds evidently
  linked a different (perhaps optimal-parse) encoder; identifying which
  would mean matching its output the way the two google vintages were
  matched. Harmless unless one is edited, and pinned as the known gap in
  `test/byte-identity.test.ts`.
- **Two fixtures are re-zipped wrapper bundles, not app-written files.**
  Their entries were deflated by whatever tool zipped the bundle;
  byte-identity would mean cloning that tool's deflate, which is not this
  format. Content round-trips; container bytes differ, and the
  byte-identity test names them as the exceptions.

---

## Ledger

Every protocol run gets a row; failed and partial attempts stay.

| Date | Question | App version | Result | Artifact |
|---|---|---|---|---|
| — | function-index harvest (probe sheet) | — | superseded: 271 names harvested from public documents instead; table in effect | `src/tst/function-names.ts` |
| — | border positions | — | **not yet run** — mapping for 1/2 remains inferred | — |
| 2026-07-31 | cross-table names | n/a — file analysis | **solved without an app**: AST `table_id` is a calc-engine *owner* id (`TSCE.FormulaOwnerDependenciesArchive`); all 1020 corpus cross-table references resolve | `src/tsce/owners.ts` |
| — | predicate_type 7/8 | — | **not yet run** — 4 of 6 comparison codes observed | — |
| — | Keynote build vocabulary | — | **not yet run** — no animated deck exists anywhere yet | — |
| 2026-08-01 | cell-control interaction_type | n/a — borrowed documents | **solved**: 4 stepper, 5 slider, 6 star, 7 pop-up, 8 checkbox; also found and fixed the dropped-checkbox bug | `src/tst/controls.ts` |
| 2026-08-01/02 | Pages ladder P00–P19 | Pages (macOS 26.x) | **all rungs confirmed**; twelve well-formed-but-wrong defects found, fixed, pinned | VERIFICATION.md |
| 2026-08-02 | Keynote ladder K00–K10 (v26) | Keynote (macOS + iOS) | **all rungs confirmed**; six defects found (four offline by shape:audit, two by the app), fixed, pinned | VERIFICATION.md |

### Findings from file analysis alone

Expensive to establish, easy to lose, no app involved:

| Finding | Evidence |
|---|---|
| `AST_function_node_index` **212 = DURATION** | In `numbers-parser-v26.1-custom-formats.numbers`, `=$A$11+FUNCTION_212(,,8,22,11,500)` lands exactly 8h22m11.5s after A11's midnight, and sibling rows differing only in the third argument (8→12→24) shift by that many hours. |
| The function index is **not alphabetical**, nor category-then-name | `DURATION` sorts before `SUM` in both orderings, yet is 212 against SUM's 168. The table must be measured. |
| `TOKEN_NODE` marks an **omitted argument**, not a boolean | It carries `AST_token_node_boolean`, so it rendered as `TRUE`; the DURATION arithmetic shows the two leading tokens contribute zero. |
| `AST_function_node_index` **168 = SUM** | `libetonyek-pages5-extra-dir.pages` sums 5500 + 1170 + 1250 to a cached 7920; the `Cats` TOTAL row in both `numbers-parser-*-issue102.numbers` uses the same index. |
| Merges live in the calc engine, not `merge_region_map` | No fixture has a region map. Colon-tract nodes in `merge_owner.formula_store` decode to rectangles where every anchor holds a value and no covered cell does, and the 14.4 and 26.0 saves of one document agree. |
| `TSP.Color` gained an undocumented fixed32 at field 13 in the 26.x era | Present only in 26.x files, always paired with an explicit `rgbspace`, always exactly 1.0 across every document examined. |
| Cell and table styles have no shadow field | `TST.CellStylePropertiesArchive` and `TableStylePropertiesArchive` contain none; shadows are on the drawable's `ShapeStyleArchive`/`MediaStyleArchive`. |
| Media style bags omit `fill`, shifting later fields down one | Confirmed structurally on 1475 style objects: field 2 is a message in a shape bag and a float in a media bag. |
| An AST cross-table `table_id` is a **calc-engine owner id**, not a table id | `TSCE.FormulaOwnerDependenciesArchive` maps owner → object; 418 of 524 owners resolve and every one lands on a `TST.TableInfoArchive`. |
| `TSP.CFUUIDArchive` and `TSP.UUID` are the same 128 bits | Four `uint32` words pack as `lo = w0 \| w1<<32`, `hi = w2 \| w3<<32`; the AST's CFUUID then matches the calc engine's UUID exactly. |
| Derived owner ids are `base + owner_kind` in current files | Holds for 339 of 409 entries carrying a base; older files use unrelated random UUIDs, so the stored `base_owner_uid` is authoritative. |
| Nine of thirteen `owner_kind` values named from files alone | Each derived owner is *used* by a field; matching the field's UUID back to its owner entry names the kind. 1 table, 3 conditional style, 4 hidden rows, 5 merge, 8 categories, 9 summary aggregates, 11 hidden columns, 35 haunted, 200 document — each unanimous across every file that exercises it. |
| `owner_kind` 200 is the **document**, with a hardcoded identity | Every kind-200 owner in all 23 files that have one, across three apps and every era, is `uid = 666` derived from `base = 466`. |
| Conditional formatting and filters share one predicate archive | `TST.FormulaPredicateArchive` is the rule body in both `ConditionalStyleSetArchive` and `FilterRuleArchive`, told apart only by `for_conditional_style`. |
| `predicate_type` 5 = `=` and 9 = `<` | The three rule sets in `numbers-parser-v26.1-xlsx-lineage.numbers` each carry a formula whose terminal AST node is the documented comparison enum, independently stating the condition. |
| Conditional rule sets are interned and refcounted like strings | In the same fixture, three sets cover 1921 cells and each data-list `refcount` (957/734/230) equals its cell count exactly. |
| Filter sets belong to a hidden-state extent, not the table | Reached via `hidden_states_owner → HiddenStatesArchive → HiddenStateExtentArchive.filter_set`; the traversal finds every `FilterSetArchive` in every fixture that has one, across all three apps. |
| Every filter set in the corpus is empty | 20 fixtures contain one; all are mode "all" (one row set is "any"), disabled, with no rules — so filter *rule* layout is schema-derived, not fixture-proven. |
| Category `row_lookup_uids` holds row **indexes**, not UIDs | Across every categorised table in the corpus, the rows a group names hold exactly that group's value in the grouping column, and the groups partition the data rows exactly once. |
| The complete `grouping_type` enum: 0 value, 1 year, 2 year+month, 3 weekday, 4 day, 5 year+week, 6 year+quarter | `numbers-parser-v26.0-categories.numbers` has one table per bucketing. Each code is confirmed by the shape of the dates it produces, not the table's name: year groups are all 1 January, quarter groups only in months 1/4/7/10, week groups each land on the *same weekday*, weekday groups collapse to ≤7 dates in one reference week. |
| `series_theme_styles` is a six-colour palette, not a per-series list | Both corpus charts carry exactly 6, one with 2 series and one with 5. Per-series overrides live in the sparse arrays instead. |
| `SparseReferenceArray.count` equals its entry count | Three observations across two charts: 6 entries/count 6, 5 entries/count 5, 0 entries/count 0. |
| A footnote reference is a **U+000E**, not the U+FFFC every other attachment uses | It lives in `table_footnote`, its own table; the U+FFFC inside the note storage is the *number's* placeholder, anchored in that storage's own attachment table. |
| A comment's author is shared, not per-comment | Every comment in both comment-bearing fixtures points at the same `TSK.AnnotationAuthorArchive`, which is listed once in the document's `AnnotationAuthorStorageArchive`. |
| An image mask's frame is in the **image's** coordinate space | Across the 79 masked images, `image.pos + mask.pos` puts the visible rect at a non-negative position 78 times and the crop window inside the image 75 times, versus 48 for the page-local reading. Full-bleed cases settle it: an image at (-91,-102) carries a mask at (91,102), cropping exactly at the page origin. |
| A mask's path is stretched to `naturalSize`, per axis | Of 79 masks, 30 write the path at exactly `naturalSize`, 12 at a uniform scale, 37 at another scale; one is a plain 100×100 box stretched to 860×880. `naturalSize` equals the mask's frame in every file. |
| Row and column UIDs are **not unique across a document** | A table duplicated from another keeps its source's identities: in the categories fixture, `Uncategorized` row 0 and `Categories` row 0 share a UID. A UID keys a row within its table only. |
| A Pages floating drawable draws only if the document's z-order lists it | Both P19 rungs failed until the copy joined `TP.DrawablesZOrderArchive`; with the entry, both render. Keynote/Numbers keep paint order in-container instead. |
| The paragraph-styles panel reads the theme's `paragraph_style_presets` | A style with name, identifier, map entry and both bags applies but never lists; adding the theme-list entry (the fourth requirement) lists it. |
| A bookmark's `ranged` flag describes the run, not the name | Corpus: `ranged=true` at run lengths 13 and 46, `false` at exactly 1, name orthogonal. Pages, handed a named `ranged=false` bookmark over 13 characters, bookmarked one character; with the flag corrected the same bookmark spans its phrase — accepted by the app. |
| Footnote marks are superscripted by one shared anonymous char style | Bag exactly `{superscript: 1}`, run over the mark only, body U+000E and note U+FFFC alike — 8 body marks and their notes in the footnote fixture all point at one style object. Without it Pages drew the reference on the baseline at body size. |
| Native hyperlinks are styled by the template's own Link style | Identifier `character-style-hyperlink`, name "Link", bag exactly `{underline: 1}` — on every native link run, in every corpus template. Comments and date fields carry no styling convention (5 of 6 comment ranges bare; the sixth sits on a link). |
| A pop-up menu's slot 0 is a bare `NIL_TYPE` None entry | Without it Numbers dropped the first choice; with a *valued* slot 0 the choices returned but the current-value checkmark vanished. Three-way experiment in the app. |
| A Keynote slide's paint-order membership for placeholders is a per-deck convention | 8 of 12 placeholders listed in one deck's `owned_drawables`/z-order, 0 of 33 in another — which is why no ubiquity threshold catches unlisting them, and why the app had to (an added slide rendered entirely empty). |
| Placeholders carry their slide as drawable parent and never declare it | 546 of 546 corpus placeholders, super-depth 3 — the container rule at Keynote-local type ids. |
