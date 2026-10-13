/**
 * Read the TSCE function registry out of the Numbers (or Pages, or
 * Keynote) application: the code in TSTables that registers every
 * spreadsheet function with its name and its function index.
 *
 * The index is what a formula's AST carries and what no schema names.
 * The harvest script measures it by having Numbers author formulas; this
 * reads the same pairing from the registration code itself, which names
 * every function the build knows, including the ones no public document
 * demonstrates.
 *
 * How it reads. The registry is one function in TSTables' text segment.
 * For each spreadsheet function it loads the name's CFString constant
 * (`adrp`/`add` to a record in `__DATA_CONST`) and calls one of a few
 * registration helpers. The helpers differ in where the index travels:
 * either in `w7`, set just before the call, or as a halfword stored to the
 * stack (`mov wN, #index; strh wN, [sp, #…]`) just before the name load.
 * Every registration takes one of those two shapes; a name load with
 * neither is not a registration and is skipped.
 *
 * Nothing here is trusted on its own: the harvest script merges this
 * reading with the recorded document harvest and refuses on any
 * disagreement, the same rule the harvest applies to its own
 * observations.
 */
import { readFileSync } from "node:fs";

export interface RegistryReading {
  /** index → name for every registration found. */
  functions: Map<number, string>;
  /** Name loads inside the registry that carried no index; informational. */
  skipped: string[];
}

interface Segment {
  name: string;
  vmaddr: number;
  vmsize: number;
  fileoff: number;
}

/** The arm64 slice of a Mach-O file, with its segments. */
function arm64Slice(file: Buffer): { bytes: Buffer; segments: Segment[] } {
  let bytes = file;
  if (file.readUInt32BE(0) === 0xcafebabe) {
    const count = file.readUInt32BE(4);
    let found: Buffer | undefined;
    for (let i = 0; i < count; i++) {
      const at = 8 + i * 20;
      if (file.readUInt32BE(at) === 0x0100000c) {
        const offset = file.readUInt32BE(at + 8);
        found = file.subarray(offset, offset + file.readUInt32BE(at + 12));
      }
    }
    if (!found) throw new Error("no arm64 slice in the universal binary");
    bytes = found;
  }
  if (bytes.readUInt32LE(0) !== 0xfeedfacf) throw new Error("not a 64-bit Mach-O");
  const ncmds = bytes.readUInt32LE(16);
  const segments: Segment[] = [];
  let at = 32;
  for (let i = 0; i < ncmds; i++) {
    const cmd = bytes.readUInt32LE(at);
    const size = bytes.readUInt32LE(at + 4);
    if (cmd === 0x19) {
      segments.push({
        name: bytes.toString("latin1", at + 8, at + 24).replace(/\0+$/, ""),
        vmaddr: Number(bytes.readBigUInt64LE(at + 24)),
        vmsize: Number(bytes.readBigUInt64LE(at + 32)),
        fileoff: Number(bytes.readBigUInt64LE(at + 40)),
      });
    }
    at += size;
  }
  return { bytes, segments };
}

/** The target of a chained-fixup rebase pointer, or undefined for a bind. */
function rebaseTarget(word: bigint): number | undefined {
  return (word >> 63n) & 1n ? undefined : Number(word & 0xfffffffffn);
}

const unsigned = (x: number): number => x >>> 0;

/** `mov wN, #imm` (MOVZ, 32-bit) → { rd, imm }. */
function movz(ins: number): { rd: number; imm: number } | undefined {
  if (unsigned(ins & 0xff800000) !== 0x52800000) return undefined;
  return { rd: ins & 31, imm: ((ins >>> 5) & 0xffff) << (((ins >>> 21) & 3) * 16) };
}

/** `strh wT, [xN, #off]` → { rt, rn }. */
function strh(ins: number): { rt: number; rn: number } | undefined {
  if (unsigned(ins & 0xffc00000) !== 0x79000000) return undefined;
  return { rt: ins & 31, rn: (ins >>> 5) & 31 };
}

/** `adrp xD, page` → { rd, page } for the instruction at `pc`. */
function adrp(ins: number, pc: number): { rd: number; page: number } | undefined {
  if (unsigned(ins & 0x9f000000) !== 0x90000000) return undefined;
  let imm = (((ins >>> 5) & 0x7ffff) << 2) | ((ins >>> 29) & 3);
  if (imm & 0x100000) imm -= 0x200000;
  return { rd: ins & 31, page: (pc & ~0xfff) + imm * 4096 };
}

/** `add xD, xN, #imm12` (64-bit, unshifted) → { rd, rn, imm }. */
function addImmediate(ins: number): { rd: number; rn: number; imm: number } | undefined {
  if (unsigned(ins & 0xffc00000) !== 0x91000000) return undefined;
  return { rd: ins & 31, rn: (ins >>> 5) & 31, imm: (ins >>> 10) & 0xfff };
}

const isBranchLink = (ins: number): boolean => unsigned(ins & 0xfc000000) === 0x94000000;

const FUNCTION_NAME = /^[A-Z][A-Z0-9.]{1,24}$/;

export function readFunctionRegistry(path: string): RegistryReading {
  const { bytes, segments } = arm64Slice(readFileSync(path));
  const text = segments.find((s) => s.name === "__TEXT");
  const dataConst = segments.find((s) => s.name === "__DATA_CONST");
  if (!text || !dataConst) throw new Error("__TEXT or __DATA_CONST segment missing");
  const toOffset = (va: number): number => {
    const s = segments.find((s) => va >= s.vmaddr && va < s.vmaddr + s.vmsize);
    return s ? va - s.vmaddr + s.fileoff : -1;
  };
  const cString = (va: number): string | undefined => {
    const at = toOffset(va);
    if (at < 0) return undefined;
    let end = at;
    while (end < bytes.length && bytes[end] !== 0 && end - at < 64) end++;
    return bytes.toString("latin1", at, end);
  };

  // CFString constants whose text looks like a function name: 32-byte
  // records { isa, flags 0x7c8, bytes, length } in __DATA_CONST.
  const nameOfConstant = new Map<number, string>();
  const dcEnd = dataConst.fileoff + dataConst.vmsize;
  for (let at = dataConst.fileoff; at + 32 <= dcEnd && at + 32 <= bytes.length; at += 8) {
    if (bytes.readBigUInt64LE(at + 8) !== 0x7c8n) continue;
    const target = rebaseTarget(bytes.readBigUInt64LE(at + 16));
    if (target === undefined) continue;
    const name = cString(target);
    if (name !== undefined && FUNCTION_NAME.test(name)) {
      nameOfConstant.set(at - dataConst.fileoff + dataConst.vmaddr, name);
    }
  }

  // Code sites that load one of those constants.
  const sites: { va: number; name: string }[] = [];
  const textEnd = Math.min(text.fileoff + text.vmsize, bytes.length);
  for (let at = text.fileoff; at + 4 <= textEnd; at += 4) {
    const a = adrp(bytes.readUInt32LE(at), at - text.fileoff + text.vmaddr);
    if (!a) continue;
    for (let k = 1; k <= 6; k++) {
      const add = addImmediate(bytes.readUInt32LE(at + k * 4));
      if (!add || add.rn !== a.rd) continue;
      const name = nameOfConstant.get(a.page + add.imm);
      if (name !== undefined) sites.push({ va: at - text.fileoff + text.vmaddr, name });
      break;
    }
  }
  sites.sort((x, y) => x.va - y.va);

  // The index each site carries, if any.
  const word = (va: number): number => bytes.readUInt32LE(va - text.vmaddr + text.fileoff);
  const indexAt = (va: number): number | undefined => {
    // Stack-carried index: `mov wN, #i` immediately before `strh wN, [sp, #…]`,
    // within the twenty instructions before the name load.
    for (let j = 1; j <= 20; j++) {
      const store = strh(word(va - j * 4));
      if (store && store.rn === 31) {
        const mov = movz(word(va - (j + 1) * 4));
        if (mov && mov.rd === store.rt) return mov.imm;
        // A store without its move belongs to an earlier call; the index
        // then travels in a register.
        break;
      }
    }
    // Register-carried index: the `w7` set between the name load and the
    // registration call.
    let w7: number | undefined;
    for (let k = 2; k <= 24; k++) {
      const ins = word(va + k * 4);
      const mov = movz(ins);
      if (mov && mov.rd === 7) w7 = mov.imm;
      if (isBranchLink(ins)) break;
    }
    return w7;
  };
  const carried = sites.map((site) => ({ ...site, index: indexAt(site.va) }));

  // The registry is the run of sites, split on gaps wider than 8 KiB of
  // code, in which the most name loads carry an index. Other functions
  // walk the same names (menus, localisation) and carry none.
  const clusters: (typeof carried)[] = [];
  let current: typeof carried = [];
  let previous: number | undefined;
  for (const site of carried) {
    if (previous !== undefined && site.va - previous > 0x2000) {
      clusters.push(current);
      current = [];
    }
    current.push(site);
    previous = site.va;
  }
  clusters.push(current);
  const scored = clusters.map((c) => ({ c, n: c.filter((s) => s.index !== undefined && s.index !== 0).length }));
  scored.sort((a, b) => b.n - a.n);
  const best = scored[0]?.c ?? [];

  const functions = new Map<number, string>();
  const skipped: string[] = [];
  for (const site of best) {
    const index = site.index;
    if (index === undefined || index === 0) {
      skipped.push(site.name);
      continue;
    }
    const existing = functions.get(index);
    if (existing !== undefined && existing !== site.name) {
      throw new Error(`index ${index} registered as both ${existing} and ${site.name}`);
    }
    functions.set(index, site.name);
  }
  return { functions, skipped };
}
