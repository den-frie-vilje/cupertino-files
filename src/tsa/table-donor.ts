/**
 * The neutral table every app can add: the blank Numbers document's own
 * table, grafted into another store. A table from nothing would omit
 * state only the app knows about; this one is Apple-made.
 */
import { blankDonorBytes } from "./numbers-blank-donor.generated.ts";
import { IWorkDocument } from "./document.ts";
import { deepCloneObjectInto, remapReferences } from "../tsp/clone.ts";
import type { IwaObject } from "../tsp/iwa.ts";
import type { Component, ObjectStore } from "../tsp/store.ts";
import { refId } from "../tsp/schema.ts";
import { Drawable } from "../tsd/schema.ts";
import { findDrawableCore } from "../tsd/drawables.ts";
import { TST_TYPE, tablesOf, type TableModel } from "../tst/tables.ts";
import { makeRef } from "../tsp/schema.ts";
import type { StylesheetModel } from "../tss/stylesheet.ts";

/** TST.TableModelArchive's style preset reference, reached outside the curated extractor. */
const TABLE_MODEL_STYLE_PRESET = 48;
/** TST.TableStylePresetArchive.style_network. */
const PRESET_STYLE_NETWORK = 3;

/**
 * Which model style field the preset's network supplies: model field →
 * network field. An app-written table's cell, text and category styles
 * are the network's own members (Pages 11–12 of 14 tables, Numbers 45 of
 * 48); the table style and name style are most often the network's too.
 */
const MODEL_FIELD_FROM_NETWORK: ReadonlyMap<number, number> = new Map([
  [3, 9], // table_style
  [24, 1], // body_text_style
  [25, 2], // header_row_text_style
  [26, 3], // header_column_text_style
  [27, 4], // footer_row_text_style
  [18, 5], // body_cell_style
  [19, 6], // header_row_style
  [20, 7], // header_column_style
  [21, 8], // footer_row_style
  [30, 10], // table_name_style
  [36, 11], // table_name_shape_style
  [60, 18], [61, 19], [62, 20], [63, 21], [64, 22], // category_level_n_style
  [65, 13], [66, 14], [67, 15], [68, 16], [69, 17], // category_level_n_text_style
  [71, 28], [72, 29], [73, 30], [74, 31], [75, 32], // label_level_n_style
  [76, 23], [77, 24], [78, 25], [79, 26], [80, 27], // label_level_n_text_style
  [87, 33], // pivot_body_summary_row_style
  [88, 34], // pivot_body_summary_column_style
  [89, 35], // pivot_header_column_summary_style
]);

/**
 * For each role the donor's preset network fills, the imported copy of
 * that member mapped to the host network's member of the same role.
 */
function networkReplacement(
  store: ObjectStore,
  donor: NonNullable<typeof cached>,
  imported: ReadonlyMap<bigint, bigint>,
  hostPresetId: bigint,
): Map<bigint, bigint> {
  const out = new Map<bigint, bigint>();
  const donorPreset = donor.presetId === undefined ? undefined : donor.store.object(donor.presetId);
  const donorNetwork = donorPreset ? donor.store.resolve(refId(donorPreset.message, PRESET_STYLE_NETWORK)) : undefined;
  const hostPreset = store.object(hostPresetId);
  const hostNetwork = hostPreset ? store.resolve(refId(hostPreset.message, PRESET_STYLE_NETWORK)) : undefined;
  if (!donorNetwork || !hostNetwork) return out;
  for (let field = 1; field <= 40; field++) {
    const donorMember = refId(donorNetwork.message, field);
    const hostMember = refId(hostNetwork.message, field);
    const copy = donorMember === undefined ? undefined : imported.get(donorMember);
    if (copy !== undefined && hostMember !== undefined) out.set(copy, hostMember);
  }
  return out;
}

/**
 * Point a table model's styles at a preset's network, the way a table
 * the app inserts takes the theme's preset: every model field the
 * network supplies is set to the network's member, and the model names
 * the preset. Returns the ids the model no longer references.
 */
export function applyTablePreset(store: ObjectStore, modelId: bigint, presetId: bigint): bigint[] {
  const model = store.object(modelId);
  const preset = store.object(presetId);
  const network = preset ? store.resolve(refId(preset.message, PRESET_STYLE_NETWORK)) : undefined;
  if (!model || !network) return [];
  const released: bigint[] = [];
  for (const [modelField, networkField] of MODEL_FIELD_FROM_NETWORK) {
    if (!model.message.has(modelField)) continue;
    const before = refId(model.message, modelField);
    const member = refId(network.message, networkField);
    if (member === undefined) {
      // A role the network does not fill is one the table does not carry:
      // an app-written table's optional styles are the network's or absent.
      model.message.remove(modelField);
      if (before !== undefined) released.push(before);
      continue;
    }
    if (before !== undefined && before !== member) released.push(before);
    model.message.setMessage(modelField, makeRef(member));
  }
  const oldPreset = refId(model.message, TABLE_MODEL_STYLE_PRESET);
  if (oldPreset !== undefined && oldPreset !== presetId) released.push(oldPreset);
  model.message.setMessage(TABLE_MODEL_STYLE_PRESET, makeRef(presetId));
  model.message.markDirty();
  return released;
}
/** TSS.ThemeArchive → TST.ThemePresetsArchive (extension 200) → table_style_presets. */
const THEME_SUPER = 1;
const THEME_TABLE_PRESETS = 200;
const THEME_TABLE_PRESET_LIST = 1;

/**
 * The host theme's first table style preset: the one a table inserted in
 * the app takes. Every blank Pages and Keynote theme lists six at
 * theme.super.200.1; a document whose theme lists none gets undefined.
 */
export function hostTablePreset(store: ObjectStore): bigint | undefined {
  for (const { obj } of store.allObjects()) {
    if (!/ThemeArchive$/.test(store.typeNameOf(obj) ?? "")) continue;
    const list = obj.message.getMessage(THEME_SUPER)?.getMessage(THEME_TABLE_PRESETS)?.getMessages(THEME_TABLE_PRESET_LIST);
    const first = list?.[0]?.getVarint(1);
    const target = first === undefined ? undefined : store.object(first);
    if (target && store.typeNameOf(target) === "TST.TableStylePresetArchive") return first;
  }
  return undefined;
}

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

/**
 * The shape the apps give a table from Insert ▸ Table, measured on each
 * app's own insertion: Numbers 10 rows by 5 columns of 98 points, Pages
 * and Keynote 5 by 4 filling the host's width, all with one header row
 * and one header column.
 */
export const APP_TABLE_DEFAULTS = {
  numbers: { rows: 10, columns: 5, columnWidth: 98 },
  /** Columns share the body width less 0.35 points: 4 × 120.386 in a 481.894-point body. */
  pages: { rows: 5, columns: 4, borderAllowance: 0.35 },
  /** Columns share the frame width less one point: 4 × 432.25 in a 1730-point frame. */
  keynote: { rows: 5, columns: 4, borderAllowance: 1 },
} as const;

/**
 * Cut or grow a fresh table to `rows` by `columns`, give it one header
 * row and one header column, and set every column to the same width:
 * `columnWidth` when given, else an equal share of `hostWidth` less the
 * border allowance — the shape of a table the app inserts.
 */
export function fitNewTable(
  table: TableModel,
  shape: { rows: number; columns: number; columnWidth?: number; hostWidth?: number; borderAllowance?: number },
): void {
  if (table.rowCount < shape.rows) table.insertRows(table.rowCount, shape.rows - table.rowCount);
  else if (table.rowCount > shape.rows) table.deleteRows(shape.rows, table.rowCount - shape.rows);
  if (table.columnCount < shape.columns) table.insertColumns(table.columnCount, shape.columns - table.columnCount);
  else if (table.columnCount > shape.columns) table.deleteColumns(shape.columns, table.columnCount - shape.columns);
  table.setBands({ headerRows: 1, headerColumns: 1 });
  const width =
    shape.columnWidth ??
    (shape.hostWidth === undefined ? undefined : (shape.hostWidth - (shape.borderAllowance ?? 0)) / shape.columns);
  if (width !== undefined) for (let c = 0; c < table.columnCount; c++) table.setColumnWidth(c, width);
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
  // With a host stylesheet (Pages, Keynote) the table takes the host
  // theme's first preset, as a table inserted in the app does, and the
  // donor's own styles go; without one (Numbers) the donor's preset and
  // styles come along, the app-confirmed shape.
  const hostPreset = stylesheet ? hostTablePreset(store) : undefined;
  const { clone, map } = deepCloneObjectInto(store, donor.store, donor.info, {
    component,
    rebind: new Map([[donor.parentId, parentId]]),
    ...(donor.presetId !== undefined && hostPreset === undefined ? { extraRoots: [donor.presetId] } : {}),
  });
  const model = tablesOf(store, [clone.identifier])[0]?.object;
  if (hostPreset !== undefined && model) {
    applyTablePreset(store, model.identifier, hostPreset);
    // The cell-level styles the donor's data lists reference stay — an
    // app-written table's are listed nowhere and hang off a network member
    // as their parent — but re-parented onto the host network's member of
    // the same role, so the donor's own members go.
    const replacement = networkReplacement(store, donor, map, hostPreset);
    for (const id of map.values()) {
      const object = store.object(id);
      if (!object) continue;
      remapReferences(object.message, replacement);
      object.message.markDirty();
    }
    store.discardUnreachable(clone.identifier, map.values());
  } else if (stylesheet) {
    for (const id of map.values()) {
      const object = store.object(id);
      if (object && STYLE_TYPES.has(object.type)) stylesheet.adopt(id);
    }
    const preset = donor.presetId === undefined ? undefined : map.get(donor.presetId);
    if (preset !== undefined) listTablePresetInTheme(store, preset);
  }
  return clone.identifier;
}
