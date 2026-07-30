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
export { KeynoteDocument, KeynoteSlide } from "./keynote/document.ts";
export type { SlideTransition } from "./keynote/document.ts";
export * as keynoteSchema from "./keynote/schema.ts";
export { IWorkDocument, FormatInfo, detectApp } from "./tsa/document.ts";
export type { DocumentStats } from "./tsa/document.ts";

// Shared model
export { TextStorage } from "./tswp/textstorage.ts";
export type { ParagraphInfo, StyleRun } from "./tswp/textstorage.ts";
export { StylesheetModel, describeStyle } from "./tss/stylesheet.ts";
export type {
  CharacterFormatting,
  ParagraphFormatting,
  StyleInfo,
} from "./tss/stylesheet.ts";
export { DrawableModel, findDrawableCore } from "./tsd/drawables.ts";
export { ImageModel, imagesOf, ImageAdjustments } from "./tsd/images.ts";
export { ChartModel, chartsOf, decodeGridValue, CHART_TYPE_NAMES, TSCH_TYPE } from "./tsch/charts.ts";
export type { ChartValue } from "./tsch/charts.ts";
export type { ImageFilters } from "./tsd/images.ts";
export type { GeometryInfo } from "./tsd/drawables.ts";
export * as tspSchema from "./tsp/schema.ts";
export * as tswpSchema from "./tswp/schema.ts";
export * as tssSchema from "./tss/schema.ts";
export * as tsdSchema from "./tsd/schema.ts";
export { TableModel, tablesOf, decodeCellRecord, decodeDecimal128, cellValueToString, TST_TYPE } from "./tst/tables.ts";
export type { CellValue, CellInfo, MergeRange } from "./tst/tables.ts";
export { TextRange, ParagraphHandle } from "./tswp/range.ts";
export { PagesSettings } from "./pages/document.ts";
export { sha1 } from "./base/sha1.ts";
export {
  IWorkVersion,
  eraOf,
  eraInfo,
  eraAtLeast,
  probeStructure,
  buildCompatibilityReport,
  summarizeCompatibility,
  IWORK_ERAS,
  HIGHEST_KNOWN_FORMAT_MAJOR,
} from "./tsp/version.ts";
export type { IWorkEra, EraInfo, StructuralProbe, CompatibilityReport } from "./tsp/version.ts";
export { imageDimensions } from "./base/imagesize.ts";
export * as pagesSchema from "./pages/schema.ts";

// Object graph & container
export { ObjectStore, Component } from "./tsp/store.ts";
export type { ReferenceExtractor } from "./tsp/store.ts";
export { IWorkContainer, EncryptedDocumentError, canonicalIwaName, locatorForIwaName } from "./tsp/package.ts";
export { IwaObject, parseIwaFile, serializeIwaFile, parseIwaStream, serializeIwaStream } from "./tsp/iwa.ts";

// Registry
export {
  typeName,
  registerTypes,
  clearRegisteredTypes,
  SHARED_TYPES,
  PAGES_TYPES,
  KEYNOTE_TYPES,
  NUMBERS_TYPES,
} from "./tsp/registry.ts";
export type { IWorkApp } from "./tsp/registry.ts";

// Primitives
export { RawMessage, WireType } from "./base/protobuf.ts";
export type { RawField, FieldValue } from "./base/protobuf.ts";
export {
  snappyCompressBlock,
  snappyUncompressBlock,
  decodeIwaData,
  encodeIwaData,
} from "./base/snappy.ts";
export { ZipReader, buildZip } from "./base/zip.ts";
export type { ZipEntryMeta, ZipWriteEntry } from "./base/zip.ts";
export { inflateRaw } from "./base/inflate.ts";
export { crc32 } from "./base/crc32.ts";
export { readUvarint, writeUvarint, uvarintLength, zigzagDecode, zigzagEncode } from "./base/varint.ts";
export { ByteWriter, concatBytes, bytesEqual, utf8Decode, utf8Encode } from "./base/bytes.ts";
export { parseBinaryPlist, xmlPlistStrings } from "./base/plist.ts";
export type { PlistValue } from "./base/plist.ts";
