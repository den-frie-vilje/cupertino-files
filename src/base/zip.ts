/**
 * Minimal ZIP reader/writer sufficient for iWork packages.
 *
 * Reading is driven entirely by the central directory (so data-descriptor
 * entries work), supports STORE and DEFLATE methods and basic ZIP64 fields.
 * Writing always uses STORE — `.iwa` payloads are already Snappy-compressed,
 * and iWork readers accept stored entries fine.
 */
import { ByteWriter, readU16le, readU32le, readU64le, utf8Decode, utf8Encode } from "./bytes.ts";
import { crc32 } from "./crc32.ts";
import { inflateRaw } from "./inflate.ts";

const SIG_LOCAL = 0x04034b50; // PK\x03\x04
const SIG_CENTRAL = 0x02014b50; // PK\x01\x02
const SIG_EOCD = 0x06054b50; // PK\x05\x06
const SIG_EOCD64_LOCATOR = 0x07064b50; // PK\x06\x07
const SIG_EOCD64 = 0x06064b50; // PK\x06\x06

export interface ZipEntryMeta {
  name: string;
  method: number; // 0 = store, 8 = deflate
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
  localHeaderOffset: number;
  dosTime: number;
  dosDate: number;
  isDirectory: boolean;
}

/**
 * Whether an entry's *local* header carries a ZIP64 extended-info extra.
 *
 * Apple's writer emits one — id 0x0001, both sizes as 64-bit values even
 * when they fit 32 bits — on `Metadata/*` and the root preview images, and
 * never on `Index/*.iwa` or `Data/*` (measured across every fixture:
 * 1751 of 1751 IWA entries bare, every modern Metadata entry marked).
 * Reproducing a package byte-for-byte means carrying this quirk through.
 */
export function localHeaderHasZip64(data: Uint8Array, entry: ZipEntryMeta): boolean {
  const p = entry.localHeaderOffset;
  if (readU32le(data, p) !== SIG_LOCAL) return false;
  const nameLen = readU16le(data, p + 26);
  const extraLen = readU16le(data, p + 28);
  let extraPos = p + 30 + nameLen;
  const extraEnd = extraPos + extraLen;
  while (extraPos + 4 <= extraEnd) {
    if (readU16le(data, extraPos) === 0x0001) return true;
    extraPos += 4 + readU16le(data, extraPos + 2);
  }
  return false;
}

export class ZipReader {
  private readonly data: Uint8Array;
  public readonly entries: ZipEntryMeta[];

  private constructor(data: Uint8Array, entries: ZipEntryMeta[]) {
    this.data = data;
    this.entries = entries;
  }

  static parse(data: Uint8Array): ZipReader {
    const eocdPos = findEocd(data);
    let count = readU16le(data, eocdPos + 10);
    let cdOffset = readU32le(data, eocdPos + 16);
    const cdSize = readU32le(data, eocdPos + 12);

    if (count === 0xffff || cdOffset === 0xffffffff || cdSize === 0xffffffff) {
      // ZIP64: locate the EOCD64 record via its locator.
      const locPos = eocdPos - 20;
      if (locPos >= 0 && readU32le(data, locPos) === SIG_EOCD64_LOCATOR) {
        const eocd64Pos = Number(readU64le(data, locPos + 8));
        if (readU32le(data, eocd64Pos) !== SIG_EOCD64) {
          throw new RangeError("zip: bad ZIP64 end-of-central-directory record");
        }
        count = Number(readU64le(data, eocd64Pos + 32));
        // +40 holds the 64-bit central-directory size; entries are walked by
        // per-entry signature below, so only count and offset are needed.
        cdOffset = Number(readU64le(data, eocd64Pos + 48));
      }
    }

    const entries: ZipEntryMeta[] = [];
    let pos = cdOffset;
    for (let i = 0; i < count; i++) {
      if (readU32le(data, pos) !== SIG_CENTRAL) {
        throw new RangeError(`zip: bad central directory signature at ${pos}`);
      }
      const method = readU16le(data, pos + 10);
      const dosTime = readU16le(data, pos + 12);
      const dosDate = readU16le(data, pos + 14);
      const crc = readU32le(data, pos + 16);
      let compressedSize = readU32le(data, pos + 20);
      let uncompressedSize = readU32le(data, pos + 24);
      const nameLen = readU16le(data, pos + 28);
      const extraLen = readU16le(data, pos + 30);
      const commentLen = readU16le(data, pos + 32);
      let localHeaderOffset = readU32le(data, pos + 42);
      const name = utf8Decode(data.subarray(pos + 46, pos + 46 + nameLen));

      // ZIP64 extra field (id 0x0001) overrides 0xFFFFFFFF markers, in order:
      // uncompressed size, compressed size, local header offset.
      let extraPos = pos + 46 + nameLen;
      const extraEnd = extraPos + extraLen;
      while (extraPos + 4 <= extraEnd) {
        const id = readU16le(data, extraPos);
        const size = readU16le(data, extraPos + 2);
        if (id === 0x0001) {
          let p = extraPos + 4;
          if (uncompressedSize === 0xffffffff) {
            uncompressedSize = Number(readU64le(data, p));
            p += 8;
          }
          if (compressedSize === 0xffffffff) {
            compressedSize = Number(readU64le(data, p));
            p += 8;
          }
          if (localHeaderOffset === 0xffffffff) {
            // Last of the fixed-order ZIP64 extra fields; p is not advanced
            // because extraPos, not p, carries the cursor to the next block.
            localHeaderOffset = Number(readU64le(data, p));
          }
        }
        extraPos += 4 + size;
      }

      entries.push({
        name,
        method,
        compressedSize,
        uncompressedSize,
        crc32: crc,
        localHeaderOffset,
        dosTime,
        dosDate,
        isDirectory: name.endsWith("/"),
      });
      pos += 46 + nameLen + extraLen + commentLen;
    }
    return new ZipReader(data, entries);
  }

  names(): string[] {
    return this.entries.map((e) => e.name);
  }

  find(name: string): ZipEntryMeta | undefined {
    return this.entries.find((e) => e.name === name);
  }

  /** Extract and (if needed) inflate one entry's bytes. */
  read(entry: ZipEntryMeta | string): Uint8Array {
    const meta = typeof entry === "string" ? this.find(entry) : entry;
    if (!meta) throw new RangeError(`zip: no such entry: ${typeof entry === "string" ? entry : entry.name}`);
    const d = this.data;
    const p = meta.localHeaderOffset;
    if (readU32le(d, p) !== SIG_LOCAL) {
      throw new RangeError(`zip: bad local header for ${meta.name}`);
    }
    // Sizes in the local header may be zero (data descriptor); trust the
    // central directory instead and only use the local name/extra lengths.
    const nameLen = readU16le(d, p + 26);
    const extraLen = readU16le(d, p + 28);
    const start = p + 30 + nameLen + extraLen;
    const raw = d.subarray(start, start + meta.compressedSize);
    if (meta.method === 0) return raw.slice();
    if (meta.method === 8) return inflateRaw(raw, meta.uncompressedSize);
    throw new RangeError(`zip: unsupported compression method ${meta.method} for ${meta.name}`);
  }
}

export interface ZipWriteEntry {
  name: string;
  data: Uint8Array;
  /** DOS timestamp to store; defaults to a fixed date for determinism. */
  dosTime?: number;
  dosDate?: number;
  /**
   * Write a ZIP64 extended-info extra (both sizes as u64) in the local
   * header, the way Apple's writer marks `Metadata/*` and preview entries.
   * See {@link localHeaderHasZip64}.
   */
  zip64Local?: boolean;
  /**
   * Position of this entry's *local* record in the file, when it differs
   * from central-directory order. Incrementally saved documents have the
   * two orders disagree — the app appends data but rewrites the directory
   * — and reproducing the file byte-for-byte means honouring both.
   * Entries without a rank keep array order, after all ranked entries.
   */
  localRank?: number;
}

// 2024-01-01 00:00:00 — fixed default so builds are reproducible.
const DEFAULT_DOS_DATE = ((2024 - 1980) << 9) | (1 << 5) | 1;
const DEFAULT_DOS_TIME = 0;

/** Build a ZIP file with all entries stored (method 0). */
export function buildZip(entries: readonly ZipWriteEntry[]): Uint8Array {
  const w = new ByteWriter(1024);
  const centralByEntry = new Map<
    ZipWriteEntry,
    { nameBytes: Uint8Array; crc: number; size: number; offset: number; dosTime: number; dosDate: number }
  >();

  // Local records go down in physical order, the central directory in
  // array order; the two differ in incrementally saved documents.
  const localOrder = entries
    .map((e, index) => ({ e, key: e.localRank ?? Number.MAX_SAFE_INTEGER, index }))
    .sort((a, b) => a.key - b.key || a.index - b.index)
    .map(({ e }) => e);

  for (const e of localOrder) {
    const nameBytes = utf8Encode(e.name);
    const crc = crc32(e.data);
    const offset = w.length;
    const dosTime = e.dosTime ?? DEFAULT_DOS_TIME;
    const dosDate = e.dosDate ?? DEFAULT_DOS_DATE;
    w.u32le(SIG_LOCAL);
    w.u16le(20); // version needed
    w.u16le(0); // general purpose flags — none; Apple's writer sets none
    w.u16le(0); // method: store
    w.u16le(dosTime);
    w.u16le(dosDate);
    w.u32le(crc);
    w.u32le(e.data.length);
    w.u32le(e.data.length);
    w.u16le(nameBytes.length);
    w.u16le(e.zip64Local ? 20 : 0); // extra length
    w.bytes(nameBytes);
    if (e.zip64Local) {
      // ZIP64 extended info: real sizes ride in the 32-bit fields above
      // too — Apple writes the extra redundantly, so we do as well.
      w.u16le(0x0001);
      w.u16le(16);
      w.u32le(e.data.length);
      w.u32le(0);
      w.u32le(e.data.length);
      w.u32le(0);
    }
    w.bytes(e.data);
    centralByEntry.set(e, { nameBytes, crc, size: e.data.length, offset, dosTime, dosDate });
  }

  const centralRecords = entries.map((e) => centralByEntry.get(e)!);
  const cdStart = w.length;
  for (const r of centralRecords) {
    w.u32le(SIG_CENTRAL);
    w.u16le(62); // version made by: what Apple's writer stamps (6.2, MS-DOS)
    w.u16le(20); // version needed
    w.u16le(0); // flags, as above
    w.u16le(0);
    w.u16le(r.dosTime);
    w.u16le(r.dosDate);
    w.u32le(r.crc);
    w.u32le(r.size);
    w.u32le(r.size);
    w.u16le(r.nameBytes.length);
    w.u16le(0); // extra
    w.u16le(0); // comment
    w.u16le(0); // disk number
    w.u16le(0); // internal attrs
    w.u32le(0); // external attrs
    w.u32le(r.offset);
    w.bytes(r.nameBytes);
  }
  const cdSize = w.length - cdStart;

  w.u32le(SIG_EOCD);
  w.u16le(0);
  w.u16le(0);
  w.u16le(centralRecords.length);
  w.u16le(centralRecords.length);
  w.u32le(cdSize);
  w.u32le(cdStart);
  w.u16le(0);
  return w.toBytes();
}

function findEocd(data: Uint8Array): number {
  const min = Math.max(0, data.length - 22 - 0xffff);
  for (let pos = data.length - 22; pos >= min; pos--) {
    if (readU32le(data, pos) === SIG_EOCD) {
      const commentLen = readU16le(data, pos + 20);
      if (pos + 22 + commentLen === data.length) return pos;
      // Tolerate trailing junk as long as the record is self-consistent.
      if (pos + 22 + commentLen <= data.length) return pos;
    }
  }
  throw new RangeError("zip: end-of-central-directory record not found (not a ZIP file?)");
}
