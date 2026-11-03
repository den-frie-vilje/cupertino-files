/**
 * The conditions Numbers' filter menu offers, as this library writes and
 * evaluates them.
 *
 * Each condition is measured on an app-written rule
 * (`olekristensen-v26.0-mac-filter-conditions.numbers` and its
 * companions): the `predicate_type` and qualifiers it carries, the
 * operands it stores, and the formula the app compiles for it, which
 * {@link compileCondition} rebuilds expression for expression. The
 * relative date conditions share one shape, a point `count` units from
 * today in a direction, measured in every unit and both directions
 * across the family. {@link conditionOf} reads a stored predicate back
 * into the same form, and {@link conditionHolds} evaluates one offline so
 * the hidden rows can be written beside the rule.
 */
import type { FormulaExpression } from "./formula-builder.ts";
import type { Predicate, PredicateOperator } from "./predicates.ts";
import { PREDICATE_TYPE_OPERATORS } from "./predicates.ts";
import { APPLE_EPOCH_MS } from "../base/bytes.ts";

export type DateUnit = "day" | "week" | "month" | "quarter" | "year";
export type RelativeDirection = "ago" | "fromNow";

/** A filter rule's condition, named as the filter menu names it. */
export type FilterCondition =
  | { operator: PredicateOperator; value: number | string }
  | { operator: "contains" | "startsWith" | "endsWith" | "notContains" | "notStartsWith" | "notEndsWith" | "is" | "isNot"; value: string }
  | { operator: "isBlank" | "isNotBlank" }
  | { operator: "between" | "notBetween"; from: number; to: number }
  | { operator: "aboveAverage" | "belowAverage" | "duplicate" | "unique" }
  | { operator: "top" | "bottom"; count: number }
  | { operator: "topPercent" | "bottomPercent"; percent: number }
  | { operator: "dateIs" | "dateBefore" | "dateAfter"; date: Date }
  | { operator: "dateInRange"; from: Date; to: Date }
  | { operator: "today" | "yesterday" | "tomorrow" }
  | { operator: "dateInThis"; unit: DateUnit }
  | { operator: "dateInLast" | "dateInNext"; count: number; unit: DateUnit }
  | { operator: "dateExactly" | "dateBeforeRelative" | "dateAfterRelative"; count: number; unit: DateUnit; direction: RelativeDirection }
  | { operator: "dateBetweenRelative"; from: number; to: number; unit: DateUnit; direction: RelativeDirection }
  | { operator: "durationEquals" | "durationGreaterThan"; seconds: number }
  | { operator: "durationBetween"; from: number; to: number }
  | { operator: "checked" | "unchecked" };

/** A literal operand as the predicate stores it beside the formula. */
export type ConditionOperand =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "date"; seconds: number }
  | { kind: "duration"; seconds: number; units: number };

export interface CompiledCondition {
  predicateType: number;
  qualifier1: number;
  qualifier2: number;
  operands: ConditionOperand[];
  expression: FormulaExpression;
  /** The cell operand names the column alone, as the average, rank, duplicate and unique conditions do. */
  wholeColumn: boolean;
}

/** `qualifier1` codes for a date condition's unit. */
const DATE_UNIT_CODE: Record<DateUnit, number> = { day: 2, week: 3, month: 4, year: 5, quarter: 8 };
const DATE_UNIT_BY_CODE = new Map(Object.entries(DATE_UNIT_CODE).map(([unit, code]) => [code, unit as DateUnit]));
/** `qualifier2` codes for a relative date condition's direction. */
const DIRECTION_CODE: Record<RelativeDirection, number> = { ago: 6, fromNow: 7 };
/** `qualifier1` codes for a rank condition's measure. */
const RANK_VALUES = 10;
const RANK_PERCENT = 9;
/** The checkbox test's function, which the registry does not name, and the control's interaction type. */
const CELL_CONTROL_TYPE_FUNCTION = 326;
const CHECKBOX_INTERACTION_TYPE = 8;

const num = (value: number): FormulaExpression => ({ kind: "number", value });
const str = (value: string): FormulaExpression => ({ kind: "string", value });
const bool = (value: boolean): FormulaExpression => ({ kind: "boolean", value });
const call = (name: string, ...args: FormulaExpression[]): FormulaExpression => ({ kind: "call", name, args });
const bin = (op: "+" | "-" | "*" | "/" | "=" | "<>" | "<" | "<=" | ">" | ">=", left: FormulaExpression, right: FormulaExpression): FormulaExpression => ({ kind: "binary", op, left, right });
const thunk = (expression: FormulaExpression): FormulaExpression => ({ kind: "thunk", expression });
const group = (expression: FormulaExpression): FormulaExpression => ({ kind: "group", expression });
const today = (): FormulaExpression => call("TODAY");
/** A whole-day duration literal as the date conditions carry it: typed in days, shown hours to seconds. */
const days = (count: number): FormulaExpression => ({ kind: "duration", seconds: count * 86400, unit: 3, style: 1, largestUnit: 4, smallestUnit: 16 });
const dateLiteral = (date: Date): FormulaExpression => ({ kind: "date", seconds: dateSeconds(date) });

export function dateSeconds(date: Date): number {
  return (date.getTime() - APPLE_EPOCH_MS) / 1000;
}

/**
 * A duration literal in a duration comparison, typed in hours or minutes:
 * whole hours show as hours, whole minutes under an hour as minutes, and
 * hours with minutes as both. Seconds and days are unmeasured and refused.
 */
function durationLiteral(seconds: number): { expression: FormulaExpression; units: number } {
  if (!Number.isInteger(seconds) || seconds <= 0 || seconds % 60 !== 0) {
    throw new RangeError(`a duration condition takes whole minutes or hours, not ${seconds} seconds`);
  }
  const hours = seconds >= 3600;
  const wholeHours = seconds % 3600 === 0;
  const largestUnit = hours ? 4 : 8;
  const smallestUnit = wholeHours ? 4 : 8;
  return {
    expression: { kind: "duration", seconds, unit: hours ? 4 : 5, style: 0, largestUnit, smallestUnit },
    units: largestUnit,
  };
}

/** `count` units from today, in `direction`: the point every relative date condition compares against. */
function relativePoint(count: number, unit: DateUnit, direction: RelativeDirection): FormulaExpression {
  const sign = num(direction === "ago" ? -1 : 1);
  switch (unit) {
    case "day":
      return bin("+", today(), bin("*", call("DURATION", num(0), num(count)), sign));
    case "week":
      return bin("+", today(), bin("*", call("DURATION", num(count), num(0)), sign));
    case "month":
      return call("EDATE", today(), bin("*", num(count), sign));
    case "quarter":
      return call("EDATE", today(), bin("*", bin("*", num(count), num(3)), sign));
    case "year":
      return call("EDATE", today(), bin("*", bin("*", num(count), num(12)), sign));
  }
}

/** `IF(a<=b, thunk(inRange(a, b)), thunk(inRange(b, a)))`: a between test that tolerates swapped bounds. */
function eitherOrder(a: FormulaExpression, b: FormulaExpression, inRange: (low: FormulaExpression, high: FormulaExpression) => FormulaExpression): FormulaExpression {
  return call("IF", bin("<=", a, b), thunk(inRange(a, b)), thunk(inRange(b, a)));
}

/** The first day of the current week, month, quarter or year, as the app computes it. */
function thisUnitBounds(unit: DateUnit, cell: FormulaExpression): FormulaExpression {
  const year = call("YEAR", today());
  const month = call("MONTH", today());
  switch (unit) {
    case "week": {
      const start = bin("-", today(), bin("-", call("WEEKDAY", today()), num(1)));
      return call("AND", bin(">=", cell, start), bin("<", cell, bin("+", start, days(7))));
    }
    case "month":
      return call("AND", bin(">=", cell, call("DATE", year, month, num(1))), bin("<", cell, call("DATE", year, bin("+", month, num(1)), num(1))));
    case "quarter": {
      const quarterStart = group(bin("-", call("CEILING", bin("/", month, num(3)), num(1)), num(1)));
      return call(
        "AND",
        bin(">=", cell, call("DATE", year, bin("+", bin("*", quarterStart, num(3)), num(1)), num(1))),
        bin("<", cell, call("DATE", year, bin("+", bin("*", quarterStart, num(3)), num(4)), num(1))),
      );
    }
    case "year":
      return call("AND", bin(">=", cell, call("DATE", year, num(1), num(1))), bin("<", cell, call("DATE", bin("+", year, num(1)), num(1), num(1))));
    case "day":
      throw new RangeError("the filter menu has no \"in this day\"; use today");
  }
}

/**
 * The predicate a condition writes: its codes, its stored operands and
 * the formula the app compiles for it, over `cell` (the row's cell in the
 * rule's column) or `column` (the whole column).
 */
export function compileCondition(condition: FilterCondition, cell: FormulaExpression, column: FormulaExpression): CompiledCondition {
  const c = cell;
  const out = (predicateType: number, expression: FormulaExpression, operands: ConditionOperand[] = [], qualifier1 = 0, qualifier2 = 0, wholeColumn = false): CompiledCondition => ({ predicateType, qualifier1, qualifier2, operands, expression, wholeColumn });
  const find = (needle: string) => call("FIND.CASEINSENSITIVE", str(needle), c);
  const endsWith = (needle: string) => call("FIND.CASEINSENSITIVE", str(needle), call("RIGHT", c, call("LEN", str(needle))));
  switch (condition.operator) {
    case "=": case "<>": case ">": case ">=": case "<": case "<=": {
      const type = [...PREDICATE_TYPE_OPERATORS].find(([, op]) => op === condition.operator)![0];
      const literal: FormulaExpression = typeof condition.value === "number" ? num(condition.value) : str(condition.value);
      const operand: ConditionOperand = typeof condition.value === "number" ? { kind: "number", value: condition.value } : { kind: "string", value: condition.value };
      return out(type, bin(condition.operator, c, literal), [operand]);
    }
    case "startsWith": return out(1, bin("=", find(condition.value), num(1)), [{ kind: "string", value: condition.value }]);
    case "endsWith": return out(2, endsWith(condition.value), [{ kind: "string", value: condition.value }]);
    case "contains": return out(3, call("NOT", call("ISERROR", find(condition.value))), [{ kind: "string", value: condition.value }]);
    case "notContains": return out(4, call("ISERROR", find(condition.value)), [{ kind: "string", value: condition.value }]);
    case "notStartsWith": return out(61, call("IFERROR", bin("<>", find(condition.value), num(1)), bool(true)), [{ kind: "string", value: condition.value }]);
    case "notEndsWith": return out(62, call("IFERROR", call("NOT", endsWith(condition.value)), bool(true)), [{ kind: "string", value: condition.value }]);
    case "is": {
      const n = condition.value;
      return out(36, call("IF", bin("=", call("LEN", str(n)), call("LEN", c)), thunk(bin("=", find(n), num(1)))), [{ kind: "string", value: n }]);
    }
    case "isNot": {
      const n = condition.value;
      const inner = call("IF", call("ISERROR", find(n)), thunk(bool(true)), thunk(bin("<>", find(n), num(1))));
      return out(37, call("IF", bin("<>", call("LEN", str(n)), call("LEN", c)), thunk(bool(true)), thunk(inner)), [{ kind: "string", value: n }]);
    }
    case "isBlank": return out(34, call("ISBLANK", c));
    case "isNotBlank": return out(35, call("NOT", call("ISBLANK", c)));
    case "between":
      return out(13, eitherOrder(num(condition.from), num(condition.to), (lo, hi) => call("AND", bin(">=", c, lo), bin("<=", c, hi))), [{ kind: "number", value: condition.from }, { kind: "number", value: condition.to }]);
    case "notBetween":
      return out(32, eitherOrder(num(condition.from), num(condition.to), (lo, hi) => call("OR", bin("<", c, lo), bin(">", c, hi))), [{ kind: "number", value: condition.from }, { kind: "number", value: condition.to }]);
    case "aboveAverage": return out(11, call("SUM", column), [], 0, 0, true);
    case "belowAverage": return out(12, call("SUM", column), [], 0, 0, true);
    case "duplicate": return out(15, call("SUM", column), [], 0, 0, true);
    case "unique": return out(16, call("SUM", column), [], 0, 0, true);
    case "top": return out(30, bin("+", call("SUM", column), num(condition.count)), [{ kind: "number", value: condition.count }], RANK_VALUES, 0, true);
    case "bottom": return out(31, bin("+", call("SUM", column), num(condition.count)), [{ kind: "number", value: condition.count }], RANK_VALUES, 0, true);
    case "topPercent": return out(30, bin("+", call("SUM", column), num(condition.percent)), [{ kind: "number", value: condition.percent }], RANK_PERCENT, 0, true);
    case "bottomPercent": return out(31, bin("+", call("SUM", column), num(condition.percent)), [{ kind: "number", value: condition.percent }], RANK_PERCENT, 0, true);
    case "dateIs": {
      const d = dateLiteral(condition.date);
      return out(20, call("AND", bin("=", call("YEAR", d), call("YEAR", c)), bin("=", call("MONTH", d), call("MONTH", c)), bin("=", call("DAY", d), call("DAY", c))), [{ kind: "date", seconds: dateSeconds(condition.date) }]);
    }
    case "dateBefore":
      return out(21, call("AND", bin("<", c, dateLiteral(condition.date)), call("NOT", call("ISBLANK", c))), [{ kind: "date", seconds: dateSeconds(condition.date) }]);
    case "dateAfter":
      return out(22, bin(">=", c, bin("+", dateLiteral(condition.date), days(1))), [{ kind: "date", seconds: dateSeconds(condition.date) }]);
    case "dateInRange":
      return out(
        23,
        eitherOrder(dateLiteral(condition.from), dateLiteral(condition.to), (lo, hi) => call("AND", bin(">=", c, lo), bin("<", c, bin("+", hi, days(1))))),
        [{ kind: "date", seconds: dateSeconds(condition.from) }, { kind: "date", seconds: dateSeconds(condition.to) }],
      );
    case "today": return out(17, call("AND", bin(">=", c, today()), bin("<", c, bin("+", today(), days(1)))));
    case "yesterday": return out(18, call("AND", bin(">=", c, bin("-", today(), days(1))), bin("<", c, today())));
    case "tomorrow": return out(19, call("AND", bin(">=", c, bin("+", today(), days(1))), bin("<", c, bin("+", today(), days(2)))));
    case "dateInThis": return out(33, thisUnitBounds(condition.unit, c), [], DATE_UNIT_CODE[condition.unit]);
    case "dateInLast":
      return out(25, call("AND", bin(">=", c, relativePoint(condition.count, condition.unit, "ago")), bin("<", c, bin("+", today(), days(1)))), [{ kind: "number", value: condition.count }], DATE_UNIT_CODE[condition.unit]);
    case "dateInNext":
      return out(24, call("AND", bin(">=", c, today()), bin("<", c, bin("+", relativePoint(condition.count, condition.unit, "fromNow"), days(1)))), [{ kind: "number", value: condition.count }], DATE_UNIT_CODE[condition.unit]);
    case "dateExactly":
      return out(26, bin("=", call("DATEDIF", c, relativePoint(condition.count, condition.unit, condition.direction), str("D")), num(0)), [{ kind: "number", value: condition.count }], DATE_UNIT_CODE[condition.unit], DIRECTION_CODE[condition.direction]);
    case "dateBeforeRelative":
      return out(27, call("AND", bin("<", c, relativePoint(condition.count, condition.unit, condition.direction)), call("NOT", call("ISBLANK", c))), [{ kind: "number", value: condition.count }], DATE_UNIT_CODE[condition.unit], DIRECTION_CODE[condition.direction]);
    case "dateAfterRelative":
      return out(28, bin(">=", c, bin("+", relativePoint(condition.count, condition.unit, condition.direction), days(1))), [{ kind: "number", value: condition.count }], DATE_UNIT_CODE[condition.unit], DIRECTION_CODE[condition.direction]);
    case "dateBetweenRelative": {
      const point = (count: number) => relativePoint(count, condition.unit, condition.direction);
      // The app's own operand order: the test runs from the later bound back to the earlier.
      return out(
        29,
        eitherOrder(num(condition.from), num(condition.to), (lo, hi) => call("AND", bin(">=", c, point(numberOf(hi))), bin("<", c, bin("+", point(numberOf(lo)), days(1))))),
        [{ kind: "number", value: condition.from }, { kind: "number", value: condition.to }],
        DATE_UNIT_CODE[condition.unit],
        DIRECTION_CODE[condition.direction],
      );
    }
    case "durationEquals": {
      const lit = durationLiteral(condition.seconds);
      return out(38, bin("=", c, lit.expression), [{ kind: "duration", seconds: condition.seconds, units: lit.units }]);
    }
    case "durationGreaterThan": {
      const lit = durationLiteral(condition.seconds);
      return out(40, bin(">", c, lit.expression), [{ kind: "duration", seconds: condition.seconds, units: lit.units }]);
    }
    case "durationBetween": {
      const a = durationLiteral(condition.from);
      const b = durationLiteral(condition.to);
      return out(44, eitherOrder(a.expression, b.expression, (lo, hi) => call("AND", bin(">=", c, lo), bin("<=", c, hi))), [
        { kind: "duration", seconds: condition.from, units: a.units },
        { kind: "duration", seconds: condition.to, units: b.units },
      ]);
    }
    case "checked": case "unchecked": {
      const control: FormulaExpression = { kind: "call", name: "CELL.CONTROL.TYPE", index: CELL_CONTROL_TYPE_FUNCTION, args: [c] };
      const subject = condition.operator === "checked" ? c : call("NOT", c);
      return out(condition.operator === "checked" ? 55 : 56, call("IF", call("AND", subject, bin("=", control, num(CHECKBOX_INTERACTION_TYPE))), thunk(bool(true)), thunk(bool(false))));
    }
  }
}

function numberOf(expression: FormulaExpression): number {
  if (expression.kind !== "number") throw new RangeError("a relative bound is a number");
  return expression.value;
}

/** The condition a stored predicate was authored under, where its code is measured; undefined otherwise. */
export function conditionOf(predicate: Predicate): FilterCondition | undefined {
  const type = predicate.predicateType;
  if (type === undefined) return undefined;
  const literals = predicate.operands.filter((o) => o.kind !== "cell" && o.kind !== "range" && o.kind !== "none");
  const first = literals[0];
  const second = literals[1];
  const string = (): string | undefined => (first?.kind === "string" ? first.string : undefined);
  const number = (operand = first): number | undefined => (operand?.kind === "number" ? operand.number : undefined);
  const date = (operand = first): Date | undefined => (operand?.kind === "date" ? new Date(APPLE_EPOCH_MS + (operand.number ?? 0) * 1000) : undefined);
  const duration = (operand = first): number | undefined => (operand?.kind === "duration" ? operand.number : undefined);
  const unit = DATE_UNIT_BY_CODE.get(predicate.qualifier1 ?? 0);
  const direction: RelativeDirection | undefined = predicate.qualifier2 === 6 ? "ago" : predicate.qualifier2 === 7 ? "fromNow" : undefined;
  const operator = PREDICATE_TYPE_OPERATORS.get(type);
  if (operator) {
    const value = first?.kind === "number" ? first.number : first?.kind === "string" ? first.string : undefined;
    return value === undefined ? undefined : { operator, value };
  }
  const text = (op: "contains" | "startsWith" | "endsWith" | "notContains" | "notStartsWith" | "notEndsWith" | "is" | "isNot"): FilterCondition | undefined => {
    const value = string();
    return value === undefined ? undefined : { operator: op, value };
  };
  switch (type) {
    case 1: return text("startsWith");
    case 2: return text("endsWith");
    case 3: return text("contains");
    case 4: return text("notContains");
    case 36: return text("is");
    case 37: return text("isNot");
    case 61: return text("notStartsWith");
    case 62: return text("notEndsWith");
    case 34: return { operator: "isBlank" };
    case 35: return { operator: "isNotBlank" };
    case 13: case 32: {
      const from = number(first);
      const to = number(second);
      return from === undefined || to === undefined ? undefined : { operator: type === 13 ? "between" : "notBetween", from, to };
    }
    case 11: return { operator: "aboveAverage" };
    case 12: return { operator: "belowAverage" };
    case 15: return { operator: "duplicate" };
    case 16: return { operator: "unique" };
    case 30: case 31: {
      const n = number();
      if (n === undefined) return undefined;
      if (predicate.qualifier1 === RANK_PERCENT) return { operator: type === 30 ? "topPercent" : "bottomPercent", percent: n };
      return { operator: type === 30 ? "top" : "bottom", count: n };
    }
    case 20: case 21: case 22: {
      const d = date();
      return d === undefined ? undefined : { operator: type === 20 ? "dateIs" : type === 21 ? "dateBefore" : "dateAfter", date: d };
    }
    case 23: {
      const from = date(first);
      const to = date(second);
      return from === undefined || to === undefined ? undefined : { operator: "dateInRange", from, to };
    }
    case 17: return { operator: "today" };
    case 18: return { operator: "yesterday" };
    case 19: return { operator: "tomorrow" };
    case 33: return unit === undefined ? undefined : { operator: "dateInThis", unit };
    case 24: case 25: {
      const count = number();
      return unit === undefined || count === undefined ? undefined : { operator: type === 24 ? "dateInNext" : "dateInLast", count, unit };
    }
    case 26: case 27: case 28: {
      const count = number();
      if (unit === undefined || direction === undefined || count === undefined) return undefined;
      return { operator: type === 26 ? "dateExactly" : type === 27 ? "dateBeforeRelative" : "dateAfterRelative", count, unit, direction };
    }
    case 29: {
      const from = number(first);
      const to = number(second);
      if (unit === undefined || direction === undefined || from === undefined || to === undefined) return undefined;
      return { operator: "dateBetweenRelative", from, to, unit, direction };
    }
    case 38: case 40: {
      const seconds = duration();
      return seconds === undefined ? undefined : { operator: type === 38 ? "durationEquals" : "durationGreaterThan", seconds };
    }
    case 44: {
      const from = duration(first);
      const to = duration(second);
      return from === undefined || to === undefined ? undefined : { operator: "durationBetween", from, to };
    }
    case 55: return { operator: "checked" };
    case 56: return { operator: "unchecked" };
    default: return undefined;
  }
}

/** A cell's value in the plain form conditions compare: text, number, boolean, a date, or a duration in seconds. */
export type PlainCellValue = string | number | boolean | Date | { seconds: number } | undefined;

/** Midnight, as the cells store dates: wall-clock time kept in the UTC fields. */
function dayOf(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** The wall-clock date of `now`, in the form the cells store. */
function todayOf(now: Date): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

const DAY_MS = 86_400_000;

/** `EDATE` arithmetic: `months` on from `day`, the day of month clamped to the target month's length. */
function addMonths(day: number, months: number): number {
  const d = new Date(day);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d.getUTCDate(), last));
}

function relativeDay(today: number, count: number, unit: DateUnit, direction: RelativeDirection): number {
  const sign = direction === "ago" ? -1 : 1;
  switch (unit) {
    case "day": return today + sign * count * DAY_MS;
    case "week": return today + sign * count * 7 * DAY_MS;
    case "month": return addMonths(today, sign * count);
    case "quarter": return addMonths(today, sign * count * 3);
    case "year": return addMonths(today, sign * count * 12);
  }
}

/**
 * Whether a row's `value` passes `condition`, with the column's other
 * values for the conditions that rank or count, and `now` for the date
 * conditions relative to today. Text compares without regard to case,
 * as the app's own comparisons do.
 */
export function conditionHolds(condition: FilterCondition, value: PlainCellValue, column: readonly PlainCellValue[], now = new Date()): boolean {
  const text = typeof value === "string" ? value.toLowerCase() : undefined;
  const number = typeof value === "number" ? value : undefined;
  const day = value instanceof Date ? dayOf(value) : undefined;
  const seconds = typeof value === "object" && "seconds" in value ? value.seconds : undefined;
  const numbers = column.filter((v): v is number => typeof v === "number");
  const today = todayOf(now);
  const needle = "value" in condition && typeof condition.value === "string" ? condition.value.toLowerCase() : "";
  switch (condition.operator) {
    case "=": case "<>": case ">": case ">=": case "<": case "<=": {
      const expected = typeof condition.value === "string" ? condition.value.toLowerCase() : condition.value;
      const actual = typeof condition.value === "string" ? text : number;
      if (actual === undefined) return condition.operator === "<>";
      switch (condition.operator) {
        case "=": return actual === expected;
        case "<>": return actual !== expected;
        case "<": return actual < expected;
        case "<=": return actual <= expected;
        case ">": return actual > expected;
        case ">=": return actual >= expected;
      }
    }
    // falls through to satisfy the type checker; every operator above returns
    case "contains": return text !== undefined && text.includes(needle);
    case "notContains": return text === undefined || !text.includes(needle);
    case "startsWith": return text !== undefined && text.startsWith(needle);
    case "notStartsWith": return text === undefined || !text.startsWith(needle);
    case "endsWith": return text !== undefined && text.endsWith(needle);
    case "notEndsWith": return text === undefined || !text.endsWith(needle);
    case "is": return text !== undefined && text === needle;
    case "isNot": return text === undefined || text !== needle;
    case "isBlank": return value === undefined || value === "";
    case "isNotBlank": return !(value === undefined || value === "");
    case "between": return number !== undefined && number >= Math.min(condition.from, condition.to) && number <= Math.max(condition.from, condition.to);
    case "notBetween": return number !== undefined && (number < Math.min(condition.from, condition.to) || number > Math.max(condition.from, condition.to));
    case "aboveAverage": case "belowAverage": {
      if (number === undefined || numbers.length === 0) return false;
      const average = numbers.reduce((a, b) => a + b, 0) / numbers.length;
      return condition.operator === "aboveAverage" ? number > average : number < average;
    }
    case "duplicate": return value !== undefined && column.filter((v) => sameValue(v, value)).length > 1;
    case "unique": return value !== undefined && column.filter((v) => sameValue(v, value)).length === 1;
    case "top": case "bottom": case "topPercent": case "bottomPercent": {
      if (number === undefined || numbers.length === 0) return false;
      const fromTop = condition.operator === "top" || condition.operator === "topPercent";
      const sorted = [...numbers].sort((a, b) => (fromTop ? b - a : a - b));
      const count = "count" in condition ? condition.count : Math.max(1, Math.round((numbers.length * condition.percent) / 100));
      const threshold = sorted[Math.min(count, sorted.length) - 1]!;
      return fromTop ? number >= threshold : number <= threshold;
    }
    case "dateIs": return day !== undefined && day === dayOf(condition.date);
    case "dateBefore": return day !== undefined && day < dayOf(condition.date);
    case "dateAfter": return day !== undefined && day >= dayOf(condition.date) + DAY_MS;
    case "dateInRange": {
      const lo = Math.min(dayOf(condition.from), dayOf(condition.to));
      const hi = Math.max(dayOf(condition.from), dayOf(condition.to));
      return day !== undefined && day >= lo && day < hi + DAY_MS;
    }
    case "today": return day === today;
    case "yesterday": return day === today - DAY_MS;
    case "tomorrow": return day === today + DAY_MS;
    case "dateInThis": {
      if (day === undefined) return false;
      const d = new Date(today);
      switch (condition.unit) {
        case "week": {
          const start = today - d.getUTCDay() * DAY_MS;
          return day >= start && day < start + 7 * DAY_MS;
        }
        case "month": return day >= Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) && day < Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
        case "quarter": {
          const q = Math.floor(d.getUTCMonth() / 3) * 3;
          return day >= Date.UTC(d.getUTCFullYear(), q, 1) && day < Date.UTC(d.getUTCFullYear(), q + 3, 1);
        }
        case "year": return day >= Date.UTC(d.getUTCFullYear(), 0, 1) && day < Date.UTC(d.getUTCFullYear() + 1, 0, 1);
        case "day": return day === today;
      }
    }
    // falls through to satisfy the type checker; every unit above returns
    case "dateInLast": return day !== undefined && day >= relativeDay(today, condition.count, condition.unit, "ago") && day < today + DAY_MS;
    case "dateInNext": return day !== undefined && day >= today && day < relativeDay(today, condition.count, condition.unit, "fromNow") + DAY_MS;
    case "dateExactly": return day !== undefined && day === relativeDay(today, condition.count, condition.unit, condition.direction);
    case "dateBeforeRelative": return day !== undefined && day < relativeDay(today, condition.count, condition.unit, condition.direction);
    case "dateAfterRelative": return day !== undefined && day >= relativeDay(today, condition.count, condition.unit, condition.direction) + DAY_MS;
    case "dateBetweenRelative": {
      if (day === undefined) return false;
      const a = relativeDay(today, condition.from, condition.unit, condition.direction);
      const b = relativeDay(today, condition.to, condition.unit, condition.direction);
      return day >= Math.min(a, b) && day < Math.max(a, b) + DAY_MS;
    }
    case "durationEquals": return seconds !== undefined && seconds === condition.seconds;
    case "durationGreaterThan": return seconds !== undefined && seconds > condition.seconds;
    case "durationBetween": return seconds !== undefined && seconds >= Math.min(condition.from, condition.to) && seconds <= Math.max(condition.from, condition.to);
    case "checked": return value === true;
    case "unchecked": return value === false;
  }
}

function sameValue(a: PlainCellValue, b: PlainCellValue): boolean {
  if (a instanceof Date && b instanceof Date) return dayOf(a) === dayOf(b);
  if (typeof a === "object" && typeof b === "object" && "seconds" in a && "seconds" in b) return a.seconds === b.seconds;
  if (typeof a === "string" && typeof b === "string") return a.toLowerCase() === b.toLowerCase();
  return a === b;
}
