/**
 * The neutral table every app can add: the blank Numbers document's own
 * table, grafted into another store. A table from nothing would omit
 * state only the app knows about; this one is Apple-made.
 */
import { blankDonorBytes } from "./numbers-blank-donor.generated.ts";
import { IWorkDocument } from "./document.ts";
import { deepCloneObjectInto } from "../tsp/clone.ts";
import type { IwaObject } from "../tsp/iwa.ts";
import type { Component, ObjectStore } from "../tsp/store.ts";
import { refId } from "../tsp/schema.ts";
import { Drawable } from "../tsd/schema.ts";
import { findDrawableCore } from "../tsd/drawables.ts";
import { TST_TYPE } from "../tst/tables.ts";
import { makeRef } from "../tsp/schema.ts";
import type { StylesheetModel } from "../tss/stylesheet.ts";

/** TST.TableModelArchive's style preset reference, reached outside the curated extractor. */
const TABLE_MODEL_STYLE_PRESET = 48;
/** TSS.ThemeArchive → TST.ThemePresetsArchive (extension 200) → table_style_presets. */
const THEME_SUPER = 1;
const THEME_TABLE_PRESETS = 200;
const THEME_TABLE_PRESET_LIST = 1;

/**
 * List a table style preset in the host theme, where the apps keep every
 * preset a table can take (theme.super.200.1; the blank themes list six).
 * Returns whether a theme was found to list it in.
 */
export function listTablePresetInTheme(store: ObjectStore, presetId: bigint): boolean {
  for (const { obj } of store.allObjects()) {
    if (!/ThemeArchive$/.test(store.typeNameOf(obj) ?? "")) continue;
    const head = obj.message.getMessage(THEME_SUPER);
    if (!head) continue;
    const presets = head.getMessage(THEME_TABLE_PRESETS);
    if (!presets) continue;
    if (!presets.getMessages(THEME_TABLE_PRESET_LIST).some((m) => m.getVarint(1) === presetId)) {
      presets.addMessage(THEME_TABLE_PRESET_LIST, makeRef(presetId));
      head.setMessage(THEME_TABLE_PRESETS, presets);
      obj.message.setMessage(THEME_SUPER, head);
      obj.message.markDirty();
      store.declareReference(obj, presetId);
    }
    return true;
  }
  return false;
}

let cached: { store: ObjectStore; info: IwaObject; parentId: bigint; presetId: bigint | undefined } | undefined;

function neutralTableDonor(): NonNullable<typeof cached> {
  if (!cached) {
    const donor = IWorkDocument.open(blankDonorBytes());
    const table = donor.tables()[0];
    const info = table?.infoObject;
    const core = info && findDrawableCore(info.message);
    const parentId = core ? refId(core, Drawable.PARENT) : undefined;
    if (!table || !info || info.type !== TST_TYPE.TABLE_INFO || parentId === undefined) {
      throw new RangeError("the embedded blank donor has no table on a sheet");
    }
    cached = { store: donor.store, info, parentId, presetId: refId(table.object.message, TABLE_MODEL_STYLE_PRESET) };
  }
  return cached;
}

/** `preferred` (or "Table"), suffixed with the first free number among `existing`. */
export function uniqueTableName(existing: Iterable<string | undefined>, preferred?: string): string {
  const used = new Set([...existing].filter((name): name is string => name !== undefined));
  const base = preferred ?? "Table";
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * Style archive types the stylesheet lists for every corpus table in
 * Pages and Keynote: character, paragraph, list and shape styles, cell
 * styles. The table style itself is listed by the model alone in 28
 * corpus instances, so it stays unlisted.
 */
const STYLE_TYPES = new Set([2021, 2022, 2023, 2025, 3015, 3016, 6004]);

/**
 * Copy the neutral table into `store`, in `component`, as a drawable whose
 * parent is `parentId` — a sheet, a body storage or a slide. The one
 * reference allowed to escape the donor closure is that parent, rebound;
 * the style preset is seeded explicitly because the model reaches it
 * through a field no app declares. With `stylesheet`, the table's
 * per-object styles are listed there and its preset in the host theme,
 * as every Pages and Keynote table's are in the corpus. Returns the new
 * TST.TableInfoArchive's id; the caller lists and places it.
 */
export function graftNeutralTable(
  store: ObjectStore,
  component: Component,
  parentId: bigint,
  stylesheet?: StylesheetModel,
): bigint {
  const donor = neutralTableDonor();
  const { clone, map } = deepCloneObjectInto(store, donor.store, donor.info, {
    component,
    rebind: new Map([[donor.parentId, parentId]]),
    ...(donor.presetId !== undefined ? { extraRoots: [donor.presetId] } : {}),
  });
  if (stylesheet) {
    for (const id of map.values()) {
      const object = store.object(id);
      if (object && STYLE_TYPES.has(object.type)) stylesheet.adopt(id);
    }
    // The preset that came with the table is the theme's to list, as
    // every corpus preset is listed by its document's theme.
    const preset = donor.presetId === undefined ? undefined : map.get(donor.presetId);
    if (preset !== undefined) listTablePresetInTheme(store, preset);
  }
  return clone.identifier;
}
