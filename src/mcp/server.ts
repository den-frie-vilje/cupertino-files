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
import { chartsOf } from "../tsch/charts.ts";

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
      "Saves over the input unless output names another path.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the .pages document" },
        text: { type: "string", description: "Paragraph text" },
        output: { type: "string", description: "Save here instead of over the input" },
      },
      required: ["path", "text"],
    },
    handler: (args) => {
      const path = requirePath(args);
      const text = str(args.text);
      if (!text) throw new RangeError("text is required");
      const doc = open(path);
      if (!(doc instanceof PagesDocument)) {
        throw new RangeError("append_paragraph writes Pages documents; this is not one");
      }
      doc.appendParagraph(text);
      const target = save(doc, path, str(args.output));
      return `appended one paragraph and saved ${target}`;
    },
  },
];

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
