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

## Needs a Mac — two seeds staged

`npm run seeds -- out` writes both; each carries its own instructions
and its own expected result.

- `seed-inline-image.pages` — **an eye, not a probe.** Two pictures in a
  paragraph indented 113 pt from the page margin: the first written
  with the in-the-text-flow wrap, the second placed against the page.
  The first starting where its own paragraph's text starts is the pass;
  the two looking identical means only one mode is ever used, whatever
  the file says. Nothing to run, just open and look.
- `seed-collaboration.pages` — open, share via the Samarbejd button (no
  invitation needs sending), save, run the probe, send the file back,
  stop sharing. Collaboration rewrites the package with the two
  components nothing else writes — `OperationStorage.iwa` and
  `ActivityStream.iwa`, LZFSE-framed beside Snappy — and the decoder now
  reads the framing but has never seen a real payload: the returned file
  is both the first redistributable specimen and the measurement of what
  the decoded bytes mean.

Every earlier seed program is returned and banked; the returned files
are fixtures with pins (see ATTRIBUTION.md).

**Before staging a seed**, remember the technique that closed most of
this page: somebody has already made the document you need. Parser
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
- **Keynote builds: creation.** Reading is measured whole — effect,
  timing and delivery decode from `animationAttributes` against the
  fixture deck — and retiming writes the same fields. Creation stays
  withheld until the app confirms a build this library writes from
  nothing: a build the app silently drops looks exactly like one never
  written. (Cell-control creation shipped and is app-confirmed; see
  VERIFICATION.)
- **Creating a category group.** Regrouping shipped (byte-identical on
  unchanged data). Creation is blocked on a group's identity, sort
  position and eight unexplained sidecar fields; bucketed groupings
  ("dates by quarter") additionally mean evaluating the grouping
  formula. **Recomputing filtered rows** is the same class: which rows a
  filter hides lives in `TST.HiddenStateExtentArchive`, and computing it
  means evaluating predicates. (Filter *rule* reading is pinned against
  the populated set in `olekristensen-v26.3-mac-filters.numbers`; rule
  *synthesis* waits for an app round-trip of a library-written rule.)
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
- **Reclaiming a Data/ file nothing points at.** `compact()` collects
  unreachable *archives*, so removing a picture's anchor and compacting
  takes the drawable and its attachment; the image bytes stay. The
  obvious collector is unsafe: every one of the 46 corpus documents has
  `DataInfo` entries that no object's data-reference list mentions —
  most of them all of their entries — because the apps link data through
  a `TSP.DataReference` field inside the archive, not through the
  reference list this library maintains. A reachability scan keyed on
  the list would delete every image in the corpus. Doing this properly
  means finding data references by schema position, which is exactly the
  knowledge `referencedIds` deliberately does without.
- **Collaboration components: framing decoded, payload unmeasured.**
  `decodeLzfseStream` reads the LZFSE container (raw and LZVN blocks;
  FSE blocks refused precisely) and the probe reports what it makes of
  any opaque component, but no redistributable document carries an
  `OperationStorage.iwa` to measure the decoded payload against — the
  staged collaboration seed above is the path. Until then the document
  model keeps LZFSE components opaque and byte-preserved.

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
  the vocabulary arrives with a deck whose slides carry named transitions
  — the seed build deck measures builds, not transitions.
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
| 2026-08-03 | border positions | Pages (macOS, Danish UI), via seed-borders | **solved, and the old guess refuted**: a *bitmask* — 1 top, 2 bottom, 3 top+bottom, 15 all four; the enum reading (ALL = 4) would have drawn one vertical edge. Which of bits 4/8 is left vs right — and whether the pair is visual or logical (an RTL paragraph flips a logical pair) — remains unassigned | `src/tswp/schema.ts`, test/styling.test.ts |
| 2026-08-03 | border bits 4/8 + RTL | Pages (macOS, Danish UI), via seed-borders v2 | **left and right assigned**: red left-only = 4, blue right-only = 8, the probe's stroke colours naming their paragraphs. The RTL leg failed its precondition — the Hebrew-first paragraph rendered LTR with the Danish tail folded into the same line, so unset `writing_direction` is not "natural" — leaving visual-vs-logical open; the regenerated seed writes an explicit RTL paragraph style instead | `src/tswp/schema.ts`, test/styling.test.ts |
| 2026-08-03 | paragraph `writing_direction` value | Pages (macOS, Danish UI), via seed-borders v4 | **value 2 refuted as RTL**: a Hebrew paragraph styled `writingDirection: 2` rendered left-aligned. The caret's behaviour inside the Hebrew (a typed space appears to the caret's right) is run-level Unicode bidi, present in any paragraph, and says nothing about paragraph base direction. The honoured value is unmeasured; the v5 seed ladders 0/1/2 and has the person border the line that stands right-aligned | `scripts/make-seeds.ts`, `src/tss/stylesheet.ts` |
| 2026-08-03 | end-of-storage editing smear | field report: an agent editing a real letterhead template, verified by Pages rendering + a bisect ladder | **bug confirmed and fixed**: edits whose range reached `text.length` left the new final empty paragraph without its para-style entry, and Pages drops body styling whole when any paragraph lacks one. Corpus measurement made the rule exact — an entry at `text.length` exists iff the text ends with a terminator (31/31 vs 0/1270) — and the writer now derives it from the new text. The same report drove the offset-safety layer (stale ranges throw; `applyEdits`) | `src/tswp/textstorage.ts`, test/text-endedit.test.ts |
| 2026-08-03 | `writing_direction` ladder (style bag) | Pages (macOS, Danish UI), via seed-borders v5 | **the whole style-bag route refuted**: styled 0, 1 and 2 rendered identically left-aligned, and the caret differed in-word vs line-start exactly as run-level bidi inside an LTR paragraph predicts. With no corpus style carrying the field, direction does not live there; the v6 seed writes the storage's `table_para_bidi` pairs instead (1 as the RTL candidate beside the observed 0 and 65535) | `scripts/make-seeds.ts`, `scripts/probe-unknowns.ts` |
| 2026-08-03 | border side bits under RTL | Pages (iOS, T15.3 writer), via the final seed-borders round | **CLOSED — the side bits are logical**: a green left-edge border on a genuinely RTL paragraph (direction written by this library; the (1, 0) pair survived the app's resave untouched) stored **8**, so 4 is the *leading* edge and 8 the *trailing*, swapping visual sides with the paragraph's direction. Red 4 / blue 8 re-confirmed in LTR in the same file. `BorderPosition` gains `LEADING`/`TRAILING`, with `LEFT`/`RIGHT` staying as the LTR aliases | `src/tswp/schema.ts`, test/styling.test.ts |
| 2026-08-03 | paragraph direction | Pages (iOS, T15.3 writer), app-flipped seed returned | **SOLVED — the app's own write names the mechanism**: flipping a paragraph writes only the storage's bidi pair, **(1, 0)** — first slot the direction (0 LTR / 1 RTL / 65535 natural), second slot 0 — with the paragraph style untouched and alignment still natural. Our ladder's (1, 1) was one slot off, which is why it rendered LTR, and the derived-cache reading falls with it. `setParagraphDirection` now writes the measured pair | `src/tswp/textstorage.ts`, test/direction.test.ts |
| 2026-08-03 | placeholder authoring | Pages (iOS, T15.3 writer), via seed-placeholder + the returned file | **confirmed through the native lifecycle**: one tap selected the library-defined span whole, typing replaced it, and the resave shows the field consumed — the app treated our archive exactly as its own. The filled line edited as plain text. Also the first iOS-written artifact over library-authored bytes | `scripts/coverage-matrix.ts` |
| 2026-08-03 | bidi-pair ladder (`table_para_bidi`) | Pages (iOS, Danish UI), via seed-borders v6 | **pairs refuted as an input too**: bidi (1,1), (0,0) and (65535,65535) all rendered left-aligned — and the donor's Body alignment is measured *natural* (4, own and resolved), so alignment masked nothing. Together with the style-bag refutation the model that fits is that both fields are derived values the app recomputes, like the calc engine's dependency ledger. The v8 seed inverts the measurement: the person flips a staged Hebrew line with the app's own direction control and returns the file, and the diff names the mechanism | `scripts/make-seeds.ts` |
| 2026-07-31 | cross-table names | n/a — file analysis | **solved without an app**: AST `table_id` is a calc-engine *owner* id (`TSCE.FormulaOwnerDependenciesArchive`); all 1020 corpus cross-table references resolve | `src/tsce/owners.ts` |
| 2026-08-03 | predicate_type 7/8 | Numbers (macOS, Danish UI), via seed-rules + seed-filters | **solved — the menu-order prediction confirmed whole**: 7 = `>` (twice over: a conditional rule and a filter), 8 = `>=`, each stated by its own formula. All six comparison codes observed; setConditionalRules writes all six | `src/tst/predicates.ts`, test/conditional-writing.test.ts |
| 2026-08-03 | filter rules + predicate_type 3 | Numbers (macOS, Danish UI), via seed-filters | **first non-empty filter set anywhere — rules read**, filters and conditional formatting sharing the predicate encoding. Type 3 is "text contains": `NOT(ISERROR(f(needle, cell)))` with `f` the unnamed function index 296 (SEARCH is 131). Filter formulas render `OTHER_TABLE::` — the filter owner's references resolve to no named table yet | `scripts/probe-unknowns.ts` |
| 2026-08-03 | Keynote build vocabulary | Keynote (macOS, Danish UI), via seed-builds | **half confirmed, half refuted**: three builds survive authoring; the slide↔build graph and delivery read correctly, delivery storing English display strings ("All at Once", "By Paragraph") under a Danish UI. Every `database_*` field (effect, duration, delay) was absent — even with 3 s / 1 s set by hand — so effect and timing live in `animationAttributes` (field 18), undecoded. The saved deck's bytes are the outstanding evidence | `src/keynote/builds.ts` |
| 2026-08-03 | `animationAttributes` decode | Keynote (macOS M15.3 writer), the returned seed deck as fixture | **SOLVED — the field is `KN.AnimationAttributesArchive` and it was in the vendored schema all along**: `effect` (2) an identifier string in two schemes (`apple:dissolve character`, `apple:move in character`, `com.apple.iWork.Keynote.BUKAnvil`), `animation_type` (1) "In", `duration` (3) and `delay` (5) seconds as doubles, plus `random_number_seed` (11) and `writing_direction_is_rtl` (16). Readers now take these with `database_*` fallback; retiming writes them. The deck also shows per-chunk timing (two automatic chunks, delay 1 s, duration 1.75 s) on staged delivery | `src/keynote/builds.ts`, test/keynote.test.ts |
| 2026-08-03 | filters + rules as corpus evidence | Numbers (macOS M15.3 writer), returned seeds as fixtures | **pinned against real bytes**: the populated two-rule row filter (col A `>10` type 7, col B contains-"ko" type 3, mode all, arrays consistent) and the conditional sets `>5`/`>=7`/contains-"pear"/is-blank (7/8/3/34) are fixtures with tests; the earlier probe-output measurements now have standing evidence | `test/predicates.test.ts` |
| 2026-08-03 | macOS re-measurement of iOS findings | Pages (macOS M15.3 writer), returned seeds as fixtures | **both writers agree**: borders {4, 8, 8} with the RTL visual-left edge at 8, the library's (1, 0) direction pair surviving the resave, and a library-defined placeholder consumed by click-and-type to zero fields | test/styling.test.ts, test/placeholders.test.ts |
| 2026-08-09 | section table anchoring | n/a — found building the demo suite | **the section table is run-boundary, not point-anchored**: an entry marks where a section begins, whatever text lands there next; 25 of 25 sectioned corpus bodies keep their first entry at 0. Treating it as point-anchored made any edit covering a section's first character silently drop the section list — rewriting paragraph 0 destroyed pagination. Also: `formulas()` could not see authored formulas (no cached value until the app recomputes; the sweep now walks row records) | `src/tswp/schema.ts`, `src/tst/tables.ts`, test/long-document.test.ts |
| 2026-08-07 | paragraph left indent | Pages (macOS), via the inline-image seed's own precondition | **`left_indent` alone does not indent**: the seed's indented paragraphs rendered flush at the page margin though the file carried `leftIndent: 113.4` and read it back. Apple writes the pair — 8645 of the 8647 corpus styles setting `left_indent` also set `first_line_indent` — so the writer now supplies a matching first line when the caller gives only the left. The seed's other fault was its own: an empty paragraph appended last is not one `paragraphs()` lists, so the first picture landed inside the text paragraph before it | `src/tss/stylesheet.ts`, test/long-document.test.ts |
| 2026-08-03 | inline image placement, list bleed, style-name loss | n/a — file analysis, from a field report building a ten-chapter manual | **three faults, all measured**: (1) an inserted image carried no `exterior_text_wrap` — the field all 102 corpus inline attachments have — so the app placed it against the page margin instead of the text column, and geometry could not move it because for an in-flow attachment position is a cache the app recomputes; type 0 is the in-flow mode (56 of 102 inline, 0 of 175 floating). (2) `appendParagraph` let list membership run on from a previous bullet: Apple states it per paragraph instead, 222 of 222 corpus list-table entries naming a style and 82 naming "None". (3) A directly formatted paragraph reported no style at all, because the name lives on the named ancestor — 644 of 644 anonymous-style corpus paragraphs have one, and one fixture's every paragraph is anonymous | `src/pages/document.ts`, `src/tswp/textstorage.ts`, test/long-document.test.ts |
| 2026-08-03 | mixed-codec packages (LZFSE beside Snappy) | n/a — ported from Apple's published lzfse reference (BSD-3-Clause) | **framing decoded**: `decodeLzfseStream` walks bvx- / bvxn / bvx$ blocks and the full LZVN opcode table, validated against hand-assembled vectors per opcode family; bvx1/bvx2 (FSE) refused precisely. Payload semantics unmeasured — no redistributable `OperationStorage.iwa` exists; the collaboration seed is staged to produce one | `src/base/lzfse.ts`, test/lzfse.test.ts |
| 2026-08-01 | cell-control interaction_type | n/a — borrowed documents | **solved**: 4 stepper, 5 slider, 6 star, 7 pop-up, 8 checkbox; also found and fixed the dropped-checkbox bug | `src/tst/controls.ts` |
| 2026-08-01/02 | Pages ladder P00–P19 | Pages (macOS 26.x) | **all rungs confirmed**; twelve well-formed-but-wrong defects found, fixed, pinned | VERIFICATION.md |
| 2026-08-02 | Keynote ladder K00–K10 (v26) | Keynote (macOS + iOS) | **all rungs confirmed**; six defects found (four offline by shape:audit, two by the app), fixed, pinned | VERIFICATION.md |
| 2026-08-10 | character-style run left open at end of text | Pages (macOS), via the demo suite's feedback lines | **bleed confirmed and closed at the append seam**: styling a range ending at `text.length` writes no closing entry — correctly, since no corpus storage (0 of 2896) carries a character-table entry there — but the open run then swallowed every later append, so one grey-italic line turned the rest of the document grey and italic. Apple's run-end shape is an *objectless* entry (624 of 2079 corpus character-table entries; 459 directly after a styled run), sitting on a terminator (×80), just after one (×69) or mid-text (×430) — so `appendParagraph` now writes that boundary at the old end before inserting, and a styled range means `[start, end)` whatever is appended later. Push/pop styling state was considered and rejected: the format's run table has no writer state, and a forgotten pop is this same bug with an API blessing | `src/tswp/textstorage.ts`, test/long-document.test.ts |
| 2026-08-10 | paragraph direction run left open past setDirection | Pages (macOS), returned demo-01 | **the same open-run failure, one table over**: `setParagraphDirection` wrote a per-paragraph bidi table for the paragraphs that existed at call time, so the flipped Hebrew line's `(1, 0)` entry was the table's last and ruled every paragraph appended after it — the rest of the document rendered RTL: right-aligned Latin text, end-of-sentence punctuation at the visual line start, tabs measured from the right. The corpus statement: 2594 of 2896 bidi-bearing storages cover every paragraph start, the one mid-document `(1, 0)` is followed by an explicit `(0, 0)`, and an open-ended RTL entry appears only where no paragraph follows. `appendParagraph` now states each new paragraph's own pair, copying the storage's baseline at position 0 | `src/tswp/textstorage.ts`, test/long-document.test.ts |
| 2026-08-10 | authored border strokes render as «Ingen» | Pages (macOS), returned demo-01 (T-10, in-document feedback) | **the first library-authored border ever opened drew nothing, and the archive diff names the cause**: our stroke stated color, width and a pattern message holding only its type; every app-written paragraph border (167 of 167 in the corpus) also states cap, join, miter limit 4 and the full pattern message — phase 0, count 0 and six pattern floats even for solid. The app showed the width (1 pt / 3 pt reached the inspector) but «Ingen» for the stroke, drew no border, and zeroed `border_positions` on resave. `writeStroke` now writes the complete corpus shape; positions bitmask semantics (settled 2026-08-03) unchanged | `src/tsd/style.ts`, test/styling.test.ts |
| 2026-08-10 | authored borders round two: stroke honoured, toggles unselected | Pages (macOS), returned demo-01 (T-10, in-document feedback) | **the position toggles key on `deprecated_borders` (15), not the bitmask**: with the complete stroke the inspector selected our colours, stroke type and width, but the side toggles stayed unselected and nothing drew. The app writes the historical enum beside `border_positions` on every bordered style — 17 of 17 corpus styles with non-zero positions carry both (1·1 ×10, 2·2 ×1, 4·8 ×2, 8·16 ×4), 6474 agree on 0·0, and 12 old-era styles carry *only* the enum. The old scale keeps 1 top and 2 bottom, states top-and-bottom as 3 and all four as 4, and moves the sides to 8 leading / 16 trailing with horizontal bits added (9–11, 17–19); leading beside trailing short of all four has no value. The writer now states both; the reader falls back to the enum for old documents | `src/tswp/schema.ts`, `src/tss/stylesheet.ts`, test/styling.test.ts |
| 2026-08-10 | sections shared their page masters | Pages (macOS), returned demo-02 | **a library-created section could never differ from its neighbour**: `insertSectionBreak` cloned the section object but kept the master references, so section 3's header write was overwritten by section 2's — the returned file shows both sections pointing at the same template ids while no two sections in the corpus's 25 sectioned documents share one. The insert now clones the three master variants and their six storages, so each section owns its chrome | `src/pages/document.ts`, test/long-document.test.ts |
| 2026-08-10 | header text in always-empty columns never drew | Pages (macOS), returned demo-02 | **the render gate is the storage's shape, not any single field**: text set bare into a master's always-empty header storages kept the donor's blank default shape and did not draw, while the one column that had text rendered. No single field explains it — the DOCX-imported donor's rendered header carries a char-style table and no language table, an app-authored footer the reverse — so a filled column now adopts its non-empty sibling's shape whole: paragraph style, char-style and language entries. Also measured: the column↔position mapping is open — corpus header text sits at storage [1] almost exclusively, and the checker saw [1] render at the *left* edge, against the assumed left/center/right; demo-02's SPALTE-A/B/C rung settles the order. Column indexes outside 0..2 now throw (the demo's third column silently went nowhere) | `src/pages/document.ts`, `src/tswp/textstorage.ts`, test/long-document.test.ts |
| 2026-08-10 | header slot model (demo-02 round two) | Pages (macOS), returned demo-02 | **modern Pages draws one page-wide header field, bound to storage slot 1**: with all three slots filled, »Sektion 1« rendered once, centred, and of SPALTE-A/B/C only SPALTE-B appeared — left-aligned at the page edge, so the drawn field spans the page and the text follows the storage's own paragraph alignment (section 1's donor style centres, section 2's left-aligns). Slots 0 and 2 are the legacy three-field layout's outer slots — tudortmund (v4.2 lineage) fills them — and the byte that switches the legacy mode remains unfound: document-archive field 49, settings `show_ct_deletions` (13) and section `first_page_hides_header_footer` (28) all refuted as candidates by name or by counterexample; no corpus header uses tab-separated parts either. Verified silently in the same round: date field, bookmark, footnote, comment, both placeholders, and section 3's own cloned header — the master-cloning fix holds | `src/pages/document.ts`, `scripts/make-demos.ts` |
| 2026-08-12 | rule offset closed; demo-01 settled whole | Pages (macOS), returned demo-01 | **positive is outward, and the UI scale is calibrated**: `ruleOffset +12` rendered the wider gap, and the two informational inspector readings settle the mapping — stored 0 displays 6 pt, stored +12 displays 18 pt, so the stored value is relative to the app's 6 pt default gap and the inspector shows the absolute number. (The earlier −2-for-stored-−12 reading was the display floor or a misread; the linear fit from two clean points stands.) All fifteen demo-01 checks now render as written | `src/tss/stylesheet.ts`, `scripts/coverage-matrix.ts` |
| 2026-08-13 | field report 4's API queue: dividers, inheritance, inline tables, the "no-op" | n/a — corpus measurement + in-library repro | **four asks landed, one refuted**: (1) `TableFormatting` now covers the divider flags (42/43/44), the header-border toggle and all sixteen modern band strokes — 286 of 302 corpus table-style bags carry each — and every key is three-state: `null` removes the field so the style inherits again; absent has never meant false. (2) `insertRows`/`insertColumns` inherit the displaced row's or column's cell and text styles as blank-but-styled records — Apple's own shape, 2043 of 2275 corpus empty records carry a text style — with the style table's refcounts bumped per copy. `textStyleId`/`textStyle` join the existing `cellStyleId`/`cellStyle` pair. (3) `insertInlineTable(pos, {copyOf?, name?, withContent?})` clones a donor table and anchors it at a U+FFFC with the measured five-field attachment, parent = the body storage; document-unique naming; no donor throws. (4) the reported `createParagraphStyle` paragraph-option no-op **does not reproduce** — every `ParagraphFormatting` key round-trips (pinned) — but the likely experience behind it does: a string where the alignment enum belongs surfaced as a BigInt error deep inside save. `alignment` now takes the names too (left/right/center/justified/natural) and rejects garbage at the call | `src/tst/styles.ts`, `src/tst/tables.ts`, `src/tss/stylesheet.ts`, `src/pages/document.ts`, test/tables.test.ts, test/styling.test.ts |
| 2026-08-13 | cloned-table content loss (field report 4, ranked first) | n/a — reproduced in-library | **mechanism named, loss made loud, ordering stabilised**: two tables sharing one string table undercount refcounts — each entry claims one owner while two tables' records reference it — so the first overwrite in one table releases entries the other still needs, and that table reloads all-empty ("records referencing strings absent from the data list", exactly as reported). The state is always an authoring fault: no two corpus tables share a data list or a tile (0 of 52 tables, 46 documents), and no corpus record is orphaned (0 of 5019). `save()` now runs `verifyCellStorageIntegrity` — scoped to tables whose storage changed this session — and refuses the file naming the table, cells and keys instead of persisting silent loss. The report's deterministic contributor is fixed separately: `tables()` on both apps now enumerates document order (Numbers: sheets in tab order, drawables per sheet; Pages: body anchors by text position, then paint order), so `tables()[0]` is the first table on the page whatever was added this session. `addTable` itself forks every data list — measured — so the library's own clone path was never the trigger | `src/tst/tables.ts`, `src/tsa/document.ts`, `src/numbers/document.ts`, `src/pages/document.ts`, test/tables.test.ts |
| 2026-08-13 | mask editability rounds five–seven: reset engages, the editor still does not | Pages (macOS), returned demo-03 | **the mask is now valid enough to clear but not to open — and the last uniform differences are on the image's super**: »nulstil masken« worked where earlier rounds offered nothing, so the crop model itself is accepted; double-click editing still refused. traced_path (present on 30 of 31 masked corpus Pages images, written since round seven) did not open the editor alone. The remaining corpus-uniform deltas, now closed: every masked image states `aspect_ratio_locked` true (87 of 87, all apps) with `locked` stated beside it (85 false), and every current-era image carries `title`/`caption` references to empty `TSD.StandinCaptionArchive`s with both hidden flags stated (88 images, 176 of 176 targets empty, 87 of 88 false/false) — ours wrote none of these. `insertInlineImage` now writes the full modern super; `setCrop` states the lock pair on any image it masks, preserving an existing lock. Placement refuted as the gate: masked corpus images are 10 text-anchored, 15 group children, 6 z-order only — ours is a corpus-attested construction | `src/pages/document.ts`, `src/tsd/images.ts`, test/long-document.test.ts |
| 2026-08-13 | shadow angle calibration | Pages (macOS), returned demo-03 + inspector reading | **the inspector displays 360 − stored**: our default 315 rendered up-right and read 45° in the UI; the proto's `[default = 315]` is the legacy scale. `DEFAULT_SHADOW.angle` is now 45, which displays 315° and renders the light-from-upper-left, shadow-down-right convention | `src/tsd/drawables.ts` |
| 2026-08-11 | field report 4: typesetting a report into a branded template | n/a — field report, five documents | **three silent failures named, two fixed here, one deferred**: (1) wiping a body with `applyEdits` could leave text ending in a terminator with no paragraph-style entry at `text.length` — Pages refuses such a file; every edit now restores the entry. (2) `listInThemeStyles` with a character style put a 2021 archive in `paragraph_style_presets` — refused too; the method now routes by type across the three preset lists (1 list, 6 character, 7 paragraph) and throws otherwise. (3) **deferred, ranked first by the reporter**: cloned tables intermittently lose their cell text on reload — every table in the document, including untouched ones — suspected string-interning or id allocation in the clone path; `tablesOf(store)[0]` instability after a clone is one deterministic contributor. Also banked: `formatTable` trap fixed into a real setter; wire layer rejects NaN field numbers; the report's API asks (TableFormatting divider keys 42/43 and border strokes 47…, insertRows style inheritance, `textStyleId` getter, `insertInlineTable`, null-unset in `applyTableFormatting`, `createParagraphStyle` paragraph-option no-op, style-of-paragraph-n recipe, negative-indent full-bleed recipe, proto-first skill lesson) are the follow-up queue | `src/tswp/textstorage.ts`, `src/pages/document.ts`, `src/tst/tables.ts`, `src/base/protobuf.ts` |
| 2026-08-11 | demo-03 rounds two and three: wrap and PDF confirmed; masks made editable | Pages (macOS), returned demo-03 | **four checks confirmed silently**: the inline photo flush with its indented reference line (closing the inline-image saga), the margin mode, the floating copy wrapping text (the round-one fix holds), and the vector PDF staying sharp under zoom — PDF as insertable media is app-verified on its first check. The crop rendered exactly as stated (Fuji centred, the wave's claw gone) but the mask editor would not engage: app masks are *full drawables* — parent = the image they mask (79 of 79 corpus masks carry the field), their own `exterior_text_wrap`, and explicit `locked`/`aspect_ratio_locked`/`title_hidden`/`caption_hidden` — where ours was bare geometry. `buildRectangularMask` now writes the whole shape. Also adopted as demo policy, from the checker: assets must make non-proportional scaling visible — a disc (Earthrise) or a well-known motif does; anonymous colour blocks do not | `src/tsd/masks.ts`, `src/tsd/images.ts`, test/long-document.test.ts |
| 2026-08-11 | floating drawables' text wrap (demo-03 round one) | Pages (macOS), returned demo-03 | **a floating copy of an inline image kept the in-the-text-flow wrap, and the app wrapped nothing while its inspector read «automatisk»**: the dominant floating corpus shape is type 4 with a 12 pt margin (1136 of the floating drawables; type 0 appears on only 36, none of them Pages page content). The floating container now normalises an in-flow or missing wrap to the on-page shape on attach. Also from the round: the crop was unverifiable by design — a solid-colour source masks to the same solid colour, and a squashed scale is indistinguishable from a crop — so the demo asset is now two-tone with the expected seam described in the check; and the M-01/M-02 indent checks promised indented text the demo never wrote, so the reference line exists now | `src/pages/document.ts`, `scripts/png.ts`, test/long-document.test.ts |
| 2026-08-11 | demo-02 (structure & fields) settled whole | Pages (macOS), third round | **all seven checks confirmed rendering**: three sections with independent cloned masters, the page-wide slot-1 headers with style-borne alignment (centred vs left-aligned as their storages state), footers with live page-number and page-count fields, the date field, bookmark, footnote, comment, and both placeholder behaviours — the tap-to-replace span and the library-filled one editing as plain text. Two writer defects and one refuted layout model on the way, one per round | `scripts/coverage-matrix.ts` |
| 2026-08-10 | rule offset direction (T-15 round one) | Pages (macOS), returned demo-01 | **negative is inward, zero is the default, and the inspector is not the archive**: `ruleOffset: −12` rendered the rules overlapping the paragraph — negative pulls toward the text, so the stock templates' −3 tightens the default gap rather than widening it. The resave preserved our −12 verbatim while the inspector displayed −2 pkt, and it back-filled the offset-less border styles with explicit `(0, 0)` and `rule_width 1` — including under 3 pt strokes, so rule_width is legacy fill, not kept in step with stroke width. The outward direction is unattested (every non-zero corpus value is negative); T-15 now writes +12 to measure it | `src/tss/stylesheet.ts`, `scripts/make-demos.ts` |
| 2026-08-10 | demo-01 (text & typography) settled whole | Pages (macOS), third round | **all fourteen checks confirmed rendering**: character formatting (weights, colour, highlight, strikethrough, font, capitals, super/subscript), links, created and edited named styles, alignment, lists ending at their own paragraphs, block and hanging indents, paragraph borders on the enum+bitmask pair (top/bottom, red leading, blue trailing — with value 3's structural mapping thereby app-confirmed), paragraph background, RTL confined to its one paragraph, double line spacing, decimal tabs. The text-to-rule gap on horizontal borders is the app's default — no rule offset is written, matching the app's own authored border styles, only donor templates carry `historical_rule_offset` (-3, -3). Three writer defects found and fixed on the way, one per round, each named by in-document feedback | `scripts/coverage-matrix.ts` |

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
| Placeholder text is a bare smart field, and an image placeholder is the same field over U+FFFC | `TSWP.PlaceholderSmartFieldArchive` (2031) is the smart-field super plus one varint = 1 across every modern instance — 73 measured: the corpus's 64 and a donated document made for the question, whose image placeholder is a 2031 spanning the attachment character with no `TP.PlaceholderArchive` anywhere. The lone 0-valued varint is a v10-era file. |
| Per-paragraph direction lives in `table_para_bidi`, not the paragraph style | No style in 37 fixtures sets `writing_direction`, while the pptx-lineage deck writes a bidi ParaData pair per storage — the NSWritingDirection scale at uint16 widths. The pair's semantics are app-confirmed: first slot the direction (0 LTR, 1 RTL, 65535 natural), second slot 0 (65535 only with natural); an app-flipped paragraph carries exactly `(1, 0)` with its style untouched. One wrong slot — `(1, 1)` — renders LTR. |
