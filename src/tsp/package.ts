/**
 * iWork package container: the ZIP-level view of a `.pages` / `.numbers` /
 * `.key` file, before any object-graph interpretation.
 *
 * Three layouts exist in the wild (all observed in our fixtures):
 *   1. flat zip:    Index/*.iwa, Metadata/*, Data/*, preview*.jpg at the root
 *   2. nested zip:  an Index.zip entry containing the *.iwa files, with
 *                   Metadata/, Data/ etc. beside it
 *   3. either of the above wrapped in a single top-level directory
 *      ("Project Proposal.pages/…"), as produced by zipping a bundle
 *
 * A password-protected document contains an `.iwph` protection header entry;
 * we detect and refuse it. All non-IWA entries are passed through unchanged
 * on save; IWA entries are replaced only when their component was modified.
 */
import { buildZip, ZipReader, type ZipWriteEntry } from "../base/zip.ts";

export class EncryptedDocumentError extends Error {
  constructor() {
    super("document is password-protected (.iwph present); decryption is not supported");
    this.name = "EncryptedDocumentError";
  }
}

interface OuterEntry {
  name: string;
  data: Uint8Array;
  dosTime: number;
  dosDate: number;
  isDirectory: boolean;
}

export class IWorkContainer {
  /** Outer zip entries in original order (directories included). */
  private outer: OuterEntry[] = [];
  /** Common wrapper-directory prefix, e.g. "Project Proposal.pages/" or "". */
  prefix = "";
  /** Outer entry name of the nested Index.zip, when layout 2 applies. */
  private indexZipEntry: string | undefined;
  /** Inner zip entries in original order (layout 2 only). */
  private inner: OuterEntry[] = [];
  /** Canonical IWA path (e.g. "Index/Document.iwa") → file bytes. */
  readonly iwaFiles = new Map<string, Uint8Array>();

  static fromBytes(bytes: Uint8Array): IWorkContainer {
    const c = new IWorkContainer();
    const zip = ZipReader.parse(bytes);
    for (const e of zip.entries) {
      c.outer.push({
        name: e.name,
        data: e.isDirectory ? new Uint8Array(0) : zip.read(e),
        dosTime: e.dosTime,
        dosDate: e.dosDate,
        isDirectory: e.isDirectory,
      });
    }

    // Wrapper-directory detection: every entry shares one leading "dir/".
    const fileNames = c.outer.filter((e) => !e.isDirectory).map((e) => e.name);
    if (fileNames.length > 0) {
      const first = fileNames[0]!;
      const slash = first.indexOf("/");
      if (slash > 0) {
        const candidate = first.slice(0, slash + 1);
        if (fileNames.every((n) => n.startsWith(candidate))) c.prefix = candidate;
      }
    }

    const stripped = (name: string) => name.slice(c.prefix.length);
    for (const e of c.outer) {
      if (e.isDirectory) continue;
      const rel = stripped(e.name);
      if (rel === ".iwph" || rel.endsWith("/.iwph")) throw new EncryptedDocumentError();
    }

    // Layout detection.
    const indexZip = c.outer.find(
      (e) => !e.isDirectory && stripped(e.name).toLowerCase().endsWith("index.zip"),
    );
    if (indexZip) {
      c.indexZipEntry = indexZip.name;
      const innerZip = ZipReader.parse(indexZip.data);
      for (const e of innerZip.entries) {
        c.inner.push({
          name: e.name,
          data: e.isDirectory ? new Uint8Array(0) : innerZip.read(e),
          dosTime: e.dosTime,
          dosDate: e.dosDate,
          isDirectory: e.isDirectory,
        });
        if (!e.isDirectory && e.name.endsWith(".iwa")) {
          c.iwaFiles.set(canonicalIwaName(e.name), c.inner[c.inner.length - 1]!.data);
        }
      }
    } else {
      for (const e of c.outer) {
        if (!e.isDirectory && stripped(e.name).endsWith(".iwa")) {
          c.iwaFiles.set(canonicalIwaName(stripped(e.name)), e.data);
        }
      }
    }
    if (c.iwaFiles.size === 0) {
      throw new RangeError(
        "no .iwa components found — not a modern iWork file (iWork '09 XML documents are not supported)",
      );
    }
    return c;
  }

  /** Non-IWA entries (canonical relative name → bytes), e.g. Metadata/, Data/. */
  otherFiles(): Map<string, Uint8Array> {
    const out = new Map<string, Uint8Array>();
    for (const e of this.outer) {
      if (e.isDirectory || e.name === this.indexZipEntry) continue;
      const rel = e.name.slice(this.prefix.length);
      if (!rel.endsWith(".iwa")) out.set(rel, e.data);
    }
    return out;
  }

  /**
   * Rebuild the package, substituting the given IWA files (canonical name →
   * new bytes). Preserves layout, entry order, timestamps and all non-IWA
   * bytes; appends entries for canonical names that did not previously
   * exist. `additions` adds arbitrary non-IWA files (e.g. Data/ media) at
   * the package level, next to the existing Metadata/Data entries.
   */
  toBytes(
    replacements: ReadonlyMap<string, Uint8Array>,
    additions: ReadonlyMap<string, Uint8Array> = new Map(),
  ): Uint8Array {
    const remaining = new Map(replacements);

    if (this.indexZipEntry !== undefined) {
      const innerEntries: ZipWriteEntry[] = [];
      for (const e of this.inner) {
        if (e.isDirectory) {
          innerEntries.push({ name: e.name, data: new Uint8Array(0), dosTime: e.dosTime, dosDate: e.dosDate });
          continue;
        }
        const canonical = e.name.endsWith(".iwa") ? canonicalIwaName(e.name) : undefined;
        const replacement = canonical !== undefined ? remaining.get(canonical) : undefined;
        if (canonical !== undefined) remaining.delete(canonical);
        innerEntries.push({
          name: e.name,
          data: replacement ?? e.data,
          dosTime: e.dosTime,
          dosDate: e.dosDate,
        });
      }
      for (const [canonical, data] of remaining) {
        innerEntries.push({ name: canonical, data });
      }
      const newIndexZip = buildZip(innerEntries);
      const outerEntries: ZipWriteEntry[] = this.outer.map((e) => ({
        name: e.name,
        data: e.name === this.indexZipEntry ? newIndexZip : e.data,
        dosTime: e.dosTime,
        dosDate: e.dosDate,
      }));
      for (const [name, data] of additions) {
        outerEntries.push({ name: this.prefix + name, data });
      }
      return buildZip(outerEntries);
    }

    const outerEntries: ZipWriteEntry[] = [];
    for (const e of this.outer) {
      if (e.isDirectory) {
        outerEntries.push({ name: e.name, data: new Uint8Array(0), dosTime: e.dosTime, dosDate: e.dosDate });
        continue;
      }
      const rel = e.name.slice(this.prefix.length);
      const canonical = rel.endsWith(".iwa") ? canonicalIwaName(rel) : undefined;
      const replacement = canonical !== undefined ? remaining.get(canonical) : undefined;
      if (canonical !== undefined) remaining.delete(canonical);
      outerEntries.push({
        name: e.name,
        data: replacement ?? e.data,
        dosTime: e.dosTime,
        dosDate: e.dosDate,
      });
    }
    for (const [canonical, data] of remaining) {
      outerEntries.push({ name: this.prefix + canonical, data });
    }
    for (const [name, data] of additions) {
      outerEntries.push({ name: this.prefix + name, data });
    }
    return buildZip(outerEntries);
  }
}

/** Normalize an IWA path to the canonical "Index/<...>.iwa" form. */
export function canonicalIwaName(name: string): string {
  let n = name;
  while (n.startsWith("/")) n = n.slice(1);
  if (!n.startsWith("Index/")) {
    const idx = n.indexOf("Index/");
    n = idx >= 0 ? n.slice(idx) : `Index/${n}`;
  }
  return n;
}

/** Component locator as used by TSP.ComponentInfo ("Document", "Tables/Tile-5"). */
export function locatorForIwaName(canonical: string): string {
  let n = canonical;
  if (n.startsWith("Index/")) n = n.slice("Index/".length);
  if (n.endsWith(".iwa")) n = n.slice(0, -".iwa".length);
  return n;
}
