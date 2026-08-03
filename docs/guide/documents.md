# Working with documents

The fuller tour. Everything here follows the same few conventions — once
you've used one part of the API, you've used them all
([API design](/guide/api-design) explains the grammar).

## Text

All text is the same kind of thing. Body, headers, footers, table cells,
speaker notes, text boxes — each is a `TextStorage`, with one editing
model:

```ts
const storage = doc.textStorages()[0];
storage.text;
storage.paragraphs();                    // { start, end, text, styleId }
storage.replaceRange(10, 14, "new");     // UTF-16 offsets == JS string indexes
storage.replaceAll("find", "replace");
storage.appendParagraph("More");
storage.setParagraphStyle(0, styleId);
```

Every edit rewrites the text **and** fixes up all 20+ attribute tables
(styles, smart fields, attachments, sections, change tracking…) so no
index ever dangles — the app-crash failure mode of naive editors.

For richer flows, `doc.find(pattern)` returns `TextRange` handles:

```ts
doc.find("Revenue")[0].bold().link("https://example.com");
doc.paragraph(3).setStyle("Heading 2");
```

## Styles

```ts
const sheet = doc.stylesheet;
sheet.paragraphStyles();                 // named styles with ids/identifiers
sheet.createParagraphStyle({
  name: "Note", basedOn: "Body",
  character: { italic: true, fontSize: 11 },
  paragraph: { leftIndent: 24, spaceBefore: 6 },
});

const heading = sheet.style("Heading 1")!;
heading.character();                     // what this style overrides
heading.resolved().character;            // …with the parent chain folded in
heading.setParagraph({
  border: solidStroke({ r: 0, g: 0, b: 0 }, 1),
  borderPositions: BorderPosition.BOTTOM,
  backgroundColor: hexColor("#f5f5f0"),
  tabs: [{ position: 216, alignment: TabAlignment.DECIMAL, leader: "." }],
});
```

Fills, gradients, strokes and shadows are one shared vocabulary — the
same values style text, table cells and shapes: `colorFill(r, g, b)`,
`linearGradient(a, b)`, `solidStroke(color, width)`, `hexColor("#0066ff")`.

A created paragraph style appears in the app's styles panel — which takes
four distinct pieces of archive plumbing that the library handles and the
apps have confirmed.

## Tables

```ts
const table = doc.tables()[0]!;
table.grid();                            // (CellValue | null)[][]
table.setCell(1, 0, { type: "text", value: "Revenue" });
table.setRow(2, [{ type: "date", value: new Date() }, { type: "bool", value: true }]);

table.setCellFormatting(1, 0, {
  fill: colorFill(0.95, 0.95, 1),
  borders: allBorders(solidStroke({ r: 0.2, g: 0.2, b: 0.2 }, 0.5)),
  padding: { left: 6, right: 6, top: 3, bottom: 3 },
});
table.setBands({ headerRows: 1, freezeHeaderRows: true, repeatHeaderRows: true });
table.insertRows(3, 2);
table.setCellFormat(1, 1, { category: "currency", currencyCode: "EUR" });

table.cellFormula(1, 3);                 // "=B2*C2"
table.setFormula(1, 4, "=SUM(B2:B9)", { value: 1500 });  // nothing evaluates; pass the cache
table.merges();                          // [{ row, column, rowCount, columnCount }]
table.mergeCells(0, 0, 1, 3);            // anchor keeps its value, covered cells go
table.unmergeCells(0, 0);
```

Worth knowing: merges live in the calc engine, where the apps actually
keep them, and writing into a merge-covered cell throws. Formulas are a
*table* feature — Pages documents have them too — and render
per-position because references are stored as offsets from the using
cell; `setFormula` compiles the same way, so what you type is what the
cell means. Cross-table references (`Other::A2`) work both directions.
Function names aren't in the file format at all; 271 measured indexes
author and render by name, the rest render as `FUNCTION_<id>` and are
refused for writing rather than guessed.

## Numbers: conditional formatting, filters, categories

```ts
table.conditionalRules(4, 2);      // [{ predicate: { operator: "<", text: "C5<0" }, … }]
table.filterSets();                // { rows, columns }
table.activeCategories()?.groups(); // tree: [{ value, label, rows, children }]
```

Conditions are read from each rule's *formula*, so they read correctly
even for Apple's unpublished type codes. **Nothing evaluates**: the API
reports what rules are, not which currently matches — that needs the calc
engine, and a wrong answer would look exactly like a right one.

## Fields, comments, footnotes, bookmarks

```ts
body.addComment(10, 20, "Looks great. Ship it.");
body.addFootnote(30, "See the appendix.");
footer.insertPageNumber(footer.text.length);
body.insertLink(5, 12, "https://example.com");
body.addBookmark(10, 20, "Introduction");
```

Conventions the apps expect — the hyperlink character style, the
superscripted footnote mark, the shared comment author — are applied by
default, measured from how the apps themselves write documents; each can
be skipped (`{ characterStyle: false }`) or overridden with your own id.

## Slides

```ts
const slide = deck.slides()[0]!;
slide.title = "Q3";
slide.body = "Revenue\nCosts";
slide.notes = "Pause here.";
slide.isSkipped = true;
slide.setTransition({ automatic: true, delay: 2 });
deck.addSlide({ copyOf: 0 });
deck.duplicateSlide(0);
deck.moveSlide(0, 2);
deck.setSlideSize(1024, 768);
```

## Drawables, images, charts

```ts
doc.drawables()[1].setGeometry({ x: 100, y: 50 });
doc.images()[0].setCrop({ x: 20, y: 0, width: 200, height: 150 });
doc.images()[0].style()!.set({ shadow: { angle: 90, offset: 10, radius: 20, opacity: 0.7, enabled: true } });

const chart = doc.charts()[0]!;
chart.setValue(0, 2, { type: "number", value: 99 });
chart.addSeries("Region 3", values);
```

Chart data and appearance are both editable — type, series colours,
axis gridlines and legend styling, each copying a shared style archive
before writing so sibling charts keep theirs. Cropping never touches
the media — a mask defines the window in the image's own coordinate
space.

## Low level

```ts
import { IWorkContainer, parseIwaFile, RawMessage, typeName } from "cupertino-files";

const container = IWorkContainer.fromBytes(bytes);
const objects = parseIwaFile(container.iwaFiles.get("Index/Document.iwa")!);
typeName(objects[0].type, "pages");      // "TP.DocumentArchive"
objects[0].message.getString(3);         // schema-light protobuf access
```

The `RawMessage` layer preserves unknown fields byte-for-byte and
re-serializes only along mutated paths — the property that makes editing
future files safe. The [format specification](/FORMAT) documents every
layer beneath this API.
