/**
 * IWA archive streams.
 *
 * A decompressed `.iwa` component is a sequence of *archives* (objects):
 *
 *   varint  N                — length of the ArchiveInfo message
 *   bytes   ArchiveInfo (N)  — TSP.ArchiveInfo { identifier, message_infos[] }
 *   bytes   payload…         — one payload per MessageInfo, back to back,
 *                              payload i having length message_infos[i].length
 *
 * Each MessageInfo carries the numeric `type` that identifies the protobuf
 * message class of its payload (see registry.ts), the object identifiers this
 * object references (`object_references`) and the data blobs it references
 * (`data_references`). Keeping those lists in sync with the payload content is
 * required for the apps to load a modified file.
 */
import { concatBytes, ByteWriter } from "../base/bytes.ts";
import { RawMessage } from "../base/protobuf.ts";
import { readUvarintNumber, writeUvarint } from "../base/varint.ts";
import { decodeIwaData, encodeIwaData } from "../base/snappy.ts";

// TSP.ArchiveInfo field numbers.
const ARCHIVE_IDENTIFIER = 1;
const ARCHIVE_MESSAGE_INFOS = 2;
const ARCHIVE_SHOULD_MERGE = 3;

// TSP.MessageInfo field numbers.
const MSG_TYPE = 1;
const MSG_VERSION = 2;
const MSG_LENGTH = 3;
// Read by Apple, deliberately never rewritten by this library — stale
// field_infos are accepted by every app (settled by measurement; see
// docs/FORMAT.md). Named here to keep the MessageInfo table complete.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MSG_FIELD_INFOS = 4;
const MSG_OBJECT_REFERENCES = 5;
const MSG_DATA_REFERENCES = 6;
const MSG_DIFF_MERGE_VERSION = 8;

/** One object inside an IWA component. */
export class IwaObject {
  /** Lazily parsed root message of the first payload. */
  private parsed: RawMessage | undefined;

  public archiveInfo: RawMessage;
  /** Raw payload bytes, one per MessageInfo (usually exactly one). */
  public payloads: Uint8Array[];

  constructor(archiveInfo: RawMessage, payloads: Uint8Array[]) {
    this.archiveInfo = archiveInfo;
    this.payloads = payloads;
  }

  get identifier(): bigint {
    return this.archiveInfo.getVarint(ARCHIVE_IDENTIFIER) ?? 0n;
  }

  set identifier(id: bigint) {
    this.archiveInfo.setVarint(ARCHIVE_IDENTIFIER, id);
  }

  get messageInfos(): RawMessage[] {
    return this.archiveInfo.getMessages(ARCHIVE_MESSAGE_INFOS);
  }

  /** Message type of the primary payload (0 if absent). */
  get type(): number {
    const info = this.messageInfos[0];
    return info ? (info.getUint(MSG_TYPE) ?? 0) : 0;
  }

  /** Parse the primary payload as a protobuf message (cached; edits track dirty). */
  get message(): RawMessage {
    if (!this.parsed) {
      this.parsed = RawMessage.parse(this.payloads[0] ?? new Uint8Array(0));
    }
    return this.parsed;
  }

  /**
   * Number of payloads in this archive. Almost always 1; archives with more
   * are either multi-message (each payload a full message, with its own
   * MessageInfo.type) or merge/patch archives (see {@link isPatchArchive}).
   */
  get payloadCount(): number {
    return this.payloads.length;
  }

  /**
   * True for merge/patch archives: `ArchiveInfo.should_merge` is set, or a
   * MessageInfo carries `type == 0`, meaning its payload is a diff against
   * the message named by `base_message_index`.
   *
   * Multiple MessageInfos alone do NOT make a patch archive — modern Pages
   * routinely writes archives holding several complete messages of the same
   * type (observed on TST.TableStyleNetworkArchive in 14.5 documents).
   */
  get isPatchArchive(): boolean {
    if (this.archiveInfo.getBool(ARCHIVE_SHOULD_MERGE) === true) return true;
    return this.messageInfos.some((info) => (info.getUint(MSG_TYPE) ?? 0) === 0);
  }

  /** Message types of every payload, in order. */
  get payloadTypes(): number[] {
    return this.messageInfos.map((info) => info.getUint(MSG_TYPE) ?? 0);
  }

  /**
   * Reader versions targeted by this archive's compatibility diffs.
   *
   * Apple stores, alongside the current message, one type-0 patch per older
   * reader version (`MessageInfo.diff_merge_version`), so an older app
   * opening the document applies the diff matching its own version — the
   * object-level counterpart of the `styles_for_*` stylesheet snapshots.
   * Observed on TN.UIStateArchive targeting 11.0 / 10.1 / 10.0.
   */
  compatibilityPatchVersions(): number[][] {
    const out: number[][] = [];
    for (const info of this.messageInfos) {
      if ((info.getUint(MSG_TYPE) ?? 0) !== 0) continue;
      out.push(info.getPackedVarints(MSG_DIFF_MERGE_VERSION).map(Number));
    }
    return out;
  }

  /**
   * True when editing this object's primary payload would leave its
   * older-reader compatibility diffs stale. This library preserves those
   * diffs verbatim; it does not recompute them.
   */
  get hasCompatibilityPatches(): boolean {
    return this.compatibilityPatchVersions().length > 0;
  }

  /**
   * Parse a secondary payload (index ≥ 1). These are preserved verbatim on
   * save unless replaced; only the primary payload is edit-tracked.
   */
  payloadMessage(index: number): RawMessage | undefined {
    const bytes = this.payloads[index];
    if (bytes === undefined) return undefined;
    if (index === 0) return this.message;
    return RawMessage.parse(bytes);
  }

  get isDirty(): boolean {
    return (this.parsed?.isDirty ?? false) || this.archiveInfo.isDirty;
  }

  /** Object identifiers referenced by the primary payload, per MessageInfo. */
  getObjectReferences(): bigint[] {
    const info = this.messageInfos[0];
    return info ? info.getPackedVarints(MSG_OBJECT_REFERENCES) : [];
  }

  setObjectReferences(ids: readonly bigint[]): void {
    const info = this.messageInfos[0];
    if (!info) throw new RangeError(`object ${this.identifier}: no MessageInfo`);
    if (ids.length === 0) info.remove(MSG_OBJECT_REFERENCES);
    else info.setPackedVarints(MSG_OBJECT_REFERENCES, ids);
  }

  getDataReferences(): bigint[] {
    const info = this.messageInfos[0];
    return info ? info.getPackedVarints(MSG_DATA_REFERENCES) : [];
  }

  setDataReferences(ids: readonly bigint[]): void {
    const info = this.messageInfos[0];
    if (!info) throw new RangeError(`object ${this.identifier}: no MessageInfo`);
    if (ids.length === 0) info.remove(MSG_DATA_REFERENCES);
    else info.setPackedVarints(MSG_DATA_REFERENCES, ids);
  }

  /** Replace the primary payload with a parsed copy of the given bytes. */
  setMessageBytes(bytes: Uint8Array): void {
    const parsed = RawMessage.parse(bytes.slice());
    parsed.markDirty();
    this.parsed = parsed;
  }

  /** Serialize this object's archive (ArchiveInfo length + info + payloads). */
  serialize(): Uint8Array {
    // Refresh payload bytes + MessageInfo.length if the message was edited.
    if (this.parsed?.isDirty) {
      const bytes = this.parsed.toBytes();
      this.payloads[0] = bytes;
      const info = this.messageInfos[0];
      if (!info) throw new RangeError(`object ${this.identifier}: no MessageInfo`);
      info.setVarint(MSG_LENGTH, bytes.length);
    }
    const infoBytes = this.archiveInfo.toBytes();
    const w = new ByteWriter(infoBytes.length + 8);
    writeUvarint(w, infoBytes.length);
    w.bytes(infoBytes);
    return concatBytes([w.toBytes(), ...this.payloads]);
  }

  /**
   * Create a fresh object with a single MessageInfo of the given type.
   * `versions` defaults to a conservative singleton [1] and should normally be
   * copied from a sibling object of the same type in the same document.
   */
  static create(identifier: bigint, type: number, versions: readonly number[] = [1]): IwaObject {
    const info = RawMessage.create();
    info.setVarint(MSG_TYPE, type);
    info.setPackedVarints(MSG_VERSION, versions);
    info.setVarint(MSG_LENGTH, 0);
    const archive = RawMessage.create();
    archive.setVarint(ARCHIVE_IDENTIFIER, identifier);
    archive.addMessage(ARCHIVE_MESSAGE_INFOS, info);
    const obj = new IwaObject(archive, [new Uint8Array(0)]);
    obj.parsed = RawMessage.create();
    return obj;
  }

  /** Copy the packed version list from another MessageInfo (compatibility). */
  copyVersionsFrom(other: IwaObject): void {
    const mine = this.messageInfos[0];
    const theirs = other.messageInfos[0];
    if (!mine || !theirs) return;
    const versions = theirs.getPackedVarints(MSG_VERSION);
    if (versions.length) mine.setPackedVarints(MSG_VERSION, versions);
  }
}

/** Parse a decompressed IWA archive stream into objects. */
export function parseIwaStream(raw: Uint8Array): IwaObject[] {
  const objects: IwaObject[] = [];
  let pos = 0;
  while (pos < raw.length) {
    const { value: infoLen, next } = readUvarintNumber(raw, pos);
    pos = next;
    if (pos + infoLen > raw.length) throw new RangeError("iwa: truncated ArchiveInfo");
    const archiveInfo = RawMessage.parse(raw.subarray(pos, pos + infoLen));
    pos += infoLen;
    const payloads: Uint8Array[] = [];
    for (const info of archiveInfo.getMessages(ARCHIVE_MESSAGE_INFOS)) {
      const len = info.getUint(MSG_LENGTH) ?? 0;
      if (pos + len > raw.length) throw new RangeError("iwa: truncated payload");
      payloads.push(raw.subarray(pos, pos + len));
      pos += len;
    }
    objects.push(new IwaObject(archiveInfo, payloads));
  }
  return objects;
}

/** Serialize objects back to a decompressed IWA archive stream. */
export function serializeIwaStream(objects: readonly IwaObject[]): Uint8Array {
  return concatBytes(objects.map((o) => o.serialize()));
}

/** Decode a `.iwa` file (snappy chunks) into its objects. */
export function parseIwaFile(fileBytes: Uint8Array): IwaObject[] {
  return parseIwaStream(decodeIwaData(fileBytes));
}

/** Encode objects into `.iwa` file bytes (snappy chunks). */
export function serializeIwaFile(objects: readonly IwaObject[]): Uint8Array {
  return encodeIwaData(serializeIwaStream(objects));
}
