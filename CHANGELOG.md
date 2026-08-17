# Changelog

Notable changes, kept in the spirit of [Keep a Changelog](https://keepachangelog.com/).
The package follows [semantic versioning](https://semver.org/). Entries are
user-facing — bug fixes, API changes and new features; the how and why live
in commit messages and pull requests.

## Unreleased

### Fixed

- Conditional rules written by `setConditionalRules` showed in Numbers'
  inspector but never drew their fills until each cell was manually
  re-entered. Covered cells are now registered in the calc engine's
  dependency ledger, which is what the app evaluates from.
- Numbers rendered values written by `setCell` left-aligned instead of
  with automatic alignment. Two causes, both fixed: written values now
  carry the default display format the app gives a typed value
  (automatic number, text, boolean, or date), and they no longer carry
  the template's do-nothing text style, whose stated left alignment
  pinned them. A style carrying any real formatting is kept. A bare
  boolean format also now reads back as `boolean`; only a checkbox
  control's own format reads as `checkbox`.
- A table copied with `addTable`, `addSheet` or `insertInlineTable`
  shared its source's calc-engine identity, and cross-table references
  naming the copy could open in Numbers as ref errors. Copies now get
  their own identity and are registered with the calc engine the way
  the app registers a new table: the full owner family, listed in the
  engine's dependency tracker and mapped in its owner-id registry.
- Formula results written by `setFormula` without a cached value
  rendered left-aligned in Numbers where plain values were already
  automatic. The write now sheds the template's pinning text style
  whether or not a cached value is passed.
- A table copied with `withContent: false` kept its source's
  conditional-formatting rules — visible in the inspector, never
  evaluated. A content-less copy now starts without them.

### Added

- `NumbersDocument.setActiveSheet(index)` — choose the sheet the
  document opens on. Numbers keeps this in its stored selection state,
  not in tab order, so reordering sheets alone does not change it.
- `doc.audit()` — an offline check for the faults a person otherwise
  finds by opening the document: malformed table anchors, missing
  calc-engine registration, cross-table references whose target no
  table carries, conditional rules the engine never evaluates, and
  values without display formats. Each finding names the cell or table
  and what the app would do.
- `save()` now refuses to write a document containing an archive with
  a missing `required` field — the class the apps report as damaged —
  naming the object and field instead of producing the file.
- Formulas written by `setFormula` now carry the calc engine's
  dependency records on their table's owner — cell, range and
  whole-column records matching the app's own — so Numbers keeps
  library-written formulas through its re-registration instead of
  flattening them to their cached values.

## 0.4.0 — 2026-08-14

### Fixed

- Shadows written by this library could crash Pages when edited in the
  app's Shadow inspector. Shadow archives are now written with the
  complete field set the apps require, and styling one drawable no
  longer writes through a style archive shared with other drawables —
  the write goes to a private override style, as the apps do.
- Deleting a document's final paragraph terminator could leave style
  tables in a state the apps repair with document-wide style loss.
  Tail edits now keep every attribute table valid, and `save()` refuses
  to persist a text storage that violates the invariant rather than
  writing a corrupted file.
- Filling several placeholders from one `placeholders()` listing could
  put text in the wrong fields, because indexes shift as fills are
  applied.
- Editing a shadow dropped the app's type-specific settings (a curved
  shadow's curvature, a contact shadow's profile). They now survive any
  edit that keeps the shadow's type.

### Added

- `TextStorage.normalizeTail()` — remove a trailing paragraph
  terminator safely, so a built document ends without a stray empty
  paragraph.
- `fillPlaceholder` accepts a `placeholders()` entry or a bare field
  id; the span is resolved at call time, making any fill order safe. A
  field id that no longer exists throws instead of editing whatever
  text now occupies its old offsets.

### Changed

- `DEFAULT_SHADOW` now matches the app's own "add a shadow" preset
  (270° in inspector terms, offset 2, blur 5, 50 % opacity). Library
  defaults follow the apps' defaults.

## 0.3.0 — 2026-08-13

### Fixed

- Currency-formatted cells showed as "Automatic" in Numbers; the full
  format is now written.
- Checkbox formats showed as "Automatic"; a checkbox is now written as
  the app writes it. `setCellFormat({ kind: "checkbox" })` covers it.
- Cell borders did not draw; they are now written where the apps render
  from, and `cellBorders(row, column)` reads them back.
- Image crops written by the library render but refused the app's mask
  editor; masks are now complete drawables and the editor engages.
  (For images in the text flow the editor stays closed by app design;
  floating images open it.)
- A drawable copied with `addCopyOf` shared child objects (titles,
  captions, masks) with its source; copies own their children.
- Saving refuses a table whose records reference strings missing from
  its own data list — the state behind cloned tables reloading empty.
  `TableModel.orphanReferences()` is the diagnostic.
- A floating copy of an inline image did not wrap text.
- `insertSectionBreak` shared page masters between the new section and
  its neighbour, so their headers could never differ.
- Header or footer text written into a previously empty column did not
  draw; column indexes outside 0..2 now throw.
- One right-to-left paragraph no longer turns paragraphs appended after
  it right-to-left.
- Authored paragraph borders did not draw; strokes are written complete
  and the legacy positions field the inspector reads is written beside
  the bitmask.
- Character styling no longer bleeds into paragraphs appended after a
  styled ending.
- An edit touching a section's first character no longer destroys the
  document's section list.
- `formulas()` now lists formulas authored by this library, not only
  ones the app has computed.
- A paragraph with direct formatting no longer loses its style's name:
  names resolve through the parent chain, as in the apps.
  `hasDirectFormatting` tells the two apart.
- An appended paragraph no longer inherits the previous paragraph's
  list membership; pass a list style to `appendParagraph` to opt in.
- A lone `leftIndent` now indents in the app.
- Inline images are placed in the text column instead of at the page
  margin; `wrap: "page"` selects the other mode.

### Added

- `CellFormatting.horizontalAlignment` — cell text alignment, enum or
  name; `null` restores the band default.
- `TableFormatting` covers the full modern table-style surface
  (dividers, header border, all sixteen band strokes); every key is
  three-state, `null` clearing the field so the style inherits.
- `insertRows`/`insertColumns` inherit the displaced row's or column's
  cell and text styling. `TableModel.textStyleId` and `textStyle` join
  the cell-style pair.
- `PagesDocument.insertInlineTable(pos, options)` — anchor a copy of an
  existing table inline in body text.
- `TableModel.nameVisible` — whether the app draws the table's name.
- Paragraph `alignment` accepts names (`left`, `right`, `center`,
  `justified`, `natural`) beside the enum, and rejects anything else at
  the call.
- `ruleOffset` on paragraph formatting — the distance between text and
  its border rules; negative pulls the rules toward the text.
- `setParagraphDirection(i, "rtl" | "ltr" | "natural")` and
  `paragraph(i).setDirection(...)`.
- `BorderPosition.LEADING`/`TRAILING`: border side bits are logical and
  swap sides with the paragraph's writing direction; `LEFT`/`RIGHT`
  remain as the left-to-right aliases.
- `paragraphStylesInUse()` — the styles a body actually uses;
  `paragraphStyles()` lists only named styles.
- `body.endsWithEmptyParagraph` — whether the app will draw an empty
  final paragraph after the text.
- `TextStorage.copyShapeFrom` — adopt a sibling storage's table shape
  so written text renders.
- Keynote build effects and timing read (`effect`, `animationType`,
  `duration`, `delay`), and retiming writes.
- Filter-rule reading: columns, per-rule switches, combining mode and
  predicate formulas.
- Collaboration-mode components (LZFSE/LZVN containers) decode for
  inspection; the document model preserves them byte-for-byte.
- `findDrawableCore` returns `undefined` for a non-drawable instead of
  throwing.

### Changed

- `tables()` returns document order in both apps (Numbers: sheet tab
  order, then each sheet's drawables; Pages: body anchors by text
  position, then paint order).
- Inserted images carry the full modern drawable metadata (lock flags,
  title and caption stand-ins), matching current app output.

## 0.2.0 — 2026-08-03

### Added

- Placeholder text — the template tap-to-replace mechanism — as a
  first-class feature: `placeholders()` lists the spans,
  `fillPlaceholder()` fills one and sheds the marking the way typing
  does, `defineAsPlaceholder()` / `find(...)[0].asPlaceholder()`
  create one. An image placeholder is the same field over the image's
  object character.
- `characterFormattingAt(pos)` — the formatting in effect at a
  position, inheritance folded in; `characterStyleRuns()` is the
  whole-document sweep.
- `applyEdits([...])` — apply many non-overlapping edits from one
  snapshot, no ordering discipline required.
- `characterStyleIdAt(pos)`.
- One-click releases for maintainers (Actions → Release), publishing
  to npm via trusted publishing.

### Fixed

- Text edits reaching the end of a storage no longer smear styling
  document-wide.
- A `TextRange` invalidated by an earlier edit throws instead of
  silently editing the wrong span; edits after a range never
  invalidate it.
- Inserting rows or columns keeps the table's identity map in step
  with the grid; columns inserted by earlier versions were invisible
  in Numbers.
- `border_positions` reads and writes as the bitmask it is (1 top,
  2 bottom, 4 left, 8 right); the previous enum reading was wrong.
  `BorderPosition.LEFT`/`RIGHT` replace the interim names.
- `setConditionalRules` writes all six comparison operators.

### Changed

- Node ≥ 22 (Node 18 and 20 are end-of-life); CI adds Node 26.
- Toolchain refresh: TypeScript 6, `strictTypeChecked` linting, and an
  `npm audit` gate in CI.

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
