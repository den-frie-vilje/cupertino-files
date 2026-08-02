/**
 * Field numbers come from Apple's schema, not from us.
 *
 * ## What was wrong with constants
 *
 * Every field number in this library used to be a hand-typed integer with a
 * docblock naming the archive it came from:
 *
 * ```ts
 * // TSWP.StorageArchive
 * export const Storage = { KIND: 1, STYLE_SHEET: 2, TABLE_PARA_STYLE: 5 };
 * ```
 *
 * The vendored `.proto` dumps in `proto/` are the actual authority for
 * those numbers, and nothing connected the two but a comment. A separate
 * script cross-checked them, matching constant names to field names by
 * spelling, and it could only reach 72 of 118 constant groups — the rest
 * name no archive, or spell a field differently. Worse, it was the one
 * check not run by `npm test`, and it sat red for an unknown length of time
 * over a constant called `ITEM` that matched a deprecated `item = 1` when
 * it meant `tsce_item = 2`.
 *
 * So the protos were documentation. Deleting the whole directory would have
 * broken nothing, and they were not even in the published package.
 *
 * ## What this does instead
 *
 * A declaration names *fields*, and the numbers are looked up:
 *
 * ```ts
 * export const Storage = protoFields("TSWP.StorageArchive", {
 *   KIND: "kind",
 *   STYLE_SHEET: "style_sheet",
 *   TABLE_PARA_STYLE: "table_para_style",
 * });
 * ```
 *
 * Call sites are unchanged — `Storage.TABLE_PARA_STYLE` is still a number,
 * resolved once at module load. What changes is that the number is Apple's,
 * a misspelled or invented field throws before any document is touched, and
 * `proto/` is load-bearing: {@link ./vendored.ts} is generated from it by
 * `npm run proto:embed`, and the suite fails if the two drift apart.
 *
 * ## The escape hatch, and why it is deliberately awkward
 *
 * Not every number is in a dump. The shared families are Numbers 14.4 and
 * the Pages-specific `TP*` schemas are Pages 5.0 from 2013, while the
 * documents this library reads are written by version 26. Fields added
 * since are real, they are measured from the corpus, and they cannot be
 * looked up.
 *
 * {@link measuredFields} takes them — and refuses a number the schema
 * *does* have, so a field that appears in a future dump forces the
 * declaration to move. It also requires a sentence of evidence, because a
 * number with no provenance is the thing this whole mechanism exists to
 * prevent. The list of what sits in there is the honest measure of how
 * stale the dumps have become.
 *
 * Archive **type ids** — `TSWP_TYPE.STORAGE = 2001` — are not here at all.
 * They are the app's own object-type registry, not part of any `.proto`,
 * and no amount of schema will supply them.
 */
import { ABSENT_ARCHIVES, ENUMS, MESSAGES } from "./vendored.ts";

const absent = new Set<string>(ABSENT_ARCHIVES);

function messageOf(archive: string, caller: string): Readonly<Record<string, number>> {
  const message = MESSAGES[archive];
  if (message) return message;
  throw new RangeError(
    absent.has(archive)
      ? `${caller}: ${archive} is in no vendored .proto — every field of it must use measuredFields`
      : `${caller}: ${archive} was not embedded. Run \`npm run proto:embed\` after naming a new archive.`,
  );
}

/**
 * Resolve named fields of a vendored archive to their numbers.
 *
 * Throws on an unknown archive or an unknown field name, at module load, so
 * a typo is a startup error rather than a document that quietly reads the
 * wrong field.
 *
 * Extension fields are keyed by the type they carry rather than by their
 * declared name: five families each `extend .TSS.ThemeArchive` with a field
 * literally called `extension`, at 100, 110, 120, 200 and 210. The name is
 * useless, the type is not, so `TSWP.ThemePresetsArchive` addresses the one
 * holding the paragraph-style presets.
 */
export function protoFields<K extends string>(
  archive: string,
  names: Readonly<Record<K, string>>,
): Readonly<Record<K, number>> {
  const message = messageOf(archive, "protoFields");
  const out = {} as Record<K, number>;
  for (const key of Object.keys(names) as K[]) {
    const field = names[key];
    const number = message[field];
    if (number === undefined) {
      throw new RangeError(
        `protoFields: ${archive} has no field "${field}" (for ${key}). ` +
          `Known: ${Object.keys(message).slice(0, 12).join(", ")}…`,
      );
    }
    out[key] = number;
  }
  return Object.freeze(out);
}

/**
 * Field numbers measured from documents, for fields no vendored dump has.
 *
 * `evidence` is required and must say where the number came from — a count
 * against the corpus, a rung that confirmed it in the app, whatever was
 * actually done. It is not decoration: these are the numbers with no
 * external authority behind them, and the sentence is the only authority
 * they have.
 *
 * Refuses a number the archive's own schema already defines. That is the
 * ratchet: when the dumps are refreshed and a measured field turns out to
 * be in them, this throws and the declaration has to move to
 * {@link protoFields}, where it is checked from then on.
 */
export function measuredFields<K extends string>(
  archive: string,
  numbers: Readonly<Record<K, number>>,
  evidence: string,
): Readonly<Record<K, number>> {
  if (evidence.trim().length < 20) {
    throw new RangeError(`measuredFields(${archive}): say where these numbers came from`);
  }
  const message = MESSAGES[archive];
  if (message) {
    const known = new Map(Object.entries(message).map(([name, no]) => [no, name]));
    for (const key of Object.keys(numbers) as K[]) {
      const name = known.get(numbers[key]);
      if (name !== undefined) {
        throw new RangeError(
          `measuredFields: ${archive} field ${numbers[key]} is "${name}" in the vendored ` +
            `schema — declare ${key} with protoFields instead`,
        );
      }
    }
  } else if (!absent.has(archive)) {
    throw new RangeError(
      `measuredFields: ${archive} was not embedded. Run \`npm run proto:embed\`.`,
    );
  }
  return Object.freeze({ ...numbers });
}

/**
 * Resolve named enum values, the same way {@link protoFields} resolves
 * fields.
 *
 * Separate from `protoFields` because checking an enum against a message is
 * not a weaker check, it is a wrong one: an enum's values live in the same
 * small integer range as its parent message's field numbers, so
 * `LineCap = { BUTT: 0, ROUND: 1, SQUARE: 2 }` matches fields 1 and 2 of
 * `TSD.StrokeArchive` — different fields, entirely unrelated meanings,
 * numbers that happen to agree. A conversion that took those matches would
 * have written a lie into the code and passed every test.
 *
 * Apple's value names are not our constant names — `ButtCap`, `RoundCap`
 * and `SquareCap` against `BUTT`, `ROUND`, `SQUARE` — so the mapping is
 * spelled out rather than derived.
 */
export function protoEnum<K extends string>(
  name: string,
  values: Readonly<Record<K, string>>,
): Readonly<Record<K, number>> {
  const known = ENUMS[name];
  if (!known) {
    throw new RangeError(
      absent.has(name)
        ? `protoEnum: ${name} is in no vendored .proto — use measuredEnum`
        : `protoEnum: ${name} was not embedded. Run \`npm run proto:embed\`.`,
    );
  }
  const out = {} as Record<K, number>;
  for (const key of Object.keys(values) as K[]) {
    const number = known[values[key]];
    if (number === undefined) {
      throw new RangeError(
        `protoEnum: ${name} has no value "${values[key]}" (for ${key}). ` +
          `Known: ${Object.keys(known).slice(0, 12).join(", ")}…`,
      );
    }
    out[key] = number;
  }
  return Object.freeze(out);
}

/**
 * Enum-shaped values measured from documents, where the schema has no enum.
 *
 * Two kinds end up here, and both are real. Some enums postdate the dumps.
 * Others never existed: `TST.CellSpecArchive.interaction_type` is a plain
 * `uint32` in the schema, and that 4 is a stepper and 5 a slider is
 * something only the app has ever said — it was established by building a
 * document per value and opening each one.
 *
 * `context` names where the values belong, for the reader rather than for
 * the check; `evidence` says how they were established.
 */
export function measuredEnum<K extends string>(
  context: string,
  values: Readonly<Record<K, number>>,
  evidence: string,
): Readonly<Record<K, number>> {
  if (evidence.trim().length < 20) {
    throw new RangeError(`measuredEnum(${context}): say where these values came from`);
  }
  const known = ENUMS[context];
  if (known) {
    for (const key of Object.keys(values) as K[]) {
      const name = Object.entries(known).find(([, no]) => no === values[key])?.[0];
      if (name !== undefined) {
        throw new RangeError(
          `measuredEnum: ${context} value ${values[key]} is "${name}" in the vendored ` +
            `schema — declare ${key} with protoEnum instead`,
        );
      }
    }
  }
  return Object.freeze({ ...values });
}
