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
export { PlaceholderKind, ShowMode } from "./keynote/document.ts";
export type {
  SlideTransition,
  PlaceholderRole,
  PresentationSettings,
} from "./keynote/document.ts";
export * as keynoteSchema from "./keynote/schema.ts";
export { IWorkDocument, FormatInfo, detectApp } from "./tsa/document.ts";
export type { DocumentStats } from "./tsa/document.ts";

// Shared model
export {
  TextStorage,
  OBJECT_REPLACEMENT_CHARACTER,
  FOOTNOTE_MARK_CHARACTER,
  STORAGE_KIND,
} from "./tswp/textstorage.ts";
export {
  buildNumberAttachment,
  readNumberAttachment,
  ATTACHMENT_TYPE,
  AttachmentKind,
  NumberAttachment,
  TextualAttachment,
  PAGE_NUMBER_FORMATS,
  buildDateField,
  buildBookmark,
  readDateField,
  SMART_FIELD_TYPE,
  SmartField,
  DateTimeField,
  DateTimeStyle,
  DateTimeUpdatePlan,
  BookmarkFieldArchive,
} from "./tswp/fields.ts";
export type {
  NumberAttachmentInfo,
  NumberAttachmentOptions,
  PageNumberFormatName,
  DateFieldOptions,
} from "./tswp/fields.ts";
export {
  buildComment,
  createAuthor,
  resolveAuthor,
  authorsOf,
  readCommentStorage,
  COMMENT_TYPE,
  HighlightFields,
  CommentStorageFields,
  AuthorFields,
} from "./tswp/comments.ts";
export type { CommentInfo, AddCommentOptions } from "./tswp/comments.ts";
export { randomUuid, isUuidString } from "./base/uuid.ts";
export type { ParagraphInfo, StyleRun } from "./tswp/textstorage.ts";
export {
  StylesheetModel,
  StyleHandle,
  describeStyle,
  buildCharacterProperties,
  buildParagraphProperties,
  applyCharacterProperties,
  applyParagraphProperties,
  readCharacterProperties,
  readParagraphProperties,
} from "./tss/stylesheet.ts";
export type {
  CharacterFormatting,
  ParagraphFormatting,
  StyleInfo,
  TabStop,
} from "./tss/stylesheet.ts";

// Shared style values (fills, gradients, strokes, shadows, padding)
export {
  readColor,
  writeColor,
  isColorLike,
  hexColor,
  BLACK,
  WHITE,
  readFill,
  writeFill,
  colorFill,
  linearGradient,
  readStroke,
  writeStroke,
  solidStroke,
  readShadow,
  writeShadow,
  readPadding,
  writePadding,
  FillFields,
  GradientFields,
  GradientType,
  ImageFillFields,
  ImageFillTechnique,
  StrokeFields,
  StrokePatternFields,
  StrokePatternType,
  LineCap,
  LineJoin,
  ShadowFields,
  ShadowType,
  PaddingFields,
} from "./tsd/style.ts";
export type {
  Color,
  Fill,
  Gradient,
  GradientStop,
  ImageFill,
  Stroke,
  Shadow,
  Padding,
} from "./tsd/style.ts";
export {
  DrawableModel,
  DrawableStyleHandle,
  findDrawableCore,
  drawableStylesOf,
  DEFAULT_SHADOW,
} from "./tsd/drawables.ts";
export type { DrawableStyle } from "./tsd/drawables.ts";
export { ImageModel, imagesOf, ImageAdjustments } from "./tsd/images.ts";
export {
  MaskModel,
  buildRectangularMask,
  MaskFields,
  PathSourceFields,
  BezierPathSourceFields,
  PathElementType,
} from "./tsd/masks.ts";
export type { ImageCrop, Rect } from "./tsd/masks.ts";
export { DrawableContainer, drawableById } from "./tsd/placement.ts";
export type { DrawablePlacement } from "./tsd/placement.ts";
export {
  ChartModel,
  chartsOf,
  decodeGridValue,
  encodeGridValue,
  CHART_TYPE_NAMES,
  TSCH_TYPE,
} from "./tsch/charts.ts";
export type { ChartValue } from "./tsch/charts.ts";
export type { ImageFilters } from "./tsd/images.ts";
export type { GeometryInfo } from "./tsd/drawables.ts";
export * as tspSchema from "./tsp/schema.ts";
export * as tswpSchema from "./tswp/schema.ts";
export * as tssSchema from "./tss/schema.ts";
export * as tsdSchema from "./tsd/schema.ts";
export {
  TableModel,
  tablesOf,
  decodeCellRecord,
  decodeDecimal128,
  cellValueToString,
  groupValueOf,
  toCellInput,
  TST_TYPE,
} from "./tst/tables.ts";
export type {
  CellValue,
  CellInput,
  CellInfo,
  MergeRange,
  TableBand,
  WriteOptions,
} from "./tst/tables.ts";
export { CellRecord, CellType, CellFlag, encodeDecimal128 } from "./tst/cellrecord.ts";
export {
  renderFormula,
  registerFormulaFunctions,
  clearRegisteredFormulaFunctions,
  functionName,
  isKnownFunction,
  functionTableProvenance,
  columnName,
  cellAddress,
  AstNodeType,
  AstNodeFields,
  FormulaFields,
  CROSS_TABLE_PREFIX,
  SELF_CELL_MARKER,
} from "./tst/formulas.ts";
export type { RenderedFormula, FormulaOrigin, RenderOptions } from "./tst/formulas.ts";
export {
  TableStyleHandle,
  readCellFormatting,
  applyCellFormatting,
  buildCellProperties,
  readTableFormatting,
  applyTableFormatting,
  allBorders,
  CellStyleProps,
  TableStyleProps,
  VerticalAlignment,
  TST_STYLE_TYPE,
} from "./tst/styles.ts";
export type { CellFormatting, TableFormatting, CellBorders } from "./tst/styles.ts";
export {
  readFormat,
  writeFormat,
  categoryOfFormatType,
  flagForFormat,
  FormatType,
  FormatFields,
  NegativeStyle,
  AUTOMATIC_DECIMALS,
  FORMAT_FLAG_BY_CATEGORY,
} from "./tst/formats.ts";
export type { CellFormat, FormatCategory, NumericFormatOptions } from "./tst/formats.ts";
export {
  readPredicate,
  readOperand,
  describePredicate,
  PredicateFields,
  PrePivotPredicateFields,
  PredArgFields,
  PredArgDataFields,
  PREDICATE_TYPE_OPERATORS,
} from "./tst/predicates.ts";
export type {
  Predicate,
  PredicateOperand,
  PredicateOperandKind,
  PredicateOperator,
} from "./tst/predicates.ts";
export { ConditionalStyleSet, ConditionalStyleSetFields } from "./tst/conditional.ts";
export type { ConditionalRule } from "./tst/conditional.ts";
export { FilterSet, FilterSetFields, FilterSetType } from "./tst/filters.ts";
export type { FilterRule, FilterMode } from "./tst/filters.ts";
export {
  TableCategories,
  categoriesOf,
  expandIndexSet,
  readCellValue,
  GroupingType,
  GROUPING_TYPE_NAMES,
  GroupByFields,
  GroupColumnFields,
  GroupNodeFields,
  ColumnAggregateFields,
  sameGroupValue,
} from "./tst/categories.ts";
export type { CategoryGroup, GroupColumn, GroupValue, ColumnAggregate } from "./tst/categories.ts";
export { ColumnRowUidMap, uidMapOf, readUid, uidKey, UidMapFields } from "./tst/uidmap.ts";
export {
  FormulaOwnerRegistry,
  ownerKey,
  readOwnerUid,
  readCfUid,
  OwnerKind,
  FormulaOwnerFields,
  FORMULA_OWNER_DEPENDENCIES,
  HAUNTED_OWNER,
} from "./tsce/owners.ts";
export type { FormulaOwner, OwnerUid } from "./tsce/owners.ts";
export type { Uid } from "./tst/uidmap.ts";
export { TextRange, ParagraphHandle } from "./tswp/range.ts";
export { TableOfContents, tablesOfContents, TOC_TYPE, TocScope } from "./tswp/toc.ts";
export type { TocRule, TocEntry } from "./tswp/toc.ts";
export {
  BorderPosition,
  Capitalization,
  Ligatures,
  ScriptPosition,
  StrikethruType,
  TabAlignment,
  TextAlignment,
  UnderlineType,
} from "./tswp/schema.ts";
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
export { deepCloneObject, defaultFollow } from "./tsp/clone.ts";
export type { CloneOptions, CloneResult } from "./tsp/clone.ts";
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
  detectIwaFraming,
  UnsupportedIwaFramingError,
} from "./base/snappy.ts";
export type { IwaFraming } from "./base/snappy.ts";
export { ZipReader, buildZip } from "./base/zip.ts";
export type { ZipEntryMeta, ZipWriteEntry } from "./base/zip.ts";
export { inflateRaw } from "./base/inflate.ts";
export { crc32 } from "./base/crc32.ts";
export { readUvarint, writeUvarint, uvarintLength, zigzagDecode, zigzagEncode } from "./base/varint.ts";
export { ByteWriter, concatBytes, bytesEqual, utf8Decode, utf8Encode } from "./base/bytes.ts";
export { parseBinaryPlist, xmlPlistStrings } from "./base/plist.ts";
export type { PlistValue } from "./base/plist.ts";
