/**
 * iwork-files — read, inspect and edit Apple iWork documents (Pages, Numbers,
 * Keynote) in pure TypeScript with zero runtime dependencies.
 *
 * Layering (each importable on its own):
 *   primitives:  snappy, protobuf wire (RawMessage), zip, varint, crc32
 *   container:   IWorkContainer (package layouts), IWA archives (IwaObject)
 *   graph:       ObjectStore (components, IDs, references, save invariants)
 *   model:       IWorkDocument + TextStorage/StylesheetModel/DrawableModel
 *   apps:        PagesDocument, NumbersDocument, KeynoteDocument
 */

// High-level documents
export { PagesDocument, PagesSection } from "./pages/document.ts";
export type { PageSetup, SectionTemplateInfo } from "./pages/document.ts";
export { NumbersDocument } from "./numbers/document.ts";
export type { SheetInfo } from "./numbers/document.ts";
export { KeynoteDocument } from "./keynote/document.ts";
export { IWorkDocument, FormatInfo, detectApp } from "./model/document.ts";
export type { DocumentStats } from "./model/document.ts";

// Shared model
export { TextStorage } from "./model/textstorage.ts";
export type { ParagraphInfo, StyleRun } from "./model/textstorage.ts";
export { StylesheetModel, describeStyle } from "./model/stylesheet.ts";
export type {
  CharacterFormatting,
  ParagraphFormatting,
  StyleInfo,
} from "./model/stylesheet.ts";
export { DrawableModel, findDrawableCore } from "./model/drawables.ts";
export type { GeometryInfo } from "./model/drawables.ts";
export * as schema from "./model/schema.ts";
export * as pagesSchema from "./pages/schema.ts";

// Object graph & container
export { ObjectStore, Component } from "./store.ts";
export type { ReferenceExtractor } from "./store.ts";
export { IWorkContainer, EncryptedDocumentError, canonicalIwaName, locatorForIwaName } from "./package.ts";
export { IwaObject, parseIwaFile, serializeIwaFile, parseIwaStream, serializeIwaStream } from "./iwa.ts";

// Registry
export {
  typeName,
  SHARED_TYPES,
  PAGES_TYPES,
  KEYNOTE_TYPES,
  NUMBERS_TYPES,
} from "./registry.ts";
export type { IWorkApp } from "./registry.ts";

// Primitives
export { RawMessage, WireType } from "./protobuf.ts";
export type { RawField, FieldValue } from "./protobuf.ts";
export {
  snappyCompressBlock,
  snappyUncompressBlock,
  decodeIwaData,
  encodeIwaData,
} from "./snappy.ts";
export { ZipReader, buildZip } from "./zip.ts";
export type { ZipEntryMeta, ZipWriteEntry } from "./zip.ts";
export { inflateRaw } from "./inflate.ts";
export { crc32 } from "./crc32.ts";
export { readUvarint, writeUvarint, uvarintLength, zigzagDecode, zigzagEncode } from "./varint.ts";
export { ByteWriter, concatBytes, bytesEqual, utf8Decode, utf8Encode } from "./bytes.ts";
export { parseBinaryPlist, xmlPlistStrings } from "./plist.ts";
export type { PlistValue } from "./plist.ts";
