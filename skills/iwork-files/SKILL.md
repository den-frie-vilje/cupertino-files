---
name: iwork-files
description: >-
  Read, inspect, and edit Apple iWork documents (.pages, .numbers, .key —
  modern IWA format, 2013+) using the zero-dependency `iwork-files`
  TypeScript library. Use when a task involves extracting text from, editing
  text/styles/sections/margins in, or inspecting the internals of Apple
  Pages, Numbers, or Keynote files without Apple software. Do NOT use for
  iWork '09 XML files or password-protected documents (both are detected and
  rejected with clear errors).
---

# Working with Apple iWork files

The `iwork-files` package manipulates iWork documents entirely in
TypeScript/JavaScript — no Apple apps, no external binaries, no native
modules. It works in Node ≥ 18 and browsers (bytes in → bytes out).

```ts
import { PagesDocument, NumbersDocument, KeynoteDocument, IWorkDocument } from "iwork-files";
```

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

```ts
doc.replaceText("old", "new");                    // literal find/replace, returns count
doc.insertText(pos, "inserted");                  // UTF-16 offsets, same as JS string indexes
doc.deleteRange(start, end);
doc.appendParagraph("New paragraph", "Heading 1"); // style by name (optional)
doc.setParagraphStyle(2, "Body");                  // paragraph index, style name or bigint id
doc.applyCharacterFormatting(start, end, { bold: true, fontSize: 18, fontColor: { r: 1, g: 0, b: 0 } });
doc.createParagraphStyle({ name: "My Style", basedOn: "Body",
  character: { italic: true }, paragraph: { alignment: 2, spaceBefore: 12 } });
doc.setPageSetup({ topMargin: 72 });               // points; 72 pt = 1 inch
doc.sections()[0].setHeaderText("Confidential");   // writes all page-master variants
doc.drawables()[0].setGeometry({ x: 100, y: 50 }); // move/resize objects
```

### Fluent editing (usually the nicest API)

```ts
for (const hit of doc.find("TODO")) hit.replaceWith("Done").bold();
doc.find(/https?:\/\/\S+/g).forEach((r) => r.link(r.text));
doc.paragraph(0).setStyle("Title");
doc.paragraph(2).setListStyle("Bullet");
doc.paragraph(2).insertAfter("Next point", "Body");
doc.range(0, 10).italic().color(0.8, 0, 0);
```

`find()` returns live `TextRange`s (string = literal, RegExp honored).
Ranges support `.replaceWith() .delete() .format() .bold() .italic()
.underline() .fontSize() .fontName() .color() .link() .unlink()
.applyCharacterStyle() .applyParagraphStyle() .applyListStyle()
.paragraphs()`. Prefer ONE `.format({...})` call with all properties over
chaining sugar methods — each call creates a style object.

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
const heading = sheet.style("Heading 1")!;   // or sheet.style(styleId)
heading.character();                          // what this style overrides
heading.paragraph();
heading.resolved().character;                 // with the parent chain folded in
heading.setCharacter({ fontSize: 20, fontColor: hexColor("#003366") });
heading.setParagraph({ border: solidStroke({ r: 0, g: 0, b: 0 }, 1),
                       borderPositions: BorderPosition.BOTTOM });
```

Setters **merge**: properties the library does not model are preserved.

## Shared style values

Fills, gradients, strokes and shadows are one vocabulary used by text,
table cells and shapes alike:

```ts
import { colorFill, linearGradient, solidStroke, hexColor, allBorders } from "iwork-files";

colorFill(1, 0.9, 0.2);                                 // flat colour
linearGradient(hexColor("#fff"), hexColor("#0066ff"));  // two-stop gradient
solidStroke({ r: 0, g: 0, b: 0 }, 1);                   // 1pt solid border
({ color: { r: 0, g: 0, b: 0 }, width: 1, pattern: [4, 2] });  // dashed
```

## Tables

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

- **Function names are not in the format.** Only ids proven by arithmetic
  are named (currently just `SUM`); the rest render as `FUNCTION_<id>`.
  Add more with `registerFormulaFunctions({ 42: "AVERAGE" })`, or measure
  the whole table on a Mac with `npm run harvest -- --drive` (Protocol 1 in
  `docs/MANUAL-WORK.md`). `functionTableProvenance()` reports how many
  names are in effect and where they came from.
- **Cross-table references cannot name their target**, so they render with
  an `OTHER_TABLE::` prefix. Do not present that as a real table name.

Writing formulas is not implemented — it needs the missing function table
plus calc-engine dependency records. Writing a literal over a formula cell
correctly clears the formula.

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
Rows and columns **cannot be added or removed**; coordinates outside the
existing table throw.

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

**Writing rules is not implemented** for either. Applying an *existing*
rule set to more cells works; authoring a new one needs the `predicate_type`
value the condition editor expects, and only two of that enum's members
appear in any file examined. `npm run harvest:predicates -- <file>` extracts
more from a document whose conditions you set up yourself — see
`docs/MANUAL-WORK.md` protocol 4.

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
```

`groups()[n].rows` are absolute row indexes. Grouping can be by value or
bucketed — `groupingName` says which ("year", "year and quarter", "weekday"
…) — and a bucketed group's `value` is the bucket's start date, not any
cell's value.

Grouping itself happens in Numbers. This library reads the tree and can
switch it off, but **cannot regroup**: change cells and the tree goes stale.
`staleCategoryGroups()` tells you when, which is worth checking after any
edit to a categorised table.

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
storage, which cannot be decoded. `cells()` and `setCell()` **throw**
rather than returning an empty array or writing something wrong. Always
check `t.hasReadableCells` / `t.storageGeneration` when file age is
unknown.

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
style arrays in step, so styling stays on the series it belongs to. Chart
**appearance** (type, colours, axes) is read-only.

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

const id = body.addBookmark(10, 20, "Introduction");  // a link destination
body.addBookmark(10, 20);                             // unnamed, marks a range
body.removeBookmark(id);
```

A date field is **not** like a page number: it spans real characters, and
the app rewrites them when the field updates. So you supply the text to
show — formatting a date the way a locale and pattern would is Foundation's
job, and approximating it here would put subtly wrong text in the document.
The field is marked as needing an update, so the app replaces it with its
own rendering when it next opens the file.

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
slide.transition();  slide.setTransition({ effect: "dissolve", duration: 1 });
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
import { IWorkContainer, parseIwaFile, RawMessage, typeName } from "iwork-files";

const container = IWorkContainer.fromBytes(bytes);      // .iwaFiles: Map<name, bytes>
const objects = parseIwaFile(container.iwaFiles.get("Index/Document.iwa")!);
for (const obj of objects) {
  console.log(obj.identifier, obj.type, typeName(obj.type, "pages"));
  obj.message.getString(3);        // raw protobuf access by field number
  obj.getObjectReferences();       // dependency list
}
```

CLI equivalents (after `npm i -g iwork-files` or via npx):
`iwork-dump info|ls|text|styles|sections|object|extract <file>`.

## Rules of thumb

1. Never construct documents from scratch — there is no API for it and
   there will not be one. To make a *new* document, use
   `NumbersDocument.blankFrom(template)` (or `PagesDocument`/
   `KeynoteDocument`), which empties a real file and keeps every identity,
   style and master an Apple app wrote. Any document works as the template,
   including one the user hands you.
2. Make all edits through the API, not by writing raw protobuf fields,
   unless the task is explicitly about the wire format — the API maintains
   attribute-table indexes, object references, and package metadata that
   the apps validate.
3. What `doc.save()` guarantees, precisely: **unedited content is
   byte-identical**, enforced for every fixture, and every fixture also
   survives an open→edit→save→reopen cycle with nothing else disturbed.
   That the *apps* then open the result is a separate claim only a Mac can
   settle — `npm run test:e2e`, and claim 1 in `docs/VERIFICATION.md`.
   Do not promise a user it will open; say it round-trips.
4. **Never edit a document that is open in an iWork app** — the app rewrites
   the whole package on its next autosave and your changes vanish. Close it
   first. Live iCloud collaboration cannot be joined from a file at all.
5. Check `doc.compatibility()` before relying on a feature with files of
   unknown provenance, and never interpret an empty result as "no data"
   without confirming the feature is supported.
6. Check `docs/COVERAGE.md` before assuming a feature is missing — it is
   generated from the code and says read, write or neither for every
   capability. Genuinely absent today: authoring formulas, conditional
   and filter *rules*, categories, merge ranges, chart appearance, and
   creating cell controls or Keynote builds. For those, drop to the
   low-level `RawMessage` layer and consult `docs/FORMAT.md` — §14 covers
   tables byte by byte.
7. Some behaviour is inferred rather than proven: `docs/VERIFICATION.md`
   lists every claim only Apple's app can settle, with the reasoning and a
   repro. Check it before relying on paragraph border positions, cell
   styling or colour spaces in anything that matters.
