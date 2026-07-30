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
import type { IwaObject } from "../tsp/iwa.ts";
import type { Component, ObjectStore } from "../tsp/store.ts";
import { RawMessage } from "../base/protobuf.ts";

/** TSWP archive types for attachments this module builds. */
export const ATTACHMENT_TYPE = {
  NUMBER: 2043,
  TEXTUAL: 2004,
} as const;

/** TSWP.TextualAttachmentArchive. */
export const TextualAttachment = {
  STRING_EQUIVALENT: 1,
  KIND: 2,
} as const;

/** TSWP.NumberAttachmentArchive. */
export const NumberAttachment = {
  SUPER: 1,
  NUMBER_FORMAT: 2,
  STRING_VALUE: 3,
  NUMBER_FORMAT_NAME: 4,
} as const;

/** TSWP.TextualAttachmentArchive.Kind. */
export const AttachmentKind = {
  PAGE_NUMBER: 0,
  PAGE_COUNT: 1,
  FOOTNOTE_MARK: 2,
} as const;

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
  const known = PAGE_NUMBER_FORMATS[options.format ?? "decimal"];
  if (!known) {
    throw new RangeError(
      `unknown page number format ${options.format}; known: ${Object.keys(PAGE_NUMBER_FORMATS).join(", ")}. Pass formatCode and formatName to write another.`,
    );
  }
  return known;
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
