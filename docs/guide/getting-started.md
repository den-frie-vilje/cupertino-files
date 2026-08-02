# Getting started

```sh
npm install cupertino-files
```

No runtime dependencies, no native modules, no Apple software. ESM,
typed, Node ≥ 18 or a modern browser — everything is bytes in, bytes out.

## Open, edit, save

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { PagesDocument, NumbersDocument, KeynoteDocument, IWorkDocument } from "cupertino-files";

// Typed loaders when you know the app…
const doc = PagesDocument.load(new Uint8Array(readFileSync("report.pages")));
// …or auto-detect when you don't.
const any = IWorkDocument.open(bytes);

doc.bodyText;                                   // "Quarterly report\nRevenue grew…"
doc.replaceText("2024", "2025");                // style-preserving find/replace
doc.appendParagraph("Conclusion", "Heading 1"); // styles addressed by name
doc.setPageSetup({ topMargin: 72 });

writeFileSync("report-2025.pages", doc.save()); // → Uint8Array
```

Everything you don't touch is preserved **byte-for-byte** — not just
semantically. That includes fields this library has never heard of, which
is what makes editing documents from future app versions safe.

## The three apps

```ts
// Numbers: sheets and tables
const nums = NumbersDocument.load(bytes);
const table = nums.tables()[0]!;
table.setCell(1, 1, { type: "number", value: 143_800_000_000 });
nums.addSheet({ name: "Forecast" });

// Keynote: slides
const deck = KeynoteDocument.load(bytes);
deck.slides()[0]!.title = "Q3 results";
deck.slides()[0]!.notes = "Pause here.";
deck.addSlide({ copyOf: 0 });
```

The full capability list — with how thoroughly each item is exercised —
is the generated [capability matrix](/COVERAGE). What only the apps can
prove, and the proof where it exists, is in the
[verification ledger](/VERIFICATION).

## What is deliberately refused

Three things are detected and rejected rather than mis-handled, and they
are guarantees, not gaps: **password-protected documents** (this library
circumvents nothing — see [legal posture](/LEGAL)), **iWork '09 XML
documents**, and **pre-BNC cell records it has not measured** (iWork
'13-era tables read fine; unrecognized record shapes refuse instead of
guessing).
