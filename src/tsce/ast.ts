/**
 * TSCE calc-engine schema constants — field numbers and node types.
 *
 * A leaf module on purpose. These are shared by the formula *reader*
 * (`../tst/formulas.ts`), the formula *writer* (`../tst/formula-builder.ts`)
 * and the predicate decoder, and every one of them uses the values at
 * module-initialisation time to build lookup tables. Left in the reader,
 * that made an import cycle that only failed once a second module joined
 * it — `Cannot access 'AstNodeType' before initialization`, from a file
 * that never mentions it.
 *
 * Nothing here imports anything, which is what keeps that from recurring.
 */

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
export const CoordinateFields = { INDEX: 1, ABSOLUTE: 2 } as const;

/**
 * ASTColonTractArchive. Ranges come in two flavours and both occur: the
 * absolute pair holds real indexes, the relative pair holds offsets from
 * the using cell. A reader that only knows one renders the other as #REF!.
 */
export const ColonTractFields = {
  RELATIVE_COLUMN: 1,
  RELATIVE_ROW: 2,
  ABSOLUTE_COLUMN: 3,
  ABSOLUTE_ROW: 4,
} as const;

/** TSCE.ASTNodeArrayArchive.ASTNodeArchive.ASTNodeType. */
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
 * Rendered in place of a table name we cannot resolve.
 *
 * A cross-table reference names its target by calc-engine owner UUID, not
 * by table. See `src/tsce/owners.ts` for how the mapping works.
 */
export const CROSS_TABLE_PREFIX = "OTHER_TABLE::";
