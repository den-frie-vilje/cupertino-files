---
name: cupertino-files
description: >-
  Read, inspect, and edit Apple iWork documents (.pages, .numbers, .key —
  modern IWA format, 2013+) using the zero-dependency `cupertino-files`
  TypeScript library. Use when a task involves extracting text from, editing
  text/styles/sections/margins in, or inspecting the internals of Apple
  Pages, Numbers, or Keynote files without Apple software. Do NOT use for
  iWork '09 XML files or password-protected documents (both are detected and
  rejected with clear errors).
---

# Working with Apple iWork files

The `cupertino-files` package manipulates iWork documents entirely in
TypeScript/JavaScript — no Apple apps, no external binaries, no native
modules. It works in Node ≥ 22 and browsers (bytes in → bytes out).

The package also ships an MCP server — `npx -y cupertino-files mcp` —
whose twenty tools (create, describe, read, edit and format tables, text,
slides, sheets, links and page setup) cover the common cases without
writing code, and a matching CLI (`cupertino-files tools` / `call`).
Tool descriptions are generated from the API's own docblocks
(`@agentTool` tags), so they cannot drift. Prefer the API below when a
task outgrows them.

```ts
import { PagesDocument, NumbersDocument, KeynoteDocument, IWorkDocument } from "cupertino-files";
```

The package is ESM-only — `require()` fails with
`ERR_PACKAGE_PATH_NOT_EXPORTED`. For a scratch script:
`node --input-type=module -e "…"` or a `.mjs` file.

## Loading and saving

```ts
import { readFileSync, writeFileSync } from "node:fs";

const doc = PagesDocument.load(new Uint8Array(readFileSync("report.pages")));
// ... edits ...
writeFileSync("report-edited.pages", doc.save());
```

- `PagesDocument.load` / `NumbersDocument.load` / `KeynoteDocument.load` for
  a known type; `IWorkDocument.open(bytes)` auto-detects the app.
- `doc.save()` returns package bytes. Unmodified parts are preserved
  byte-for-byte, so always prefer load → edit → save over rebuilding.
- Errors to expect: `EncryptedDocumentError` (password-protected),
  `RangeError` mentioning "iWork '09" (legacy XML format — cannot be edited
  by this library).

## Check what's supported before doing real work

```ts
const report = doc.compatibility();
report.era;                  // "iwork13" | "iwork16" | "iwork19" | "modern" | "current" | "future"
report.unsupportedFeatures;  // e.g. ["pre-BNC table cell storage: cell values cannot be decoded"]
report.warnings;             // unknown type IDs, patch archives, collaboration state…
report.canRoundTrip;         // true ⇒ untouched content is preserved byte-for-byte
doc.compatibilitySummary();  // one-line human summary
```

Loading **never** fails because a document is newer than the library —
unknown content is preserved and reported. If the report names unknown type
IDs and you know what they are, teach the library:
`registerTypes({ 10176: "TP.SomeNewArchive" }, "pages")`.

## Reading a Pages document

```ts
doc.isPageLayout;               // true ⇒ no body text flow; use textBoxes()
doc.bodyText;                   // plain text; paragraphs end with \n, inline objects are U+FFFC
doc.bodyOrUndefined;            // undefined for page-layout documents
doc.paragraphs();               // [{ index, start, end, text, styleId, styleName }]
doc.paragraph(n).styleName;     // named style of paragraph n, resolved through the
                                // parent chain — direct formatting does not hide it
                                // (.hasDirectFormatting says whether any is applied)
doc.paragraphStyles();          // named styles: [{ id, name, identifier, parentId }]
doc.listStyles();               // named list styles ("Bullet", "Numbered", "None", …)
doc.sections();                 // [{ index, start, end, name, pageNumberStart, ... }]
doc.sections()[0].headerText(1) // header center column ("" if empty); 0=left, 1=center, 2=right
doc.sections()[0].masterDrawables();  // watermarks/logos per first/even/odd master
doc.pageSetup();                // { pageWidth, pageHeight, *Margin, orientation } in points
doc.settings;                   // hyphenation, ligatures, footnoteKind/Format/Numbering, language
doc.drawables();                // shapes/images/tables with .geometry() → {x, y, width, height, angle}
doc.textBoxes();                // [{ drawable, storage, isTextBox }]
doc.tables();                   // embedded tables (see "Tables" below)
doc.links(); doc.allLinks();    // hyperlinks in body / everywhere
doc.smartFields();              // page numbers, dates, merge fields, links…
doc.footnotes(); doc.comments(); doc.bookmarks();
doc.format;                     // versions: fileFormatVersion, buildHistory
doc.stats();                    // components, object counts, type histogram
```

For Numbers: `doc.sheets()` → `[{ id, name }]`. For Keynote:
`doc.slideCount()`. All apps share `doc.textStorages()`, `doc.stylesheets()`,
`doc.drawables()`, `doc.allText()`.

## Editing a Pages document

The safe path — it covers the modal job (take a real template, keep its
design, swap the words, drop surplus paragraphs):

```ts
// Per-paragraph, by index: a ParagraphHandle resolves offsets at call
// time, so sequential edits never go stale.
const clause = doc.paragraph(4);
clause.text = "New wording for this clause";      // keeps the paragraph's styling
clause.setStyle("Body");
doc.paragraph(9).delete();                         // boundary-safe, even for the last paragraph

// Span replace: one atomic replaceWith per span — the replacement
// inherits the replaced span's styling, through \n splits too.
for (const hit of doc.find("TODO")) hit.replaceWith("Done").bold();

// Many spans from one pass: applyEdits needs no ordering discipline —
// every offset refers to the snapshot you read it from.
const spans = doc.paragraphs();
doc.applyEdits([
  { start: spans[2].start, end: spans[2].end, replacement: "New clause" },
  { start: spans[5].start, end: spans[5].end },     // omitted replacement = delete
]);
```

Three things the API enforces so you don't have to:

- A `TextRange` (from `find()`/`range()`) captures offsets. After an edit
  earlier in the text it throws `stale TextRange` instead of silently
  hitting the wrong span — use the range an operation returns, re-obtain,
  or use `applyEdits`. Edits *after* a range never invalidate it.
- `deleteRange` + `insertText` is **not** a replace: the deletion removes
  the span's styling with it, so the insert inherits from the collapsed
  boundary. Each call is correct alone; for replace semantics use
  `replaceWith` / `replaceRange` / `applyEdits`.
- Edits touching the very end of the text — deleting a tail, emptying or
  rewriting the last paragraph — are safe; the writer keeps the
  paragraph-style tables aligned for you.

And three semantics worth knowing before they surprise you:

- A replacement inherits the styling ruling at the **start** of the
  replaced range. If that position carries direct formatting (a
  distinctly styled token, say), the new text adopts it — restore
  formatting on the returned range, or better, use real placeholders
  (below) instead of styled tokens.
- Replacing **every occurrence** of one token: pass all hits from a
  single `find()` snapshot to `applyEdits` —
  `doc.applyEdits(doc.find("[client]").map((r) => ({ start: r.start, end: r.end, replacement: name })))` —
  non-overlapping hits of one token always qualify.
- After deleting paragraph runs next to auto-numbered headings, a
  surviving empty paragraph can inherit list membership and render as a
  stray numbered item; `doc.paragraph(i).setListStyle("None")` or
  `setStyle(...)` clears it.
- `paragraph(i).format({...})` parents the paragraph on an anonymous
  style — the look is right and `styleName` still reports the named
  style it inherits, but the paragraph now carries its own copy.
  `hasDirectFormatting` tells you which. For anything document-wide, set
  the property on the named style instead — `sheet.style("Heading").setParagraph({ keepWithNext: true })` merges — or make a named
  variant with `createParagraphStyle({ copyOf: "Heading", … })`.

### Building a long document by appending

Filling a template end-to-end is a different job from editing one in
place, and these are the parts that bite:

```ts
// Every appended paragraph states its own list membership: a bullet
// does not turn the rest of the document into a list.
doc.appendParagraph("Chapter One", "Heading");   // style names are the template's own — blank() defines "Heading", not "Heading 1"
doc.appendParagraph("Body text.", "Body");
doc.appendParagraph("A bulleted step", "Body", "Bullet");   // opt in per call

// A picture rides the text column by default, so it lines up with an
// indented body. `wrap: "page"` places it against the page margins.
doc.insertInlineImage(doc.body.paragraphStarts()[i], png, { fileName: "shot.png", width: 456 });

// What the template defines vs what it actually uses — a style nobody
// has seen next to the rest usually looks foreign on the page.
doc.paragraphStyles();        // every named style
doc.paragraphStylesInUse();   // [{ name, count }], most-used first
```

- **The app draws one more paragraph than `paragraphs()` lists** when the
  text ends with a terminator. That tail is *one* of the apps' shapes,
  not the norm: of the corpus's 27 body storages, 16 end bare — what
  typing leaves — 8 end with the terminator, 3 are empty. Appending
  preserves whichever convention the document already has (a `blank()`
  build ends bare), so check `doc.body.endsWithEmptyParagraph` rather
  than assuming either state, and call `doc.body.normalizeTail()` when
  a stray final line must not appear. Use `normalizeTail()`, not a raw
  `deleteRange(len - 1, len)` — it is the same edit with every
  attribute table kept lawful, which matters whenever the last
  paragraph carries character styling or a placeholder field.
- **Renaming a running header or footer**: `setFooterText` replaces the
  storage whole and takes the page-number fields with it. Edit in place
  instead, which any storage holding fields wants:
  ```ts
  for (const section of doc.sections())
    for (const t of section.templates())
      for (const storage of [...t.headers, ...t.footers])
        storage?.replaceAll(OLD_SUBJECT, NEW_SUBJECT);   // page fields survive
  ```
- **No API restarts list numbering.** Keep the source's own numbers as
  text when a document needs "1." to start again.
- **Removing a picture**: `removeAttachment` unlinks it; `doc.compact()`
  then reclaims the archives. The image bytes stay in the package —
  nothing traces a Data/ file safely enough to collect one.

### Placeholders — fill-in templates without styled-token hacks

Pages' native mechanism (Format → Advanced → Define as Placeholder
Text): a click selects the whole span, typing replaces it.

```ts
doc.placeholders();                     // [{ start, end, text, fieldId }] — "Tap or click to add …"
doc.fillPlaceholder(0, "Acme Corp");    // real text in, marking off, styling kept
doc.find("[client name]")[0].asPlaceholder();  // make a span tap-to-replace in Pages
```

Filling sheds the placeholder marking the way typing into one does —
programmatic content never stays flagged as ghost text. A placeholder
spanning an image's object character is how a body document marks an
image placeholder; the same calls read it.

**Filling several: pass the listing's entries, not fresh indexes.** A
fill removes its own entry, so the indexes of everything after it shift
down — `fillPlaceholder(0); fillPlaceholder(1); fillPlaceholder(2)`
lands two of the three in the wrong fields. Each entry of one
`placeholders()` snapshot carries the `fieldId` that pins it, resolved
live at the fill, so this is safe in any order:

```ts
const fields = doc.placeholders();
doc.fillPlaceholder(fields[0], "Acme Corp");
doc.fillPlaceholder(fields[1], "Ms. Jensen");   // offsets moved; the fieldId still lands it
doc.fillPlaceholder(fields[2].fieldId, "2026"); // the bare id works too
```

Offset-based calls (offsets are UTF-16 code units, identical to JS string
indexing, so `text.indexOf(...)` results are valid):

```ts
doc.replaceText("old", "new");                    // literal find/replace everywhere, returns count
doc.appendParagraph("New paragraph", "Heading"); // style by name (optional) — an unknown name throws
doc.setParagraphStyle(2, "Body");                  // paragraph index, style name or bigint id
doc.applyCharacterFormatting(start, end, { bold: true, fontSize: 18, fontColor: { r: 1, g: 0, b: 0 } });
doc.createParagraphStyle({ name: "My Style", basedOn: "Body",
  character: { italic: true }, paragraph: { alignment: 2, spaceBefore: 12 } });
doc.setPageSetup({ topMargin: 72 });               // points; 72 pt = 1 inch
doc.sections()[0].setHeaderText("Confidential");   // writes all page-master variants
doc.drawables()[0].setGeometry({ x: 100, y: 50 }); // move/resize objects
doc.insertText(pos, "inserted");                   // inherits the style ruling at pos
doc.deleteRange(start, end);
```

`appendParagraph` closes any character-style run open at the end of the
text, so a styled last line never bleeds into later appends.
`insertText` keeps the typing model: text inserted inside or at the edge
of a run takes the run's style.

### More fluent calls

```ts
doc.find(/https?:\/\/\S+/g).forEach((r) => r.link(r.text));
doc.paragraph(0).setStyle("Title");
doc.paragraph(2).setListStyle("Bullet");
doc.paragraph(2).insertAfter("Next point", "Body");
doc.paragraph(3).setDirection("rtl");  // base direction, written as the app's ⇄ control writes it
doc.range(0, 10).italic().color(0.8, 0, 0);
```

`find()` returns `TextRange`s (string = literal, RegExp honored). Ranges
support `.replaceWith() .delete() .format() .bold() .italic()
.underline() .fontSize() .fontName() .color() .link() .unlink()
.applyCharacterStyle() .applyParagraphStyle() .applyListStyle()
.paragraphs()`. Prefer ONE `.format({...})` call with all properties over
chaining sugar methods — each call creates a style object.

### Checking styling survived, without a Mac

`doc.paragraphs()[i].styleName` and `doc.paragraph(i).styleName` both resolve through the parent chain, so a directly formatted heading still names its style.
For character styling, copy-paste level:

```ts
doc.characterFormattingAt(pos);          // effective CharacterFormatting, inheritance folded in
doc.body.characterStyleIdAt(pos);        // the ruling character-style id (undefined = paragraph style alone)
doc.body.characterStyleRuns();           // one pass over the whole body: [{ start, end, objectId }]
```

`characterFormattingAt` answers "what colour/font/size is this position
really" with no style-chain walking; sweep `characterStyleRuns()` and
resolve each run once for whole-document audits. `undefined` ids mean
"no direct character styling — the paragraph style alone applies",
which is the normal state of most text, not a failure. What no offline
read can prove is how the app *renders*. When a render is wrong,
bisect: one operation per file, each from a fresh copy of the original,
open each — the failing rung names the operation.

**`paragraphs()` is the wrong instrument for layout.** Text and style
come back right from documents whose pages are wrong — a picture drawn
outside its column, a paragraph flowing over the footer, a heading that
has left the table of contents. What a build script can assert offline
is the countable: list membership against what the source asked for,
picture and heading counts, `hasDirectFormatting` where a named style
was meant, `endsWithEmptyParagraph`, `paragraphStylesInUse()` against
the template's own vocabulary, geometry and indents against the
template's. Then still look at a page.

**Character** options: `bold`, `italic`, `fontSize`, `fontName`
(PostScript name), `fontColor`, `backgroundColor` (highlight), `underline`
(0 none / 1 single / 2 double / 3 wavy), `underlineColor`,
`underlineWidth`, `wordUnderline`, `strikethru` (0..3), `strikethruColor`,
`strikethruWidth`, `wordStrikethru`, `capitalization` (0 none / 1 all caps
/ 2 small caps / 3 title), `ligatures`, `superscript` (0 / 1 super /
2 sub), `tracking`, `kerning`, `baselineShift`, `outline`, `outlineColor`,
`shadow`, `language`.

**Paragraph** options: `alignment` (0 left, 1 right, 2 center,
3 justified), `spaceBefore`, `spaceAfter`, `firstLineIndent`, `leftIndent`,
`rightIndent`, `lineSpacing`, `keepLinesTogether`, `keepWithNext`,
`pageBreakBefore`, `widowControl`, `hyphenate`, `outlineLevel`,
`showInToc`, `backgroundColor`, `border` (a stroke), `borderPositions`,
`roundedCorners`, `ruleWidth`, `tabs`, `defaultTabStops`, `decimalTab`,
`writingDirection`.

Colours are `{ r, g, b, a?, space? }` with channels in 0..1 and `space`
`"srgb" | "p3"`; `hexColor("#f5f5f0")` parses the usual notations. Passing
`undefined` for a nullable property (`fontName`, `fontColor`,
`backgroundColor`, `border`, …) means **explicitly none**, not "inherit".

All text offsets are UTF-16 code units — identical to JavaScript string
indexing, so `text.indexOf(...)` results are valid offsets.

## Editing named styles

Editing a style changes every run that uses it — the difference between
"make this heading blue" and "make all headings blue".

```ts
const heading = sheet.style("Heading")!;   // undefined for a name the template does not define   // or sheet.style(styleId)
heading.character();                          // what this style overrides
heading.paragraph();
heading.resolved().character;                 // with the parent chain folded in
heading.setCharacter({ fontSize: 20, fontColor: hexColor("#003366") });
heading.setParagraph({ border: solidStroke({ r: 0, g: 0, b: 0 }, 1),
                       borderPositions: BorderPosition.BOTTOM });
```

Setters **merge**: properties the library does not model are preserved.

Creating a style that a person can then pick from the paragraph styles
panel (Pages):

```ts
const id = doc.createParagraphStyle({
  name: "Callout",
  copyOf: "Body",                  // start from Body's full property bags
  character: { fontSize: 24, fontColor: hexColor("#0044cc") },
});
doc.setParagraphStyle(paragraphIndex, id);
doc.listedParagraphStyles();       // the panel's entries, in panel order
doc.unlistParagraphStyle(id);      // take it out of the panel, keep the style
```

Listing is confirmed in Pages and takes four things, all handled for you:
a name, an identifier plus its `identifier_to_style_map` entry, both
property bags, and an entry in the theme's preset list. `copyOf` starts
the bags as a full copy of an existing style's — the dense shape every
listed Apple style has; without it the style sets only what you asked for.

## Shared style values

Fills, gradients, strokes and shadows are one vocabulary used by text,
table cells and shapes alike:

```ts
import { colorFill, linearGradient, solidStroke, hexColor, allBorders } from "cupertino-files";

colorFill(1, 0.9, 0.2);                                 // flat colour
linearGradient(hexColor("#fff"), hexColor("#0066ff"));  // two-stop gradient
solidStroke({ r: 0, g: 0, b: 0 }, 1);                   // 1pt solid border
({ color: { r: 0, g: 0, b: 0 }, width: 1, pattern: [4, 2] });  // dashed
```

## Tables

`doc.tables()` is document order on both apps — Numbers walks sheets in
tab order, Pages the body's anchors by text position — so `tables()[0]`
is the first table on the page even right after an `addTable`/
`insertInlineTable`. Saving verifies every changed table's records
resolve in its own data lists and refuses the file otherwise, naming
the table and cells (`orphanReferences()` is the diagnostic behind it).

```ts
const tables = doc.tables();                 // any app; numbersDoc.tables(sheetId) scopes to a sheet
const t = tables[0];
t.name; t.rowCount; t.columnCount; t.headerRowCount; t.footerRowCount;
if (!t.hasReadableCells) { /* pre-BNC storage — see below */ }
t.cells();        // [{ row, column, value }] non-empty cells
t.grid();         // dense (CellValue | null)[][]
t.merges();       // [{ row, column, rowCount, columnCount }] anchored top-left
t.mergeAt(0, 1);  // the merge covering a cell, if any
t.isCovered(0, 1);// true when a merge anchored elsewhere swallows this cell
cellValueToString(cell.value);
```

`CellValue` is a discriminated union on `.type`: `empty | number | text |
richText | date | bool | duration | error`, each with `isFormula` (formula
cells carry their cached result, so no evaluator is needed).

### Formulas

Formulas belong to *tables*, not to Numbers — a table in a Pages document
or a Keynote slide has the same calc engine.

```ts
t.cellFormula(1, 3);          // "=B2*C2", or undefined for a literal
t.formulas();                 // [{ row, column, formula }] for the whole table
t.cellFormulaDetail(1, 3);    // { text, unknownFunctions, unknownNodeTypes, hasCrossTableReferences }
```

Rendering takes a position because references are stored as **offsets from
the cell using them** — one stored formula renders differently in every
cell of a filled-down column.

Two honest gaps, both visible in the output rather than papered over:

- **Function names are not in the format.** 272 measured ids are named;
  an unknown one renders as `FUNCTION_<id>` and is refused for writing.
  Add more with `registerFormulaFunctions({ 42: "AVERAGE" })`, or measure
  on a Mac with `npm run harvest -- --drive`. `functionTableProvenance()`
  reports how many names are in effect and where they came from.
- **Cross-table references resolve to table names** (`Other::A2`) via the
  calc engine's owner identities, both reading and writing.

Writing formulas: `t.setFormula(row, col, "=SUM(B2:B9)", { value: 1500 })`
— text in, Apple's exact AST encoding out. Nothing evaluates, so pass the
cached display value: the app recomputes on open either way, but only the
cached value gives the cell its type's display format before then, and a
review round found format-less formula results rendering left-aligned
beside properly automatic plain values. Writing a literal over a formula
cell correctly clears the formula.

A cross-table reference to a table that came from `addTable` or
`insertInlineTable` is honest about its standing: the clone is fully
registered at all three of the engine's sites (owner archives, the
dependency tracker's list, the owner-id map), which two review rounds
measured as the difference between the app keeping an identity and
re-registering it — but the app *keeping* a library-minted identity has
not yet come back confirmed, and until it does, a reference to a clone
may open as a ref error where a reference to an original table works.
`doc.audit()` names any reference that is already dead in the file.

### Writing cells

```ts
// Plain values work; the type follows from the value.
t.setCell(1, 0, "Revenue");
t.setCell(1, 1, 143_800_000_000);
t.setCell(2, 0, new Date());
t.setCell(2, 1, true);
t.setCell(3, 0, null);                            // same as clearCell
// A duration is the one type with no plain form — a bare number means the
// number — so it keeps the tagged form.
t.setCell(2, 2, { type: "duration", seconds: 3600 });
t.setRow(4, ["Total", 42]);
t.setCells(5, 0, [[1, 2]]);
```

An unrecognised value **throws** rather than writing an empty cell, and it
throws before touching the row, so a rejected write leaves the table
untouched. `NaN`, `Infinity` and an invalid `Date` are all refused.

Writing preserves the cell's styles, number formats and comments, and
clears any formula. Rich text (`type: "richText"`) cannot be written
directly — use `type: "text"`, or edit `t.richTextStorage(row, col)`.
Rows and columns: `insertRows(at, count)`, `deleteRows(at, count)`,
`insertColumns`, `deleteColumns`, `setColumnWidth`, `setRowHeight`.
Coordinates outside the existing table throw.

Writing a value into a cell a merge has swallowed also throws — the value
would be stored and displayed nowhere. Write to the merge's anchor
instead, or pass `{ allowCovered: true }` if you mean it. Clearing a
covered cell is always allowed.

### Styling cells and tables

```ts
t.setCellFormatting(1, 0, {
  fill: colorFill(0.95, 0.95, 1),                      // colour, gradient or image
  borders: allBorders(solidStroke({ r: 0, g: 0, b: 0 }, 0.5)),  // or { top, right, bottom, left }
  padding: { left: 6, right: 6, top: 3, bottom: 3 },
  verticalAlignment: VerticalAlignment.MIDDLE,          // 0 top, 1 middle, 2 bottom
  textWrap: true,
});
t.setRangeFormatting(1, 0, 3, 4, { fill: colorFill(1, 1, 0.9) });
t.tableStyle()!.setTable({ bandedRows: true, bandedFill: colorFill(0.97, 0.97, 0.97),
                           tableBorderVisible: true });
t.bandStyle("headerRow")!.setCell({ fill: colorFill(0.2, 0.3, 0.5) });  // whole band
```

Setting a border side to `null` removes it; omitting a side leaves it. A
per-cell style is created based on the cell's current one, so unspecified
properties are inherited rather than lost, and neighbours are unaffected.

**Long text needs `textWrap: true`, values need width.** A cell's text
does not wrap by itself, and a table with long text cells (row notes, a
description column) ships with silently truncated contents unless every
such cell wraps — this shipped once, in Pages. The apps then fit the
row's height to the wrapped text on open; there is no auto-height flag
to set. The rule runs the other way for numbers, dates and booleans:
never wrap those — make the column wide enough with `setColumnWidth`
instead, or the value clips. And keep header labels to a word or two; a
sentence in a narrow column grows the row for the whole table.

### Structure

```ts
t.name = "Q1 Revenue";
t.setBands({ headerRows: 1, headerColumns: 1, footerRows: 1,
             freezeHeaderRows: true, repeatHeaderRows: true });
t.setRowHeight(0, 44); t.setColumnWidth(0, 180);
t.rowHeight(0); t.columnWidth(0); t.isRowHidden(3); t.isColumnHidden(2);
t.headerRowsFrozen; t.repeatingHeaderRows;
```

A band has **two** styles. `t.bandStyle("headerRow")` is the cell (fill,
borders, padding); `t.bandTextStyle("headerRow")` is the text inside it and
takes the same `CharacterFormatting` as any other text. Making a header
bold means the second one.

### Adding tables (Numbers)

```ts
const sheet = doc.sheets()[0];
doc.tablesOnSheet(sheet.id);
doc.addTable(sheet.id, { withContent: false, name: "Q3" });  // blank, laid out like its source
doc.addTable(sheet.id, { copyOf: someTable.infoObject!.identifier });  // a duplicate
doc.removeTable(sheet.id, table.infoObject!.identifier);
```

Tables are created by **copying** — building one from nothing means
synthesising tiles, header buckets, data lists and a calc-engine owner. The
copy is always renamed, because Numbers addresses tables by name and two
"Table 1"s on one sheet make every cross-table formula ambiguous. Uniqueness
is per sheet, so a copy onto another sheet may keep the original name.

**A clone keeps everything its donor had, and none of it fits by
default.** `withContent: false` clears the values, not the shape: the
copy still has the donor's row and column count, column widths, and
per-cell styling (a wrap style from a prose column lands on your number
cells, cell by cell). Size it with `deleteRows`/`deleteColumns` and
`insertRows`, set its widths, and reset formatting where the donor's
shows through — a reader who opens a mostly-empty table at someone
else's widths sees a mistake, and no offline check will catch it.

### Conditional formatting and filters

Both are the same archive underneath — a *predicate* — so they read alike.

```ts
t.conditionalStyleSets();               // Map<key, ConditionalStyleSet>, shared by many cells
t.conditionalRules(4, 2);               // rules on one cell, in evaluation order
t.conditionalRules(4, 2)[0].predicate;  // { operator: "<", operands, text: "C5<0" }
t.setConditionalStyleKey(9, 2, 1);      // apply an existing rule set to another cell

const { rows, columns } = t.filterSets();
rows?.mode;                             // "all" | "any"
rows?.rules();                          // [{ column, enabled, predicate }]
rows?.setEnabled(true); rows?.setMode("any");
```

Two things to know before relying on this:

- **Nothing is evaluated.** `conditionalRules()` tells you what the rules
  *are*, not which one currently matches — that needs the calc engine.
  Likewise, enabling a filter set does not hide rows; the app recomputes
  that when it next opens the file.
- **Conditions are read from the rule's formula**, which states the
  comparison, rather than from Apple's unpublished `predicate_type`. So a
  condition reads correctly even for a type code this library has never
  seen — and `predicate.operator` is `undefined`, rather than a guess, when
  the rule is something richer than a comparison ("text contains").

**Conditional rules write** for all six comparisons — `=`, `<>`, `>`,
`>=`, `<`, `<=` via `setConditionalRules` — byte-identical to Apple's
encoding; each code is measured from a real document's own formula, and
filters share the encoding. Covered cells are also registered in the calc
engine's dependency ledger: a rule is a formula, and one the engine has no
record for shows in the inspector without ever drawing its fill — cell
formulas are recomputed on open, rule formulas are not. **Filter rules do
not write** — reading is measured from a real filter set, but authoring a
rule also means recomputing which rows it hides, which needs the calc
engine.

### Categories (row grouping)

```ts
t.activeCategories();                   // the definition Numbers is applying, if any
t.categories();                         // all of them, including switched-off ones

const cat = t.activeCategories()!;
cat.groupColumns();                     // [{ column, groupingType, groupingName }]
cat.groups();                           // tree: [{ value, label, rows, children, level }]
cat.flatGroups();                       // the same, flattened
cat.describe();                         // ["Animal (10 rows)", "  2013-01-01 (2 rows)", …]
cat.setEnabled(false);                  // ungroup without losing the definition

t.staleCategoryGroups();                // groups whose rows no longer match the data
t.regroupCategories();                  // put them back; returns how many rows moved
```

`groups()[n].rows` are absolute row indexes. Grouping can be by value or
bucketed — `groupingName` says which ("year", "year and quarter", "weekday"
…) — and a bucketed group's `value` is the bucket's start date, not any
cell's value.

Editing cells does not regroup them, so call `regroupCategories()` after
touching a categorised table. It moves rows between groups that already
exist and does nothing else: a value with no group **throws** rather than
creating one, and a bucketed grouping throws too, because placing a row in
"Q3 2014" means evaluating the grouping formula. Regrouping unchanged data
moves nothing and writes nothing.

So the pattern is: change the cell, then regroup, and be ready for the
throw if you wrote a value the table has no group for.

### Cell controls (checkbox, slider, stepper, star rating)

```ts
t.setCellControl(1, 0, { widget: "checkbox", value: true });
t.setCellControl(2, 0, { widget: "starRating", value: 3 });
t.setCellControl(3, 0, { widget: "slider", minimum: 1, maximum: 50, increment: 0.1, value: 12.3 });
t.setCellControl(4, 0, { widget: "stepper", minimum: 0, maximum: 10, increment: 1, value: 4 });

t.cellControl(1, 0);            // { widget, shape, minimum, maximum, … }
t.removeCellControl(1, 0);      // keeps the value
```

A widget is **two** things: a spec saying what it is, and a *format* on the
cell saying to draw it. `setCellControl` writes both — that matters because
writing only the spec produces a document that opens fine and shows the
underlying value instead of the widget, which is what this library used to
do. If you set the format yourself afterwards, use a kind matching the
cell's value type or the widget disappears.

A format you set *first* is kept: choosing a percentage for a stepper
survives attaching it.

The control needs a value of the right type — a boolean for a checkbox, a
number for the others — so pass `value` unless the cell already holds one.

Pop-up menus are created with
`setCellControl(row, col, { widget: "popupMenu", items: [...] })` — the
None entry occupies slot 0 as a bare `NIL_TYPE`, measured and
app-confirmed. `setPopupMenu(row, column, modelId)` attaches an existing
model instead.

## Shadows and drawable styling

Cell and table styles have **no shadow field** — the format has no such
thing. A shadow belongs to the *drawable*: a shape, text box, image, or the
table as a whole.

```ts
const style = drawable.style();          // DrawableModel/ImageModel.style()
style.read();                            // { fill?, stroke?, opacity?, shadow?, reflection? }
style.set({
  fill: colorFill(0.2, 0.4, 0.9),        // shapes only — images have no fill
  stroke: solidStroke({ r: 0, g: 0, b: 0 }, 2),
  opacity: 0.9,
  shadow: { angle: 315, offset: 5, radius: 3, opacity: 0.5, enabled: true },
  reflection: 0.4,                       // mirror opacity, or null to remove
});
style.setShadowEnabled(false);           // keep the parameters, untick the box
drawableStylesOf(doc.store);             // every styled drawable in a document
```

`null` removes a property; omitting it leaves it. Note that a shadow with
`enabled: false` and no shadow at all are different states — the apps keep
your parameters when you untick the box.

**Important:** tables written by iWork '13/'15-era apps use *pre-BNC* cell
storage, which reads (text, numbers, dates — by measured position) but
never writes: `setCell()` **throws** rather than writing something wrong,
and unmeasured record shapes refuse instead of guessing. Check
`t.hasReadableCells` / `t.storageGeneration` when file age is unknown.

## Charts

```ts
const chart = doc.charts()[0];
chart.chartType;                  // "column2D", "pie2D", …
chart.rowNames();                 // series names
chart.columnNames();              // category names
chart.data();                     // [row][column] of { type: "number" | "date" | ... }
chart.series();                   // [{ name, values }]

chart.setValue(0, 2, { type: "number", value: 99 });
chart.setSeriesValues(1, values);      // must match the category count
chart.setRowName(0, "North");
chart.setColumnName(3, "Q3");
chart.addSeries("Region 3", values);   // one value per category
chart.addCategory("August", values);   // one value per series
chart.removeSeries(0); chart.removeCategory(1);
```

Charts are rectangular: a series must have a value for every category. A
mismatched count throws rather than being padded — padding with zeroes and
padding with gaps look identical in the data and completely different on the
page.

Adding or removing a series keeps the chart's id map and its per-series
style arrays in step, so styling stays on the series it belongs to.

### Chart appearance

```ts
chart.setChartType("donut2D");         // name or raw enum; unknown names throw
chart.setSeriesFill(0, { kind: "color", color: { r: 1, g: 0, b: 0 } });
chart.seriesStyle(0)?.fill();          // and .fills() for the per-geometry breakdown
chart.seriesStyle(0)?.setOpacity(0.5);

chart.axisStyle("value")?.showMajorGridlines;
chart.setAxisMajorGridlines("value", false);
chart.axisStyle("category")?.showAxis;
chart.legendStyle()?.opacity;
```

**Always go through the chart, never the style object, when writing.**
Style archives live in the document stylesheet and templates hand the same
one to several charts — in a real document a single series style was shared
by ten. `chart.setSeriesFill` and `chart.setAxisMajorGridlines` clone a
shared archive first and repoint this chart at the copy;
`chart.seriesStyle(0)!.setFill(…)` writes straight through and recolours
every chart sharing it. The result is a well-formed file either way, which
is what makes it worth knowing.

Each axis kind reads its own properties: ask for `"category"` or `"value"`,
because the archives use different field numbers for the same concept and
the wrong one answers `undefined` for everything.

A chart that inherits its styling from a preset has no archives to write
into, and setting a colour on one throws rather than synthesising them.

## Comments and footnotes

```ts
body.comments();          // [{ start, end, text, authorName, created, commentStorageId, … }]
const id = body.addComment(10, 20, "Please double-check this.");
body.addComment(30, 40, "Nit", { author: "Reviewer", created: new Date() });
body.removeComment(id);   // the text stays; the highlight goes

body.footnotes();         // [{ anchorIndex, mark, storage }]
const note = body.addFootnote(30, "See the appendix.");
note.replaceAll("appendix", "annex");   // the note is an ordinary TextStorage
body.removeFootnote(note.id);
```

`addComment` **reuses the document's existing annotation author** unless you
name another. That matters: a document where the same person appears once
per comment looks fine in the pane and wrong the moment anyone filters by
commenter. Passing a name reuses an author with that name or creates one and
adds them to the document's roster.

A footnote is two storages. The body gets a U+000E reference character (not
the U+FFFC everything else uses), and the note is a separate storage whose
text starts with its own U+FFFC — the spot where Pages draws the number.
Numbering is Pages' job: it depends on how many footnotes precede this one
and on the document's footnote settings.

## Page numbers

A page number is **not text** — no digits live in the storage, because the
value comes from pagination the app performs. It is a U+FFFC placeholder
plus an archive that renders it.

```ts
// Any TextStorage — a footer, a header, a text box, the body.
const master = doc.sections()[0].templates().find((t) => t.role === "odd")!;
const storage = master.footers[1]!;              // 0/1/2 = left/center/right
storage.insertPageNumber(storage.text.length);          // "Page ￼"
storage.insertPageCount(pos);                           // "of ￼"
storage.insertPageNumber(pos, { format: "lower-roman" });
storage.pageNumberFields();   // [{ index, objectId, isPageCount, formatName, cachedValue }]
storage.removeAttachment(objectId);   // drops the field and its placeholder
```

Only `"decimal"` and `"lower-roman"` are written: they are the only formats
any examined file contains, each with its numeric code stored alongside its
name so the pairing is not a guess. For another, pass `{ formatCode, formatName }`
together — one without the other is refused, since a file whose code and
name disagree is self-contradictory.

`cachedValue` is what the app last rendered. This library never writes it:
the number depends on layout, and a stale digit in place of a live field is
worse than a blank the app fills in.

## Date fields and bookmarks

```ts
storage.insertDateField(0, "November 2, 2024", { date: new Date("2024-11-02"), format: "MMMM d, y" });
storage.dateFields();          // [{ start, end, fieldId, date, format }]

// Field-like constructs follow the app's measured styling conventions by
// default: a link gets the template's Link style (underlined), a footnote
// mark gets the shared superscript style. Pass `false` to skip, or a style
// id/identifier to override:
doc.insertLink(at, at + 5, "https://example.org/");
doc.insertLink(at, at + 5, "https://example.org/", { characterStyle: false });
body.addFootnote(pos, "the note", { markStyle: false });
// Comments and date fields carry no styling convention in Apple's own
// files, so those APIs add none.

const id = body.addBookmark(10, 20, "Introduction");  // named, spans [10,20)
body.addBookmark(30, 31);                             // single-character anchor
body.removeBookmark(id);
```

A date field is **not** like a page number: it spans real characters, and
the app rewrites them when the field updates. So you supply the text to
show — formatting a date the way a locale and pattern would is Foundation's
job, and approximating it here would put subtly wrong text in the document.
The field is marked as needing an update, so the app replaces it with its
own rendering when it next opens the file.

A bookmark's `ranged` flag is derived from the span you give: `true` for
more than one character, `false` for a point anchor. Do not set out to
fight this — Pages trusts the flag over the run, and a mismatch (seen in
the app) collapses a 13-character bookmark to its first character.

## Inserting images (Pages)

Inline insertion is shipped and app-confirmed: the bytes enter `Data/`
(SHA-1-deduped), the image is anchored at the body position given, and it
is sized from its own pixels (fit to `maxWidth`, default 400 pt) unless
explicit `width`/`height` say otherwise.

```ts
doc.insertInlineImage(pos, pngBytes, { fileName: "figure.png", maxWidth: 300 });
doc.insertInlineImage(pos, pngBytes, { fileName: "plate.png", wrap: "page" });
```

The picture **rides the text**: it sits in the text column and moves with
the paragraph's indent, which is what you want when the body is indented
(a letterhead template, say). `wrap: "page"` is the other mode — placed
against the page margins with text flowing around it — where a picture
in an indented body will *not* line up with the words above it.

Geometry is not the lever for placement: `setGeometry({ x })` writes a
field the app recomputes for an in-flow attachment, so it reads back and
changes nothing. Width and height are honoured. To fill the page's full
measure rather than the text column, size to
`pageWidth - leftMargin - rightMargin`.

An inline picture is capped by the column it rides in: give it the full-
measure width inside an indented paragraph and the app scales it back
down to the column. The full-bleed recipe is a paragraph of its own with
negative indents cancelling the body's, and the picture inside that:

```ts
doc.appendParagraph("", "Body");
const p = doc.paragraphs().at(-1)!;
doc.paragraph(p.index).range().formatParagraphs({ leftIndent: -56.7, firstLineIndent: -56.7 });
doc.insertInlineImage(p.start, bytes, { fileName: "plate.png", width: fullMeasure });
```

## Cropping images

Cropping in iWork does not touch the media: the image keeps its full extent
and a **mask** defines the window you see through.

```ts
const crop = image.crop();          // undefined when the image is uncropped
crop.window;                        // visible rect in the IMAGE's own points
crop.visible;                       // where that lands on the page/slide
crop.full;                          // the whole picture's frame

image.setCrop({ x: 20, y: 0, width: 200, height: 150 });   // choose what shows
image.setVisibleFrame({ x: 72, y: 90, width: 200, height: 150 }); // place the result
image.removeCrop();                 // show the whole picture again
```

The one thing to get right: **the mask's frame is in the image's coordinate
space, not the page's**, so `visible = image.position + window.position`.
`setCrop` moves the window over the picture — the result moves on the page
too. `setVisibleFrame` does the opposite: it keeps the same part of the
picture visible and puts it where you ask.

Cropping an image that has no mask creates one. Non-rectangular masks
(instant alpha, shape crops) are read but never rewritten — `crop().isRectangular`
says which you have, and resizing a non-rectangular one throws rather than
flattening the cut-out into a box.

## Keynote slides

```ts
const slide = doc.slides()[0];
slide.title;  slide.title = "Q3 Results";      // the title placeholder
slide.body;   slide.body = "First\nSecond";
slide.placeholders();        // [{ role, id, kind, storage, text }]
slide.placeholder("body");   // the TextStorage, editable like any other
slide.notes = "Remember to mention the caveat.";
slide.transition();  slide.setTransition({ effect: "apple:transition/dissolve", duration: 1 });
```

Placeholders are the theme's boxes for you to fill. Setting one only works
where the slide already carries it — creating a placeholder means
synthesizing the geometry and style the master defines for that role, so a
slide on a layout without a body box is told so rather than given an
unstyled box at the origin.

### Presentation settings

```ts
doc.presentation();          // { mode, loops, slideNumbersVisible, autoplay*, idleTimer*, playsUponOpen }
doc.setPresentation({ mode: ShowMode.AUTOPLAY, autoplayTransitionDelay: 12, loops: true });
doc.slideSize();             // { width: 1920, height: 1080 }
doc.setSlideSize(1024, 768); // objects keep their coordinates — nothing is rescaled
```

Defaults come from the schema rather than from zero: every deck examined
omits several of these fields, and reading an omitted autoplay delay as 0
instead of 5 would describe a deck that races through itself.

## Editing text in Numbers/Keynote

Beyond tables and slides, edit through the shared storages:

```ts
for (const storage of doc.textStorages()) {
  storage.replaceAll("2024", "2025");   // fixes up all style runs automatically
}
```

## Low-level inspection (reverse-engineering tasks)

```ts
import { IWorkContainer, parseIwaFile, RawMessage, typeName } from "cupertino-files";

const container = IWorkContainer.fromBytes(bytes);      // .iwaFiles: Map<name, bytes>
const objects = parseIwaFile(container.iwaFiles.get("Index/Document.iwa")!);
for (const obj of objects) {
  console.log(obj.identifier, obj.type, typeName(obj.type, "pages"));
  obj.message.getString(3);        // raw protobuf access by field number
  obj.getObjectReferences();       // dependency list
}
```

CLI equivalents (after `npm i -g cupertino-files` or via npx):
`cupertino-dump info|ls|text|styles|sections|object|extract <file>`.

## Auditing a document

```ts
doc.audit();   // [{ severity: "error" | "warning", code, message }]
```

The offline stand-in for opening the file: every code names a state a
review round watched an app refuse, repair destructively, or render
against the author's intent. Errors (`text/table-position`,
`table/unregistered`, `cell/cross-ref-dangling`, `table/orphan-string`)
are states the app rejects or mangles; warnings (`cell/rule-unregistered`,
`cell/format-missing`) open fine and render wrong. A document built through this API audits clean — a finding on one
is a library bug — so its real use is documents from anywhere else:
app-edited files, other tools, raw-layer edits.

`save()` enforces the other half by itself: an archive missing a proto2
`required` field (the class Numbers reports as *damaged*) makes `save()`
throw, naming the object and field, rather than produce the file.

## Rules of thumb

1. Never synthesise a document graph by hand. To make a *new* document,
   use `NumbersDocument.blank()` (or `PagesDocument`/`KeynoteDocument`) —
   an embedded, Apple-authored donor, A4 or 16:9, app-confirmed — or
   `blankFrom(template)` to empty a document you already have, keeping
   its design. The `create_document` MCP tool is the same thing by path.
2. Make all edits through the API, not by writing raw protobuf fields,
   unless the task is explicitly about the wire format — the API maintains
   attribute-table indexes, object references, and package metadata that
   the apps validate.
3. What `doc.save()` guarantees, precisely: **unedited content is
   byte-identical**, enforced for every fixture, and every fixture also
   survives an open→edit→save→reopen cycle with nothing else disturbed.
   That the *apps* then open the result is a separate claim only a Mac can
   settle — `npm run test:e2e`, and the open claims in `docs/VERIFICATION.md`.
   Do not promise a user it will open; say it round-trips.
4. **Never edit a document that is open in an iWork app** — the app rewrites
   the whole package on its next autosave and your changes vanish. Close it
   first. Live iCloud collaboration cannot be joined from a file at all.
5. Check `doc.compatibility()` before relying on a feature with files of
   unknown provenance, and never interpret an empty result as "no data"
   without confirming the feature is supported.
6. Check `docs/COVERAGE.md` before assuming a feature is missing — it is
   generated from the code and says read, write or neither for every
   capability. Formulas (`setFormula`, byte-identical to Apple's ASTs,
   cross-table references included), merges (`mergeCells`, dependency
   ledger and all) and chart appearance (type, series colours, axes,
   legend, gridlines) all write. Genuinely absent today: authoring
   filter *rules*, creating category groups, and creating Keynote builds.
   For those, drop to the low-level `RawMessage` layer and consult
   `docs/FORMAT.md` — §14 covers tables byte by byte.
7. Some behaviour is inferred rather than proven: `docs/VERIFICATION.md`
   lists every claim only Apple's app can settle, with the reasoning and a
   repro. Check it before relying on cell styling or colour spaces in
   anything that matters. (Paragraph border positions are settled:
   measured logical — 4 leading, 8 trailing, swapping visual sides with
   the writing direction.)
8. **Proto first.** When something cannot be deduced from diffing
   documents, read `proto/current/*.proto` before guessing — a plain
   text search there has settled field names, types and defaults that
   hours of byte-diffing could not: what a mask's `pathsource` union
   holds, that `traced_path` is a bare `TSP.Path`, which archive a
   settings field belongs to. The schemas ship in the package; the
   library's own field numbers resolve from them at build time
   (`src/proto/vendored.ts`), so a name found there is a name the code
   can use.
9. Style-property bags are three-state. A field can be set, absent
   (inherit from the parent style), or removed; absent never means
   false. `applyTableFormatting` and friends take `null` to remove a
   field and `undefined` to leave it alone — pass `false` only to
   *store* false.
