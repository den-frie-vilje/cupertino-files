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
`IWorkDocument.open(bytes)` looks at the document and decides.

Everything you leave alone is preserved byte-for-byte — including fields
this library has never heard of. That's what makes it safe to edit a
document written by an app version that doesn't exist yet.

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
fields, slides, and drawables — and the generated
[capability matrix](/COVERAGE) lists everything, with how thoroughly each
item is exercised.

## Some documents are politely declined

Three kinds of file are detected and refused rather than mis-handled.
That's a promise, not a gap:

- **Password-protected documents.** This library circumvents nothing, by
  design — it matters more than it looks; see [legal posture](/LEGAL).
- **iWork '09 XML documents.** A different, older format. Refused with a
  clear error instead of a wrong answer.
- **Table records it hasn't measured.** Very old (iWork '13-era) tables
  read fine — and where a record's shape is unknown, the reader says so
  instead of guessing at your data.

When something can't be done, you'll be told — with the reason, and
usually with the next step.
