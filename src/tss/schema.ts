/**
 * TSS family — the style system core shared by all apps: the abstract style
 * archive embedded in every concrete style, and stylesheets. Field numbers
 * from proto/current/TSSArchives.proto.
 */
import { protoFields } from "../proto/fields.ts";
import type { ReferenceExtractor } from "../tsp/store.ts";
import { pushRef } from "../tsp/schema.ts";

export const TSS_TYPE = {
  STYLESHEET: 401,
  THEME: 402,
} as const;

/** TSS.StyleArchive (embedded as `super` = field 1 of concrete styles). */
export const StyleSuper = protoFields("TSS.StyleArchive", {
  NAME: "name",
  STYLE_IDENTIFIER: "style_identifier",
  PARENT: "parent",
  IS_VARIATION: "is_variation",
  STYLESHEET: "stylesheet",
});

/** TSS.StylesheetArchive. */
export const StylesheetFields = protoFields("TSS.StylesheetArchive", {
  STYLES: "styles",
  IDENTIFIER_TO_STYLE_MAP: "identifier_to_style_map",
  PARENT: "parent",
  IS_LOCKED: "is_locked",
  PARENT_TO_CHILDREN_STYLE_MAP: "parent_to_children_style_map",
  CAN_CULL_STYLES: "can_cull_styles",
  // styles_for_10_0 .. styles_for_14_4 compatibility snapshots.
  VERSIONED_FIRST: "styles_for_10_0",
  VERSIONED_LAST: "styles_for_14_4",
});
export const IdentifiedStyleEntry = protoFields("TSS.StylesheetArchive", { IDENTIFIER: "styles", STYLE: "identifier_to_style_map" });
export const StyleChildrenEntry = protoFields("TSS.StylesheetArchive", { PARENT: "styles", CHILDREN: "identifier_to_style_map" });
export const VersionedStyles = protoFields("TSS.StylesheetArchive", { STYLES: "styles", ID_MAP: "identifier_to_style_map", CHILDREN_MAP: "parent" });

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
