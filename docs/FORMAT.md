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

**Not every component uses this framing.** A component's first bytes
identify its codec: `0x00` starts the Snappy chunking above, while `bvxn` /
`bvx1` / `bvx2` / `bvx-` / `bvx$` are Apple **LZFSE/LZVN** containers.
Collaboration-mode documents write `Index/OperationStorage.iwa` as LZFSE
while every other component in the same package uses Snappy — so a package
can mix codecs, and a reader must detect per component rather than assume.
(`Index/ActivityStream.iwa` is another component seen only in that mode.)
A reader that fails the whole document over one such component throws away
the many that parse fine; this library reports them as opaque, preserves
their bytes verbatim, and loads the rest.

The Snappy framing itself is **not** the standard Snappy framing format:
there is no `sNaPpY` stream identifier and no CRC-32C anywhere. Each payload is a standalone raw
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
  paragraph's terminator is optional); section breaks are paragraph
  boundaries carrying a `table_section` entry.
- **Anchor characters differ per table** — a detail that silently breaks
  naive implementations:
  - `U+FFFC` (OBJECT REPLACEMENT CHARACTER) anchors **`table_attachment`**
    entries: inline drawables, table-of-contents entries, page-number
    fields.
  - `U+000E` (SHIFT OUT) anchors **`table_footnote`** entries — footnote and
    endnote references. They do *not* use `U+FFFC`.
  Verified on a document with 8 footnotes and 25 attachments: the `U+FFFC`
  count matched the attachment table exactly, and every footnote anchor sat
  on `U+000E`.
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
font_name=5 (PostScript name), font_color=7, language=9, superscript=10
(0 normal/1 super/2 sub), underline=11 (0 none/1 single/2 double/3 wavy),
strikethru=12 (0 none…3 triple), capitalization=13 (0 none/1 all caps/2
small caps/3 title), baseline_shift=14, kerning=15, ligatures=16 (0
required/1 standard/2 all), outline_color=18, outline=19,
shadow=21 (`TSD.ShadowArchive`), strikethru_color=23, strikethru_width=24,
background_color=26 (the highlight behind the glyphs), tracking=27,
underline_color=29, underline_width=30, word_strikethru=31,
word_underline=32.

`ParagraphStylePropertiesArchive`: alignment=1 (0 left/1 right/2 center/3
justified/4 natural), decimal_tab=3, default_tab_stops=4, fill=6,
first_line_indent=7, hyphenate=8, keep_lines_together=9, keep_with_next=10,
left_indent=11, line_spacing=13 (`LineSpacingArchive{mode=1, amount=2}`),
page_break_before=14, rule_width=18, right_indent=19, space_after=20,
space_before=21, tabs=25, widow_control=26, outline_level=27, stroke=32,
show_in_toc=33, writing_direction=38, list_style=40 (ref),
following_style=42 (ref), border_positions=45, rounded_corners=46.

Two of these are easy to get wrong:

- **`fill` (6) is a bare `TSP.Color`, not a `TSD.FillArchive`.** A paragraph
  background can only be a flat colour — never a gradient or image.
- **`border_positions` (45) is an int32, not a bitmask of sides.** It
  replaced a `DeprecatedParagraphBorderType` enum whose values pack a
  position in 0..4 alongside a line style, and the Pages inspector offers
  exactly five choices, so the reading `0 none / 1 top / 2 bottom / 3 top
  and bottom / 4 all` fits both. This is *inferred, not proven by
  rendering*: every value in the corpus is 0, 1 or 2. The library exposes
  the raw integer alongside the named constants.

### 8.1 Shared style values (TSD)

Fills, strokes and shadows are not per-family. The same messages carry a
paragraph background, a table-cell fill, a shape fill and a chart series
fill; the same `TSD.StrokeArchive` is a paragraph rule, a cell border and a
shape outline. Modelling them once is what lets one API style text, tables
and drawables.

```proto
message TSD.FillArchive {               // exactly one of:
  optional TSP.Color color = 1;
  optional TSD.GradientArchive gradient = 2;
  optional TSD.ImageFillArchive image = 3;
}
message TSD.GradientArchive {
  optional GradientType type = 1;       // 0 linear, 1 radial
  repeated GradientStop stops = 2;      // { color=1, fraction=2, inflection=3 }
  optional float opacity = 3;
}
message TSD.StrokeArchive {
  optional TSP.Color color = 1;
  optional float width = 2;
  optional LineCap cap = 3;             // 0 butt, 1 round, 2 square
  optional LineJoin join = 4;           // 0 miter, 1 round, 2 bevel
  optional float miter_limit = 5;
  optional StrokePatternArchive pattern = 6;
}
message TSD.StrokePatternArchive {
  optional StrokePatternType type = 1;  // 0 dash pattern, 1 solid, 2 empty
  optional float phase = 2;
  optional uint32 count = 3;
  repeated float pattern = 4;           // dash lengths — FLOATS, not varints
}
message TSD.ShadowArchive {
  optional TSP.Color color = 1;
  optional float angle = 2 [default = 315];
  optional float offset = 3 [default = 5];
  optional int32 radius = 4 [default = 1];
  optional float opacity = 5 [default = 1];
  optional bool is_enabled = 6 [default = true];
}
```

`StrokePatternArchive.pattern` being `repeated float` is a real trap:
encoding dash lengths as packed varints produces a message that parses but
renders wrong.

**`TSP.Color` and colour spaces.** `model = 1` (1 rgb, 2 cmyk, 3 white),
`r/g/b = 3/4/5`, `a = 6`, cmyk `c/m/y/k = 7..10`, white `w = 11`, and
`rgbspace = 12` (1 sRGB, 2 Display P3). The 26.x-era apps write an explicit
`rgbspace` on essentially every colour, so a reader that ignores field 12
will silently render P3 colours as sRGB. There is also an **undocumented
fixed32 field 13**, first seen in the 26.x era, always paired with an
explicit `rgbspace` and always `1.0` in every document examined — meaning
unknown, preserved verbatim like any unknown field.

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

### 8.2 Image masks: cropping

Cropping does not touch the media. The image keeps its whole extent and a
`TSD.MaskArchive` (type 3006) is laid over it — a second drawable whose
frame is the window you see through.

**The two frames are in different spaces**, and confusing them misplaces
every crop:

- the **image**'s geometry is in its parent's space (page, slide, sheet)
  and covers the entire picture, cropped parts included;
- the **mask**'s geometry is in the **image's** space.

So the visible rectangle is `image.position + mask.position`, sized by the
mask. That is measured rather than assumed: across the 79 masked images in
the corpus this reading puts the visible rectangle at a non-negative
position 78 times and the crop window inside the image 75 times, against 48
for the alternative — and it explains the full-bleed cases exactly, where an
image at (-91, -102) carries a mask at (91, 102) so the crop begins
precisely at the page origin.

```proto
message TSD.MaskArchive {
  required TSD.DrawableArchive super = 1;      // geometry = the crop window
  optional TSD.PathSourceArchive pathsource = 2;
}
message TSD.BezierPathSourceArchive {
  optional TSP.Size naturalSize = 2;           // what the path is drawn at
  optional TSP.Path path = 3;
}
```

Every corpus mask is a rectangle, but **not at the size it appears to be**.
The path lives in its own coordinate space and is stretched — independently
per axis — to `naturalSize`. Of the 79 masks, 30 write the path at exactly
`naturalSize`, 12 at a uniform scale of it, and 37 at some other scale; one
is a plain 100×100 reference box stretched to 860×880. So the path's own
dimensions carry nothing beyond "this shape is a rectangle", and what sizes
the crop is `naturalSize` — which equals the mask's frame in every file
examined.

The path Apple writes is `moveTo(0,0)`, three `lineTo`s round the corners,
`closeSubpath`, then a redundant trailing `moveTo(0,0)`.

Resizing therefore changes the geometry and `naturalSize` and leaves the
path alone. Instant-alpha and shape crops would not be rectangles — none
appears in any corpus file — so a mask whose path is not one is refused
rather than flattened into a box.

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

## 11. Version markers and format eras

Three independent version markers travel with every document; they agree
where they overlap, and this library reads all of them.

| Marker | Location | Example |
|---|---|---|
| `fileFormatVersion` | `Metadata/Properties.plist` (binary plist) | `"3.2.13"` |
| `file_format_version` | `TSP.PackageMetadata` field 7 (packed) | `[3, 2, 13]` |
| `read_version` / `write_version` | `TSP.PackageMetadata` fields 5 / 6 | `[2, 0, 0]` |
| application build | `Metadata/BuildVersionHistory.plist` (XML) | `"G-r320-3C102"` |

The first two are the same number in two encodings (verified across every
fixture). `read_version` is the *minimum reader* the package requires and
moves far more slowly than the format version. `BuildVersionHistory` names
the actual application build that last wrote the file, plus the template it
came from.

**Format eras.** The `fileFormatVersion` sequence is not continuous, and the
discontinuity is meaningful — Apple changed what the number *means*:

| Era | `fileFormatVersion` | Apps | Observed in fixtures |
|---|---|---|---|
| `iwork13` | `1.x` | Pages 5.x / Numbers 3.x / Keynote 6.x (2013–14) | `1.5.0`, build `M5.5.3-2152-2` |
| `iwork16` | `2.x` | 2015–2016 releases | `2.0.24`, build `T2.6.1 (2160)` |
| `iwork19` | `3.x`–`4.x` | 2017–2019 releases | `3.2.13` (`G-r320-3C102`), `4.2.3` (`M8.2-6520-2`) |
| `modern` | `10.x`–`14.x` | mirrors the **application** version (2020–2024) | `14.4.1`, build `M14.5-7045.0.17-4` |
| `current` | `26.x` | year-versioned 2025/2026 releases | `26.0.0` (build `M15.1`), `26.1.0` (builds `M15.2`, `M15.2.1`) |
| `future` | anything higher | released after this library's survey | — |

The build-string prefix identifies the **writing platform**: `M…` for macOS,
`T…` for iOS/iPadOS, `G…` for some older releases. Both platforms write the
same format versions — a `26.0.0` Keynote in the corpus was written by iOS
build `T15.1 (7373.0.281)`, alongside macOS-written 26.1.0 files.

Note the build string stops matching the format version in the `current`
era: Apple's marketing version jumped to 26 while internal builds continued
from 15.x, so a `26.1.0` document is written by an `M15.2.x` build. Use
`fileFormatVersion` for era decisions, not the build string.

Two further observations from the corpus, both relevant to writers:

- **Cell-storage generation is not implied by era.** A 2018-era file
  (`3.2.13`) already uses BNC/v5 storage, and modern writers *also* emit the
  legacy pre-BNC buffers as stubs (field 3 padded to `cell_count × 12`
  bytes). Detect on `Tile.last_saved_in_BNC` / `storage_version`, never on
  buffer presence.
- **`Metadata/Properties.plist` keys can be renamed between releases.** The
  `26.1.0` writer splits
  `hasExternalReferenceOrMissingOrUnmaterializedRemoteData` into
  `hasExternalReferenceOrMissingData` + `hasUnmaterializedRemoteData`;
  `26.0.0` still uses the old key. Readers matching plist key literals must
  tolerate both.

From 2020 the format version simply tracks the app version, which is why
`10.x` follows `3.x`. Era classification is exposed as `doc.era`; it is
**reporting metadata only** — no code path gates on it.

### 11.1 Structural probes

Behavior is decided by what a document *contains*, not what it claims.
`doc.compatibility()` returns declared versions alongside probes of:

- **container layout** — flat, nested `Index.zip`, or wrapper directory
- **cell-storage generation** — `v5` (readable) vs `preBNC` (not decodable).
  Note this is *not* predictable from the era: a 2018-era file (`3.2.13`)
  in the test corpus already uses v5, while 2015-era files do not.
- **unknown type IDs** — object types absent from the bundled registry, in
  either direction: newer files may carry types added after the registry
  dump, and *older* files carry types since removed (the `1.5.0` fixture
  contains type `608`, which current apps no longer emit)
- **patch archives** (`should_merge`), **collaboration state**, and
  **versioned style snapshots** (`styles_for_*`)

Anything unrecognized is reported through `unsupportedFeatures` /
`warnings` and preserved byte-for-byte — never guessed at, never silently
dropped.

## 12. Version compatibility strategy

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

## 13. Concurrency: open documents and iCloud collaboration

Two questions come up constantly, and the format itself answers both.

### 13.1 Editing a document while an app has it open

**Don't.** There is no file-level handshake that makes this safe, and the
format provides none:

- The apps load the whole object graph into memory on open and write the
  **entire package** on save (autosave included). They do not re-read the
  package while it is open, so your edit is invisible to the running app —
  and the app's next autosave replaces the file wholesale, silently
  discarding your changes.
- Coordination on macOS happens above the format, in the document
  architecture (`NSFileCoordinator`/`NSFilePresenter`, plus APFS document
  versions). Those are process-level Objective-C APIs; a portable
  JavaScript library cannot join that protocol, and even doing so would
  only serialize access — it would not merge edits into the app's live
  in-memory graph.
- iWork exposes no plugin or IPC surface for third-party mutation. (macOS
  AppleScript/JXA automation drives the *application*, not the file, and
  requires the app to be installed and running.)

Safe workflow: **close the document in the app, edit, reopen.** If a file
may be open, treat it as read-only — reading a package that is being
written can also yield a torn zip, so check that the file size and mtime
are stable before parsing.

### 13.2 iCloud real-time collaboration

**Not harnessable from the file layer** — but it is worth being precise
about why, because the file *does* carry collaboration state.

iWork collaboration is **operation-based with server-assigned ordering**,
not a file-merge or CRDT scheme that a library could join offline. The
evidence is in the schemas:

- **Edits are commands, not diffs.** 394 of the ~750 registry types are
  `*CommandArchive` classes (`TSK.CommandArchive` at 132 is the base).
  Every user action has a serializable command form.
- **Operational transformation.** `TSCK.CollaborationDocumentSessionState`
  (type 226) carries `rsvp_command_queue_items`,
  `transformer_from_unprocessed_command_operations_entries`,
  `collaborator_cursor_transformer_entries` and
  `acknowledged_commands_pending_resume_process_diffs` — command and cursor
  *transformers* against unacknowledged operations, i.e. classic OT.
- **A server is the ordering authority.** The same message has
  `mailbox_request_document_revision_sequence`,
  `mailbox_request_document_revision_identifier` and
  `last_command_send_marker_sequence`; `TSP.DocumentRevision` is
  `(identifier, sequence)`. Clients send commands to a mailbox and apply
  what comes back at the revision the service assigns.
  `TSCK.CollaborationCommandHistoryItem` records each applied command with
  its `revision_sequence`.
- **Identity is Apple-account-scoped.** `collaborator_ids`,
  `TSCK.ActivityAuthorArchive`, `TSCK.SetActivityAuthorShareParticipantIDCommandArchive`
  and `TSK.AnnotationAuthorArchive` are keyed to share participants.

Joining a live session would therefore require speaking Apple's
undocumented, authenticated mailbox protocol against their CloudKit-backed
service, implementing the transformation semantics of hundreds of command
types, and holding valid Apple-ID credentials. None of that is reachable
from a file, and none of it is public API. **Treat live collaboration as
out of scope.**

What *is* available at the file layer, and what this library does:

| Capability | Available? |
|---|---|
| Read collaboration/authorship residue (authors, change sessions, comment authors, revision) | ✅ read |
| Preserve collaboration state across an edit (session state, command history, save tokens, `object_uuid_map_entries`) | ✅ preserved byte-exactly |
| Edit a document that lives in an iCloud Drive folder, while nobody has it open | ✅ (the sync client uploads it like any file) |
| Join a live session / merge with concurrent editors / push operations | ❌ not possible |

Practical guidance for iCloud-synced files: edit only when the document is
closed everywhere, and let sync settle before and after. Two clients
writing the same package independently produces an iCloud **conflict copy**,
not a merge — the service resolves at file granularity for non-session
writes. Because this library preserves object identifiers, save tokens and
the collaboration history rather than renumbering them, a document it edits
can subsequently be opened and collaborated on normally.

## 14. Tables (TST): cell storage and styling

### 14.1 From table to cells

```
TST.TableInfoArchive (6000)     ← the drawable on the sheet/page/slide
└─ tableModel = 2 → TST.TableModelArchive (6001)
   ├─ table_style = 3            → TST.TableStyleArchive (6003)
   ├─ base_data_store = 4        (embedded TST.DataStore)
   │  ├─ rowHeaders = 1          → HeaderStorageBucket(s) (6006)
   │  ├─ columnHeaders = 2       → HeaderStorageBucket
   │  ├─ tiles = 3               (embedded TileStorage → TST.Tile, 6002)
   │  ├─ stringTable = 4         → TST.TableDataList (6005)
   │  ├─ styleTable = 5          → TableDataList of cell-style references
   │  ├─ formula_table = 6       → TableDataList of TSCE.FormulaArchive
   │  ├─ merge_region_map = 13   → TST.MergeRegionMapArchive (6144)
   │  └─ rich_text_table = 17    → TableDataList of rich-text payloads
   ├─ number_of_rows = 6, number_of_columns = 7, table_name = 8
   ├─ number_of_header_rows = 9, header_columns = 10, footer_rows = 11
   ├─ body_cell_style = 18, header_row_style = 19,
   │  header_column_style = 20, footer_row_style = 21   → CellStyleArchive (6004)
   └─ default_row_height = 16, default_column_width = 17
```

`Tile.rowInfos` holds one `TileRowInfo` per materialized row; the table row
is `tileid * tile_size + tile_row_index` (tile size is 256). Rows with no
storage are entirely empty.

### 14.2 The v5 ("BNC") cell record

`TileRowInfo.cell_storage_buffer` (field 6) concatenates the row's records;
`cell_offsets` (field 7) is a signed-16-bit little-endian array indexed by
column, `-1` meaning "no record". A record runs from its offset to the next
non-negative offset, or to the end of the buffer. `has_wide_offsets` (8)
multiplies every offset by 4 — lossless because every record is a 4-byte
multiple.

```
offset  size  meaning
0       u8    storage version — must be 5
1       u8    cell type (below)
2–5     4     zero in every file examined
6–7     u16   "extras": duplicates which format id is present. Informational
8–11    u32   flags — which optional fields follow
12…           optional fields, in ASCENDING BIT ORDER of `flags`
```

| Cell type | Meaning | Value read from |
|---:|---|---|
| 0 | empty | — |
| 2 | number | decimal128 |
| 3 | text | `string_id` → stringTable |
| 5 | date | `seconds` since 2001-01-01 |
| 6 | bool | `double > 0` |
| 7 | duration | `double` seconds |
| 8 | formula error | — |
| 9 | rich text | `rich_id` → rich_text_table → TSWP storage |
| 10 | currency | decimal128 |

Flags and payload sizes: `0x1` decimal128 (16), `0x2` double (8), `0x4`
seconds (8), `0x8` string_id (4), `0x10` rich_id (4), `0x20` cell_style_id
(4), `0x40` text_style_id (4), `0x80` conditional style (4), `0x100`
conditional rule style (4), `0x200` formula_id (4), `0x400` control_id (4),
`0x800` formula-error id (4), `0x1000` suggest_id (4), `0x2000`…`0x40000`
the six per-type format ids (4 each), `0x80000` comment id (4), `0x100000`
import-warning id (4).

Numbers are **decimal128** (IEEE 754-2008, binary integer significand,
biased exponent `0x1820`), not doubles — which is why 0.1 in a Numbers cell
is exactly 0.1. A writer must therefore derive the significand from the
*shortest decimal string* that round-trips the value, not from the binary
mantissa.

### 14.3 Writing a cell: the invariants

1. **Preserve the record's other fields.** Style ids, format ids, comment
   ids and conditional styles live in the same record as the value.
   Decoding to a field map and rewriting only the value flags is what stops
   an edit from stripping a cell's formatting.
2. **Drop format ids when the value type changes** — a date format on a
   number renders nonsense — and clear `formula_id` when writing a literal.
3. **Reference-count the string table.** `TableDataList.entries` carry
   `{key=1, refcount=2, string=3}` and the list carries `nextListID = 2`.
   Reuse an existing entry (incrementing its refcount) or allocate
   `nextListID`; on overwrite, decrement the old entry and remove it at zero.
4. **Rebuild the whole row**: `cell_storage_buffer`, `cell_offsets`
   (Apple writes 255 slots regardless of table width), `cell_count`, and
   the matching `HeaderStorageBucket.Header.numberOfCells`.
5. **Keep the pre-BNC stubs consistent.** Fields 3/4 are `required` in
   proto2 and current Apple writers still emit them — as a 12-byte all-zero
   record per cell with version byte `4`, plus an offsets array at stride
   12. They are inert (readers use 6/7 once `last_saved_in_BNC` is set) but
   leaving stale offsets pointing into a rebuilt buffer is worse than
   reproducing the stub.
6. `Tile.maxColumn`/`maxRow`/`numCells` are **0** in Apple's own output;
   maintaining them where the app zeroes them is a gratuitous difference.

### 14.4 Merged cells live in the calc engine, not the region map

The obvious place to look is `DataStore.merge_region_map` (field 13), a
list of `TST.CellRange` with packed origin/size. **No document in the
corpus has one** — not Numbers, not Pages, not 2013 through 26.x. Real
merges are stored as formulas:

```
TableModelArchive.merge_owner = 47        → TST.MergeOwnerArchive
├─ owner_id = 1                            (a CFUUID, NOT the table's own)
└─ formula_store = 2                      → TST.FormulaStoreArchive
   └─ formulas = 3                        → { formula_index = 1, formula = 2 }
      └─ TSCE.FormulaArchive.AST_node_array = 1 → repeated AST_node = 1
```

Each merge is two AST nodes: a **colon-tract node** (type 67) and a
one-argument function node (type 16). The rectangle is in the colon
tract:

```proto
message ASTColonTractArchive {              // AST_node field 40
  repeated Relative relative_column = 1;    // { range_begin = 1, range_end = 2 }
  repeated Relative relative_row = 2;
  repeated Absolute absolute_column = 3;    // { range_begin = 1, range_end = 2 }
  repeated Absolute absolute_row = 4;
  optional bool preserve_rectangular = 5 [default = true];
}
```

`absolute_column` and `absolute_row` give the merge; an omitted
`range_end` means a single row or column. Merges observed this way are
self-consistent in a way that is hard to fake: every anchor holds a value,
**no covered cell ever holds one**, and the 14.4 and 26.0 saves of the
same document decode identically.

Writing a merge is *not* supported, and the reason is the owner UUID.
`merge_owner.owner_id` is not the table's UUID — in every file examined it
differs from the `table_id` inside the AST node by a small delta in one
half. Synthesizing a merge means inventing calc-engine identity, and a
wrong guess corrupts the dependency graph rather than failing loudly.

### 14.5 Formulas

Formulas are a **table** feature, not a Numbers feature: the corpus has
formula cells in Pages documents too, and a Keynote table would carry the
same archives.

A cell with flag `0x200` has a `formula_id` — a key into
`DataStore.formula_table` (field 6), a `TableDataList` whose entries hold a
`TSCE.FormulaArchive`. The cell record *also* holds the cached result with
its normal type byte, so reading values never needs an evaluator.

```proto
message TSCE.FormulaArchive {
  required ASTNodeArrayArchive AST_node_array = 1;   // repeated AST_node = 1
  optional uint32 host_column = 2;                   // absent in practice
  optional uint32 host_row = 3;
}
```

The node array is **post-order (RPN)**, so rendering is a stack walk:
operands push, operators pop their arity. The archive stores no brackets,
so a renderer must re-derive them from precedence.

Node fields worth naming: `AST_node_type = 1`, `AST_function_node_index = 2`,
`AST_function_node_numArgs = 3`, `AST_number_node_number = 4` (double) with
`_decimal_low/high = 42/43` (decimal128 halves, authoritative),
`AST_string_node_string = 6`, `AST_whitespace = 25`, `AST_column = 26`,
`AST_row = 27`, `AST_cross_table_reference_extra_info = 28`,
`AST_colon_tract = 40`.

Three traps:

- **Coordinates are relative offsets from the cell using the formula**,
  zigzag `sint32`, unless the coordinate's `absolute` flag is set. One
  formula entry is shared by every cell in a filled-down column and renders
  differently in each. `host_column`/`host_row` are absent in every file
  examined, so the anchor is the using cell, not the archive.
- **Colon tracts come in two encodings.** `absolute_column`/`absolute_row`
  (3/4) hold indexes; `relative_column`/`relative_row` (1/2) hold `int32`
  offsets. A reader that knows only the absolute pair renders real ranges
  as `#REF!`.
- **Function names are not in the format.** `AST_function_node_index` is an
  index into an Apple-internal list absent from every public schema. Only
  one entry is derivable from the corpus by arithmetic: **168 = SUM**
  (`libetonyek-pages5-extra-dir.pages` sums 5500 + 1170 + 1250 to a cached
  7920). Guessing the rest would convert a visible gap into silent wrong
  answers, so unknown ids render as `FUNCTION_<id>` and callers can supply
  a harvested table.

Cross-table references cannot be resolved to a table *name*: the `table_id`
in `AST_cross_table_reference_extra_info` is a derived UUID matching no
table's own identifier — the same derivation used for merge owners — and
the calc engine's dependency records do not map it back either. Rendering
such a reference as a bare `A2` would read as a cell in the formula's own
table, so it must be marked.

Writing formulas needs both the function table and the calc-engine
dependency records, and is not implemented. Writing a *literal* over a
formula cell correctly clears `formula_id`.

### 14.6 Cell and table styles

Both are `TSS.StyleArchive` subclasses with their property bag at field 11.

```proto
message TST.CellStylePropertiesArchive {
  optional TSD.FillArchive cell_fill = 1;
  optional bool text_wrap = 3;
  optional int32 vertical_alignment = 8;   // 0 top, 1 middle, 2 bottom
  optional TSWP.PaddingArchive padding = 9;
  optional TSD.StrokeArchive top_stroke = 10;
  optional TSD.StrokeArchive right_stroke = 11;
  optional TSD.StrokeArchive bottom_stroke = 12;
  optional TSD.StrokeArchive left_stroke = 13;
}
message TST.TableStylePropertiesArchive {
  optional bool banded_rows = 1;
  optional TSD.FillArchive banded_fill = 2;
  optional bool v_strokes_visible = 33;    // …h_strokes_visible = 34,
  optional bool table_border_visible = 38; //   separators 35–37, 39, 42–44
  optional TSD.StrokeArchive header_row_separator_stroke = 46;
  optional TSD.StrokeArchive table_body_horizontal_border_stroke = 58;
  optional TSD.StrokeArchive table_body_vertical_border_stroke = 59;
  optional TSD.StrokeArchive table_body_horizontal_stroke = 60;
  optional TSD.StrokeArchive table_body_vertical_stroke = 61;
}
```

Neither archive has a **shadow**. A shadow on a table is a shadow on its
drawable — `TSD.ShapeStyleArchive.shape_properties.shadow` — not on any
cell. The same is true of opacity and reflection.

A cell points at its style through `cell_style_id` (flag `0x20`), which is a
**key into `DataStore.styleTable`**, not an object id — the entry's
`reference = 4` holds the object id. Styling one cell therefore means:
create a `TST.CellStyleArchive` (cloning the cell's current style so
unspecified properties are inherited, but clearing the clone's name and
identifier), append a style-table entry, and point the record at the new
key. Because `TableDataList` holds its references inline in entries rather
than in a shape the generic reference extractor understands, its
`object_references` must be refreshed explicitly.

### 14.7 Predicates: conditional formatting and filters

Two features that look unrelated in the UI share one archive.
`TST.FormulaPredicateArchive` answers "does this cell match?" for both
**conditional formatting** ("colour this red when it is below zero") and
**filters** ("show rows where this column is below zero"); the only thing
distinguishing them is a `for_conditional_style` flag.

```proto
message TST.FormulaPredicateArchive {
  required int32 predicate_type = 1;          // unpublished enum
  required int32 qualifier1 = 2;
  required int32 qualifier2 = 3;
  optional TST.FormulaPredArgArchive param_value0 = 4;   // …1 = 5, 2 = 6
  optional TSCE.FormulaArchive formula = 7;
  optional bool for_conditional_style = 8;
}
```

A predicate stores its condition **twice**, and that redundancy is what
makes it decodable without Apple's enum:

- as a real TSCE **formula** — the AST `<cell> < 0`, which the calc engine
  evaluates; and
- as a **template** — `predicate_type` naming the comparison, plus the
  operands in `param_value0..2`, which is what the condition editor
  round-trips.

`predicate_type` is an integer no public schema names. The formula's
terminal operator node is the *documented* `TSCE.ASTNodeType` enum, whose
meaning is visible in any formula bar. So the formula is authoritative for
what a condition means, and `predicate_type` is carried through opaquely.
The corpus supplies two pairings — 5 = `=`, 9 = `<` — and a value outside
that set reads as `undefined` rather than a guess.

The operand under test carries **no address**. A predicate is written once
and applied to a whole range, so Apple encodes the tested cell as a
`LINKED_CELL_REFERENCE_NODE` (type 63) with a table identity but no row or
column. It renders as `THIS_CELL` unless the caller says which cell they
are asking about.

**Conditional formatting** interns its rule sets exactly like strings and
formats: `DataStore.conditionalstyletable` (field 18) is a
`TST.TableDataList` mapping a small key to a `TST.ConditionalStyleSetArchive`,
and a cell's record carries that key in flag `0x80`. Sets are shared
aggressively — in `numbers-parser-v26.1-xlsx-lineage.numbers`, three sets
cover 1921 cells, and each entry's `refcount` equals its cell count exactly.
Every set is written twice, as `rules_prepivot` (pre-2016, operands as AST
indexes) and `rules` (operands as values); readers should prefer the latter
and fall back.

The second conditional id (flag `0x100`) is **not** interpreted here. By
position it corresponds to `CellArchive.conditional_style_applied_rule`, but
the corpus contradicts that reading: every cell on a one-rule set carries
15 regardless of content, and cells on other sets carry 0, which is not a
valid key in any of the table's lists. It is preserved verbatim and flagged
in `docs/VERIFICATION.md`.

**Filters** hang off the hidden-state machinery rather than the table:

```
TableModelArchive.hidden_states_owner (70)
  └ HiddenStatesArchive.row_hidden_state_extent (3) / column_… (2)
      └ HiddenStateExtentArchive.filter_set (8) → TST.FilterSetArchive
```

That indirection is the format being precise about cause and effect: the
filter set says *why* rows should be hidden, the hidden-state extent
records *which* ones are. Changing a rule does not change visibility until
something re-evaluates the predicates.

A filter set's rules are addressed by column through parallel arrays —
`filter_offsets[i]` is the column rule `i` tests, `filter_enabled[i]`
whether it is live — so the three repeated fields must stay the same
length. Both are written **unpacked** (one varint key per value), the
proto2 default.

Every `FilterSetArchive` in the corpus is empty, across all three apps: mode
"all", disabled, no rules. The container, its mode and its enable flag are
therefore fixture-proven; a populated rule list is read from the schema plus
the predicate encoding that conditional formatting exercises for real, and
authoring one is not offered.

### 14.8 Row and column identities

Most of a table addresses cells by position, but anything that must survive
a sort, an insert or a move addresses them by **UID** instead — categories,
hidden states, calc-engine dependencies. `TableModelArchive.base_column_row_uids`
(field 46) holds the translation, laid out for binary search rather than as
a map:

```proto
message TST.ColumnRowUIDMapArchive {
  repeated TSP.UUID sorted_column_uids = 1;
  repeated uint32 column_index_for_uid = 2;   // parallel to the above
  repeated uint32 column_uid_for_index = 3;   // slots into the above
  repeated TSP.UUID sorted_row_uids = 4;      // …rows likewise, 5 and 6
}
```

`column_index_for_uid[i]` is where `sorted_column_uids[i]` lives;
`column_uid_for_index[n]` is the *slot* holding column `n`'s UID, so the
reverse direction dereferences through the sorted list rather than reading
straight out.

UIDs are **not unique across a document**. A table duplicated from another
keeps its source's row and column UIDs — in the categories fixture, two
different tables' row 0 share an identity — so a UID identifies a row
within its table and must never be used as a document-wide key.

### 14.9 Categories: row grouping

Categorising a table collapses its rows into named groups, up to five
levels deep. `TableModelArchive.category_owner` (field 86) points at a
`TST.CategoryOwnerRefArchive`, which references one or more
`TST.GroupByArchive` — a table can hold a definition with grouping switched
off, so `is_enabled` says which is live.

```proto
message TST.GroupByArchive {
  required TSP.UUID group_by_uid = 1;
  repeated TST.GroupColumnArchive group_column = 2;   // outermost first
  optional GroupNodeArchive group_node_root = 3;      // older: inline
  repeated TST.ColumnAggregateArchive column_agg_type = 5;
  required bool is_enabled = 6;
  optional TSP.Reference group_node_root_ref = 18;    // current: referenced
}
message TST.GroupColumnArchive {
  required TSP.UUID column_uid = 1;      // resolved through §14.8
  required uint32 grouping_type = 2;
  optional TSCE.FunctorArchive grouping_functor = 3;
}
```

`grouping_type` selects how values become buckets. The enum is not
published, but `numbers-parser-v26.0-categories.numbers` has one table per
bucketing the UI offers, and each code is confirmed by the *shape* of the
dates it produces rather than by the table's name:

| Code | Grouping | Confirmed by |
|---|---|---|
| 0 | one group per value | group values equal the cells' values |
| 1 | year | every group value is 1 January |
| 2 | year and month | every group value is the 1st, months vary |
| 3 | weekday | ≤7 groups, all dated inside one reference week |
| 4 | day | one group per distinct date |
| 5 | year and week | every group value lands on the *same weekday* |
| 6 | year and quarter | group values only in months 1, 4, 7, 10 |

The groups themselves are a tree of `GroupNodeArchive`. Each node carries
the value defining it (`group_cell_value`, a `TSCE.CellValueArchive`) and
its rows in `row_lookup_uids` — which, despite the name, is a plain
`TSCE.IndexSetArchive` of **row indexes**. That reading is not inferred: in
every categorised table in the corpus, the rows a group names hold exactly
that group's value in the grouping column, and the groups partition the
data rows exactly once.

Children come two ways, matching the root: `child_ref` (referenced, current)
or `child` (inline, older). A parent's rows are the union of its children's.

The tree is a **cache the app recomputes**, like a table of contents.
Editing cells here does not regroup them — but unlike a TOC, the staleness
is checkable, because the grouping column's values are right there in the
table. Comparison must be on *values*, not rendered text: a boolean group
is `false` where the cell renders `FALSE`.

Per-group summaries (`column_agg_type`) are read, but no fixture carries a
non-empty aggregate list, so the `agg_type` codes are passed through
unnamed.

## 15. Known gaps / roadmap

- **Pre-BNC cell storage** (versions 3/4, written by iWork '13-era apps)
  uses an undocumented record layout and is *not* decodable — tables from
  those files report `storageGeneration === "preBNC"`, and both `cells()`
  and `setCell()` throw rather than return or write something misleading.
  (The reference Python implementation refuses them too.) Re-saving in
  Numbers 10+ converts them to v5.
- **Authoring conditional-formatting rules and filter rules** is not
  implemented (§14.7). An existing rule set can be applied to more cells,
  and a filter set can be enabled, disabled or switched between "all" and
  "any" — but building a rule means choosing a `predicate_type`, and only
  two of that enum's members appear in the corpus. Recomputing which rows a
  filter hides additionally means evaluating the predicates.
- **Authoring formulas** is not implemented. Formulas are *read* and
  rendered to text (§14.5), and writing a literal correctly clears one, but
  building a `TSCE.FormulaArchive` AST needs the function-index table the
  format does not contain plus the calc-engine dependency records.
- **Writing merge ranges** is blocked on calc-engine identity: a merge is a
  formula owned by a UUID that is *not* the table's own (§14.4), so
  synthesizing one means inventing a calc-engine identifier. Reading merges
  is fully supported.
- Chart data (TSCH) and Keynote slide trees are read as opaque objects;
  editing them needs the TSCH/KN models on top of this substrate.
- Creating documents **from scratch** (the practical route is embedding an
  app-saved empty template, as numbers-parser does).
- Image/media **insertion** (Data/ plumbing is specified in §5.4/§10 but
  not yet wrapped in a high-level API).
- Footnote/comment/change-tracking editing (tables are preserved and
  shifted correctly; semantic APIs pending).
- Password-protected files (`.iwph` + encrypted payload).
- `TSP.FieldInfo.object_references` (per-field-path reference lists) are
  preserved but not recomputed; the reference writers behave the same.
- Live iCloud collaboration (§13.2) and editing documents open in an app
  (§13.1) are out of scope by construction, not by omission.

## 16. Prior art & provenance

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
