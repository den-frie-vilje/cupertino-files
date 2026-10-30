# Markdown in and out

Every document exports to Markdown, and a Pages document, a Keynote deck
or a Numbers table can be written from it. The same reader and writer
serve the API, the MCP tool and the command line.

## Export

```ts
doc.toMarkdown();                      // text, tables and charts in the document's structure
doc.tables()[0].toCsv();               // one table as RFC 4180 CSV
doc.toMarkdown({ images: ({ fileName, data }) => save(fileName, data) });  // pictures through a sink
```

Pages leads with the first section's header and footer as front matter,
then renders its body: headings from the named paragraph styles, list
paragraphs as list items, inline tables and pictures where the text
anchors them, hyperlinks as links, bold and italic as markers, footnotes
as references with their definitions after the text, then the text of
the shapes and text boxes placed on the pages (all the text of a
page-layout document). Numbers is a top-level heading
per sheet and a pipe table per table, under its name when the table
shows one. Keynote is a section per slide, `## 1. Title`, the body's
paragraphs as list items, the slide's text boxes, pictures and tables,
and the presenter notes as a block quote. Charts become a table of their series.
Comments are quoted where they sit, a cell's after its table and a
paragraph's after its text, with the author's name — so exporting a
reviewed document reads the review.

Pictures leave the document only through the sink: it receives each
picture's file name and bytes, stores it wherever it likes and returns
the link to write. Without a sink the pictures are left out.

From the shell:

```sh
cupertino-files export deck.key                               # Markdown to stdout
cupertino-files export book.numbers --format csv --table Sales
cupertino-files export report.pages --out out/report.md --assets out/report-assets
```

## Build

```ts
PagesDocument.fromMarkdown(md, { images });    // headings, lists, tables, pictures, links, emphasis, footnotes
KeynoteDocument.fromMarkdown(md, { images });  // a slide per heading or ---; quotes become notes
NumbersDocument.fromMarkdown(md);              // a sheet per top heading, a table per pipe table
NumbersDocument.fromCsv(csv, "Sales");
```

Pages gives a level-one heading the template's Title style, deeper
headings Heading, Heading 2 and Heading 3, paragraphs Body, and lists
the Bullet or Numbered list style. Each pipe table becomes an inline
table in a paragraph of its own, each image on a line of its own an
inline picture when `images` supplies its bytes by the source the
Markdown names, links become hyperlinks, `**bold**` and `*italic*`
direct formatting, and a `[^1]` with a `[^1]: …` definition a footnote.

Keynote titles its blank deck's title slide with the first heading and
adds a "Title & Bullets" slide per later heading or thematic break; the
paragraphs and list items beneath are the body, block quotes the
presenter notes, pipe tables tables on the slide and pictures pictures.
Headings deeper than two levels are lines of the body.

Numbers names a sheet by each top-level heading, adding a sheet for
every one after the first, and makes a table of each pipe table, named
by the nearest heading above it. Text outside tables has no home in
Numbers and is dropped.

Pass `template` — a document of the same kind, as bytes — and the result
is that document emptied, with its theme, page setup and named styles:
a letterhead's Title and Body, a deck's own layouts — and a front
matter block's `header:` and `footer:` land in the template's first
section. `layout` names the
Keynote layout content slides take; without it, "Title & Bullets" where
the theme has one, else a copy of the first slide's layout.

From the shell, `import` takes a Markdown or CSV file and the document
to create; pictures are found beside the source file:

```sh
cupertino-files import notes.md deck.key
cupertino-files import sales.csv sales.numbers
cupertino-files import notes.md deck.key --template Letterhead.key --layout "Title & Bullets"
```

Over MCP, `create_document` takes `content` (Markdown, or CSV with
`format: "csv"`) and `imageRoot`; `export_document` takes `format`,
`table`, `assets` and `output`.

## What does not travel

Styling beyond bold and italic, page layout, headers and footers,
comments, charts (they export, but are not built), and anything a table
holds beyond its cell text: formulas export their cached value, formats
their display text.
