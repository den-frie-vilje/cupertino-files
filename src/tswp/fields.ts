/**
 * Smart fields and inline attachments (`TSWP.NumberAttachmentArchive` and
 * friends).
 *
 * Two mechanisms live in text and are easy to confuse:
 *
 *  - a **smart field** spans a *range* of real characters. A hyperlink is
 *    one: the words stay in the text, the field decorates them.
 *  - an **attachment** occupies a *single* U+FFFC placeholder character and
 *    is rendered from the archive rather than from the text. A page number
 *    is one: no digits exist in the storage at all, because the number
 *    depends on layout.
 *
 * Page numbers and page counts are attachments, which is why inserting one
 * means inserting a character and pointing the attachment table at it —
 * not writing "1" and hoping. The archive that renders it is:
 *
 * ```proto
 * message TSWP.TextualAttachmentArchive {
 *   enum Kind { kKindPageNumber = 0; kKindPageCount = 1; kKindFootnoteMark = 2; }
 *   optional string string_equivalent = 1;   // what copy-paste yields
 *   optional Kind kind = 2;
 * }
 * message TSWP.NumberAttachmentArchive {     // type 2043
 *   optional TSWP.TextualAttachmentArchive super = 1;
 *   optional uint32 number_format = 2;
 *   optional string string_value = 3;        // last rendered value, a cache
 *   optional string number_format_name = 4;
 * }
 * ```
 *
 * `number_format` is an unpublished enum and the corpus shows only two of
 * its members — 0 alongside the name `"decimal"`, 2 alongside
 * `"lower-roman"`. So {@link PAGE_NUMBER_FORMATS} lists exactly those, and
 * a caller wanting another passes the code and name together rather than
 * having one guessed for them.
 *
 * `string_value` is a cache of the last number the app rendered. It is
 * never written here: the value depends on pagination, which this library
 * does not perform, and a stale digit shown in place of a live field is
 * worse than an empty one the app fills in.
 */
import { protoEnum, protoFields } from "../proto/fields.ts";
import type { IwaObject } from "../tsp/iwa.ts";
import type { Component, ObjectStore } from "../tsp/store.ts";
import { RawMessage } from "../base/protobuf.ts";
import { randomUuid } from "../base/uuid.ts";
import { APPLE_EPOCH_MS } from "../base/bytes.ts";

/** TSWP archive types for attachments this module builds. */
export const ATTACHMENT_TYPE = {
  NUMBER: 2043,
  TEXTUAL: 2004,
} as const;

/** TSWP.TextualAttachmentArchive. */
export const TextualAttachment = protoFields("TSWP.TextualAttachmentArchive", {
  STRING_EQUIVALENT: "string_equivalent",
  KIND: "kind",
});

/** TSWP.NumberAttachmentArchive. */
export const NumberAttachment = protoFields("TSWP.NumberAttachmentArchive", {
  SUPER: "super",
  NUMBER_FORMAT: "number_format",
  STRING_VALUE: "string_value",
  NUMBER_FORMAT_NAME: "number_format_name",
});

/** TSWP.TextualAttachmentArchive.Kind. */
export const AttachmentKind = protoEnum("TSWP.TextualAttachmentArchive.Kind", {
  PAGE_NUMBER: "kKindPageNumber",
  PAGE_COUNT: "kKindPageCount",
  FOOTNOTE_MARK: "kKindFootnoteMark",
});

/**
 * Page-number formats this library will write.
 *
 * Deliberately short. Apple's `number_format` enum certainly has more
 * members — the UI offers roman numerals in both cases, letters, and more —
 * but only these two appear in any file examined, each with its name
 * written alongside so the pairing is not inferred. A format outside this
 * list is written by passing both halves explicitly to
 * {@link buildNumberAttachment}.
 */
export const PAGE_NUMBER_FORMATS = {
  decimal: { code: 0, name: "decimal" },
  "lower-roman": { code: 2, name: "lower-roman" },
} as const;

export type PageNumberFormatName = keyof typeof PAGE_NUMBER_FORMATS;

export interface NumberAttachmentOptions {
  /** Page number (the default) or page count. */
  kind?: number;
  /** One of {@link PAGE_NUMBER_FORMATS}. */
  format?: PageNumberFormatName;
  /**
   * A `number_format` code and its `number_format_name`, together, for a
   * format harvested from a real install. Overrides {@link format}; the two
   * must match, because the apps read the code and the name is what makes
   * the file self-describing.
   */
  formatCode?: number;
  formatName?: string;
}

/**
 * Build the archive that renders a page number or page count.
 *
 * Reproduces the field set Apple writes: a `super` carrying the kind and an
 * empty `string_equivalent`, plus the format code and its name. The
 * rendered value (`string_value`) is left out — see the module note.
 */
export function buildNumberAttachment(
  store: ObjectStore,
  component: Component,
  options: NumberAttachmentOptions = {},
): IwaObject {
  const { code, name } = resolveFormat(options);
  const message = RawMessage.create();

  const textual = RawMessage.create();
  // Written even though empty: 46 of the 86 corpus attachments carry it,
  // and an empty string is what they carry.
  textual.setString(TextualAttachment.STRING_EQUIVALENT, "");
  textual.setVarint(TextualAttachment.KIND, options.kind ?? AttachmentKind.PAGE_NUMBER);
  message.setMessage(NumberAttachment.SUPER, textual);
  message.setVarint(NumberAttachment.NUMBER_FORMAT, code);
  message.setString(NumberAttachment.NUMBER_FORMAT_NAME, name);

  const object = store.createObject(ATTACHMENT_TYPE.NUMBER, component);
  object.setMessageBytes(message.toBytes());
  return object;
}

function resolveFormat(options: NumberAttachmentOptions): { code: number; name: string } {
  if (options.formatCode !== undefined || options.formatName !== undefined) {
    if (options.formatCode === undefined || options.formatName === undefined) {
      throw new RangeError(
        "formatCode and formatName must be given together: the apps read the code, and a file whose name disagrees with it is self-contradictory",
      );
    }
    return { code: options.formatCode, name: options.formatName };
  }
  // Widened: the types make this lookup total, but JS callers can pass anything.
  const known = PAGE_NUMBER_FORMATS[options.format ?? "decimal"] as
    | (typeof PAGE_NUMBER_FORMATS)[keyof typeof PAGE_NUMBER_FORMATS]
    | undefined;
  if (!known) {
    throw new RangeError(
      `unknown page number format ${options.format}; known: ${Object.keys(PAGE_NUMBER_FORMATS).join(", ")}. Pass formatCode and formatName to write another.`,
    );
  }
  return known;
}

/** TSWP archive types for the span-based smart fields built here. */
export const SMART_FIELD_TYPE = {
  DATE_TIME: 2034,
  BOOKMARK: 2035,
  PLACEHOLDER: 2031,
} as const;

/** TSWP.SmartFieldArchive — the base every span field embeds at field 1. */
export const SmartField = protoFields("TSWP.SmartFieldArchive", { TEXT_ATTRIBUTE_UUID: "text_attribute_uuid_string" });

/** TSWP.DateTimeSmartFieldArchive. */
export const DateTimeField = protoFields("TSWP.DateTimeSmartFieldArchive", {
  SUPER: "super",
  FORMAT: "format",
  LOCALE_IDENTIFIER: "locale_identifier",
  DATE_STYLE: "date_style",
  TIME_STYLE: "time_style",
  UPDATE_PLAN: "update_plan",
  NEEDS_UPDATE: "needs_update",
  DATE: "date",
});

/** TSWP.DateTimeSmartFieldArchive.DateTimeFormatterStyle. */
export const DateTimeStyle = protoEnum("TSWP.DateTimeSmartFieldArchive.DateTimeFormatterStyle", {
  NONE: "kDateTimeFormatterStyleNone",
  SHORT: "kDateTimeFormatterStyleShort",
  MEDIUM: "kDateTimeFormatterStyleMedium",
  LONG: "kDateTimeFormatterStyleLong",
  FULL: "kDateTimeFormatterStyleFull",
});

/** TSWP.DateTimeSmartFieldArchive.DateTimeUpdatePlan. */
export const DateTimeUpdatePlan = protoEnum("TSWP.DateTimeSmartFieldArchive.DateTimeUpdatePlan", {
  /** Frozen: the text stays as written. */
  NEVER: "kDateTimeUpdatePlanNever",
  /** Refreshed whenever the app opens or prints the document. */
  AUTO: "kDateTimeUpdatePlanAuto",
  /** Refreshed once, then frozen. */
  ONCE: "kDateTimeUpdatePlanOnce",
});

/** TSWP.BookmarkFieldArchive. */
export const BookmarkFieldArchive = protoFields("TSWP.BookmarkFieldArchive", {
  SUPER: "super",
  NAME: "name",
  RANGED: "ranged",
  HIDDEN: "hidden",
});

/** TSP.Date: seconds = 1, from 2001-01-01. */
const DATE_SECONDS = 1;

export interface DateFieldOptions {
  /** The moment the field represents. Defaults to now. */
  date?: Date;
  /** Apple's date pattern, e.g. `"MMMM d, y"`. */
  format?: string;
  /** BCP-47 identifier the app formats with, e.g. `"en"`. */
  locale?: string;
  /** One of {@link DateTimeStyle}; `LONG` by default. */
  dateStyle?: number;
  /** One of {@link DateTimeStyle}; `NONE` by default — a date, not a time. */
  timeStyle?: number;
  /** One of {@link DateTimeUpdatePlan}; `AUTO` by default. */
  updatePlan?: number;
}

/**
 * Build a `TSWP.DateTimeSmartFieldArchive`.
 *
 * A date field spans **real characters**, unlike a page number: the text is
 * in the storage and the app rewrites it when the field updates. So the
 * caller supplies the text to show, and `needs_update` is set so the app
 * replaces it with its own rendering at the first opportunity — rendering
 * a date the way a given locale and pattern would is Foundation's job, and
 * approximating it here would put subtly wrong text in the document.
 */
export function buildDateField(
  store: ObjectStore,
  component: Component,
  options: DateFieldOptions = {},
): IwaObject {
  const message = RawMessage.create();
  const smartField = RawMessage.create();
  smartField.setString(SmartField.TEXT_ATTRIBUTE_UUID, randomUuid());
  message.setMessage(DateTimeField.SUPER, smartField);

  message.setString(DateTimeField.FORMAT, options.format ?? "MMMM d, y");
  message.setString(DateTimeField.LOCALE_IDENTIFIER, options.locale ?? "en");
  message.setVarint(DateTimeField.DATE_STYLE, options.dateStyle ?? DateTimeStyle.LONG);
  message.setVarint(DateTimeField.TIME_STYLE, options.timeStyle ?? DateTimeStyle.NONE);
  message.setVarint(DateTimeField.UPDATE_PLAN, options.updatePlan ?? DateTimeUpdatePlan.AUTO);
  message.setBool(DateTimeField.NEEDS_UPDATE, true);

  const date = RawMessage.create();
  date.setDouble(DATE_SECONDS, ((options.date ?? new Date()).getTime() - APPLE_EPOCH_MS) / 1000);
  message.setMessage(DateTimeField.DATE, date);

  const object = store.createObject(SMART_FIELD_TYPE.DATE_TIME, component);
  object.setMessageBytes(message.toBytes());
  return object;
}

/**
 * `TSWP.PlaceholderSmartFieldArchive` field numbers. The archive is in no
 * vendored .proto; the shape is measured across 73 instances (the
 * corpus's 64 plus a document donated for the question): the smart-field
 * super, and one varint whose value is 1 in every modern instance (a
 * single v10-era file carries 0). The varint's meaning is unnamed; 1 is
 * what the apps write. A placeholder may span an attachment's U+FFFC —
 * that is how a body document marks an image placeholder, with no
 * separate drawable archive involved.
 */
const PLACEHOLDER_SUPER = 1;
const PLACEHOLDER_FLAG = 2;

/**
 * Build a `TSWP.PlaceholderSmartFieldArchive` — template ghost text the
 * app selects whole on a click and replaces on the first keystroke.
 */
export function buildPlaceholderField(store: ObjectStore, component: Component): IwaObject {
  const message = RawMessage.create();
  const smartField = RawMessage.create();
  smartField.setString(SmartField.TEXT_ATTRIBUTE_UUID, randomUuid());
  message.setMessage(PLACEHOLDER_SUPER, smartField);
  message.setVarint(PLACEHOLDER_FLAG, 1);
  const object = store.createObject(SMART_FIELD_TYPE.PLACEHOLDER, component);
  object.setMessageBytes(message.toBytes());
  return object;
}

/**
 * Build a `TSWP.BookmarkFieldArchive`.
 *
 * Named bookmarks are link destinations. Anonymous ones — `ranged`, with no
 * name — are what the apps create when a link points at a stretch of text
 * rather than a named place, and both shapes occur in the corpus.
 */
export function buildBookmark(
  store: ObjectStore,
  component: Component,
  name?: string,
  options: { ranged?: boolean } = {},
): IwaObject {
  const message = RawMessage.create();
  const smartField = RawMessage.create();
  smartField.setString(SmartField.TEXT_ATTRIBUTE_UUID, randomUuid());
  message.setMessage(BookmarkFieldArchive.SUPER, smartField);
  if (name !== undefined) message.setString(BookmarkFieldArchive.NAME, name);
  // `ranged` tracks the RUN, not the name: the flag says whether the run is
  // a span, and the name is orthogonal, so it cannot be derived from the
  // name ("a named bookmark is a destination" misreads it). Corpus:
  // ranged=true on runs of 13 and 46, ranged=false on runs of exactly 1,
  // names on both. A named bookmark over a 13-character run with
  // ranged=false shows the flag winning: Pages bookmarks one character.
  message.setVarint(BookmarkFieldArchive.RANGED, options.ranged ? 1 : 0);
  message.setVarint(BookmarkFieldArchive.HIDDEN, 0);

  const object = store.createObject(SMART_FIELD_TYPE.BOOKMARK, component);
  object.setMessageBytes(message.toBytes());
  return object;
}

/** Read a date field's settings. */
export function readDateField(object: IwaObject): {
  date: Date | undefined;
  format: string | undefined;
  locale: string | undefined;
  dateStyle: number | undefined;
  timeStyle: number | undefined;
  updatePlan: number | undefined;
} | undefined {
  if (object.type !== SMART_FIELD_TYPE.DATE_TIME) return undefined;
  const seconds = object.message.getMessage(DateTimeField.DATE)?.getDouble(DATE_SECONDS);
  return {
    date: seconds === undefined ? undefined : new Date(APPLE_EPOCH_MS + seconds * 1000),
    format: object.message.getString(DateTimeField.FORMAT),
    locale: object.message.getString(DateTimeField.LOCALE_IDENTIFIER),
    dateStyle: object.message.getUint(DateTimeField.DATE_STYLE),
    timeStyle: object.message.getUint(DateTimeField.TIME_STYLE),
    updatePlan: object.message.getUint(DateTimeField.UPDATE_PLAN),
  };
}

/** What a number attachment renders, read back. */
export interface NumberAttachmentInfo {
  kind: number;
  /** True for a page count rather than a page number. */
  isPageCount: boolean;
  formatCode: number | undefined;
  formatName: string | undefined;
  /**
   * The value the app last rendered, when it cached one. A stale copy after
   * any edit, since it comes from pagination.
   */
  cachedValue: string | undefined;
}

/** Read a `TSWP.NumberAttachmentArchive`. */
export function readNumberAttachment(object: IwaObject): NumberAttachmentInfo | undefined {
  if (object.type !== ATTACHMENT_TYPE.NUMBER) return undefined;
  const textual = object.message.getMessage(NumberAttachment.SUPER);
  const kind = textual?.getUint(TextualAttachment.KIND) ?? AttachmentKind.PAGE_NUMBER;
  return {
    kind,
    isPageCount: kind === AttachmentKind.PAGE_COUNT,
    formatCode: object.message.getUint(NumberAttachment.NUMBER_FORMAT),
    formatName: object.message.getString(NumberAttachment.NUMBER_FORMAT_NAME),
    cachedValue: object.message.getString(NumberAttachment.STRING_VALUE),
  };
}
