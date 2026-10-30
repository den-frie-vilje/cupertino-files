# Changelog

Notable changes, kept in the spirit of [Keep a Changelog](https://keepachangelog.com/).
The package follows [semantic versioning](https://semver.org/). Entries are
user-facing—bug fixes, API changes, and new features; the how and why live
in commit messages and pull requests.

## Unreleased

### Fixed

- A stroke given without a pattern (`{ color, width }`) is written solid,
  with the whole pattern message the apps write; before, the stroke had
  no pattern at all, which Pages filled with an empty dash list.
- Direct paragraph and character formatting creates a style marked as a
  variation of its parent, as the apps mark every parented style.
- A table copied with `addTable({ copyOf })` kept its donor's table id
  string beside the fresh calc-engine identity the copy was given, and
  Numbers re-minted the copy on open, so a formula in another table
  naming the copy read `#REF!`. The copy's id is now its own identity,
  the way every app-written table states it.
- A formula's reference to its own table that the app had stored as a
  cross-table node (what a copied or renamed table leaves behind)
  rendered with the table's name in front, `CrossCheck::C3`, where the
  app's formula bar shows `C3`. It now renders as the app shows it.
- A table added to a Pages page or a Keynote slide takes the app's own
  cell size in both dimensions whatever its row and column count
  (Keynote 432.25 by 129.8 points in the layout's frame, Pages 120.386
  by 22.73), with a geometry to match, instead of the Numbers donor's
  20-point rows and an equal share of the width.

- A build and its chunk no longer declare the drawable and the build they
  point at; the apps never do, and Keynote dropped the declarations on
  resave.

- `addCategory` retires the table's previous root group node with its
  declaration instead of leaving both beside the new root.

- Reading a filter rule on a table's first column threw: the rule's
  column is a signed offset from the app's host column stored in an
  unsigned field, and column A reads as the wrapped value. The reader
  takes the sign, and `addFilterRule` writes a rule on column A the same
  way instead of refusing it.

- A table grafted onto a Pages page or a Keynote slide now takes the
  host theme's first table style preset: its styles are the preset
  network's members and its cell-level styles hang off them, the way a
  table the app inserts is wired, instead of carrying a Numbers theme's
  styles along. The feature is no longer marked experimental.

- The calc engine's formula-owner dependencies and a table's summary
  model, summary cell vendor and category order no longer declare the
  table info they belong to; none written by the apps does.

- A table model this library creates or edits declares its references
  the way the apps do: every one but the style preset (no corpus model
  declares it) and none of the numbers inside its merge owner and
  deprecated category owner, in the apps' own order. Measured against
  all 71 corpus models, the lists match exactly.

- A reference to a component's root object—a tile, a data list, a
  slide—is now recorded in the package metadata as a component-level
  row, the way the apps record a whole-component dependency, rather
  than a row per object. Every such reference in the corpus is recorded
  that way; a document edited and saved keeps its metadata byte for byte.

- A table this library creates no longer declares its parent—the
  sheet, body or slide—among its object references. Apple's table
  infos never do (71 of 71 in the corpus carry a parent, none declares
  it), and the table info now joins the drawable types the store treats
  that way.

- A document whose filter the library disabled could open filtered
  with a toggle that died after one use, when a copied table had
  inherited its donor's hidden-row state list—entries naming the
  donor's rows. A fresh copy now starts with no state list, and
  `setEnabled(false)` flips the flag and leaves the list alone: the
  app keeps it across enable/disable, and removing it left the filter
  permanently inert. Known limitation: copying a table into a
  document whose filters have actually run still breaks that
  document's filter toggle in Numbers—every registration shape
  measured so far does—so until the app's own duplicate is
  measured, avoid table copies in filter-bearing documents.

### Changed

- A new table takes the shape the apps' Insert ▸ Table gives: 10 rows by
  5 columns of 98 points in Numbers, 5 by 4 across the body in Pages and
  across the layout's object frame in Keynote, each with one header row
  and one header column. `addTable`, `appendTable` and `insertInlineTable`
  without rows produce it; given rows, the counts follow the rows and the
  columns still fill the host.

- Duration formats are written with the app's duration type (268)
  instead of the custom-duration code, and the automatic-units flag is
  read and written alongside style and units.

- Field numbers now resolve from schema descriptors extracted from the
  15.1 applications themselves, for all three apps. The Pages-specific
  schema, previously the Pages 5.0 dump from 2013, grows from 21 to 42
  messages, so every Pages archive the apps write today is addressable
  by name. Additions to the shared families since 14.4 are named too:
  a colour's `headroom`, a placeholder field's `localizable`, and the
  section-template fields of a Pages section under their current names.

### Added

- A stroke's `pattern` takes `"short-dashed"`, `"dashed"`, `"long-dashed"`
  and `"dotted"`, the four dashed items of Pages' Borders & Rules
  line-style menu, written as the app writes them. Dash arrays in points
  still draw, but the control shows None for them.
- Every written colour carries the HDR headroom the current apps stamp
  on their own colours.
- `canvasComments()` on a Numbers document and on a Keynote slide reads
  the comments pinned to a sheet or a slide, with author and date.

- The vendored schemas are the 15.4 applications': the stylesheet's
  versioned-style snapshots for 15.2 to 15.4, a sheet's hidden flag and
  tab colour, and Keynote's custom build angle, blur and text-alignment
  attributes are now named fields.

- Formulas may use the 18 functions Numbers 15.4 adds (ACOT, ACOTH, COT,
  COTH, CSC, CSCH, SEC, SECH, XOR, COMBINA, GAMMA, PHI, FISHER,
  FISHERINV, PERMUTATIONA, DAYS, PEARSON, RSQ); 363 are named.

- `addFilterRule(column, { operator, value })` adds a row-filter rule
  comparing a column's cells with a number or a string, written as the
  app writes one, switches the filter on and writes the rows it hides,
  evaluated offline. The operator may also be "contains" for a
  text-contains rule or "startsWith" for a starts-with rule, each written
  as the app writes it; other function-shaped rules are not authored.
  Numbers has not yet been seen to open a filter written this way.

- A filter rule's `column` now reads as the absolute column the rule
  tests; it was the index of a boundary entry before, which happened to
  be one less.

- The MCP tool `add_image` puts a picture from a file on disk inline in a
  Pages body or on a Keynote slide, through `insertInlineImage` and
  `addImage`, which were API-only before.

- Tables from nothing in Pages and Keynote: `doc.appendTable(rows)` and
  `doc.insertInlineTable(pos, { rows })` put a table in a Pages body,
  inline in a paragraph of its own, and `slide.addTable({ rows, x, y })`
  puts one on a Keynote slide—the neutral table every app shares (the
  blank Numbers document's own, Apple-made), grafted under the body or the
  slide and sized and filled from `rows`, its styles listed in the host
  stylesheet and its preset in the host theme. `insertInlineTable` takes the
  neutral table by default and copies a table in the document only when
  `copyOf` names one; it no longer refuses a document without a table. Served as the MCP tool
  `add_table`; the Markdown constructors now make real tables of pipe
  tables. Neither app has yet been seen to open a table placed this way.

- `slide.setLayout(master)` puts a Keynote slide on another layout the
  way Format ▸ Slide Layout does: fresh placeholders from the new master,
  the title and body text carried over, every other drawable kept, the
  old placeholders gone. `manage_slides` takes `set_layout`. Keynote has
  not yet been seen to open a slide changed this way.

- `section.moveToSectionMaster(drawableId)` moves a drawable from its
  page onto the section master so it repeats on every page, and
  `doc.insertPageBreak(paragraphIndex)` ends a paragraph with a page
  break, each written as Pages writes it. Pages has not yet been seen to
  open either.

- `PagesDocument.fromMarkdown(md)`, `KeynoteDocument.fromMarkdown(md)`,
  `NumbersDocument.fromMarkdown(md)` and `NumbersDocument.fromCsv(csv)`
  build a new document from text: Pages gives headings the template's
  Title and Heading styles and lists its Bullet and Numbered styles;
  Pages also turns links into hyperlinks, bold and italic into direct
  formatting and footnote references with a definition into footnotes;
  Keynote keeps links, bold and italic in a slide's body; Keynote makes a slide per heading with the
  lines beneath as its body and block quotes as presenter notes; Numbers makes a sheet per top-level
  heading and a table per pipe table, named by the heading above, with
  numbers, TRUE/FALSE and ISO dates typed. `create_document` takes `content`
  (and `format: "csv"`), and `cupertino-files import <src> <doc>` does
  the same from a file. An image on a line of its own becomes an inline
  picture in Pages or a picture on the slide in Keynote when its bytes
  can be found: through `images` in the API, `imageRoot` on the tool,
  and beside the source file on the command line. A thematic break
  (`---`) starts a new slide in Keynote. With `template`—a document of
  the same kind, emptied the way `blankFrom` does—the result keeps that
  document's theme and styles, and `layout` names the Keynote layout for
  content slides; `create_document` takes both, and `import` takes
  `--template` and `--layout`. A front matter block's `header` and
  `footer` are written into a Pages template's first section, and a
  Pages export leads with the first section's header and footer as front
  matter, so a document comes back with them.

- `doc.toMarkdown()` renders any document as Markdown—a Pages body
  with headings from the named styles and list paragraphs as list items,
  Numbers as a section per sheet with each table as a pipe table, Keynote
  as a section per slide with body items and quoted presenter notes, and
  charts as a table of their series—and `table.toCsv()` renders a table
  as RFC 4180 CSV. Inline tables and pictures render where the body
  anchors them, a slide's pictures and tables under its heading; pictures
  are written through an image sink (`images` in the API, an `assets`
  directory on the tool, `--assets` on the command line) and linked.
  Hyperlinks render as links, bold and italic character styling as
  markers, and footnotes as references with their definitions after the
  text; a slide's free text boxes follow its body, and the text of the
  shapes and text boxes placed on Pages pages follows the body. Comments
  are quoted where they sit—a cell's after its table, naming the cell;
  a paragraph's after its text, quoting the words—with their authors. A table's name heads
  it only when the table shows its name;
  Numbers sheets are top-level headings and their tables second-level. Served as the MCP tool `export_document`
  (markdown, csv or text) and the CLI subcommand `cupertino-files export
  <file>`.

- `slide.background()` reads a Keynote slide's background fill up its
  style chain, and `slide.setBackground(fill)` sets one, as the app does:
  a variation style of the slide's own under the layout's, replaced in
  place on a second call. Also served as the MCP tool
  `set_slide_background`. Keynote has not yet been seen to draw a
  background written this way.

- `doc.addSlide({ master })` makes a Keynote slide from one of the deck's
  layouts, by name or id, as the app's own "add slide" does: the master is
  deep-copied and the copy made a content slide, with empty title and body,
  a note, and the slide-number attachment; the master's name, object
  placeholder, style lists and thumbnail texts stay the master's. The MCP
  tool `manage_slides` takes `master` on `add`. Keynote has not yet been
  seen to open a slide made this way.

- `slide.addTextBox(text, { x, y, width, height })` on a Keynote slide
  and `doc.addTextBox(pageIndex, text, placement)` in Pages add a text
  box by deep-copying one the document already carries—its own storage,
  styles and path—then setting the text, placing it and repointing its
  parent to the slide (or clearing it, as Pages' floating boxes carry
  none). A document with no text box to copy is refused. Also served as
  the MCP tool `add_text_box`. Neither app has yet been seen to draw a
  box written this way.

- `slide.addBuild({ drawableId, effect, duration, delay })` animates a
  drawable on a Keynote slide with an all-at-once build played on click,
  written in the shape the app's own builds have; `delivery:
  "byParagraph"` instead writes one stage per paragraph of the target's
  text, each played on click. Actions and build order are not authored.
  Keynote has not yet been seen to play a build written this way.

- `addCategory(column)` groups a table's rows by the values in a column,
  and `addCategory([first, second, …])` nests the groups by several:
  one group per distinct value at each level in text order, each holding
  its rows, written in the shape every categorised document carries and
  switched on. A level given as `{ column, bucket }` groups a date column
  by year, month, quarter, week, day or weekday with the app's own
  bucketing formula. Summaries are not authored. Numbers has not yet been
  seen to draw a category defined this way.

- A duration written with `setCell` is stamped with the app's own fresh
  duration format: short style, hours down to seconds, automatic units
  on. Before, a typed duration carried no format at all.

- Every spreadsheet function Numbers 15.1 registers is authorable by
  name: the function index table grows from 272 to 345 entries, read
  from the application's own function registry (`npm run harvest --
  --binary <Numbers.app>`) and confirmed by the document harvest. The
  additions include IF, TRUE, FALSE, NOW, TODAY, XLOOKUP, XMATCH,
  SWITCH, LET, LAMBDA, FILTER, SORT, UNIQUE, SEQUENCE and the text
  functions; the "text contains" condition now renders its callee as
  FIND.CASEINSENSITIVE instead of FUNCTION_296.

## 0.5.0 — 2026-10-25

Numbers documents this library writes now register with the app's
calc engine the way the app's own do, so conditional rules evaluate,
copied tables compute, and written values align automatically. Keynote
gains pictures on slides and slide copies laid out the way the app lays
out its own. Styling defaults are the apps' measured ones, and
`doc.audit()` plus save-time validation catch the faults a person
otherwise finds by opening the file.

### Fixed

- A slide added or duplicated into a deck Keynote had saved landed in
  the source slide's component, and Keynote would open and render the
  result but refuse to save it. A copied slide now gets a package
  component of its own, registered the way the app registers one.
  Keynote has not yet been seen saving such a deck; the layout matches
  every Keynote-saved deck measured.
- `addSlide({ withContent: false })` stripped the fresh slide's presenter
  notes storage, and setting `notes` on it then threw. The note now
  stays, emptied—the shape every app-written slide has.
- `style()` answered `undefined` for text boxes: a text box keeps its
  style reference on an embedded archive one level below where the
  scan looked. The scan now descends, so text-box fills, strokes, and
  shadows read and write like any other drawable's.
- The documented transition example used an effect id Keynote discards.
  The docs now carry the two measured effect families and say plainly
  that ids are written verbatim, so only the app's own names take.
- Colours written without an explicit `space` now carry sRGB, the way
  the apps have written every colour since iWork 19; bare colours are a
  2013/2016-era shape. An explicit `space` (P3 included) is unchanged.
- A dashed border read from an app-written document reported six dash
  lengths—the real ones plus the format's zero padding. The dash
  count field is now honoured both ways: reading slices to the counted
  dashes, and writing states phase, count, and the padded float list the
  apps write.
- A reflection stored as an empty archive—the app's usual state, where
  presence alone means "on at 50 percent"—read back as no reflection at all.
  It now reads as opacity 0.5, the archive's documented default.
- Gradients written by `setFill` and friends omitted the opacity,
  advanced-mode flag, and direction fields the apps state on every
  gradient. A written gradient now carries the app's fresh-gradient
  shape—full opacity, simple mode, top-to-bottom—and `Gradient`
  gains optional `angle` (radians) and `advanced` fields, both read
  back from documents that state them.
- `lineSpacing` wrote an explicit mode field the apps leave to its
  default; a written spacing now states the amount alone, the shape
  every app-written multiple-line spacing has.
- Conditional rules written by `setConditionalRules` showed in Numbers'
  Format sidebar but never drew their fills until each cell was manually
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
- A table copied with `addTable`, `addSheet`, or `insertInlineTable`
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
  conditional-formatting rules—visible in the Format sidebar, never
  evaluated. A content-less copy now starts without them.
- A document whose filter the library turned off could open filtered
  with a filter control that died after one use, when a copied table had
  inherited its donor's hidden-row state list—entries naming the donor's
  rows. A fresh copy now starts with no state list, and
  `setEnabled(false)` flips the flag and leaves the list alone: the app
  keeps it when the filter is turned off and on, and removing it left
  the filter permanently inert. Known limitation: copying a table into a
  document whose filters have actually run still breaks that document's
  filter control in Numbers—every registration shape measured so far
  does—so until the app's own duplicate is measured, avoid table copies
  in filter-bearing documents.

### Added

- `KeynoteDocument.addImage` puts a picture on a slide—the gap that
  made "swap an image" impossible in Keynote. The image arrives in the
  shape the app writes for its own: parented on the slide, aspect
  locked, styled with the theme's image style, in both drawable lists
  so it paints, sized from its pixels (or a PDF's page box) and
  centred unless placed explicitly. Keynote has not yet been seen
  drawing a picture this library added; the archive matches the app's
  own for every slide picture measured.
- `setPathRectangle` rewrites a text box's rectangular path beside its
  frame. A shape's path renders scaled from its own stored size to the
  frame, text included, so a text box resized by frame alone shrinks
  or clips its text; pairing `setGeometry` with `setPathRectangle`
  resizes it the way its text expects. Non-rectangular paths are
  refused rather than flattened.
- Cell comments can now be read: `table.cellComments()` lists every
  comment the app has on a table's cells—position, text, author,
  date, and replies—and `table.cellComment(row, column)` reads one.
  Comments are preserved on edit; writing one stays the app's job.
- `NumbersDocument.setActiveSheet(index)`—re-point the stored sheet
  selections Numbers consults when choosing the tab to open on. Tab
  order does not decide it, and the re-pointed selections have proved
  necessary but not sufficient: one review round opened on the chosen
  sheet and a later one did not, so the call is best-effort until the
  deciding state is found.
- `doc.audit()`—an offline check for the faults a person otherwise
  finds by opening the document: malformed table anchors, missing
  calc-engine registration, cross-table references whose target no
  table carries, conditional rules the engine never evaluates, and
  values without display formats. Each finding names the cell or table
  and what the app would do.

### Changed

- `NumbersDocument.addTable` without `copyOf` now grafts the embedded
  Apple-made blank table instead of cloning whatever table the document
  contains: the new table arrives empty and neutrally styled,
  inheriting nobody's widths, fills, or wrap styles. Passing `copyOf`
  keeps the duplicate behaviour. The graft rides a new cross-document
  import (`deepCloneObjectInto`) that refuses any subgraph it cannot
  carry whole.
- `save()` now refuses to write a document containing an archive with
  a missing `required` field—the class the apps report as damaged—naming
  the object and field instead of producing the file.
- Formulas written by `setFormula` now carry the calc engine's
  dependency records on their table's owner—cell, range, and
  whole-column records matching the app's own. Cross-table references
  written into a document Numbers has not opened yet may still be
  reduced to their cached values on first open; the review rounds
  chasing that are ongoing.

## 0.4.0 — 2026-08-14

### Fixed

- Shadows written by this library could crash Pages when edited in the
  app's Format sidebar. Shadow archives are now written with the
  complete field set the apps require, and styling one drawable no
  longer writes through a style archive shared with other drawables—the
  write goes to a private override style, as the apps do.
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

- `TextStorage.normalizeTail()`—remove a trailing paragraph
  terminator safely, so a built document ends without a stray empty
  paragraph.
- `fillPlaceholder` accepts a `placeholders()` entry or a bare field
  id; the span is resolved at call time, making any fill order safe. A
  field id that no longer exists throws instead of editing whatever
  text now occupies its old offsets.

### Changed

- `DEFAULT_SHADOW` now matches the app's own "add a shadow" preset (270°
  as the Format sidebar shows it, offset 2, blur 5, 50 percent opacity).
  Library defaults follow the apps' defaults.

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
  its own data list—the state behind cloned tables reloading empty.
  `TableModel.orphanReferences()` is the diagnostic.
- A floating copy of an inline image did not wrap text.
- `insertSectionBreak` shared page masters between the new section and
  its neighbour, so their headers could never differ.
- Header or footer text written into a previously empty column did not
  draw; column indexes outside 0..2 now throw.
- One right-to-left paragraph no longer turns paragraphs appended after
  it right-to-left.
- Authored paragraph borders did not draw; strokes are written complete
  and the legacy positions field the Format sidebar reads is written beside
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

- `CellFormatting.horizontalAlignment`—cell text alignment, enum or
  name; `null` restores the band default.
- `TableFormatting` covers the full modern table-style surface
  (dividers, header border, all sixteen band strokes); every key is
  three-state, `null` clearing the field so the style inherits.
- `insertRows`/`insertColumns` inherit the displaced row's or column's
  cell and text styling. `TableModel.textStyleId` and `textStyle` join
  the cell-style pair.
- `PagesDocument.insertInlineTable(pos, options)`—anchor a copy of an
  existing table inline in body text.
- `TableModel.nameVisible`—whether the app draws the table's name.
- Paragraph `alignment` accepts names (`left`, `right`, `center`,
  `justified`, `natural`) beside the enum, and rejects anything else at
  the call.
- `ruleOffset` on paragraph formatting—the distance between text and
  its border rules; negative pulls the rules toward the text.
- `setParagraphDirection(i, "rtl" | "ltr" | "natural")` and
  `paragraph(i).setDirection(...)`.
- `BorderPosition.LEADING`/`TRAILING`: border side bits are logical and
  swap sides with the paragraph's writing direction; `LEFT`/`RIGHT`
  remain as the left-to-right aliases.
- `paragraphStylesInUse()`—the styles a body actually uses;
  `paragraphStyles()` lists only named styles.
- `body.endsWithEmptyParagraph`—whether the app will draw an empty
  final paragraph after the text.
- `TextStorage.copyShapeFrom`—adopt a sibling storage's table shape
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
  title, and caption stand-ins), matching current app output.

## 0.2.0 — 2026-08-03

### Added

- Placeholder text—the template tap-to-replace mechanism—as a
  first-class feature: `placeholders()` lists the spans,
  `fillPlaceholder()` fills one and sheds the marking the way typing
  does, `defineAsPlaceholder()` / `find(...)[0].asPlaceholder()`
  create one. An image placeholder is the same field over the image's
  object character.
- `characterFormattingAt(pos)`—the formatting in effect at a
  position, inheritance folded in; `characterStyleRuns()` is the
  whole-document sweep.
- `applyEdits([...])`—apply many non-overlapping edits from one
  snapshot, no ordering discipline required.
- `characterStyleIdAt(pos)`.
- One-click releases for maintainers (Actions > Release), publishing
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

- Node 22 or later (Node 18 and 20 are end-of-life); CI adds Node 26.
- Toolchain refresh: TypeScript 6, `strictTypeChecked` linting, and an
  `npm audit` gate in CI.

## 0.1.0 — 2026-08-03

The first release: an ongoing reverse-engineering of Apple's iWork
format as a working, zero-dependency TypeScript library.

### Documents

- Load, edit, and save Pages, Numbers, and Keynote documents (modern IWA
  format, 2013 →), in Node 22 or later and browsers—bytes in, bytes out.
- New documents from nothing: `blank()` on each app class instantiates
  an embedded, Apple-authored donor—A4 for Pages and Numbers, 16:9
  for Keynote—the same way the apps instantiate a bundled template,
  dressed in the house typography: Palatino body text, Helvetica Neue
  headings, a terracotta accent. `blankFrom(bytes)` does the same with
  any document as the template.
- Byte-fidelity round trips: untouched components are preserved exactly,
  and for documents written by current apps an edited save is typically
  byte-for-byte what the app itself would have written—the Snappy
  compressor is a byte-exact port of both encoder vintages Apple has
  shipped, and the zip container mirrors Apple's writer's quirks.
- Version-aware loading: newer documents warn rather than fail, and
  fields this library has never heard of ride along unharmed.
- iWork ’09 XML and password-protected documents are detected and
  refused, never mis-parsed.

### Text, styles, and layout (Pages)

- Body editing that keeps every attribute table consistent: find and
  replace, paragraph append, character, and paragraph formatting, named
  styles (create, apply, edit), sections, headers, and footers, page
  setup, comments, footnotes, bookmarks, links, and smart fields (page
  numbers, dates).
- Inline image insertion, app-confirmed; floating drawables move,
  resize, copy, and style, with image crops read and written.

### Tables (all three apps)

- Cells read and write with presentation preserved; cell and table
  styling, bands, row and column operations, display formats.
- Formula authoring compiled to Apple's own AST encoding—operators,
  ranges, anchored and cross-table references (`Other::A2`),
  whole-column spans, 272 measured function names—with every
  parseable corpus formula rebuilding byte-identical to Apple's bytes.
- Merges written the way the calc engine keeps them, dependency ledger
  included; conditional formatting, filters, categories, and cell
  controls read.

### Keynote

- Slide management (add, duplicate, reorder, remove, skip), titles,
  bodies, presenter notes, auto-advance, slide size; builds read.

### Charts

- Data (categories, series, values) and appearance (chart type, series
  colours, axis gridlines, and visibility, legend styling) read and
  write, with shared style archives copied before writing.

### Tooling

- `npx -y cupertino-files mcp`—a zero-dependency MCP server with
  twenty tools covering describing, reading, editing, and formatting
  documents, for Claude Code, Claude Desktop, Cursor, and friends.
- `npx -y cupertino-files dump` (also `cupertino-dump`)—inspection CLI.
- A Claude Code skill ships in the package.

### The format itself

- `docs/FORMAT.md`—the specification as measured, container to calc
  engine; vendored schema dumps with provenance in `proto/`; a
  language-neutral conformance suite in `conformance/` and a
  calendar-versioned format bundle for other implementations.
