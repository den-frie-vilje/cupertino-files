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
 * The one import is `../proto/fields.ts`, which imports only its generated
 * table, which imports nothing. That is deliberate: the field numbers have
 * to come from Apple's schema like everywhere else, and the leaf property
 * survives because the dependency is a leaf too.
 */
import { protoEnum, protoFields } from "../proto/fields.ts";

/** TSCE.FormulaArchive. */
export const FormulaFields = protoFields("TSCE.FormulaArchive", {
  AST_NODE_ARRAY: "AST_node_array",
  HOST_COLUMN: "host_column",
  HOST_ROW: "host_row",
  HOST_COLUMN_IS_NEGATIVE: "host_column_is_negative",
  HOST_ROW_IS_NEGATIVE: "host_row_is_negative",
});

/** TSCE.ASTNodeArrayArchive: repeated AST_node = 1. */
export const AstNodeArrayFields = protoFields("TSCE.ASTNodeArrayArchive", { NODES: "AST_node" });

/** TSCE.ASTNodeArrayArchive.ASTNodeArchive — the fields we render. */
export const AstNodeFields = protoFields("TSCE.ASTNodeArrayArchive.ASTNodeArchive", {
  TYPE: "AST_node_type",
  FUNCTION_INDEX: "AST_function_node_index",
  FUNCTION_NUM_ARGS: "AST_function_node_numArgs",
  NUMBER: "AST_number_node_number",
  BOOLEAN: "AST_boolean_node_boolean",
  STRING: "AST_string_node_string",
  TOKEN_BOOLEAN: "AST_token_node_boolean",
  WHITESPACE: "AST_whitespace",
  COLUMN: "AST_column",
  ROW: "AST_row",
  CROSS_TABLE_INFO: "AST_cross_table_reference_extra_info",
  TRACT_LIST: "AST_tract_list",
  COLON_TRACT: "AST_colon_tract",
  NUMBER_DECIMAL_LOW: "AST_number_node_decimal_low",
  NUMBER_DECIMAL_HIGH: "AST_number_node_decimal_high",
});

/** ASTColumnCoordinateArchive / ASTRowCoordinateArchive. */
export const CoordinateFields = protoFields("TSCE.ASTNodeArrayArchive.ASTUidCoordinateArchive", { INDEX: "column_uid", ABSOLUTE: "row_uid" });

/**
 * ASTColonTractArchive. Ranges come in two flavours and both occur: the
 * absolute pair holds real indexes, the relative pair holds offsets from
 * the using cell. A reader that only knows one renders the other as #REF!.
 */
export const ColonTractFields = protoFields("TSCE.ASTNodeArrayArchive.ASTColonTractArchive", {
  RELATIVE_COLUMN: "relative_column",
  RELATIVE_ROW: "relative_row",
  ABSOLUTE_COLUMN: "absolute_column",
  ABSOLUTE_ROW: "absolute_row",
});

/** TSCE.ASTNodeArrayArchive.ASTNodeArchive.ASTNodeType. */
export const AstNodeType = protoEnum("TSCE.ASTNodeArrayArchive.ASTNodeType", {
  ADDITION: "ADDITION_NODE",
  SUBTRACTION: "SUBTRACTION_NODE",
  MULTIPLICATION: "MULTIPLICATION_NODE",
  DIVISION: "DIVISION_NODE",
  POWER: "POWER_NODE",
  CONCATENATION: "CONCATENATION_NODE",
  GREATER_THAN: "GREATER_THAN_NODE",
  GREATER_THAN_OR_EQUAL: "GREATER_THAN_OR_EQUAL_TO_NODE",
  LESS_THAN: "LESS_THAN_NODE",
  LESS_THAN_OR_EQUAL: "LESS_THAN_OR_EQUAL_TO_NODE",
  EQUAL_TO: "EQUAL_TO_NODE",
  NOT_EQUAL_TO: "NOT_EQUAL_TO_NODE",
  NEGATION: "NEGATION_NODE",
  PLUS_SIGN: "PLUS_SIGN_NODE",
  PERCENT: "PERCENT_NODE",
  FUNCTION: "FUNCTION_NODE",
  NUMBER: "NUMBER_NODE",
  BOOLEAN: "BOOLEAN_NODE",
  STRING: "STRING_NODE",
  DATE: "DATE_NODE",
  DURATION: "DURATION_NODE",
  EMPTY_ARGUMENT: "EMPTY_ARGUMENT_NODE",
  TOKEN: "TOKEN_NODE",
  ARRAY: "ARRAY_NODE",
  LIST: "LIST_NODE",
  LOCAL_CELL_REFERENCE: "LOCAL_CELL_REFERENCE_NODE",
  CROSS_TABLE_CELL_REFERENCE: "CROSS_TABLE_CELL_REFERENCE_NODE",
  COLON: "COLON_NODE",
  REFERENCE_ERROR: "REFERENCE_ERROR_NODE",
  UNKNOWN_FUNCTION: "UNKNOWN_FUNCTION_NODE",
  APPEND_WHITESPACE: "APPEND_WHITESPACE_NODE",
  PREPEND_WHITESPACE: "PREPEND_WHITESPACE_NODE",
  CELL_REFERENCE: "CELL_REFERENCE_NODE",
  COLON_WITH_UIDS: "COLON_NODE_WITH_UIDS",
  REFERENCE_ERROR_WITH_UIDS: "REFERENCE_ERROR_WITH_UIDS",
  LINKED_CELL_REFERENCE: "LINKED_CELL_REF_NODE",
  LINKED_COLUMN_REFERENCE: "LINKED_COLUMN_REF_NODE",
  LINKED_ROW_REFERENCE: "LINKED_ROW_REF_NODE",
  COLON_TRACT: "COLON_TRACT_NODE",
  INTERSECTION: "INTERSECTION_NODE",
});

/**
 * Rendered in place of a table name we cannot resolve.
 *
 * A cross-table reference names its target by calc-engine owner UUID, not
 * by table. See `src/tsce/owners.ts` for how the mapping works.
 */
export const CROSS_TABLE_PREFIX = "OTHER_TABLE::";
