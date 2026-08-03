/**
 * The MCP server, tested the way a client uses it: spawned as a process,
 * spoken to over stdio in newline-delimited JSON-RPC, through the full
 * handshake and into tool calls — including a write that saves a real
 * document and a failed call that must come back as a tool *result*, not
 * a dead transport.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { describe, expect, it } from "./harness.ts";
import { NumbersDocument } from "../src/index.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const SERVER = new URL("../src/main.ts", import.meta.url).pathname;

interface Pending {
  resolve: (value: Record<string, unknown>) => void;
  reject: (reason: Error) => void;
}

/** A minimal MCP client: one request in flight per id, promises out. */
class Client {
  private readonly child: ChildProcess;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;

  constructor() {
    this.child = spawn(process.execPath, ["--experimental-strip-types", SERVER, "mcp"], {
      stdio: ["pipe", "pipe", "ignore"],
    });
    const lines = createInterface({ input: this.child.stdout! });
    lines.on("line", (line) => {
      const message = JSON.parse(line) as { id?: number; result?: object; error?: { message: string } };
      if (message.id === undefined) return;
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve((message.result ?? {}) as Record<string, unknown>);
    });
  }

  request(method: string, params?: object): Promise<Record<string, unknown>> {
    const id = this.nextId++;
    const frame = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timed out waiting for ${method}`));
      }, 30_000);
      const settled = { resolve, reject };
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          settled.resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          settled.reject(e);
        },
      });
      this.child.stdin!.write(frame);
    });
  }

  notify(method: string): void {
    this.child.stdin!.write(JSON.stringify({ jsonrpc: "2.0", method }) + "\n");
  }

  close(): void {
    this.child.stdin!.end();
    this.child.kill();
  }
}

/** One tool call, unwrapping the text content and the error flag. */
async function call(
  client: Client,
  name: string,
  args: object,
): Promise<{ text: string; isError: boolean }> {
  const result = await client.request("tools/call", { name, arguments: args });
  const content = result.content as { type: string; text: string }[];
  return { text: content.map((c) => c.text).join("\n"), isError: result.isError === true };
}

describe("the MCP server over stdio", () => {
  it("shakes hands, lists tools, reads and writes documents", async () => {
    const client = new Client();
    try {
      const init = await client.request("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "suite", version: "0" },
      });
      expect(init.protocolVersion).toBe("2025-06-18");
      expect((init.serverInfo as { name: string }).name).toBe("cupertino-files");
      client.notify("notifications/initialized");

      const listed = await client.request("tools/list");
      const names = (listed.tools as { name: string }[]).map((t) => t.name).sort();
      expect(names).toEqual([
        "append_paragraph",
        "describe_document",
        "list_formulas",
        "read_table",
        "read_text",
        "set_cells",
        "set_formula",
      ]);
      // Every tool must say what it is — the descriptions are the UI.
      for (const tool of listed.tools as { description: string }[]) {
        expect(tool.description.length > 60).toBe(true);
      }

      // A read: the star fixture's shape, through the wire.
      const fixture = new URL("numbers-parser-v26.0-issue102.numbers", FIXTURES).pathname;
      const described = await call(client, "describe_document", { path: fixture });
      expect(described.isError).toBe(false);
      const summary = JSON.parse(described.text) as {
        kind: string;
        tables: { name: string; formulas: number; merges: number }[];
      };
      expect(summary.kind).toBe("numbers");
      expect(summary.tables.some((t) => t.name === "Cats" && t.merges === 4)).toBe(true);

      const formulas = await call(client, "list_formulas", { path: fixture, table: "Cats" });
      expect(formulas.text).toContain("=SUM(C3:K6)");

      // A write round trip: edit a copy, read it back with the library.
      const dir = mkdtempSync(join(tmpdir(), "cupertino-mcp-"));
      const copy = join(dir, "copy.numbers");
      writeFileSync(copy, readFileSync(fixture));
      const written = await call(client, "set_cells", {
        path: copy,
        table: "Cats",
        cells: [{ row: 2, column: 2, value: 250 }],
      });
      expect(written.isError).toBe(false);
      const reread = NumbersDocument.load(new Uint8Array(readFileSync(copy)));
      expect(reread.tables().find((t) => t.name === "Cats")!.cellText(2, 2)).toBe("250");

      // A failure must be a result the model can read, not a dead server.
      const missing = await call(client, "read_table", { path: fixture, table: "Nope" });
      expect(missing.isError).toBe(true);
      expect(missing.text).toContain("no table named");
      const after = await call(client, "describe_document", { path: fixture });
      expect(after.isError).toBe(false);
    } finally {
      client.close();
    }
  });
});
