/**
 * Cell display formats: `TSK.FormatStructArchive`.
 *
 * A cell stores a value and, separately, how to *show* it. 1234.5 is a
 * number; whether it appears as `1,234.50`, `$1,234.50`, `123450%` or
 * `1 Jan 2004` is the format's business. Editing a cell without carrying
 * its format is how a spreadsheet ends up showing raw serial numbers where
 * dates used to be.
 *
 * Formats live in `DataStore.format_table`, keyed by an id the cell record
 * carries. Which of the record's six format flags holds that id is what
 * says the *category* — number, currency, date, duration, text or boolean —
 * so category never has to be inferred from the format's own type code.
 * That is worth stating because the type codes are otherwise opaque: the
 * mapping below was established by correlating every format in the corpus
 * against the flag that referenced it.
 *
 * | code | category | what it is |
 * |------|----------|------------|
 * | 1    | boolean  | true/false |
 * | 256  | number   | decimal |
 * | 257  | currency | currency, with code and accounting style |
 * | 258  | number   | percentage |
 * | 260  | text     | plain text |
 * | 261  | date     | date/time, with a pattern string |
 * | 266  | —        | pop-up menu (pre-BNC files only) |
 * | 270..274 | various | custom formats, identified by a UUID |
 */
import { measuredEnum, protoFields } from "../proto/fields.ts";
import { RawMessage } from "../base/protobuf.ts";
import { CellFlag } from "./cellrecord.ts";

/** TSK.FormatStructArchive — the fields this library models. */
export const FormatFields = protoFields("TSK.FormatStructArchive", {
  FORMAT_TYPE: "format_type",
  DECIMAL_PLACES: "decimal_places",
  CURRENCY_CODE: "currency_code",
  NEGATIVE_STYLE: "negative_style",
  SHOW_THOUSANDS_SEPARATOR: "show_thousands_separator",
  USE_ACCOUNTING_STYLE: "use_accounting_style",
  DURATION_STYLE: "duration_style",
  BASE: "base",
  BASE_PLACES: "base_places",
  FRACTION_ACCURACY: "fraction_accuracy",
  SUPPRESS_DATE_FORMAT: "suppress_date_format",
  SUPPRESS_TIME_FORMAT: "suppress_time_format",
  DATE_TIME_FORMAT: "date_time_format",
  DURATION_UNIT_LARGEST: "duration_unit_largest",
  DURATION_UNIT_SMALLEST: "duration_unit_smallest",
  CUSTOM_FORMAT_STRING: "custom_format_string",
  SCALE_FACTOR: "scale_factor",
  CUSTOM_UID: "custom_uid",
  BOOL_TRUE_STRING: "bool_true_string",
  BOOL_FALSE_STRING: "bool_false_string",
});

export const FormatType = measuredEnum(
  "TSK.FormatStructArchive.format_type",
  {
  BOOLEAN: 1,
  NUMBER: 256,
  CURRENCY: 257,
  PERCENTAGE: 258,
  TEXT: 260,
  DATE: 261,
  MULTIPLE_CHOICE: 266,
  /**
   * How a checkbox cell is drawn — a boolean format, not a number one.
   *
   * Measured, not published: two borrowed documents put a checkbox cell's
   * `bool_format` at a format whose whole body is `{ format_type: 263 }`.
   * The minimal case is the convincing one — `test-format-save.numbers` has
   * a checkbox with this format and *no* number format at all, which is
   * what shows the format is the thing that draws the control.
   */
  CHECKBOX: 263,
  /**
   * How a star-rating cell is drawn — a number format.
   *
   * Weaker evidence than {@link CHECKBOX}: one document, where it is the
   * `num_format` of both the star-rating cell and (alongside its bool
   * format) the checkbox. Sliders and steppers use a plain NUMBER instead,
   * which fits — they display their value and a rating does not.
   */
  STAR_RATING: 267,
  CUSTOM_NUMBER: 270,
  CUSTOM_TEXT: 271,
  CUSTOM_DATE: 272,
  CUSTOM_DURATION: 273,
  CUSTOM_CURRENCY: 274,
  },
  "`format_type` is a uint32 with no enum in the 14.4 dump. These values " +
    "are read back from the corpus's own formatted cells rather than " +
    "invented, and every one of them round-trips through the format tests.",
);

/**
 * `decimal_places` is a count, except for this one value.
 *
 * 253 means "as many as the value needs" — the inspector's *Automatic*.
 * Read as a plain count it becomes a request for 253 decimal places.
 */
export const AUTOMATIC_DECIMALS = 253;

/** How negative numbers are shown. */
export const NegativeStyle = {
  MINUS: 0,
  RED: 1,
  PARENTHESES: 2,
  RED_PARENTHESES: 3,
} as const;

/** Which record flag carries the id for a given category. */
export const FORMAT_FLAG_BY_CATEGORY = {
  number: CellFlag.NUM_FORMAT_ID,
  currency: CellFlag.CURRENCY_FORMAT_ID,
  date: CellFlag.DATE_FORMAT_ID,
  duration: CellFlag.DURATION_FORMAT_ID,
  text: CellFlag.TEXT_FORMAT_ID,
  boolean: CellFlag.BOOL_FORMAT_ID,
} as const;

export type FormatCategory = keyof typeof FORMAT_FLAG_BY_CATEGORY;

/** Shared numeric presentation options. */
export interface NumericFormatOptions {
  /** Digits after the point, or "auto". */
  decimals?: number | "auto";
  thousandsSeparator?: boolean;
  /** See {@link NegativeStyle}. */
  negativeStyle?: number;
}

export type CellFormat =
  | ({ kind: "number" } & NumericFormatOptions)
  | ({ kind: "percentage" } & NumericFormatOptions)
  | ({
      kind: "currency";
      /** ISO 4217, e.g. "USD". */
      code?: string;
      /** Show the symbol flush left with the value flush right. */
      accountingStyle?: boolean;
    } & NumericFormatOptions)
  | {
      kind: "date";
      /** Unicode date pattern, e.g. "d MMM yyyy". */
      pattern?: string;
      dateSuppressed?: boolean;
      timeSuppressed?: boolean;
    }
  | { kind: "duration"; style?: number; largestUnit?: number; smallestUnit?: number }
  | { kind: "text" }
  | { kind: "boolean"; trueString?: string; falseString?: string }
  /**
   * Draw the cell as its control rather than as a value.
   *
   * A control cell needs two things: a spec saying what the widget is, and
   * a *format* saying to draw it. {@link TableModel.setCellControl} writes
   * both, so this is rarely constructed by hand.
   */
  | { kind: "checkbox" }
  | { kind: "starRating" }
  | {
      /**
       * A user-defined format. Its definition lives elsewhere in the
       * document, identified by a UUID; the parameters are not modelled,
       * so the whole archive is carried through untouched.
       */
      kind: "custom";
      category: FormatCategory;
      formatType: number;
    }
  | { kind: "unknown"; formatType: number };

/** Category a format belongs to, from its type code. */
export function categoryOfFormatType(formatType: number): FormatCategory | undefined {
  switch (formatType) {
    case FormatType.BOOLEAN:
      return "boolean";
    case FormatType.NUMBER:
    case FormatType.PERCENTAGE:
    case FormatType.CUSTOM_NUMBER:
      return "number";
    case FormatType.CURRENCY:
    case FormatType.CUSTOM_CURRENCY:
      return "currency";
    case FormatType.TEXT:
    case FormatType.CUSTOM_TEXT:
      return "text";
    case FormatType.CHECKBOX:
      return "boolean";
    case FormatType.STAR_RATING:
      return "number";
    case FormatType.DATE:
    case FormatType.CUSTOM_DATE:
      return "date";
    case FormatType.CUSTOM_DURATION:
      return "duration";
    default:
      return undefined;
  }
}

/** The record flag that should carry a format of this kind. */
export function flagForFormat(format: CellFormat): number {
  switch (format.kind) {
    case "number":
    case "percentage":
      return CellFlag.NUM_FORMAT_ID;
    case "currency":
      return CellFlag.CURRENCY_FORMAT_ID;
    case "date":
      return CellFlag.DATE_FORMAT_ID;
    case "duration":
      return CellFlag.DURATION_FORMAT_ID;
    case "text":
      return CellFlag.TEXT_FORMAT_ID;
    case "boolean":
    case "checkbox":
      return CellFlag.BOOL_FORMAT_ID;
    case "starRating":
      return CellFlag.NUM_FORMAT_ID;
    case "custom":
      return FORMAT_FLAG_BY_CATEGORY[format.category];
    default:
      return CellFlag.NUM_FORMAT_ID;
  }
}

function readDecimals(message: RawMessage): number | "auto" | undefined {
  const value = message.getUint(FormatFields.DECIMAL_PLACES);
  if (value === undefined) return undefined;
  return value === AUTOMATIC_DECIMALS ? "auto" : value;
}

function readNumeric(message: RawMessage): NumericFormatOptions {
  const out: NumericFormatOptions = {};
  const decimals = readDecimals(message);
  if (decimals !== undefined) out.decimals = decimals;
  const separator = message.getBool(FormatFields.SHOW_THOUSANDS_SEPARATOR);
  if (separator !== undefined) out.thousandsSeparator = separator;
  const negative = message.getUint(FormatFields.NEGATIVE_STYLE);
  if (negative !== undefined) out.negativeStyle = negative;
  return out;
}

export function readFormat(message: RawMessage | undefined): CellFormat | undefined {
  if (!message) return undefined;
  const formatType = message.getUint(FormatFields.FORMAT_TYPE);
  if (formatType === undefined) return undefined;

  // A custom format is a reference to a definition elsewhere; its own
  // fields say nothing useful, so it is reported rather than decoded.
  if (message.has(FormatFields.CUSTOM_UID)) {
    const category = categoryOfFormatType(formatType);
    return category
      ? { kind: "custom", category, formatType }
      : { kind: "unknown", formatType };
  }

  switch (formatType) {
    case FormatType.CHECKBOX:
      return { kind: "checkbox" };
    case FormatType.STAR_RATING:
      return { kind: "starRating" };
    case FormatType.NUMBER:
      return { kind: "number", ...readNumeric(message) };
    case FormatType.PERCENTAGE:
      return { kind: "percentage", ...readNumeric(message) };
    case FormatType.CURRENCY: {
      const out: CellFormat = { kind: "currency", ...readNumeric(message) };
      const code = message.getString(FormatFields.CURRENCY_CODE);
      if (code !== undefined) out.code = code;
      const accounting = message.getBool(FormatFields.USE_ACCOUNTING_STYLE);
      if (accounting !== undefined) out.accountingStyle = accounting;
      return out;
    }
    case FormatType.DATE: {
      const out: CellFormat = { kind: "date" };
      const pattern = message.getString(FormatFields.DATE_TIME_FORMAT);
      if (pattern !== undefined) out.pattern = pattern;
      const noDate = message.getBool(FormatFields.SUPPRESS_DATE_FORMAT);
      if (noDate !== undefined) out.dateSuppressed = noDate;
      const noTime = message.getBool(FormatFields.SUPPRESS_TIME_FORMAT);
      if (noTime !== undefined) out.timeSuppressed = noTime;
      return out;
    }
    case FormatType.TEXT:
      return { kind: "text" };
    case FormatType.BOOLEAN: {
      const yes = message.getString(FormatFields.BOOL_TRUE_STRING);
      const no = message.getString(FormatFields.BOOL_FALSE_STRING);
      // A bare boolean format draws the checkbox control; custom
      // true/false strings make it a worded boolean instead.
      if (yes === undefined && no === undefined) return { kind: "checkbox" };
      const out: CellFormat = { kind: "boolean" };
      if (yes !== undefined) out.trueString = yes;
      if (no !== undefined) out.falseString = no;
      return out;
    }
    default: {
      // Duration has no observed builtin code in the corpus, so it is
      // recognised only through its flag; anything else is reported as-is
      // rather than guessed at.
      const style = message.getUint(FormatFields.DURATION_STYLE);
      if (style !== undefined) {
        const out: CellFormat = { kind: "duration", style };
        const largest = message.getUint(FormatFields.DURATION_UNIT_LARGEST);
        if (largest !== undefined) out.largestUnit = largest;
        const smallest = message.getUint(FormatFields.DURATION_UNIT_SMALLEST);
        if (smallest !== undefined) out.smallestUnit = smallest;
        return out;
      }
      return { kind: "unknown", formatType };
    }
  }
}

/**
 * Build a `TSK.FormatStructArchive`.
 *
 * A custom format cannot be built here: its definition lives elsewhere and
 * is identified by a UUID we have no way to mint meaningfully. Reading one
 * and writing it back is fine — that path reuses the original archive —
 * but authoring one is refused rather than faked.
 */
export function writeFormat(format: CellFormat): RawMessage {
  const m = RawMessage.create();
  const numeric = (options: NumericFormatOptions): void => {
    if (options.decimals !== undefined) {
      m.setVarint(
        FormatFields.DECIMAL_PLACES,
        options.decimals === "auto" ? AUTOMATIC_DECIMALS : options.decimals,
      );
    }
    if (options.negativeStyle !== undefined) {
      m.setVarint(FormatFields.NEGATIVE_STYLE, options.negativeStyle);
    }
    if (options.thousandsSeparator !== undefined) {
      m.setBool(FormatFields.SHOW_THOUSANDS_SEPARATOR, options.thousandsSeparator);
    }
  };

  switch (format.kind) {
    case "number":
      m.setVarint(FormatFields.FORMAT_TYPE, FormatType.NUMBER);
      numeric(format);
      break;
    case "percentage":
      m.setVarint(FormatFields.FORMAT_TYPE, FormatType.PERCENTAGE);
      numeric(format);
      break;
    case "currency":
      m.setVarint(FormatFields.FORMAT_TYPE, FormatType.CURRENCY);
      if (format.code !== undefined) m.setString(FormatFields.CURRENCY_CODE, format.code);
      numeric(format);
      // Negative style, separator and accounting are stated even at their
      // defaults — the app's own currency formats carry all three
      // ({1,2,3,4,5,6}), and one missing the tail read as Automatic.
      if (format.negativeStyle === undefined) m.setVarint(FormatFields.NEGATIVE_STYLE, 0);
      if (format.thousandsSeparator === undefined) {
        m.setBool(FormatFields.SHOW_THOUSANDS_SEPARATOR, false);
      }
      m.setBool(FormatFields.USE_ACCOUNTING_STYLE, format.accountingStyle ?? false);
      break;
    case "date":
      m.setVarint(FormatFields.FORMAT_TYPE, FormatType.DATE);
      if (format.pattern !== undefined) {
        m.setString(FormatFields.DATE_TIME_FORMAT, format.pattern);
      }
      if (format.dateSuppressed !== undefined) {
        m.setBool(FormatFields.SUPPRESS_DATE_FORMAT, format.dateSuppressed);
      }
      if (format.timeSuppressed !== undefined) {
        m.setBool(FormatFields.SUPPRESS_TIME_FORMAT, format.timeSuppressed);
      }
      break;
    case "duration":
      m.setVarint(FormatFields.FORMAT_TYPE, FormatType.CUSTOM_DURATION);
      if (format.style !== undefined) m.setVarint(FormatFields.DURATION_STYLE, format.style);
      if (format.largestUnit !== undefined) {
        m.setVarint(FormatFields.DURATION_UNIT_LARGEST, format.largestUnit);
      }
      if (format.smallestUnit !== undefined) {
        m.setVarint(FormatFields.DURATION_UNIT_SMALLEST, format.smallestUnit);
      }
      break;
    case "text":
      m.setVarint(FormatFields.FORMAT_TYPE, FormatType.TEXT);
      break;
    case "boolean":
      m.setVarint(FormatFields.FORMAT_TYPE, FormatType.BOOLEAN);
      if (format.trueString !== undefined) {
        m.setString(FormatFields.BOOL_TRUE_STRING, format.trueString);
      }
      if (format.falseString !== undefined) {
        m.setString(FormatFields.BOOL_FALSE_STRING, format.falseString);
      }
      break;
    case "checkbox":
      // A bare boolean format IS the checkbox in current files: the one
      // corpus document with checkbox cells (30 of them, 26.0-era) draws
      // them from `{ format_type: 1 }` and nothing else, and a cell
      // formatted with 263 showed as the inspector's Automatic with the
      // word SAND instead of a control. 263 remains readable — the two
      // borrowed documents that measured it are real files — but it is
      // no longer what gets written.
      m.setVarint(FormatFields.FORMAT_TYPE, FormatType.BOOLEAN);
      break;
    case "starRating":
      m.setVarint(FormatFields.FORMAT_TYPE, FormatType.STAR_RATING);
      break;
    case "custom":
      throw new RangeError(
        "a custom format cannot be authored: its definition is identified by a UUID " +
          "this library has no way to mint. Copy an existing one instead.",
      );
    default:
      throw new RangeError(`cannot write format of kind ${JSON.stringify(format)}`);
  }
  return m;
}
