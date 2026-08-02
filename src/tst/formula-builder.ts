/**
 * Authoring TSCE formulas: infix text in, AST node array out.
 *
 * The reader in {@link ./formulas.ts} walks a postfix node array and
 * produces text. This is the other direction, and it exists because
 * `AST_function_node_index` is now known for 271 functions — before that,
 * authoring a call meant writing an index nobody had measured.
 *
 * ## Postfix, and why the order looks backwards
 *
 * `TSCE.ASTNodeArrayArchive` is a stack machine, not a tree: `B2*C2` is
 * `[ref B2, ref C2, ×]`, and `SUM(C3:K6)` is `[tract C3:K6, SUM/1]`. Every
 * node is emitted after everything it consumes, which is why
 * {@link emit} is a depth-first post-order walk and nothing here needs to
 * balance parentheses.
 *
 * ## Relative by default, like the app
 *
 * A reference is stored as a **zigzag sint32 offset from the cell holding
 * the formula**, unless `$` made it absolute. Two cells in a column running
 * the same calculation therefore share byte-identical ASTs; only the cell
 * they sit in differs. That is why {@link buildFormula} needs the origin
 * and why copying a formula between cells changes what it means, exactly
 * as it does in the app.
 *
 * ## Ranges follow their `$` flags, per axis
 *
 * A colon tract can express its bounds two ways, and both occur in real
 * files: `absolute_column`/`absolute_row` hold indexes, `relative_column`/
 * `relative_row` hold offsets from the formula's cell. Apple writes the
 * relative form for a range typed as `C3:K6` — `=SUM(C3:K6)` in C7 stores
 * columns `0…8` and rows `-4…-1`, as **plain 64-bit two's-complement
 * varints**, not the zigzag encoding a single coordinate uses — and the
 * absolute form for `$`-pinned axes, which is also what merges use. This
 * writer does the same, so what you type is what moves (or doesn't) when
 * rows are inserted, exactly as in the app. An axis with only one pinned
 * endpoint has no corpus specimen and falls back to absolute, the
 * encoding that cannot silently shift.
 *
 * ## Cross-table references need a resolver
 *
 * `Other::A1` compiles to a reference node carrying the *target table's
 * calc-engine identity* — the kind-1 owner UUID, unanimous across every
 * cross-table node in the corpus — and a table name only means something
 * inside a document. Pass {@link BuildFormulaOptions.tableUid} (which
 * `TableModel.setFormula` does for you); without one, compiling a
 * cross-table reference refuses rather than writing an identity the
 * engine has never heard of.
 *
 * ## What is deliberately missing
 *
 * Arrays, the `#REF!` error and sheet-qualified references are not
 * authored: each is either absent from the corpus or — for `#REF!` — a
 * lost reference nobody should write on purpose. Reading them all works.
 */
import { RawMessage } from "../base/protobuf.ts";
import { AstNodeArrayFields, AstNodeFields, AstNodeType } from "../tsce/ast.ts";
import { HARVESTED_FUNCTIONS } from "./function-names.ts";
import { packDecimal128 } from "./cellrecord.ts";
import { protoFields } from "../proto/fields.ts";

/** An expression to compile. Built by {@link parseFormula} or by hand. */
export type FormulaExpression =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "boolean"; value: boolean }
  /** A cell, as an offset or an absolute index; `undefined` means "same". */
  | { kind: "ref"; column: Coordinate; row: Coordinate }
  /** A cell on another table: `Other::A1`. Compiling needs a resolver. */
  | { kind: "crossRef"; table: string; column: Coordinate; row: Coordinate }
  /** A whole column, as in `SUM(D)`: a reference with no row at all. */
  | { kind: "columnRef"; column: Coordinate }
  /**
   * A rectangle, stored as a colon tract. Each axis keeps its `$` flag:
   * `C3:K6` stores *relative* ranges (offsets from the using cell) and
   * `$C$3:$K$6` absolute ones — measured, not assumed; the corpus's
   * `=SUM(C3:K6)` is relative on both axes.
   */
  | { kind: "range"; from: { column: Coordinate; row: Coordinate }; to: { column: Coordinate; row: Coordinate } }
  | { kind: "call"; name: string; args: FormulaExpression[] }
  | { kind: "binary"; op: BinaryOperator; left: FormulaExpression; right: FormulaExpression }
  | { kind: "unary"; op: UnaryOperator; operand: FormulaExpression }
  /** An omitted argument, as in `DURATION(,,8)`. */
  | { kind: "empty" };

/** One axis of a reference: absolute index, or offset from the origin. */
export interface Coordinate {
  value: number;
  absolute: boolean;
}

export type BinaryOperator = "+" | "-" | "*" | "/" | "^" | "&" | "=" | "<>" | "<" | "<=" | ">" | ">=";
export type UnaryOperator = "-" | "+" | "%";

const BINARY_NODE: Record<BinaryOperator, number> = {
  "+": AstNodeType.ADDITION,
  "-": AstNodeType.SUBTRACTION,
  "*": AstNodeType.MULTIPLICATION,
  "/": AstNodeType.DIVISION,
  "^": AstNodeType.POWER,
  "&": AstNodeType.CONCATENATION,
  "=": AstNodeType.EQUAL_TO,
  "<>": AstNodeType.NOT_EQUAL_TO,
  "<": AstNodeType.LESS_THAN,
  "<=": AstNodeType.LESS_THAN_OR_EQUAL,
  ">": AstNodeType.GREATER_THAN,
  ">=": AstNodeType.GREATER_THAN_OR_EQUAL,
};

const UNARY_NODE: Record<UnaryOperator, number> = {
  "-": AstNodeType.NEGATION,
  "+": AstNodeType.PLUS_SIGN,
  "%": AstNodeType.PERCENT,
};

/** Binding power, loosest first — the standard spreadsheet precedence. */
const PRECEDENCE: readonly (readonly BinaryOperator[])[] = [
  ["=", "<>", "<", "<=", ">", ">="],
  ["&"],
  ["+", "-"],
  ["*", "/"],
  ["^"],
];

/** name → index, inverted from the harvested table, upper-cased. */
const FUNCTION_INDEXES: ReadonlyMap<string, number> = new Map(
  [...HARVESTED_FUNCTIONS].map(([index, name]) => [name.toUpperCase(), index]),
);

/** Every function this library can author, in name order. */
export function authorableFunctions(): string[] {
  return [...FUNCTION_INDEXES.keys()].sort();
}

/** Coordinate fields: zigzag index, then the absolute flag. */
const CoordinateFields = { INDEX: 1, ABSOLUTE: 2 } as const;
const CrossTableInfoFields = protoFields(
  "TSCE.ASTNodeArrayArchive.ASTCrossTableReferenceExtraInfoArchive",
  { TABLE_ID: "table_id" },
);
/** TSP.CFUUIDArchive's four-uint32 encoding, the one these nodes use. */
const CfUuidWordFields = protoFields("TSP.CFUUIDArchive", {
  LOWER_LOW: "uuid_w0",
  LOWER_HIGH: "uuid_w1",
  UPPER_LOW: "uuid_w2",
  UPPER_HIGH: "uuid_w3",
});
const ColonTractFields = protoFields("TSCE.ASTNodeArrayArchive.ASTColonTractArchive", {
  RELATIVE_COLUMN: "relative_column",
  RELATIVE_ROW: "relative_row",
  ABSOLUTE_COLUMN: "absolute_column",
  ABSOLUTE_ROW: "absolute_row",
  PRESERVE_RECTANGULAR: "preserve_rectangular",
});
// Same begin/end numbers in the relative and absolute range archives.
const TractRangeFields = protoFields(
  "TSCE.ASTNodeArrayArchive.ASTColonTractArchive.ASTColonTractAbsoluteRangeArchive",
  { BEGIN: "range_begin", END: "range_end" },
);
const StickyBitsField = 33; // AST_sticky_bits
const ColonTractField = 40; // AST_colon_tract

function zigzag(value: number): number {
  return (value << 1) ^ (value >> 31);
}

/**
 * An axis given as an index, expressed the way the file wants it.
 *
 * Absolute axes store the index; relative ones store the distance from the
 * cell holding the formula. {@link parseFormula} always produces indexes,
 * because that is what `A1` means to a person.
 */
function relativise(axis: Coordinate, origin: number): Coordinate {
  return axis.absolute ? axis : { value: axis.value - origin, absolute: false };
}

function coordinate(axis: Coordinate): RawMessage {
  const message = RawMessage.create();
  message.setVarint(CoordinateFields.INDEX, zigzag(axis.value));
  message.setVarint(CoordinateFields.ABSOLUTE, axis.absolute ? 1 : 0);
  return message;
}

/** Document context a pure expression cannot carry itself. */
export interface BuildFormulaOptions {
  /**
   * Resolve a table name to its calc-engine identity — the kind-1 owner
   * UUID, which is what every cross-table node in the corpus carries.
   * `TableModel.setFormula` supplies this from the document's owner
   * registry; without it, a cross-table reference is refused rather than
   * compiled against an identity the engine has never heard of.
   */
  tableUid?: (name: string) => { lo: bigint; hi: bigint } | undefined;
}

/**
 * Compile an expression to a `TSCE.ASTNodeArrayArchive`.
 *
 * `origin` is the cell the formula lives in; relative references are stored
 * as offsets from it.
 */
export function buildFormula(
  expression: FormulaExpression,
  origin: { row: number; column: number },
  options: BuildFormulaOptions = {},
): RawMessage {
  const nodes = RawMessage.create();
  emit(expression, origin, (node) => nodes.addMessage(AstNodeArrayFields.NODES, node), options);
  return nodes;
}

/** Depth-first post-order: operands, then the thing that consumes them. */
function emit(
  expression: FormulaExpression,
  origin: { row: number; column: number },
  push: (node: RawMessage) => void,
  options: BuildFormulaOptions,
): void {
  const node = RawMessage.create();
  switch (expression.kind) {
    case "number": {
      node.setVarint(AstNodeFields.TYPE, AstNodeType.NUMBER);
      node.setDouble(AstNodeFields.NUMBER, expression.value);
      // Apple writes the same number twice: an IEEE double *and* a
      // decimal128. The decimal is the one the calc engine trusts for
      // money — and unlike a cell record's decimal, it is *plain*: 30 is
      // stored as 30·10⁰, never normalized to 3·10¹. Every corpus formula
      // agrees (the `+30` and `DURATION(…,500,…)` nodes are the proof —
      // normalizing them was a byte mismatch against every one).
      const decimal = formulaDecimal(expression.value);
      const view = new DataView(decimal.buffer, decimal.byteOffset, decimal.byteLength);
      node.setVarint(AstNodeFields.NUMBER_DECIMAL_LOW, view.getBigUint64(0, true));
      node.setVarint(AstNodeFields.NUMBER_DECIMAL_HIGH, view.getBigUint64(8, true));
      break;
    }
    case "string":
      node.setVarint(AstNodeFields.TYPE, AstNodeType.STRING);
      node.setString(AstNodeFields.STRING, expression.value);
      break;
    case "boolean":
      node.setVarint(AstNodeFields.TYPE, AstNodeType.BOOLEAN);
      node.setVarint(AstNodeFields.BOOLEAN, expression.value ? 1 : 0);
      break;
    case "empty":
      // An omitted argument is a TOKEN node carrying
      // `AST_token_node_boolean = 1` — measured on all 32 `DURATION(,,…)`
      // omissions in the corpus, where EMPTY_ARGUMENT never appears.
      node.setVarint(AstNodeFields.TYPE, AstNodeType.TOKEN);
      node.setVarint(AstNodeFields.TOKEN_BOOLEAN, 1);
      break;
    case "ref":
      node.setVarint(AstNodeFields.TYPE, AstNodeType.CELL_REFERENCE);
      // `A1` names a cell; the file stores an *offset* unless `$` pinned
      // it. Writing the index where an offset belongs makes `=A1` in B5
      // mean B5 — the formula reads back as a self-reference and looks
      // plausible, which is exactly what makes the mistake expensive.
      node.setMessage(AstNodeFields.COLUMN, coordinate(relativise(expression.column, origin.column)));
      node.setMessage(AstNodeFields.ROW, coordinate(relativise(expression.row, origin.row)));
      break;
    case "columnRef":
      // `SUM(D)` spans the column: the same reference node with the row
      // simply absent. All three corpus specimens agree, and `SUM(C)`
      // written *in* column C proves the offset is relative — an absolute
      // index would have stored 2, not 0.
      node.setVarint(AstNodeFields.TYPE, AstNodeType.CELL_REFERENCE);
      node.setMessage(AstNodeFields.COLUMN, coordinate(relativise(expression.column, origin.column)));
      break;
    case "crossRef": {
      const resolve = options.tableUid;
      if (!resolve) {
        throw new RangeError(
          `cross-table reference ${JSON.stringify(expression.table)}::… needs a document to ` +
            "resolve the table's calc-engine identity; write it through TableModel.setFormula",
        );
      }
      const uid = resolve(expression.table);
      if (!uid) {
        throw new RangeError(
          `no table named ${JSON.stringify(expression.table)} in this document — a cross-table ` +
            "reference stores the target's owner UUID, and there is none to store",
        );
      }
      // Same node type and coordinates as a local reference — offsets
      // unless `$`-pinned — plus the target table's identity. Apple does
      // NOT use the dedicated CROSS_TABLE_CELL_REFERENCE node type here:
      // all 1020 cross-table nodes in the corpus are ordinary
      // CELL_REFERENCE nodes whose extra-info field carries the kind-1
      // owner UUID as four uint32 words, and the byte proof caught the
      // difference on the first run.
      node.setVarint(AstNodeFields.TYPE, AstNodeType.CELL_REFERENCE);
      node.setMessage(AstNodeFields.COLUMN, coordinate(relativise(expression.column, origin.column)));
      node.setMessage(AstNodeFields.ROW, coordinate(relativise(expression.row, origin.row)));
      const cf = RawMessage.create();
      cf.setVarint(CfUuidWordFields.LOWER_LOW, uid.lo & 0xffffffffn);
      cf.setVarint(CfUuidWordFields.LOWER_HIGH, uid.lo >> 32n);
      cf.setVarint(CfUuidWordFields.UPPER_LOW, uid.hi & 0xffffffffn);
      cf.setVarint(CfUuidWordFields.UPPER_HIGH, uid.hi >> 32n);
      const info = RawMessage.create();
      info.setMessage(CrossTableInfoFields.TABLE_ID, cf);
      node.setMessage(AstNodeFields.CROSS_TABLE_INFO, info);
      break;
    }
    case "range": {
      // A rectangle is a colon tract. Per axis, `$` decides the encoding:
      // an unpinned axis stores a *relative* range — begin/end as signed
      // offsets from the using cell, inclusive — and a pinned one stores
      // absolute indexes. Measured: `=SUM(C3:K6)` in the corpus stores
      // relative {0..8} columns and {-4..-1} rows; the absolute form was
      // a byte mismatch against it (and is what merges use, which is
      // where the earlier "ranges are absolute" reading came from). An
      // axis with one pinned endpoint has no corpus specimen; it falls
      // back to absolute, the encoding that cannot silently shift.
      node.setVarint(AstNodeFields.TYPE, AstNodeType.COLON_TRACT);
      const sticky = RawMessage.create();
      for (const field of [1, 2, 3, 4]) sticky.setVarint(field, 0);
      node.setMessage(StickyBitsField, sticky);
      const tract = RawMessage.create();
      const axis = (
        from: Coordinate,
        to: Coordinate,
        originIndex: number,
        relativeField: number,
        absoluteField: number,
      ): void => {
        if (!from.absolute && !to.absolute) {
          tract.setMessage(
            relativeField,
            relativeTractRange(from.value - originIndex, to.value - originIndex),
          );
        } else {
          tract.setMessage(absoluteField, tractRange(from.value, to.value));
        }
      };
      axis(
        expression.from.column,
        expression.to.column,
        origin.column,
        ColonTractFields.RELATIVE_COLUMN,
        ColonTractFields.ABSOLUTE_COLUMN,
      );
      axis(
        expression.from.row,
        expression.to.row,
        origin.row,
        ColonTractFields.RELATIVE_ROW,
        ColonTractFields.ABSOLUTE_ROW,
      );
      tract.setVarint(ColonTractFields.PRESERVE_RECTANGULAR, 1);
      node.setMessage(ColonTractField, tract);
      break;
    }
    case "unary":
      emit(expression.operand, origin, push, options);
      node.setVarint(AstNodeFields.TYPE, UNARY_NODE[expression.op]);
      break;
    case "binary":
      emit(expression.left, origin, push, options);
      emit(expression.right, origin, push, options);
      node.setVarint(AstNodeFields.TYPE, BINARY_NODE[expression.op]);
      break;
    case "call": {
      const index = FUNCTION_INDEXES.get(expression.name.toUpperCase());
      if (index === undefined) {
        throw new RangeError(
          `no index is known for the function ${JSON.stringify(expression.name)}; ` +
            "run `npm run harvest` against a document that uses it, or see docs/BLOCKERS.md",
        );
      }
      for (const arg of expression.args) emit(arg, origin, push, options);
      node.setVarint(AstNodeFields.TYPE, AstNodeType.FUNCTION);
      node.setVarint(AstNodeFields.FUNCTION_INDEX, index);
      node.setVarint(AstNodeFields.FUNCTION_NUM_ARGS, expression.args.length);
      break;
    }
  }
  push(node);
}

function tractRange(begin: number, end: number): RawMessage {
  const range = RawMessage.create();
  range.setVarint(TractRangeFields.BEGIN, Math.min(begin, end));
  // Apple omits the end when the range is one row or column wide.
  if (begin !== end) range.setVarint(TractRangeFields.END, Math.max(begin, end));
  return range;
}

/**
 * A relative tract range: signed offsets from the using cell, inclusive,
 * as 64-bit two's-complement varints — `C3:K6` used from C7 stores rows
 * {-4..-1} exactly so. Begin is written even at zero (measured); the
 * omit-when-equal rule mirrors {@link tractRange}, unexercised by the
 * corpus on this form.
 */
function relativeTractRange(begin: number, end: number): RawMessage {
  const range = RawMessage.create();
  const lo = Math.min(begin, end);
  const hi = Math.max(begin, end);
  range.setVarint(TractRangeFields.BEGIN, BigInt.asUintN(64, BigInt(lo)));
  if (lo !== hi) range.setVarint(TractRangeFields.END, BigInt.asUintN(64, BigInt(hi)));
  return range;
}

/**
 * The plain decimal a formula number node carries: the value's own digits
 * with no normalization — trailing zeros stay in the mantissa.
 */
function formulaDecimal(value: number): Uint8Array {
  if (!Number.isFinite(value)) return new Uint8Array(16);
  const negative = value < 0 || Object.is(value, -0);
  const text = Math.abs(value).toString();
  if (text.includes("e") || text.includes("E")) {
    // Magnitudes beyond plain notation: fall back to exponent form.
    const [mantissaText, exponentText] = text.split(/[eE]/);
    const [intPart, fracPart = ""] = mantissaText!.split(".");
    return packDecimal128(
      BigInt(`${intPart}${fracPart}`),
      Number.parseInt(exponentText!, 10) - fracPart.length,
      negative,
    );
  }
  const [intPart, fracPart = ""] = text.split(".");
  return packDecimal128(BigInt(`${intPart}${fracPart}`), -fracPart.length, negative);
}

// --------------------------------------------------------------- parsing

/**
 * Parse infix formula text into a {@link FormulaExpression}.
 *
 * A leading `=` is optional. The grammar is the practical spreadsheet
 * subset: numbers, quoted strings, `TRUE`/`FALSE`, cell references with
 * optional `$`, ranges, function calls, parentheses, the six comparisons,
 * `& + - * / ^`, unary `+ -` and postfix `%`.
 *
 * Errors name the position, because a formula is user input and "syntax
 * error" is useless when the argument list is forty characters long.
 */
export function parseFormula(text: string): FormulaExpression {
  const parser = new Parser(text.startsWith("=") ? text.slice(1) : text);
  const expression = parser.parseExpression(0);
  parser.expectEnd();
  return expression;
}

/** `A1` → {column 0, row 0}; `$B$3` → absolute. */
export function parseReference(token: string): { column: Coordinate; row: Coordinate } | undefined {
  const match = /^(\$?)([A-Za-z]+)(\$?)(\d+)$/.exec(token);
  if (!match) return undefined;
  let column = 0;
  for (const character of match[2]!.toUpperCase()) {
    column = column * 26 + (character.charCodeAt(0) - 64);
  }
  return {
    column: { value: column - 1, absolute: match[1] === "$" },
    row: { value: Number(match[4]) - 1, absolute: match[3] === "$" },
  };
}

class Parser {
  private readonly text: string;
  private at = 0;

  constructor(text: string) {
    this.text = text;
  }

  parseExpression(level: number): FormulaExpression {
    if (level >= PRECEDENCE.length) return this.parseUnary();
    let left = this.parseExpression(level + 1);
    for (;;) {
      const op = this.matchOperator(PRECEDENCE[level]!);
      if (!op) return left;
      const right = this.parseExpression(level + 1);
      left = { kind: "binary", op, left, right };
    }
  }

  private parseUnary(): FormulaExpression {
    this.skipSpace();
    for (const op of ["-", "+"] as const) {
      if (this.text.startsWith(op, this.at)) {
        this.at += 1;
        return { kind: "unary", op, operand: this.parseUnary() };
      }
    }
    let operand = this.parsePrimary();
    this.skipSpace();
    while (this.text.startsWith("%", this.at)) {
      this.at += 1;
      operand = { kind: "unary", op: "%", operand };
      this.skipSpace();
    }
    return operand;
  }

  private parsePrimary(): FormulaExpression {
    this.skipSpace();
    if (this.at >= this.text.length) this.fail("expression expected");

    if (this.text.startsWith("(", this.at)) {
      this.at += 1;
      const inner = this.parseExpression(0);
      this.expect(")");
      return inner;
    }
    if (this.text.startsWith('"', this.at)) return this.parseString();

    // A cross-table reference: a table name, `::`, then a cell. The
    // renderer emits names unquoted — spaces, dots and all — so a name is
    // recognised only by the `::` that follows it, matched lazily so the
    // name cannot swallow the address.
    const cross = /^([A-Za-z_][A-Za-z0-9_ .]*?) *:: *(\$?[A-Za-z]+\$?\d+)/.exec(
      this.text.slice(this.at),
    );
    if (cross) {
      const target = parseReference(cross[2]!)!;
      this.at += cross[0].length;
      return { kind: "crossRef", table: cross[1]!, column: target.column, row: target.row };
    }

    const identifier = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(this.text.slice(this.at));
    if (identifier) {
      const word = identifier[0];
      const after = this.at + word.length;
      // A function call: an identifier immediately followed by "(".
      if (this.text[after] === "(") {
        this.at = after + 1;
        return { kind: "call", name: word, args: this.parseArguments() };
      }
      const upper = word.toUpperCase();
      if (upper === "TRUE" || upper === "FALSE") {
        this.at = after;
        return { kind: "boolean", value: upper === "TRUE" };
      }
    }

    const reference = this.tryReference();
    if (reference) return reference;

    const number = /^\d+(\.\d+)?([eE][-+]?\d+)?/.exec(this.text.slice(this.at));
    if (number) {
      this.at += number[0].length;
      return { kind: "number", value: Number(number[0]) };
    }
    this.fail("expression expected");
  }

  /** A reference or a range; both start the same way. */
  private tryReference(): FormulaExpression | undefined {
    const cell = /^\$?[A-Za-z]+\$?\d+/.exec(this.text.slice(this.at));
    if (!cell) {
      // A bare column: `SUM(D)`. Up to three letters, no digits after —
      // anything longer or followed by more word characters is a name,
      // and names are not references.
      const column = /^(\$?)([A-Za-z]{1,3})(?![A-Za-z0-9_.(])/.exec(this.text.slice(this.at));
      if (!column) return undefined;
      let index = 0;
      for (const character of column[2]!.toUpperCase()) {
        index = index * 26 + (character.charCodeAt(0) - 64);
      }
      this.at += column[0].length;
      return {
        kind: "columnRef",
        column: { value: index - 1, absolute: column[1] === "$" },
      };
    }
    const from = parseReference(cell[0]);
    if (!from) return undefined;
    const after = this.at + cell[0].length;
    if (this.text[after] === ":") {
      const second = /^\$?[A-Za-z]+\$?\d+/.exec(this.text.slice(after + 1));
      const to = second ? parseReference(second[0]) : undefined;
      if (!to) this.fail("range end expected after ':'");
      this.at = after + 1 + second![0].length;
      // Each endpoint keeps its `$` flags: the tract encodes an unpinned
      // axis relative to the using cell and a pinned one absolute, so
      // `A1:B2` and `$A$1:$B$2` are different bytes — measured, where the
      // earlier reading ("ranges are absolute") generalized from merges.
      return {
        kind: "range",
        from: { column: from.column, row: from.row },
        to: { column: to.column, row: to.row },
      };
    }
    this.at = after;
    return { kind: "ref", column: from.column, row: from.row };
  }

  private parseArguments(): FormulaExpression[] {
    const args: FormulaExpression[] = [];
    this.skipSpace();
    if (this.text.startsWith(")", this.at)) {
      this.at += 1;
      return args;
    }
    for (;;) {
      this.skipSpace();
      // `DURATION(,,8)` — an omitted argument is a node, not nothing.
      if (this.text.startsWith(",", this.at) || this.text.startsWith(")", this.at)) {
        args.push({ kind: "empty" });
      } else {
        args.push(this.parseExpression(0));
      }
      this.skipSpace();
      if (this.text.startsWith(",", this.at)) {
        this.at += 1;
        continue;
      }
      this.expect(")");
      return args;
    }
  }

  private parseString(): FormulaExpression {
    this.at += 1;
    let value = "";
    for (;;) {
      if (this.at >= this.text.length) this.fail("unterminated string");
      const character = this.text[this.at]!;
      this.at += 1;
      if (character !== '"') {
        value += character;
        continue;
      }
      // A doubled quote is an escaped quote, as everywhere else.
      if (this.text[this.at] === '"') {
        value += '"';
        this.at += 1;
        continue;
      }
      return { kind: "string", value };
    }
  }

  private matchOperator(operators: readonly BinaryOperator[]): BinaryOperator | undefined {
    this.skipSpace();
    // Longest first, so "<=" is never read as "<" followed by "=".
    for (const op of [...operators].sort((a, b) => b.length - a.length)) {
      if (!this.text.startsWith(op, this.at)) continue;
      this.at += op.length;
      return op;
    }
    return undefined;
  }

  private skipSpace(): void {
    while (this.at < this.text.length && /\s/.test(this.text[this.at]!)) this.at += 1;
  }

  private expect(character: string): void {
    this.skipSpace();
    if (!this.text.startsWith(character, this.at)) this.fail(`'${character}' expected`);
    this.at += character.length;
  }

  expectEnd(): void {
    this.skipSpace();
    if (this.at < this.text.length) this.fail("unexpected trailing input");
  }

  private fail(what: string): never {
    throw new RangeError(
      `${what} at position ${this.at} of ${JSON.stringify(this.text)}`,
    );
  }
}
