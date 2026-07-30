import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import {
  cellValueToString,
  decodeCellRecord,
  decodeDecimal128,
  NumbersDocument,
  PagesDocument,
  type CellValue,
} from "../src/index.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));

/** Build a v5 cell record per docs/FORMAT.md §14 / research/numbers-cells.md §2. */
function v5Record(cellType: number, fields: { flag: number; bytes: Uint8Array }[]): Uint8Array {
  const sorted = [...fields].sort((a, b) => a.flag - b.flag);
  let flags = 0;
  let payloadLength = 0;
  for (const f of sorted) {
    flags |= f.flag;
    payloadLength += f.bytes.length;
  }
  const out = new Uint8Array(12 + payloadLength);
  const view = new DataView(out.buffer);
  out[0] = 5;
  out[1] = cellType;
  view.setUint32(8, flags >>> 0, true);
  let pos = 12;
  for (const f of sorted) {
    out.set(f.bytes, pos);
    pos += f.bytes.length;
  }
  return out;
}

function f64(value: number): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, value, true);
  return b;
}

function u32(value: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, value, true);
  return b;
}

/** Encode a decimal128 with the biased-exponent layout the format uses. */
function decimal128(mantissa: bigint, exponent: number): Uint8Array {
  const b = new Uint8Array(16);
  let m = mantissa < 0n ? -mantissa : mantissa;
  for (let i = 0; i < 14; i++) {
    b[i] = Number(m & 0xffn);
    m >>= 8n;
  }
  const biased = exponent + 0x1820;
  b[14] = (b[14]! & 0x01) | ((biased & 0x7f) << 1);
  b[15] = ((biased >> 7) & 0x7f) | (mantissa < 0n ? 0x80 : 0);
  return b;
}

const NO_STRINGS = new Map<number, string>();

describe("TST cell record decoding", () => {
  it("decodes an empty cell", () => {
    const record = new Uint8Array([5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(decodeCellRecord(record, NO_STRINGS, NO_STRINGS).type).toBe("empty");
  });

  it("decodes numbers via decimal128", () => {
    for (const [mantissa, exponent, expected] of [
      [1234n, 0, 1234],
      [1234n, -2, 12.34],
      [-5n, 0, -5],
      [0n, 0, 0],
      [125n, -1, 12.5],
    ] as const) {
      const record = v5Record(2, [{ flag: 0x1, bytes: decimal128(mantissa, exponent) }]);
      const value = decodeCellRecord(record, NO_STRINGS, NO_STRINGS);
      expect(value.type).toBe("number");
      expect((value as { value: number }).value).toBe(expected);
    }
  });

  it("round-trips decimal128 encoding", () => {
    expect(decodeDecimal128(decimal128(99999n, -3))).toBe(99.999);
    expect(decodeDecimal128(decimal128(-42n, 1))).toBe(-420);
  });

  it("decodes text through the string table", () => {
    const strings = new Map([[7, "Hello"]]);
    const record = v5Record(3, [{ flag: 0x8, bytes: u32(7) }]);
    const value = decodeCellRecord(record, strings, NO_STRINGS);
    expect(value.type).toBe("text");
    expect((value as { value: string }).value).toBe("Hello");
    // Missing keys degrade to "" rather than throwing.
    const missing = decodeCellRecord(v5Record(3, [{ flag: 0x8, bytes: u32(99) }]), strings, NO_STRINGS);
    expect((missing as { value: string }).value).toBe("");
  });

  it("decodes rich text through the payload table", () => {
    const rich = new Map([[3, "Rich content"]]);
    const record = v5Record(9, [{ flag: 0x10, bytes: u32(3) }]);
    const value = decodeCellRecord(record, NO_STRINGS, rich);
    expect(value.type).toBe("richText");
    expect((value as { value: string }).value).toBe("Rich content");
  });

  it("decodes dates against the 2001 epoch", () => {
    const record = v5Record(5, [{ flag: 0x4, bytes: f64(0) }]);
    const value = decodeCellRecord(record, NO_STRINGS, NO_STRINGS) as { value: Date };
    expect(value.value.toISOString()).toBe("2001-01-01T00:00:00.000Z");
    const later = decodeCellRecord(v5Record(5, [{ flag: 0x4, bytes: f64(86400) }]), NO_STRINGS, NO_STRINGS);
    expect((later as { value: Date }).value.toISOString()).toBe("2001-01-02T00:00:00.000Z");
  });

  it("decodes booleans and durations", () => {
    const t = decodeCellRecord(v5Record(6, [{ flag: 0x2, bytes: f64(1) }]), NO_STRINGS, NO_STRINGS);
    expect((t as { value: boolean }).value).toBe(true);
    const f = decodeCellRecord(v5Record(6, [{ flag: 0x2, bytes: f64(0) }]), NO_STRINGS, NO_STRINGS);
    expect((f as { value: boolean }).value).toBe(false);
    const d = decodeCellRecord(v5Record(7, [{ flag: 0x2, bytes: f64(3600) }]), NO_STRINGS, NO_STRINGS);
    expect(d.type).toBe("duration");
    expect((d as { seconds: number }).seconds).toBe(3600);
  });

  it("skips unmodelled optional fields in ascending bit order", () => {
    // A formula cell whose cached value is a number, carrying style, format
    // and formula ids around the value — the walk must stay aligned.
    const record = v5Record(2, [
      { flag: 0x1, bytes: decimal128(4200n, -2) },
      { flag: 0x20, bytes: u32(11) }, // cell_style_id
      { flag: 0x40, bytes: u32(12) }, // text_style_id
      { flag: 0x200, bytes: u32(3) }, // formula_id
      { flag: 0x2000, bytes: u32(9) }, // num_format_id
      { flag: 0x80000, bytes: u32(1) }, // comment id
    ]);
    const value = decodeCellRecord(record, NO_STRINGS, NO_STRINGS);
    expect(value.type).toBe("number");
    expect((value as { value: number }).value).toBe(42);
    expect((value as { isFormula: boolean }).isFormula).toBe(true);
  });

  it("rejects unsupported storage versions", () => {
    const record = new Uint8Array([4, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(() => decodeCellRecord(record, NO_STRINGS, NO_STRINGS)).toThrow();
  });

  it("formats cell values for display", () => {
    const cases: [CellValue, string][] = [
      [{ type: "empty" }, ""],
      [{ type: "number", value: 3.5, isFormula: false }, "3.5"],
      [{ type: "text", value: "hi", isFormula: false }, "hi"],
      [{ type: "bool", value: true, isFormula: false }, "TRUE"],
      [{ type: "error", isFormula: true }, "#ERROR"],
    ];
    for (const [value, expected] of cases) expect(cellValueToString(value)).toBe(expected);
  });
});

describe("table discovery on real fixtures", () => {
  it("finds Numbers tables with names, dimensions and sheet scoping", () => {
    const doc = NumbersDocument.load(fixture("tika-testNumbers2013.numbers"));
    const sheets = doc.sheets();
    expect(sheets.length).toBe(2);
    const all = doc.tables();
    expect(all.length).toBe(3);
    expect(all.map((t) => t.name)).toContain("Transactions");
    const first = doc.tables(sheets[0]!.id);
    expect(first.length).toBe(2);
    const transactions = first.find((t) => t.name === "Transactions")!;
    expect(transactions.rowCount).toBe(14);
    expect(transactions.columnCount).toBe(6);
    expect(transactions.headerRowCount).toBe(2);
    expect(transactions.headerColumnCount).toBe(1);
  });

  it("finds tables embedded in a Pages document", () => {
    const doc = PagesDocument.load(fixture("tika-testPages2013.pages"));
    const tables = doc.tables();
    expect(tables.length).toBe(1);
    expect(tables[0]!.rowCount).toBe(4);
    expect(tables[0]!.columnCount).toBe(3);
  });

  it("reports pre-BNC storage explicitly instead of returning no cells", () => {
    // The 2013-era fixtures predate Numbers 10's "BNC" cell storage. A silent
    // empty result would be indistinguishable from an empty table, so cells()
    // must throw and hasReadableCells must be false.
    const doc = NumbersDocument.load(fixture("tika-testNumbers2013.numbers"));
    const table = doc.tables()[0]!;
    expect(table.storageGeneration).toBe("preBNC");
    expect(table.hasReadableCells).toBe(false);
    let message = "";
    try {
      table.cells();
    } catch (e) {
      message = String((e as Error).message);
    }
    expect(message).toContain("pre-BNC");
  });
});
