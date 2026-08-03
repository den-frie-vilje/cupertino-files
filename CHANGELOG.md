# Changelog

Notable changes, kept in the spirit of [Keep a Changelog](https://keepachangelog.com/).
The package follows [semantic versioning](https://semver.org/); commit
history uses Conventional Commits, so the detail behind any entry is one
`git log` away.

## Unreleased

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
