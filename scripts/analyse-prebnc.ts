#!/usr/bin/env node
/**
 * Pre-BNC (storage version 4) cell records — the analysis that maps them.
 *
 *   node scripts/analyse-prebnc.ts [file...]      # defaults to the corpus
 *
 * Six of the corpus's fifty tables were written by iWork '13/'15-era apps
 * and use a cell storage this library refuses to decode. That refusal was
 * inherited — the reference Python implementation refuses them too — not
 * earned. Nothing about the layout needs a Mac: the records are in files
 * already here, and the string table beside them is a free oracle.
 *
 * This script does the measuring. It extracts every pre-BNC record with
 * exact boundaries (from the offsets array, not by guessing lengths) and
 * tabulates the flag word against the record length. That is a linear
 * system in the per-flag payload sizes, and with six flag combinations it
 * is over-determined — so the sizes are solved, not assumed.
 *
 * What is established (see docs/BLOCKERS.md priority 8):
 *
 *   - The header is 12 bytes, same shape as v5: version(1) type(1) pad(2)
 *     flags(u32 @4) extras(u32 @8). Version is 4 in every record; the pad
 *     is zero in every record.
 *   - Bit 2 is set in all 123 records, so it is a marker rather than a
 *     payload flag, or a field every cell carries.
 *   - Payload sizes satisfy: size(1)=size(3)=size(7)=4, size(2)+size(4)=8,
 *     size(2)+size(5)=16, size(2)+size(6)=16. Every observed combination
 *     is consistent with this, and size(2) is 0 or 4 — nothing else fits.
 *   - Text cells carry a string-table key that resolves exactly: a whole
 *     header row and a whole description column come back as sensible
 *     English, which is not something a wrong offset produces.
 *   - Number cells carry an IEEE double: 2.0, 0.5, 0.1, 7.0 land on exact
 *     bit patterns. Date cells carry seconds-since-2001 the same way.
 *
 * What is open: cells whose flag word sets bit 7 keep their text somewhere
 * other than the plain string slot. Column 0 of the Transactions fixture is
 * a pop-up menu — and `src/tst/formats.ts` already records format 266 as a
 * pre-BNC-only pop-up menu — so bit 7 is very likely the control field, and
 * a menu cell's text lives with the menu. That is the last thing to pin
 * down before the decoder can be written.
 *
 * The output is deliberately raw. This is a measuring instrument, not a
 * reader; the reader goes in src/tst/ once the last field is named.
 */
import { readFileSync, readdirSync } from "node:fs";
import { IWorkDocument } from "../src/tsa/document.ts";
import {
  DataStoreFields,
  TileEntry,
  TileFields,
  TileRowInfo,
  TableModelFields,
  TileStorageFields,
  tablesOf,
} from "../src/tst/tables.ts";

/** One cell record, with the boundaries the offsets array gives it. */
interface Record {
  file: string;
  table: string;
  row: number;
  column: number;
  bytes: Uint8Array;
}

/** The pre-BNC header, which is v5's header with a wider extras word. */
const HEADER_SIZE = 12;
const STORAGE_VERSION = 4;

/**
 * Payload sizes per flag bit, as far as the corpus determines them.
 *
 * Solved from record lengths, not assumed: bits 1, 3 and 7 are pinned by
 * pairs of combinations differing in exactly that bit. Bits 4, 5 and 6 are
 * pinned only relative to bit 2, which is why bit 2's own size is the one
 * remaining unknown — it is 0 (a marker) or 4 (a field every cell has).
 */
export const SOLVED_SIZES: ReadonlyMap<number, number> = new Map([
  [1, 4],
  [3, 4],
  [7, 4],
]);

function recordsOf(path: string): Record[] {
  const out: Record[] = [];
  let document: IWorkDocument;
  try {
    document = IWorkDocument.open(new Uint8Array(readFileSync(path)));
  } catch {
    return out; // iWork '09 XML and friends
  }
  const file = path.split("/").pop() ?? path;
  for (const table of tablesOf(document.store)) {
    if (table.storageGeneration !== "preBNC") continue;
    const dataStore = table.object.message.getMessage(TableModelFields.BASE_DATA_STORE);
    const tiles = dataStore?.getMessage(DataStoreFields.TILES);
    for (const entry of tiles?.getMessages(TileStorageFields.TILES) ?? []) {
      const ref = entry.getMessage(TileEntry.TILE)?.getUint(1);
      const tile = ref === undefined ? undefined : document.store.resolve(BigInt(ref));
      if (!tile) continue;
      for (const info of tile.message.getMessages(TileFields.ROW_INFOS)) {
        const row = info.getUint(TileRowInfo.TILE_ROW_INDEX) ?? 0;
        const buffer = info.getBytes(TileRowInfo.CELL_STORAGE_BUFFER_PRE_BNC);
        const offsets = info.getBytes(TileRowInfo.CELL_OFFSETS_PRE_BNC);
        if (!buffer || !offsets) continue;
        // The offsets array is the only reliable boundary: records are not
        // self-describing, and 0xFFFF means "no cell in this column".
        const view = new DataView(offsets.buffer, offsets.byteOffset, offsets.byteLength);
        const present: { column: number; offset: number }[] = [];
        for (let column = 0; column * 2 + 1 < offsets.length; column++) {
          const offset = view.getUint16(column * 2, true);
          if (offset !== 0xffff) present.push({ column, offset });
        }
        present.sort((a, b) => a.offset - b.offset);
        for (let i = 0; i < present.length; i++) {
          const end = i + 1 < present.length ? present[i + 1]!.offset : buffer.length;
          out.push({
            file,
            table: table.name ?? "?",
            row,
            column: present[i]!.column,
            bytes: buffer.slice(present[i]!.offset, end),
          });
        }
      }
    }
  }
  return out;
}

function setBits(value: number): number[] {
  const out: number[] = [];
  for (let bit = 0; bit < 32; bit++) if (value & (1 << bit)) out.push(bit);
  return out;
}

function main(argv: string[]): number {
  const explicit = argv.filter((arg) => !arg.startsWith("--"));
  const paths = explicit.length
    ? explicit
    : readdirSync("fixtures/")
        .filter((name) => /\.(pages|numbers|key)$/.test(name))
        .map((name) => `fixtures/${name}`);

  const records = paths.flatMap(recordsOf);
  if (records.length === 0) {
    console.log("No pre-BNC records here — these files were written by a current app.");
    return 0;
  }
  console.log(`pre-BNC records: ${records.length} across ${paths.length} files\n`);

  // 1. Header invariants. A version or pad that varies would sink the model.
  const versions = new Set(records.map((r) => r.bytes[0]));
  const pads = new Set(
    records.map((r) => new DataView(r.bytes.buffer, r.bytes.byteOffset, r.bytes.byteLength).getUint16(2, true)),
  );
  console.log(`  header: version={${[...versions].join(",")}} pad={${[...pads].join(",")}}`);
  if (versions.size !== 1 || !versions.has(STORAGE_VERSION)) {
    console.log("  !! version byte is not a constant 4 — the header model is wrong");
  }

  // 2. The linear system: flags → record length. Over-determined, so a
  //    combination that contradicts the others shows up as a length set
  //    with more than one member.
  const combos = new Map<number, { lengths: Set<number>; types: Set<number>; count: number }>();
  for (const record of records) {
    const view = new DataView(record.bytes.buffer, record.bytes.byteOffset, record.bytes.byteLength);
    const flags = view.getUint32(4, true);
    const entry = combos.get(flags) ?? { lengths: new Set(), types: new Set(), count: 0 };
    entry.lengths.add(record.bytes.length);
    entry.types.add(record.bytes[1]!);
    entry.count++;
    combos.set(flags, entry);
  }
  console.log("\n  flags → payload bytes (record length minus the 12-byte header)");
  for (const [flags, entry] of [...combos].sort((a, b) => a[0] - b[0])) {
    const lengths = [...entry.lengths].sort((a, b) => a - b);
    const payloads = lengths.map((l) => l - HEADER_SIZE);
    console.log(
      `    0x${flags.toString(16).padStart(4, "0")} bits[${setBits(flags).join(",")}]` +
        ` → ${payloads.join("/")} bytes  types={${[...entry.types].join(",")}} ×${entry.count}` +
        (lengths.length > 1 ? "   !! not a single length — the size model is incomplete" : ""),
    );
  }

  // 3. Every pair of combinations differing in exactly one bit pins that
  //    bit's size outright. This is the part that is proof rather than fit.
  console.log("\n  sizes pinned by a single-bit difference");
  const flagList = [...combos.keys()];
  const pinned = new Map<number, Set<number>>();
  for (const a of flagList) {
    for (const b of flagList) {
      const diff = a ^ b;
      if (a >= b || (diff & (diff - 1)) !== 0) continue; // not exactly one bit
      const bit = setBits(diff)[0]!;
      const [la] = [...combos.get(a)!.lengths];
      const [lb] = [...combos.get(b)!.lengths];
      const size = Math.abs(lb! - la!);
      if (!pinned.has(bit)) pinned.set(bit, new Set());
      pinned.get(bit)!.add(size);
    }
  }
  for (const [bit, sizes] of [...pinned].sort((a, b) => a[0] - b[0])) {
    console.log(
      `    bit ${bit} → ${[...sizes].join(" or ")} bytes` +
        (sizes.size > 1 ? "   !! inconsistent across pairs" : ""),
    );
  }
  const universal = flagList.every((f) => f & 0b100);
  console.log(
    `\n  bit 2 set in every combination: ${universal}` +
      (universal ? "  — a marker, or a field every cell carries" : ""),
  );

  return 0;
}

process.exitCode = main(process.argv.slice(2));
