/**
 * Proto2 `required` fields — the validator that would have caught the
 * conditional-rule bug.
 *
 * ## Why this exists
 *
 * A schema-light writer can produce a message that is *structurally* fine
 * and *semantically* invalid: proto2 lets a field be `required`, and a
 * message missing one is not a message with less in it — it is a message no
 * conforming parser will accept. Numbers refuses the whole document.
 *
 * That is exactly what happened. `TST.ConditionalStyleRule` declares
 *
 * ```proto
 * required .TSP.Reference cell_style = 2;
 * required .TSP.Reference text_style = 3;
 * ```
 *
 * and rules were being written with neither. Every reader in this library
 * read them back perfectly, five tests passed, and the byte-comparison
 * against Apple's own rule passed too — because Apple has never written an
 * unstyled rule, so the comparison only ever covered the styled case. The
 * app was the first thing in the chain to object.
 *
 * Reading back what you wrote cannot find this class of bug, and neither
 * can comparing against a case the app does produce. Only the schema knows,
 * and the schema is vendored in `proto/current/`. So this reads it.
 *
 * ## What it checks
 *
 * Every `required` field of every message it can resolve, recursively:
 * start from an archive whose type id names a message, check the required
 * fields are present, then follow each message-typed field that *is*
 * present and check that too. Fields whose type cannot be resolved are
 * skipped rather than guessed at — an unresolved type is a gap in the
 * vendored protos, not a fault in the document.
 *
 * It deliberately does **not** check anything else the schema says. Wire
 * types, enum ranges and value constraints are all checkable in principle;
 * `required` is the one whose violation makes a file unopenable.
 */
import type { RawMessage } from "../base/protobuf.ts";
import { WireType } from "../base/protobuf.ts";

/** One field, as the proto declares it. */
export interface ProtoField {
  name: string;
  number: number;
  label: "required" | "optional" | "repeated";
  /** Fully-qualified type name, or a scalar like `uint32`. */
  type: string;
}

/** A message's fields, by field number. */
export type ProtoMessage = Map<number, ProtoField>;

/** Every message in the vendored schema, by fully-qualified name. */
export type ProtoSchema = Map<string, ProtoMessage>;

const FIELD = /^\s*(required|optional|repeated)\s+([\w.]+)\s+(\w+)\s*=\s*(\d+)/;
const MESSAGE = /^\s*message\s+(\w+)/;
const ENUM = /^\s*enum\s+(\w+)/;
const EXTEND = /^\s*extend\s+([\w.]+)/;
const PACKAGE = /^\s*package\s+([\w.]+)\s*;/;

/**
 * Parse proto2 sources into a message table.
 *
 * A deliberately small parser: it tracks brace depth and a name stack, so
 * nested messages come out fully qualified (`TST.ConditionalStyleSetArchive
 * .ConditionalStyleRule`), and it attributes `extend Foo { … }` fields to
 * `Foo` — which is how a `ChartArchive` ends up inside a
 * `ChartDrawableArchive` at field 10000.
 *
 * Enum bodies are skipped: their `NAME = 0;` lines are not fields, and
 * reading them as such would invent required fields out of nothing.
 */
export function parseProtoSchema(sources: Iterable<string>): ProtoSchema {
  const schema: ProtoSchema = new Map();

  for (const source of sources) {
    let pkg = "";
    /** Name stack; `undefined` marks a scope whose fields belong nowhere. */
    const stack: (string | undefined)[] = [];
    /** Brace depth at which each stack entry was pushed. */
    const depths: number[] = [];
    let depth = 0;
    let enumDepth = -1;

    // Break after every brace and semicolon first. The vendored protos put
    // one declaration per line, but `message Foo { required X y = 1; }` on a
    // single line is legal, and reading line-at-a-time would see the
    // `message` and silently drop the field — a parser this depends on
    // should not have that failure mode.
    for (const line of source.replace(/([{};])/g, "$1\n").split("\n")) {
      const packageMatch = PACKAGE.exec(line);
      if (packageMatch) pkg = packageMatch[1]!;

      if (enumDepth < 0) {
        const messageMatch = MESSAGE.exec(line);
        const extendMatch = EXTEND.exec(line);
        if (messageMatch) {
          const parent = [...stack].reverse().find((name) => name !== undefined);
          const full = parent ? `${parent}.${messageMatch[1]}` : `${pkg}.${messageMatch[1]}`;
          stack.push(full);
          depths.push(depth);
          if (!schema.has(full)) schema.set(full, new Map());
        } else if (extendMatch) {
          // Extension fields belong to the type being extended.
          stack.push(qualify(extendMatch[1]!, pkg));
          depths.push(depth);
        } else if (ENUM.test(line)) {
          enumDepth = depth;
        } else {
          const fieldMatch = FIELD.exec(line);
          const owner = stack[stack.length - 1];
          if (fieldMatch && owner) {
            let message = schema.get(owner);
            if (!message) schema.set(owner, (message = new Map()));
            message.set(Number(fieldMatch[4]), {
              label: fieldMatch[1] as ProtoField["label"],
              type: qualify(fieldMatch[2]!, pkg),
              name: fieldMatch[3]!,
              number: Number(fieldMatch[4]),
            });
          }
        }
      }

      for (const character of line) {
        if (character === "{") depth++;
        else if (character === "}") {
          depth--;
          if (enumDepth >= 0 && depth <= enumDepth) enumDepth = -1;
          while (depths.length && depths[depths.length - 1]! >= depth) {
            depths.pop();
            stack.pop();
          }
        }
      }
    }
  }
  return schema;
}

/** Every enum in the schema: fully-qualified name → value name → number. */
export type ProtoEnums = Map<string, Map<string, number>>;

const ENUM_VALUE = /^\s*([A-Za-z_]\w*)\s*=\s*(-?\d+)/;

/**
 * The enums, which {@link parseProtoSchema} deliberately skips.
 *
 * It skips them because an enum body's `NAME = 0;` lines look exactly like
 * fields and reading them as such would invent required fields out of
 * nothing. But the values themselves matter as much as any field number —
 * `interaction_type` 4 is a stepper and 5 is a slider, and getting that
 * backwards produces a document that opens fine and draws the wrong widget.
 *
 * Worth stating why this is a separate pass rather than a lenient version
 * of the field parser: an enum's numbers live in the same integer space as
 * its parent message's field numbers, so a constant like
 * `LineCap = { BUTT: 0, ROUND: 1, SQUARE: 2 }` will happily "match" fields
 * 1 and 2 of `TSD.StrokeArchive`. Checking an enum against a message is not
 * a weaker check; it is a wrong one.
 */
export function parseProtoEnums(sources: Iterable<string>): ProtoEnums {
  const enums: ProtoEnums = new Map();

  for (const source of sources) {
    let pkg = "";
    const stack: string[] = [];
    const depths: number[] = [];
    let depth = 0;
    /** The enum currently open, and the depth it was opened at. */
    let current: { name: string; depth: number } | undefined;

    for (const line of source.replace(/([{};])/g, "$1\n").split("\n")) {
      const packageMatch = PACKAGE.exec(line);
      if (packageMatch) pkg = packageMatch[1]!;

      const enumMatch = ENUM.exec(line);
      if (!current && enumMatch) {
        const parent = stack[stack.length - 1];
        const full = parent ? `${parent}.${enumMatch[1]}` : `${pkg}.${enumMatch[1]}`;
        current = { name: full, depth };
        if (!enums.has(full)) enums.set(full, new Map());
      } else if (current) {
        const value = ENUM_VALUE.exec(line);
        if (value) enums.get(current.name)!.set(value[1]!, Number(value[2]));
      } else {
        const messageMatch = MESSAGE.exec(line);
        if (messageMatch) {
          const parent = stack[stack.length - 1];
          stack.push(parent ? `${parent}.${messageMatch[1]}` : `${pkg}.${messageMatch[1]}`);
          depths.push(depth);
        }
      }

      for (const character of line) {
        if (character === "{") depth++;
        else if (character === "}") {
          depth--;
          if (current && depth <= current.depth) current = undefined;
          while (depths.length && depths[depths.length - 1]! >= depth) {
            depths.pop();
            stack.pop();
          }
        }
      }
    }
  }
  return enums;
}

/** `.TSP.Reference` → `TSP.Reference`; a bare name gets the file's package. */
function qualify(type: string, pkg: string): string {
  if (type.startsWith(".")) return type.slice(1);
  if (type.includes(".") || !pkg) return type;
  // Scalars are never package-qualified.
  return SCALARS.has(type) ? type : `${pkg}.${type}`;
}

const SCALARS = new Set([
  "double", "float", "int32", "int64", "uint32", "uint64", "sint32", "sint64",
  "fixed32", "fixed64", "sfixed32", "sfixed64", "bool", "string", "bytes",
]);

/** One missing `required` field. */
export interface MissingRequired {
  /** Dotted path from the archive down to the message that is short a field. */
  path: string;
  message: string;
  field: string;
  number: number;
}

/**
 * Check a message against its schema, recursively.
 *
 * `messageName` is the fully-qualified name the message is expected to
 * conform to. Submessages are followed only where the field's declared type
 * resolves, and only where the field is actually present — an absent
 * *optional* submessage cannot be missing anything.
 */
export function missingRequired(
  message: RawMessage,
  messageName: string,
  schema: ProtoSchema,
  path = messageName,
  depth = 0,
): MissingRequired[] {
  const definition = schema.get(messageName);
  if (!definition || depth > 12) return [];
  const out: MissingRequired[] = [];

  for (const field of definition.values()) {
    const present = message.has(field.number);
    if (field.label === "required" && !present) {
      out.push({ path, message: messageName, field: field.name, number: field.number });
      continue;
    }
    if (!present || !schema.has(field.type)) continue;
    // Only walk fields actually encoded as submessages: a field declared as
    // a message but written with another wire type is a different problem,
    // and getMessages would throw on it.
    if (!message.fields.some((f) => f.no === field.number && f.wire === WireType.Bytes)) {
      continue;
    }
    let children: RawMessage[] = [];
    try {
      children = message.getMessages(field.number);
    } catch {
      continue;
    }
    children.forEach((child, index) => {
      const suffix = children.length > 1 ? `[${index}]` : "";
      out.push(
        ...missingRequired(
          child,
          field.type,
          schema,
          `${path}.${field.name}${suffix}`,
          depth + 1,
        ),
      );
    });
  }
  return out;
}
