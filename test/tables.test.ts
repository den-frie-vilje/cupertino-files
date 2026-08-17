import { readFileSync } from "node:fs";
import { FormulaOwnerRegistry, OwnerKind, ownerRegistrationState } from "../src/tsce/owners.ts";
import { describe, expect, it } from "./harness.ts";
import {
  allBorders,
  cellValueToString,
  CellFlag,
  CellRecord,
  CellType,
  colorFill,
  decodeCellRecord,
  decodeDecimal128,
  encodeDecimal128,
  linearGradient,
  NumbersDocument,
  PagesDocument,
  solidStroke,
  VerticalAlignment,
  type CellFormat,
  type CellValue,
  type IWorkDocument,
  type TableModel,
  normalizeCellInput,
} from "../src/index.ts";
import {
  AstNodeFields,
  AstNodeType,
  clearRegisteredFormulaFunctions,
  CROSS_TABLE_PREFIX,
  functionName,
  isKnownFunction,
  registerFormulaFunctions,
  renderFormula,
} from "../src/index.ts";
import { RawMessage } from "../src/base/protobuf.ts";
import { refId } from "../src/tsp/schema.ts";
import { DataStoreFields, TableModelFields } from "../src/tst/tables.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));

/**
 * Every raw v5 record of a table, in storage order.
 *
 * Reaches past the model deliberately: tests that assert on bytes must not
 * be filtered through the decoder they are checking.
 */
function rawRecordsOf(doc: IWorkDocument, table: TableModel): Uint8Array[] {
  const out: Uint8Array[] = [];
  const tiles = table.object.message.getMessage(4)?.getMessage(3);
  for (const t of tiles?.getMessages(1) ?? []) {
    const tile = doc.store.resolve(refId(t, 2));
    for (const row of tile?.message.getMessages(5) ?? []) {
      const buffer = row.getBytes(6);
      const rawOffsets = row.getBytes(7);
      if (!buffer || !rawOffsets) continue;
      const scale = row.getBool(8) ? 4 : 1;
      const offsets: number[] = [];
      for (let i = 0; i + 1 < rawOffsets.length; i += 2) {
        const v = rawOffsets[i]! | (rawOffsets[i + 1]! << 8);
        offsets.push(v >= 0x8000 ? v - 0x10000 : v);
      }
      for (let c = 0; c < offsets.length; c++) {
        if (offsets[c]! < 0) continue;
        let end = buffer.length;
        for (let n = c + 1; n < offsets.length; n++) {
          if (offsets[n]! >= 0) {
            end = offsets[n]! * scale;
            break;
          }
        }
        const record = buffer.slice(offsets[c]! * scale, end);
        if (record.length >= 12) out.push(record);
      }
    }
  }
  return out;
}

/** The table's format-table entries. */
function formatEntries(doc: IWorkDocument, table: TableModel): number[] {
  const list = doc.store.resolve(refId(table.object.message.getMessage(4), 22));
  return (list?.message.getMessages(3) ?? []).flatMap((e) => {
    const key = e.getUint(1);
    return key === undefined || !e.getMessage(6) ? [] : [key];
  });
}

/** The table's string-table entries as plain objects. */
function stringEntries(
  doc: IWorkDocument,
  table: TableModel,
): { key: number; refcount: number; text: string }[] {
  const list = doc.store.resolve(refId(table.object.message.getMessage(4), 4));
  return (list?.message.getMessages(3) ?? []).flatMap((e) => {
    const key = e.getUint(1);
    const text = e.getString(3);
    if (key === undefined || text === undefined) return [];
    return [{ key, refcount: e.getUint(2) ?? 0, text }];
  });
}

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

  it("decodes real v5 cell storage written by Apple", () => {
    // The 2018-era Pages file (format 3.2.13) carries a real BNC/v5 table.
    // Values are cross-checked arithmetically: quantity × unit price = cost,
    // which only holds if decimal128 decoding is exactly right.
    const doc = PagesDocument.load(fixture("libetonyek-pages5-extra-dir.pages"));
    const table = doc.tables()[0]!;
    expect(table.storageGeneration).toBe("v5");
    expect(table.hasReadableCells).toBe(true);
    expect(table.name).toBe("Details");

    const grid = table.grid();
    const at = (r: number, c: number) => grid[r]![c]!;
    expect(cellValueToString(at(0, 0))).toBe("Description");
    expect(cellValueToString(at(0, 3))).toBe("Cost");
    expect(at(0, 0).type).toBe("richText");

    for (const row of [1, 2]) {
      const quantity = at(row, 1) as { type: string; value: number };
      const unitPrice = at(row, 2) as { value: number };
      const cost = at(row, 3) as { value: number };
      expect(quantity.type).toBe("number");
      expect(quantity.value * unitPrice.value).toBe(cost.value);
    }
    expect((at(1, 1) as { value: number }).value).toBe(55);
    expect((at(1, 3) as { value: number }).value).toBe(5500);
  });

  it("reads pre-BNC storage rather than refusing it", () => {
    // The 2013-era fixtures predate Numbers 10's "BNC" cell storage. The
    // layout is measured, so the storage generation is reported — callers
    // may care — and the cells come out. See test/prebnc.test.ts for what
    // they are.
    const doc = NumbersDocument.load(fixture("tika-testNumbers2013.numbers"));
    const table = doc.tables()[0]!;
    expect(table.storageGeneration).toBe("preBNC");
    expect(table.hasReadableCells).toBe(true);
    expect(table.undecodedPreBncCells()).toBe(0);
    expect(table.cells().length).toBeGreaterThan(0);
  });
});

describe("cell-storage generation detection", () => {
  it("uses authoritative tile markers, not buffer presence", () => {
    // Modern writers ALSO emit the legacy pre-BNC fields as stubs, so
    // "field 6 present" is not a safe v5 test. Detection must key on
    // Tile.last_saved_in_BNC / storage_version.
    const modern = [
      "numbers-parser-v26.1-date-formats.numbers",
      "numbers-parser-v26.0-issue102.numbers",
      "numbers-parser-v14.4-issue102.numbers",
      "iwork-mcp-v14.5-earnings.numbers",
    ];
    for (const name of modern) {
      const doc = NumbersDocument.load(fixture(name));
      for (const table of doc.tables()) {
        expect(table.storageGeneration).toBe("v5");
        expect(table.hasReadableCells).toBe(true);
      }
      expect(doc.compatibility().probe.cellStorage).toBe("v5");
    }

    const legacy = NumbersDocument.load(fixture("tika-testNumbers2013.numbers"));
    for (const table of legacy.tables()) expect(table.storageGeneration).toBe("preBNC");
    expect(legacy.compatibility().probe.cellStorage).toBe("preBNC");
  });

  it("reads the same document saved by two different app generations", () => {
    // The A/B pair is the same source document written by Numbers 14.4 and
    // by Numbers 26.0 — only the writer differs, so cell values must match.
    const a = NumbersDocument.load(fixture("numbers-parser-v14.4-issue102.numbers"));
    const b = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    expect(a.compatibility().era).toBe("modern");
    expect(b.compatibility().era).toBe("current");

    const cellsOf = (doc: NumbersDocument) =>
      doc
        .tables()
        .flatMap((t) => t.cells())
        .map((c) => `${c.row},${c.column}=${cellValueToString(c.value)}`);
    const aCells = cellsOf(a);
    expect(aCells.length).toBeGreaterThan(0);
    expect(cellsOf(b)).toEqual(aCells);
  });
});

describe("cell record codec", () => {
  it("re-encodes every record in the corpus byte-for-byte", () => {
    // The strongest available guarantee that the writer speaks the same
    // dialect as the apps: decode real records, re-encode, compare bytes.
    // Any drift in field order, extras handling or flag layout shows here.
    const files = [
      "numbers-parser-v26.0-issue102.numbers",
      "numbers-parser-v26.1-date-formats.numbers",
      "numbers-parser-v26.1-custom-formats.numbers",
      "iwork-mcp-v14.5-earnings.numbers",
      "picodocs-v14.4-headers-tables.pages",
    ];
    let examined = 0;
    for (const name of files) {
      const doc = name.endsWith(".pages")
        ? PagesDocument.load(fixture(name))
        : NumbersDocument.load(fixture(name));
      for (const table of doc.tables()) {
        if (table.storageGeneration !== "v5") continue;
        for (const record of rawRecordsOf(doc, table)) {
          const round = CellRecord.decode(record).encode();
          expect([...round]).toEqual([...record]);
          examined++;
        }
      }
    }
    expect(examined).toBeGreaterThan(500);
  });

  it("round-trips decimal128 through the shortest decimal representation", () => {
    // Numbers stores decimals, not binary floats — 0.1 must come back as
    // exactly 0.1, not the double's 0.1000000000000000055511151231257827.
    for (const value of [0, 1, -1, 0.1, 0.3, 1234.5, -0.0001, 143_800_000_000, 1e-20]) {
      const back = decodeDecimal128(encodeDecimal128(value));
      if (value === 0) expect(back).toBe(0);
      else expect(Math.abs((back - value) / value) < 1e-15).toBe(true);
    }
  });

  it("preserves fields it does not interpret", () => {
    // A record carrying a comment id and a conditional style must keep them
    // when only the value changes — this is what stops an edit from
    // silently stripping a cell's formatting.
    const record = CellRecord.decode(
      v5Record(3, [
        { flag: CellFlag.STRING_ID, bytes: u32(7) },
        { flag: CellFlag.CELL_STYLE_ID, bytes: u32(12) },
        { flag: CellFlag.COND_STYLE_ID, bytes: u32(99) },
        { flag: CellFlag.COMMENT_ID, bytes: u32(3) },
      ]),
    );
    record.setDecimal128(42);
    record.remove(CellFlag.STRING_ID);
    record.type = CellType.NUMBER;
    const back = CellRecord.decode(record.encode());
    expect(back.id(CellFlag.CELL_STYLE_ID)).toBe(12);
    expect(back.id(CellFlag.COND_STYLE_ID)).toBe(99);
    expect(back.id(CellFlag.COMMENT_ID)).toBe(3);
    expect(back.has(CellFlag.STRING_ID)).toBe(false);
    expect(back.type).toBe(CellType.NUMBER);
  });
});

describe("writing cells", () => {
  it("writes every value type and reads it back after a save", () => {
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const table = doc.tables()[0]!;
    const when = new Date(Date.UTC(2026, 6, 30, 12, 0, 0));
    table.setCell(1, 0, { type: "text", value: "written" });
    table.setCell(1, 1, { type: "number", value: 1234.5 });
    table.setCell(2, 0, { type: "bool", value: true });
    table.setCell(2, 1, { type: "date", value: when });
    table.setCell(2, 2, { type: "duration", seconds: 3600 });

    const grid = NumbersDocument.load(doc.save()).tables()[0]!.grid();
    expect(cellValueToString(grid[1]![0]!)).toBe("written");
    expect(cellValueToString(grid[1]![1]!)).toBe("1234.5");
    expect(grid[2]![0]).toEqual({ type: "bool", value: true, isFormula: false });
    expect((grid[2]![1] as { value: Date }).value.getTime()).toBe(when.getTime());
    expect(cellValueToString(grid[2]![2]!)).toBe("3600s");
  });

  it("leaves untouched rows byte-identical", () => {
    // Editing one row must not perturb its neighbours' storage.
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const table = doc.tables()[0]!;
    const before = rawRecordsOf(doc, table).map((r) => [...r].join(","));
    table.setCell(1, 0, { type: "text", value: "changed" });
    const after = rawRecordsOf(doc, table).map((r) => [...r].join(","));
    // Same number of records; exactly one differs.
    expect(after.length).toBe(before.length);
    expect(after.filter((r, i) => r !== before[i]).length).toBe(1);
  });

  it("reference-counts the string table and reclaims dead entries", () => {
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const table = doc.tables()[0]!;
    const before = stringEntries(doc, table).length;
    table.setCell(1, 0, { type: "text", value: "alpha" });
    table.setCell(1, 1, { type: "text", value: "alpha" });
    const shared = stringEntries(doc, table).filter((e) => e.text === "alpha");
    expect(shared.length).toBe(1);
    expect(shared[0]!.refcount).toBe(2);
    // Replacing both drops the entry back out of the table.
    table.setCell(1, 0, { type: "number", value: 1 });
    table.setCell(1, 1, { type: "number", value: 2 });
    expect(stringEntries(doc, table).some((e) => e.text === "alpha")).toBe(false);
    expect(stringEntries(doc, table).length).toBe(before);
  });

  it("clears a formula when a literal is written over it", () => {
    const isFormula = (v: CellValue) => v.type !== "empty" && v.isFormula;
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.1-xlsx-lineage.numbers"));
    const table = doc.tables().find((t) => t.cells().some((c) => isFormula(c.value)));
    if (!table) return; // corpus without formulas; nothing to assert
    const formulaCell = table.cells().find((c) => isFormula(c.value))!;
    table.setCell(formulaCell.row, formulaCell.column, { type: "number", value: 7 });
    const reloaded = NumbersDocument.load(doc.save());
    const same = reloaded
      .tables()
      .flatMap((t) => t.cells())
      .find((c) => c.row === formulaCell.row && c.column === formulaCell.column)!;
    expect(isFormula(same.value)).toBe(false);
    expect(cellValueToString(same.value)).toBe("7");
  });

  it("refuses to write pre-BNC storage rather than corrupt it", () => {
    const doc = NumbersDocument.load(fixture("tika-testNumbers2013.numbers"));
    const table = doc.tables()[0]!;
    let message = "";
    try {
      table.setCell(0, 0, { type: "text", value: "nope" });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("pre-BNC");
  });

  it("rejects coordinates outside the table", () => {
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const table = doc.tables()[0]!;
    let message = "";
    try {
      table.setCell(table.rowCount, 0, { type: "number", value: 1 });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("outside the table");
  });
});

describe("table styling", () => {
  it("styles a cell without disturbing its neighbours", () => {
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const table = doc.tables()[0]!;
    const neighbourBefore = JSON.stringify(table.cellFormatting(1, 1));

    table.setCellFormatting(1, 0, {
      fill: colorFill(1, 0.9, 0.2),
      borders: allBorders(solidStroke({ r: 0.8, g: 0, b: 0 }, 2)),
      padding: { left: 6, top: 3, right: 6, bottom: 3 },
      verticalAlignment: VerticalAlignment.MIDDLE,
      textWrap: true,
    });

    const reloaded = NumbersDocument.load(doc.save()).tables()[0]!;
    const styled = reloaded.cellFormatting(1, 0);
    expect(styled.fill?.kind).toBe("color");
    expect(styled.borders?.top?.width).toBe(2);
    expect(styled.borders?.left?.pattern).toBe("solid");
    expect(styled.padding).toEqual({ left: 6, top: 3, right: 6, bottom: 3 });
    expect(styled.verticalAlignment).toBe(VerticalAlignment.MIDDLE);
    expect(styled.textWrap).toBe(true);
    expect(JSON.stringify(reloaded.cellFormatting(1, 1))).toBe(neighbourBefore);
  });

  it("inherits unspecified properties from the cell's existing style", () => {
    // Setting only a fill must not clear the padding the cell already had.
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const table = doc.tables()[0]!;
    const before = table.cellFormatting(1, 1);
    table.setCellFormatting(1, 1, { fill: colorFill(0, 0, 1) });
    const after = NumbersDocument.load(doc.save()).tables()[0]!.cellFormatting(1, 1);
    expect(after.fill?.kind).toBe("color");
    expect(after.padding).toEqual(before.padding);
    expect(after.verticalAlignment).toBe(before.verticalAlignment);
  });

  it("writes a gradient cell fill", () => {
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const table = doc.tables()[0]!;
    table.setCellFormatting(2, 1, {
      fill: linearGradient({ r: 1, g: 1, b: 1 }, { r: 0, g: 0.4, b: 1 }),
    });
    const fill = NumbersDocument.load(doc.save()).tables()[0]!.cellFormatting(2, 1).fill;
    expect(fill?.kind).toBe("gradient");
    if (fill?.kind === "gradient") {
      expect(fill.gradient.type).toBe("linear");
      expect(fill.gradient.stops.length).toBe(2);
      expect(fill.gradient.stops[1]!.fraction).toBe(1);
    }
  });

  it("edits table-level banding and grid strokes", () => {
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const table = doc.tables()[0]!;
    table.tableStyle()!.setTable({
      bandedRows: true,
      bandedFill: colorFill(0.95, 0.95, 1),
      tableBorderVisible: true,
      bodyHorizontalStroke: solidStroke({ r: 0.5, g: 0.5, b: 0.5 }, 0.5),
    });
    const style = NumbersDocument.load(doc.save()).tables()[0]!.tableStyle()!.table();
    expect(style.bandedRows).toBe(true);
    expect(style.bandedFill?.kind).toBe("color");
    expect(style.tableBorderVisible).toBe(true);
    expect(style.bodyHorizontalStroke?.width).toBe(0.5);
  });

  it("edits divider visibility and the band border strokes", () => {
    // The field report's missing keys: the header/footer divider flags
    // (42/43/44) and the modern band strokes (46…) — carried by 286 of
    // the corpus's 302 table-style bags.
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const table = doc.tables()[0]!;
    table.tableStyle()!.setTable({
      headerRowDividerVisible: false,
      headerColumnDividerVisible: true,
      footerDividerVisible: false,
      tableHeaderBorderVisible: true,
      headerRowBorderStroke: solidStroke({ r: 0.2, g: 0.2, b: 0.2 }, 2),
      footerRowSeparatorStroke: solidStroke({ r: 0.8, g: 0, b: 0 }, 1),
    });
    const style = NumbersDocument.load(doc.save()).tables()[0]!.tableStyle()!.table();
    expect(style.headerRowDividerVisible).toBe(false);
    expect(style.headerColumnDividerVisible).toBe(true);
    expect(style.footerDividerVisible).toBe(false);
    expect(style.tableHeaderBorderVisible).toBe(true);
    expect(style.headerRowBorderStroke?.width).toBe(2);
    expect(style.footerRowSeparatorStroke?.width).toBe(1);
  });

  it("null removes a field so the style inherits again", () => {
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const table = doc.tables()[0]!;
    const handle = table.tableStyle()!;
    handle.setTable({ bandedRows: true, bandedFill: colorFill(0.9, 0.9, 0.9) });
    expect(handle.table().bandedRows).toBe(true);
    handle.setTable({ bandedRows: null, bandedFill: null });
    // Absent is not false: the key disappears rather than flipping.
    expect("bandedRows" in handle.table()).toBe(false);
    expect("bandedFill" in handle.table()).toBe(false);
  });

  it("exposes the per-band cell styles the themes ship", () => {
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const table = doc.tables()[0]!;
    for (const band of ["body", "headerRow", "headerColumn", "footerRow"] as const) {
      const handle = table.bandStyle(band);
      expect(handle !== undefined).toBe(true);
      expect(handle!.isCellStyle).toBe(true);
    }
  });
});

describe("table structure", () => {
  it("renames, re-bands and resizes without touching cell storage", () => {
    const doc = NumbersDocument.load(fixture("iwork-mcp-v14.5-earnings.numbers"));
    const table = doc.tables()[0]!;
    const cellsBefore = table.cells().length;
    table.name = "Renamed";
    table.setBands({ headerRows: 2, headerColumns: 1, footerRows: 1 });
    table.setRowHeight(0, 66);
    table.setColumnWidth(0, 180);

    const reloaded = NumbersDocument.load(doc.save()).tables()[0]!;
    expect(reloaded.name).toBe("Renamed");
    expect(reloaded.headerRowCount).toBe(2);
    expect(reloaded.headerColumnCount).toBe(1);
    expect(reloaded.footerRowCount).toBe(1);
    expect(reloaded.rowHeight(0)).toBe(66);
    expect(reloaded.columnWidth(0)).toBe(180);
    expect(reloaded.cells().length).toBe(cellsBefore);
  });

  it("clamps band counts to the table's real size", () => {
    const doc = NumbersDocument.load(fixture("iwork-mcp-v14.5-earnings.numbers"));
    const table = doc.tables()[0]!;
    table.setBands({ headerRows: 9999, headerColumns: -3 });
    expect(table.headerRowCount).toBe(table.rowCount);
    expect(table.headerColumnCount).toBe(0);
  });
});

describe("merged cells", () => {
  it("decodes merges from the merge-owner formula store", () => {
    // The documented `merge_region_map` is absent from every fixture in the
    // corpus; real merges live as colon-tract AST nodes in the calc engine.
    // A reader that only knows the region map reports zero merges for every
    // merged table it will ever meet.
    const doc = NumbersDocument.load(fixture("iwork-mcp-v14.5-earnings.numbers"));
    const table = doc.tables().find((t) => t.name === "Key Metrics")!;
    const merges = table.merges();
    expect(merges.length).toBe(2);
    // A full-width title band across all four columns.
    expect(merges[0]).toEqual({ row: 0, column: 0, rowCount: 1, columnCount: 4 });
    expect(merges[1]).toEqual({ row: 1, column: 0, rowCount: 1, columnCount: 4 });
  });

  it("decodes vertical and offset merges", () => {
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const merges = doc.tables()[0]!.merges();
    // Anchored away from column 0, and one that spans rows rather than columns.
    expect(merges).toContainEqual({ row: 0, column: 2, rowCount: 1, columnCount: 8 });
    expect(merges).toContainEqual({ row: 2, column: 0, rowCount: 4, columnCount: 1 });
  });

  it("agrees across format eras for the same source document", () => {
    const a = NumbersDocument.load(fixture("numbers-parser-v14.4-issue102.numbers"));
    const b = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    expect(b.tables()[0]!.merges()).toEqual(a.tables()[0]!.merges());
  });

  it("never reports a merge whose covered cells hold values", () => {
    // The invariant Apple maintains, and the strongest check available
    // without rendering: if a rectangle were wrong, some cell it claims to
    // cover would still carry a value of its own.
    let checked = 0;
    for (const name of [
      "iwork-mcp-v14.5-earnings.numbers",
      "numbers-parser-v26.0-issue102.numbers",
      "numbers-parser-v26.1-custom-formats.numbers",
      "numbers-parser-v26.1-xlsx-lineage.numbers",
    ]) {
      for (const table of NumbersDocument.load(fixture(name)).tables()) {
        if (table.storageGeneration !== "v5" || table.merges().length === 0) continue;
        for (const cell of table.cells()) {
          if (cell.value.type === "empty") continue;
          expect(table.isCovered(cell.row, cell.column)).toBe(false);
          checked++;
        }
        for (const merge of table.merges()) {
          expect(merge.row + merge.rowCount <= table.rowCount).toBe(true);
          expect(merge.column + merge.columnCount <= table.columnCount).toBe(true);
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("refuses to write a value into a cell a merge has swallowed", () => {
    const doc = NumbersDocument.load(fixture("iwork-mcp-v14.5-earnings.numbers"));
    const table = doc.tables().find((t) => t.name === "Key Metrics")!;
    expect(table.isCovered(0, 1)).toBe(true);
    expect(table.isCovered(0, 0)).toBe(false);

    let message = "";
    try {
      table.setCell(0, 1, { type: "text", value: "invisible" });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("covered by the merge anchored at 0,0");

    // Clearing is fine — a covered cell is already invisible — and the
    // escape hatch works for callers who mean it.
    table.clearCell(0, 1);
    table.setCell(0, 1, { type: "text", value: "deliberate" }, { allowCovered: true });
    expect(table.cellText(0, 1)).toBe("deliberate");
    // The anchor is still writable.
    table.setCell(0, 0, { type: "text", value: "title" });
    expect(table.cellText(0, 0)).toBe("title");
  });
});

describe("header and footer bands", () => {
  it("reads and writes freeze and repeating-header flags", () => {
    const doc = NumbersDocument.load(fixture("iwork-mcp-v14.5-earnings.numbers"));
    const table = doc.tables()[0]!;
    table.setBands({
      headerRows: 2,
      footerRows: 1,
      freezeHeaderRows: true,
      freezeHeaderColumns: false,
      repeatHeaderRows: true,
      repeatHeaderColumns: false,
    });

    const reloaded = NumbersDocument.load(doc.save()).tables()[0]!;
    expect(reloaded.headerRowCount).toBe(2);
    expect(reloaded.footerRowCount).toBe(1);
    expect(reloaded.headerRowsFrozen).toBe(true);
    expect(reloaded.headerColumnsFrozen).toBe(false);
    expect(reloaded.repeatingHeaderRows).toBe(true);
    expect(reloaded.repeatingHeaderColumns).toBe(false);
  });

  it("exposes a band's text style separately from its cell style", () => {
    // A band has two styles: the cell (fill, borders) and the text inside
    // it. Making a header bold means editing the second, not the first.
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const table = doc.tables()[0]!;
    for (const band of ["body", "headerRow", "headerColumn", "footerRow"] as const) {
      expect(table.bandStyle(band) !== undefined).toBe(true);
      expect(table.bandTextStyle(band) !== undefined).toBe(true);
    }

    table.bandTextStyle("headerRow")!.setCharacter({ bold: true, fontSize: 14 });
    const reloaded = NumbersDocument.load(doc.save()).tables()[0]!;
    const header = reloaded.bandTextStyle("headerRow")!.character();
    expect(header.bold).toBe(true);
    expect(header.fontSize).toBe(14);
  });
});

describe("formulas", () => {
  it("renders arithmetic with references resolved against the using cell", () => {
    // References are stored as offsets from the cell that uses them, so
    // one formula entry renders differently in every cell that shares it.
    // Pages, not Numbers: formulas are a table feature, not an app feature.
    const doc = PagesDocument.load(fixture("libetonyek-pages5-extra-dir.pages"));
    const table = doc.tables().find((t) => t.formulas().length > 0)!;
    expect(table.cellFormula(1, 3)).toBe("=B2*C2");
    // The same stored formula, one row down.
    expect(table.cellFormula(2, 3)).toBe("=B3*C3");
    // And its cached value is the product of the cells it names.
    const value = (row: number, column: number) => Number(table.cellText(row, column));
    expect(value(1, 1) * value(1, 2)).toBe(value(1, 3));
  });

  it("names SUM, the one function id the corpus proves", () => {
    // 168 is identified by arithmetic, not assumption: the cached result
    // equals the sum of the cells the formula covers.
    const doc = PagesDocument.load(fixture("libetonyek-pages5-extra-dir.pages"));
    const table = doc.tables().find((t) => t.formulas().length > 0)!;
    const total = table.formulas().find((f) => f.formula.startsWith("=SUM"))!;
    expect(total.formula).toContain("SUM(");
    const summed = [1, 2, 3].reduce((n, row) => n + Number(table.cellText(row, 3) || 0), 0);
    expect(Number(table.cellText(total.row, total.column))).toBe(summed);
  });

  it("resolves both absolute and relative colon tracts", () => {
    // Ranges come in two encodings. Reading only the absolute pair renders
    // the relative ones as #REF! — which is what happened before.
    const doc = NumbersDocument.load(fixture("numbers-parser-v14.4-issue102.numbers"));
    const table = doc.tables()[0]!;
    const formula = table.formulas()[0]!;
    expect(formula.formula).toBe("=SUM(C3:K6)");
    expect(formula.formula).toContain(":");
  });

  it("names the table a cross-table reference points at", () => {
    // Rendering these as a bare `A2` would read as a cell in the formula's
    // *own* table. The target is a calc-engine owner UUID, resolved through
    // the formula-owner map — see test/owners.test.ts.
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-categories.numbers"));
    const table = doc.tables().find((t) => t.name === "Categories")!;
    const detail = table.cellFormulaDetail(1, 0)!;
    expect(detail.hasCrossTableReferences).toBe(true);
    expect(detail.hasUnnamedCrossTables).toBe(false);
    expect(detail.text).toBe("=Uncategorized::A2");
    expect(detail.text).not.toContain(CROSS_TABLE_PREFIX);
  });

  it("falls back to the marker when no owner map is supplied", () => {
    // renderFormula on its own cannot resolve an owner UUID; the honest
    // rendering is then the marker, never a bare local-looking address.
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-categories.numbers"));
    const table = doc.tables().find((t) => t.name === "Categories")!;
    const formulaId = table.formulaId(1, 0)!;
    const store = (table as unknown as { store: typeof doc.store }).store;
    const dataStore = table.object.message.getMessage(4)!;
    const list = store.object(dataStore.getMessage(6)!.getVarint(1)!)!;
    const entry = list.message
      .getMessages(3)
      .find((e) => e.getUint(1) === formulaId)!;
    const bare = renderFormula(entry.getMessage(5), { row: 1, column: 0 });
    expect(bare.hasUnnamedCrossTables).toBe(true);
    expect(bare.text).toBe(`=${CROSS_TABLE_PREFIX}A2`);
  });

  it("reports unknown function ids rather than inventing names", () => {
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.1-xlsx-lineage.numbers"));
    for (const table of doc.tables()) {
      if (table.storageGeneration !== "v5") continue;
      for (const { row, column } of table.formulas()) {
        const detail = table.cellFormulaDetail(row, column)!;
        // Anything unnamed must appear as a visible placeholder.
        for (const id of detail.unknownFunctions) {
          expect(detail.text).toContain(`FUNCTION_${id}`);
        }
      }
    }
  });

  it("accepts function names registered at runtime", () => {
    registerFormulaFunctions({ 999: "MYFUNC" });
    expect(functionName(999)).toBe("MYFUNC");
    expect(isKnownFunction(999)).toBe(true);
    clearRegisteredFormulaFunctions();
    expect(functionName(999)).toBe("FUNCTION_999");
    expect(isKnownFunction(999)).toBe(false);
    // Built-ins survive a clear.
    expect(functionName(168)).toBe("SUM");
  });

  it("renders every formula in the corpus without an unknown node type", () => {
    // Coverage guard: a node type we have no rule for renders as NODE_<n>,
    // which is visible but useless. This fails when the corpus grows a
    // formula shape the renderer does not understand.
    const unknown = new Set<number>();
    let rendered = 0;
    for (const name of [
      "libetonyek-pages5-extra-dir.pages",
      "picodocs-v14.4-headers-tables.pages",
      "numbers-parser-v14.4-issue102.numbers",
      "numbers-parser-v26.0-categories.numbers",
      "numbers-parser-v26.1-xlsx-lineage.numbers",
      "numbers-parser-v26.1-custom-formats.numbers",
    ]) {
      const doc = name.endsWith(".pages")
        ? PagesDocument.load(fixture(name))
        : NumbersDocument.load(fixture(name));
      for (const table of doc.tables()) {
        if (table.storageGeneration !== "v5") continue;
        for (const { row, column, formula } of table.formulas()) {
          const detail = table.cellFormulaDetail(row, column)!;
          detail.unknownNodeTypes.forEach((t) => unknown.add(t));
          expect(formula.startsWith("=")).toBe(true);
          rendered++;
        }
      }
    }
    expect(rendered).toBeGreaterThan(100);
    expect([...unknown]).toEqual([]);
  });

  it("parenthesises by precedence, since brackets are not stored", () => {
    // The archive records structure, not the author's typing, so the
    // renderer must add exactly the brackets the tree requires.
    const ast = (...nodes: { type: number; extra?: (m: RawMessage) => void }[]) => {
      const array = RawMessage.create();
      for (const node of nodes) {
        const n = RawMessage.create();
        n.setVarint(1, node.type);
        node.extra?.(n);
        array.addMessage(1, n);
      }
      const formula = RawMessage.create();
      formula.setMessage(1, array);
      return formula;
    };
    const num = (v: number) => ({
      type: AstNodeType.NUMBER,
      extra: (m: RawMessage) => { m.setDouble(AstNodeFields.NUMBER, v); },
    });

    // (1+2)*3 — the multiply's left operand binds looser, so it needs brackets.
    expect(
      renderFormula(ast(num(1), num(2), { type: AstNodeType.ADDITION }, num(3), {
        type: AstNodeType.MULTIPLICATION,
      })).text,
    ).toBe("=(1+2)*3");
    // 1+2*3 — no brackets needed.
    expect(
      renderFormula(ast(num(1), num(2), num(3), { type: AstNodeType.MULTIPLICATION }, {
        type: AstNodeType.ADDITION,
      })).text,
    ).toBe("=1+2*3");
    // 1-(2-3) — right operand of a left-associative operator at equal precedence.
    expect(
      renderFormula(ast(num(1), num(2), num(3), { type: AstNodeType.SUBTRACTION }, {
        type: AstNodeType.SUBTRACTION,
      })).text,
    ).toBe("=1-(2-3)");
  });
});

describe("rows and columns", () => {
  it("inserts blank rows and keeps every other cell where it was", () => {
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const table = doc.tables()[0]!;
    const before = table.grid().map((row) => row.map((c) => (c ? cellValueToString(c) : null)));
    const rowsBefore = table.rowCount;

    table.insertRows(1, 2);
    expect(table.rowCount).toBe(rowsBefore + 2);

    const reloaded = NumbersDocument.load(doc.save()).tables()[0]!;
    const after = reloaded.grid().map((row) => row.map((c) => (c ? cellValueToString(c) : null)));
    // Row 0 untouched; rows 1-2 blank; everything else shifted down by two.
    expect(after[0]).toEqual(before[0]);
    expect(after[1]!.every((c) => c === null)).toBe(true);
    expect(after[2]!.every((c) => c === null)).toBe(true);
    for (let row = 1; row < before.length; row++) expect(after[row + 2]).toEqual(before[row]);
  });

  it("inserts and deletes columns", () => {
    const doc = PagesDocument.load(fixture("picodocs-v14.4-headers-tables.pages"));
    const table = doc.tables()[0]!;
    const before = table.grid().map((row) => row.map((c) => (c ? cellValueToString(c) : null)));
    const columnsBefore = table.columnCount;

    table.insertColumns(1, 1);
    expect(table.columnCount).toBe(columnsBefore + 1);
    const inserted = PagesDocument.load(doc.save()).tables()[0]!;
    expect(inserted.grid()[0]![0]).toEqual(table.grid()[0]![0]);
    expect(inserted.grid()[0]![1]).toBe(null);

    inserted.deleteColumns(1, 1);
    const after = PagesDocument.load(
      (() => {
        const d = PagesDocument.load(doc.save());
        d.tables()[0]!.deleteColumns(1, 1);
        return d.save();
      })(),
    )
      .tables()[0]!
      .grid()
      .map((row) => row.map((c) => (c ? cellValueToString(c) : null)));
    expect(after).toEqual(before);
  });

  it("round-trips a table through insert and matching delete", () => {
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const table = doc.tables()[0]!;
    const before = {
      size: [table.rowCount, table.columnCount],
      cells: table.cells().length,
      merges: table.merges(),
    };

    table.insertRows(1, 2);
    table.insertColumns(1, 1);
    table.deleteColumns(1, 1);
    table.deleteRows(1, 2);

    const reloaded = NumbersDocument.load(doc.save()).tables()[0]!;
    expect([reloaded.rowCount, reloaded.columnCount]).toEqual(before.size);
    expect(reloaded.cells().length).toBe(before.cells);
    expect(reloaded.merges()).toEqual(before.merges);
    expect(NumbersDocument.load(doc.save()).compatibility().canRoundTrip).toBe(true);
  });

  it("moves merges across an insertion and grows one it lands inside", () => {
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const table = doc.tables()[0]!;
    // r6c0 spans two columns; inserting at column 1 falls inside it.
    expect(table.merges()).toContainEqual({ row: 6, column: 0, rowCount: 1, columnCount: 2 });

    table.insertColumns(1, 1);
    const merges = table.merges();
    // Grown, not moved, because the insertion point is interior to it.
    expect(merges.some((m) => m.row === 6 && m.column === 0 && m.columnCount === 3)).toBe(true);
    // A merge starting after the insertion point moved right instead.
    expect(merges.some((m) => m.row === 0 && m.column === 3 && m.columnCount === 8)).toBe(true);
  });

  it("drops a merge whose rows are all deleted", () => {
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const table = doc.tables()[0]!;
    // r2c0 spans rows 2..5.
    expect(table.merges()).toContainEqual({ row: 2, column: 0, rowCount: 4, columnCount: 1 });
    const before = table.merges().length;
    table.deleteRows(2, 4);
    // Gone, not merely moved — and note another merge shifts up into r2c0,
    // so identifying it by position alone would pass for the wrong reason.
    expect(table.merges().some((m) => m.rowCount === 4)).toBe(false);
    expect(table.merges().length).toBe(before - 1);
  });

  it("reclaims string-table entries from deleted cells", () => {
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const table = doc.tables()[0]!;
    table.setCell(1, 0, { type: "text", value: "doomed" });
    expect(stringEntries(doc, table).some((e) => e.text === "doomed")).toBe(true);
    table.deleteRows(1, 1);
    expect(stringEntries(doc, table).some((e) => e.text === "doomed")).toBe(false);
  });

  it("keeps header bands within the table after deletions", () => {
    const doc = NumbersDocument.load(fixture("iwork-mcp-v14.5-earnings.numbers"));
    const table = doc.tables()[0]!;
    table.setBands({ headerRows: 3, footerRows: 2 });
    table.deleteRows(0, table.rowCount - 2);
    // Bands cannot describe rows that no longer exist.
    expect(table.headerRowCount).toBeLessThan(3);
    expect(table.headerRowCount).toBe(2);
    expect(table.footerRowCount).toBe(2);
  });

  it("refuses to empty a table entirely", () => {
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const table = doc.tables()[0]!;
    for (const attempt of [
      () => { table.deleteRows(0, table.rowCount); },
      () => { table.deleteColumns(0, table.columnCount); },
      () => { table.insertRows(-1, 1); },
      () => { table.deleteRows(0, table.rowCount + 5); },
    ]) {
      let threw = false;
      try {
        attempt();
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    }
  });
});

describe("Numbers sheet management", () => {
  it("duplicates a sheet with tables that are its own", () => {
    // The failure a shallow copy gives: two tabs editing the same cells.
    const doc = NumbersDocument.load(fixture("iwork-mcp-v14.5-earnings.numbers"));
    const before = doc.sheets().length;
    const original = doc.sheets()[0]!;
    const originalText = doc.tables(original.id)[0]!.cellText(1, 0);

    const copy = doc.addSheet({ name: "Copy", copyOf: 0 });
    expect(doc.sheets().length).toBe(before + 1);
    expect(doc.tables(copy.id).length).toBe(doc.tables(original.id).length);
    // No table object appears on both sheets.
    const originalIds = new Set(doc.tables(original.id).map((t) => t.object.identifier));
    expect(doc.tables(copy.id).some((t) => originalIds.has(t.object.identifier))).toBe(false);

    doc.tables(copy.id)[0]!.setCell(1, 0, { type: "text", value: "changed in copy" }, { allowCovered: true });
    const reloaded = NumbersDocument.load(doc.save());
    const [first, ...rest] = reloaded.sheets();
    void rest;
    expect(reloaded.tables(first!.id)[0]!.cellText(1, 0)).toBe(originalText);
    const reloadedCopy = reloaded.sheets().find((s) => s.name === "Copy")!;
    expect(reloaded.tables(reloadedCopy.id)[0]!.cellText(1, 0)).toBe("changed in copy");
    expect(reloaded.compatibility().canRoundTrip).toBe(true);
  });

  it("adds an empty sheet", () => {
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const sheet = doc.addSheet({ name: "Blank", withContent: false });
    expect(doc.tables(sheet.id).length).toBe(0);
    const reloaded = NumbersDocument.load(doc.save());
    const found = reloaded.sheets().find((s) => s.name === "Blank")!;
    expect(reloaded.tables(found.id).length).toBe(0);
  });

  it("keeps sheet names unique, as the app does", () => {
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const existing = doc.sheets()[0]!.name!;
    const first = doc.addSheet({ name: existing, withContent: false });
    const second = doc.addSheet({ name: existing, withContent: false });
    expect(first.name).not.toBe(existing);
    expect(second.name).not.toBe(first.name);
    expect(new Set(doc.sheets().map((s) => s.name)).size).toBe(doc.sheets().length);
  });

  it("renames, reorders and removes sheets", () => {
    const doc = NumbersDocument.load(fixture("iwork-mcp-v14.5-earnings.numbers"));
    const names = doc.sheets().map((s) => s.name);
    expect(names.length).toBeGreaterThan(2);

    doc.renameSheet(0, "First");
    doc.moveSheet(0, 2);
    const moved = NumbersDocument.load(doc.save());
    expect(moved.sheets()[2]!.name).toBe("First");
    expect(moved.sheets()[0]!.name).toBe(names[1]);

    const count = moved.sheets().length;
    moved.removeSheet(0);
    const removed = NumbersDocument.load(moved.save());
    expect(removed.sheets().length).toBe(count - 1);
    expect(removed.compatibility().canRoundTrip).toBe(true);
  });

  it("refuses to remove the last sheet", () => {
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    let threw = false;
    try {
      doc.removeSheet(0);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe("cell formats", () => {
  it("reads every format category the corpus contains", () => {
    const kinds = new Set<string>();
    for (const name of [
      "numbers-parser-v26.1-date-formats.numbers",
      "numbers-parser-v26.1-custom-formats.numbers",
      "iwork-mcp-v14.5-earnings.numbers",
      "numbers-parser-v26.0-categories.numbers",
    ]) {
      for (const table of NumbersDocument.load(fixture(name)).tables()) {
        if (table.storageGeneration !== "v5") continue;
        for (const cell of table.cells()) {
          const format = table.cellFormat(cell.row, cell.column);
          if (format) kinds.add(format.kind);
        }
      }
    }
    // Categories come from which record flag carried the id, not from
    // guessing at the format's own type code.
    for (const expected of ["text", "number", "date", "currency", "custom"]) {
      expect([...kinds]).toContain(expected);
    }
  });

  it("writes and reads back each format kind", () => {
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const table = doc.tables()[0]!;
    const cases: [number, number, CellFormat][] = [
      // Currency reads back with its full corpus shape: the writer states
      // negative style even at the default, because the app's own
      // currency formats always do.
      [1, 0, { kind: "currency", code: "EUR", decimals: 2, thousandsSeparator: true, accountingStyle: true, negativeStyle: 0 }],
      [1, 1, { kind: "percentage", decimals: 1 }],
      [2, 0, { kind: "date", pattern: "yyyy-MM-dd" }],
      [2, 1, { kind: "number", decimals: "auto", thousandsSeparator: false }],
      [3, 0, { kind: "text" }],
    ];
    for (const [row, column, format] of cases) {
      table.setCell(row, column, { type: "number", value: 1 }, { allowCovered: true });
      table.setCellFormat(row, column, format);
    }

    const reloaded = NumbersDocument.load(doc.save()).tables()[0]!;
    for (const [row, column, format] of cases) {
      expect(reloaded.cellFormat(row, column)).toEqual(format);
    }
    expect(NumbersDocument.load(doc.save()).compatibility().canRoundTrip).toBe(true);
  });

  it("treats decimal_places 253 as automatic rather than 253 digits", () => {
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const table = doc.tables()[0]!;
    table.setCell(1, 0, { type: "number", value: 1 });
    table.setCellFormat(1, 0, { kind: "number", decimals: "auto" });
    const format = NumbersDocument.load(doc.save()).tables()[0]!.cellFormat(1, 0)!;
    expect(format.kind === "number" && format.decimals).toBe("auto");
  });

  it("replaces a cell's format rather than stacking a second one", () => {
    // Two format ids on one record would make the display depend on which
    // flag the app reads first.
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const table = doc.tables()[0]!;
    table.setCell(1, 0, { type: "number", value: 5 });
    table.setCellFormat(1, 0, { kind: "currency", code: "USD" });
    table.setCellFormat(1, 0, { kind: "percentage", decimals: 0 });

    const reloaded = NumbersDocument.load(doc.save()).tables()[0]!;
    expect(reloaded.cellFormat(1, 0)!.kind).toBe("percentage");
  });

  it("shares one format-table entry between cells formatted alike", () => {
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const table = doc.tables()[0]!;
    // The first write may intern the automatic default a fresh number is
    // stamped with; count from there so only the explicit format is measured.
    table.setCell(1, 0, { type: "number", value: 1 }, { allowCovered: true });
    const entriesBefore = formatEntries(doc, table).length;
    for (const row of [1, 2, 3]) {
      // allowCovered: this fixture merges rows 2..5 of column 0, and the
      // point here is the format table, not the merge guard.
      table.setCell(row, 0, { type: "number", value: row }, { allowCovered: true });
      table.setCellFormat(row, 0, { kind: "number", decimals: 2 });
    }
    // Three cells, one new entry — as in Apple's own files.
    expect(formatEntries(doc, table).length).toBe(entriesBefore + 1);
  });

  it("refuses to author a custom format", () => {
    // Its definition lives elsewhere behind a UUID we cannot mint.
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const table = doc.tables()[0]!;
    table.setCell(1, 0, { type: "number", value: 1 });
    let message = "";
    try {
      table.setCellFormat(1, 0, { kind: "custom", category: "number", formatType: 270 });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("custom format");
  });
});

describe("adding and removing tables", () => {
  const FILE = "numbers-parser-v26.1-date-formats.numbers";
  const load = (): NumbersDocument =>
    NumbersDocument.load(new Uint8Array(readFileSync(new URL(FILE, FIXTURES))));

  it("adds a blank table laid out like its source", () => {
    const document = load();
    const sheet = document.sheets()[0]!;
    const source = document.tablesOnSheet(sheet.id)[0]!;
    const blank = document.addTable(sheet.id, { withContent: false });

    // Same shape and bands, no data.
    expect(blank.rowCount).toBe(source.rowCount);
    expect(blank.columnCount).toBe(source.columnCount);
    expect(blank.cellText(0, 0)).toBe("");
    expect(source.cellText(0, 0).length).toBeGreaterThan(0);
    expect(blank.headerRowCount).toBe(source.headerRowCount);
  });

  it("duplicates a table with its data when asked", () => {
    const document = load();
    const sheet = document.sheets()[0]!;
    const source = document.tablesOnSheet(sheet.id)[0]!;
    const copy = document.addTable(sheet.id, { name: "Copy" });

    expect(copy.name).toBe("Copy");
    expect(copy.cellText(0, 0)).toBe(source.cellText(0, 0));
  });

  it("never leaves two tables on a sheet sharing a name", () => {
    // Numbers addresses tables by name: a duplicate makes every
    // cross-table formula on the sheet ambiguous.
    const document = load();
    const sheet = document.sheets()[0]!;
    document.addTable(sheet.id);
    document.addTable(sheet.id);
    document.addTable(sheet.id, { name: "Table 1" }); // the name is taken

    const names = document.tablesOnSheet(sheet.id).map((t) => t.name);
    expect(names.length).toBe(4);
    expect(new Set(names).size).toBe(4);
  });

  it("lets two sheets each keep a table of the same name", () => {
    // Uniqueness is per sheet, not per document — forcing it globally
    // would rename tables that were never in conflict.
    const document = load();
    const first = document.sheets()[0]!;
    const second = document.addSheet({ withContent: false });
    const original = document.tablesOnSheet(first.id)[0]!.name!;
    const copy = document.addTable(second.id, {
      name: original,
      copyOf: document.tablesOnSheet(first.id)[0]!.infoObject!.identifier,
    });
    expect(copy.name).toBe(original);
  });

  it("survives a save, and the copy is independent of its source", () => {
    const document = load();
    const sheet = document.sheets()[0]!;
    const source = document.tablesOnSheet(sheet.id)[0]!;
    const before = source.cellText(0, 0);
    const blank = document.addTable(sheet.id, { withContent: false, name: "Fresh" });
    blank.setCell(0, 0, { type: "text", value: "Written" });

    const reloaded = NumbersDocument.load(document.save());
    const tables = reloaded.tablesOnSheet(sheet.id);
    expect(tables.length).toBe(2);
    const added = tables.find((t) => t.name === "Fresh")!;
    expect(added.cellText(0, 0)).toBe("Written");
    // Editing the copy did not reach through to the original.
    expect(tables.find((t) => t.name !== "Fresh")!.cellText(0, 0)).toBe(before);
  });

  it("removes a table from its sheet", () => {
    const document = load();
    const sheet = document.sheets()[0]!;
    const added = document.addTable(sheet.id, { name: "Temporary" });
    const infoId = added.infoObject!.identifier;

    expect(document.removeTable(sheet.id, infoId)).toBe(true);
    expect(document.tablesOnSheet(sheet.id).some((t) => t.name === "Temporary")).toBe(false);
    expect(document.removeTable(sheet.id, infoId)).toBe(false);

    const reloaded = NumbersDocument.load(document.save());
    expect(reloaded.tablesOnSheet(sheet.id).length).toBe(1);
  });

  it("refuses a source that is not a table", () => {
    const document = load();
    const sheet = document.sheets()[0]!;
    expect(() => document.addTable(sheet.id, { copyOf: 1n })).toThrow();
    expect(() => document.addTable(999999n)).toThrow();
  });

  it("registers a copy with the calc engine, the way the app registers a new table", () => {
    // A clone without a kind-1 FormulaOwnerDependenciesArchive is a
    // table the engine has never heard of: the app re-registers it
    // under a brand-new UUID on open and every reference compiled
    // against the written identity dangles as a ref error.
    const document = load();
    const sheet = document.sheets()[0]!;
    const copy = document.addTable(sheet.id, { name: "Registered" });
    const reloaded = NumbersDocument.load(document.save());
    const registry = new FormulaOwnerRegistry(reloaded.store);
    const entry = registry
      .all()
      .find((o) => o.kind === OwnerKind.TABLE && o.tableName === "Registered");
    expect(entry !== undefined).toBe(true);
    expect(entry!.ownerId !== undefined).toBe(true);
    // The derived owners the app mints beside it exist too, sharing the
    // base: the full family, kind for kind, as both app-minted specimens
    // carry it.
    for (const kind of [3, 4, 5, 6, 8, 9, 10, 11, 12, 35]) {
      const derived = registry
        .all()
        .find(
          (o) =>
            o.kind === kind &&
            o.base !== undefined &&
            o.base.lo === entry!.uid.lo &&
            o.base.hi === entry!.uid.hi,
        );
      expect(`kind ${kind}: ${derived !== undefined}`).toBe(`kind ${kind}: true`);
    }
    void copy;
  });

  it("registers a copy at all three engine sites: archive, tracker list, owner map", () => {
    // The engine only loads owner archives its dependency tracker lists,
    // and only trusts identities its owner_id_map carries. A mint that
    // wrote the archives alone shipped in a review round: the app
    // discarded the whole identity on open, re-registered the table, and
    // tombstoned a cross-table reference into a ref error.
    const document = load();
    const sheet = document.sheets()[0]!;
    document.addTable(sheet.id, { name: "Enrolled" });
    const reloaded = NumbersDocument.load(document.save());
    const registry = new FormulaOwnerRegistry(reloaded.store);
    const entry = registry
      .all()
      .find((o) => o.kind === OwnerKind.TABLE && o.tableName === "Enrolled")!;
    const state = ownerRegistrationState(reloaded.store, entry.uid);
    expect(JSON.stringify(state)).toBe(
      JSON.stringify({ archive: true, tracked: true, mapped: true }),
    );

    // Internal ids allocate past the owner map's own maximum — the map
    // knows owners that have no archive in the file, and the app's next
    // allocation follows the map (measured: template map max 54, the
    // app's own re-registration started at 55).
    let engine;
    for (const { obj } of reloaded.store.allObjects()) {
      if (reloaded.store.typeNameOf(obj) === "TSCE.CalculationEngineArchive") engine = obj;
    }
    if (!engine) throw new Error("no calculation engine archive in the saved document");
    const map = engine.message.getMessage(2)!.getMessage(3)!;
    const internals = map.getMessages(1).map((e) => Number(e.getVarint(1)));
    expect(new Set(internals).size).toBe(internals.length);
  });

  it("mints only identity — no empty bags whose archetypes have required fields", () => {
    // The decoration the app writes beside a fresh registration nests
    // messages with required fields (an empty RangeCoordinateArchive is
    // malformed), and a round of demo documents shipped exactly that
    // and opened as damaged. Omitting an optional field can never be.
    const document = load();
    const sheet = document.sheets()[0]!;
    document.addTable(sheet.id, { name: "MinimalMint" });
    const reloaded = NumbersDocument.load(document.save());
    const registry = new FormulaOwnerRegistry(reloaded.store);
    const entry = registry
      .all()
      .find((o) => o.kind === OwnerKind.TABLE && o.tableName === "MinimalMint")!;
    for (const { obj } of reloaded.store.allObjects()) {
      if (obj.type !== 4008) continue;
      const uidMessage = obj.message.getMessage(1);
      const lo = uidMessage?.getVarint(1);
      if (lo === undefined) continue;
      const delta = (lo - entry.uid.lo) & 0xffffffffffffffffn;
      if (delta >= 256n) continue; // another table's family
      const fields = obj.message.fields.map((f) => f.no).sort((a, b) => a - b);
      const kind = obj.message.getUint(3);
      const expected = kind === 1 ? [1, 2, 3, 11] : [1, 2, 3, 12];
      expect(`kind ${kind}: ${fields.join(",")}`).toBe(`kind ${kind}: ${expected.join(",")}`);
    }
  });

  it("drops the template's do-nothing text style from written values", () => {
    // Automatic alignment is the absence of the per-cell text style —
    // the app's own re-align write removes the id — and the template's
    // inherited style (para_properties {alignment: 0}) is the left-pin.
    const document = NumbersDocument.blank();
    const table = document.tables()[0]!;
    if (table.rowCount < 6) table.insertRows(table.rowCount, 6 - table.rowCount);
    table.setCell(2, 1, 42);
    table.setCell(3, 1, "text keeps the template style");
    const after = NumbersDocument.load(document.save()).tables()[0]!;
    expect(after.textStyleId(2, 1)).toBe(undefined);
    expect(after.textStyleId(3, 1) !== undefined).toBe(true);
  });

  it("gives a copy its own calc-engine identity, so names resolve", () => {
    // A clone byte-copies the donor's owner UUIDs, and the calc engine
    // then sees one identity with two names: cross-table references to
    // either table resolve to whichever registered first. The copy's
    // whole derived family is re-minted instead, which is what lets a
    // formula name it the moment it exists.
    const document = load();
    const sheet = document.sheets()[0]!;
    const source = document.tablesOnSheet(sheet.id)[0]!;
    const copy = document.addTable(sheet.id, { name: "Krydstjek" });
    copy.setCell(1, 1, { type: "number", value: 42 });
    source.setFormula(2, 1, "=Krydstjek::B2");

    const reloaded = NumbersDocument.load(document.save());
    const tables = reloaded.tablesOnSheet(sheet.id);
    const original = tables.find((t) => t.name !== "Krydstjek")!;
    expect(original.cellFormula(2, 1)).toContain("Krydstjek::B2");
  });
});

describe("cell-storage integrity", () => {
  it("refuses to persist a record whose string entry is gone", () => {
    // The field report's first-ranked fault, reproduced: two tables
    // sharing one string table undercount refcounts — each entry claims
    // one owner while two tables' records reference it — so the first
    // overwrite in one table releases entries the other still needs, and
    // the file reloads with those cells empty. No corpus table shares a
    // data list (0 of 52), so the save refuses instead.
    const doc = NumbersDocument.blank();
    const sheet = doc.sheets()[0]!;
    const original = doc.tables()[0]!;
    original.setCell(1, 0, "skabelon");
    const clone = doc.addTable(sheet.id, { name: "Kopi" });
    clone.setCell(1, 0, "skabelon");

    const listRefOf = (m: TableModel) =>
      m.object.message
        .getMessage(TableModelFields.BASE_DATA_STORE)!
        .getMessage(DataStoreFields.STRING_TABLE)!;
    const originalList = listRefOf(original).getVarint(1)!;
    const cloneList = listRefOf(clone).getVarint(1)!;
    listRefOf(clone).setVarint(1, originalList);
    clone.object.message.markDirty();
    clone.object.setObjectReferences(
      clone.object.getObjectReferences().map((id) => (id === cloneList ? originalList : id)),
    );

    // Overwriting the original's cell releases the entry the clone's
    // record still references.
    original.setCell(1, 0, "overskrevet");
    expect(() => doc.save()).toThrow(/reference strings absent/);
  });

  it("addTable forks the data lists, so the loop the report ran stays intact", () => {
    const doc = NumbersDocument.blank();
    const sheet = doc.sheets()[0]!;
    const original = doc.tables()[0]!;
    original.setCell(1, 0, "skabelon");
    const clone = doc.addTable(sheet.id, { name: "Kopi" });
    const listIdOf = (m: TableModel) =>
      refId(m.object.message.getMessage(TableModelFields.BASE_DATA_STORE), DataStoreFields.STRING_TABLE);
    expect(listIdOf(original) === listIdOf(clone)).toBe(false);

    original.setCell(1, 0, "dok 1");
    clone.setCell(1, 0, "dok 2");
    const reloaded = NumbersDocument.load(doc.save());
    expect(reloaded.tables().find((t) => t.name === "Kopi")!.cellText(1, 0)).toBe("dok 2");
    expect(reloaded.tables().find((t) => t.name !== "Kopi")!.cellText(1, 0)).toBe("dok 1");
  });
});

describe("tables() is document order", () => {
  it("Numbers keeps the sheet's own table first after addTable", () => {
    const doc = NumbersDocument.blank();
    const sheet = doc.sheets()[0]!;
    const originalId = doc.tables()[0]!.object.identifier;
    doc.addTable(sheet.id, { name: "Kopi A" });
    doc.addTable(sheet.id, { name: "Kopi B" });
    expect(doc.tables()[0]!.object.identifier).toBe(originalId);
    expect(doc.tables().map((t) => t.name).slice(1)).toEqual(["Kopi A", "Kopi B"]);
  });

  it("Pages lists tables by their anchors in the text", () => {
    const doc = PagesDocument.load(
      new Uint8Array(readFileSync(new URL("picodocs-v14.4-headers-tables.pages", FIXTURES))),
    );
    const anchored = doc.body
      .attachments()
      .filter((a) => a.drawableId !== undefined && doc.store.object(a.drawableId)?.type === 6000)
      .map((a) => a.drawableId);
    expect(anchored.length).toBe(3);
    expect(doc.tables().map((t) => t.infoObject?.identifier)).toEqual(anchored);
  });
});

describe("Pages inline table insertion", () => {
  it("clones a donor, anchors it in the text, and the copy is independent", () => {
    const doc = PagesDocument.load(
      new Uint8Array(readFileSync(new URL("picodocs-v14.4-headers-tables.pages", FIXTURES))),
    );
    const countBefore = doc.tables().length;
    const sourceName = doc.tables()[0]!.name;
    const pos = doc.body.text.length;
    const added = doc.insertInlineTable(pos, { name: "Ny tabel", withContent: false });
    added.setCell(1, 0, "egen celle");

    const reloaded = PagesDocument.load(doc.save());
    expect(reloaded.tables().length).toBe(countBefore + 1);
    const found = reloaded.tables().find((t) => t.name === "Ny tabel")!;
    expect(found.cellText(1, 0)).toBe("egen celle");
    // The donor kept its content and its name.
    expect(reloaded.tables()[0]!.name).toBe(sourceName);
    // Anchored: an attachment resolves to the new info, in text order last.
    const anchors = reloaded.body
      .attachments()
      .filter((a) => a.drawableId !== undefined && reloaded.store.object(a.drawableId)?.type === 6000);
    expect(anchors.length).toBe(countBefore + 1);
    expect(reloaded.tables().map((t) => t.name).at(-1)).toBe("Ny tabel");
  });

  it("throws without a donor rather than inventing a table", () => {
    const doc = PagesDocument.blank();
    expect(() => doc.insertInlineTable(0)).toThrow(/no table to copy/);
  });
});

describe("inserted rows and columns inherit band styling", () => {
  it("a new row's cells carry the displaced row's style ids", () => {
    // Apple's own shape: a blank-but-styled record — 2043 of the
    // corpus's 2275 empty records carry a text style. Without it an
    // inserted row loses the band's look, which is the field report's
    // "insertRows does not inherit style" finding.
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const table = doc.tables()[0]!;
    const row = 2;
    const sourceText = table.textStyleId(row, 0);
    const sourceCell = table.cellStyleId(row, 0);
    expect(sourceText !== undefined || sourceCell !== undefined).toBe(true);

    table.insertRows(row, 1);
    const reloaded = NumbersDocument.load(doc.save()).tables()[0]!;
    expect(reloaded.cellText(row, 0)).toBe("");
    expect(reloaded.textStyleId(row, 0)).toBe(sourceText);
    expect(reloaded.cellStyleId(row, 0)).toBe(sourceCell);
    // The displaced row moved down intact.
    expect(reloaded.textStyleId(row + 1, 0)).toBe(sourceText);
  });

  it("a new column inherits per row, and the style refcounts hold up", () => {
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const table = doc.tables()[0]!;
    const column = 1;
    const sourceHeader = table.textStyleId(0, column);
    table.insertColumns(column, 1);
    const reloaded = NumbersDocument.load(doc.save()).tables()[0]!;
    expect(reloaded.textStyleId(0, column)).toBe(sourceHeader);
    // Deleting the inserted column releases only its own references; the
    // original column keeps its styles.
    reloaded.deleteColumns(column, 1);
    const again = NumbersDocument.load(reloaded.store.save()).tables()[0]!;
    expect(again.textStyleId(0, column)).toBe(sourceHeader);
  });

  it("textStyle resolves to the same handle currency as cellStyle", () => {
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-issue102.numbers"));
    const table = doc.tables()[0]!;
    const handle = table.textStyle(0, 0);
    expect(handle !== undefined).toBe(true);
  });
});

describe("cell borders live in the stroke sidecar", () => {
  it("writes runs the app draws, and reads them back", () => {
    // None of the corpus's 4139 cell-style bags carries a per-side
    // stroke; every bordered corpus table keeps them in
    // TableModelArchive.stroke_sidecar as per-edge layers of runs. A
    // bag-only border rendered nothing in the returned demo.
    const doc = NumbersDocument.blank();
    const table = doc.tables()[0]!;
    table.setCell(2, 1, "kant");
    table.setCellFormatting(2, 1, {
      borders: {
        top: solidStroke({ r: 0.75, g: 0.22, b: 0.17 }, 2),
        bottom: solidStroke({ r: 0.75, g: 0.22, b: 0.17 }, 2),
        left: solidStroke({ r: 0.75, g: 0.22, b: 0.17 }, 2),
        right: solidStroke({ r: 0.75, g: 0.22, b: 0.17 }, 2),
      },
    });

    const reloaded = NumbersDocument.load(doc.save()).tables()[0]!;
    const borders = reloaded.cellBorders(2, 1);
    expect(borders.top?.width).toBe(2);
    expect(borders.left?.width).toBe(2);
    expect(borders.right?.color?.r ?? 0).toBeCloseTo(0.75, 2);
    // The sidecar exists, hangs off the model, and the neighbour cell
    // shows no borders — runs are one cell long.
    expect(Object.keys(reloaded.cellBorders(3, 1)).length).toBe(0);
    const sidecarRef = reloaded.object.message.getMessage(TableModelFields.STROKE_SIDECAR);
    expect(sidecarRef !== undefined).toBe(true);
  });

  it("horizontal alignment rides the cell's text style", () => {
    // 127 corpus cells align left and 121 right through a
    // TSWP.ParagraphStyleArchive named by the record's text_style_id;
    // the cell style has no horizontal field at all.
    const doc = NumbersDocument.blank();
    const table = doc.tables()[0]!;
    table.setCell(1, 1, "centreret");
    table.setCellFormatting(1, 1, { horizontalAlignment: "center" });

    const reloaded = NumbersDocument.load(doc.save()).tables()[0]!;
    const styleObj = reloaded.textStyle(1, 1)!.object;
    expect(reloaded.store.typeNameOf(styleObj)).toBe("TSWP.ParagraphStyleArchive");
    expect(styleObj.message.getMessage(12)?.getUint(1)).toBe(2);
    // null drops the cell's own text style so the band default rules.
    reloaded.setCellFormatting(1, 1, { horizontalAlignment: null });
    const again = NumbersDocument.load(reloaded.store.save()).tables()[0]!;
    expect(again.textStyleId(1, 1)).toBe(undefined);
  });

  it("null removes an edge without touching the others", () => {
    const doc = NumbersDocument.blank();
    const table = doc.tables()[0]!;
    table.setCell(1, 1, "x");
    table.setCellFormatting(1, 1, {
      borders: { top: solidStroke({ r: 0, g: 0, b: 0 }, 1), left: solidStroke({ r: 0, g: 0, b: 0 }, 1) },
    });
    table.setCellFormatting(1, 1, { borders: { top: null } });
    const reloaded = NumbersDocument.load(doc.save()).tables()[0]!;
    const borders = reloaded.cellBorders(1, 1);
    expect(borders.top).toBe(undefined);
    expect(borders.left?.width).toBe(1);
  });
});

describe("cell input normalisation", () => {
  /**
   * The stakes: a bare value that falls through every `setCell` case
   * writes an **empty** record, so the natural call silently erases the
   * cell. Plain values are therefore first class, and anything genuinely
   * unrecognised throws instead of destroying data.
   */
  it("accepts the plain form of every type that has one", () => {
    expect(normalizeCellInput("hi")).toEqual({ type: "text", value: "hi" });
    expect(normalizeCellInput(42)).toEqual({ type: "number", value: 42 });
    expect(normalizeCellInput(0)).toEqual({ type: "number", value: 0 });
    expect(normalizeCellInput(false)).toEqual({ type: "bool", value: false });
    expect(normalizeCellInput("")).toEqual({ type: "text", value: "" });
    const when = new Date(Date.UTC(2024, 0, 2));
    expect(normalizeCellInput(when)).toEqual({ type: "date", value: when });
  });

  it("treats null and undefined as clearing the cell", () => {
    expect(normalizeCellInput(null)).toEqual({ type: "empty" });
    expect(normalizeCellInput(undefined)).toEqual({ type: "empty" });
  });

  it("passes a tagged value through untouched", () => {
    // The duration tag is the reason the tagged form survives at all: a
    // bare number cannot say "45 minutes" rather than "the number 2700".
    const duration = { type: "duration", seconds: 2700 } as const;
    expect(normalizeCellInput(duration)).toBe(duration);
    expect(normalizeCellInput({ type: "empty" })).toEqual({ type: "empty" });
  });

  it("throws on the shapes that used to erase the cell", () => {
    const rejected = (value: unknown): string => {
      try {
        normalizeCellInput(value as never);
        return "accepted";
      } catch (error) {
        return (error as Error).message;
      }
    };
    expect(rejected({ value: "no tag" })).toContain("unrecognised cell value");
    expect(rejected({ type: "richText", value: "x" })).toContain("unrecognised cell value");
    expect(rejected(NaN)).toContain("cannot write NaN");
    expect(rejected(Infinity)).toContain("cannot write Infinity");
    expect(rejected(new Date("nonsense"))).toContain("invalid Date");
    expect(rejected(() => 1)).toContain("cannot write a function");
  });

  it("refuses before touching the row, so a bad write changes nothing", () => {
    // Normalising after the layout was rebuilt would leave the table
    // half-written on a throw.
    const doc = NumbersDocument.load(fixture("numbers-parser-v26.0-categories.numbers"));
    const table = doc.tables()[0]!;
    const before = table.cellText(1, 0);
    let threw = false;
    try {
      table.setCell(1, 0, { value: "no tag" } as never);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(table.cellText(1, 0)).toBe(before);
  });
});
