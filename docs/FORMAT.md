# The modern Apple iWork file format (IWA), reverse-engineered

This document specifies the file format used by Apple Pages, Numbers and
Keynote since 2013 ("iWork '13" through the current 2025/26 releases), at the
level of detail needed to **read and write** documents that the apps accept.
It is the specification behind the `iwork-files` TypeScript implementation in
this repository.

Sources: black-box analysis of real files (see `fixtures/`), the proto-dump
schema extractions under `proto/`, behavioral analysis of two
proven-in-production open-source writers (`keynote-parser`, `numbers-parser`),
and a 2026 live dump of the apps' type registries. Line-level citations for
every load-bearing claim are collected in `research/format-invariants.md`.

Notation: `Message.field = N` gives protobuf field numbers. All multi-byte
integers are little-endian unless noted. "The apps" = Pages, Numbers and
Keynote for macOS/iOS/iCloud.

---

## 1. Format generations

| Generation | Container | Content encoding | This library |
|---|---|---|---|
| iWork '05–'09 | `.pages/.numbers/.key` bundle or zip | gzipped XML (`index.xml.gz`) | detected, rejected with a clear error |
| iWork '13+ (**IWA**) | zip / bundle, see §2 | Snappy-compressed protobuf streams (`.iwa`) | full support |

The IWA generation has been structurally stable from 2013 through today:
Apple evolves it by **adding** protobuf fields and type IDs, never by
reusing or reshaping existing ones (verified by diffing the 2013 and 14.4
schema dumps: every shared field number is unchanged; changes are additions
plus a handful of renames). Version markers moved from "5.x" to year-based
"26.x" in 2025 with no structural change.

## 2. Package container

A modern iWork document is one of three shapes (all produced by current
apps depending on save options; all must be supported):

```
1. flat zip                    2. nested zip                 3. directory bundle
   Index/Document.iwa             Index.zip ─┐                  (same as 1 or 2 but
   Index/Metadata.iwa               └─ Index/*.iwa               as a folder on disk)
   Index/…                        Metadata/…
   Metadata/Properties.plist      Data/…
   Data/…                         preview.jpg
   preview.jpg
```

Either shape may additionally be wrapped in a single top-level directory
inside the zip (e.g. `Project Proposal.pages/…`) — produced when a bundle
directory is zipped. Detect by finding the common leading path component.

Notes:

- Zip entries may be STORED or DEFLATEd (Apple uses STORED; third-party
  zips of bundles often deflate). Read via the central directory (local
  headers can carry zero sizes + data descriptors). Writers should emit
  STORED — every `.iwa` is already compressed.
- `Metadata/Properties.plist` — **binary plist**; keys include
  `fileFormatVersion` (e.g. `"14.1.1"`), `documentUUID`, `versionUUID`,
  `revision`, `isMultiPage`, `stableDocumentUUID`, `shareUUID`.
- `Metadata/DocumentIdentifier` — bare UUID text (equals `documentUUID`).
- `Metadata/BuildVersionHistory.plist` — XML plist array of build strings,
  e.g. `Template: Blank (2014-07-09 11:15)`, `M5.5.3-2152-2`.
- `Data/` — media referenced by the document (images etc.), addressed by a
  **separate identifier space** (see §5.4).
- `preview*.jpg` — QuickLook previews; optional, opaque.
- **Writers must pass every non-`.iwa` file through byte-identical.** The
  apps regenerate previews and metadata themselves; third-party rewriting
  of these files is neither needed nor safe.
- A **password-protected** document contains an `.iwph` entry (iWork
  protection header); the whole package is then encrypted and unreadable
  without the password. Detect and refuse.

## 3. `.iwa` files: Snappy chunk framing

Every `Index/*.iwa` file is a sequence of chunks:

```
offset 0: 01 byte  chunk type      — always 0x00
          03 bytes payload length  — 24-bit little-endian, length of the
                                     compressed payload that follows
          N bytes  payload         — one raw Snappy block
(repeat until end of file)
```

This is **not** the standard Snappy framing format: there is no `sNaPpY`
stream identifier and no CRC-32C anywhere. Each payload is a standalone raw
Snappy block (its own uncompressed-length varint preamble + literal/copy
tags). Apple writes chunks of ≤ 64 KiB uncompressed; copy back-references
never cross chunk boundaries.

Decoding: decompress each chunk and **concatenate** — a protobuf archive may
straddle chunk boundaries. Encoding: split the archive stream at 64 KiB
boundaries and Snappy-compress each piece. (The apps tolerate chunks whose
payload fails Snappy decoding by treating them as stored-uncompressed;
writers never emit that.)

## 4. Archive streams: objects

The decompressed stream is a sequence of **archives** (= objects):

```
varint  L                    — byte length of the ArchiveInfo message
bytes   ArchiveInfo (L)      — TSP.ArchiveInfo
bytes   payload[0]           — message_infos[0].length bytes
bytes   payload[1]           — message_infos[1].length bytes
…
```

```proto
message ArchiveInfo {                    // TSPArchiveMessages.proto
  optional uint64 identifier = 1;        // document-unique object ID
  repeated MessageInfo message_infos = 2;
  optional bool should_merge = 3;
}
message MessageInfo {
  required uint32 type = 1;              // registry type ID (§6)
  repeated uint32 version = 2 [packed];  // e.g. [1,0,5]
  required uint32 length = 3;            // exact payload byte length
  repeated FieldInfo field_infos = 4;    // per-field compat rules (preserve!)
  repeated uint64 object_references = 5 [packed];  // all objects referenced (§5.2)
  repeated uint64 data_references = 6 [packed];    // all Data/ items referenced
  optional uint32 base_message_index = 7;          // patch base (below)
  repeated uint32 diff_merge_version = 8 [packed];
  optional FieldPath diff_field_path = 9;
  repeated FieldPath fields_to_remove = 10;
  repeated uint32 diff_read_version = 11 [packed];
}
```

Nearly every object has exactly one `MessageInfo`. Multi-info archives are
**patches**: an info with `type == 0` under `should_merge` is decoded using
`message_infos[base_message_index].type` and merged onto the base payload.
Writers never need to create these; readers should at minimum parse and
preserve them.

Payloads are ordinary proto2 messages. Object references inside payloads are
`TSP.Reference { required uint64 identifier = 1; }` submessages; media
references are `TSP.DataReference { required uint64 identifier = 1; }`.

## 5. The object graph

### 5.1 Components

Each `.iwa` file is a **component** — a unit of lazy loading. The special
component `Index/Metadata.iwa` holds a single object, **identifier 2**, of
type **11006 `TSP.PackageMetadata`**:

```proto
message PackageMetadata {
  required uint64 last_object_identifier = 1;   // high-water mark for object IDs
  optional DocumentRevision revision = 2;
  repeated ComponentInfo components = 3;        // one per component
  repeated DataInfo datas = 4;                  // one per Data/ file
  repeated uint32 read_version = 5 [packed];
  repeated uint32 write_version = 6 [packed];
  repeated uint32 file_format_version = 7 [packed];
  optional uint64 save_token = 8;
  optional PackageType preferred_package_type = 9;
  optional Reference data_metadata_map = 10;
  repeated ComponentInfo versioned_components = 11;
}
message ComponentInfo {
  required uint64 identifier = 1;         // == the component's root object ID
  required string preferred_locator = 2;  // "Document", "Tables/DataList"
  optional string locator = 3;            // set when != preferred ("Tables/DataList-5")
  repeated uint32 document_read_version = 4 [packed];
  repeated uint32 document_write_version = 5 [packed];
  repeated ComponentExternalReference external_references = 6;   // §5.3
  repeated ComponentDataReference data_references = 7;
  optional bool is_stored_outside_object_archive = 10;
  repeated ObjectUUIDMapEntry object_uuid_map_entries = 11;
  optional uint64 save_token = 12;
  repeated FeatureInfo feature_infos = 13;
  …
}
```

A component's file name is `Index/<locator>.iwa` (locator falls back to
`preferred_locator`). Typical Pages components: `Document`,
`DocumentStylesheet`, `ThemeStylesheet`, `Metadata`, `DocumentMetadata`,
`AnnotationAuthorStorage`, `ViewState`, `CalculationEngine`,
`Tables/DataList*`.

### 5.2 Object identifiers and references

Object IDs are unique across the whole document (all components). The
document root has a well-known ID/type per app: Pages `TP.DocumentArchive`
(type 10000), Numbers `TN.DocumentArchive` (1), Keynote `KN.DocumentArchive`
(1) — object identifier 1 in practice; `PackageMetadata` is always object 2.

**Load-bearing invariant:** each object's `MessageInfo.object_references`
must list every object ID its payload references (the apps use it for
dependency-ordered loading and GC). After editing a payload's references,
recompute the list from the message content. Same for `data_references` and
`Data/` items.

**ID allocation** (when creating objects): new IDs must exceed
`last_object_identifier`; write each allocation back to that field. This
library follows numbers-parser's proven scheme — round the current maximum
up to the next multiple of 1,000,000 and allocate upward from there.

### 5.3 Cross-component references

When an object in component A references an object X in component B, A's
`ComponentInfo.external_references` should contain
`ComponentExternalReference { component_identifier: B.identifier,
object_identifier: X }` (object_identifier omitted for a reference to the
component as a whole; `is_weak` for non-owning links). Apple maintains these
for incremental loading; writers adding cross-component references must
append the corresponding entries.

### 5.4 Data files

`PackageMetadata.datas` carries one `DataInfo` per `Data/` file:
`identifier` (a **separate** ID space from objects), `digest` (raw 20-byte
SHA-1 of the file contents), `preferred_file_name`/`file_name`,
`materialized_length`. Payload fields reference them via
`TSP.DataReference.identifier`, mirrored in `MessageInfo.data_references`.

## 6. The type registry

`MessageInfo.type` → protobuf message class, extracted from the apps'
`TSPRegistry`. The full tables (535 shared + per-app IDs, from a 2026 live
dump cross-checked against 14.4 parser dumps) are in
`research/type-registry.json` and compiled into `src/registry.ts`.

Ranges (shared families identical across all three apps):

| Range | Family | Highlights |
|---|---|---|
| 1–199 | app documents (KN/TN) | 1 = KN/TN.DocumentArchive |
| 200–299 | TSK | 200 TSK.DocumentArchive, commands |
| 400–419 | TSS | **401 StylesheetArchive**, 402 ThemeArchive |
| 600–642 | TSA | application layer |
| 2001–2413 | TSWP | **2001 StorageArchive**, 2021 CharacterStyleArchive, 2022 ParagraphStyleArchive, 2023 ListStyleArchive, 2024 ColumnStyleArchive |
| 3002–3098 | TSD | drawables, images, groups |
| 4000–4011 | TSCE | calculation engine |
| 5000–5157 | TSCH | charts |
| 6000–6384 | TST | tables (6000 TableInfo, 6001 TableModel, 6002 Tile) |
| 10000–10175 | **TP (Pages)** | 10000 DocumentArchive, 10011 SectionArchive, 10012 SettingsArchive, 10143 SectionTemplateArchive |
| 11000–11027 | TSP | **11006 PackageMetadata**, 11007 PasteboardMetadata |
| 12002–12059 | TN (Numbers) | sheets, forms |

The one genuinely app-divergent ID: **10011** is `TP.SectionArchive` in
Pages but `TSWP.SectionPlaceholderArchive` in Keynote/Numbers — resolve
app-specific tables before the shared one.

## 7. Text: `TSWP.StorageArchive` (type 2001)

One storage holds all text of one flow: the Pages body, one header/footer
box, one text box, one table cell, one footnote, one comment.

```proto
message StorageArchive {
  optional KindType kind = 1;            // BODY=0, HEADER=1, FOOTNOTE=2, TEXTBOX=3,
                                         // NOTE=4, CELL=5, UNCLASSIFIED=6, TOC=7
  optional TSP.Reference style_sheet = 2;
  repeated string text = 3;              // one element: the whole plain text
  optional bool has_itext = 4;
  optional bool in_document = 10;
  // attribute tables (all optional):
  //  5 table_para_style    ObjectAttributeTable → ParagraphStyleArchive
  //  6 table_para_data     ParaDataAttributeTable (per-paragraph uint pairs)
  //  7 table_list_style    ObjectAttributeTable → ListStyleArchive
  //  8 table_char_style    ObjectAttributeTable → CharacterStyleArchive
  //  9 table_attachment    ObjectAttributeTable → DrawableAttachmentArchive etc.
  // 11 table_smartfield    ObjectAttributeTable → HyperlinkFieldArchive etc.
  // 12 table_layout_style  ObjectAttributeTable → ColumnStyleArchive
  // 14 table_para_starts   ParaDataAttributeTable
  // 15 table_bookmark      16 table_footnote     17 table_section (Pages: → TP.SectionArchive)
  // 18 table_rubyfield     19 table_language (StringAttributeTable)
  // 20 table_dictation     21 table_insertion    22 table_deletion (change tracking)
  // 23 table_highlight     24 table_para_bidi
  // 25 table_overlapping_highlight, 26 table_pencil_annotation (OverlappingFieldAttributeTable)
  // 27 table_tatechuyoko   28 table_drop_cap_style
}
message ObjectAttributeTable {
  message ObjectAttribute { required uint32 character_index = 1;
                            optional TSP.Reference object = 2; }
  repeated ObjectAttribute entries = 1;
}
```

Semantics (established empirically and from app behavior):

- **Text conventions:** paragraphs are terminated by `"\n"` (the final
  paragraph's terminator is optional); inline attachments occupy one
  `U+FFFC` character; section breaks are paragraph boundaries carrying a
  `table_section` entry.
- **Indexes are UTF-16 code units** — identical to JavaScript string
  indexing. (Astral characters count as 2.)
- Entries are sorted by `character_index`; entry *i* covers characters
  `[index_i, index_{i+1})`, the last entry running to end of text.
- **Character-run tables** (char_style, smartfield, language, …): an entry
  with no `object` *ends* the previous run ("no attribute here").
- **Paragraph-aligned tables** (para_style, list_style, layout_style): one
  entry at every paragraph start; an entry with no `object` means
  "**unchanged from the previous paragraph**" (dedup, not clearing). Every
  paragraph therefore has a well-defined style via carry-forward.
- `ParaDataAttributeTable` entries carry two uint32s per paragraph
  (numbering/bidi bookkeeping); `OverlappingFieldAttributeTable` entries
  carry an explicit `TSP.Range { location = 1, length = 2 }` and may
  overlap.

**Editing rule (critical):** after any text change, every table must be
fixed up — shift indexes after the edit point by the length delta, drop
entries inside the replaced range, rebuild paragraph-aligned tables to one
entry per paragraph, keep every index ≤ text length. A stale index past the
end of text makes the apps mis-layout or crash. (This library routes all
edits through `TextStorage.replaceRange`, which does exactly this.)

## 8. Styles

Concrete style archives embed a common core:

```proto
message TSS.StyleArchive {              // embedded as `super = 1`
  optional string name = 1;             // UI name ("Body", "Heading 1"); unset = anonymous
  optional string style_identifier = 2; // machine ID ("paragraph-style-32")
  optional TSP.Reference parent = 3;    // inheritance
  optional bool is_variation = 4;
  optional TSP.Reference stylesheet = 5;
}
message TSWP.ParagraphStyleArchive {    // type 2022
  required TSS.StyleArchive super = 1;
  optional uint32 override_count = 10;  // #properties overridden vs parent
  optional CharacterStylePropertiesArchive char_properties = 11;
  optional ParagraphStylePropertiesArchive para_properties = 12;
}
// CharacterStyleArchive (2021): super=1, override_count=10, char_properties=11
```

`CharacterStylePropertiesArchive` fields (all optional; paired `*_null`
booleans express "explicitly cleared"): bold=1, italic=2, font_size=3,
font_name=5 (PostScript name), font_color=7 (`TSP.Color`: model=1 (1=rgb),
r=3, g=4, b=5, a=6 — floats), superscript=10, underline=11, strikethru=12,
capitalization=13, baseline_shift=14, kerning=15, ligatures=16,
background_color=26, tracking=27, … (47 fields in current apps).

`ParagraphStylePropertiesArchive`: alignment=1 (0 left/1 right/2 center/3
justified/4 natural), first_line_indent=7, keep_lines_together=9,
keep_with_next=10, left_indent=11, line_spacing=13
(`LineSpacingArchive{mode=1, amount=2}`), page_break_before=14,
right_indent=19, space_after=20, space_before=21, tabs=25, widow_control=26,
outline_level=27, show_in_toc=33, list_style=40 (ref),
following_style=42 (ref), …

**Stylesheets** (`TSS.StylesheetArchive`, type 401): `styles = 1` (refs),
`identifier_to_style_map = 2` (`{identifier=1, style=2}` entries),
`parent = 3` (theme stylesheet chain), `parent_to_children_style_map = 5`,
plus `styles_for_10_0 … styles_for_14_4` (fields 7–22) — per-version
snapshots for collaboration; leave them untouched. A Pages document has a
document stylesheet (named styles) whose parent is the theme stylesheet
(presets). Direct formatting = anonymous styles (no name) parented on the
run's current style.

Registering a new style: create the style object **in the stylesheet's
component**, point its `super.stylesheet` at the sheet, append to
`styles`, add an `identifier_to_style_map` entry if it has an identifier,
and add it under its parent in `parent_to_children_style_map`.

## 9. The Pages document graph (TP)

```
TP.DocumentArchive (type 10000, object 1, in Index/Document.iwa)
├─ super = 15            → TSA.DocumentArchive ─ super=1 → TSK.DocumentArchive
├─ stylesheet = 2        → TSS.StylesheetArchive   (Index/DocumentStylesheet.iwa)
├─ floating_drawables = 3→ TP.FloatingDrawablesArchive (per-page drawable lists)
├─ body_storage = 4      → TSWP.StorageArchive (kind=BODY)
├─ theme = 6             → TP.ThemeArchive ─ super → TSS.ThemeArchive
├─ settings = 7          → TP.SettingsArchive (footnote config, hyphenation, RTL…)
├─ drawables_zorder = 20 → TP.DrawablesZOrderArchive
├─ uses_single_header_footer = 21 (bool)
└─ page geometry (floats, in points):
   page_width = 30, page_height = 31, left_margin = 32, right_margin = 33,
   top_margin = 34, bottom_margin = 35, header_margin = 36, footer_margin = 37,
   page_scale = 38, orientation = 42 (0 portrait / 1 landscape)
```

**Sections.** The body storage's `table_section` (field 17) maps ranges of
body text to `TP.SectionArchive` objects (type 10011) — one entry at each
section's first character:

```proto
message TP.SectionArchive {
  optional bool inherit_previous_header_footer = 17;
  optional bool page_master_first_page_different = 18;
  optional bool page_master_even_odd_pages_different = 19;
  optional uint32 section_start_kind = 20;       // new page / odd / even…
  optional uint32 section_page_number_kind = 21;
  optional uint32 section_page_number_start = 22;
  optional TSP.Reference first_page_master = 23; // → TP.SectionTemplateArchive
  optional TSP.Reference even_page_master = 24;
  optional TSP.Reference odd_page_master = 25;
  optional string name = 26;
  optional bool page_master_first_page_hides_header_footer = 28;
  // fields 1–16 are OBSOLETE_* pre-5.0 leftovers — never write them
}
```

**Headers and footers** have no dedicated archive: each
`TP.SectionTemplateArchive` (type 10143; named PageMasterArchive in 2013)
holds `headers = 1` and `footers = 2` — each a list of **three**
`TSWP.StorageArchive` refs (left, center, right box) — plus
`master_drawables = 3`. Sections reference up to three templates
(first/even/odd page variants).

**Drawables.** Everything placed on a page embeds
`TSD.DrawableArchive` through a `super`-chain at field 1
(e.g. `TSWP.ShapeInfoArchive → TSD.ShapeArchive → TSD.DrawableArchive`).
The drawable core: `geometry = 1` (`TSD.GeometryArchive { position=1
(TSP.Point{x=1,y=2}), size=2 (TSP.Size{width=1,height=2}), flags=3,
angle=4 }`), `parent = 2`, `hyperlink_url = 4`, `locked = 5`,
accessibility_description = 8`. Inline drawables hang off the body's
`table_attachment` via `TSWP.DrawableAttachmentArchive { drawable = 1 }`
anchored at a `U+FFFC`; floating ones live in
`TP.FloatingDrawablesArchive.page_groups` and the z-order list.

## 10. Writing files: the full invariant checklist

A writer that violates any of these produces files the apps reject or
mis-render:

1. **`MessageInfo.length`** must equal the serialized payload length —
   recompute for every rewritten object.
2. **`MessageInfo.object_references`** must match the payload's actual
   `TSP.Reference` targets — recompute after reference edits (§5.2).
3. **Attribute-table indexes** must be consistent with the text after every
   edit (§7) — all tables, not just the ones you meant to touch.
4. **New object IDs** above `last_object_identifier`, which is updated on
   every allocation (§5.2).
5. **Cross-component references** appended to the referencing component's
   `external_references` (§5.3).
6. **New styles registered** in their stylesheet's lists/maps (§8).
7. **Unknown fields, field_infos, versions, should_merge/patches**:
   preserve byte-for-byte. Version lists on new structures: `MessageInfo.
   version = [1,0,5]`, `ComponentInfo.document_read/write_version =
   [2,0,0]`, `save_token = 1` (values current apps write).
8. **Non-IWA package entries** byte-identical; `.iwa` chunking per §3;
   zip entries STORED.
9. **Never write OBSOLETE_/deprecated fields**; never touch the
   `styles_for_*` snapshots.
10. **Data/ additions** need a `DataInfo` with SHA-1 digest and a fresh
    data-space identifier (§5.4).

This library additionally keeps every **untouched component's** `.iwa`
bytes identical (the reference Python writers recompress everything;
byte-stability makes diffs and testing tractable).

## 11. Version compatibility strategy

How this library stays correct as Apple ships new versions:

- **Additive-schema reality.** All observed evolution 2013→2026 is
  field/type additions and renames. We address fields by number (names are
  cosmetic) and never enumerate-and-rewrite unknown content.
- **Unknown-preserving round-trip.** The RawMessage layer keeps unknown
  fields (and whole unknown payload types, components and package entries)
  bit-exact; editing a document written by a future Pages keeps its new
  features intact as long as edits don't semantically collide with them.
- **Data-driven registry** regenerated from published dumps
  (`research/type-registry.json` → `src/registry.ts`); unknown type IDs
  degrade to opaque-but-preserved objects, never failures.
- **Warn, don't gate.** `FormatInfo` surfaces `file_format_version`,
  plist versions and build history; loading never hard-fails on newer
  versions (matching the reference implementations' posture).
- **Structural detection over version sniffing** — layouts (§2), chunk
  framing (§3) and geometry shapes (§9) are detected from bytes, so
  cosmetic changes in names/locations don't break parsing.

## 12. Known gaps / roadmap

- Table **cell models** (TST tiles: packed cell storage), chart data, and
  Keynote slide trees are read as opaque objects; editing them needs the
  TST/TSCH/KN-specific models on top of this substrate.
- Creating documents **from scratch** (the practical route is embedding an
  app-saved empty template, as numbers-parser does).
- Image/media **insertion** (Data/ plumbing is specified in §5.4/§10 but
  not yet wrapped in a high-level API).
- Footnote/comment/change-tracking editing (tables are preserved and
  shifted correctly; semantic APIs pending).
- Password-protected files (`.iwph` + encrypted payload).
- `TSP.FieldInfo.object_references` (per-field-path reference lists) are
  preserved but not recomputed; the reference writers behave the same.

## 13. Prior art & provenance

- `obriensp/iWorkFileFormat` (2013) — first public IWA analysis + Pages '13
  proto dump (MIT).
- `psobot/keynote-parser` (MIT) — Python read/write for Keynote; source of
  several write-path invariants.
- `masaccio/numbers-parser` (MIT) — the most complete third-party writer;
  source of ID-allocation, component and external-reference behavior;
  current shared proto dumps.
- `6over3/WorkKit` (2026) — live `TSPRegistry` dump confirming the current
  type tables, including Pages.
- Schema files under `proto/`, extraction notes and line-cited invariants
  under `research/`, real-world fixtures with license attribution under
  `fixtures/`.

All proto definitions originate from Apple's applications (extracted for
interoperability); the extraction lineage is documented in
`proto/README.md`.
