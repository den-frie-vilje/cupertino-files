# iwork-files

**Read, inspect, and edit Apple iWork documents — Pages, Numbers, Keynote —
in pure TypeScript. Zero runtime dependencies, no Apple software required.**

Apple's modern document format (2013 → today) is a ZIP package of
Snappy-compressed protobuf object graphs. This library implements the whole
stack from bytes up — Snappy codec, protobuf wire layer, ZIP container, IWA
archives, object store — and puts a typed document model on top, so you can
do this anywhere Node ≥ 18 or a modern browser runs:

```ts
import { readFileSync, writeFileSync } from "node:fs";
import { PagesDocument } from "iwork-files";

const doc = PagesDocument.load(new Uint8Array(readFileSync("report.pages")));

doc.bodyText;                                   // "Quarterly report\nRevenue grew…"
doc.paragraphs();                               // text + style name per paragraph
doc.replaceText("2024", "2025");                // style-preserving find/replace
doc.appendParagraph("Conclusion", "Heading 1"); // styles addressed by name
doc.applyCharacterFormatting(0, 9, { bold: true, fontColor: { r: 0.8, g: 0, b: 0 } });
doc.createParagraphStyle({ name: "Callout", basedOn: "Body", paragraph: { alignment: 2 } });
doc.setPageSetup({ topMargin: 72 });            // points; margins, size, orientation
doc.sections()[0].setHeaderText("Confidential");
doc.drawables()[1].setGeometry({ x: 100, y: 50 });

writeFileSync("report-2025.pages", doc.save());
```

Documents saved this way open in current Pages; everything you didn't touch
is preserved **byte-for-byte** (not just semantically — see
[Fidelity](#fidelity--compatibility)).

## Why this exists

The iWork format is undocumented. This repository is both a working library
and a **full reverse-engineering of the format**:

- [`docs/FORMAT.md`](docs/FORMAT.md) — the specification: container
  layouts, Apple's Snappy chunk framing, IWA archive streams, the object
  graph and its invariants, the type registry, the text/style/section
  models, and the complete writer's checklist.
- [`proto/`](proto/) — protobuf schema dumps (current shared families +
  Pages-specific), with provenance.
- [`research/`](research/) — line-cited invariant analysis of prior art and
  the machine-extracted type registry (535 shared + per-app type IDs,
  confirmed against a 2026 live registry dump).

## Install

```sh
npm install iwork-files
```

No runtime dependencies. No native modules. No shelling out. ESM, typed.

## Feature matrix

> **[`docs/COVERAGE.md`](docs/COVERAGE.md) is the authoritative, generated matrix** — version
> coverage per app, every capability with its support status, and how many real fixtures
> actually exercise it. Regenerate with `npm run coverage`; a test fails if it goes stale.
> The table below is the short version.

| Capability | Status |
|---|---|
| Parse all three container layouts (flat zip, nested `Index.zip`, wrapper dir) | ✅ |
| Pages: body text read/edit with full attribute-table fixup | ✅ |
| Pages: paragraph styles (by name), character formatting, style creation + editing | ✅ |
| Pages: sections (read + insert), page masters, header/footer text, master-page drawables | ✅ |
| Pages: page-layout (body-less) documents | ✅ |
| Pages: hyperlinks (read/create/remove), smart fields, bookmarks, attachments | ✅ |
| Pages: list styles by name, footnotes, comments, text boxes, document settings | ✅ |
| Pages: page setup — size, margins, header/footer margins, orientation | ✅ |
| Drawables (shapes, images, text boxes, tables): enumerate, move, resize | ✅ |
| Fluent API: `find()` → `TextRange` → `.bold().link()`, `ParagraphHandle` | ✅ |
| Tables: read cells (numbers, text, rich text, dates, booleans, durations, merges) | ✅ modern storage |
| Tables: **write** cells (text, number, date, bool, duration) | ✅ modern storage |
| Tables: cell styling (fill, four borders, padding, alignment, wrap) and table styling (banding, grid strokes) | ✅ |
| Tables: name, header/footer bands, row heights, column widths | ✅ |
| Styling values: colours (incl. Display P3), gradients, strokes, dashes, shadows, tabs | ✅ |
| Charts: type, categories, series names and plotted values | ✅ read |
| Images: filters/adjustments (exposure, saturation, levels…), masks, media variants | ✅ read/write |
| Keynote: slides, speaker notes, transitions, masters, canvas size | ✅ read/write |
| Inline image insertion (`Data/` plumbing, SHA-1 dedupe) | ⚠️ experimental |
| Chart **writing**, footnote/comment creation, table row/column insertion, formula authoring | roadmap |
| Editing a document open in an app; live iCloud collaboration | ✗ out of scope ([§13](docs/FORMAT.md)) |
| Numbers: sheets, tables and cell values | ✅ read/write |
| Byte-identical round-trip of untouched content | ✅ |
| Version-aware loading (never hard-fails on newer files) | ✅ |
| Object-graph inspection (`iwork-dump` CLI, RawMessage layer) | ✅ |
| iWork '09 XML documents | detected, rejected |
| Password-protected documents | detected, rejected |
| Pre-BNC (iWork '13-era) table cell storage | ✗ reports explicitly, never guesses |

## API tour

### Documents

```ts
import { PagesDocument, NumbersDocument, KeynoteDocument, IWorkDocument } from "iwork-files";

PagesDocument.load(bytes);    // typed loaders …
NumbersDocument.load(bytes);
KeynoteDocument.load(bytes);
IWorkDocument.open(bytes);    // … or auto-detect the app

doc.save();                   // → Uint8Array (bytes in, bytes out — no fs coupling)
doc.format;                   // FormatInfo: file format versions, build history, UUID
doc.stats();                  // components, object count, type histogram
```

All three app classes extend a common `IWorkDocument` base (shared TSWP
text, TSS style, TSD drawable machinery); Pages adds the TP-specific layer
(sections, page setup), Numbers and Keynote currently expose their roots
plus the shared machinery — deeper app models slot in the same way.

### Text (any app)

```ts
const storage = doc.textStorages()[0];   // headers, cells, notes, text boxes…
storage.text;
storage.paragraphs();                    // { start, end, text, styleId }
storage.replaceRange(10, 14, "new");     // UTF-16 offsets == JS string indexes
storage.replaceAll("find", "replace");
storage.appendParagraph("More");
storage.setParagraphStyle(0, styleId);
storage.setCharacterStyleRange(0, 5, styleId);
```

Every edit rewrites the text **and** fixes up all 20+ attribute tables
(styles, smart fields, attachments, sections, change tracking, …) so no
index ever dangles — the app-crash failure mode of naive editors.

### Styles

```ts
const sheet = doc.stylesheet;            // PagesDocument; .stylesheets() on any app
sheet.paragraphStyles();                 // named styles with ids/identifiers
sheet.findByName("Heading 1", 2022);
sheet.createParagraphStyle({ name: "Note", basedOn: "Body",
  character: { italic: true, fontSize: 11 },
  paragraph:  { leftIndent: 24, spaceBefore: 6 } });
sheet.createCharacterStyle({ character: { bold: true } });  // anonymous (direct formatting)

// Editing a named style reaches every run that uses it.
const heading = sheet.style("Heading 1")!;
heading.character();                     // what this style overrides
heading.resolved().character;            // …with the parent chain folded in
heading.setParagraph({
  border: solidStroke({ r: 0, g: 0, b: 0 }, 1),   // paragraph rule
  borderPositions: BorderPosition.BOTTOM,
  backgroundColor: hexColor("#f5f5f0"),
  tabs: [{ position: 216, alignment: TabAlignment.DECIMAL, leader: "." }],
});
```

Fills, gradients, strokes and shadows are one shared vocabulary — the same
values style text, table cells and shapes:

```ts
import { colorFill, linearGradient, solidStroke, hexColor } from "iwork-files";

colorFill(1, 0.9, 0.2);                                    // flat colour
linearGradient(hexColor("#fff"), hexColor("#0066ff"));     // two-stop gradient
solidStroke({ r: 0, g: 0, b: 0 }, 1);                      // 1pt border
({ color: { r: 0, g: 0, b: 0 }, pattern: [4, 2] });        // dashed
```

### Tables

```ts
const table = doc.tables()[0]!;
table.grid();                            // (CellValue | null)[][]
table.setCell(1, 0, { type: "text", value: "Revenue" });
table.setCell(1, 1, { type: "number", value: 143_800_000_000 });
table.setRow(2, [{ type: "date", value: new Date() }, { type: "bool", value: true }]);

table.setCellFormatting(1, 0, {
  fill: colorFill(0.95, 0.95, 1),
  borders: allBorders(solidStroke({ r: 0.2, g: 0.2, b: 0.2 }, 0.5)),
  padding: { left: 6, right: 6, top: 3, bottom: 3 },
  verticalAlignment: VerticalAlignment.MIDDLE,
  textWrap: true,
});
table.tableStyle()!.setTable({ bandedRows: true, bandedFill: colorFill(0.97, 0.97, 0.97) });

table.setBands({ headerRows: 1, footerRows: 1 });
table.setColumnWidth(0, 180);
```

Writing a cell preserves everything else the record carries — style ids,
number formats, comments — and reference-counts the table's string pool.
Pre-BNC (iWork '13-era) storage is refused rather than corrupted.

### Low level

```ts
import { IWorkContainer, parseIwaFile, RawMessage, typeName } from "iwork-files";

const container = IWorkContainer.fromBytes(bytes);   // zip layouts, encryption check
const objects = parseIwaFile(container.iwaFiles.get("Index/Document.iwa")!);
objects[0].identifier;                               // object graph primitives
objects[0].type;                                     // 10000
typeName(objects[0].type, "pages");                  // "TP.DocumentArchive"
objects[0].message.getString(3);                     // schema-light protobuf access
```

The `RawMessage` layer preserves unknown fields byte-for-byte and
re-serializes only along mutated paths — the property that makes editing
future files safe.

### CLI

```sh
npx iwork-dump info     file.pages     # versions, components, object counts
npx iwork-dump ls       file.pages     # every object with type names + references
npx iwork-dump text     file.pages     # extract text
npx iwork-dump styles   file.pages     # named styles
npx iwork-dump sections file.pages     # sections, headers, footers
npx iwork-dump object   file.pages 42  # pretty-print one object's protobuf
npx iwork-dump extract  file.pages out/  # decompressed .iwa streams
```

## Claude skill

The package ships a [Claude skill](skills/iwork-files/SKILL.md)
(`skills/iwork-files/SKILL.md`) that teaches AI agents the API and its
guardrails. Point a Claude Code session at an installed copy (or this repo)
and ask it to work with `.pages` files.

## Fidelity & compatibility

**Round-trip guarantee.** Components (`.iwa` files) you don't touch — and
all non-IWA package entries (plists, previews, media) — are emitted
byte-identically. The integration suite enforces this on real Apple-written
fixtures for all three container layouts.

**Write invariants.** Everything the apps validate is maintained on save:
payload lengths, `object_references` recomputation, cross-component
external references, object-ID allocation recorded in `PackageMetadata`,
stylesheet registration. The invariants and their provenance are documented
in [FORMAT.md §10](docs/FORMAT.md).

**Version awareness.** Apple evolves the format additively (verified
2013 → 2026: no field renumbering, ever). This library addresses fields by
number, preserves everything it doesn't model, treats the type registry as
replaceable data, and warns rather than fails on newer versions — so
documents from future app releases load, edit, and keep their new features
intact. Current app releases (including the 26.x year-based versions) are
supported.

**Semver.** The package follows semantic versioning; commit history uses
Conventional Commits so releases can be cut mechanically.

## Development

```sh
npm install
npm test           # unit + fixture suite (never launches an app)
npm run test:e2e   # macOS only: drives Pages/Numbers/Keynote via osascript
npm run coverage   # regenerate docs/COVERAGE.md
npm run typecheck
npm run build      # tsc → dist/
```

On a Mac with the apps installed, [`npm run test:e2e`](docs/E2E.md) verifies
what no offline test can: that the apps **open** what this library writes,
and that the library reads what they save. It also manufactures coverage the
fixture corpus lacks — Keynote transitions, for instance, exist in no
licensed document but can be created on demand through AppleScript. Skips
with a printed reason everywhere else.

Test fixtures are real Apple-generated documents from the Apache Tika and
libetonyek test suites — see [`fixtures/ATTRIBUTION.md`](fixtures/ATTRIBUTION.md).

## Prior art & thanks

Built on the shoulders of [obriensp/iWorkFileFormat](https://github.com/obriensp/iWorkFileFormat),
[psobot/keynote-parser](https://github.com/psobot/keynote-parser),
[masaccio/numbers-parser](https://github.com/masaccio/numbers-parser) and
[6over3/WorkKit](https://github.com/6over3/WorkKit) — see
[FORMAT.md §13](docs/FORMAT.md) for what each contributed. Schema dumps
originate from Apple's applications, extracted for interoperability.

## License

[MIT](LICENSE) © Ole Kristensen
