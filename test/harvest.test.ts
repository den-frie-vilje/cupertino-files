/**
 * The function-index harvester (scripts/harvest-functions.ts).
 *
 * The harvest itself needs a Mac, but its *logic* — build a probe sheet,
 * read a saved document back, reject anything that is not a genuine probe
 * row — is testable anywhere by synthesizing a document shaped the way
 * Numbers would leave one. That matters more than usual here: a harvest
 * that misattributes a name writes a wrong answer into a checked-in table
 * that everything downstream then trusts.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "./harness.ts";
import { NumbersDocument } from "../src/index.ts";
import { CellFlag, CellRecord, CellType } from "../src/tst/cellrecord.ts";
import { RawMessage } from "../src/base/protobuf.ts";
import { refId } from "../src/tsp/schema.ts";

const script = fileURLToPath(new URL("../scripts/harvest-functions.ts", import.meta.url));
const FIXTURES = new URL("../fixtures/", import.meta.url);
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));

interface HarvestResult {
  functions: Record<string, string>;
  unrecognised: string[];
  conflicts: { name: string; indexes: number[] }[];
}

function run(args: string[]): string {
  return execFileSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

/**
 * Forge a document shaped like a saved probe sheet.
 *
 * Column A the function name, B the variant label, C a cell whose record
 * points at a formula whose AST calls `index`. That is exactly what Numbers
 * leaves behind, minus the several hundred rows.
 */
function forgeProbeDocument(
  entries: readonly { name: string; variant: string; index: number }[],
): Uint8Array {
  const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
  const table = doc.tables()[0]!;
  const formulaList = doc.store.resolve(refId(table.object.message.getMessage(4), 6))!;

  entries.forEach((entry, i) => {
    const row = i + 1;
    const nodes = RawMessage.create();
    const operand = RawMessage.create();
    operand.setVarint(1, 17); // NUMBER_NODE
    operand.setDouble(4, 1);
    const call = RawMessage.create();
    call.setVarint(1, 16); // FUNCTION_NODE
    call.setVarint(2, entry.index);
    call.setVarint(3, 1);
    nodes.addMessage(1, operand);
    nodes.addMessage(1, call);
    const formula = RawMessage.create();
    formula.setMessage(1, nodes);

    const key = formulaList.message.getUint(2) ?? 500;
    const listEntry = RawMessage.create();
    listEntry.setVarint(1, key);
    listEntry.setVarint(2, 1);
    listEntry.setMessage(5, formula);
    formulaList.message.addMessage(3, listEntry);
    formulaList.message.setVarint(2, key + 1);

    table.setCell(row, 0, { type: "text", value: entry.name });
    table.setCell(row, 1, { type: "text", value: entry.variant });
    table.setCell(row, 2, { type: "number", value: 1 });
    attachFormula(table, row, 2, key);
  });
  return doc.save();
}

/** Point an existing cell record at a formula id. */
function attachFormula(
  table: { formulaId(r: number, c: number): number | undefined },
  row: number,
  column: number,
  key: number,
): void {
  const model = table as unknown as {
    locateRow(r: number): { rowInfo: RawMessage } | undefined;
    columnCount: number;
  };
  const rowInfo = model.locateRow(row)!.rowInfo;
  const buffer = rowInfo.getBytes(6)!;
  const rawOffsets = rowInfo.getBytes(7)!;
  const offsets: number[] = [];
  for (let i = 0; i + 1 < rawOffsets.length; i += 2) {
    const v = rawOffsets[i]! | (rawOffsets[i + 1]! << 8);
    offsets.push(v >= 0x8000 ? v - 0x10000 : v);
  }
  const boundary = (c: number): number => {
    for (let n = c + 1; n < offsets.length; n++) if (offsets[n]! >= 0) return offsets[n]!;
    return buffer.length;
  };
  const records: (Uint8Array | undefined)[] = offsets.map((start, c) =>
    start < 0 ? undefined : buffer.slice(start, boundary(c)),
  );
  const record = CellRecord.decode(records[column]!);
  record.setId(CellFlag.FORMULA_ID, key);
  record.type = CellType.NUMBER;
  records[column] = record.encode();

  const out: number[] = [];
  const newOffsets = new Int16Array(offsets.length).fill(-1);
  records.forEach((bytes, c) => {
    if (!bytes) return;
    newOffsets[c] = out.length;
    out.push(...bytes);
  });
  rowInfo.setBytes(6, new Uint8Array(out));
  rowInfo.setBytes(7, new Uint8Array(newOffsets.buffer.slice(0)));
}

describe("function-index harvester", () => {
  it("builds a probe sheet Numbers can open directly", () => {
    const dir = mkdtempSync(join(tmpdir(), "iwork-harvest-"));
    try {
      const path = join(dir, "probe.tsv");
      run(["--emit-sheet", path]);
      const sheet = readFileSync(path, "utf8");
      const lines = sheet.trim().split("\n");

      // Tab-separated on purpose: half the formulas contain argument
      // commas, and delimiter-quoting them would make it a coin flip
      // whether Numbers reads a cell as a formula or as text. Quotes do
      // appear — inside formulas, as string literals — but never wrapping
      // a field.
      expect(lines[0]!.includes("\t")).toBe(true);
      const withCommas = lines.filter((l) => l.split("\t")[2]?.includes(","));
      expect(withCommas.length).toBeGreaterThan(0);
      for (const line of withCommas) {
        expect(line.split("\t")[2]!.startsWith('"')).toBe(false);
      }
      // Sample data for the range variant lives in the header row.
      expect(lines[0]!.split("\t").slice(4)).toEqual(["1", "2", "3"]);
      // Every probe row is name / variant / formula.
      const body = lines.slice(1);
      expect(body.length).toBeGreaterThan(1000);
      for (const line of body.slice(0, 20)) {
        const [name, variant, formula] = line.split("\t");
        expect(formula!.startsWith(`=${name}(`)).toBe(true);
        expect(variant!.length).toBeGreaterThan(0);
      }
      // Several argument shapes per candidate, since an errored formula
      // still records its function node.
      const first = body[0]!.split("\t")[0];
      expect(body.filter((l) => l.startsWith(`${first}\t`)).length).toBeGreaterThan(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("recovers names and indexes from a saved probe document", () => {
    const dir = mkdtempSync(join(tmpdir(), "iwork-harvest-"));
    try {
      const path = join(dir, "harvest.numbers");
      writeFileSync(
        path,
        forgeProbeDocument([
          { name: "ABS", variant: "num", index: 901 },
          { name: "MEDIAN", variant: "range", index: 902 },
        ]),
      );
      const result = JSON.parse(run(["--ingest", path, "--dry-run"])) as HarvestResult;
      expect(result.functions["901"]).toBe("ABS");
      expect(result.functions["902"]).toBe("MEDIAN");
      expect(result.conflicts).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores rows that are not genuine probe rows", () => {
    // The failure that motivated the guard: run against a document holding
    // any other table and the ingest cheerfully attributed that table's
    // formulas to whatever text sat in its first column — recording the
    // SUM index as a function called "TOTAL:".
    const dir = mkdtempSync(join(tmpdir(), "iwork-harvest-"));
    try {
      const path = join(dir, "contaminated.numbers");
      // The base fixture already contains a "TOTAL:" row with a real SUM
      // formula, and no variant labels anywhere.
      writeFileSync(path, fixture("numbers-parser-v14.4-issue102.numbers"));
      const result = JSON.parse(run(["--ingest", path, "--dry-run"])) as HarvestResult;
      expect(result.functions).toEqual({});
      expect(Object.values(result.functions).includes("TOTAL:")).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a name whose observations disagree", () => {
    const dir = mkdtempSync(join(tmpdir(), "iwork-harvest-"));
    try {
      const path = join(dir, "conflict.numbers");
      writeFileSync(
        path,
        forgeProbeDocument([
          { name: "ABS", variant: "num", index: 901 },
          { name: "ABS", variant: "range", index: 902 },
        ]),
      );
      const result = JSON.parse(run(["--ingest", path, "--dry-run"])) as HarvestResult;
      // One name, two indexes: trust neither, and say so.
      expect(result.functions["901"]).toBe(undefined);
      expect(result.functions["902"]).toBe(undefined);
      expect(result.conflicts.length).toBe(1);
      expect(result.conflicts[0]!.name).toBe("ABS");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses two names claiming one index", () => {
    const dir = mkdtempSync(join(tmpdir(), "iwork-harvest-"));
    try {
      const path = join(dir, "collide.numbers");
      writeFileSync(
        path,
        forgeProbeDocument([
          { name: "ABS", variant: "num", index: 901 },
          { name: "MEDIAN", variant: "num", index: 901 },
        ]),
      );
      const result = JSON.parse(run(["--ingest", path, "--dry-run"])) as HarvestResult;
      expect(result.functions["901"]).toBe(undefined);
      expect(result.conflicts.length).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps every candidate name plausible", () => {
    // Wrong names are harmless — Numbers reports them as unrecognised — but
    // lower-case or punctuated entries would be silently dropped by the
    // ingest's own filter, which is worse than being told.
    const candidates = readFileSync(
      fileURLToPath(new URL("../data/numbers-function-candidates.txt", import.meta.url)),
      "utf8",
    )
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
    expect(candidates.length).toBeGreaterThan(100);
    for (const name of candidates) expect(/^[A-Z][A-Z0-9.]*$/.test(name)).toBe(true);
    expect(new Set(candidates).size).toBe(candidates.length);
  });
});
