# Getting started

```sh
npm install cupertino-files
```

That's the whole setup. No runtime dependencies, no native modules, no
Apple software. It runs in Node 18 and up, and in the browser — bytes in,
bytes out.

## Open. Edit. Save.

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { PagesDocument } from "cupertino-files";

const doc = PagesDocument.load(new Uint8Array(readFileSync("Report.pages")));

doc.bodyText;                                   // read it
doc.replaceText("2024", "2025");                // change it — styles survive
doc.appendParagraph("Conclusion", "Heading 1"); // styles by name
doc.setPageSetup({ topMargin: 72 });            // points

writeFileSync("Report 2025.pages", doc.save());
```

Use the typed loader when you know the app. When you don't,
`IWorkDocument.open(bytes)` looks at the document and decides. Starting
without a file at all also works: `PagesDocument.blank()` is a fresh A4
document, `NumbersDocument.blank()` a fresh spreadsheet,
`KeynoteDocument.blank()` a fresh 16:9 deck.

Everything you leave alone is preserved, byte for byte — even in
documents from app versions newer than this library.

## Spreadsheets and slides

```ts
import { NumbersDocument, KeynoteDocument } from "cupertino-files";

// Numbers
const sheet = NumbersDocument.load(bytes);
const table = sheet.tables()[0]!;
table.setCell(0, 0, { type: "text", value: "John Appleseed" });
table.setCell(1, 0, { type: "text", value: "Anna Haro" });
table.setCell(0, 1, { type: "number", value: 42 });
sheet.addSheet({ name: "Forecast" });

// Keynote
const deck = KeynoteDocument.load(bytes);
deck.slides()[0]!.title = "Q3";
deck.slides()[0]!.notes = "Pause here. Let it land.";
deck.addSlide({ copyOf: 0 });
```

From here, the [full tour](/guide/documents) covers text, styles, tables,
fields, slides, and drawables; the [capability matrix](/COVERAGE) lists
everything.

## Some documents are politely declined

- **Password-protected documents** — refused; this library decrypts
  nothing (see [legal posture](/LEGAL)).
- **iWork '09 XML documents** — a different, older format; refused with
  a clear error.

When something can't be done, the error says why, and usually what to do
instead.
