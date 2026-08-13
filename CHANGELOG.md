# Changelog

Notable changes, kept in the spirit of [Keep a Changelog](https://keepachangelog.com/).
The package follows [semantic versioning](https://semver.org/); commit
history uses Conventional Commits, so the detail behind any entry is one
`git log` away.

## Unreleased

- A checkbox is written whole: bool format 263, the record's control
  id, a control-spec entry (interaction_type 8) and the extras bit,
  exactly as the app's own Dataformat toggle writes them (measured
  from the returned one-delta seed, now a corpus fixture) — the format
  alone showed as Automatic. `setCellFormat({kind:"checkbox"})` routes
  through the control path.
- The stroke sidecar is brought to the table's current size on every
  border write: the app clips runs outside the declared grid, and a
  donor's sidecar still declaring its old size swallowed every border
  this library wrote.
- Cell borders write where the app reads them: the stroke sidecar
  (`TableModelArchive.stroke_sidecar`), per-edge layers of runs each
  carrying a complete stroke — none of the corpus's 4139 cell-style
  bags holds a per-side stroke, and a bag-only border drew nothing.
  `TableModel.cellBorders(row, column)` reads them back.
- `CellFormatting.horizontalAlignment` — alignment rides the text
  layer as an anonymous per-cell paragraph style, the corpus's own
  mechanism; accepts the enum or the name, `null` restores the band
  default.
- App-confirmed this round: the mask editor's gate was the drawable's
  arrangement all along (in-flow images render and reset their crops;
  floating ones open the editor), chart data/appearance editing
  (demo-04 pass, whole), and currency/percentage formats.
- Fixed: a copy of a drawable inserted this session owns its children.
  The clone walk selected from declared references, which refresh only
  at save, so `addCopyOf` on a fresh image shared the original's
  title/caption stand-ins (and its mask, had it been cropped) — a state
  no corpus file shows. Selection now computes references live.
- Fixed: currency formats reach the app. A currency-formatted record
  stores cell type 10 with extras 0x802, and the format archive states
  its full tail (negative style, separator, accounting) — one missing
  any of it read as the inspector's Automatic.
- `TableModel.nameVisible` — `table_name_enabled`, the flag behind
  whether the app draws the table's name.
- Fixture: `olekristensen-v26.3-seed-crop-returned.pages` — the app's
  own crop over a library-inserted image. It matches `setCrop`'s output
  field for field, confirms the mask editor engages on our images, and
  shows paste-dedupe sharing one data object between drawables.
- `TableFormatting` covers the full modern table-style surface: the
  divider flags, the header-border toggle and all sixteen band strokes
  (each on 286 of the corpus's 302 table-style bags). Every key is
  three-state — `null` removes the field so the style inherits again.
- `insertRows`/`insertColumns` inherit the displaced row's or column's
  cell and text styles as blank-but-styled records, Apple's own shape,
  with style refcounts kept honest. `TableModel.textStyleId` and
  `textStyle` join the existing cell-style pair.
- `PagesDocument.insertInlineTable(pos, options)` clones a table
  already in the document and anchors it inline at a body position —
  clone-based like `NumbersDocument.addTable`, with document-unique
  naming and `withContent: false` for a blank copy.
- Paragraph `alignment` accepts the names (left/right/center/justified/
  natural) beside the enum, and rejects anything else at the call —
  a string there used to surface as a BigInt error inside save.
- Saving refuses a table whose records reference strings absent from
  its own data list — the state behind "the cloned table reloads
  empty" (field report 4's first-ranked fault, reproduced: two tables
  sharing one string table undercount refcounts, and the first
  overwrite in one releases entries the other still needs). The check
  runs only over tables whose storage changed this session, and names
  the table, cells and keys. `TableModel.orphanReferences()` is the
  diagnostic behind it.
- `tables()` is document order on both apps: Numbers walks sheets in
  tab order and each sheet's drawables in order; Pages walks the
  body's anchors by text position, then paint order. `tables()[0]`
  is the first table on the page whatever was added this session.
- Inserted images carry the full modern drawable super: the lock pair
  stated (`locked` false, `aspect_ratio_locked` true — the shape of 156
  of 171 corpus images and all 87 masked ones), and `title`/`caption`
  references to empty stand-in archives with both hidden flags, as
  every current-era corpus image has. `setCrop` states the lock pair
  on any image it masks, keeping an existing lock.
- Field report fixes, the unopenable-file class first:
  `listInThemeStyles` now routes a style to the preset list its type
  belongs to — paragraph, character or list — and throws on anything
  else; a character style in the paragraph list was a file Pages
  refused. Editing keeps the phantom-paragraph invariant: every edit
  restores the paragraph-style entry at `text.length` when the text
  ends with a terminator (31 of 31 corpus bodies), which wiping a body
  with `applyEdits` could silently drop. `formatTable(formatting)` is
  now a real setter reaching `tableStyle().setTable` — it was a
  private map getter that compiled and did nothing when called with an
  argument. The wire layer rejects non-integer field numbers, so a
  string field name fails at the call instead of as a BigInt error
  inside save.
- Fixed: a crop's mask is editable in the app. The mask node is a full
  drawable — its `parent` is the image it masks (79 of 79 corpus
  masks), it carries its own `exterior_text_wrap` and states the
  locked/aspect-ratio/title/caption flags explicitly — where the
  library wrote bare geometry: the crop rendered, and the app's mask
  editor would not engage with it.
- Fixed: a floating drawable now wraps text. A copy of an inline image
  kept the in-the-text-flow wrap, which on a floating object makes the
  app show automatic wrap while wrapping nothing; the floating
  container normalises an in-flow or missing wrap to the on-page shape
  the corpus's 1136 floating drawables carry — type 4, 12 pt margin.
- Fixed: a section created by `insertSectionBreak` owns its page
  masters. The insert cloned the section but shared the enclosing
  section's master objects, so the two sections' headers could never
  differ — writing one overwrote the other. No two sections in the
  corpus's 25 sectioned documents share a master; the insert now clones
  the three variants and their header/footer storages.
- Fixed: header and footer text written into a master's always-empty
  columns now draws. A bare `setText` left the donor's blank default
  shape, which the app never renders from; the written storage now
  adopts a non-empty sibling's shape — paragraph style, character and
  language entries — via the new `TextStorage.copyShapeFrom`. Header
  and footer column indexes outside 0..2 throw instead of silently
  writing nowhere. App-measured, the slot model itself: modern Pages
  draws one page-wide header field bound to slot 1 — the default —
  with the text following the storage's own paragraph alignment;
  slots 0 and 2 are the legacy three-field layout's outer slots,
  preserved but not drawn in modern documents.
- Added: `ruleOffset` on paragraph formatting — the distance between
  text and its border rules (`historical_rule_offset`). A number states
  both slots of the stored `TSP.Point`, agreeing with 8637 of the
  corpus's 8638 instances; a pair states them separately, which the one
  exception shows the format allows. App-measured: zero is the default
  gap (the app itself back-fills `(0, 0)` on resave), negative pulls
  the rules toward and into the text — −12 renders overlapping, the
  stock templates' −3 tightens — and the app preserves stored values
  beyond what its inspector displays. The positive, outward direction
  is in the demo for its check.
- Fixed: one RTL paragraph no longer turns the rest of a growing
  document RTL. `setParagraphDirection` writes a per-paragraph bidi
  table, but paragraphs appended afterwards fell into the last entry's
  run — Latin text rendered right-aligned with its punctuation at the
  line start and tabs measured from the right. Appending now states each
  new paragraph's own direction pair, copying the storage's baseline;
  2594 of 2896 bidi-bearing corpus storages cover every paragraph start
  the same way.
- Fixed: an authored paragraph border now draws. Two faults, found one
  under the other. The stroke stated only its pattern type where every
  app-written border (167 of 167 corpus paragraph strokes) also states
  cap, join, miter limit 4 and the full pattern message — phase, count
  and six floats — so Pages showed the width but «None» for the stroke;
  `writeStroke` now writes the complete corpus shape for every stroke,
  table borders and drawable outlines included. With the stroke
  honoured, the position toggles still sat unselected: the inspector
  keys on `deprecated_borders`, the historical enum the app writes
  beside the bitmask on all 17 bordered corpus styles (1·1, 2·2, 4·8,
  8·16 — old top/bottom values kept, sides moved to 8 leading and
  16 trailing, top-and-bottom 3, all four 4). The writer now states
  both fields, and the reader takes positions from the enum in old
  documents that carry only it.
- Fixed: character styling no longer bleeds past its range. Styling to
  the end of the text leaves the run open — correctly, as no corpus
  storage carries a character-table entry at `text.length` (0 of 2896) —
  but every later `appendParagraph` then landed inside the run, so one
  grey-italic line turned the rest of a growing document grey and
  italic. Appending now closes an open run first, with the objectless
  boundary entry that ends runs throughout the corpus (624 of 2079
  character-table entries), so `applyCharacterFormatting(start, end)`
  styles exactly `[start, end)` no matter what is appended afterwards.
  `insertText` keeps the typing model and inherits the run at its
  position. A non-integer range bound now throws a `RangeError` instead
  of surfacing as a wire-layer BigInt error.
- Fixed: an edit touching a section's first character no longer destroys
  the document's section list. The section table was classified with the
  point-anchored tables (whose entry dies with its character), but a
  section entry marks where a section *begins* — all 25 sectioned corpus
  bodies keep their first entry at 0 — so rewriting paragraph 0 of a
  sectioned template silently removed its pagination.
- Fixed: `formulas()` now lists formulas this library authored. The
  sweep went through the value-bearing cells, and a freshly written
  formula has no cached value until the app recomputes — so the library
  could not see its own output. It walks the row records instead.
- Fixed: `PagesDocument.paragraphs()` reports the chain-resolved style
  name, like `paragraph(i).styleName` — a directly formatted heading no
  longer reads as unnamed in the listing.
- A demo suite: `npm run demos` generates ten self-describing documents
  covering every write capability — text and styles, structure and
  fields, images, charts, cells and formats, formulas, conditional rules
  and controls, sheets and filters, slides, animations — each check
  numbered, stating what the library did and what the app should
  render, with feedback space in the document itself.
- Documentation drift audit against the code: 41 findings fixed across
  README, FORMAT.md, the skill, THIRD-PARTY-NOTICES (fixture licenses
  now enumerated; keynote proto dumps correctly attributed to
  psobot/keynote-parser) and proto/README — stale corpus counts
  refreshed, border-position and filter sections rewritten to the
  measured state, donor style names corrected in skill examples, and
  the measured transition-effect identifier scheme
  (`apple:transition/dissolve`) documented.
- Fixed: a left indent now indents in the app. A paragraph style setting
  `left_indent` alone read back correctly and rendered flush at the
  margin; Apple pairs it with `first_line_indent` in 8645 of the 8647
  corpus styles that set it, so an unaccompanied left indent gains a
  matching first line — a block indent — while a bag stating its own
  first line keeps it, hanging indents included.
- Fixed: an inline image is drawn in the text column instead of at the
  page margin. The drawable carried no `exterior_text_wrap` — the
  archive every one of the corpus's 102 inline attachments has — so the
  app placed it against the page, which in a document with indented body
  styles left the picture out of line with its own paragraph and the
  next paragraph flowing up beside it. Images now ride the text by
  default, with `wrap: "page"` for the other mode, and carry the
  geometry flags, angle and storage back-pointer the corpus shows.
- Fixed: a paragraph given direct formatting no longer loses its style's
  name. Formatting parents the paragraph on an anonymous child of the
  named style — as the apps themselves do, on 644 of 644 anonymous-style
  corpus paragraphs — so names now resolve through the parent chain.
  A heading formatted in place stays a heading, which is what a table of
  contents collects by; `hasDirectFormatting` tells the two apart. This
  also fixes reading app-written documents, where direct formatting is
  the norm rather than the exception.
- Fixed: an appended paragraph no longer inherits the previous one's
  list membership, which silently turned every paragraph after a bullet
  into a list item while its paragraph style still read "Body". Each
  appended paragraph states its own, the way Apple does (222 of 222
  corpus list entries name a style, 82 of them "None"); pass a list
  style to `appendParagraph` to opt in.
- `paragraphStyles()` lists only styles that have names, instead of the
  hundreds of anonymous ones direct formatting creates; new
  `paragraphStylesInUse()` reports what the body actually uses, which is
  the shorter and more interesting list. New
  `body.endsWithEmptyParagraph` discloses the paragraph the app draws
  after a trailing terminator but `paragraphs()` does not list.
- `findDrawableCore` returns `undefined` for an archive that is not a
  drawable instead of throwing, so a survey over mixed attachments no
  longer dies on the first footnote mark.
- The LZFSE container that collaboration-mode components use
  (`Index/OperationStorage.iwa` beside Snappy components) now decodes:
  `decodeLzfseStream` reads raw and LZVN blocks (the LZVN decoder is
  ported from Apple's published lzfse reference, BSD-3-Clause) and
  refuses FSE-coded blocks precisely. The probe reports its reading of
  any opaque component; the document model still keeps such components
  opaque and byte-preserved, because the decoded payload's meaning
  awaits a redistributable specimen — a collaboration seed is staged
  for exactly that.
- New end-to-end rungs (macOS): paragraph direction, a defined
  placeholder, paragraph borders, a retimed build and a disabled filter
  set each survive the app rewriting the package.
- Keynote build effects and timing are decoded: `effect` (an identifier
  string in two schemes, `apple:dissolve character` /
  `com.apple.iWork.Keynote.BUKAnvil`), `animationType`, `duration` and
  `delay` now read from `KN.AnimationAttributesArchive` with the legacy
  `database_*` fields as fallback, and retiming writes the same fields —
  measured against the corpus's first animated deck, whose three
  app-authored builds are pinned in tests.
- Filter-rule reading is pinned against the corpus's first populated
  filter set: columns, per-rule switches, combining mode and predicate
  formulas, including the type-3 "text contains" compilation. The
  conditional-formatting comparisons `>5`, `>=7`, text-contains and
  is-blank gain corpus evidence in a second fixture.
- The fixture corpus grows 41 → 46 with five macOS iWork 15.3-written
  documents (the first M15.3 writer files in the corpus), covering
  builds, filters, conditional rules, and macOS agreement on the border
  side bits, paragraph direction and placeholder consumption measured
  on iOS. All measurement seeds are banked; `npm run seeds` keeps the
  scaffolding with an empty registry for the next question that needs
  a person in an app.
- The border bitmask's side bits are measured *logical*: 4 is the
  leading edge and 8 the trailing edge, swapping visual sides with the
  paragraph's writing direction (a left-edge border on an RTL paragraph
  stores 8). `BorderPosition` gains `LEADING`/`TRAILING`;
  `LEFT`/`RIGHT` remain as the left-to-right aliases.
- Paragraph base direction reads and writes:
  `setParagraphDirection(i, "rtl" | "ltr" | "natural")` and
  `doc.paragraph(i).setDirection(...)` write the pair the app itself
  writes when its ⇄ control flips a paragraph — the storage's bidi
  `(1, 0)` for RTL, measured from an app-flipped document. The
  style-bag `writingDirection` is confirmed vestigial (the app leaves
  it untouched) and its docblock points at the real mechanism.

## 0.2.0 — 2026-08-03

- Pages placeholder text — the template tap-to-replace mechanism — is a
  first-class feature: `placeholders()` lists the ghost-text spans,
  `fillPlaceholder()` puts real content in and sheds the marking the way
  typing does, and `defineAsPlaceholder()` /
  `find(...)[0].asPlaceholder()` create one, writing the shape measured
  across 73 app-written instances. An image placeholder in a body
  document is the same field over the image's object character, so the
  same calls cover it.
- Verification readers: `characterFormattingAt(pos)` answers "what
  formatting really applies here" with inheritance folded in;
  `characterStyleRuns()` (which existed) is now documented as the
  whole-document sweep.
- Fixed: text edits reaching the end of a storage no longer smear
  styling document-wide. The paragraph-style table's entry at
  `text.length` is the final empty paragraph's entry, present exactly
  when the text ends with a terminator (measured: 31 of 31 vs 0 of 1270
  corpus storages); the writer now derives it from the new text instead
  of preserving whatever the old table had. Found by an agent's field
  report editing a real letterhead template.
- Safer editing by construction: a `TextRange` made stale by an
  earlier-offset edit now throws instead of silently editing the wrong
  span (edits after a range never invalidate it, so the descending-order
  idiom still works); new `applyEdits([...])` applies many
  non-overlapping edits from one snapshot with no ordering discipline;
  new `characterStyleIdAt(pos)` reads the ruling character style without
  schema imports; `effectiveObjectAt` rejects a non-numeric table
  argument loudly. The skill now leads with the safe path and states the
  delete-plus-insert semantics once.
- One-click releases: Actions → Release with a version number cuts the
  changelog, bumps, tags, creates the GitHub release and publishes to
  npm via trusted publishing — no tokens anywhere.
- Fixed: inserting rows or columns now keeps the table's identity map
  (`base_column_row_uids`) in lockstep with the grid. Numbers renders a
  table at the map's size, so columns inserted by earlier versions were
  invisible in the app; surviving positions keep their UIDs, new ones
  mint fresh identities in Apple's sort order (measured 2026-08-03 on a
  seed document, Danish-locale Numbers).
- `border_positions` is a measured bitmask — 1 top, 2 bottom, 4 left,
  8 right, unions literal — replacing the refuted enum reading (whose
  `ALL = 4` would have drawn one left edge). `BorderPosition.LEFT`/
  `RIGHT` replace the interim `VERTICAL_BIT_A`/`B`; sides measured in
  LTR paragraphs (two seed-borders runs, 2026-08-03), RTL semantics
  still open.
- The conditional-formatting comparison enum is complete: predicate
  codes 7 (`>`) and 8 (`>=`) measured 2026-08-03 — 7 from both a
  conditional rule and the first non-empty filter set anywhere —
  confirming the menu-order prediction whole, so `setConditionalRules`
  now writes all six comparisons.
- Filter-rule reading is measured against a real filter set for the
  first time; "text contains" compiles to `NOT(ISERROR(f(needle,
  cell)))` with `f` an unnamed function index 296.
- Keynote builds, first contact: the slide↔build graph and delivery
  reads confirmed (delivery is an English display string on any locale);
  the `database_*` effect/timing fields are absent from modern builds —
  effect and timing live in the undecoded `animationAttributes` — so
  those read `undefined` on modern decks, and the probe now prints
  chunks, triggers and the field-18 shape to close in on them.
- Paragraph styles can set `writingDirection`, though measurement shows
  the field is vestigial (styled 0/1/2 all render left-to-right; no
  corpus style carries it). Per-paragraph direction evidence lives in
  the storage's `table_para_bidi` pairs — 0 = LTR and 65535 = natural
  observed, the RTL value under measurement via the borders seed — and
  the probe now prints any bidi table that departs from the baseline.
- Node ≥ 22 (Node 18 and 20 are end-of-life); CI adds Node 26.
- Toolchain refresh: TypeScript 6, `strictTypeChecked` linting,
  `noImplicitReturns` and `verbatimModuleSyntax`, patched vite via
  override, and an `npm audit` gate in CI.
- npm-normalized `bin` paths, so `npm publish` has nothing to correct.

## 0.1.0 — 2026-08-03

The first release: an ongoing reverse-engineering of Apple's iWork
format as a working, zero-dependency TypeScript library.

### Documents

- Load, edit and save Pages, Numbers and Keynote documents (modern IWA
  format, 2013 →), in Node ≥ 22 and browsers — bytes in, bytes out.
- New documents from nothing: `blank()` on each app class instantiates
  an embedded, Apple-authored donor — A4 for Pages and Numbers, 16:9
  for Keynote — the same way the apps instantiate a bundled template,
  dressed in the house typography: Palatino body text, Helvetica Neue
  headings, a terracotta accent. `blankFrom(bytes)` does the same with
  any document as the template.
- Byte-fidelity round trips: untouched components are preserved exactly,
  and for documents written by current apps an edited save is typically
  byte-for-byte what the app itself would have written — the Snappy
  compressor is a byte-exact port of both encoder vintages Apple has
  shipped, and the zip container mirrors Apple's writer's quirks.
- Version-aware loading: newer documents warn rather than fail, and
  fields this library has never heard of ride along unharmed.
- iWork '09 XML and password-protected documents are detected and
  refused, never mis-parsed.

### Text, styles and layout (Pages)

- Body editing that keeps every attribute table consistent: find and
  replace, paragraph append, character and paragraph formatting, named
  styles (create, apply, edit), sections, headers and footers, page
  setup, comments, footnotes, bookmarks, links, and smart fields (page
  numbers, dates).
- Inline image insertion, app-confirmed; floating drawables move,
  resize, copy and style, with image crops read and written.

### Tables (all three apps)

- Cells read and write with presentation preserved; cell and table
  styling, bands, row and column operations, display formats.
- Formula authoring compiled to Apple's own AST encoding — operators,
  ranges, anchored and cross-table references (`Other::A2`),
  whole-column spans, 272 measured function names — with every
  parseable corpus formula rebuilding byte-identical to Apple's bytes.
- Merges written the way the calc engine keeps them, dependency ledger
  included; conditional formatting, filters, categories and cell
  controls read.

### Keynote

- Slide management (add, duplicate, reorder, remove, skip), titles,
  bodies, presenter notes, auto-advance, slide size; builds read.

### Charts

- Data (categories, series, values) and appearance (chart type, series
  colours, axis gridlines and visibility, legend styling) read and
  write, with shared style archives copied before writing.

### Tooling

- `npx -y cupertino-files mcp` — a zero-dependency MCP server with
  twenty tools covering describing, reading, editing and formatting
  documents, for Claude Code, Claude Desktop, Cursor and friends.
- `npx -y cupertino-files dump` (also `cupertino-dump`) — inspection CLI.
- A Claude Code skill ships in the package.

### The format itself

- `docs/FORMAT.md` — the specification as measured, container to calc
  engine; vendored schema dumps with provenance in `proto/`; a
  language-neutral conformance suite in `conformance/` and a
  calendar-versioned format bundle for other implementations.
