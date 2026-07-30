/**
 * Deep-copy a region of the object graph.
 *
 * Duplicating anything structural in iWork — a slide, a drawable, a table —
 * means copying *some* of what it references and sharing the rest. A copied
 * slide needs its own text storages, or editing the copy would rewrite the
 * original; it must keep pointing at the same stylesheet, master and theme,
 * or the copy would fork the document's styling.
 *
 * So a deep copy is really a graph traversal with a policy attached, which
 * is what {@link deepCloneObject} is: clone what the policy says to follow,
 * share everything else, and rewrite the references in the clones so they
 * point at their counterparts rather than at the originals.
 *
 * References are rewritten by *identity*, not by shape. Every candidate is
 * checked against the set of ids actually being cloned, so a varint that
 * merely resembles a reference cannot be mistaken for one.
 */
import { RawMessage, WireType } from "../base/protobuf.ts";
import type { IwaObject } from "./iwa.ts";
import type { Component, ObjectStore } from "./store.ts";

export interface CloneOptions {
  /** Where clones are created. Defaults to each source's own component. */
  component?: Component;
  /**
   * Whether to clone a referenced object rather than share it.
   *
   * Returning false is not a failure — it is how the copy keeps sharing
   * the styles, masters and themes that make it look like the original.
   */
  follow?: (object: IwaObject, depth: number) => boolean;
  /** Safety valve against a cycle or a runaway graph. */
  maxObjects?: number;
  /** How deep to follow references. */
  maxDepth?: number;
}

export interface CloneResult {
  /** The copy of the object the traversal started from. */
  clone: IwaObject;
  /** Original id → clone id, for every object copied. */
  map: Map<bigint, bigint>;
}

/**
 * Archive types a copy should *share* rather than duplicate.
 *
 * Styles and stylesheets define how a document looks as a whole; cloning
 * one would give the copy a private style that no longer tracks edits to
 * the original, which is the opposite of what a stylesheet is for.
 */
const SHARED_TYPE_PATTERNS: readonly RegExp[] = [
  /StyleArchive$/,
  /StylesheetArchive$/,
  /ThemeArchive$/,
  /^TSS\./,
  /ListStyleArchive$/,
];

/** Type ids that are always shared, regardless of name resolution. */
const SHARED_TYPE_IDS = new Set<number>([
  401, // TSS.StylesheetArchive
  2021, 2022, 2023, 2024, // TSWP character/paragraph/list/column styles
  3015, 3016, // TSD shape/media styles
  6003, 6004, // TST table/cell styles
]);

/**
 * The default policy: copy content, share presentation.
 *
 * Deliberately conservative about what it copies. Sharing something that
 * should have been copied gives two objects one owner — visible, and fixed
 * by naming it in `follow`. Copying something that should have been shared
 * silently forks a document's styling, which is far harder to notice.
 */
export function defaultFollow(object: IwaObject, typeName: string | undefined): boolean {
  if (SHARED_TYPE_IDS.has(object.type)) return false;
  if (typeName && SHARED_TYPE_PATTERNS.some((pattern) => pattern.test(typeName))) return false;
  return true;
}

export function deepCloneObject(
  store: ObjectStore,
  root: IwaObject,
  options: CloneOptions = {},
): CloneResult {
  const follow = options.follow ?? ((object) => defaultFollow(object, store.typeNameOf(object)));
  const maxObjects = options.maxObjects ?? 512;
  const maxDepth = options.maxDepth ?? 12;

  // Pass 1: decide the set. Doing this before creating anything means the
  // rewrite in pass 3 knows every id that will be remapped, including ones
  // reached later in the walk.
  const selected = new Map<bigint, IwaObject>();
  const queue: { object: IwaObject; depth: number }[] = [{ object: root, depth: 0 }];
  selected.set(root.identifier, root);
  while (queue.length > 0) {
    const { object, depth } = queue.shift()!;
    if (depth >= maxDepth) continue;
    for (const id of object.getObjectReferences()) {
      if (selected.has(id)) continue;
      const target = store.object(id);
      if (!target || !follow(target, depth + 1)) continue;
      if (selected.size >= maxObjects) {
        throw new RangeError(
          `deep clone of object ${root.identifier} exceeded ${maxObjects} objects — ` +
            `narrow the traversal with a follow() policy`,
        );
      }
      selected.set(id, target);
      queue.push({ object: target, depth: depth + 1 });
    }
  }

  // Pass 2: create the clones.
  const map = new Map<bigint, bigint>();
  const clones = new Map<bigint, IwaObject>();
  for (const [id, object] of selected) {
    const component = options.component ?? store.componentOf(id);
    if (!component) throw new RangeError(`object ${id} has no component to clone into`);
    const clone = store.createObject(object.type, component, { cloneFrom: object });
    map.set(id, clone.identifier);
    clones.set(id, clone);
  }

  // Pass 3: repoint every reference that names a cloned object.
  for (const clone of clones.values()) {
    remapReferences(clone.message, map);
    clone.setObjectReferences(clone.getObjectReferences().map((id) => map.get(id) ?? id));
  }

  const clone = clones.get(root.identifier);
  if (!clone) throw new RangeError("deep clone produced no root");
  return { clone, map };
}

/**
 * Rewrite `TSP.Reference`-shaped submessages whose target was cloned.
 *
 * A reference is a message holding one varint at field 1. That shape is
 * common, so shape alone is not enough — the identifier must also be one
 * this clone is remapping. Anything else is left untouched.
 */
function remapReferences(message: RawMessage, map: ReadonlyMap<bigint, bigint>, depth = 0): void {
  if (depth > 16) return;
  for (const field of message.fields) {
    if (field.wire !== WireType.Bytes) continue;
    let child: RawMessage;
    try {
      child = message.getMessages(field.no).find((m) => m === field.value) ?? materialize(field);
    } catch {
      continue;
    }
    if (isReference(child)) {
      const target = child.getVarint(1);
      const replacement = target === undefined ? undefined : map.get(target);
      if (replacement !== undefined) {
        child.setVarint(1, replacement);
        continue;
      }
    }
    remapReferences(child, map, depth + 1);
  }
}

function materialize(field: { no: number; value: unknown }): RawMessage {
  if (field.value instanceof RawMessage) return field.value;
  return RawMessage.parse(field.value as Uint8Array);
}

function isReference(message: RawMessage): boolean {
  return (
    message.fields.length === 1 &&
    message.fields[0]!.no === 1 &&
    message.fields[0]!.wire === WireType.Varint
  );
}
