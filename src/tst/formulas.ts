/**
 * TSCE formulas: decode `TSCE.FormulaArchive` ASTs into readable text.
 *
 * Formulas are **not a Numbers feature**. They are part of the TST table
 * archives, so a table embedded in a Pages document or a Keynote slide
 * carries exactly the same calc-engine structures — and the corpus proves
 * it: Pages fixtures contain formula cells too.
 *
 * The AST is a post-order (RPN) node list, which makes rendering a stack
 * walk: operands push, operators pop their arity and push the combined
 * text. Parenthesisation is precedence-driven rather than literal, because
 * the archive does not record where the author typed brackets.
 *
 * Two things shape the API:
 *
 *  - **Cell coordinates are relative offsets from the cell using the
 *    formula**, not absolute positions, whenever `absolute` is false.
 *    `FormulaArchive.host_column`/`host_row` are absent in every file
 *    examined, so the anchor is the using cell — which is why rendering
 *    takes a row and column.
 *  - **Function names are not in the format.** `AST_function_node_index`
 *    is an index into an Apple-internal list that no public schema
 *    contains. Known ids render by name; unknown ones render as
 *    `FUNCTION_<id>` so a reader can see exactly what is missing rather
 *    than being handed a plausible guess.
 *
 * A reference into *another* table names a calc-engine owner rather than a
 * table, so rendering one requires the owner map in `src/tsce/owners.ts`.
 * Pass it as {@link RenderOptions.owners} and `OTHER_TABLE::A2` becomes
 * `Revenue::A2`; `TableModel.cellFormula` does this for you.
 */
import type { RawMessage } from "../base/protobuf.ts";
import { decodeDecimal128 } from "./tables.ts";
import { HARVESTED_FUNCTIONS, HARVEST_PROVENANCE } from "./function-names.ts";
import { readCfUid } from "../tsce/owners.ts";

/** TSCE.FormulaArchive. */
export const FormulaFields = {
  AST_NODE_ARRAY: 1,
  HOST_COLUMN: 2,
  HOST_ROW: 3,
  HOST_COLUMN_IS_NEGATIVE: 4,
  HOST_ROW_IS_NEGATIVE: 5,
} as const;

/** TSCE.ASTNodeArrayArchive: repeated AST_node = 1. */
export const AstNodeArrayFields = { NODES: 1 } as const;

/** TSCE.ASTNodeArrayArchive.ASTNodeArchive — the fields we render. */
export const AstNodeFields = {
  TYPE: 1,
  FUNCTION_INDEX: 2,
  FUNCTION_NUM_ARGS: 3,
  NUMBER: 4,
  BOOLEAN: 5,
  STRING: 6,
  TOKEN_BOOLEAN: 10,
  WHITESPACE: 25,
  COLUMN: 26,
  ROW: 27,
  CROSS_TABLE_INFO: 28,
  TRACT_LIST: 38,
  COLON_TRACT: 40,
  NUMBER_DECIMAL_LOW: 42,
  NUMBER_DECIMAL_HIGH: 43,
} as const;

/** ASTColumnCoordinateArchive / ASTRowCoordinateArchive. */
const CoordinateFields = { INDEX: 1, ABSOLUTE: 2 } as const;

/**
 * ASTColonTractArchive. Ranges come in two flavours and both occur: the
 * absolute pair holds real indexes, the relative pair holds offsets from
 * the using cell. A reader that only knows one renders the other as #REF!.
 */
const ColonTractFields = {
  RELATIVE_COLUMN: 1,
  RELATIVE_ROW: 2,
  ABSOLUTE_COLUMN: 3,
  ABSOLUTE_ROW: 4,
} as const;
const TractRangeFields = { BEGIN: 1, END: 2 } as const;

/**
 * Marker for a reference into a table this renderer could not name.
 *
 * The AST stores the target as a calc-engine **owner UUID**, not anything
 * resembling a table. Pass a {@link RenderOptions.owners} registry and the
 * reference renders as `Revenue::A2`; without one — or for the handful of
 * owners a document does not resolve — it falls back to this marker,
 * because rendering a bare `A2` would read as a cell in the formula's *own*
 * table and be actively wrong.
 *
 * See `src/tsce/owners.ts` for how the mapping works.
 */
export const CROSS_TABLE_PREFIX = "OTHER_TABLE::";

export const AstNodeType = {
  ADDITION: 1,
  SUBTRACTION: 2,
  MULTIPLICATION: 3,
  DIVISION: 4,
  POWER: 5,
  CONCATENATION: 6,
  GREATER_THAN: 7,
  GREATER_THAN_OR_EQUAL: 8,
  LESS_THAN: 9,
  LESS_THAN_OR_EQUAL: 10,
  EQUAL_TO: 11,
  NOT_EQUAL_TO: 12,
  NEGATION: 13,
  PLUS_SIGN: 14,
  PERCENT: 15,
  FUNCTION: 16,
  NUMBER: 17,
  BOOLEAN: 18,
  STRING: 19,
  DATE: 20,
  DURATION: 21,
  EMPTY_ARGUMENT: 22,
  TOKEN: 23,
  ARRAY: 24,
  LIST: 25,
  LOCAL_CELL_REFERENCE: 27,
  CROSS_TABLE_CELL_REFERENCE: 28,
  COLON: 29,
  REFERENCE_ERROR: 30,
  UNKNOWN_FUNCTION: 31,
  APPEND_WHITESPACE: 32,
  PREPEND_WHITESPACE: 33,
  CELL_REFERENCE: 36,
  COLON_WITH_UIDS: 45,
  REFERENCE_ERROR_WITH_UIDS: 46,
  LINKED_CELL_REFERENCE: 63,
  LINKED_COLUMN_REFERENCE: 64,
  LINKED_ROW_REFERENCE: 65,
  COLON_TRACT: 67,
  INTERSECTION: 69,
} as const;

/**
 * Stands in for a linked cell reference that carries no coordinate.
 *
 * Filter and conditional-style predicates are written once and applied to
 * many cells, so the operand under test is not an address — it is
 * "whichever cell this rule was attached to". Apple encodes that as a
 * `LINKED_CELL_REFERENCE_NODE` with a table identity but no row or column.
 * Rendering it as `A1` would name a cell the rule does not mean, so it
 * renders as this marker unless the caller supplies the concrete address
 * via {@link RenderOptions.selfCell}.
 */
export const SELF_CELL_MARKER = "THIS_CELL";

/** Binary operators, with their symbol and binding power. */
const BINARY_OPERATORS = new Map<number, { symbol: string; precedence: number }>([
  [AstNodeType.EQUAL_TO, { symbol: "=", precedence: 1 }],
  [AstNodeType.NOT_EQUAL_TO, { symbol: "<>", precedence: 1 }],
  [AstNodeType.GREATER_THAN, { symbol: ">", precedence: 1 }],
  [AstNodeType.GREATER_THAN_OR_EQUAL, { symbol: ">=", precedence: 1 }],
  [AstNodeType.LESS_THAN, { symbol: "<", precedence: 1 }],
  [AstNodeType.LESS_THAN_OR_EQUAL, { symbol: "<=", precedence: 1 }],
  [AstNodeType.CONCATENATION, { symbol: "&", precedence: 2 }],
  [AstNodeType.ADDITION, { symbol: "+", precedence: 3 }],
  [AstNodeType.SUBTRACTION, { symbol: "-", precedence: 3 }],
  [AstNodeType.MULTIPLICATION, { symbol: "*", precedence: 4 }],
  [AstNodeType.DIVISION, { symbol: "/", precedence: 4 }],
  [AstNodeType.POWER, { symbol: "^", precedence: 5 }],
]);

const UNARY_PRECEDENCE = 6;
const PRIMARY_PRECEDENCE = 10;

/**
 * Known `AST_function_node_index` values.
 *
 * Deliberately tiny. Apple's index is not published, and a table of
 * confident-looking guesses is worse than an honest gap: a formula
 * rendered as `AVERAGE(...)` when it is really `MEDIAN(...)` is a silent
 * lie, whereas `FUNCTION_42(...)` is a visible one.
 *
 * Every entry here is backed by arithmetic in the fixture corpus:
 *
 *  - **168 = SUM** — `libetonyek-pages5-extra-dir.pages` has `FUNCTION_168`
 *    over a column whose cached result (7920) is exactly the sum of the
 *    cells above it (5500 + 1170 + 1250), and the "Cats" table in
 *    `numbers-parser-*-issue102.numbers` uses the same id for its TOTAL row.
 *
 * Extend at runtime with {@link registerFormulaFunctions} — and see
 * `docs/VERIFICATION.md` for how to harvest more ids from a real Numbers
 * install rather than guessing.
 */
const BUILTIN_FUNCTIONS: ReadonlyMap<number, string> = new Map([[168, "SUM"]]);

const registeredFunctions = new Map<number, string>();

/**
 * Resolution order, narrowest scope first: names registered at runtime,
 * then a table harvested from a real Numbers install, then the entries the
 * fixture corpus proves. A caller who has measured their own Numbers
 * version always wins over anything shipped.
 */
function lookup(index: number): string | undefined {
  return registeredFunctions.get(index) ?? HARVESTED_FUNCTIONS.get(index) ?? BUILTIN_FUNCTIONS.get(index);
}

/** How the shipped function table was obtained, for diagnostics. */
export function functionTableProvenance(): {
  harvested: number;
  builtin: number;
  registered: number;
  app: string;
} {
  return {
    harvested: HARVESTED_FUNCTIONS.size,
    builtin: BUILTIN_FUNCTIONS.size,
    registered: registeredFunctions.size,
    app: HARVEST_PROVENANCE.app,
  };
}

/**
 * Teach the renderer more function names.
 *
 * Mirrors `registerTypes()` for the archive registry: the library ships
 * what it can prove and lets callers who have harvested more supply them,
 * rather than baking in a table nobody can verify.
 */
export function registerFormulaFunctions(names: Readonly<Record<number, string>>): void {
  for (const [index, name] of Object.entries(names)) {
    registeredFunctions.set(Number(index), name);
  }
}

export function clearRegisteredFormulaFunctions(): void {
  registeredFunctions.clear();
}

/** Name for a function index, or a visible placeholder when unknown. */
export function functionName(index: number): string {
  return lookup(index) ?? `FUNCTION_${index}`;
}

/** True when the index has a real name rather than a placeholder. */
export function isKnownFunction(index: number): boolean {
  return lookup(index) !== undefined;
}

/** Spreadsheet column letters: 0 → A, 25 → Z, 26 → AA. */
export function columnName(column: number): string {
  let name = "";
  let n = column + 1;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    n = (n - remainder - 1) / 26;
  }
  return name;
}

/** `A1`-style address; either half may be omitted for whole row/column refs. */
export function cellAddress(
  column: number | undefined,
  row: number | undefined,
  absoluteColumn = false,
  absoluteRow = false,
): string {
  const columnPart = column === undefined ? "" : `${absoluteColumn ? "$" : ""}${columnName(column)}`;
  const rowPart = row === undefined ? "" : `${absoluteRow ? "$" : ""}${row + 1}`;
  return `${columnPart}${rowPart}`;
}

/** Where a formula is being rendered from, so relative refs can resolve. */
export interface FormulaOrigin {
  row: number;
  column: number;
}

/** A rendered formula plus what the renderer could not name. */
export interface RenderedFormula {
  /** Infix text, with a leading `=`. */
  text: string;
  /** Function indexes encountered that have no registered name. */
  unknownFunctions: number[];
  /** Node types encountered that the renderer has no rule for. */
  unknownNodeTypes: number[];
  /** True when the formula reaches into another table. */
  hasCrossTableReferences: boolean;
  /**
   * True when at least one of those references could not be named, and so
   * rendered with {@link CROSS_TABLE_PREFIX}. Naming needs an owner
   * registry — see {@link RenderOptions.owners}.
   */
  hasUnnamedCrossTables: boolean;
}

interface Operand {
  text: string;
  precedence: number;
}

/** Adjustments to how a formula renders. */
export interface RenderOptions {
  /**
   * Address to substitute for a coordinate-less linked cell reference —
   * the "cell under test" in a filter or conditional-style predicate.
   * Defaults to {@link SELF_CELL_MARKER}.
   */
  selfCell?: string;
  /**
   * Resolves a cross-table reference's owner UUID to a table name, turning
   * `OTHER_TABLE::A2` into `Revenue::A2`. Supply a
   * {@link ../tsce/owners.ts FormulaOwnerRegistry}, or any function with
   * the same shape.
   */
  owners?: { tableName(uid: { lo: bigint; hi: bigint } | undefined): string | undefined };
}

/**
 * The table a cross-table node points at, when the caller can name it.
 *
 * Apple quotes a table name in a formula only when it needs to; a name with
 * a space or a character that would parse as an operator is wrapped in
 * single quotes, with embedded quotes doubled.
 */
function crossTableName(node: RawMessage, options: RenderOptions): string | undefined {
  const info = node.getMessage(AstNodeFields.CROSS_TABLE_INFO);
  const name = options.owners?.tableName(readCfUid(info?.getMessage(1)));
  if (name === undefined) return undefined;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
}

/**
 * Render a `TSCE.FormulaArchive` as infix text.
 *
 * `origin` is the cell the formula lives in; relative references resolve
 * against it. Omitting it renders relative references in their raw offset
 * form (`R[-1]C[0]`), which is honest but rarely what a caller wants.
 */
export function renderFormula(
  formula: RawMessage | undefined,
  origin?: FormulaOrigin,
  options: RenderOptions = {},
): RenderedFormula {
  const unknownFunctions: number[] = [];
  const unknownNodeTypes: number[] = [];
  let hasCrossTableReferences = false;
  const unnamedCrossTables = new Set<string>();
  const nodes = formula?.getMessage(FormulaFields.AST_NODE_ARRAY)?.getMessages(AstNodeArrayFields.NODES);
  if (!nodes || nodes.length === 0) {
    return {
      text: "",
      unknownFunctions,
      unknownNodeTypes,
      hasCrossTableReferences,
      hasUnnamedCrossTables: false,
    };
  }

  const stack: Operand[] = [];
  const pop = (n: number): Operand[] => {
    // A truncated stack means the AST used a node whose arity we got wrong;
    // padding keeps the render partial rather than throwing away the rest.
    const taken = stack.splice(Math.max(0, stack.length - n), n);
    while (taken.length < n) taken.unshift({ text: "", precedence: PRIMARY_PRECEDENCE });
    return taken;
  };
  const wrap = (operand: Operand, minimum: number): string =>
    operand.precedence < minimum ? `(${operand.text})` : operand.text;

  for (const node of nodes) {
    const type = node.getUint(AstNodeFields.TYPE);
    if (type === undefined) continue;

    const binary = BINARY_OPERATORS.get(type);
    if (binary) {
      const [left, right] = pop(2) as [Operand, Operand];
      // The right operand of a left-associative operator needs brackets at
      // equal precedence too: a - (b - c) is not a - b - c.
      stack.push({
        text: `${wrap(left, binary.precedence)}${binary.symbol}${wrap(right, binary.precedence + 1)}`,
        precedence: binary.precedence,
      });
      continue;
    }

    switch (type) {
      case AstNodeType.NEGATION:
      case AstNodeType.PLUS_SIGN: {
        const [operand] = pop(1) as [Operand];
        const sign = type === AstNodeType.NEGATION ? "-" : "+";
        stack.push({
          text: `${sign}${wrap(operand, UNARY_PRECEDENCE)}`,
          precedence: UNARY_PRECEDENCE,
        });
        break;
      }
      case AstNodeType.PERCENT: {
        const [operand] = pop(1) as [Operand];
        stack.push({ text: `${wrap(operand, UNARY_PRECEDENCE)}%`, precedence: UNARY_PRECEDENCE });
        break;
      }
      case AstNodeType.FUNCTION: {
        const index = node.getUint(AstNodeFields.FUNCTION_INDEX) ?? -1;
        if (!isKnownFunction(index) && !unknownFunctions.includes(index)) {
          unknownFunctions.push(index);
        }
        const argCount = node.getUint(AstNodeFields.FUNCTION_NUM_ARGS) ?? 0;
        const args = pop(argCount).map((a) => a.text);
        stack.push({
          text: `${functionName(index)}(${args.join(",")})`,
          precedence: PRIMARY_PRECEDENCE,
        });
        break;
      }
      case AstNodeType.UNKNOWN_FUNCTION: {
        const args = pop(node.getUint(AstNodeFields.FUNCTION_NUM_ARGS) ?? 0).map((a) => a.text);
        const name = node.getString(AstNodeFields.STRING) ?? "UNKNOWN";
        stack.push({ text: `${name}(${args.join(",")})`, precedence: PRIMARY_PRECEDENCE });
        break;
      }
      case AstNodeType.NUMBER:
        stack.push({ text: formatNumber(node), precedence: PRIMARY_PRECEDENCE });
        break;
      case AstNodeType.BOOLEAN:
        stack.push({
          text: node.getBool(AstNodeFields.BOOLEAN) ? "TRUE" : "FALSE",
          precedence: PRIMARY_PRECEDENCE,
        });
        break;
      case AstNodeType.TOKEN:
        stack.push({
          text: node.getBool(AstNodeFields.TOKEN_BOOLEAN) ? "TRUE" : "FALSE",
          precedence: PRIMARY_PRECEDENCE,
        });
        break;
      case AstNodeType.STRING:
        // Spreadsheet string literals escape a quote by doubling it.
        stack.push({
          text: `"${(node.getString(AstNodeFields.STRING) ?? "").replace(/"/g, '""')}"`,
          precedence: PRIMARY_PRECEDENCE,
        });
        break;
      case AstNodeType.EMPTY_ARGUMENT:
        stack.push({ text: "", precedence: PRIMARY_PRECEDENCE });
        break;
      case AstNodeType.LIST:
      case AstNodeType.ARRAY: {
        const count = node.getUint(AstNodeFields.FUNCTION_NUM_ARGS) ?? 0;
        const items = pop(count).map((a) => a.text);
        const open = type === AstNodeType.ARRAY ? "{" : "(";
        const close = type === AstNodeType.ARRAY ? "}" : ")";
        stack.push({ text: `${open}${items.join(",")}${close}`, precedence: PRIMARY_PRECEDENCE });
        break;
      }
      case AstNodeType.CELL_REFERENCE:
      case AstNodeType.LOCAL_CELL_REFERENCE:
      case AstNodeType.CROSS_TABLE_CELL_REFERENCE: {
        const crossTable = node.has(AstNodeFields.CROSS_TABLE_INFO);
        if (crossTable) hasCrossTableReferences = true;
        const address = renderCellReference(node, origin);
        let text = address;
        if (crossTable && address !== "#REF!") {
          const name = crossTableName(node, options);
          if (name !== undefined) unnamedCrossTables.delete(name);
          text = `${name ?? CROSS_TABLE_PREFIX.slice(0, -2)}::${address}`;
          if (name === undefined) unnamedCrossTables.add(CROSS_TABLE_PREFIX);
        }
        stack.push({ text, precedence: PRIMARY_PRECEDENCE });
        break;
      }
      case AstNodeType.LINKED_CELL_REFERENCE:
      case AstNodeType.LINKED_COLUMN_REFERENCE:
      case AstNodeType.LINKED_ROW_REFERENCE: {
        // A linked reference tracks its target by identity rather than
        // position, so it may carry no coordinate at all. When it does
        // carry one it reads exactly like an ordinary reference.
        const positioned =
          node.has(AstNodeFields.COLUMN) || node.has(AstNodeFields.ROW);
        if (node.has(AstNodeFields.CROSS_TABLE_INFO) && positioned) {
          hasCrossTableReferences = true;
        }
        const text = positioned
          ? renderCellReference(node, origin)
          : (options.selfCell ?? SELF_CELL_MARKER);
        stack.push({ text, precedence: PRIMARY_PRECEDENCE });
        break;
      }
      case AstNodeType.COLON:
      case AstNodeType.COLON_WITH_UIDS: {
        const [from, to] = pop(2) as [Operand, Operand];
        stack.push({ text: `${from.text}:${to.text}`, precedence: PRIMARY_PRECEDENCE });
        break;
      }
      case AstNodeType.COLON_TRACT:
        stack.push({ text: renderColonTract(node, origin), precedence: PRIMARY_PRECEDENCE });
        break;
      case AstNodeType.INTERSECTION: {
        const [left, right] = pop(2) as [Operand, Operand];
        stack.push({ text: `${left.text} ${right.text}`, precedence: PRIMARY_PRECEDENCE });
        break;
      }
      case AstNodeType.REFERENCE_ERROR:
      case AstNodeType.REFERENCE_ERROR_WITH_UIDS:
        stack.push({ text: "#REF!", precedence: PRIMARY_PRECEDENCE });
        break;
      case AstNodeType.APPEND_WHITESPACE:
      case AstNodeType.PREPEND_WHITESPACE: {
        // Cosmetic: the author's spacing, preserved so a round-tripped
        // render matches what they typed.
        const [operand] = pop(1) as [Operand];
        const space = node.getString(AstNodeFields.WHITESPACE) ?? "";
        stack.push({
          text:
            type === AstNodeType.APPEND_WHITESPACE
              ? `${operand.text}${space}`
              : `${space}${operand.text}`,
          precedence: operand.precedence,
        });
        break;
      }
      case AstNodeType.DATE:
      case AstNodeType.DURATION:
        stack.push({ text: formatNumber(node), precedence: PRIMARY_PRECEDENCE });
        break;
      default:
        if (!unknownNodeTypes.includes(type)) unknownNodeTypes.push(type);
        stack.push({ text: `NODE_${type}`, precedence: PRIMARY_PRECEDENCE });
        break;
    }
  }

  // A well-formed AST leaves exactly one operand; joining any extras keeps
  // a partial result visible instead of silently dropping it.
  const text = stack.map((operand) => operand.text).join(" ");
  return {
    text: text ? `=${text}` : "",
    unknownFunctions,
    unknownNodeTypes,
    hasCrossTableReferences,
    hasUnnamedCrossTables: unnamedCrossTables.size > 0,
  };
}

/**
 * A cell reference, resolved against the cell using the formula.
 *
 * `sint32` coordinates are zigzag-encoded offsets when `absolute` is
 * false. Without an origin they render in R1C1 offset form rather than
 * pretending to be absolute addresses.
 */
function renderCellReference(node: RawMessage, origin?: FormulaOrigin): string {
  const columnNode = node.getMessage(AstNodeFields.COLUMN);
  const rowNode = node.getMessage(AstNodeFields.ROW);
  const column = coordinate(columnNode);
  const row = coordinate(rowNode);

  if (!origin) {
    const parts: string[] = [];
    if (row) parts.push(row.absolute ? `R${row.value + 1}` : `R[${row.value}]`);
    if (column) parts.push(column.absolute ? `C${column.value + 1}` : `C[${column.value}]`);
    return parts.join("") || "#REF!";
  }

  const columnIndex = column
    ? column.absolute
      ? column.value
      : origin.column + column.value
    : undefined;
  const rowIndex = row ? (row.absolute ? row.value : origin.row + row.value) : undefined;
  if ((columnIndex !== undefined && columnIndex < 0) || (rowIndex !== undefined && rowIndex < 0)) {
    return "#REF!";
  }
  return cellAddress(columnIndex, rowIndex, column?.absolute ?? false, row?.absolute ?? false);
}

function coordinate(node: RawMessage | undefined): { value: number; absolute: boolean } | undefined {
  if (!node) return undefined;
  const raw = node.getVarint(CoordinateFields.INDEX);
  if (raw === undefined) return undefined;
  // proto2 sint32: zigzag.
  const value = Number((raw >> 1n) ^ -(raw & 1n));
  return { value, absolute: node.getBool(CoordinateFields.ABSOLUTE) ?? false };
}

/**
 * A colon tract renders as the rectangle it describes.
 *
 * Absolute ranges are indexes; relative ones are offsets from the using
 * cell, so they need the origin exactly as a relative cell reference does.
 */
function renderColonTract(node: RawMessage, origin?: FormulaOrigin): string {
  const tract = node.getMessage(AstNodeFields.COLON_TRACT);
  if (!tract) return "#REF!";

  const absoluteColumns = tractRange(tract, ColonTractFields.ABSOLUTE_COLUMN);
  const absoluteRows = tractRange(tract, ColonTractFields.ABSOLUTE_ROW);
  const relativeColumns = tractRange(tract, ColonTractFields.RELATIVE_COLUMN);
  const relativeRows = tractRange(tract, ColonTractFields.RELATIVE_ROW);

  const columns = resolveTract(absoluteColumns, relativeColumns, origin?.column);
  const rows = resolveTract(absoluteRows, relativeRows, origin?.row);
  if (!columns && !rows) return "#REF!";
  if (columns === "unresolved" || rows === "unresolved") return "#REF!";

  const from = cellAddress(columns?.begin, rows?.begin, columns?.absolute, rows?.absolute);
  const to = cellAddress(columns?.end, rows?.end, columns?.absolute, rows?.absolute);
  return from === to ? from : `${from}:${to}`;
}

type ResolvedTract = { begin: number; end: number; absolute: boolean } | undefined | "unresolved";

function resolveTract(
  absolute: { begin: number; end: number } | undefined,
  relative: { begin: number; end: number } | undefined,
  anchor: number | undefined,
): ResolvedTract {
  if (absolute) return { ...absolute, absolute: true };
  if (!relative) return undefined;
  if (anchor === undefined) return "unresolved";
  const begin = anchor + relative.begin;
  const end = anchor + relative.end;
  if (begin < 0 || end < 0) return "unresolved";
  return { begin, end, absolute: false };
}

/**
 * One range from a tract. Relative bounds are `int32`, so a negative
 * offset arrives as a full-width varint rather than zigzag.
 */
function tractRange(
  tract: RawMessage | undefined,
  field: number,
): { begin: number; end: number } | undefined {
  const range = tract?.getMessages(field)[0];
  if (!range) return undefined;
  const begin = int32(range.getVarint(TractRangeFields.BEGIN));
  if (begin === undefined) return undefined;
  return { begin, end: int32(range.getVarint(TractRangeFields.END)) ?? begin };
}

function int32(raw: bigint | undefined): number | undefined {
  return raw === undefined ? undefined : Number(BigInt.asIntN(32, raw));
}

/**
 * A numeric literal.
 *
 * Apple writes both a double and a decimal128 for the same value; the
 * decimal is authoritative, for the same reason cells store decimals — it
 * is what stops 0.1 from rendering as 0.1000000000000000055.
 */
function formatNumber(node: RawMessage): string {
  const low = node.getVarint(AstNodeFields.NUMBER_DECIMAL_LOW);
  const high = node.getVarint(AstNodeFields.NUMBER_DECIMAL_HIGH);
  if (low !== undefined && high !== undefined) {
    const bytes = new Uint8Array(16);
    const view = new DataView(bytes.buffer);
    view.setBigUint64(0, BigInt.asUintN(64, low), true);
    view.setBigUint64(8, BigInt.asUintN(64, high), true);
    const value = decodeDecimal128(bytes);
    if (Number.isFinite(value)) return String(value);
  }
  const double = node.getDouble(AstNodeFields.NUMBER);
  return double === undefined ? "0" : String(double);
}
