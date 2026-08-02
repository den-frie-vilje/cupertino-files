/**
 * Minimal Apple property-list readers, pure TS.
 *
 * `Metadata/Properties.plist` in iWork packages is a binary plist
 * (`bplist00`); `Metadata/BuildVersionHistory.plist` is XML. We only ever
 * *read* these (writers must pass them through byte-identical), so this
 * module implements just enough of both formats for version/identity
 * introspection.
 */
import { utf8Decode } from "./bytes.ts";

export type PlistValue =
  | null
  | boolean
  | number
  | bigint
  | string
  | Uint8Array
  | Date
  | PlistValue[]
  | { [key: string]: PlistValue };

/** Parse a binary plist (`bplist00`). Throws on other formats. */
export function parseBinaryPlist(data: Uint8Array): PlistValue {
  if (data.length < 40 || utf8Decode(data.subarray(0, 7)) !== "bplist0") {
    throw new RangeError("not a binary plist");
  }
  const trailer = data.subarray(data.length - 32);
  const offsetIntSize = trailer[6]!;
  const objectRefSize = trailer[7]!;
  const numObjects = Number(readBEUint(trailer, 8, 8));
  const topObject = Number(readBEUint(trailer, 16, 8));
  const offsetTableOffset = Number(readBEUint(trailer, 24, 8));

  const offsets: number[] = [];
  for (let i = 0; i < numObjects; i++) {
    offsets.push(Number(readBEUint(data, offsetTableOffset + i * offsetIntSize, offsetIntSize)));
  }

  const parseAt = (index: number, depth: number): PlistValue => {
    if (depth > 32) throw new RangeError("plist: nesting too deep");
    const offset = offsets[index];
    if (offset === undefined) throw new RangeError("plist: bad object index");
    const marker = data[offset]!;
    const type = marker >> 4;
    let count = marker & 0x0f;
    let pos = offset + 1;
    const readCount = (): void => {
      if (count === 0x0f) {
        const intMarker = data[pos]!;
        if (intMarker >> 4 !== 1) throw new RangeError("plist: expected int count");
        const n = 1 << (intMarker & 0x0f);
        count = Number(readBEUint(data, pos + 1, n));
        pos += 1 + n;
      }
    };
    switch (type) {
      case 0x0:
        if (marker === 0x00) return null;
        if (marker === 0x08) return false;
        if (marker === 0x09) return true;
        throw new RangeError(`plist: unknown marker 0x${marker.toString(16)}`);
      case 0x1: {
        const n = 1 << count;
        const v = readBEUint(data, pos, n);
        return v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v;
      }
      case 0x2: {
        const n = 1 << count;
        const view = new DataView(data.buffer, data.byteOffset + pos, n);
        return n === 4 ? view.getFloat32(0) : view.getFloat64(0);
      }
      case 0x3: {
        const view = new DataView(data.buffer, data.byteOffset + pos, 8);
        // Seconds since 2001-01-01T00:00:00Z.
        return new Date(978307200000 + view.getFloat64(0) * 1000);
      }
      case 0x4: {
        readCount();
        return data.slice(pos, pos + count);
      }
      case 0x5: {
        readCount();
        return utf8Decode(data.subarray(pos, pos + count)); // ASCII
      }
      case 0x6: {
        readCount();
        let s = "";
        for (let i = 0; i < count; i++) {
          s += String.fromCharCode((data[pos + i * 2]! << 8) | data[pos + i * 2 + 1]!);
        }
        return s;
      }
      case 0x8: {
        // UID (keyed-archiver reference) — expose as number.
        const n = count + 1;
        return Number(readBEUint(data, pos, n));
      }
      case 0xa: {
        readCount();
        const arr: PlistValue[] = [];
        for (let i = 0; i < count; i++) {
          arr.push(parseAt(Number(readBEUint(data, pos + i * objectRefSize, objectRefSize)), depth + 1));
        }
        return arr;
      }
      case 0xd: {
        readCount();
        const obj: { [key: string]: PlistValue } = {};
        for (let i = 0; i < count; i++) {
          const keyRef = Number(readBEUint(data, pos + i * objectRefSize, objectRefSize));
          const valRef = Number(
            readBEUint(data, pos + (count + i) * objectRefSize, objectRefSize),
          );
          const key = parseAt(keyRef, depth + 1);
          // A dictionary key that is not a string would coerce to garbage
          // like "[object Object]" — better to name the malformation.
          if (typeof key !== "string") {
            throw new RangeError(`plist: non-string dictionary key (0x${keyRef.toString(16)})`);
          }
          obj[key] = parseAt(valRef, depth + 1);
        }
        return obj;
      }
      default:
        throw new RangeError(`plist: unsupported object type 0x${type.toString(16)}`);
    }
  };

  return parseAt(topObject, 0);
}

/** Extract the <string> values of a simple XML plist (BuildVersionHistory). */
export function xmlPlistStrings(data: Uint8Array): string[] {
  const text = utf8Decode(data);
  const out: string[] = [];
  const re = /<string>([\s\S]*?)<\/string>/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    out.push(
      m[1]!
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&"),
    );
  }
  return out;
}

function readBEUint(b: Uint8Array, pos: number, n: number): bigint {
  let v = 0n;
  for (let i = 0; i < n; i++) v = (v << 8n) | BigInt(b[pos + i] ?? 0);
  return v;
}
