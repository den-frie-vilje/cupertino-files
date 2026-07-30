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

Character/paragraph formatting options: `bold`, `italic`, `fontSize`,
`fontName` (PostScript name), `fontColor` (`{r,g,b,a?}` 0..1), `underline`,
`strikethru`, `tracking`, `baselineShift` / `alignment` (0 left, 1 right,
2 center, 3 justified), `spaceBefore`, `spaceAfter`, `firstLineIndent`,
`leftIndent`, `rightIndent`, `lineSpacing`, `keepLinesTogether`,
`keepWithNext`, `pageBreakBefore`, `widowControl`, `outlineLevel`,
`showInToc`.

All text offsets are UTF-16 code units — identical to JavaScript string
indexing, so `text.indexOf(...)` results are valid offsets.

## Tables (read-only)

```ts
const tables = numbersDoc.tables();          // or numbersDoc.tables(sheetId), pagesDoc.tables()
const t = tables[0];
t.name; t.rowCount; t.columnCount; t.headerRowCount;
if (!t.hasReadableCells) { /* pre-BNC storage — see below */ }
t.cells();        // [{ row, column, value }] non-empty cells
t.grid();         // dense (CellValue | null)[][]
t.merges();       // [{ row, column, rowCount, columnCount }]
cellValueToString(cell.value);
```

`CellValue` is a discriminated union on `.type`: `empty | number | text |
richText | date | bool | duration | error`, each with `isFormula` (formula
cells carry their cached result, so no evaluator is needed).

**Important:** tables written by iWork '13/'15-era apps use *pre-BNC* cell
storage, which cannot be decoded. `cells()` **throws** rather than returning
an empty array (which would look like an empty table). Always check
`t.hasReadableCells` / `t.storageGeneration` when file age is unknown.
Writing cells is not supported yet.

## Editing text in Numbers/Keynote

Full cell/slide models are not implemented yet; edit through the shared
storages instead:

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

1. Never construct documents from scratch — load a real file and edit it
   (the format requires dozens of interlinked objects; the library keeps
   them consistent only for loaded documents).
2. Make all edits through the API, not by writing raw protobuf fields,
   unless the task is explicitly about the wire format — the API maintains
   attribute-table indexes, object references, and package metadata that
   the apps validate.
3. `doc.save()` output opens in current Pages/Numbers/Keynote; formatting
   fidelity of *unedited* content is guaranteed byte-for-byte.
4. **Never edit a document that is open in an iWork app** — the app rewrites
   the whole package on its next autosave and your changes vanish. Close it
   first. Live iCloud collaboration cannot be joined from a file at all.
5. Check `doc.compatibility()` before relying on a feature with files of
   unknown provenance, and never interpret an empty result as "no data"
   without confirming the feature is supported.
6. If a needed feature is missing (cell writing, chart data, Keynote slides,
   footnote creation), fall back to the low-level `RawMessage` layer, and
   consult `docs/FORMAT.md` in the repository for the format specification.
