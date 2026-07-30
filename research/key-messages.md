# Key iWork protobuf messages (verbatim extracts)

Verbatim message definitions for hand-coding a TypeScript reader/writer for
Apple Pages `.pages` files (IWA format). Nothing below is paraphrased: every
fenced block is copied exactly from the source `.proto` files vendored in
`/home/user/iwork-files/proto/`.

Sources:

- **current** = masaccio/numbers-parser @ 2dd9dbe3f8f3440bbd19e23668d5ade72a2e1629, `src/protos/` (protodump of Numbers.app 14.4; shared `TS*`
  frameworks are the same ones used by Pages 14.4). Vendored at
  `proto/current/`. Cross-checked byte-identical with psobot/keynote-parser
  `protos/versions/14.4/` @ 6bc3849e80f531f51d2878550bd634706d3f036d (only two
  float default literal spellings differ, in TSDArchives.proto).
- **2013** = obriensp/iWorkFileFormat @ 8575e441beaaaa56f480fdd91721f5bb06d07d43, `iWorkFileInspector/iWorkFileInspector/Messages/Proto/` (proto-dump of Pages 5.0, iWork '13). Vendored at
  `proto/pages-2013/`. Only used for the Pages-specific `TP.*` messages, which
  exist in no newer public dump.

Unless a "2013 vs current" note says otherwise, a message that exists in both
dumps is **field-for-field identical**, so the 2013-era TP schemas interoperate
with the current shared schemas at these touch points. All schemas are
`syntax = "proto2"`.

---

## 1. TSP primitives — `TSPMessages.proto` (current)

Source: `proto/current/TSPMessages.proto` (masaccio/numbers-parser @ 2dd9dbe3f8f3440bbd19e23668d5ade72a2e1629, `src/protos/`).

`TSP.Reference` is the object-graph pointer of the whole format: a varint
`identifier` resolved through the `.iwa` component index
(`TSPArchiveMessages.ArchiveInfo` framing). `TSP.DataReference` points into the
`Data/` directory of the package instead (see `TSP.DataInfo` in section 2).
Both are unchanged since 2013.

```proto
message Reference {
  required uint64 identifier = 1;
  optional int32 deprecated_type = 2;
  optional bool deprecated_is_external = 3;
}
```

```proto
message DataReference {
  required uint64 identifier = 1;
}
```


`SparseReferenceArray` — **new since 2013** (not in the iWork '13 dump).

```proto
message SparseReferenceArray {
  message Entry {
    required uint32 index = 1;
    required .TSP.Reference reference = 2;
  }

  required uint32 count = 1;
  repeated .TSP.SparseReferenceArray.Entry entries = 2;
}
```


Geometry primitives — `Point`, `Size`, `Range`, `Rect` all identical to 2013.

```proto
message Point {
  required float x = 1;
  required float y = 2;
}
```

```proto
message Size {
  required float width = 1;
  required float height = 2;
}
```

```proto
message Range {
  required uint32 location = 1;
  required uint32 length = 2;
}
```

```proto
message Rect {
  required .TSP.Point origin = 1;
  required .TSP.Size size = 2;
}
```


`Color` — 2013 vs current: current **adds** nested `enum RGBColorSpace
{ srgb = 1; p3 = 2; }` and field `rgbspace = 12`. All 2013 fields/numbers
unchanged.

```proto
message Color {
  enum ColorModel {
    rgb = 1;
    cmyk = 2;
    white = 3;
  }
  enum RGBColorSpace {
    srgb = 1;
    p3 = 2;
  }
  required .TSP.Color.ColorModel model = 1;
  optional float r = 3;
  optional float g = 4;
  optional float b = 5;
  optional .TSP.Color.RGBColorSpace rgbspace = 12;
  optional float a = 6 [default = 1];
  optional float c = 7;
  optional float m = 8;
  optional float y = 9;
  optional float k = 10;
  optional float w = 11;
}
```


`Date` (used by change tracking, comments):

```proto
message Date {
  required double seconds = 1;
}
```


UUID variants — the whole `TSP.UUID` family is **new since 2013** (the iWork
'13 dump has none of these messages). `UUID` stores the 128-bit value as two
fixed64 halves; `CFUUIDArchive` stores the classic 16-byte layout.

```proto
message UUID {
  required uint64 lower = 1;
  required uint64 upper = 2;
}
```

```proto
message CFUUIDArchive {
  optional bytes uuid_bytes = 1;
  optional uint32 uuid_w0 = 2;
  optional uint32 uuid_w1 = 3;
  optional uint32 uuid_w2 = 4;
  optional uint32 uuid_w3 = 5;
}
```

```proto
message UUIDSetArchive {
  repeated .TSP.UUID uids = 1;
}
```

```proto
message UUIDMapArchive {
  repeated .TSP.UUID source = 1;
  repeated .TSP.UUID target = 2;
}
```

```proto
message UUIDMultiMapArchive {
  repeated .TSP.UUID source = 1;
  repeated .TSP.UUID target = 2;
}
```

```proto
message UUIDCoordArchive {
  required .TSP.UUID row_uid = 1;
  required .TSP.UUID column_uid = 2;
}
```

```proto
message UUIDRectArchive {
  repeated .TSP.UUID column_uids = 1;
  repeated .TSP.UUID row_uids = 2;
}
```

```proto
message SparseUUIDArray {
  message Entry {
    required uint32 index = 1;
    required .TSP.UUID uuid = 2;
  }

  required uint32 count = 1;
  repeated .TSP.SparseUUIDArray.Entry entries = 2;
}
```

```proto
message UUIDPath {
  repeated .TSP.UUID uuids = 1;
}
```

```proto
message SparseUUIDPathArray {
  message Entry {
    required uint32 index = 1;
    required .TSP.UUIDPath uuid_path = 2;
  }

  required uint32 count = 1;
  repeated .TSP.SparseUUIDPathArray.Entry entries = 2;
}
```


Object containers (identical to 2013) and data attributes:

```proto
message ObjectCollection {
  repeated .TSP.Reference objects = 1;
}
```

```proto
message ObjectContainer {
  optional uint32 identifier = 1;
  repeated .TSP.Reference objects = 2;
}
```

```proto
message DataAttributes {
  extensions 100 to 536870911;
}
```


---

## 2. Archive framing & package metadata — `TSPArchiveMessages.proto`, `TSPDatabaseMessages.proto` (current)

Source: `proto/current/TSPArchiveMessages.proto` (masaccio/numbers-parser @ 2dd9dbe3f8f3440bbd19e23668d5ade72a2e1629, `src/protos/`).

These are the messages that frame every `.iwa` file. Each IWA chunk is:
varint length of `ArchiveInfo`, the `ArchiveInfo`, then the payload messages
described by its `MessageInfo` records (`type` = archive type id registered by
the app, `length` = payload byte length; `object_references` lists the
`TSP.Reference.identifier`s the payload contains).

`ArchiveInfo` — 2013 vs current: current adds `should_merge = 3`.

```proto
message ArchiveInfo {
  optional uint64 identifier = 1;
  repeated .TSP.MessageInfo message_infos = 2;
  optional bool should_merge = 3;
}
```


`MessageInfo` — 2013 vs current: fields 1-6 unchanged; current adds
`base_message_index = 7`, `diff_merge_version = 8`, `diff_field_path = 9`,
`fields_to_remove = 10`, `diff_read_version = 11` (collaboration diffs).

```proto
message MessageInfo {
  required uint32 type = 1;
  repeated uint32 version = 2 [packed = true];
  required uint32 length = 3;
  repeated .TSP.FieldInfo field_infos = 4;
  repeated uint64 object_references = 5 [packed = true];
  repeated uint64 data_references = 6 [packed = true];
  optional uint32 base_message_index = 7;
  repeated uint32 diff_merge_version = 8 [packed = true];
  optional .TSP.FieldPath diff_field_path = 9;
  repeated .TSP.FieldPath fields_to_remove = 10;
  repeated uint32 diff_read_version = 11 [packed = true];
}
```


`FieldInfo` / `FieldPath` — 2013 vs current: the nested enum was renamed
`Rule` → `UnknownFieldRule` and its value 0 renamed
`IgnoreAndDrop` → `IgnoreAndPreserveUntilModified` (same wire values 0-3);
field 3 renamed `rule` → `unknown_field_rule` (same number). Current adds
`enum KnownFieldRule` plus fields `known_field_rule = 6`,
`known_field_version = 7`, `known_field_feature_identifier = 8`. This is
Apple's own unknown-field-preservation contract — a writer must round-trip
unknown fields to be safe.

```proto
message FieldInfo {
  enum Type {
    Value = 0;
    ObjectReference = 1;
    DataReference = 2;
    Message = 3;
  }
  enum UnknownFieldRule {
    IgnoreAndPreserveUntilModified = 0;
    IgnoreAndPreserve = 1;
    MustUnderstand = 2;
    NotSupported = -1;
  }
  enum KnownFieldRule {
    None = 0;
    PreserveNewerValueUntilModified = 1;
    PreserveNewerValue = 2;
  }
  required .TSP.FieldPath path = 1;
  optional .TSP.FieldInfo.Type type = 2 [default = Value];
  optional .TSP.FieldInfo.UnknownFieldRule unknown_field_rule = 3 [default = IgnoreAndPreserveUntilModified];
  repeated uint64 object_references = 4 [packed = true];
  repeated uint64 data_references = 5 [packed = true];
  optional .TSP.FieldInfo.KnownFieldRule known_field_rule = 6 [default = None];
  repeated uint32 known_field_version = 7 [packed = true];
  optional string known_field_feature_identifier = 8;
}
```

```proto
message FieldPath {
  repeated uint32 path = 1 [packed = true];
}
```


`ComponentInfo` — describes one component (one `.iwa` file) in the package
index (`Index/Metadata.iwa` → `PackageMetadata.components`). 2013 vs current:
fields 4/5 renamed `read_version`/`write_version` →
`document_read_version`/`document_write_version` (same numbers); 2013-only
fields `allows_duplicates_outside_of_document_package = 8` and
`dirties_document_package = 9` are gone (numbers 8/9 now unused); current adds
fields 11-21 (`object_uuid_map_entries`, `save_token`, `feature_infos`,
`component_read_version`, `component_required_version`,
`compression_algorithm`, `can_be_dropped`, `versioned_external_references`,
`is_wasteful`, `ambiguous_object_identifiers`,
`required_package_identifier`).

```proto
message ComponentInfo {
  required uint64 identifier = 1;
  required string preferred_locator = 2;
  optional string locator = 3;
  repeated uint32 document_read_version = 4 [packed = true];
  repeated uint32 document_write_version = 5 [packed = true];
  repeated .TSP.ComponentExternalReference external_references = 6;
  repeated .TSP.ComponentDataReference data_references = 7;
  optional bool is_stored_outside_object_archive = 10 [default = false];
  repeated .TSP.ObjectUUIDMapEntry object_uuid_map_entries = 11;
  optional uint64 save_token = 12 [default = 0];
  repeated .TSP.FeatureInfo feature_infos = 13;
  repeated uint32 component_read_version = 14 [packed = true];
  repeated uint32 component_required_version = 15 [packed = true];
  optional uint32 compression_algorithm = 16;
  optional bool can_be_dropped = 17;
  repeated .TSP.ComponentExternalReference versioned_external_references = 18;
  optional bool is_wasteful = 19;
  repeated uint64 ambiguous_object_identifiers = 20 [packed = true];
  optional uint32 required_package_identifier = 21;
}
```


`ComponentExternalReference` (identical to 2013) and companions:

```proto
message ComponentExternalReference {
  required uint64 component_identifier = 1;
  optional uint64 object_identifier = 2;
  optional bool is_weak = 3;
}
```

```proto
message ComponentDataReference {
  message ObjectReference {
    required uint64 object_identifier = 1;
    required uint32 count = 2;
  }

  required uint64 data_identifier = 1;
  repeated .TSP.ComponentDataReference.ObjectReference object_reference_list = 2;
}
```

```proto
message ObjectUUIDMapEntry {
  required uint64 identifier = 1;
  required .TSP.UUID uuid = 2;
}
```

```proto
message FeatureInfo {
  required string identifier = 1;
  repeated uint32 read_version = 2 [packed = true];
  repeated uint32 write_version = 3 [packed = true];
}
```


`PackageMetadata` — the root of `Index/Metadata.iwa`. 2013 vs current: fields
1, 3-6 unchanged; current adds `revision = 2` (`DocumentRevision`),
`file_format_version = 7`, `save_token = 8`, `preferred_package_type = 9`,
`data_metadata_map = 10`, `versioned_components = 11`, and the nested
`PackageType` enum.

```proto
message PackageMetadata {
  enum PackageType {
    Default = 0;
    Directory = 1;
    SingleFile = 2;
  }
  required uint64 last_object_identifier = 1;
  optional .TSP.DocumentRevision revision = 2;
  repeated .TSP.ComponentInfo components = 3;
  repeated .TSP.DataInfo datas = 4;
  repeated uint32 read_version = 5 [packed = true];
  repeated uint32 write_version = 6 [packed = true];
  repeated uint32 file_format_version = 7 [packed = true];
  optional uint64 save_token = 8 [default = 0];
  optional .TSP.PackageMetadata.PackageType preferred_package_type = 9 [default = Default];
  optional .TSP.Reference data_metadata_map = 10;
  repeated .TSP.ComponentInfo versioned_components = 11;
}
```

```proto
message DocumentRevision {
  optional int32 sequence_32 = 3 [default = 0];
  optional string identifier = 2;
  optional uint64 sequence_64 = 1 [default = 0];
}
```


`DataInfo` — one entry per file under `Data/` (`PackageMetadata.datas`).
2013 vs current: fields 1-6 unchanged (`digest` is the truncated SHA-1 that
also appears in the on-disk filename); current adds fields 7-18 (remote/iCloud
state, `attributes`, `encryption_info`, `materialized_length`, ...).

```proto
message DataInfo {
  enum DownloadPriority {
    High = 0;
    Default = 1;
  }
  required uint64 identifier = 1;
  required bytes digest = 2;
  required string preferred_file_name = 3;
  optional string file_name = 4;
  optional string document_resource_locator = 5;
  optional bytes source_bookmark_data = 6;
  optional string remote_url = 7;
  optional bool can_download = 8 [default = false];
  optional .TSP.DataInfo.DownloadPriority download_priority = 9 [default = Default];
  optional .TSP.DataAttributes attributes = 10;
  optional .TSP.EncryptionInfo encryption_info = 11;
  optional bytes last_mismatched_digest = 12;
  optional .TSP.IndexSet unmaterialized_ranges = 13;
  optional uint64 remote_data_length = 14;
  optional bool remote_data_has_package_storage = 15 [default = false];
  optional .TSP.DataUploadStatus upload_status = 16 [default = DataUploadStatus_Pending];
  optional double remote_data_mtime = 17;
  optional uint64 materialized_length = 18;
  optional string pasteboard_external_file_path = 99;
}
```


`DataMetadataMap` / `DataMetadata` — **new since 2013** (referenced from
`PackageMetadata.data_metadata_map`).

```proto
message DataMetadataMap {
  message DataMetadataMapEntry {
    required uint64 data_identifier = 1;
    required .TSP.Reference data_metadata = 2;
  }

  repeated .TSP.DataMetadataMap.DataMetadataMapEntry data_metadata_entries = 1;
}
```

```proto
message DataMetadata {
  optional .TSP.Color fallback_color = 1;
}
```


`ObjectSerializationMetadata` / `ObjectSerializationDirectory` — **new since
2013**; `DocumentMetadata` / `SupportMetadata` are the roots of
`Metadata/DocumentMetadata.iwa` and `Metadata/BuildVersionHistory.plist`-era
support data.

Note: no message named `ObjectSnapshot` exists in either dump (2013 or
current). The snapshot/versioning role is covered by `ComponentInfo`,
`DocumentRevision` and `ObjectSerializationDirectory`.

```proto
message ObjectSerializationMetadata {
  repeated uint32 version = 1 [packed = true];
  optional .TSP.UUID source_document_uuid = 2;
  optional .TSP.UUID version_uuid = 3;
  required .TSP.ComponentInfo component = 4;
  repeated .TSP.DataInfo datas = 5;
  repeated .TSP.ObjectUUIDMapEntry external_object_uuid_map_entries = 6;
  optional .TSP.Reference data_metadata_map = 7;
  repeated uint32 read_version = 8 [packed = true];
}
```

```proto
message ObjectSerializationDirectory {
  message Entry {
    required string locator = 1;
    required uint64 offset = 2;
    required uint64 size = 3;
  }

  repeated .TSP.ObjectSerializationDirectory.Entry entries = 1;
}
```

```proto
message DocumentMetadata {
  optional bool is_in_collaboration_mode = 1;
  optional .TSP.DataPropertiesV1 data_properties_v1 = 3;
}
```

```proto
message SupportMetadata {
  message DataCollaborationProperties {
    required bytes digest = 1;
    optional bool acknowledged_by_server = 2 [default = false];
    optional bool materialized_on_server = 3 [default = false];
    optional int32 revision_sequence_for_materialized_on_server = 5 [default = 0];
    optional .TSP.DataUploadStatus upload_status = 4 [default = DataUploadStatus_Pending];
    optional bool is_remote_data_ever = 6 [default = false];
    optional int32 revision_sequence_for_acknowledged_by_server = 7 [default = 0];
  }

  optional bool is_in_collaboration_mode = 1;
  repeated .TSP.SupportMetadata.DataCollaborationProperties data_collaboration_properties = 2;
}
```


`TSPDatabaseMessages.proto` (current) is tiny; complete file verbatim
(2013's version had the same three messages with a `TSP.Reference data = 1`
in `DatabaseData` instead of `TSP.DataReference`):

```proto
syntax = "proto2";

import "TSPMessages.proto";
package TSP;

message DatabaseData {
  required .TSP.DataReference data = 1;
}

message DatabaseDataArchive {
  optional .TSP.Reference data = 1;
  optional string app_relative_path = 2;
  required string display_name = 3;
  optional uint64 length = 4;
  optional uint32 hash = 5;
  required bool sharable = 6 [default = true];
}

message DatabaseImageDataArchive {
  enum ImageType {
    unknown = 0;
    bitmap = 1;
    pdf = 2;
  }
  required .TSP.DatabaseDataArchive super = 1;
  required .TSP.DatabaseImageDataArchive.ImageType type = 2;
}
```


---

## 3. Text storage — `TSWP.StorageArchive` and its attribute tables (current)

Source: `proto/current/TSWPArchives.proto` (masaccio/numbers-parser @ 2dd9dbe3f8f3440bbd19e23668d5ade72a2e1629, `src/protos/`).

`StorageArchive` is THE text container: document body, headers, footers,
text boxes, table cells, footnotes, comments. `text` is `repeated string` but
in practice holds a single element with the storage's entire plain text
(paragraphs terminated by `\n`, inline attachments as U+FFFC, section breaks
in body text at paragraph starts). All formatting is run-length data in the
attribute tables keyed by UTF-16 character index.

2013 vs current: **all shared field numbers identical**. Current adds enum
value `UNDEFINED = 8` to `KindType` and fields
`table_overlapping_highlight = 25`, `table_pencil_annotation = 26`,
`table_tatechuyoko = 27`, `table_drop_cap_style = 28` (and the
`OverlappingFieldAttributeTable` message, which did not exist in 2013).

```proto
message StorageArchive {
  enum KindType {
    BODY = 0;
    HEADER = 1;
    FOOTNOTE = 2;
    TEXTBOX = 3;
    NOTE = 4;
    CELL = 5;
    UNCLASSIFIED = 6;
    TABLEOFCONTENTS = 7;
    UNDEFINED = 8;
  }
  optional .TSWP.StorageArchive.KindType kind = 1 [default = TEXTBOX];
  optional .TSP.Reference style_sheet = 2;
  repeated string text = 3;
  optional bool has_itext = 4 [default = false];
  optional bool in_document = 10 [default = false];
  optional .TSWP.ObjectAttributeTable table_para_style = 5;
  optional .TSWP.ParaDataAttributeTable table_para_data = 6;
  optional .TSWP.ObjectAttributeTable table_list_style = 7;
  optional .TSWP.ObjectAttributeTable table_char_style = 8;
  optional .TSWP.ObjectAttributeTable table_attachment = 9;
  optional .TSWP.ObjectAttributeTable table_smartfield = 11;
  optional .TSWP.ObjectAttributeTable table_layout_style = 12;
  optional .TSWP.ParaDataAttributeTable table_para_starts = 14;
  optional .TSWP.ObjectAttributeTable table_bookmark = 15;
  optional .TSWP.ObjectAttributeTable table_footnote = 16;
  optional .TSWP.ObjectAttributeTable table_section = 17;
  optional .TSWP.ObjectAttributeTable table_rubyfield = 18;
  optional .TSWP.StringAttributeTable table_language = 19;
  optional .TSWP.StringAttributeTable table_dictation = 20;
  optional .TSWP.ObjectAttributeTable table_insertion = 21;
  optional .TSWP.ObjectAttributeTable table_deletion = 22;
  optional .TSWP.ObjectAttributeTable table_highlight = 23;
  optional .TSWP.ParaDataAttributeTable table_para_bidi = 24;
  optional .TSWP.OverlappingFieldAttributeTable table_overlapping_highlight = 25;
  optional .TSWP.OverlappingFieldAttributeTable table_pencil_annotation = 26;
  optional .TSWP.ObjectAttributeTable table_tatechuyoko = 27;
  optional .TSWP.ObjectAttributeTable table_drop_cap_style = 28;
}
```


### Attribute tables

Sorted by `character_index`; entry *i* covers characters from its
`character_index` up to (but excluding) the next entry's index, or end of
text. An entry whose value field (`object`/`string`) is unset ends the
previous run with "no attribute". `ObjectAttributeTable`,
`StringAttributeTable` and `ParaDataAttributeTable` are unchanged since 2013
except whitespace; `OverlappingFieldAttributeTable` is new since 2013 (its
entries carry an explicit `TSP.Range` and may overlap).

```proto
message ObjectAttributeTable {
  message ObjectAttribute {
    required uint32 character_index = 1;
    optional .TSP.Reference object = 2;
  }

  repeated .TSWP.ObjectAttributeTable.ObjectAttribute entries = 1;
}
```

```proto
message StringAttributeTable {
  message StringAttribute {
    required uint32 character_index = 1;
    optional string object = 2;
  }

  repeated .TSWP.StringAttributeTable.StringAttribute entries = 1;
}
```

```proto
message ParaDataAttributeTable {
  message ParaDataAttribute {
    required uint32 character_index = 1;
    required uint32 first = 2;
    required uint32 second = 3;
  }

  repeated .TSWP.ParaDataAttributeTable.ParaDataAttribute entries = 1;
}
```

```proto
message OverlappingFieldAttributeTable {
  message OverlappingFieldAttribute {
    required .TSP.Range range = 1;
    required .TSP.Reference field = 2;
  }

  repeated .TSWP.OverlappingFieldAttributeTable.OverlappingFieldAttribute entries = 1;
}
```


### StorageArchive field wiring (what each table's entries reference)

| # | Field | Table type | Entry `object` resolves to |
|---|---|---|---|
| 1 | `kind` | enum | role of this storage (BODY for the Pages body text) |
| 2 | `style_sheet` | `TSP.Reference` | `TSS.StylesheetArchive` governing this storage |
| 3 | `text` | repeated string | the raw text itself (single element in practice) |
| 4 | `has_itext` | bool | international text flag |
| 10 | `in_document` | bool | storage is part of the document (vs clipboard etc.) |
| 5 | `table_para_style` | `ObjectAttributeTable` | `TSWP.ParagraphStyleArchive` — one entry per paragraph, `character_index` = paragraph start |
| 6 | `table_para_data` | `ParaDataAttributeTable` | per-paragraph `(first, second)` uint32 pair (list numbering state) |
| 7 | `table_list_style` | `ObjectAttributeTable` | `TSWP.ListStyleArchive` per paragraph |
| 8 | `table_char_style` | `ObjectAttributeTable` | `TSWP.CharacterStyleArchive` — character-run overrides; unset `object` = run reverts to paragraph style |
| 9 | `table_attachment` | `ObjectAttributeTable` | `TSWP.DrawableAttachmentArchive` (inline images/shapes), `TSWP.TSWPTOCPageNumberAttachmentArchive`, `TSWP.NumberAttachmentArchive` (page numbers), other `TextualAttachmentArchive` subclasses — anchored at a U+FFFC in `text` |
| 11 | `table_smartfield` | `ObjectAttributeTable` | `TSWP.SmartFieldArchive` subclasses: `HyperlinkFieldArchive`, `DateTimeSmartFieldArchive`, `BookmarkFieldArchive`, `MergeSmartFieldArchive`, `PlaceholderSmartFieldArchive`, ... |
| 12 | `table_layout_style` | `ObjectAttributeTable` | `TSWP.ColumnStyleArchive` (a.k.a. layout style: columns/padding), per paragraph-range |
| 14 | `table_para_starts` | `ParaDataAttributeTable` | paragraph-start bookkeeping pairs |
| 15 | `table_bookmark` | `ObjectAttributeTable` | `TSWP.BookmarkFieldArchive` |
| 16 | `table_footnote` | `ObjectAttributeTable` | `TSWP.FootnoteReferenceAttachmentArchive` (whose `contained_storage` is the footnote's own `StorageArchive`) |
| 17 | `table_section` | `ObjectAttributeTable` | section objects — in Pages these are `TP.SectionArchive` (entry at each section's first character of the BODY storage) |
| 18 | `table_rubyfield` | `ObjectAttributeTable` | `TSWP.RubyFieldArchive` |
| 19 | `table_language` | `StringAttributeTable` | BCP-47-ish language tag per run |
| 20 | `table_dictation` | `StringAttributeTable` | dictation metadata per run |
| 21 | `table_insertion` | `ObjectAttributeTable` | `TSWP.ChangeArchive` (kind = insertion) — change tracking |
| 22 | `table_deletion` | `ObjectAttributeTable` | `TSWP.ChangeArchive` (kind = deletion) |
| 23 | `table_highlight` | `ObjectAttributeTable` | `TSWP.HighlightArchive` (comment anchor; its `commentStorage` references a `TSD.CommentStorageArchive`) |
| 24 | `table_para_bidi` | `ParaDataAttributeTable` | per-paragraph writing direction pair |
| 25 | `table_overlapping_highlight` | `OverlappingFieldAttributeTable` | `TSWP.HighlightArchive` (overlapping comment ranges) — new since 2013 |
| 26 | `table_pencil_annotation` | `OverlappingFieldAttributeTable` | `TSWP.PencilAnnotationArchive` — new since 2013 |
| 27 | `table_tatechuyoko` | `ObjectAttributeTable` | `TSWP.TateChuYokoFieldArchive` — new since 2013 |
| 28 | `table_drop_cap_style` | `ObjectAttributeTable` | `TSWP.DropCapStyleArchive` — new since 2013 |

Supporting messages referenced above (all current, `TSWPArchives.proto`):

```proto
message TextualAttachmentArchive {
  enum Kind {
    kKindPageNumber = 0;
    kKindPageCount = 1;
    kKindFootnoteMark = 2;
  }
  optional string string_equivalent = 1;
  optional .TSWP.TextualAttachmentArchive.Kind kind = 2;
}
```

```proto
message DrawableAttachmentArchive {
  optional .TSP.Reference drawable = 1;
  optional uint32 h_offset_type = 2;
  optional float h_offset = 3;
  optional uint32 v_offset_type = 4;
  optional float v_offset = 5;
}
```

```proto
message FootnoteReferenceAttachmentArchive {
  optional .TSWP.TextualAttachmentArchive super = 1;
  optional .TSP.Reference contained_storage = 2;
  optional string custom_mark_string = 3;
}
```

```proto
message SmartFieldArchive {
  optional string text_attribute_uuid_string = 1;
}
```

```proto
message HyperlinkFieldArchive {
  optional .TSWP.SmartFieldArchive super = 1;
  optional string url_ref = 2;
}
```

```proto
message BookmarkFieldArchive {
  optional .TSWP.SmartFieldArchive super = 1;
  optional string name = 2;
  optional uint32 ranged = 3;
  optional uint32 hidden = 4;
}
```

```proto
message HighlightArchive {
  optional .TSP.Reference commentStorage = 1;
  optional string text_attribute_uuid_string = 2;
}
```

```proto
message ChangeArchive {
  enum ChangeKind {
    kChangeKindInsertion = 1;
    kChangeKindDeletion = 2;
  }
  optional .TSWP.ChangeArchive.ChangeKind kind = 1;
  optional .TSP.Reference session = 2;
  optional .TSP.Date date = 3;
  optional string text_attribute_uuid_string = 4;
}
```

```proto
message ChangeSessionArchive {
  optional uint32 session_uid = 1;
  optional .TSP.Reference author = 2;
  optional .TSP.Date date = 3;
}
```


---

## 4. Text styles — `TSWPArchives.proto` (current)

Source: `proto/current/TSWPArchives.proto` (masaccio/numbers-parser @ 2dd9dbe3f8f3440bbd19e23668d5ade72a2e1629, `src/protos/`).

Style archives all embed `TSS.StyleArchive` as `super = 1` and carry their
properties payload at field 11+ with an `override_count = 10`
(`override_count` = number of properties this style overrides relative to its
`super.parent`).

Shells — `ParagraphStyleArchive`, `CharacterStyleArchive`,
`ColumnStyleArchive` identical to 2013; `ListStyleArchive` differs only in
that current appends enum values `kHebrewBiblical*Kind = 62..64` to
`LabelType` (field numbers unchanged; nested `LabelGeometry`/`LabelImage`
identical, just moved after the enums in the file).

```proto
message ParagraphStyleArchive {
  required .TSS.StyleArchive super = 1;
  optional uint32 override_count = 10 [default = 0];
  optional .TSWP.CharacterStylePropertiesArchive char_properties = 11;
  optional .TSWP.ParagraphStylePropertiesArchive para_properties = 12;
}
```

```proto
message CharacterStyleArchive {
  required .TSS.StyleArchive super = 1;
  optional uint32 override_count = 10 [default = 0];
  optional .TSWP.CharacterStylePropertiesArchive char_properties = 11;
}
```

```proto
message ListStyleArchive {
  enum LabelType {
    kNone = 0;
    kImage = 1;
    kString = 2;
    kNumber = 3;
  }
  enum NumberType {
    kNumericDecimal = 0;
    kNumericDoubleParen = 1;
    kNumericRightParen = 2;
    kRomanUpperDecimal = 3;
    kRomanUpperDoubleParen = 4;
    kRomanUpperRightParen = 5;
    kRomanLowerDecimal = 6;
    kRomanLowerDoubleParen = 7;
    kRomanLowerRightParen = 8;
    kAlphaUpperDecimal = 9;
    kAlphaUpperDoubleParen = 10;
    kAlphaUpperRightParen = 11;
    kAlphaLowerDecimal = 12;
    kAlphaLowerDoubleParen = 13;
    kAlphaLowerRightParen = 14;
    kIdeographicJapaneseDecimalKind = 15;
    kIdeographicJapaneseDoubleParenKind = 16;
    kIdeographicJapaneseRightParenKind = 17;
    kHiraganaDecimalKind = 18;
    kHiraganaDoubleParenKind = 19;
    kHiraganaRightParenKind = 20;
    kKatakanaDecimalKind = 21;
    kKatakanaDoubleParenKind = 22;
    kKatakanaRightParenKind = 23;
    kHiraganaIrohaDecimalKind = 24;
    kHiraganaIrohaDoubleParenKind = 25;
    kHiraganaIrohaRightParenKind = 26;
    kKatakanaIrohaDecimalKind = 27;
    kKatakanaIrohaDoubleParenKind = 28;
    kKatakanaIrohaRightParenKind = 29;
    kIdeographicSimplifiedChineseDecimalKind = 30;
    kIdeographicSimplifiedChineseDoubleParenKind = 31;
    kIdeographicSimplifiedChineseRightParenKind = 32;
    kIdeographicTraditionalChineseDecimalKind = 33;
    kIdeographicTraditionalChineseDoubleParenKind = 34;
    kIdeographicTraditionalChineseRightParenKind = 35;
    kIdeographicFormalJapaneseDecimalKind = 36;
    kIdeographicFormalJapaneseDoubleParenKind = 37;
    kIdeographicFormalJapaneseRightParenKind = 38;
    kIdeographicFormalSimplifiedChineseDecimalKind = 39;
    kIdeographicFormalSimplifiedChineseDoubleParenKind = 40;
    kIdeographicFormalSimplifiedChineseRightParenKind = 41;
    kIdeographicFormalTraditionalChineseDecimalKind = 42;
    kIdeographicFormalTraditionalChineseDoubleParenKind = 43;
    kIdeographicFormalTraditionalChineseRightParenKind = 44;
    kKoreanAlphabetDecimalKind = 45;
    kKoreanAlphabetDoubleParenKind = 46;
    kKoreanAlphabetRightParenKind = 47;
    kCircledNumberKind = 48;
    kArabianNumericDecimalKind = 49;
    kArabianNumericDoubleParenKind = 50;
    kArabianNumericRightParenKind = 51;
    kArabianAlphaDecimalKind = 52;
    kArabianAlphaDoubleParenKind = 53;
    kArabianAlphaRightParenKind = 54;
    kArabianAbjadDecimalKind = 55;
    kArabianAbjadDoubleParenKind = 56;
    kArabianAbjadRightParenKind = 57;
    kHebrewAlphaDecimalKind = 58;
    kHebrewAlphaDoubleParenKind = 59;
    kHebrewAlphaRightParenKind = 60;
    kHebrewBiblicalStandardKind = 61;
    kHebrewBiblicalDecimalKind = 62;
    kHebrewBiblicalDoubleParenKind = 63;
    kHebrewBiblicalRightParenKind = 64;
  }
  message LabelGeometry {
    optional float scale = 1 [default = 1];
    optional float baseline_offset = 2 [default = 0];
    optional bool scale_with_text = 3 [default = true];
  }

  message LabelImage {
    optional .TSP.DataReference image = 3;
    optional bool image_null = 2;
    optional .TSP.Reference database_image = 1;
  }

  required .TSS.StyleArchive super = 1;
  optional uint32 override_count = 10 [default = 0];
  repeated .TSWP.ListStyleArchive.LabelType label_types = 11;
  repeated float text_indents = 12;
  repeated float indents = 13;
  repeated .TSWP.ListStyleArchive.LabelGeometry geometries = 14;
  repeated .TSWP.ListStyleArchive.NumberType number_types = 15;
  repeated string strings = 16;
  repeated .TSWP.ListStyleArchive.LabelImage images = 17;
  optional bool shadow_null = 18;
  optional .TSD.ShadowArchive shadow = 19;
  optional bool font_color_null = 20;
  optional .TSP.Color font_color = 21;
  optional bool font_name_null = 22;
  optional string font_name = 23;
  optional .TSWP.WritingDirectionType writing_direction = 24 [default = kWritingDirectionNatural];
  repeated bool tiered_numbers = 25;
}
```

```proto
message ColumnStyleArchive {
  required .TSS.StyleArchive super = 1;
  optional uint32 override_count = 10 [default = 0];
  optional .TSWP.ColumnStylePropertiesArchive column_properties = 11;
}
```


`CharacterStylePropertiesArchive` — every character-format property (the
`*_null` booleans mark an explicit "property cleared here" override, distinct
from "property not set"). 2013 vs current: fields 1-39 identical; current adds
`is_named_point_size = 40`, `capitalization_uses_linguistics = 41`,
`tate_chu_yoko = 42`, `tsd_stroke_null = 43`, `tsd_stroke = 44`,
`tsd_fill_null = 45`, `tsd_fill = 46`,
`tsd_fill_should_fill_text_container = 47`.

```proto
message CharacterStylePropertiesArchive {
  enum CapitalizationType {
    kNoCaps = 0;
    kAllCaps = 1;
    kSmallCaps = 2;
    kTitled = 3;
  }
  enum UnderlineType {
    kNoUnderline = 0;
    kSingleUnderline = 1;
    kDoubleUnderline = 2;
    kWavyUnderline = 3;
  }
  enum LigaturesType {
    kRequiredLigatures = 0;
    kStandardLigatures = 1;
    kAllLigatures = 2;
  }
  enum StrikethruType {
    kNoStrikethru = 0;
    kSingleStrikethru = 1;
    kDoubleStrikethru = 2;
    kTripleStrikethru = 3;
  }
  enum SuperscriptType {
    kNoScript = 0;
    kSuperscript = 1;
    kSubscript = 2;
  }
  optional bool bold = 1;
  optional bool italic = 2;
  optional float font_size = 3;
  optional bool font_name_null = 4;
  optional string font_name = 5;
  optional bool font_color_null = 6;
  optional .TSP.Color font_color = 7;
  optional bool language_null = 8;
  optional string language = 9;
  optional .TSWP.CharacterStylePropertiesArchive.SuperscriptType superscript = 10;
  optional .TSWP.CharacterStylePropertiesArchive.UnderlineType underline = 11;
  optional .TSWP.CharacterStylePropertiesArchive.StrikethruType strikethru = 12;
  optional .TSWP.CharacterStylePropertiesArchive.CapitalizationType capitalization = 13;
  optional float baseline_shift = 14;
  optional float kerning = 15;
  optional .TSWP.CharacterStylePropertiesArchive.LigaturesType ligatures = 16;
  optional bool outline_color_null = 17;
  optional .TSP.Color outline_color = 18;
  optional float outline = 19;
  optional bool shadow_null = 20;
  optional .TSD.ShadowArchive shadow = 21;
  optional bool strikethru_color_null = 22;
  optional .TSP.Color strikethru_color = 23;
  optional float strikethru_width = 24;
  optional bool background_color_null = 25;
  optional .TSP.Color background_color = 26;
  optional float tracking = 27;
  optional bool underline_color_null = 28;
  optional .TSP.Color underline_color = 29;
  optional float underline_width = 30;
  optional bool word_strikethru = 31;
  optional bool word_underline = 32;
  optional bool font_features_null = 33;
  repeated .TSWP.FontFeatureArchive font_features = 34;
  optional .TSWP.WritingDirectionType writing_direction = 35 [default = kWritingDirectionNatural];
  optional bool emphasis_marks_null = 36;
  optional string emphasis_marks = 37;
  optional bool compatibility_font_name_null = 38;
  optional string compatibility_font_name = 39;
  optional bool is_named_point_size = 40;
  optional bool capitalization_uses_linguistics = 41;
  optional bool tate_chu_yoko = 42;
  optional bool tsd_stroke_null = 43;
  optional .TSD.StrokeArchive tsd_stroke = 44;
  optional bool tsd_fill_null = 45;
  optional .TSD.FillArchive tsd_fill = 46;
  optional bool tsd_fill_should_fill_text_container = 47;
}
```


`ParagraphStylePropertiesArchive` — alignment, spacing, indents, tabs,
borders, keep rules. 2013 vs current: same field numbers throughout; renames:
enum `ParagraphBorderType` → `DeprecatedParagraphBorderType` (current adds
values `PBTvalue5..15 = 8..26`), field 15 `borders` → `deprecated_borders`,
16/17 `rule_offset_null`/`rule_offset` →
`historical_rule_offset_null`/`historical_rule_offset`. Current adds
`show_in_bookmarks_list = 43`, `show_in_toc_navigator = 44`,
`border_positions = 45`, `rounded_corners = 46`.

```proto
message ParagraphStylePropertiesArchive {
  enum TextAlignmentType {
    TATvalue0 = 0;
    TATvalue1 = 1;
    TATvalue2 = 2;
    TATvalue3 = 3;
    TATvalue4 = 4;
  }
  enum DeprecatedParagraphBorderType {
    PBTvalue0 = 0;
    PBTvalue1 = 1;
    PBTvalue2 = 2;
    PBTvalue3 = 3;
    PBTvalue4 = 4;
    PBTvalue5 = 8;
    PBTvalue6 = 9;
    PBTvalue7 = 10;
    PBTvalue8 = 11;
    PBTvalue9 = 16;
    PBTvalue10 = 17;
    PBTvalue11 = 18;
    PBTvalue12 = 19;
    PBTvalue13 = 24;
    PBTvalue14 = 25;
    PBTvalue15 = 26;
  }
  enum OutlineStyleType {
    OSTvalue0 = 0;
    OSTvalue1 = 1;
    OSTvalue2 = 2;
  }
  optional .TSWP.ParagraphStylePropertiesArchive.TextAlignmentType alignment = 1;
  optional bool decimal_tab_null = 2;
  optional string decimal_tab = 3;
  optional float default_tab_stops = 4;
  optional bool fill_null = 5;
  optional .TSP.Color fill = 6;
  optional float first_line_indent = 7;
  optional bool hyphenate = 8;
  optional bool keep_lines_together = 9;
  optional bool keep_with_next = 10;
  optional float left_indent = 11;
  optional bool line_spacing_null = 12;
  optional .TSWP.LineSpacingArchive line_spacing = 13;
  optional bool page_break_before = 14;
  optional .TSWP.ParagraphStylePropertiesArchive.DeprecatedParagraphBorderType deprecated_borders = 15;
  optional bool historical_rule_offset_null = 16;
  optional .TSP.Point historical_rule_offset = 17;
  optional float rule_width = 18;
  optional float right_indent = 19;
  optional float space_after = 20;
  optional float space_before = 21;
  optional bool tabs_null = 24;
  optional .TSWP.TabsArchive tabs = 25;
  optional bool widow_control = 26;
  optional uint32 outline_level = 27;
  optional .TSWP.ParagraphStylePropertiesArchive.OutlineStyleType outline_style = 28;
  optional bool following_style_id_null = 29;
  optional string following_style_id = 30;
  optional bool stroke_null = 31;
  optional .TSD.StrokeArchive stroke = 32;
  optional bool show_in_toc = 33;
  optional bool toc_style_id_null = 34;
  optional string toc_style_id = 35;
  optional .TSWP.WritingDirectionType writing_direction = 38 [default = kWritingDirectionNatural];
  optional bool list_style_null = 39;
  optional .TSP.Reference list_style = 40;
  optional bool following_style_null = 41;
  optional .TSP.Reference following_style = 42;
  optional bool show_in_bookmarks_list = 43;
  optional bool show_in_toc_navigator = 44;
  optional int32 border_positions = 45;
  optional bool rounded_corners = 46;
}
```


Supporting property messages — all identical to 2013 (`FontFeatureArchive`,
`TabArchive`, `TabsArchive`, `LineSpacingArchive`). There is no
`FontDescriptor` message in either dump; font selection is by PostScript name
(`font_name`) plus `FontFeatureArchive` entries.

```proto
message FontFeatureArchive {
  required uint32 feature_type = 1;
  required uint32 feature_selector = 2;
}
```

```proto
message TabArchive {
  enum TabAlignmentType {
    kTabAlignmentLeft = 0;
    kTabAlignmentCenter = 1;
    kTabAlignmentRight = 2;
    kTabAlignmentDecimal = 3;
  }
  optional float position = 1;
  optional .TSWP.TabArchive.TabAlignmentType alignment = 2;
  optional string leader = 3;
}
```

```proto
message TabsArchive {
  repeated .TSWP.TabArchive tabs = 1;
}
```

```proto
message LineSpacingArchive {
  enum LineSpacingModeType {
    kRelativeLineSpacing = 0;
    kMinimumLineSpacing = 1;
    kExactLineSpacing = 2;
    kMaximumLineSpacing = 3;
    kSpaceBetweenLineSpacing = 4;
  }
  optional .TSWP.LineSpacingArchive.LineSpacingModeType mode = 1;
  optional float amount = 2;
  optional float baselineRule = 3;
}
```


Column/layout properties (referenced by `ColumnStyleArchive`):

```proto
message ColumnsArchive {
  message EqualColumnsArchive {
    optional uint32 count = 1;
    optional float gap = 2;
  }

  message NonEqualColumnsArchive {
    message GapWidthArchive {
      required float gap = 1;
      required float width = 2;
    }

    required float first = 1;
    repeated .TSWP.ColumnsArchive.NonEqualColumnsArchive.GapWidthArchive following = 2;
  }

  optional .TSWP.ColumnsArchive.EqualColumnsArchive equal_columns = 1;
  optional .TSWP.ColumnsArchive.NonEqualColumnsArchive non_equal_columns = 2;
}
```

```proto
message PaddingArchive {
  optional float left = 1;
  optional float top = 2;
  optional float right = 3;
  optional float bottom = 4;
}
```

```proto
message ColumnStylePropertiesArchive {
  enum VerticalAlignmentType {
    kFrameAlignTop = 0;
    kFrameAlignMiddle = 1;
    kFrameAlignBottom = 2;
    kFrameAlignJustify = 3;
  }
  optional bool continuous = 1;
  optional bool shrink_to_fit = 2;
  optional bool vertical_text = 3;
  optional float min_horizontal_inset = 4;
  optional .TSWP.ColumnStylePropertiesArchive.VerticalAlignmentType vertical_alignment = 5;
  optional bool columns_null = 6;
  optional .TSWP.ColumnsArchive columns = 7;
  optional bool margins_null = 8;
  optional .TSWP.PaddingArchive margins = 9;
  optional bool padding_null = 10;
  optional .TSWP.PaddingArchive padding = 11;
  optional .TSWP.WritingDirectionType writing_direction = 12 [default = kWritingDirectionNatural];
}
```


---

## 5. Styles & stylesheets — `TSSArchives.proto` (current)

Source: `proto/current/TSSArchives.proto` (masaccio/numbers-parser @ 2dd9dbe3f8f3440bbd19e23668d5ade72a2e1629, `src/protos/`).

`StyleArchive` is the base embedded as `super` in every concrete style. Note:
`override_count` is NOT here — it sits on each concrete style archive at
field 10 (see section 4). Identical to 2013.

```proto
message StyleArchive {
  optional string name = 1;
  optional string style_identifier = 2;
  optional .TSP.Reference parent = 3;
  optional bool is_variation = 4 [default = false];
  optional .TSP.Reference stylesheet = 5;
}
```


`StylesheetArchive` — 2013 vs current: fields 1-6 identical (styles list,
`identifier_to_style_map`, `parent` stylesheet ref, `is_locked`,
`parent_to_children_style_map`, `can_cull_styles`); current adds the nested
`VersionedStyles` message and `styles_for_10_0 = 7` ... `styles_for_14_4 = 22`
(per-file-format-version style snapshots for collaboration compatibility).

```proto
message StylesheetArchive {
  message IdentifiedStyleEntry {
    required string identifier = 1;
    required .TSP.Reference style = 2;
  }

  message StyleChildrenEntry {
    required .TSP.Reference parent = 1;
    repeated .TSP.Reference children = 2;
  }

  message VersionedStyles {
    repeated .TSP.Reference styles = 1;
    repeated .TSS.StylesheetArchive.IdentifiedStyleEntry identifier_to_style_map = 2;
    repeated .TSS.StylesheetArchive.StyleChildrenEntry parent_to_children_style_map = 3;
  }

  repeated .TSP.Reference styles = 1;
  repeated .TSS.StylesheetArchive.IdentifiedStyleEntry identifier_to_style_map = 2;
  optional .TSP.Reference parent = 3;
  optional bool is_locked = 4 [default = true];
  repeated .TSS.StylesheetArchive.StyleChildrenEntry parent_to_children_style_map = 5;
  optional bool can_cull_styles = 6 [default = false];
  optional .TSS.StylesheetArchive.VersionedStyles styles_for_10_0 = 7;
  optional .TSS.StylesheetArchive.VersionedStyles styles_for_10_1 = 8;
  optional .TSS.StylesheetArchive.VersionedStyles styles_for_10_2 = 9;
  optional .TSS.StylesheetArchive.VersionedStyles styles_for_11_0 = 10;
  optional .TSS.StylesheetArchive.VersionedStyles styles_for_11_1 = 11;
  optional .TSS.StylesheetArchive.VersionedStyles styles_for_11_2 = 12;
  optional .TSS.StylesheetArchive.VersionedStyles styles_for_12_0 = 13;
  optional .TSS.StylesheetArchive.VersionedStyles styles_for_12_1 = 14;
  optional .TSS.StylesheetArchive.VersionedStyles styles_for_12_2 = 15;
  optional .TSS.StylesheetArchive.VersionedStyles styles_for_13_0 = 16;
  optional .TSS.StylesheetArchive.VersionedStyles styles_for_13_1 = 17;
  optional .TSS.StylesheetArchive.VersionedStyles styles_for_13_2 = 18;
  optional .TSS.StylesheetArchive.VersionedStyles styles_for_14_0 = 19;
  optional .TSS.StylesheetArchive.VersionedStyles styles_for_14_1 = 20;
  optional .TSS.StylesheetArchive.VersionedStyles styles_for_14_2 = 21;
  optional .TSS.StylesheetArchive.VersionedStyles styles_for_14_4 = 22;
}
```


`ThemeArchive` — 2013 vs current: field 1 renamed
`stylesheet` → `legacy_stylesheet` (same number); `theme_identifier = 3` and
`color_presets = 10` unchanged; current adds `document_stylesheet = 4`,
`old/new_uuids_for_preset_replacements = 5/6`. Extension range 100+ is where
app-specific theme payloads (e.g. `TSA.ThemePresetsArchive` extensions) hook
in.

```proto
message ThemeArchive {
  optional .TSP.Reference legacy_stylesheet = 1;
  optional string theme_identifier = 3;
  optional .TSP.Reference document_stylesheet = 4;
  repeated .TSP.UUID old_uuids_for_preset_replacements = 5;
  repeated .TSP.UUID new_uuids_for_preset_replacements = 6;
  repeated .TSP.Color color_presets = 10;
  extensions 100 to 536870911;
}
```


---

## 6. Document-level archives — `TSK`/`TSA` (current)

Source: `proto/current/TSKArchives.proto`, `proto/current/TSAArchives.proto`
(masaccio/numbers-parser @ 2dd9dbe3f8f3440bbd19e23668d5ade72a2e1629, `src/protos/`).

`TSK.DocumentArchive` — 2013 had only `locale_identifier = 4` and
`annotation_author_storage = 7`; both unchanged in current, which adds fields
8-18 & 199: `activity_log_entries = 8`,
`creation_locale_identifier = 9`, `prevent_image_conversion_on_open = 10`,
`has_floating_locale = 11`, `has_user_defined_locale = 12`,
`collaboration_operation_history = 14`,
`should_measure_negatively_tracked_text_correctly = 15`,
`use_optimized_text_vertical_alignment = 16`, `formatting_symbols = 17`,
`should_allow_ligatures_in_minimally_tracked_text = 18`,
`activity_stream = 199`.

```proto
message DocumentArchive {
  optional string locale_identifier = 4;
  optional .TSP.Reference annotation_author_storage = 7;
  repeated .TSP.Reference activity_log_entries = 8;
  optional string creation_locale_identifier = 9;
  optional bool prevent_image_conversion_on_open = 10;
  optional bool has_floating_locale = 11;
  optional bool has_user_defined_locale = 12;
  optional .TSP.Reference collaboration_operation_history = 14;
  optional bool should_measure_negatively_tracked_text_correctly = 15;
  optional bool use_optimized_text_vertical_alignment = 16;
  optional bool should_allow_ligatures_in_minimally_tracked_text = 18;
  optional .TSK.FormattingSymbolsArchive formatting_symbols = 17;
  optional .TSP.Reference activity_stream = 199;
}
```


`TSA.DocumentArchive` — the app-framework document layer that `TP.DocumentArchive`
embeds as `super`. 2013 vs current: same numbers 1-9; renames
`creation_language` → `document_language` (3) and
`needs_movie_compatibility_upgrade` → `needs_media_compatibility_upgrade` (8);
current adds fields 10-16 (`shortcut_controller`,
`annotation_cache_deprecated`, `custom_format_list`,
`annotation_cache_deprecated_2`,
`collaborative_media_compatibility_upgrade_did_fail`, `can_use_hevc`,
`is_content_source`).

```proto
message DocumentArchive {
  required .TSK.DocumentArchive super = 1;
  repeated .TSWP.TextPresetDisplayItemArchive text_preset_display_items = 2;
  optional string document_language = 3;
  optional .TSP.Reference calculation_engine = 4;
  optional .TSP.Reference view_state = 5;
  optional .TSP.Reference function_browser_state = 6;
  optional .TSP.Reference tables_custom_format_list = 7;
  optional bool needs_media_compatibility_upgrade = 8;
  optional string template_identifier = 9;
  optional .TSP.Reference shortcut_controller = 10;
  optional .TSP.Reference annotation_cache_deprecated = 11;
  optional .TSP.Reference custom_format_list = 12;
  optional .TSP.Reference annotation_cache_deprecated_2 = 13;
  optional bool collaborative_media_compatibility_upgrade_did_fail = 14;
  optional bool can_use_hevc = 15;
  optional bool is_content_source = 16;
}
```


---

## 7. Pages-specific archives — `TP*` (2013 only)

Source: `proto/pages-2013/TPArchives.proto` (obriensp/iWorkFileFormat @ 8575e441beaaaa56f480fdd91721f5bb06d07d43, `iWorkFileInspector/iWorkFileInspector/Messages/Proto/`). **These are iWork '13
(Pages 5.0) schemas — the only public Pages dump.** Modern Pages has certainly
appended fields; unknown fields must be preserved when round-tripping. Field
numbers shown here are confirmed-valid for reading modern files where the
fields still exist.

`TP.DocumentArchive` — the root object of `Index/Document.iwa` in a `.pages`
package. Wiring: `super = 15` embeds `TSA.DocumentArchive` (section 6);
`stylesheet = 2` → `TSS.StylesheetArchive`; `body_storage = 4` →
`TSWP.StorageArchive` (kind BODY, section 3); `section = 5` →
`TP.SectionArchive`; `theme = 6` → `TP.ThemeArchive`; `settings = 7` →
`TP.SettingsArchive`; `floating_drawables = 3` →
`TP.FloatingDrawablesArchive`; `drawables_zorder = 20` →
`TP.DrawablesZOrderArchive`. Page geometry (size, margins, header/footer
margins, orientation) lives directly on this message (fields 30-44).

```proto
message DocumentArchive {
  required .TSA.DocumentArchive super = 15;
  optional .TSP.Reference stylesheet = 2;
  optional .TSP.Reference floating_drawables = 3;
  optional .TSP.Reference body_storage = 4;
  optional .TSP.Reference section = 5;
  optional .TSP.Reference theme = 6;
  optional .TSP.Reference settings = 7;
  optional .TSP.Reference deprecated_layout_state = 11;
  optional .TSP.Reference deprecated_view_state = 12;
  repeated .TSP.Reference citation_records = 13;
  repeated .TSP.Reference toc_styles = 14;
  repeated .TSP.Reference change_sessions = 16;
  optional .TSP.Reference drawables_zorder = 20;
  optional bool uses_single_header_footer = 21;
  optional float page_width = 30;
  optional float page_height = 31;
  optional float left_margin = 32;
  optional float right_margin = 33;
  optional float top_margin = 34;
  optional float bottom_margin = 35;
  optional float header_margin = 36;
  optional float footer_margin = 37;
  optional float page_scale = 38;
  optional bool layout_body_vertically = 39;
  optional bool change_tracking_enabled = 40;
  optional .TSP.Reference tables_custom_format_list = 41;
  optional uint32 orientation = 42 [default = 0];
  optional string printer_id = 43;
  optional string paper_id = 44;
  optional bool change_tracking_paused = 45;
}
```

```proto
message ThemeArchive {
  required .TSS.ThemeArchive super = 1;
}
```


`TP.SettingsArchive` — document settings incl. footnote configuration,
hyphenation, ligatures, change tracking view state, RTL:

```proto
message SettingsArchive {
  enum FootnoteKind {
    kFootnoteKindFootnotes = 0;
    kFootnoteKindDocumentEndnotes = 1;
    kFootnoteKindSectionEndnotes = 2;
  }
  enum FootnoteFormat {
    kFootnoteFormatNumeric = 0;
    kFootnoteFormatRoman = 1;
    kFootnoteFormatSymbolic = 2;
    kFootnoteFormatJapaneseNumeric = 3;
    kFootnoteFormatJapaneseIdeographic = 4;
  }
  enum FootnoteNumbering {
    kFootnoteNumberingContinuous = 0;
    kFootnoteNumberingRestartEachPage = 1;
    kFootnoteNumberingRestartEachSection = 2;
  }
  optional bool body = 1 [default = true];
  optional bool headers = 2 [default = true];
  optional bool footers = 3 [default = true];
  optional bool preview = 4 [default = true];
  optional bool copy_movies = 5 [default = true];
  optional bool copy_assets = 6 [default = true];
  optional bool placeholder_authoring = 7 [default = false];
  optional bool links_enabled = 8 [default = true];
  optional bool hyphenation = 9 [default = false];
  optional bool use_ligatures = 10 [default = false];
  optional bool toc_links_enabled = 11 [default = false];
  optional bool show_ct_markup = 12 [default = true];
  optional bool show_ct_deletions = 13 [default = true];
  optional int32 ct_bubbles_visibility = 14;
  optional bool change_bars_visible = 15 [default = true];
  optional bool format_changes_visible = 16 [default = true];
  optional bool annotations_visible = 17 [default = true];
  optional bool document_is_rtl = 18 [default = false];
  optional string decimal_tab = 20;
  optional string language = 21;
  optional string hyphenation_language = 22;
  optional string creation_locale = 23;
  optional string last_locale = 24;
  optional string orig_template = 25;
  optional string creation_date = 26;
  optional string bibliography_format = 27;
  optional .TP.SettingsArchive.FootnoteKind footnote_kind = 30;
  optional .TP.SettingsArchive.FootnoteFormat footnote_format = 31;
  optional .TP.SettingsArchive.FootnoteNumbering footnote_numbering = 32;
  optional int32 footnote_gap = 33;
  optional bool section_authoring = 40 [default = false];
}
```


Sections and page masters. There is no `TP.HeaderStorage` message: headers and
footers are ordinary `TSWP.StorageArchive` objects (kind HEADER/FOOTNOTE
family) referenced from `TP.PageMasterArchive.headers/footers`; a
`PageMasterArchive` is referenced per-variant from `TP.SectionArchive`
(`first_page_master`/`even_page_master`/`odd_page_master`). Additional
sections appear as entries in the body `StorageArchive.table_section` (each
entry's `object` → a `TP.SectionArchive`). The `OBSOLETE_*` fields are
pre-5.0 leftovers — do not write them.

```proto
message SectionArchive {
  optional bool OBSOLETE_shows_header = 1;
  optional bool OBSOLETE_shows_footer = 2;
  repeated .TSP.Reference OBSOLETE_headers = 3;
  repeated .TSP.Reference OBSOLETE_footers = 4;
  optional float OBSOLETE_left_margin = 5;
  optional float OBSOLETE_right_margin = 6;
  optional float OBSOLETE_top_margin = 7;
  optional float OBSOLETE_bottom_margin = 8;
  optional float OBSOLETE_header_padding = 9;
  optional float OBSOLETE_footer_padding = 10;
  optional float OBSOLETE_paper_width = 11;
  optional float OBSOLETE_paper_height = 12;
  optional bool OBSOLETE_landscape_mode = 13;
  repeated .TSP.Reference OBSOLETE_master_drawables = 14;
  optional float OBSOLETE_header_margin = 15;
  optional float OBSOLETE_footer_margin = 16;
  optional bool inherit_previous_header_footer = 17;
  optional bool page_master_first_page_different = 18;
  optional bool page_master_even_odd_pages_different = 19;
  optional uint32 section_start_kind = 20;
  optional uint32 section_page_number_kind = 21;
  optional uint32 section_page_number_start = 22;
  optional .TSP.Reference first_page_master = 23;
  optional .TSP.Reference even_page_master = 24;
  optional .TSP.Reference odd_page_master = 25;
  optional string name = 26;
  optional bool page_master_first_page_hides_header_footer = 28;
}
```

```proto
message PageMasterArchive {
  repeated .TSP.Reference headers = 1;
  repeated .TSP.Reference footers = 2;
  repeated .TSP.Reference master_drawables = 3;
}
```


Floating (non-inline) drawables per page, and global z-order:

```proto
message FloatingDrawablesArchive {
  message DrawableEntry {
    optional .TSP.Reference drawable = 1;
  }
  message PageGroup {
    required uint32 page_index = 1;
    repeated .TP.FloatingDrawablesArchive.DrawableEntry background_drawables = 2;
    repeated .TP.FloatingDrawablesArchive.DrawableEntry foreground_drawables = 3;
    repeated .TP.FloatingDrawablesArchive.DrawableEntry drawables = 4;
  }
  repeated .TP.FloatingDrawablesArchive.PageGroup page_groups = 1;
}
```

```proto
message DrawablesZOrderArchive {
  repeated .TSP.Reference drawables = 1;
}
```

```proto
message PlaceholderArchive {
  required .TSWP.ShapeInfoArchive super = 1;
}
```


---

## 8. Drawables — `TSDArchives.proto` (current)

Source: `proto/current/TSDArchives.proto` (masaccio/numbers-parser @ 2dd9dbe3f8f3440bbd19e23668d5ade72a2e1629, `src/protos/`).

`GeometryArchive` — identical to 2013. Angle in radians; flags bit-packed
per the booleans.

```proto
message GeometryArchive {
  optional .TSP.Point position = 1;
  optional .TSP.Size size = 2;
  optional uint32 flags = 3;
  optional float angle = 4;
}
```


`DrawableArchive` — base of every canvas object (embedded as `super` chains:
`TSD.ShapeArchive.super` → `TSD.DrawableArchive`;
`TSWP.ShapeInfoArchive.super` → `TSD.ShapeArchive` for text boxes). 2013 vs
current: fields 1-8 unchanged; current adds `pencil_annotations = 9`,
`title = 10`, `caption = 11`, `title_hidden = 12`, `caption_hidden = 13`.

```proto
message DrawableArchive {
  optional .TSD.GeometryArchive geometry = 1;
  optional .TSP.Reference parent = 2;
  optional .TSD.ExteriorTextWrapArchive exterior_text_wrap = 3;
  optional string hyperlink_url = 4;
  optional bool locked = 5;
  optional .TSP.Reference comment = 6;
  optional bool aspect_ratio_locked = 7;
  optional string accessibility_description = 8;
  repeated .TSP.Reference pencil_annotations = 9;
  optional .TSP.Reference title = 10;
  optional .TSP.Reference caption = 11;
  optional bool title_hidden = 12;
  optional bool caption_hidden = 13;
}
```


`ShapeArchive` — 2013 vs current: same numbers; `head_line_end = 4` /
`tail_line_end = 5` now `[deprecated = true]`; current adds
`strokePatternOffsetDistance = 6`.

```proto
message ShapeArchive {
  required .TSD.DrawableArchive super = 1;
  optional .TSP.Reference style = 2;
  optional .TSD.PathSourceArchive pathsource = 3;
  optional .TSD.LineEndArchive head_line_end = 4 [deprecated = true];
  optional .TSD.LineEndArchive tail_line_end = 5 [deprecated = true];
  optional float strokePatternOffsetDistance = 6;
}
```


---

## Appendix: minimal object graph for a `.pages` body-text read

```
Index/Metadata.iwa    TSP.PackageMetadata
                        └─ components[] : TSP.ComponentInfo (one per .iwa)
Index/Document.iwa    TP.DocumentArchive
                        ├─ super(15) ────────────► TSA.DocumentArchive ─ super(1) ─► TSK.DocumentArchive
                        ├─ body_storage(4) ──────► TSWP.StorageArchive (kind=BODY)
                        │    ├─ style_sheet(2) ──► TSS.StylesheetArchive
                        │    ├─ text(3)           "…\n…\n"  (U+FFFC = attachment)
                        │    ├─ table_para_style(5)  ─► TSWP.ParagraphStyleArchive ─ super ─► TSS.StyleArchive
                        │    │                                └─ char_properties(11)/para_properties(12)
                        │    ├─ table_char_style(8)  ─► TSWP.CharacterStyleArchive ─► CharacterStylePropertiesArchive
                        │    ├─ table_list_style(7)  ─► TSWP.ListStyleArchive
                        │    ├─ table_attachment(9)  ─► TSWP.DrawableAttachmentArchive ─ drawable ─► TSD.* / TSWP.ShapeInfoArchive
                        │    ├─ table_smartfield(11) ─► TSWP.HyperlinkFieldArchive …
                        │    └─ table_section(17)    ─► TP.SectionArchive ─► TP.PageMasterArchive ─► header/footer TSWP.StorageArchive
                        ├─ stylesheet(2) ────────► TSS.StylesheetArchive (document styles by identifier)
                        ├─ theme(6) ─────────────► TP.ThemeArchive ─ super ─► TSS.ThemeArchive
                        ├─ settings(7) ──────────► TP.SettingsArchive
                        ├─ floating_drawables(3) ► TP.FloatingDrawablesArchive ─► TSD.DrawableArchive…
                        └─ drawables_zorder(20) ─► TP.DrawablesZOrderArchive
```
