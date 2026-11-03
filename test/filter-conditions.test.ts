/**
 * Every condition the filter menu offers, written by this library byte
 * for byte as the app wrote it: each app-written rule in the fixtures is
 * re-authored on its own table and column and compared with the original.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import { NumbersDocument } from "../src/index.ts";
import { FilterSetFields } from "../src/tst/filters.ts";
import { conditionHolds, conditionOf, type FilterCondition } from "../src/tst/filter-conditions.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));

/** The condition each column of the seeds asked for, by its header. */
const CONDITIONS: Record<string, Record<string, FilterCondition>> = {
  Text: {
    "is": { operator: "is", value: "Pear" },
    "is not": { operator: "isNot", value: "Pear" },
    "starts with": { operator: "startsWith", value: "P" },
    "ends with": { operator: "endsWith", value: "r" },
    "contains": { operator: "contains", value: "ea" },
    "not contain": { operator: "notContains", value: "ea" },
    "not start with": { operator: "notStartsWith", value: "P" },
    "not end with": { operator: "notEndsWith", value: "r" },
    "is blank": { operator: "isBlank" },
    "is not blank": { operator: "isNotBlank" },
  },
  Number: {
    "equal to": { operator: "=", value: 12 },
    "not equal to": { operator: "<>", value: 12 },
    "greater than": { operator: ">", value: 7 },
    "greater or equal": { operator: ">=", value: 7 },
    "less than": { operator: "<", value: 7 },
    "less or equal": { operator: "<=", value: 7 },
    "between": { operator: "between", from: 5, to: 10 },
    "not between": { operator: "notBetween", from: 5, to: 10 },
    "above average": { operator: "aboveAverage" },
    "below average": { operator: "belowAverage" },
    "top values": { operator: "top", count: 2 },
    "bottom values": { operator: "bottom", count: 2 },
    "top percent": { operator: "topPercent", percent: 50 },
    "bottom percent": { operator: "bottomPercent", percent: 50 },
    "duplicate": { operator: "duplicate" },
    "unique": { operator: "unique" },
    "is blank": { operator: "isBlank" },
    "is not blank": { operator: "isNotBlank" },
  },
  Date: {
    "is": { operator: "dateIs", date: d(2026, 11, 1) },
    "before": { operator: "dateBefore", date: d(2026, 11, 1) },
    "after": { operator: "dateAfter", date: d(2026, 11, 1) },
    "in the range": { operator: "dateInRange", from: d(2026, 10, 1), to: d(2026, 11, 1) },
    "today": { operator: "today" },
    "yesterday": { operator: "yesterday" },
    "tomorrow": { operator: "tomorrow" },
    "this week": { operator: "dateInThis", unit: "week" },
    "this month": { operator: "dateInThis", unit: "month" },
    "this quarter": { operator: "dateInThis", unit: "quarter" },
    "this year": { operator: "dateInThis", unit: "year" },
    "last days": { operator: "dateInLast", count: 3, unit: "day" },
    "last weeks": { operator: "dateInLast", count: 2, unit: "week" },
    "last months": { operator: "dateInLast", count: 1, unit: "month" },
    "last quarters": { operator: "dateInLast", count: 1, unit: "quarter" },
    "last years": { operator: "dateInLast", count: 1, unit: "year" },
    "next days": { operator: "dateInNext", count: 3, unit: "day" },
    "exactly ago": { operator: "dateExactly", count: 2, unit: "day", direction: "ago" },
    "exactly from now": { operator: "dateExactly", count: 1, unit: "week", direction: "fromNow" },
    "before ago": { operator: "dateBeforeRelative", count: 2, unit: "month", direction: "ago" },
    "after from now": { operator: "dateAfterRelative", count: 1, unit: "year", direction: "fromNow" },
    "between ago": { operator: "dateBetweenRelative", from: 1, to: 3, unit: "day", direction: "ago" },
    "is blank": { operator: "isBlank" },
  },
  Duration: {
    "equal to": { operator: "durationEquals", seconds: 3600 },
    "greater than": { operator: "durationGreaterThan", seconds: 3600 },
    "between": { operator: "durationBetween", from: 600, to: 5400 },
    "is blank": { operator: "isBlank" },
  },
  Checkbox: {
    "is checked": { operator: "checked" },
    "is not checked": { operator: "unchecked" },
  },
};

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

describe("every filter condition is written byte for byte as the app wrote it", () => {
  for (const name of ["olekristensen-v26.0-mac-filter-conditions.numbers", "olekristensen-v26.0-ios-filter-number-conditions.numbers"]) {
    it(name, () => {
      const doc = NumbersDocument.load(fixture(name));
      let compared = 0;
      for (const table of doc.tables()) {
        const kind = table.name?.split(" ")[0] ?? "";
        const byLabel = CONDITIONS[kind];
        const set = table.filterSets().rows;
        if (!byLabel || !set) continue;
        const rules = set.rules();
        for (const [i, rule] of rules.entries()) {
          const label = table.cellText(0, rule.column!);
          const condition = byLabel[label];
          if (!condition) throw new Error(`${name}: no condition for ${kind} / ${label}`);
          const before = set.object.message.getMessages(FilterSetFields.RULES).map((r) => hex(r.toBytes()));
          const index = table.addFilterRule(rule.column!, condition);
          const after = set.object.message.getMessages(FilterSetFields.RULES).map((r) => hex(r.toBytes()));
          expect(`${kind} / ${label}: ${after[index] === before[i] ? "same" : "differs"}`).toBe(`${kind} / ${label}: same`);
          expect(conditionOf(rules[i]!.predicate!)).toEqual(condition);
          compared++;
        }
      }
      expect(compared > 0).toBe(true);
    });
  }
});

describe("conditions evaluate offline", () => {
  const now = new Date(2026, 10, 3, 12);
  const col = [3, 12, 7, undefined, 12];
  it("ranks, averages and counts within the column", () => {
    expect(col.map((v) => conditionHolds({ operator: "aboveAverage" }, v, col))).toEqual([false, true, false, false, true]);
    expect(col.map((v) => conditionHolds({ operator: "top", count: 2 }, v, col))).toEqual([false, true, false, false, true]);
    expect(col.map((v) => conditionHolds({ operator: "bottomPercent", percent: 50 }, v, col))).toEqual([true, false, true, false, false]);
    expect(col.map((v) => conditionHolds({ operator: "duplicate" }, v, col))).toEqual([false, true, false, false, true]);
    expect(col.map((v) => conditionHolds({ operator: "unique" }, v, col))).toEqual([true, false, true, false, false]);
    expect(col.map((v) => conditionHolds({ operator: "notBetween", from: 10, to: 5 }, v, col))).toEqual([true, true, false, false, true]);
  });
  it("reads dates relative to today and in calendar units", () => {
    const dates = [d(2026, 11, 1), d(2026, 10, 15), d(2026, 11, 20), undefined, d(2025, 3, 3)];
    const holds = (c: FilterCondition) => dates.map((v) => conditionHolds(c, v, dates, now));
    expect(holds({ operator: "dateInLast", count: 3, unit: "day" })).toEqual([true, false, false, false, false]);
    expect(holds({ operator: "dateInThis", unit: "month" })).toEqual([true, false, true, false, false]);
    expect(holds({ operator: "dateInThis", unit: "quarter" })).toEqual([true, true, true, false, false]);
    expect(holds({ operator: "dateExactly", count: 2, unit: "day", direction: "ago" })).toEqual([true, false, false, false, false]);
    expect(holds({ operator: "dateBeforeRelative", count: 2, unit: "week", direction: "ago" })).toEqual([false, true, false, false, true]);
    expect(holds({ operator: "dateInNext", count: 1, unit: "month" })).toEqual([false, false, true, false, false]);
    expect(holds({ operator: "dateInRange", from: d(2026, 10, 1), to: d(2026, 11, 1) })).toEqual([true, true, false, false, false]);
  });
  it("compares text without case, durations in seconds and checkboxes as booleans", () => {
    expect(conditionHolds({ operator: "is", value: "pear" }, "Pear", [])).toBe(true);
    expect(conditionHolds({ operator: "notEndsWith", value: "R" }, "Pear", [])).toBe(false);
    expect(conditionHolds({ operator: "durationBetween", from: 5400, to: 600 }, { seconds: 3600 }, [])).toBe(true);
    expect(conditionHolds({ operator: "unchecked" }, false, [])).toBe(true);
    expect(conditionHolds({ operator: "unchecked" }, undefined, [])).toBe(false);
  });
});
