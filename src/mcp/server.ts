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
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { IWorkDocument } from "../tsa/document.ts";
import { PagesDocument } from "../pages/document.ts";
import { NumbersDocument } from "../numbers/document.ts";
import { KeynoteDocument } from "../keynote/document.ts";
import { tablesOf, type TableModel } from "../tst/tables.ts";
import { allBorders, type CellFormatting } from "../tst/styles.ts";
import { chartsOf } from "../tsch/charts.ts";
import { hexColor, solidStroke, type Fill } from "../tsd/style.ts";
import type { CharacterFormatting } from "../tss/stylesheet.ts";

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

interface Tool {
  name: string;
  description: string;
  inputSchema: object;
  handler: (args: Record<string, unknown>) => string;
}

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);

function requirePath(args: Record<string, unknown>): string {
  const path = str(args.path);
  if (!path) throw new RangeError("path is required");
  return path;
}

const TOOLS: Tool[] = [
  {
    name: "describe_document",
    description:
      "Summarize an Apple Pages, Numbers or Keynote document (.pages/.numbers/.key, modern " +
      "IWA format): which app wrote it, its tables with dimensions and formula/merge counts, " +
      "slides, text length and charts. Start here to learn a document's shape before reading " +
      "or editing it.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Path to the document" } },
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
      }
      if (doc instanceof PagesDocument) {
        out.bodyTextLength = doc.body.text.length;
      }
      return JSON.stringify(out, null, 2);
    },
  },
  {
    name: "read_text",
    description:
      "Extract the text of a document: a Pages file's body, or a Keynote deck's titles, " +
      "bodies and presenter notes per slide. For Numbers, use read_table instead.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Path to the document" } },
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
        path: { type: "string", description: "Path to the document" },
        table: {
          type: "string",
          description: "Table name; may be omitted when the document has exactly one table",
        },
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
    name: "list_formulas",
    description:
      "List every formula in a table (or in all tables when none is named), with its 0-based " +
      "row and column and its rendered text, e.g. =SUM(C3:K6).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the document" },
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
    name: "set_cells",
    description:
      "Write values into table cells and save the document. Rows and columns are 0-based; " +
      "values may be strings, numbers, booleans, or null to clear. Presentation the cells " +
      "already carry (styles, number formats, comments) is preserved. Saves over the input " +
      "unless output names another path.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the document" },
        table: {
          type: "string",
          description: "Table name; may be omitted when the document has exactly one table",
        },
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
        output: { type: "string", description: "Save here instead of over the input" },
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
    description:
      "Write a formula into a table cell and save the document. The formula is infix text " +
      "like =SUM(A1:A5) or =Other::B2 (0-based row/column address the cell, the formula text " +
      "uses ordinary A1 references). Nothing evaluates: pass cachedValue so the cell displays " +
      "correctly until an app recalculates. Saves over the input unless output is given.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the document" },
        table: {
          type: "string",
          description: "Table name; may be omitted when the document has exactly one table",
        },
        row: { type: "number", description: "0-based row" },
        column: { type: "number", description: "0-based column" },
        formula: { type: "string", description: "Infix formula text, e.g. =A1*2" },
        cachedValue: { description: "Value the cell shows until recalculation" },
        output: { type: "string", description: "Save here instead of over the input" },
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
    name: "append_paragraph",
    description:
      "Append a paragraph of text to the end of a Pages document's body and save it. " +
      "Optionally apply a named paragraph style, e.g. \"Heading 1\". Saves over the input " +
      "unless output names another path.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the .pages document" },
        text: { type: "string", description: "Paragraph text" },
        style: { type: "string", description: "Named paragraph style, e.g. \"Heading 1\"" },
        output: { type: "string", description: "Save here instead of over the input" },
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
    description:
      "Find and replace text throughout a Pages document's body, preserving the styling of " +
      "the surrounding text, and save it. Returns how many occurrences changed. Saves over " +
      "the input unless output names another path.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the .pages document" },
        find: { type: "string", description: "Exact text to find" },
        replace: { type: "string", description: "Replacement text" },
        output: { type: "string", description: "Save here instead of over the input" },
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
    description:
      "Apply character formatting — bold, italic, font size, font name, font color — to the " +
      "first occurrence of a phrase in a Pages document's body, and save it. Colors are hex " +
      "like #cc0000. Saves over the input unless output names another path.",
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
        output: { type: "string", description: "Save here instead of over the input" },
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
    description:
      "Format a rectangular block of table cells — background fill, borders, vertical " +
      "alignment, text wrap — and save the document. Rows and columns are 0-based; rowCount " +
      "and columnCount default to 1. Colors are hex like #f5f5f0; borders take a hex color " +
      "and a width in points. Cell values are untouched. Saves over the input unless output " +
      "names another path.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the document" },
        table: {
          type: "string",
          description: "Table name; may be omitted when the document has exactly one table",
        },
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
        output: { type: "string", description: "Save here instead of over the input" },
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
        formatting.fill = { kind: "color", color: hexColor(str(args.fill)!) } as Fill;
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
    description:
      "Merge a rectangle of table cells, anchored at its top-left, and save the document. " +
      "The anchor's value survives; covered cells are discarded, exactly as merging does in " +
      "the app. Rows and columns are 0-based. Saves over the input unless output is given. " +
      "To split a merge instead, call with rowCount and columnCount omitted and unmerge true.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the document" },
        table: {
          type: "string",
          description: "Table name; may be omitted when the document has exactly one table",
        },
        row: { type: "number", description: "0-based anchor row" },
        column: { type: "number", description: "0-based anchor column" },
        rowCount: { type: "number", description: "Rows to span (≥1; with columnCount > 1×1)" },
        columnCount: { type: "number", description: "Columns to span" },
        unmerge: { type: "boolean", description: "Remove the merge anchored here instead" },
        output: { type: "string", description: "Save here instead of over the input" },
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
    description:
      "Insert or delete table rows or columns, or set a column's width, and save the " +
      "document. Actions: insert_rows, delete_rows, insert_columns, delete_columns (with at " +
      "and count, both 0-based), set_column_width (with at and width in points). Cells keep " +
      "their formatting; formulas and merges shift with the grid. Saves over the input " +
      "unless output names another path.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the document" },
        table: {
          type: "string",
          description: "Table name; may be omitted when the document has exactly one table",
        },
        action: {
          type: "string",
          enum: ["insert_rows", "delete_rows", "insert_columns", "delete_columns", "set_column_width"],
        },
        at: { type: "number", description: "0-based row or column position" },
        count: { type: "number", description: "How many, default 1" },
        width: { type: "number", description: "Points, for set_column_width" },
        output: { type: "string", description: "Save here instead of over the input" },
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
        output: { type: "string", description: "Save here instead of over the input" },
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
