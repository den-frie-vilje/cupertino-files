# cupertino-files

**Open, edit, and save Apple Pages, Numbers, and Keynote documents —
anywhere JavaScript runs.** Pure TypeScript, zero runtime dependencies,
no Mac required. You work with paragraphs, cells, and slides; the bytes
take care of themselves.

**Docs: <https://den-frie-vilje.github.io/cupertino-files/>**

```sh
npm install cupertino-files
```

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { PagesDocument, NumbersDocument } from "cupertino-files";

const doc = PagesDocument.load(new Uint8Array(readFileSync("report.pages")));
doc.replaceText("2024", "2025");
doc.appendParagraph("Conclusion", "Heading 1");
writeFileSync("report-2025.pages", doc.save());

const sheet = NumbersDocument.load(new Uint8Array(readFileSync("budget.numbers")));
const table = sheet.tables()[0]!;
table.setCell(1, 1, 143_800);
table.setFormula(1, 2, "=B2*1.25", { value: 179_750 });
writeFileSync("budget.numbers", sheet.save());
```

Everything you don't touch is preserved byte-for-byte
([how](https://den-frie-vilje.github.io/cupertino-files/guide/fidelity)).
Works in Node ≥ 22 and modern browsers. Bytes in, bytes out.

The format is undocumented; this library is an ongoing
reverse-engineering of it, measured from real documents.
[`docs/COVERAGE.md`](docs/COVERAGE.md) is the always-current answer to
"does it do X?". The short version:

## What you can do

### Pages

| | |
|---|---|
| Text | Find & replace, append, insert — styles and fields stay attached |
| Styles | Named paragraph and character styles: apply, edit, create; direct formatting too |
| Layout | Sections, headers & footers, page setup, margins, orientation |
| Extras | Comments, footnotes, bookmarks, links, page-number and date fields, lists, table of contents |
| Images | Inline insertion, floating placement, crops, filters |

### Numbers

| | |
|---|---|
| Cells | Read and write every value type; formatting, styles, and comments survive your edits |
| Formulas | Author them as text — `=SUM(A1:A5)`, `=Other::B2` — 272 functions |
| Formatting | Fills, borders, alignment, wrap; number, currency, date and duration formats; bands |
| Structure | Sheets and tables (add, rename, move, remove), rows and columns, merges, column widths |
| Reading | Conditional formatting, filters, categories, and cell controls all read |

### Keynote

| | |
|---|---|
| Slides | Add, duplicate, reorder, remove, skip; titles, bodies, presenter notes |
| Decks | Slide size, auto-advance; builds and transitions read |

### Everywhere

| | |
|---|---|
| New documents | `NumbersDocument.blank()` and friends — a fresh A4 document or 16:9 deck, no template file needed |
| Drawables | Move, resize, copy, and style shapes, text boxes, and images — shadows, fills, strokes, opacity |
| Charts | Data (categories, series, values) and appearance (type, colours, gridlines, legend) |
| Fidelity | Byte-identical round trips; future app versions load with their new features intact |
| Honesty | iWork '09 XML and password-protected documents are detected and declined, never mis-parsed |

Deeper detail, per capability and with the evidence:
[the capability matrix](docs/COVERAGE.md) · [what each open question
waits on](docs/BLOCKERS.md) · [the format itself](docs/FORMAT.md).

## Tools for every kind of work

| | |
|---|---|
| The API | Typed, synchronous, documented — [take the tour](https://den-frie-vilje.github.io/cupertino-files/guide/documents) |
| The CLI | `npx -y cupertino-files dump info file.pages` inspects; `call` runs any editing tool from the shell |
| For AI agents | `npx -y cupertino-files mcp` — an MCP server with twenty creating, editing and formatting tools, plus a Claude Code skill in the package |
| For other implementations | A language-neutral [conformance suite](conformance/README.md) and format bundle, so a C++ or Rust port can check itself |

More in [For AI agents](https://den-frie-vilje.github.io/cupertino-files/guide/agents)
and the [API reference](https://den-frie-vilje.github.io/cupertino-files/api/).

## Development

```sh
npm install && npm test   # unit + fixture suite; never launches an app
npm run test:e2e          # macOS only: drives the real apps
```

Contributions are warmly welcome — [CONTRIBUTING.md](CONTRIBUTING.md)
shows the way, and [docs/BLOCKERS.md](docs/BLOCKERS.md) lists questions
where a few minutes with a Mac genuinely helps. Test fixtures are real
Apple-written documents from the Apache Tika and libetonyek test suites
([attribution](fixtures/ATTRIBUTION.md)).

Built on the shoulders of
[iWorkFileFormat](https://github.com/obriensp/iWorkFileFormat),
[keynote-parser](https://github.com/psobot/keynote-parser),
[numbers-parser](https://github.com/masaccio/numbers-parser) and
[WorkKit](https://github.com/6over3/WorkKit).

## Legal

An independent project, not affiliated with or endorsed by Apple Inc.
Apple, iWork, Pages, Numbers and Keynote are trademarks of Apple Inc.,
used only to name the formats this library interoperates with. It
contains no Apple code and declines encrypted documents by design;
details in [docs/LEGAL.md](docs/LEGAL.md).

## License

[MIT](LICENSE) © Ole Kristensen
