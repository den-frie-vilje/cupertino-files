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

## Reading a Pages document

```ts
doc.bodyText;                   // plain text; paragraphs end with \n, inline objects are U+FFFC
doc.paragraphs();               // [{ index, start, end, text, styleId, styleName }]
doc.paragraphStyles();          // named styles: [{ id, name, identifier, parentId }]
doc.sections();                 // [{ index, start, end, name, pageNumberStart, ... }]
doc.sections()[0].headerText(1) // header center column ("" if empty); 0=left, 1=center, 2=right
doc.pageSetup();                // { pageWidth, pageHeight, *Margin, orientation } in points
doc.drawables();                // shapes/images/tables with .geometry() → {x, y, width, height, angle}
doc.format;                     // versions: fileFormatVersion, propertiesFileFormatVersion, buildHistory
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

Character/paragraph formatting options: `bold`, `italic`, `fontSize`,
`fontName` (PostScript name), `fontColor` (`{r,g,b,a?}` 0..1), `underline`,
`strikethru`, `tracking`, `baselineShift` / `alignment` (0 left, 1 right,
2 center, 3 justified), `spaceBefore`, `spaceAfter`, `firstLineIndent`,
`leftIndent`, `rightIndent`, `lineSpacing`, `keepLinesTogether`,
`keepWithNext`, `pageBreakBefore`, `widowControl`, `outlineLevel`,
`showInToc`.

All text offsets are UTF-16 code units — identical to JavaScript string
indexing, so `text.indexOf(...)` results are valid offsets.

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
4. If a needed feature is missing (tables of cells, images insertion,
   footnote creation), fall back to the low-level `RawMessage` layer, and
   consult `docs/FORMAT.md` in the repository for the format specification.
