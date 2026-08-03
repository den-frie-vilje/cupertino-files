# Changelog

Notable changes, kept in the spirit of [Keep a Changelog](https://keepachangelog.com/).
The package follows [semantic versioning](https://semver.org/); commit
history uses Conventional Commits, so the detail behind any entry is one
`git log` away.

## 0.1.0 — unreleased

The first release: an ongoing reverse-engineering of Apple's iWork
format as a working, zero-dependency TypeScript library.

### Documents

- Load, edit and save Pages, Numbers and Keynote documents (modern IWA
  format, 2013 →), in Node ≥ 18 and browsers — bytes in, bytes out.
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
  thirteen tools covering describing, reading, editing and formatting
  documents, for Claude Code, Claude Desktop, Cursor and friends.
- `npx -y cupertino-files dump` (also `cupertino-dump`) — inspection CLI.
- A Claude Code skill ships in the package.

### The format itself

- `docs/FORMAT.md` — the specification as measured, container to calc
  engine; vendored schema dumps with provenance in `proto/`; a
  language-neutral conformance suite in `conformance/` and a
  calendar-versioned format bundle for other implementations.
