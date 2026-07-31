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
 * ## Ranges are written absolute
 *
 * A colon tract can express its bounds two ways, and both occur in real
 * files: `absolute_column`/`absolute_row` hold indexes, `relative_column`/
 * `relative_row` hold offsets from the formula's cell. Apple writes the
 * relative form for a range typed as `C3:K6` — `=SUM(C3:K6)` in C7 stores
 * columns `0…8` and rows `-4…-1`, as **plain signed varints**, not the
 * zigzag encoding a single coordinate uses.
 *
 * This writer emits the absolute form, which merges also use and the reader
 * has always handled. The cells denoted are identical; what differs is what
 * happens when rows are inserted above the range, where a relative tract
 * moves and an absolute one does not. A range authored here therefore reads
 * back as `$A$1:$A$5` rather than `A1:A5` — the same cells, said the
 * anchored way.
 *
 * ## What is deliberately missing
 *
 * Cross-table references (`Other::A1`), arrays, and the `#REF!` error are
 * not authored. Each needs a calc-engine identity — a table UUID, an owner
 * — that must be registered elsewhere in the document, and a formula
 * pointing at an identity the engine does not know is worse than no
 * formula. Reading all three works.
 */
import { RawMessage } from "../base/protobuf.ts";
import { AstNodeArrayFields, AstNodeFields, AstNodeType } from "../tsce/ast.ts";
import { HARVESTED_FUNCTIONS } from "./function-names.ts";

/** An expression to compile. Built by {@link parseFormula} or by hand. */
export type FormulaExpression =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "boolean"; value: boolean }
  /** A cell, as an offset or an absolute index; `undefined` means "same". */
  | { kind: "ref"; column: Coordinate; row: Coordinate }
  /** A rectangle, stored as a colon tract with absolute bounds. */
  | { kind: "range"; from: { column: number; row: number }; to: { column: number; row: number } }
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
const ColonTractFields = { ABSOLUTE_COLUMN: 3, ABSOLUTE_ROW: 4, PRESERVE_RECTANGULAR: 5 } as const;
const TractRangeFields = { BEGIN: 1, END: 2 } as const;
const StickyBitsField = 33;
const ColonTractField = 40;

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

/**
 * Compile an expression to a `TSCE.ASTNodeArrayArchive`.
 *
 * `origin` is the cell the formula lives in; relative references are stored
 * as offsets from it.
 */
export function buildFormula(
  expression: FormulaExpression,
  origin: { row: number; column: number },
): RawMessage {
  const nodes = RawMessage.create();
  emit(expression, origin, (node) => nodes.addMessage(AstNodeArrayFields.NODES, node));
  return nodes;
}

/** Depth-first post-order: operands, then the thing that consumes them. */
function emit(
  expression: FormulaExpression,
  origin: { row: number; column: number },
  push: (node: RawMessage) => void,
): void {
  const node = RawMessage.create();
  switch (expression.kind) {
    case "number":
      node.setVarint(AstNodeFields.TYPE, AstNodeType.NUMBER);
      node.setDouble(AstNodeFields.NUMBER, expression.value);
      break;
    case "string":
      node.setVarint(AstNodeFields.TYPE, AstNodeType.STRING);
      node.setString(AstNodeFields.STRING, expression.value);
      break;
    case "boolean":
      node.setVarint(AstNodeFields.TYPE, AstNodeType.BOOLEAN);
      node.setVarint(AstNodeFields.BOOLEAN, expression.value ? 1 : 0);
      break;
    case "empty":
      node.setVarint(AstNodeFields.TYPE, AstNodeType.EMPTY_ARGUMENT);
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
    case "range": {
      // A rectangle is a colon tract with absolute bounds, the same shape a
      // merge uses. Sticky bits are all zero here: unlike a merge, a range
      // in a formula does move when rows are inserted around it.
      node.setVarint(AstNodeFields.TYPE, AstNodeType.COLON_TRACT);
      const sticky = RawMessage.create();
      for (const field of [1, 2, 3, 4]) sticky.setVarint(field, 0);
      node.setMessage(StickyBitsField, sticky);
      const tract = RawMessage.create();
      tract.setMessage(
        ColonTractFields.ABSOLUTE_COLUMN,
        tractRange(expression.from.column, expression.to.column),
      );
      tract.setMessage(
        ColonTractFields.ABSOLUTE_ROW,
        tractRange(expression.from.row, expression.to.row),
      );
      tract.setVarint(ColonTractFields.PRESERVE_RECTANGULAR, 1);
      node.setMessage(ColonTractField, tract);
      break;
    }
    case "unary":
      emit(expression.operand, origin, push);
      node.setVarint(AstNodeFields.TYPE, UNARY_NODE[expression.op]);
      break;
    case "binary":
      emit(expression.left, origin, push);
      emit(expression.right, origin, push);
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
      for (const arg of expression.args) emit(arg, origin, push);
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

    const identifier = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(this.text.slice(this.at));
    if (identifier) {
      const word = identifier[0]!;
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
      this.at += number[0]!.length;
      return { kind: "number", value: Number(number[0]) };
    }
    this.fail("expression expected");
  }

  /** A reference or a range; both start the same way. */
  private tryReference(): FormulaExpression | undefined {
    const cell = /^\$?[A-Za-z]+\$?\d+/.exec(this.text.slice(this.at));
    if (!cell) return undefined;
    const from = parseReference(cell[0]!);
    if (!from) return undefined;
    const after = this.at + cell[0]!.length;
    if (this.text[after] === ":") {
      const second = /^\$?[A-Za-z]+\$?\d+/.exec(this.text.slice(after + 1));
      const to = second ? parseReference(second[0]!) : undefined;
      if (!to) this.fail("range end expected after ':'");
      this.at = after + 1 + second![0]!.length;
      // A range is stored with absolute bounds, so a relative endpoint is
      // resolved here rather than silently written as an absolute one.
      // Every range in the corpus has absolute bounds, and a colon tract
      // has no way to say otherwise, so `A1:B2` and `$A$1:$B$2` compile the
      // same. Accepting both matches what the app displays.
      return {
        kind: "range",
        from: { column: from.column.value, row: from.row.value },
        to: { column: to.column.value, row: to.row.value },
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
