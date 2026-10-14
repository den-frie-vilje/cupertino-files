/**
 * A Model Context Protocol server over stdio — hand-rolled, like the rest.
 *
 * The protocol is small: newline-delimited JSON-RPC 2.0 on stdin/stdout,
 * an `initialize` handshake, then `tools/list` and `tools/call`. Pulling
 * in the SDK for that would end this package's zero-dependency claim to
 * save perhaps two hundred lines, most of which are the tool definitions
 * this file would need anyway. Logs go to stderr; stdout carries protocol
 * frames only, because a stray `console.log` corrupts the stream.
 *
 * Every tool is a thin wrapper over the public API. Paths are resolved by
 * the client's working directory, as is normal for stdio servers; writes
 * save in place unless `output` names somewhere else, which mirrors what
 * the apps themselves do to a document.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { createInterface } from "node:readline";
import { IWorkDocument } from "../tsa/document.ts";
import { PagesDocument } from "../pages/document.ts";
import { NumbersDocument } from "../numbers/document.ts";
import { KeynoteDocument } from "../keynote/document.ts";
import { tablesOf, type TableModel } from "../tst/tables.ts";
import { allBorders, type CellFormatting } from "../tst/styles.ts";
import { chartsOf } from "../tsch/charts.ts";
import { hexColor, solidStroke } from "../tsd/style.ts";
import { fillTable } from "../tst/csv.ts";
import type { CharacterFormatting } from "../tss/stylesheet.ts";
import type { CellFormat } from "../tst/formats.ts";
import { TOOL_DOCS } from "./tool-docs.generated.ts";
import type { DateBucket } from "../tst/categories.ts";

const PROTOCOL_FALLBACK = "2025-06-18";
const SERVER_INFO = { name: "cupertino-files", version: packageVersion() };

function packageVersion(): string {
  for (const candidate of ["../../package.json", "../../../package.json"]) {
    try {
      const url = new URL(candidate, import.meta.url);
      const parsed = JSON.parse(readFileSync(url, "utf8")) as { version?: string };
      if (parsed.version) return parsed.version;
    } catch {
      // keep looking; dist/ nests one level deeper than src/
    }
  }
  return "0.0.0";
}

// ------------------------------------------------------------------ documents

type AnyDocument = PagesDocument | NumbersDocument | KeynoteDocument | IWorkDocument;

function open(path: string): AnyDocument {
  const bytes = new Uint8Array(readFileSync(path));
  if (path.endsWith(".pages")) return PagesDocument.load(bytes);
  if (path.endsWith(".numbers")) return NumbersDocument.load(bytes);
  if (path.endsWith(".key")) return KeynoteDocument.load(bytes);
  return IWorkDocument.open(bytes);
}

function tableIn(doc: AnyDocument, name: string | undefined): TableModel {
  const tables = tablesOf(doc.store);
  if (tables.length === 0) throw new RangeError("the document has no tables");
  if (name === undefined) {
    if (tables.length > 1) {
      throw new RangeError(
        `the document has ${tables.length} tables; name one of: ` +
          tables.map((t) => JSON.stringify(t.name ?? "")).join(", "),
      );
    }
    return tables[0]!;
  }
  const found = tables.find((t) => t.name === name);
  if (!found) {
    throw new RangeError(
      `no table named ${JSON.stringify(name)}; the document has: ` +
        tables.map((t) => JSON.stringify(t.name ?? "")).join(", "),
    );
  }
  return found;
}

function save(doc: AnyDocument, path: string, output: string | undefined): string {
  const target = output ?? path;
  writeFileSync(target, doc.save());
  return target;
}

// ---------------------------------------------------------------------- tools

export interface Tool {
  name: string;
  description: string;
  inputSchema: object;
  handler: (args: Record<string, unknown>) => string;
}

/**
 * Tools that are compositions with no single backing method — their
 * descriptions live here, everything else's comes from the API's TSDoc
 * via {@link TOOL_DOCS}. The census test requires this list to stay in
 * step with the generated bindings.
 */
export const COMPOSITE_TOOLS: readonly string[] = [
  "describe_document",
  "read_text",
  "read_table",
  "set_slide_text",
];

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);

// Schema fragments every table tool shares; hoisted so the wording that
// teaches the model stays in one place.
const PATH_PROP = { type: "string", description: "Path to the document" } as const;
const TABLE_PROP = {
  type: "string",
  description: "Table name; may be omitted when the document has exactly one table",
} as const;
const OUTPUT_PROP = { type: "string", description: "Save here instead of over the input" } as const;

/**
 * A bound tool's description IS the API's docblock — extracted by
 * scripts/generate-tool-docs.ts from the `@agentTool` tag — plus the
 * adapter's own notes: the schema-level things the API cannot know (hex
 * colors, find-by-text addressing, output paths). Throws at import when
 * a tool and its tag disagree, the way protoFields refuses a misspelled
 * field, so the server cannot start with stale text.
 */
function apiDoc(tool: string, adapterNotes: string): string {
  const entries = TOOL_DOCS.get(tool);
  if (!entries || entries.length === 0) {
    throw new Error(
      `no API method is tagged @agentTool ${tool}; add the tag and run npm run tooldocs`,
    );
  }
  const summary =
    entries.length === 1
      ? entries[0]!.summary
      : entries.map((e) => `${e.api.split(".")[1]}: ${e.summary}`).join(" ");
  return `${summary} ${adapterNotes}`.trim();
}

function requirePath(args: Record<string, unknown>): string {
  const path = str(args.path);
  if (!path) throw new RangeError("path is required");
  return path;
}

export const TOOLS: readonly Tool[] = [
  {
    name: "describe_document",
    description:
      "Summarize an Apple Pages, Numbers or Keynote document (.pages/.numbers/.key, modern " +
      "IWA format): which app wrote it, its tables with dimensions and formula/merge counts, " +
      "slides, text length and charts. Start here to learn a document's shape before reading " +
      "or editing it.",
    inputSchema: {
      type: "object",
      properties: { path: PATH_PROP },
      required: ["path"],
    },
    handler: (args) => {
      const path = requirePath(args);
      const doc = open(path);
      const out: Record<string, unknown> = {
        path,
        kind: doc instanceof PagesDocument ? "pages"
          : doc instanceof NumbersDocument ? "numbers"
          : doc instanceof KeynoteDocument ? "keynote" : "unknown",
      };
      out.tables = tablesOf(doc.store).map((t) => ({
        name: t.name,
        rows: t.rowCount,
        columns: t.columnCount,
        formulas: t.formulas().length,
        merges: t.merges().length,
      }));
      out.charts = chartsOf(doc.store).length;
      if (doc instanceof KeynoteDocument) {
        out.slides = doc.slides().map((s, i) => ({ index: i, title: s.title ?? "" }));
        out.layouts = doc.masterSlides().map((m) => m.name).filter((name): name is string => name !== undefined && name !== "");
      }
      if (doc instanceof PagesDocument) {
        out.bodyTextLength = doc.body.text.length;
      }
      return JSON.stringify(out, null, 2);
    },
  },
  {
    name: "export_document",
    description: apiDoc(
      "export_document",
      "format is markdown (the default: text, tables and charts in the document's structure), " +
        "csv (one table, chosen by table as a 0-based index or a name; the first by default) or " +
        "text (every text storage, plain). Returns the result, or writes it to output and " +
        "returns the path.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_PROP,
        format: { type: "string", enum: ["markdown", "csv", "text"] },
        table: { type: "string", description: "csv: 0-based table index or table name" },
        assets: { type: "string", description: "markdown: a directory the pictures are written to, linked relative to output" },
        output: { type: "string", description: "Write here instead of returning the content" },
      },
      required: ["path"],
    },
    handler: (args) => {
      const path = requirePath(args);
      const doc = open(path);
      const format = str(args.format) ?? "markdown";
      let content: string;
      const output = str(args.output);
      const assets = str(args.assets);
      if (format === "markdown") {
        const sink = assets
          ? (image: { fileName: string; data: Uint8Array }): string => {
              mkdirSync(assets, { recursive: true });
              const file = join(assets, image.fileName);
              writeFileSync(file, image.data);
              return output ? relative(dirname(output), file) || image.fileName : file;
            }
          : undefined;
        content = doc.toMarkdown(sink ? { images: sink } : {});
      }
      else if (format === "text") content = doc.allText();
      else if (format === "csv") {
        const tables = doc.tables();
        const which = str(args.table) ?? "0";
        const table = /^\d+$/.test(which) ? tables[Number(which)] : tables.find((t) => t.name === which);
        if (!table) {
          throw new RangeError(
            `no table ${which}; the document has ${tables.map((t, i) => `${i}: ${t.name ?? "(unnamed)"}`).join(", ") || "none"}`,
          );
        }
        content = table.toCsv();
      } else throw new RangeError(`unknown format ${format}; use markdown, csv or text`);
      if (output) {
        writeFileSync(output, content);
        return `wrote ${format} to ${output}`;
      }
      return content;
    },
  },
  {
    name: "read_text",
    description:
      "Extract the text of a document: a Pages file's body, or a Keynote deck's titles, " +
      "bodies and presenter notes per slide. For Numbers, use read_table instead.",
    inputSchema: {
      type: "object",
      properties: { path: PATH_PROP },
      required: ["path"],
    },
    handler: (args) => {
      const doc = open(requirePath(args));
      if (doc instanceof PagesDocument) return doc.body.text;
      if (doc instanceof KeynoteDocument) {
        return doc
          .slides()
          .map((s, i) => {
            const parts = [`--- slide ${i + 1} ---`];
            if (s.title) parts.push(s.title);
            if (s.body) parts.push(s.body);
            if (s.notes) parts.push(`[notes] ${s.notes}`);
            return parts.join("\n");
          })
          .join("\n\n");
      }
      throw new RangeError("read_text covers Pages and Keynote; use read_table for Numbers");
    },
  },
  {
    name: "read_table",
    description:
      "Read a table's cells as display text, row by row. Rows and columns are 0-based. " +
      "Formulas show their cached value; use list_formulas to see the formulas themselves. " +
      "Output is capped at maxRows (default 100) and says so when it truncates.",
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_PROP,
        table: TABLE_PROP,
        maxRows: { type: "number", description: "Row cap, default 100" },
      },
      required: ["path"],
    },
    handler: (args) => {
      const table = tableIn(open(requirePath(args)), str(args.table));
      const cap = Math.max(1, num(args.maxRows) ?? 100);
      const rows: string[][] = [];
      for (let r = 0; r < Math.min(table.rowCount, cap); r++) {
        const row: string[] = [];
        for (let c = 0; c < table.columnCount; c++) row.push(table.cellText(r, c));
        rows.push(row);
      }
      return JSON.stringify(
        {
          table: table.name,
          rows: table.rowCount,
          columns: table.columnCount,
          truncatedAt: table.rowCount > cap ? cap : undefined,
          cells: rows,
        },
        null,
        2,
      );
    },
  },
  {
    name: "audit_document",
    description: apiDoc(
      "audit_document",
      "Findings come back as { severity, code, message } — 'error' names a state the app " +
        "refuses or repairs destructively, 'warning' one it renders against the author's " +
        "intent. An empty list is the pass.",
    ),
    inputSchema: {
      type: "object",
      properties: { path: PATH_PROP },
      required: ["path"],
    },
    handler: (args) => {
      const path = requirePath(args);
      return JSON.stringify({ path, findings: open(path).audit() }, null, 2);
    },
  },
  {
    name: "list_formulas",
    description: apiDoc(
      "list_formulas",
      "Omit table to list every table. Coordinates are 0-based.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_PROP,
        table: { type: "string", description: "Table name; omit for every table" },
      },
      required: ["path"],
    },
    handler: (args) => {
      const doc = open(requirePath(args));
      const name = str(args.table);
      const tables = name ? [tableIn(doc, name)] : tablesOf(doc.store);
      const out = tables.map((t) => ({ table: t.name, formulas: t.formulas() }));
      return JSON.stringify(out, null, 2);
    },
  },
  {
    name: "list_comments",
    description: apiDoc(
      "list_comments",
      "Omit table to list every table. Reviewers answer as comments on cells, so read " +
        "these before anything else on a returned file. Coordinates are 0-based.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_PROP,
        table: { type: "string", description: "Table name; omit for every table" },
      },
      required: ["path"],
    },
    handler: (args) => {
      const doc = open(requirePath(args));
      const name = str(args.table);
      const tables = name ? [tableIn(doc, name)] : tablesOf(doc.store);
      const out = tables.map((t) => ({ table: t.name, comments: t.cellComments() }));
      return JSON.stringify(out, null, 2);
    },
  },
  {
    name: "set_cells",
    description: apiDoc(
      "set_cells",
      "Rows and columns are 0-based; values may be strings, numbers, booleans, or null to " +
        "clear. Saves over the input unless output names another path.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_PROP,
        table: TABLE_PROP,
        cells: {
          type: "array",
          description: "Cells to write",
          items: {
            type: "object",
            properties: {
              row: { type: "number" },
              column: { type: "number" },
              value: { description: "string | number | boolean | null" },
            },
            required: ["row", "column"],
          },
        },
        output: OUTPUT_PROP,
      },
      required: ["path", "cells"],
    },
    handler: (args) => {
      const path = requirePath(args);
      const doc = open(path);
      const table = tableIn(doc, str(args.table));
      const cells = Array.isArray(args.cells) ? args.cells : [];
      if (cells.length === 0) throw new RangeError("cells is empty; nothing to write");
      for (const cell of cells as { row: number; column: number; value?: unknown }[]) {
        const value = cell.value ?? null;
        if (
          value !== null &&
          typeof value !== "string" &&
          typeof value !== "number" &&
          typeof value !== "boolean"
        ) {
          throw new RangeError(
            `cell ${cell.row},${cell.column}: values are strings, numbers, booleans or null`,
          );
        }
        table.setCell(cell.row, cell.column, value);
      }
      const target = save(doc, path, str(args.output));
      return `wrote ${cells.length} cell(s) to ${JSON.stringify(table.name ?? "")} and saved ${target}`;
    },
  },
  {
    name: "set_formula",
    description: apiDoc(
      "set_formula",
      "Address the cell with 0-based row/column; the formula is infix text like =SUM(A1:A5) " +
        "or =Other::B2. Pass cachedValue as the displayed value. Saves over the input unless " +
        "output names another path.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_PROP,
        table: TABLE_PROP,
        row: { type: "number", description: "0-based row" },
        column: { type: "number", description: "0-based column" },
        formula: { type: "string", description: "Infix formula text, e.g. =A1*2" },
        cachedValue: { description: "Value the cell shows until recalculation" },
        output: OUTPUT_PROP,
      },
      required: ["path", "row", "column", "formula"],
    },
    handler: (args) => {
      const path = requirePath(args);
      const doc = open(path);
      const table = tableIn(doc, str(args.table));
      const row = num(args.row);
      const column = num(args.column);
      const formula = str(args.formula);
      if (row === undefined || column === undefined || !formula) {
        throw new RangeError("row, column and formula are required");
      }
      const cached = args.cachedValue;
      table.setFormula(row, column, formula, {
        value:
          cached === undefined || cached === null
            ? undefined
            : (cached as string | number | boolean),
      });
      const target = save(doc, path, str(args.output));
      return `set ${formula} at r${row}c${column} of ${JSON.stringify(table.name ?? "")} and saved ${target}`;
    },
  },
  {
    name: "create_document",
    description: apiDoc(
      "create_document",
      "kind picks the app, or the path's extension does. content, when given, is Markdown the " +
        "document is written from (headings, paragraphs, lists, block quotes, pipe tables), or " +
        "CSV for a Numbers document when format is csv. Refuses to overwrite an existing file.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Where to write the new document (.pages, .numbers or .key)",
        },
        kind: {
          type: "string",
          enum: ["pages", "numbers", "keynote"],
          description: "Which app's document to create; defaults to what the extension says",
        },
        content: { type: "string", description: "Markdown (or CSV) to write the document from" },
        format: { type: "string", enum: ["markdown", "csv"], description: "What content is; markdown by default" },
        imageRoot: { type: "string", description: "Directory the Markdown's image paths are relative to" },
      },
      required: ["path"],
    },
    handler: (args) => {
      const path = requirePath(args);
      if (existsSync(path)) {
        throw new RangeError(`${path} already exists; create_document refuses to overwrite`);
      }
      const kind =
        str(args.kind) ??
        (path.endsWith(".pages")
          ? "pages"
          : path.endsWith(".numbers")
            ? "numbers"
            : path.endsWith(".key")
              ? "keynote"
              : undefined);
      const content = str(args.content);
      const format = str(args.format) ?? "markdown";
      if (format === "csv" && kind !== "numbers") throw new RangeError("csv content makes a Numbers document");
      const imageRoot = str(args.imageRoot);
      const images = (src: string): Uint8Array | undefined => {
        if (/^[a-z]+:/i.test(src)) return undefined;
        const file = imageRoot ? join(imageRoot, src) : src;
        return existsSync(file) ? new Uint8Array(readFileSync(file)) : undefined;
      };
      const doc =
        kind === "pages"
          ? content === undefined
            ? PagesDocument.blank()
            : PagesDocument.fromMarkdown(content, { images })
          : kind === "numbers"
            ? content === undefined
              ? NumbersDocument.blank()
              : format === "csv"
                ? NumbersDocument.fromCsv(content)
                : NumbersDocument.fromMarkdown(content)
            : kind === "keynote"
              ? content === undefined
                ? KeynoteDocument.blank()
                : KeynoteDocument.fromMarkdown(content, { images })
              : undefined;
      if (!doc) {
        throw new RangeError(
          "kind must be pages, numbers or keynote — or give the path a .pages/.numbers/.key extension",
        );
      }
      writeFileSync(path, doc.save());
      return `created a ${content === undefined ? "blank" : `${format}-built`} ${kind} document at ${path}`;
    },
  },
  {
    name: "append_paragraph",
    description: apiDoc(
      "append_paragraph",
      "Pages documents only. Saves over the input unless output names another path.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the .pages document" },
        text: { type: "string", description: "Paragraph text" },
        style: { type: "string", description: "Named paragraph style, e.g. \"Heading 1\"" },
        output: OUTPUT_PROP,
      },
      required: ["path", "text"],
    },
    handler: (args) => {
      const path = requirePath(args);
      const text = str(args.text);
      if (!text) throw new RangeError("text is required");
      const doc = pagesDocument(open(path), "append_paragraph");
      doc.appendParagraph(text, str(args.style));
      const target = save(doc, path, str(args.output));
      return `appended one paragraph and saved ${target}`;
    },
  },
  {
    name: "replace_text",
    description: apiDoc(
      "replace_text",
      "Pages documents only. Saves over the input unless output names another path.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the .pages document" },
        find: { type: "string", description: "Exact text to find" },
        replace: { type: "string", description: "Replacement text" },
        output: OUTPUT_PROP,
      },
      required: ["path", "find", "replace"],
    },
    handler: (args) => {
      const path = requirePath(args);
      const find = str(args.find);
      const replace = str(args.replace);
      if (!find || replace === undefined) throw new RangeError("find and replace are required");
      const doc = pagesDocument(open(path), "replace_text");
      const count = doc.replaceText(find, replace);
      if (count === 0) return `found no occurrence of ${JSON.stringify(find)}; nothing saved`;
      const target = save(doc, path, str(args.output));
      return `replaced ${count} occurrence(s) and saved ${target}`;
    },
  },
  {
    name: "format_text",
    description: apiDoc(
      "format_text",
      "This tool finds the first occurrence of the phrase and formats that range: bold, " +
        "italic, fontSize, fontName, fontColor (hex like #cc0000). Pages documents only. " +
        "Saves over the input unless output names another path.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the .pages document" },
        find: { type: "string", description: "The phrase to format (first occurrence)" },
        bold: { type: "boolean" },
        italic: { type: "boolean" },
        fontSize: { type: "number", description: "Point size" },
        fontName: { type: "string", description: "PostScript name, e.g. Helvetica-Bold" },
        fontColor: { type: "string", description: "Hex color, e.g. #cc0000" },
        output: OUTPUT_PROP,
      },
      required: ["path", "find"],
    },
    handler: (args) => {
      const path = requirePath(args);
      const find = str(args.find);
      if (!find) throw new RangeError("find is required");
      const doc = pagesDocument(open(path), "format_text");
      const at = doc.body.text.indexOf(find);
      if (at < 0) throw new RangeError(`the body does not contain ${JSON.stringify(find)}`);
      const formatting: CharacterFormatting = {};
      if (typeof args.bold === "boolean") formatting.bold = args.bold;
      if (typeof args.italic === "boolean") formatting.italic = args.italic;
      if (num(args.fontSize) !== undefined) formatting.fontSize = num(args.fontSize);
      if (str(args.fontName)) formatting.fontName = str(args.fontName);
      if (str(args.fontColor)) formatting.fontColor = hexColor(str(args.fontColor)!);
      if (Object.keys(formatting).length === 0) {
        throw new RangeError("nothing to apply; pass bold, italic, fontSize, fontName or fontColor");
      }
      doc.applyCharacterFormatting(at, at + find.length, formatting);
      const target = save(doc, path, str(args.output));
      return `formatted ${JSON.stringify(find)} and saved ${target}`;
    },
  },
  {
    name: "format_cells",
    description: apiDoc(
      "format_cells",
      "Rows and columns are 0-based; rowCount and columnCount default to 1. Colors are hex " +
        "like #f5f5f0; borders take {color, width}. Saves over the input unless output names " +
        "another path.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_PROP,
        table: TABLE_PROP,
        row: { type: "number", description: "0-based first row" },
        column: { type: "number", description: "0-based first column" },
        rowCount: { type: "number", description: "Rows in the block, default 1" },
        columnCount: { type: "number", description: "Columns in the block, default 1" },
        fill: { type: "string", description: "Background as hex, e.g. #fff2cc" },
        borders: {
          type: "object",
          description: "All four borders: { color: \"#333333\", width: 0.5 }",
          properties: { color: { type: "string" }, width: { type: "number" } },
        },
        verticalAlignment: { type: "string", enum: ["top", "middle", "bottom"] },
        textWrap: { type: "boolean" },
        output: OUTPUT_PROP,
      },
      required: ["path", "row", "column"],
    },
    handler: (args) => {
      const path = requirePath(args);
      const doc = open(path);
      const table = tableIn(doc, str(args.table));
      const row = num(args.row);
      const column = num(args.column);
      if (row === undefined || column === undefined) {
        throw new RangeError("row and column are required");
      }
      const formatting: CellFormatting = {};
      if (str(args.fill)) {
        formatting.fill = { kind: "color", color: hexColor(str(args.fill)!) };
      }
      const borders = args.borders as { color?: string; width?: number } | undefined;
      if (borders?.color) {
        formatting.borders = allBorders(solidStroke(hexColor(borders.color), borders.width ?? 1));
      }
      const valign = str(args.verticalAlignment);
      if (valign) formatting.verticalAlignment = { top: 0, middle: 1, bottom: 2 }[valign];
      if (typeof args.textWrap === "boolean") formatting.textWrap = args.textWrap;
      if (Object.keys(formatting).length === 0) {
        throw new RangeError("nothing to apply; pass fill, borders, verticalAlignment or textWrap");
      }
      table.setRangeFormatting(
        row,
        column,
        Math.max(1, num(args.rowCount) ?? 1),
        Math.max(1, num(args.columnCount) ?? 1),
        formatting,
      );
      const target = save(doc, path, str(args.output));
      return `formatted the block at r${row}c${column} of ${JSON.stringify(table.name ?? "")} and saved ${target}`;
    },
  },
  {
    name: "merge_cells",
    description: apiDoc(
      "merge_cells",
      "Pass rowCount and columnCount to merge; pass unmerge true (omitting the counts) to " +
        "split the merge anchored at row/column instead. 0-based. Saves over the input " +
        "unless output names another path.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_PROP,
        table: TABLE_PROP,
        row: { type: "number", description: "0-based anchor row" },
        column: { type: "number", description: "0-based anchor column" },
        rowCount: { type: "number", description: "Rows to span (≥1; with columnCount > 1×1)" },
        columnCount: { type: "number", description: "Columns to span" },
        unmerge: { type: "boolean", description: "Remove the merge anchored here instead" },
        output: OUTPUT_PROP,
      },
      required: ["path", "row", "column"],
    },
    handler: (args) => {
      const path = requirePath(args);
      const doc = open(path);
      const table = tableIn(doc, str(args.table));
      const row = num(args.row);
      const column = num(args.column);
      if (row === undefined || column === undefined) {
        throw new RangeError("row and column are required");
      }
      if (args.unmerge === true) {
        if (!table.unmergeCells(row, column)) {
          throw new RangeError(`no merge is anchored at r${row}c${column}`);
        }
        const target = save(doc, path, str(args.output));
        return `unmerged the range anchored at r${row}c${column} and saved ${target}`;
      }
      const rowCount = num(args.rowCount);
      const columnCount = num(args.columnCount);
      if (rowCount === undefined || columnCount === undefined) {
        throw new RangeError("rowCount and columnCount are required (or pass unmerge: true)");
      }
      table.mergeCells(row, column, rowCount, columnCount);
      const target = save(doc, path, str(args.output));
      return `merged ${rowCount}x${columnCount} at r${row}c${column} of ${JSON.stringify(table.name ?? "")} and saved ${target}`;
    },
  },
  {
    name: "modify_table",
    description: apiDoc(
      "modify_table",
      "Actions: insert_rows, delete_rows, insert_columns, delete_columns (at + count, " +
        "0-based), set_column_width and set_row_height (at + width or height in points). " +
        "Saves over the input unless output names another path.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_PROP,
        table: TABLE_PROP,
        action: {
          type: "string",
          enum: [
            "insert_rows", "delete_rows", "insert_columns", "delete_columns",
            "set_column_width", "set_row_height",
          ],
        },
        at: { type: "number", description: "0-based row or column position" },
        count: { type: "number", description: "How many, default 1" },
        width: { type: "number", description: "Points, for set_column_width" },
        height: { type: "number", description: "Points, for set_row_height" },
        output: OUTPUT_PROP,
      },
      required: ["path", "action", "at"],
    },
    handler: (args) => {
      const path = requirePath(args);
      const doc = open(path);
      const table = tableIn(doc, str(args.table));
      const action = str(args.action);
      const at = num(args.at);
      if (at === undefined) throw new RangeError("at is required");
      const count = Math.max(1, num(args.count) ?? 1);
      switch (action) {
        case "insert_rows":
          table.insertRows(at, count);
          break;
        case "delete_rows":
          table.deleteRows(at, count);
          break;
        case "insert_columns":
          table.insertColumns(at, count);
          break;
        case "delete_columns":
          table.deleteColumns(at, count);
          break;
        case "set_column_width": {
          const width = num(args.width);
          if (width === undefined) throw new RangeError("width is required for set_column_width");
          table.setColumnWidth(at, width);
          break;
        }
        case "set_row_height": {
          const height = num(args.height);
          if (height === undefined) throw new RangeError("height is required for set_row_height");
          table.setRowHeight(at, height);
          break;
        }
        default:
          throw new RangeError(`unknown action ${String(action)}`);
      }
      const target = save(doc, path, str(args.output));
      return `${action} at ${at} on ${JSON.stringify(table.name ?? "")} and saved ${target}`;
    },
  },
  {
    name: "set_slide_text",
    description:
      "Rewrite a Keynote slide's title, body, or presenter notes (any subset) and save the " +
      "deck. Slides are 0-based in presentation order; use describe_document to see them. " +
      "Saves over the input unless output names another path.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the .key document" },
        slide: { type: "number", description: "0-based slide index" },
        title: { type: "string" },
        body: { type: "string" },
        notes: { type: "string" },
        output: OUTPUT_PROP,
      },
      required: ["path", "slide"],
    },
    handler: (args) => {
      const path = requirePath(args);
      const doc = open(path);
      if (!(doc instanceof KeynoteDocument)) {
        throw new RangeError("set_slide_text writes Keynote documents; this is not one");
      }
      const index = num(args.slide);
      const slides = doc.slides();
      if (index === undefined || index < 0 || index >= slides.length) {
        throw new RangeError(`slide must be 0..${slides.length - 1}`);
      }
      const slide = slides[index]!;
      const title = str(args.title);
      const body = str(args.body);
      const notes = str(args.notes);
      if (title === undefined && body === undefined && notes === undefined) {
        throw new RangeError("nothing to set; pass title, body or notes");
      }
      if (title !== undefined) slide.title = title;
      if (body !== undefined) slide.body = body;
      if (notes !== undefined) slide.notes = notes;
      const target = save(doc, path, str(args.output));
      return `updated slide ${index} and saved ${target}`;
    },
  },
  {
    name: "add_build",
    description: apiDoc(
      "add_build",
      "Animates one drawable on a Keynote slide with an all-at-once build played on click. " +
        "slide and drawable are 0-based (drawables in the slide's z-order; use " +
        "describe_document); effect is the identifier the app stores, e.g. \"apple:dissolve\". " +
        "Saves over the input unless output names another path.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the .key document" },
        slide: { type: "number", description: "0-based slide index" },
        drawable: { type: "number", description: "0-based index among the slide's drawables" },
        effect: { type: "string", description: "Effect identifier as the app stores it" },
        duration: { type: "number", description: "Seconds, default 1" },
        delay: { type: "number", description: "Seconds before the build starts, default 0" },
        output: OUTPUT_PROP,
      },
      required: ["path", "slide", "drawable", "effect"],
    },
    handler: (args) => {
      const path = requirePath(args);
      const doc = open(path);
      if (!(doc instanceof KeynoteDocument)) {
        throw new RangeError("add_build writes Keynote documents; this is not one");
      }
      const index = num(args.slide);
      const slides = doc.slides();
      if (index === undefined || index < 0 || index >= slides.length) {
        throw new RangeError(`slide must be 0..${slides.length - 1}`);
      }
      const slide = slides[index]!;
      const drawables = slide.drawables();
      const which = num(args.drawable);
      const effect = str(args.effect);
      if (which === undefined || which < 0 || which >= drawables.length || effect === undefined) {
        throw new RangeError(`drawable must be 0..${drawables.length - 1} and effect is required`);
      }
      const build = slide.addBuild({
        drawableId: drawables[which]!.id,
        effect,
        duration: num(args.duration),
        delay: num(args.delay),
      });
      const target = save(doc, path, str(args.output));
      return `added build ${build.id} (${effect}) to slide ${index} and saved ${target}`;
    },
  },
  {
    name: "set_slide_background",
    description: apiDoc(
      "set_slide_background",
      "Gives a Keynote slide a flat background colour (hex like #1a3a2a), as a style of its own " +
        "under the layout's. slide is 0-based. Saves over the input unless output names another path.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the .key document" },
        slide: { type: "number", description: "0-based slide index" },
        color: { type: "string", description: "Background colour as hex, e.g. #1a3a2a" },
        output: OUTPUT_PROP,
      },
      required: ["path", "slide", "color"],
    },
    handler: (args) => {
      const path = requirePath(args);
      const doc = open(path);
      if (!(doc instanceof KeynoteDocument)) {
        throw new RangeError("set_slide_background edits Keynote documents; this is not one");
      }
      const index = num(args.slide);
      const color = str(args.color);
      if (index === undefined || color === undefined) throw new RangeError("slide and color are required");
      const slide = doc.slides()[index];
      if (!slide) throw new RangeError(`slide must be 0..${doc.slides().length - 1}`);
      slide.setBackground({ kind: "color", color: hexColor(color) });
      const target = save(doc, path, str(args.output));
      return `set the background of slide ${index} and saved ${target}`;
    },
  },
  {
    name: "add_text_box",
    description: apiDoc(
      "add_text_box",
      "Puts a text box with the given text on a Keynote slide or a Pages page, copied from a " +
        "text box the document already carries, placed by x, y, width and height in points. " +
        "slide (Keynote) or page (Pages) is 0-based. Saves over the input unless output names " +
        "another path.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_PROP,
        slide: { type: "number", description: "0-based slide index (Keynote)" },
        page: { type: "number", description: "0-based page index (Pages)" },
        text: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
        output: OUTPUT_PROP,
      },
      required: ["path", "text"],
    },
    handler: (args) => {
      const path = requirePath(args);
      const doc = open(path);
      const text = str(args.text);
      if (text === undefined) throw new RangeError("text is required");
      const placement: { x?: number; y?: number; width?: number; height?: number } = {};
      for (const key of ["x", "y", "width", "height"] as const) {
        const value = num(args[key]);
        if (value !== undefined) placement[key] = value;
      }
      if (doc instanceof KeynoteDocument) {
        const index = num(args.slide) ?? 0;
        const slide = doc.slides()[index];
        if (!slide) throw new RangeError(`slide must be 0..${doc.slides().length - 1}`);
        const box = slide.addTextBox(text, placement);
        const target = save(doc, path, str(args.output));
        return `added text box ${box.id} to slide ${index} and saved ${target}`;
      }
      if (doc instanceof PagesDocument) {
        const box = doc.addTextBox(num(args.page) ?? 0, text, placement);
        const target = save(doc, path, str(args.output));
        return `added text box ${box.id} to page ${num(args.page) ?? 0} and saved ${target}`;
      }
      throw new RangeError("add_text_box writes Keynote and Pages documents; this is not one");
    },
  },
  {
    name: "add_table",
    description: apiDoc(
      "add_table",
      "Pages: inline in the body at pos (a character index; omitted means a paragraph of its own at " +
        "the end). Keynote: on slide (0-based), placed by x and y. rows, when given, is an array of " +
        "rows of cell strings that sizes and fills the table (numbers and TRUE/FALSE typed). " +
        "Numbers tables are added with manage_sheets. Saves over the input unless output names " +
        "another path.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_PROP,
        slide: { type: "number", description: "Keynote: 0-based slide index" },
        pos: { type: "number", description: "Pages: body character index to anchor at" },
        name: { type: "string" },
        rows: {
          type: "array",
          items: { type: "array", items: { type: "string" } },
          description: "Cell text by row, the first row the header",
        },
        x: { type: "number" },
        y: { type: "number" },
        output: OUTPUT_PROP,
      },
      required: ["path"],
    },
    handler: (args) => {
      const path = requirePath(args);
      const doc = open(path);
      const rows = Array.isArray(args.rows)
        ? (args.rows as unknown[]).map((row) => (Array.isArray(row) ? row.map((cell) => String(cell)) : [String(row)]))
        : undefined;
      const name = str(args.name);
      if (doc instanceof PagesDocument) {
        const pos = num(args.pos);
        const table =
          pos === undefined
            ? doc.appendTable(rows ?? [], name)
            : doc.insertInlineTable(pos, { ...(rows ? { rows } : {}), ...(name ? { name } : {}) });
        const target = save(doc, path, str(args.output));
        return `added table ${table.name ?? ""} (${table.rowCount}×${table.columnCount}) and saved ${target}`;
      }
      if (doc instanceof KeynoteDocument) {
        const index = num(args.slide) ?? 0;
        const slide = doc.slides()[index];
        if (!slide) throw new RangeError(`slide must be 0..${doc.slides().length - 1}`);
        const options: { rows?: readonly (readonly string[])[]; name?: string; x?: number; y?: number } = {};
        if (rows) options.rows = rows;
        if (name) options.name = name;
        const x = num(args.x);
        const y = num(args.y);
        if (x !== undefined) options.x = x;
        if (y !== undefined) options.y = y;
        const table = slide.addTable(options);
        const target = save(doc, path, str(args.output));
        return `added table ${table.name ?? ""} (${table.rowCount}×${table.columnCount}) to slide ${index} and saved ${target}`;
      }
      throw new RangeError("add_table writes Pages and Keynote documents; Numbers tables are added with manage_sheets");
    },
  },
  {
    name: "add_image",
    description: apiDoc(
      "add_image",
      "file is the picture on disk (PNG, JPEG or PDF). Pages: inline in the body at pos (a character " +
        "index; omitted means the end), with wrap text (the default) or page. Keynote: on slide " +
        "(0-based), placed by x and y, centred when omitted. width, height and maxWidth are points. " +
        "Saves over the input unless output names another path.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_PROP,
        file: { type: "string", description: "Path to the image file" },
        slide: { type: "number", description: "Keynote: 0-based slide index" },
        pos: { type: "number", description: "Pages: body character index (default: end)" },
        wrap: { type: "string", enum: ["text", "page"], description: "Pages: in the text flow or against the page" },
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
        maxWidth: { type: "number" },
        output: OUTPUT_PROP,
      },
      required: ["path", "file"],
    },
    handler: (args) => {
      const path = requirePath(args);
      const file = str(args.file);
      if (!file) throw new RangeError("file is required");
      if (!existsSync(file)) throw new RangeError(`no image at ${file}`);
      const data = new Uint8Array(readFileSync(file));
      const fileName = file.split("/").pop() ?? file;
      const doc = open(path);
      const sizing: { width?: number; height?: number; maxWidth?: number } = {};
      for (const key of ["width", "height", "maxWidth"] as const) {
        const value = num(args[key]);
        if (value !== undefined) sizing[key] = value;
      }
      if (doc instanceof PagesDocument) {
        const wrap = str(args.wrap);
        if (wrap !== undefined && wrap !== "text" && wrap !== "page") throw new RangeError("wrap is text or page");
        const pos = num(args.pos) ?? doc.bodyText.length;
        const { imageId } = doc.insertInlineImage(pos, data, { fileName, ...sizing, ...(wrap ? { wrap } : {}) });
        const target = save(doc, path, str(args.output));
        return `inserted image ${imageId} at ${pos} and saved ${target}`;
      }
      if (doc instanceof KeynoteDocument) {
        const index = num(args.slide) ?? 0;
        if (!doc.slides()[index]) throw new RangeError(`slide must be 0..${doc.slides().length - 1}`);
        const placement: { x?: number; y?: number } = {};
        const x = num(args.x);
        const y = num(args.y);
        if (x !== undefined) placement.x = x;
        if (y !== undefined) placement.y = y;
        const { imageId } = doc.addImage(index, data, { fileName, ...sizing, ...placement });
        const target = save(doc, path, str(args.output));
        return `added image ${imageId} to slide ${index} and saved ${target}`;
      }
      throw new RangeError("add_image writes Pages and Keynote documents; this is not one");
    },
  },
  {
    name: "manage_slides",
    description: apiDoc(
      "manage_slides",
      "Actions: add (copyOf + after, both 0-based slide indexes; or master, a layout's name, " +
        "to instantiate that layout instead — an unknown name's error lists the deck's), " +
        "duplicate (slide), move " +
        "(slide + to), remove (slide), set_size (width + height in points). Keynote " +
        "documents only. Saves over the input unless output names another path.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the .key document" },
        action: {
          type: "string",
          enum: ["add", "duplicate", "move", "remove", "set_size"],
        },
        slide: { type: "number", description: "0-based slide index the action targets" },
        after: { type: "number", description: "add: insert after this index (default: end)" },
        master: { type: "string", description: "add: the layout (master slide) to instantiate, by name" },
        to: { type: "number", description: "move: destination index" },
        width: { type: "number", description: "set_size: points" },
        height: { type: "number", description: "set_size: points" },
        output: OUTPUT_PROP,
      },
      required: ["path", "action"],
    },
    handler: (args) => {
      const path = requirePath(args);
      const doc = open(path);
      if (!(doc instanceof KeynoteDocument)) {
        throw new RangeError("manage_slides edits Keynote documents; this is not one");
      }
      const action = str(args.action);
      const slide = num(args.slide);
      switch (action) {
        case "add":
          doc.addSlide({ copyOf: slide, after: num(args.after) ?? doc.slideCount() - 1, master: str(args.master) });
          break;
        case "duplicate":
          if (slide === undefined) throw new RangeError("duplicate needs slide");
          doc.duplicateSlide(slide);
          break;
        case "move": {
          const to = num(args.to);
          if (slide === undefined || to === undefined) throw new RangeError("move needs slide and to");
          doc.moveSlide(slide, to);
          break;
        }
        case "remove":
          if (slide === undefined) throw new RangeError("remove needs slide");
          doc.removeSlide(slide);
          break;
        case "set_size": {
          const width = num(args.width);
          const height = num(args.height);
          if (width === undefined || height === undefined) {
            throw new RangeError("set_size needs width and height");
          }
          doc.setSlideSize(width, height);
          break;
        }
        default:
          throw new RangeError(`unknown action ${String(action)}`);
      }
      const target = save(doc, path, str(args.output));
      return `${action}: deck now has ${doc.slideCount()} slide(s); saved ${target}`;
    },
  },
  {
    name: "manage_sheets",
    description: apiDoc(
      "manage_sheets",
      "Actions: add_sheet (name?, copyOf?), rename_sheet (sheet + name), move_sheet (sheet " +
        "+ to), remove_sheet (sheet), add_table (sheet + name?) — sheet is a 0-based index; " +
        "use describe_document to see the layout. Numbers documents only. Saves over the " +
        "input unless output names another path.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the .numbers document" },
        action: {
          type: "string",
          enum: ["add_sheet", "rename_sheet", "move_sheet", "remove_sheet", "add_table"],
        },
        sheet: { type: "number", description: "0-based sheet index the action targets" },
        name: { type: "string", description: "add_sheet/rename_sheet/add_table: the name" },
        rows: {
          type: "array",
          items: { type: "array", items: { type: "string" } },
          description: "add_table: cell text by row, the first row the header; sizes and fills the table",
        },
        copyOf: { type: "number", description: "add_sheet: 0-based sheet to copy" },
        to: { type: "number", description: "move_sheet: destination index" },
        output: OUTPUT_PROP,
      },
      required: ["path", "action"],
    },
    handler: (args) => {
      const path = requirePath(args);
      const doc = open(path);
      if (!(doc instanceof NumbersDocument)) {
        throw new RangeError("manage_sheets edits Numbers documents; this is not one");
      }
      const action = str(args.action);
      const sheet = num(args.sheet);
      switch (action) {
        case "add_sheet":
          doc.addSheet({ name: str(args.name), copyOf: num(args.copyOf) });
          break;
        case "rename_sheet": {
          const name = str(args.name);
          if (sheet === undefined || !name) throw new RangeError("rename_sheet needs sheet and name");
          doc.renameSheet(sheet, name);
          break;
        }
        case "move_sheet": {
          const to = num(args.to);
          if (sheet === undefined || to === undefined) {
            throw new RangeError("move_sheet needs sheet and to");
          }
          doc.moveSheet(sheet, to);
          break;
        }
        case "remove_sheet":
          if (sheet === undefined) throw new RangeError("remove_sheet needs sheet");
          doc.removeSheet(sheet);
          break;
        case "add_table": {
          const id = doc.sheets()[sheet ?? 0]?.id;
          if (id === undefined) throw new RangeError(`no sheet at index ${sheet ?? 0}`);
          const table = doc.addTable(id, { name: str(args.name) });
          if (Array.isArray(args.rows)) {
            fillTable(
              table,
              (args.rows as unknown[]).map((row) => (Array.isArray(row) ? row.map((cell) => String(cell)) : [String(row)])),
            );
          }
          break;
        }
        default:
          throw new RangeError(`unknown action ${String(action)}`);
      }
      const target = save(doc, path, str(args.output));
      return `${action}: document now has ${doc.sheets().length} sheet(s); saved ${target}`;
    },
  },
  {
    name: "set_page_setup",
    description: apiDoc(
      "set_page_setup",
      "All values are points; only the fields given change. orientation: 0 portrait, 1 " +
        "landscape. Pages documents only. Saves over the input unless output names another " +
        "path.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the .pages document" },
        pageWidth: { type: "number" },
        pageHeight: { type: "number" },
        leftMargin: { type: "number" },
        rightMargin: { type: "number" },
        topMargin: { type: "number" },
        bottomMargin: { type: "number" },
        headerMargin: { type: "number" },
        footerMargin: { type: "number" },
        orientation: { type: "number", enum: [0, 1] },
        output: OUTPUT_PROP,
      },
      required: ["path"],
    },
    handler: (args) => {
      const path = requirePath(args);
      const doc = pagesDocument(open(path), "set_page_setup");
      const fields = [
        "pageWidth", "pageHeight", "leftMargin", "rightMargin", "topMargin",
        "bottomMargin", "headerMargin", "footerMargin", "orientation",
      ] as const;
      const update: Record<string, number> = {};
      for (const field of fields) {
        const value = num(args[field]);
        if (value !== undefined) update[field] = value;
      }
      if (Object.keys(update).length === 0) {
        throw new RangeError("nothing to set; pass at least one page-setup field");
      }
      doc.setPageSetup(update);
      const target = save(doc, path, str(args.output));
      return `updated ${Object.keys(update).join(", ")} and saved ${target}`;
    },
  },
  {
    name: "set_cell_format",
    description: apiDoc(
      "set_cell_format",
      "The format object: { kind: \"number\" | \"percentage\" | \"currency\" | \"date\" | " +
        "\"duration\" | \"text\" | \"boolean\", ... } — currency takes code (e.g. \"EUR\"), " +
        "date takes pattern (e.g. \"d MMM yyyy\"), numeric kinds take decimalPlaces and " +
        "thousandsSeparator. 0-based coordinates; rowCount/columnCount default 1. Saves " +
        "over the input unless output names another path.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_PROP,
        table: TABLE_PROP,
        row: { type: "number", description: "0-based first row" },
        column: { type: "number", description: "0-based first column" },
        rowCount: { type: "number", description: "Rows in the block, default 1" },
        columnCount: { type: "number", description: "Columns in the block, default 1" },
        format: {
          type: "object",
          description: "A CellFormat: kind plus its options (see the tool description)",
        },
        output: OUTPUT_PROP,
      },
      required: ["path", "row", "column", "format"],
    },
    handler: (args) => {
      const path = requirePath(args);
      const doc = open(path);
      const table = tableIn(doc, str(args.table));
      const row = num(args.row);
      const column = num(args.column);
      const format = args.format;
      if (row === undefined || column === undefined || typeof format !== "object" || !format) {
        throw new RangeError("row, column and format are required");
      }
      table.setRangeFormat(
        row,
        column,
        Math.max(1, num(args.rowCount) ?? 1),
        Math.max(1, num(args.columnCount) ?? 1),
        format as CellFormat,
      );
      const target = save(doc, path, str(args.output));
      return `formatted the block at r${row}c${column} of ${JSON.stringify(table.name ?? "")} and saved ${target}`;
    },
  },
  {
    name: "add_category",
    description: apiDoc(
      "add_category",
      "Groups the table's rows by the values in one 0-based column: one group per distinct " +
        "value in text order, switched on; with bucket (year, yearAndMonth, yearAndQuarter, " +
        "yearAndWeek, day, weekday) a date column is grouped by that period instead. The table " +
        "must not be categorised already, and every data row needs a value in the column. Saves " +
        "over the input unless output names another path.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_PROP,
        table: TABLE_PROP,
        column: { type: "number", description: "0-based column to group by" },
        bucket: {
          type: "string",
          description: "For a date column: year, yearAndMonth, yearAndQuarter, yearAndWeek, day or weekday",
        },
        output: OUTPUT_PROP,
      },
      required: ["path", "column"],
    },
    handler: (args) => {
      const path = requirePath(args);
      const doc = open(path);
      const table = tableIn(doc, str(args.table));
      const column = num(args.column);
      if (column === undefined) throw new RangeError("column is required");
      const bucket = str(args.bucket);
      const buckets = ["year", "yearAndMonth", "yearAndQuarter", "yearAndWeek", "day", "weekday"];
      if (bucket !== undefined && !buckets.includes(bucket)) {
        throw new RangeError(`bucket must be one of ${buckets.join(", ")}`);
      }
      const category = table.addCategory(
        bucket === undefined ? column : [{ column, bucket: bucket as DateBucket }],
      );
      const target = save(doc, path, str(args.output));
      return `grouped by column ${column} into ${category.groups().length} groups and saved ${target}`;
    },
  },
  {
    name: "add_filter_rule",
    description: apiDoc(
      "add_filter_rule",
      "Adds a row-filter rule to the table: show rows whose cell in the 0-based column compares " +
        "to value as operator says (=, <>, <, <=, >, >=; value a number or a string), and switches " +
        "the filter on. Which rows it hides is the app's to recompute. Saves over the input " +
        "unless output names another path.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_PROP,
        table: TABLE_PROP,
        column: { type: "number", description: "0-based column the rule applies to" },
        operator: { type: "string", description: "One of =, <>, <, <=, >, >=" },
        value: { description: "A number or a string to compare the cell with" },
        output: OUTPUT_PROP,
      },
      required: ["path", "column", "operator", "value"],
    },
    handler: (args) => {
      const path = requirePath(args);
      const doc = open(path);
      const table = tableIn(doc, str(args.table));
      const column = num(args.column);
      const operator = str(args.operator);
      const value = args.value;
      if (column === undefined || operator === undefined || (typeof value !== "number" && typeof value !== "string")) {
        throw new RangeError("column, operator and a number or string value are required");
      }
      if (!["=", "<>", "<", "<=", ">", ">="].includes(operator)) throw new RangeError(`operator must be one of =, <>, <, <=, >, >=`);
      const index = table.addFilterRule(column, { operator: operator as "=" | "<>" | "<" | "<=" | ">" | ">=", value });
      const target = save(doc, path, str(args.output));
      return `added filter rule ${index} on column ${column} and saved ${target}`;
    },
  },
  {
    name: "insert_link",
    description: apiDoc(
      "insert_link",
      "This tool finds the first occurrence of the phrase in the body and links that range. " +
        "Pages documents only. Saves over the input unless output names another path.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the .pages document" },
        find: { type: "string", description: "The phrase to turn into a link (first occurrence)" },
        url: { type: "string", description: "The link target, e.g. https://example.com" },
        output: OUTPUT_PROP,
      },
      required: ["path", "find", "url"],
    },
    handler: (args) => {
      const path = requirePath(args);
      const find = str(args.find);
      const url = str(args.url);
      if (!find || !url) throw new RangeError("find and url are required");
      const doc = pagesDocument(open(path), "insert_link");
      const at = doc.body.text.indexOf(find);
      if (at < 0) throw new RangeError(`the body does not contain ${JSON.stringify(find)}`);
      doc.insertLink(at, at + find.length, url);
      const target = save(doc, path, str(args.output));
      return `linked ${JSON.stringify(find)} to ${url} and saved ${target}`;
    },
  },
  {
    name: "set_table_bands",
    description: apiDoc(
      "set_table_bands",
      "Header/footer counts plus freeze and repeat toggles, any subset. Saves over the " +
        "input unless output names another path.",
    ),
    inputSchema: {
      type: "object",
      properties: {
        path: PATH_PROP,
        table: TABLE_PROP,
        headerRows: { type: "number" },
        headerColumns: { type: "number" },
        footerRows: { type: "number" },
        freezeHeaderRows: { type: "boolean" },
        freezeHeaderColumns: { type: "boolean" },
        repeatHeaderRows: { type: "boolean" },
        repeatHeaderColumns: { type: "boolean" },
        output: OUTPUT_PROP,
      },
      required: ["path"],
    },
    handler: (args) => {
      const path = requirePath(args);
      const doc = open(path);
      const table = tableIn(doc, str(args.table));
      const bands: Record<string, number | boolean> = {};
      for (const field of ["headerRows", "headerColumns", "footerRows"] as const) {
        const value = num(args[field]);
        if (value !== undefined) bands[field] = value;
      }
      for (const field of [
        "freezeHeaderRows", "freezeHeaderColumns", "repeatHeaderRows", "repeatHeaderColumns",
      ] as const) {
        if (typeof args[field] === "boolean") bands[field] = args[field];
      }
      if (Object.keys(bands).length === 0) {
        throw new RangeError("nothing to set; pass at least one band field");
      }
      table.setBands(bands);
      const target = save(doc, path, str(args.output));
      return `updated ${Object.keys(bands).join(", ")} on ${JSON.stringify(table.name ?? "")} and saved ${target}`;
    },
  },
];

function pagesDocument(doc: AnyDocument, tool: string): PagesDocument {
  if (!(doc instanceof PagesDocument)) {
    throw new RangeError(`${tool} writes Pages documents; this is not one`);
  }
  return doc;
}

// ------------------------------------------------------------------- protocol

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
}

function send(message: object): void {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function reply(id: number | string | null, result: object): void {
  send({ jsonrpc: "2.0", id, result });
}

function replyError(id: number | string | null, code: number, message: string): void {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function handle(request: JsonRpcRequest): void {
  const { id, method, params } = request;
  const isNotification = id === undefined;
  switch (method) {
    case "initialize": {
      const requested = params?.protocolVersion;
      reply(id ?? null, {
        protocolVersion: typeof requested === "string" ? requested : PROTOCOL_FALLBACK,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      });
      return;
    }
    case "notifications/initialized":
    case "notifications/cancelled":
      return;
    case "ping":
      reply(id ?? null, {});
      return;
    case "tools/list":
      reply(id ?? null, {
        tools: TOOLS.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      });
      return;
    case "tools/call": {
      const name = params?.name;
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) {
        replyError(id ?? null, -32602, `unknown tool: ${String(name)}`);
        return;
      }
      const args = (params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const text = tool.handler(args);
        reply(id ?? null, { content: [{ type: "text", text }] });
      } catch (error) {
        // A failed tool call is a *result*, not a protocol error — the
        // model is meant to read the message and adjust.
        reply(id ?? null, {
          content: [{ type: "text", text: (error as Error).message }],
          isError: true,
        });
      }
      return;
    }
    default:
      if (!isNotification) {
        replyError(id ?? null, -32601, `method not found: ${String(method)}`);
      }
  }
}

/** Run the server until stdin closes. */
export function serve(): void {
  const lines = createInterface({ input: process.stdin, terminal: false });
  lines.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let request: JsonRpcRequest;
    try {
      request = JSON.parse(trimmed) as JsonRpcRequest;
    } catch {
      replyError(null, -32700, "parse error");
      return;
    }
    try {
      handle(request);
    } catch (error) {
      // A handler bug must not kill the transport.
      console.error(`cupertino-files mcp: ${(error as Error).stack ?? String(error)}`);
      if (request.id !== undefined) {
        replyError(request.id ?? null, -32603, (error as Error).message);
      }
    }
  });
  lines.on("close", () => process.exit(0));
  console.error(`cupertino-files mcp server ${SERVER_INFO.version} ready (stdio)`);
}
