/**
 * TSS family — the style system core shared by all apps: the abstract style
 * archive embedded in every concrete style, and stylesheets. Field numbers
 * from proto/current/TSSArchives.proto.
 */
import type { ReferenceExtractor } from "../tsp/store.ts";
import { pushRef } from "../tsp/schema.ts";

export const TSS_TYPE = {
  STYLESHEET: 401,
  THEME: 402,
} as const;

/** TSS.StyleArchive (embedded as `super` = field 1 of concrete styles). */
export const StyleSuper = {
  NAME: 1,
  STYLE_IDENTIFIER: 2,
  PARENT: 3,
  IS_VARIATION: 4,
  STYLESHEET: 5,
} as const;

/** TSS.StylesheetArchive. */
export const StylesheetFields = {
  STYLES: 1,
  IDENTIFIER_TO_STYLE_MAP: 2,
  PARENT: 3,
  IS_LOCKED: 4,
  PARENT_TO_CHILDREN_STYLE_MAP: 5,
  CAN_CULL_STYLES: 6,
  // styles_for_10_0 .. styles_for_14_4 compatibility snapshots.
  VERSIONED_FIRST: 7,
  VERSIONED_LAST: 22,
} as const;
export const IdentifiedStyleEntry = { IDENTIFIER: 1, STYLE: 2 } as const;
export const StyleChildrenEntry = { PARENT: 1, CHILDREN: 2 } as const;
export const VersionedStyles = { STYLES: 1, ID_MAP: 2, CHILDREN_MAP: 3 } as const;

export const stylesheetExtractor: ReferenceExtractor = (m) => {
  const out: bigint[] = [];
  pushRef(out, m, StylesheetFields.STYLES);
  for (const e of m.getMessages(StylesheetFields.IDENTIFIER_TO_STYLE_MAP)) {
    pushRef(out, e, IdentifiedStyleEntry.STYLE);
  }
  pushRef(out, m, StylesheetFields.PARENT);
  for (const e of m.getMessages(StylesheetFields.PARENT_TO_CHILDREN_STYLE_MAP)) {
    pushRef(out, e, StyleChildrenEntry.PARENT);
    pushRef(out, e, StyleChildrenEntry.CHILDREN);
  }
  for (let f = StylesheetFields.VERSIONED_FIRST; f <= StylesheetFields.VERSIONED_LAST; f++) {
    const vs = m.getMessage(f);
    if (!vs) continue;
    pushRef(out, vs, VersionedStyles.STYLES);
    for (const e of vs.getMessages(VersionedStyles.ID_MAP)) {
      pushRef(out, e, IdentifiedStyleEntry.STYLE);
    }
    for (const e of vs.getMessages(VersionedStyles.CHILDREN_MAP)) {
      pushRef(out, e, StyleChildrenEntry.PARENT);
      pushRef(out, e, StyleChildrenEntry.CHILDREN);
    }
  }
  return out;
};

/** Extractors for TSS-owned archive types. */
export const TSS_REFERENCE_EXTRACTORS: ReadonlyMap<number, ReferenceExtractor> = new Map([
  [TSS_TYPE.STYLESHEET, stylesheetExtractor],
]);
