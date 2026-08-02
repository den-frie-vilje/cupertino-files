/**
 * Pre-BNC cell storage — the iWork '13/'15 layout, read at last.
 *
 * Six of the corpus's tables use storage version 4, and this library used
 * to throw on all of them. The layout is not documented anywhere; it was
 * measured from those very files, with the string table beside them acting
 * as the oracle — a wrong offset does not produce a coherent checkbook.
 *
 * These tests are deliberately of two kinds. The unit tests pin the record
 * layout byte-for-byte so a regression is a diff rather than a mystery. The
 * corpus tests assert the *meaning*: October 2009 dates in ascending order,
 * descriptions that match their amounts. That second kind is what makes a
 * silent off-by-four fail loudly.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { IWorkDocument, tablesOf } from "../src/index.ts";
import { PRE_BNC_VERSION, decodePreBncRecord, splitPreBncRow } from "../src/tst/prebnc.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const fixtureNames = readdirSync(FIXTURES).filter((n) => /\.(pages|numbers|key)$/.test(n));
const bytes = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));

function open(name: string): IWorkDocument | undefined {
  try {
    return IWorkDocument.open(bytes(name));
  } catch {
    return undefined; // iWork '09 XML is rejected on purpose
  }
}

/** Build a record with the measured header, then a raw payload. */
function record(type: number, flags: number, extras: number, payload: number[]): Uint8Array {
  const out = new Uint8Array(12 + payload.length);
  const view = new DataView(out.buffer);
  out[0] = PRE_BNC_VERSION;
  out[1] = type;
  view.setUint32(4, flags, true);
  view.setUint32(8, extras, true);
  out.set(payload, 12);
  return out;
}

const u32 = (v: number): number[] => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
const f64 = (v: number): number[] => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, v, true);
  return [...b];
};

describe("the pre-BNC record", () => {
  it("reads a text cell's string key from the last word", () => {
    // flags 0x14, the commonest shape: one leading word, then the key.
    const decoded = decodePreBncRecord(record(3, 0x14, 0, [...u32(1), ...u32(9)]));
    expect(decoded?.type).toBe(3);
    expect(decoded?.flags).toBe(0x14);
    expect(decoded?.stringId).toBe(9);
    expect(decoded?.leading).toEqual([1]);
  });

  it("reads a text cell that carries an extra word before the key", () => {
    // flags 0x94 — the shape that made a naive by-flag reading pick the
    // wrong word and render a whole column as one repeated string.
    const decoded = decodePreBncRecord(record(3, 0x94, 0x10, [...u32(3), ...u32(1), ...u32(8)]));
    expect(decoded?.stringId).toBe(8);
    expect(decoded?.leading).toEqual([3, 1]);
  });

  it("reads a number as an IEEE double before the trailing word", () => {
    const decoded = decodePreBncRecord(record(2, 0x24, 0x10000, [...u32(4), ...f64(2), ...u32(4)]));
    expect(decoded?.number).toBe(2);
    expect(decoded?.trailingId).toBe(4);
    expect(decoded?.stringId).toBe(undefined);
  });

  it("reads a date as seconds since 2001", () => {
    // 276048000 s after 2001-01-01 is 2009-10-01.
    const decoded = decodePreBncRecord(
      record(5, 0xc4, 0x20018, [...u32(4), ...u32(3), ...f64(276048000), ...u32(3)]),
    );
    expect(decoded?.seconds).toBe(276048000);
    expect(new Date(Date.UTC(2001, 0, 1) + 276048000 * 1000).toISOString()).toBe(
      "2009-10-01T00:00:00.000Z",
    );
  });

  it("refuses a shape it has not measured rather than guessing", () => {
    // Right version, right type, payload length nobody has seen.
    expect(decodePreBncRecord(record(2, 0x24, 0, [...u32(1)]))).toBe(undefined);
    // A cell type with no measured layout at all.
    expect(decodePreBncRecord(record(6, 0x14, 0, [...u32(1), ...u32(2)]))).toBe(undefined);
    // A v5 record must not be read as a v4 one.
    const v5 = record(3, 0x14, 0, [...u32(1), ...u32(2)]);
    v5[0] = 5;
    expect(decodePreBncRecord(v5)).toBe(undefined);
    expect(decodePreBncRecord(new Uint8Array(4))).toBe(undefined);
  });

  it("splits a row on its offsets, skipping absent columns", () => {
    const offsets = new Uint8Array(12);
    const view = new DataView(offsets.buffer);
    view.setUint16(0, 0xffff, true); // column 0 absent
    view.setUint16(2, 0, true);
    view.setUint16(4, 0xffff, true);
    view.setUint16(6, 4, true);
    view.setUint16(8, 0xffff, true);
    view.setUint16(10, 0xffff, true);
    const split = splitPreBncRow(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]), offsets);
    expect(split.map((s) => s.column)).toEqual([1, 3]);
    expect([...split[0]!.bytes]).toEqual([1, 2, 3, 4]);
    // The last cell runs to the end of the buffer.
    expect([...split[1]!.bytes]).toEqual([5, 6, 7, 8, 9]);
  });
});

describe("pre-BNC tables in the corpus", () => {
  it("decodes every pre-BNC cell, refusing none", () => {
    let tables = 0;
    let cells = 0;
    let refused = 0;
    for (const name of fixtureNames) {
      const document = open(name);
      if (!document) continue;
      for (const table of tablesOf(document.store)) {
        if (table.storageGeneration !== "preBNC") continue;
        tables++;
        cells += table.cells().length;
        refused += table.undecodedPreBncCells();
        expect(table.hasReadableCells).toBe(true);
      }
    }
    // Four documents, six tables, 123 records — the whole pre-BNC corpus.
    expect(tables).toBe(6);
    expect(cells).toBe(123);
    expect(refused).toBe(0);
  });

  it("reads a checkbook register that makes sense as a checkbook register", () => {
    // The real test. Any wrong offset still yields numbers and strings; only
    // a right one yields a month of transactions in date order with
    // descriptions that match their amounts.
    const document = open("tika-testNumbers2013.numbers")!;
    const table = tablesOf(document.store).find((t) => t.name === "Transactions")!;

    expect(table.cellText(1, 0)).toBe("Type");
    expect(table.cellText(1, 2)).toBe("Description");
    expect(table.cellText(2, 0)).toBe("101");
    expect(table.cellText(2, 2)).toBe("Rent");
    expect(table.cellText(4, 2)).toBe("Fill up SUV for camping trip");

    const dates: Date[] = [];
    for (let row = 2; row < 10; row++) {
      const value = table.cellValue(row, 1);
      expect(value?.type).toBe("date");
      if (value?.type === "date") dates.push(value.value);
    }
    expect(dates.length).toBe(8);
    expect(dates[0]!.toISOString()).toBe("2009-10-01T00:00:00.000Z");
    // Strictly ascending: a register is chronological, and an offset error
    // would scatter these.
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]!.getTime() > dates[i - 1]!.getTime()).toBe(true);
    }

    // Rent is an expense, the paycheck is not.
    const amount = (row: number): number => {
      const value = table.cellValue(row, 4);
      return value?.type === "number" ? value.value : NaN;
    };
    expect(amount(2)).toBe(-775);
    expect(amount(9)).toBe(1525);
  });

  it("reads a pre-BNC table inside a Pages document too", () => {
    // The layout is the storage, not the app: a 2013 Pages file uses it for
    // its tables exactly as Numbers does.
    const document = open("tika-testPages2013.pages")!;
    const table = tablesOf(document.store).find((t) => t.storageGeneration === "preBNC")!;
    expect(table.cells().length).toBe(12);
    expect(table.cells().every((c) => c.value.type !== "empty")).toBe(true);
  });

  it("never claims a pre-BNC formula", () => {
    // Pre-BNC formulas are not decoded. Reporting one as a literal would be
    // a lie a caller cannot detect.
    for (const name of fixtureNames) {
      const document = open(name);
      if (!document) continue;
      for (const table of tablesOf(document.store)) {
        if (table.storageGeneration !== "preBNC") continue;
        for (const cell of table.cells()) {
          if (cell.value.type === "empty" || cell.value.type === "error") continue;
          expect(cell.value.isFormula).toBe(false);
        }
      }
    }
  });
});
