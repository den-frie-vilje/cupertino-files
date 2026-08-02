/**
 * Schema-light protobuf (proto2 wire format) layer.
 *
 * iWork archives are protobuf messages, but we deliberately do NOT decode them
 * against a full compiled schema. Instead every message is parsed into an
 * ordered list of raw fields ({@link RawMessage}) that:
 *
 *  - preserves unknown fields byte-for-byte,
 *  - preserves field order,
 *  - keeps the original encoded bytes and only re-serializes messages along a
 *    mutated path (dirty tracking bubbles up through parents),
 *
 * so that editing one value deep inside a document cannot corrupt anything we
 * don't understand. Typed accessors for the iWork messages we manipulate are
 * layered on top (see pages/*.ts).
 *
 * ## Why not protobufjs
 *
 * The `.proto` schemas are read by `protobufjs` — see
 * `scripts/proto-schema.ts` — and the obvious next question is why the wire
 * codec is not. It was asked and answered by measurement, not preference:
 *
 * **A typed decoder discards what it does not model.** Encoding field 1 and
 * an unmodelled field 7 gives `082a3a066b6565706d65`; decoding and
 * re-encoding through a `protobuf.Type` gives back `082a`. The unknown field
 * is gone. This library models a few dozen of 1468 messages and promises
 * every untouched archive comes back byte-identical, so that single
 * behaviour rules the typed API out — not as a preference, as a
 * contradiction.
 *
 * **The low-level `Reader`/`Writer` would not help either.** They are the
 * right shape, but they speak `Long`: `reader.uint64()` returns a
 * `protobufjs.Long`, where every accessor here returns a native `bigint`.
 * Adapting would add a conversion on every 64-bit field, keep the whole
 * {@link RawMessage} model above it, and turn a zero-runtime-dependency
 * package into one with a dependency — three costs and no removed code.
 *
 * So: canonical library for the schemas, where it is strictly better; raw
 * bytes here, where preserving the unknown is the entire job.
 */
import { ByteWriter, utf8Decode, utf8Encode } from "./bytes.ts";
import { readUvarint, uvarintLength, writeUvarint } from "./varint.ts";

export const WireType = {
  Varint: 0,
  Fixed64: 1,
  Bytes: 2,
  StartGroup: 3,
  EndGroup: 4,
  Fixed32: 5,
} as const;
export type WireType = (typeof WireType)[keyof typeof WireType];

export type FieldValue = bigint | Uint8Array | RawMessage;

export interface RawField {
  no: number;
  wire: WireType;
  /**
   * Varint => bigint; Fixed64/Fixed32/Bytes/group content => Uint8Array;
   * a Bytes field lazily parsed as a submessage => RawMessage.
   */
  value: FieldValue;
}

export class RawMessage {
  fields: RawField[] = [];
  /** Original encoded bytes; reused verbatim while the message is clean. */
  private source: Uint8Array | undefined;
  private dirty = false;
  private parent: RawMessage | undefined;

  static parse(bytes: Uint8Array): RawMessage {
    const m = new RawMessage();
    m.source = bytes;
    let pos = 0;
    const len = bytes.length;
    while (pos < len) {
      const keyRes = readUvarint(bytes, pos);
      pos = keyRes.next;
      const key = keyRes.value;
      const no = Number(key >> 3n);
      const wire = Number(key & 7n) as WireType;
      if (no === 0) throw new RangeError("protobuf: field number 0 is invalid");
      switch (wire) {
        case WireType.Varint: {
          const v = readUvarint(bytes, pos);
          pos = v.next;
          m.fields.push({ no, wire, value: v.value });
          break;
        }
        case WireType.Fixed64: {
          if (pos + 8 > len) throw new RangeError("protobuf: truncated fixed64");
          m.fields.push({ no, wire, value: bytes.subarray(pos, pos + 8) });
          pos += 8;
          break;
        }
        case WireType.Bytes: {
          const l = readUvarint(bytes, pos);
          const dataLen = Number(l.value);
          pos = l.next;
          if (pos + dataLen > len) throw new RangeError("protobuf: truncated bytes field");
          m.fields.push({ no, wire, value: bytes.subarray(pos, pos + dataLen) });
          pos += dataLen;
          break;
        }
        case WireType.StartGroup: {
          // Legacy groups: capture raw content up to the matching end tag.
          const start = pos;
          let depth = 1;
          while (depth > 0) {
            const k = readUvarint(bytes, pos);
            const w2 = Number(k.value & 7n) as WireType;
            const innerNo = Number(k.value >> 3n);
            if (w2 === WireType.StartGroup) {
              depth++;
              pos = k.next;
            } else if (w2 === WireType.EndGroup) {
              depth--;
              if (depth === 0 && innerNo !== no) {
                throw new RangeError("protobuf: mismatched group end tag");
              }
              if (depth === 0) {
                m.fields.push({ no, wire, value: bytes.subarray(start, pos) });
              }
              pos = k.next;
            } else {
              pos = skipField(bytes, k.next, w2);
            }
          }
          break;
        }
        case WireType.Fixed32: {
          if (pos + 4 > len) throw new RangeError("protobuf: truncated fixed32");
          m.fields.push({ no, wire, value: bytes.subarray(pos, pos + 4) });
          pos += 4;
          break;
        }
        default:
          throw new RangeError(`protobuf: unsupported wire type ${wire}`);
      }
    }
    return m;
  }

  /** Create an empty message (dirty by construction). */
  static create(): RawMessage {
    const m = new RawMessage();
    m.dirty = true;
    return m;
  }

  get isDirty(): boolean {
    return this.dirty;
  }

  markDirty(): void {
    this.dirty = true;
    this.source = undefined;
    if (this.parent) this.parent.markDirty();
  }

  private adopt(child: RawMessage): void {
    child.parent = this;
  }

  toBytes(): Uint8Array {
    if (!this.dirty && this.source) return this.source;
    const w = new ByteWriter(this.source ? this.source.length + 16 : 64);
    for (const f of this.fields) {
      writeUvarint(w, f.no * 8 + f.wire);
      switch (f.wire) {
        case WireType.Varint:
          writeUvarint(w, f.value as bigint);
          break;
        case WireType.Fixed64:
        case WireType.Fixed32:
          w.bytes(f.value as Uint8Array);
          break;
        case WireType.Bytes: {
          const b = f.value instanceof RawMessage ? f.value.toBytes() : (f.value as Uint8Array);
          writeUvarint(w, b.length);
          w.bytes(b);
          break;
        }
        case WireType.StartGroup: {
          w.bytes(f.value as Uint8Array);
          writeUvarint(w, f.no * 8 + WireType.EndGroup);
          break;
        }
        default:
          throw new RangeError(`protobuf: cannot serialize wire type ${f.wire}`);
      }
    }
    return w.toBytes();
  }

  /** Serialized length without materializing (cheap when clean). */
  byteLength(): number {
    return this.toBytes().length;
  }

  // ---------------------------------------------------------------- getters

  private lastField(no: number): RawField | undefined {
    for (let i = this.fields.length - 1; i >= 0; i--) {
      if (this.fields[i]!.no === no) return this.fields[i];
    }
    return undefined;
  }

  has(no: number): boolean {
    return this.lastField(no) !== undefined;
  }

  /** Wire type of the last occurrence of a field, if present. */
  fieldWire(no: number): WireType | undefined {
    return this.lastField(no)?.wire;
  }

  getVarint(no: number): bigint | undefined {
    const f = this.lastField(no);
    if (!f) return undefined;
    if (f.wire !== WireType.Varint) throw new RangeError(`field ${no} is not a varint`);
    return f.value as bigint;
  }

  getUint(no: number): number | undefined {
    const v = this.getVarint(no);
    if (v === undefined) return undefined;
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError(`field ${no} exceeds safe range`);
    return Number(v);
  }

  getBool(no: number): boolean | undefined {
    const v = this.getVarint(no);
    return v === undefined ? undefined : v !== 0n;
  }

  getBytes(no: number): Uint8Array | undefined {
    const f = this.lastField(no);
    if (!f) return undefined;
    if (f.wire !== WireType.Bytes) throw new RangeError(`field ${no} is not length-delimited`);
    return f.value instanceof RawMessage ? f.value.toBytes() : (f.value as Uint8Array);
  }

  getString(no: number): string | undefined {
    const b = this.getBytes(no);
    return b === undefined ? undefined : utf8Decode(b);
  }

  getStrings(no: number): string[] {
    const out: string[] = [];
    for (const f of this.fields) {
      if (f.no !== no) continue;
      if (f.wire !== WireType.Bytes) throw new RangeError(`field ${no} is not length-delimited`);
      out.push(utf8Decode(f.value instanceof RawMessage ? f.value.toBytes() : (f.value as Uint8Array)));
    }
    return out;
  }

  /** Parse (and cache) a length-delimited field as a submessage. */
  getMessage(no: number): RawMessage | undefined {
    const f = this.lastField(no);
    if (!f) return undefined;
    return this.materialize(f);
  }

  getMessages(no: number): RawMessage[] {
    const out: RawMessage[] = [];
    for (const f of this.fields) {
      if (f.no === no) out.push(this.materialize(f));
    }
    return out;
  }

  private materialize(f: RawField): RawMessage {
    if (f.value instanceof RawMessage) return f.value;
    if (f.wire !== WireType.Bytes) throw new RangeError(`field ${f.no} is not length-delimited`);
    const child = RawMessage.parse(f.value as Uint8Array);
    this.adopt(child);
    f.value = child;
    return child;
  }

  getFixed32(no: number): number | undefined {
    const f = this.lastField(no);
    if (!f) return undefined;
    if (f.wire !== WireType.Fixed32) throw new RangeError(`field ${no} is not fixed32`);
    const b = f.value as Uint8Array;
    return (b[0]! | (b[1]! << 8) | (b[2]! << 16) | (b[3]! << 24)) >>> 0;
  }

  getFloat(no: number): number | undefined {
    const f = this.lastField(no);
    if (!f) return undefined;
    if (f.wire !== WireType.Fixed32) throw new RangeError(`field ${no} is not fixed32`);
    const b = f.value as Uint8Array;
    return new DataView(b.buffer, b.byteOffset, 4).getFloat32(0, true);
  }

  getDouble(no: number): number | undefined {
    const f = this.lastField(no);
    if (!f) return undefined;
    if (f.wire !== WireType.Fixed64) throw new RangeError(`field ${no} is not fixed64`);
    const b = f.value as Uint8Array;
    return new DataView(b.buffer, b.byteOffset, 8).getFloat64(0, true);
  }

  /**
   * Repeated float field, packed (length-delimited run of 4-byte words) or
   * unpacked (repeated fixed32 keys), or a mix. Returns values in order.
   */
  getFloats(no: number): number[] {
    const out: number[] = [];
    for (const f of this.fields) {
      if (f.no !== no) continue;
      if (f.wire === WireType.Fixed32) {
        const b = f.value as Uint8Array;
        out.push(new DataView(b.buffer, b.byteOffset, 4).getFloat32(0, true));
      } else if (f.wire === WireType.Bytes) {
        const b = f.value instanceof RawMessage ? f.value.toBytes() : (f.value as Uint8Array);
        const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
        for (let pos = 0; pos + 4 <= b.length; pos += 4) out.push(view.getFloat32(pos, true));
      } else {
        throw new RangeError(`field ${no}: unexpected wire type for repeated float`);
      }
    }
    return out;
  }

  /**
   * Replace all occurrences of a repeated float field, preserving position.
   *
   * Written unpacked (one fixed32 key per value), which is the proto2 default
   * and what Apple emits for e.g. `StrokePatternArchive.pattern`.
   */
  setFloats(no: number, values: readonly number[]): void {
    const idx = this.fields.findIndex((f) => f.no === no);
    this.fields = this.fields.filter((f) => f.no !== no);
    const inserted: RawField[] = values.map((v) => {
      const b = new Uint8Array(4);
      new DataView(b.buffer).setFloat32(0, v, true);
      return { no, wire: WireType.Fixed32, value: b };
    });
    if (idx >= 0) this.fields.splice(idx, 0, ...inserted);
    else this.fields.push(...inserted);
    this.markDirty();
  }

  /**
   * Repeated varint field that may be encoded packed (length-delimited),
   * unpacked (repeated varint keys), or a mix. Returns values in order.
   */
  getPackedVarints(no: number): bigint[] {
    const out: bigint[] = [];
    for (const f of this.fields) {
      if (f.no !== no) continue;
      if (f.wire === WireType.Varint) {
        out.push(f.value as bigint);
      } else if (f.wire === WireType.Bytes) {
        const b = f.value instanceof RawMessage ? f.value.toBytes() : (f.value as Uint8Array);
        let pos = 0;
        while (pos < b.length) {
          const r = readUvarint(b, pos);
          out.push(r.value);
          pos = r.next;
        }
      } else {
        throw new RangeError(`field ${no}: unexpected wire type for packed varints`);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- setters

  /** Remove every occurrence of a field. */
  remove(no: number): void {
    const before = this.fields.length;
    this.fields = this.fields.filter((f) => f.no !== no);
    if (this.fields.length !== before) this.markDirty();
  }

  private setScalar(no: number, wire: WireType, value: FieldValue): void {
    const idx = this.fields.findIndex((f) => f.no === no);
    this.fields = this.fields.filter((f) => f.no !== no);
    const field: RawField = { no, wire, value };
    if (idx >= 0) this.fields.splice(idx, 0, field);
    else this.fields.push(field);
    if (value instanceof RawMessage) this.adopt(value);
    this.markDirty();
  }

  setVarint(no: number, v: bigint | number): void {
    this.setScalar(no, WireType.Varint, typeof v === "bigint" ? v : BigInt(v));
  }

  setBool(no: number, v: boolean): void {
    this.setVarint(no, v ? 1n : 0n);
  }

  setBytes(no: number, b: Uint8Array): void {
    this.setScalar(no, WireType.Bytes, b);
  }

  setString(no: number, s: string): void {
    this.setBytes(no, utf8Encode(s));
  }

  setMessage(no: number, m: RawMessage): void {
    this.setScalar(no, WireType.Bytes, m);
  }

  addMessage(no: number, m: RawMessage): void {
    // Insert after the last existing occurrence to keep repeated fields together.
    let insertAt = this.fields.length;
    for (let i = this.fields.length - 1; i >= 0; i--) {
      if (this.fields[i]!.no === no) {
        insertAt = i + 1;
        break;
      }
    }
    this.fields.splice(insertAt, 0, { no, wire: WireType.Bytes, value: m });
    this.adopt(m);
    this.markDirty();
  }

  setFloat(no: number, v: number): void {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setFloat32(0, v, true);
    this.setScalar(no, WireType.Fixed32, b);
  }

  setDouble(no: number, v: number): void {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setFloat64(0, v, true);
    this.setScalar(no, WireType.Fixed64, b);
  }

  setFixed32(no: number, v: number): void {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v >>> 0, true);
    this.setScalar(no, WireType.Fixed32, b);
  }

  /**
   * Replace all occurrences of a repeated varint field, unpacked.
   *
   * The proto2 default, and what Apple emits for the parallel arrays in
   * e.g. `TST.FilterSetArchive` — `setPackedVarints` writes the other
   * encoding, which readers accept but which no Apple file uses there.
   */
  setVarints(no: number, values: readonly (bigint | number)[]): void {
    const idx = this.fields.findIndex((f) => f.no === no);
    this.fields = this.fields.filter((f) => f.no !== no);
    const inserted: RawField[] = values.map((v) => ({
      no,
      wire: WireType.Varint,
      value: BigInt(v),
    }));
    if (idx >= 0) this.fields.splice(idx, 0, ...inserted);
    else this.fields.push(...inserted);
    this.markDirty();
  }

  /** Write a repeated varint field packed (replacing all occurrences). */
  setPackedVarints(no: number, values: readonly (bigint | number)[]): void {
    const w = new ByteWriter(values.length * 2);
    for (const v of values) writeUvarint(w, v);
    this.setBytes(no, w.toBytes());
  }

  /** Replace all occurrences of a repeated message field, preserving position. */
  setMessages(no: number, msgs: readonly RawMessage[]): void {
    const idx = this.fields.findIndex((f) => f.no === no);
    this.fields = this.fields.filter((f) => f.no !== no);
    const inserted: RawField[] = msgs.map((m) => {
      this.adopt(m);
      return { no, wire: WireType.Bytes, value: m };
    });
    if (idx >= 0) this.fields.splice(idx, 0, ...inserted);
    else this.fields.push(...inserted);
    this.markDirty();
  }

  clone(): RawMessage {
    return RawMessage.parse(this.toBytes().slice());
  }
}

function skipField(bytes: Uint8Array, pos: number, wire: WireType): number {
  switch (wire) {
    case WireType.Varint:
      return readUvarint(bytes, pos).next;
    case WireType.Fixed64:
      return pos + 8;
    case WireType.Bytes: {
      const l = readUvarint(bytes, pos);
      return l.next + Number(l.value);
    }
    case WireType.Fixed32:
      return pos + 4;
    default:
      throw new RangeError(`protobuf: cannot skip wire type ${wire}`);
  }
}

/** Estimate the encoded size of a length-delimited field (helper for stats). */
export function lengthDelimitedSize(no: number, payloadLen: number): number {
  return uvarintLength(no * 8 + WireType.Bytes) + uvarintLength(payloadLen) + payloadLen;
}
