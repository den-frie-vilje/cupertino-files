# Apple Numbers cell storage (TST family): a reader's specification

Scope: what a TypeScript implementation needs to READ cell values from modern .numbers
files (Numbers 10.x-14.x/26.x, "BNC" v5 cell storage). Sources for all citations:

- `numbers-parser` @ commit `2dd9dbe3f8f3440bbd19e23668d5ade72a2e1629` (2026-07-30),
  cloned at `scratchpad/numbers-parser`; paths cited as `src/numbers_parser/...` or
  `src/protos/...` relative to that clone.
- `/home/user/cupertino-files/proto/current/TSTArchives.proto` (cited as `TSTArchives.proto:line`),
  plus `TSDArchives.proto`, `TSCEArchives.proto`, `TSWPArchives.proto` from the same directory.

Prerequisite (assumed available): an ObjectStore mapping `objectId -> decoded archive`,
built from the snappy-compressed IWA files in `Index/*.iwa`. `TSP.Reference` fields hold an
`identifier` that is a key into this store (`src/numbers_parser/containers.py:43-165`).

---

## 1. Object graph from sheet to cells

### 1.1 TN.DocumentArchive and TN.SheetArchive

The document root is object ID 1 (`DOCUMENT_ID = 1`, `src/numbers_parser/constants.py:61`).
From `src/protos/TNArchives.proto:109-121` and `:127-151` (trimmed):

```proto
message DocumentArchive {
  repeated .TSP.Reference sheets = 1;
  required .TSA.DocumentArchive super = 8;
  required .TSP.Reference stylesheet = 4;
  optional .TSP.Reference custom_format_list = 9;
  // theme = 6, sidebar_order = 5, uistate = 7, page_size = 12, ...
}
message SheetArchive {
  required string name = 1;
  repeated .TSP.Reference drawable_infos = 2;
  // print/page layout fields 3-24 are irrelevant to cell reading
}
```

`sheet_ids()` filters `DocumentArchive.sheets` to referenced objects that decode as
`TN.SheetArchive` (`src/numbers_parser/model.py:258-263`).

### 1.2 TST.TableInfoArchive — the drawable that owns a table

Each table on a sheet is a drawable of type `TST.TableInfoArchive`
(`TSTArchives.proto:318-334`):

```proto
message TableInfoArchive {
  required .TSD.DrawableArchive super = 1;   // super.parent (TSD field 2) -> owning sheet
  required .TSP.Reference tableModel = 2;    // -> TST.TableModelArchive
  optional bool is_a_pivot_table = 16;
}
```

`TSD.DrawableArchive.parent` is field 2 (`TSDArchives.proto:323-337`). numbers-parser finds
tables by scanning all archives of type `TableInfoArchive` and keeping those with
`super.parent.identifier == sheet_id`, then dereferencing `tableModel`
(`src/numbers_parser/model.py:277-287`). Equivalent for a reader: walk
`SheetArchive.drawable_infos` and keep the ones that decode as `TST.TableInfoArchive`.

### 1.3 TST.TableModelArchive — fields a reader needs

From `TSTArchives.proto:458-544`, trimmed to reader-relevant fields:

```proto
message TableModelArchive {
  required .TST.DataStore base_data_store = 4;   // cells live under here
  required uint32 number_of_rows = 6;
  required uint32 number_of_columns = 7;
  required string table_name = 8;
  optional uint32 number_of_header_rows = 9;
  optional uint32 number_of_header_columns = 10;
  optional uint32 number_of_footer_rows = 11;
  optional uint32 number_of_hidden_rows = 14;
  optional uint32 number_of_hidden_columns = 15;
  required double default_row_height = 16;
  required double default_column_width = 17;
  optional .TSP.Reference base_column_row_uids = 46;  // -> ColumnRowUIDMapArchive (sorted tables)
  optional .TST.MergeOwnerArchive merge_owner = 47;   // one source of merge ranges (see 2.8)
}
```

Note: `base_data_store` is an embedded `DataStore` message, not a reference. Summary/pivot
tables carry a second `DataStore` in `SummaryModelArchive.data_store = 2`
(`TSTArchives.proto:546-548`); plain cell reading only needs `base_data_store`.

### 1.4 TST.DataStore, TileStorage, Tile, TileRowInfo

`TSTArchives.proto:293-316`:

```proto
message DataStore {
  required .TST.HeaderStorage rowHeaders = 1;    // { bucketHashFunction=1, repeated Reference buckets=2 }
  required .TSP.Reference columnHeaders = 2;     // -> HeaderStorageBucket
  required .TST.TileStorage tiles = 3;           // embedded; the cell tiles
  required .TSP.Reference stringTable = 4;       // -> TableDataList (plain text)
  required .TSP.Reference styleTable = 5;        // -> TableDataList (styles)
  required .TSP.Reference formula_table = 6;     // -> TableDataList (formulas)
  optional .TSP.Reference formulaErrorTable = 12;
  required .TSP.Reference format_table_pre_bnc = 11;
  optional .TSP.Reference merge_region_map = 13; // -> MergeRegionMapArchive
  required .TST.TableRBTree rowTileTree = 9;     // row-start -> tileid map
  required .TST.TableRBTree columnTileTree = 10;
  optional .TSP.Reference rich_text_table = 17;  // -> TableDataList (rich text payloads)
  optional .TSP.Reference control_cell_spec_table = 21;
  optional .TSP.Reference format_table = 22;     // -> TableDataList (modern formats)
}
```

(`HeaderStorage` is `TSTArchives.proto:288-291`; `TableRBTree { Node { key=1, value=2 } }`
is `TSTArchives.proto:265-272`.)

`TSTArchives.proto:138-147`:

```proto
message TileStorage {
  message Tile {
    required uint32 tileid = 1;        // tile index (row block number)
    required .TSP.Reference tile = 2;  // -> TST.Tile
  }
  repeated .TST.TileStorage.Tile tiles = 1;
  optional uint32 tile_size = 2;           // rows per tile; Numbers/numbers-parser use 256
  optional bool should_use_wide_rows = 3;
}
```

`TSTArchives.proto:127-136`:

```proto
message Tile {
  required uint32 maxColumn = 1;
  required uint32 maxRow = 2;
  required uint32 numCells = 3;
  required uint32 numrows = 4;
  repeated .TST.TileRowInfo rowInfos = 5;
  optional uint32 storage_version = 6;     // 5 for modern files
  optional bool last_saved_in_BNC = 7;     // must be true, else pre-BNC (see 2.9)
  optional bool should_use_wide_rows = 8;
}
```

`TSTArchives.proto:116-125`:

```proto
message TileRowInfo {
  required uint32 tile_row_index = 1;             // row index WITHIN the tile
  required uint32 cell_count = 2;
  required bytes cell_storage_buffer_pre_bnc = 3; // legacy record blob (ignore)
  required bytes cell_offsets_pre_bnc = 4;        // legacy offsets (ignore)
  optional uint32 storage_version = 5;            // 5
  optional bytes cell_storage_buffer = 6;         // modern v5 records, concatenated
  optional bytes cell_offsets = 7;                // i16-LE per-column offsets into field 6
  optional bool has_wide_offsets = 8;             // if true, multiply offsets by 4
}
```

---

## 2. The binary cell-storage layout (byte-exact)

### 2.1 cell_offsets decoding

`get_storage_buffers_for_row()` (`src/numbers_parser/model.py:2837-2885`):

- `cell_offsets` is an array of **signed 16-bit little-endian** integers
  (`array("h", offsets)`, model.py:2858), one entry per column starting at column 0.
- `-1` (bytes `FF FF`) means **no cell record for that column** (empty cell).
- If `TileRowInfo.has_wide_offsets` is true, each stored offset is **multiplied by 4**
  to get the byte offset (model.py:2859-2860). (The write path stores
  `byte_offset >> 2`, model.py:1179 — records are always 4-byte multiples, see 2.3.)
- The record for column `c` spans from its byte offset to the **next non-negative**
  offset in the array (× 4 when wide), or to the end of `cell_storage_buffer` if there is
  none (model.py:2872-2883).
- Columns `>= len(offsets)` have no record (model.py:2864-2865).

### 2.2 Record header (12 bytes, version 5)

Decoded in `Cell._from_storage()` (`src/numbers_parser/cell.py:834-955`) plus
`docs/Numbers.md:9-22` in the numbers-parser repo:

| Offset | Size | Meaning |
| ------ | ---- | ------- |
| 0      | u8   | Storage version. Must be **5**; anything else is rejected (cell.py:846-849) |
| 1      | u8   | Cell type (see 2.4) |
| 2-5    | 4    | Unused/zero (docs/Numbers.md:13) |
| 6-7    | u16 LE | "extras" bit-field (cell.py:945). Duplicates some format flags: 0x01 number-format id present, 0x02 currency, 0x04 duration, 0x08 date, 0x20 bool format, 0x80 string id; byte 7 sometimes 0x80, meaning unknown (docs/Numbers.md:14-20). Informational only — do not use for parsing |
| 8-11   | u32 LE | `flags`: which optional fields follow (cell.py:853) |
| 12...  |      | Optional fields, serialized **in ascending bit order** of `flags` |

The canonical empty-cell record is exactly the 12-byte header
`05 00 00 00 00 00 00 00 00 00 00 00` (`EMPTY_STORAGE_BUFFER`,
`src/numbers_parser/constants.py:42`).

### 2.3 Flags bitfield → optional payload fields

From `src/numbers_parser/cell.py:855-912`. Walk bits from 0x1 upward; for each set bit,
read the field and advance:

| Bit        | Size | Encoding | Field |
| ---------- | ---- | -------- | ----- |
| 0x00000001 | 16   | decimal128 LE (see 2.5) | numeric value `d128` |
| 0x00000002 | 8    | float64 LE | `double` (bool / duration value) |
| 0x00000004 | 8    | float64 LE | `seconds` since 2001-01-01 (datetime, see 2.7) |
| 0x00000008 | 4    | i32 LE | `string_id` — key into `stringTable` |
| 0x00000010 | 4    | i32 LE | `rich_id` — key into `rich_text_table` |
| 0x00000020 | 4    | i32 LE | `cell_style_id` — key into `styleTable` |
| 0x00000040 | 4    | i32 LE | `text_style_id` — key into `styleTable` |
| 0x00000080 | 4    | i32 LE | conditional-style id (skip) |
| 0x00000100 | 4    | i32 LE | conditional-rule-style id (skip) |
| 0x00000200 | 4    | i32 LE | `formula_id` — key into `formula_table` |
| 0x00000400 | 4    | i32 LE | `control_id` — key into `control_cell_spec_table` |
| 0x00000800 | 4    | i32 LE | formula-error id (skip) |
| 0x00001000 | 4    | i32 LE | `suggest_id` (skip) |
| 0x00002000 | 4    | i32 LE | `num_format_id` — key into `format_table` |
| 0x00004000 | 4    | i32 LE | `currency_format_id` |
| 0x00008000 | 4    | i32 LE | `date_format_id` |
| 0x00010000 | 4    | i32 LE | `duration_format_id` |
| 0x00020000 | 4    | i32 LE | `text_format_id` |
| 0x00040000 | 4    | i32 LE | `bool_format_id` |
| 0x00080000 | 4    | i32 LE | comment id — present in files, not read by numbers-parser (cell.py:912) |
| 0x00100000 | 4    | i32 LE | import-warning id — not read (cell.py:912) |

All id fields are small non-negative integers (numbers-parser reads them as signed `<i>`;
u32 is equally correct). Every field is 4, 8, or 16 bytes, so records are always 4-byte
aligned — which is what makes the `>> 2` wide-offset encoding lossless.

### 2.4 Cell type codes (record byte 1)

`enum CellType` (`TSTArchives.proto:13-24`) plus one out-of-enum value:

| Code | Proto name | Reader meaning (cell.py:914-936) |
| ---- | ---------- | -------------------------------- |
| 0 | genericCellType | empty cell |
| 1 | spanCellType | legacy merge-covered cell; never seen in v5 records (numbers-parser raises "not recognized", cell.py:934-936) |
| 2 | numberCellType | number; value = `d128` |
| 3 | textCellType | text; value = string table lookup of `string_id` |
| 4 | formulaCellType | legacy formula type; never seen in v5 records (rejected, cell.py:934-936) |
| 5 | dateCellType | datetime; value = epoch + `seconds` |
| 6 | boolCellType | boolean; value = `double > 0.0` |
| 7 | durationCellType | duration; value = `double` seconds |
| 8 | formulaErrorCellType | error cell; value = none (formula text still reachable via `formula_id`) |
| 9 | automaticCellType | rich text; value via `rich_id` (see 2.6) |
| 10 | (not in enum) | currency-formatted number; value = `d128` (`CURRENCY_CELL_TYPE`, `src/numbers_parser/constants.py:73`; docs/Numbers.md:12) |

### 2.5 Number encoding: decimal128

16 bytes, little-endian, biased exponent `DECIMAL128_BIAS = 0x1820`
(`src/numbers_parser/constants.py:69`). Decode per `_unpack_decimal128`
(`src/numbers_parser/cell.py:1569-1578`):

```
exp      = (((b[15] & 0x7F) << 7) | (b[14] >> 1)) - 0x1820
mantissa = b[14] & 1
for i in 13..0:  mantissa = mantissa * 256 + b[i]     // 113-bit unsigned int
sign     = b[15] & 0x80
value    = (sign ? -mantissa : mantissa) * 10^exp
```

(This is IEEE 754-2008 decimal128 with binary-integer significand, ignoring
NaN/Infinity, which Numbers does not store in cells.)

### 2.6 TEXT and RICH TEXT resolution

`TST.TableDataList` (`TSTArchives.proto:223-257`), trimmed:

```proto
message TableDataList {
  enum ListType { STRING = 1; FORMAT = 2; FORMULA = 3; STYLE = 4; ...
                  RICH_TEXT_PAYLOAD = 8; ... CONTROL_CELL_SPEC = 12; }
  message ListEntry {
    required uint32 key = 1;
    required uint32 refcount = 2;
    optional string string = 3;                    // STRING lists
    optional .TSP.Reference reference = 4;         // STYLE lists
    optional .TSCE.FormulaArchive formula = 5;     // FORMULA lists
    optional .TSK.FormatStructArchive format = 6;  // FORMAT lists
    optional .TSP.Reference rich_text_payload = 9; // RICH_TEXT_PAYLOAD lists
  }
  required .TST.TableDataList.ListType listType = 1;
  required uint32 nextListID = 2;
  repeated .TST.TableDataList.ListEntry entries = 3;
}
```

- **Plain text**: dereference `DataStore.stringTable`; find the `ListEntry` with
  `entry.key == string_id`; the value is `entry.string`
  (`src/numbers_parser/model.py:726-731` via the `DataLists` helper keyed on the
  `"string"` attr, model.py:133-172,236). Missing key → empty string (model.py:730-731).
- **Rich text** (cell type 9): dereference `DataStore.rich_text_table`; find entry with
  `key == rich_id`; `entry.rich_text_payload` references a `TST.RichTextPayloadArchive`
  (`TSTArchives.proto:1303-1307`) whose `storage = 1` references a `TSWP.StorageArchive`
  (`TSWPArchives.proto:84-109`). The cell's full plain text is `StorageArchive.text[0]`
  (field 3, `repeated string text`; `src/numbers_parser/model.py:2139-2146`).
  Paragraph/bullet/hyperlink runs come from `table_para_style` (field 5),
  `table_list_style` (field 7) and `table_smartfield` (field 11) character-index tables
  (model.py:2148-2185); a value-only reader just takes `text[0]`.

### 2.7 Date encoding

Epoch is **2001-01-01 00:00:00** (naive/local; Apple Core Data epoch):
`EPOCH = datetime(2001, 1, 1)` (`src/numbers_parser/constants.py:65`). Value =
`EPOCH + seconds` where `seconds` is the float64 read under flag 0x4
(`src/numbers_parser/cell.py:921-923`). Sub-second precision is representable but Numbers
stores whole seconds. Durations are plain seconds in the `double` field (cell.py:926-927).

### 2.8 Merge ranges

Modern files: `DataStore.merge_region_map` (field 13) references
`MergeRegionMapArchive { repeated .TST.CellRange cell_range = 1; }`
(`TSTArchives.proto:646-648`), with `CellRange { CellID origin = 1; TableSize size = 2; }`
(`TSTArchives.proto:99-102`), `CellID.packedData` fixed32 field 1
(`TSTArchives.proto:68-71`), `TableSize.packedData` fixed32 field 1
(`TSTArchives.proto:88-92`). Unpack (`src/numbers_parser/model.py:908-929`):

```
col_start = origin.packedData >> 16;  row_start = origin.packedData & 0xFFFF
num_cols  = size.packedData  >> 16;   num_rows  = size.packedData  & 0xFFFF
```

numbers-parser tries three sources in order (`model.py:936-942`): (1) merge formulas in
`TableModelArchive.merge_owner.formula_store` (AST node type 67 = colon-tract;
model.py:848-874, `COLON_TRACT_NODE` at constants.py:171), (2)
`TSCE.FormulaOwnerDependenciesArchive` objects with `owner_kind == 5` (MERGE_OWNER)
mapped to the table via the calc-engine owner-UUID map (model.py:876-906), then (3)
`merge_region_map`. Implement (3) first; treat (1)/(2) as fallbacks. Cells covered by a
merge (other than the top-left anchor) usually have no storage record; the anchor holds
the value.

### 2.9 Pre-BNC (older) storage — brief

Files last saved before Numbers 10 (`Tile.last_saved_in_BNC` false) put their records in
`cell_storage_buffer_pre_bnc`/`cell_offsets_pre_bnc` (TileRowInfo fields 3/4) using
storage versions 3/4 with a different (u16 extras-driven) layout. numbers-parser
explicitly refuses them (`src/numbers_parser/model.py:1073-1076`), as should we: check
`last_saved_in_BNC == true` and `TileRowInfo.storage_version == 5` / record byte 0 == 5.

### 2.10 Formula cells

A cell with flag 0x200 has `formula_id`. The cell record itself **also contains the
cached current value** — the type byte is the result type (2/3/5/6/7/9, or 8 on error)
with the normal value fields (see `Cell.formula`, `src/numbers_parser/cell.py:650-669`:
"Formula evaluation relies on Numbers storing current values"). So a value-only reader
needs no evaluator: decode the record as usual and optionally note `is_formula`.
The formula text itself: `DataStore.formula_table` (field 6) → `TableDataList` with
`listType == FORMULA`; `entries[].formula` is a `TSCE.FormulaArchive`
(`TSCEArchives.proto:854-864`) whose `AST_node_array.AST_node` is an RPN node list
(`src/numbers_parser/model.py:1060-1068`, rendered by
`src/numbers_parser/formula.py:229-263`).

---

## 3. Row/column structure

- **Tile → grid mapping.** Tiles are 256-row blocks (`MAX_TILE_SIZE = 256`,
  `src/numbers_parser/constants.py:53`; the write path emits `tileid = tile_idx` covering
  rows `tile_idx*256 .. tile_idx*256+numrows-1` and sets `TileStorage.tile_size = 256`,
  model.py:1254-1297). Within a tile, `TileRowInfo.tile_row_index` is the row offset
  inside the tile (model.py:1167), so `row = tileid * tile_size + tile_row_index`.
  `DataStore.rowTileTree` (field 9) maps row-start → tileid for lookup without scanning.
- **numbers-parser's actual mapping** avoids tile arithmetic: it concatenates every
  `rowInfos` of every tile (in `tiles.tiles` order) into one list of "storage rows"
  (model.py:1071-1085), then builds `row_storage_map` from the row-header buckets:
  dereference each `DataStore.rowHeaders.buckets[i]` to a `HeaderStorageBucket`
  (`TSTArchives.proto:274-286`: `Header { index=1; size=2; hidingState=3;
  numberOfCells=4; }`, `headers = 2`); walking all headers in bucket order, the k-th
  header corresponds to the k-th concatenated TileRowInfo and `header.index` is its table
  row (model.py:299-313). Rows absent from the headers have no storage (all empty).
  Both mappings agree on Numbers-written files; the header walk is what the reference
  implementation ships.
- **Row heights / column widths** (brief): per-row `HeaderStorageBucket.Header.size` via
  `rowHeaders.buckets`, falling back to `TableModelArchive.default_row_height` (field 16)
  when 0.0 (model.py:1317-1335); per-column via the single `columnHeaders` bucket and
  `default_column_width` (field 17) (model.py:1369-1387).
- **Hidden rows/cols** (brief): `Header.hidingState` (field 3) nonzero means hidden;
  aggregate counts in `TableModelArchive.number_of_hidden_rows/columns` (fields 14/15).
  Hidden rows still have storage records. Header/footer band counts (fields 9/10/11) are
  presentation only; cell decoding is identical.

## 4. Minimal read algorithm

```text
readDocument(objects):                          # objects: id -> decoded archive
  doc = objects[1]                              # TN.DocumentArchive
  for sheetRef in doc.sheets:
    sheet = objects[sheetRef.identifier]
    if sheet is not TN.SheetArchive: continue
    for dRef in sheet.drawable_infos:
      info = objects[dRef.identifier]
      if info is not TST.TableInfoArchive: continue
      yield readTable(sheet.name, objects[info.tableModel.identifier])

readTable(sheetName, tm):                       # tm: TST.TableModelArchive
  bds     = tm.base_data_store
  strings = keyMap(objects[bds.stringTable.identifier])     # key -> entry.string
  richTbl = objects[bds.rich_text_table.identifier] if set  # key -> rich_text_payload ref
  merges  = decodeMergeMap(objects[bds.merge_region_map.identifier]) if set
  headerIdx = flatten(objects[b.identifier].headers
                      for b in bds.rowHeaders.buckets)      # k-th header -> k-th rowInfo
  k = 0
  for t in bds.tiles.tiles:                     # storage rows, in file order
    tile = objects[t.tile.identifier]
    assert tile.last_saved_in_BNC
    for ri in tile.rowInfos:
      row = headerIdx[k].index; k += 1          # == t.tileid*tileSize + ri.tile_row_index
      offsets = int16LEArray(ri.cell_offsets)   # one per column
      wide, buf = ri.has_wide_offsets, ri.cell_storage_buffer
      for col in 0 .. tm.number_of_columns-1:
        if col >= len(offsets) or offsets[col] < 0: continue        # empty
        start = offsets[col] * (4 if wide else 1)
        end   = nextNonNegative(offsets, col) * (4 if wide else 1)  # or len(buf)
        yield (row, col, decodeCell(buf[start:end], strings, richTbl))

decodeCell(rec, strings, richTbl):
  assert rec[0] == 5
  type  = rec[1]
  flags = u32le(rec, 8)
  p = 12
  for bit in [0x1,0x2,0x4,...,0x40000]:         # table in section 2.3
    if flags & bit: read field at p; p += size(bit)
  switch type:
    0:  return Empty
    2, 10: return d128                          # decimal128 decode, section 2.5
    3:  return strings[string_id] ?? ""
    5:  return date(2001-01-01) + seconds
    6:  return double > 0.0
    7:  return durationSeconds(double)
    8:  return Error                            # formula via formula_id if wanted
    9:  return richText(richTbl, rich_id)       # payload -> storage -> text[0]
```

Reference implementation of the same loop: `Table.__init__`
(`src/numbers_parser/document.py:470-494`) calling `storage_buffer`
(`src/numbers_parser/model.py:1087-1097`) and `Cell._from_storage`
(`src/numbers_parser/cell.py:834-955`).

Edge cases worth handling: `merge_region_map.identifier == 0` (no merges,
model.py:911-913); string key missing from `stringTable` (empty string, model.py:728-731);
rows with no header entry (fully empty row); tables where `cell_offsets` is shorter than
`number_of_columns` (trailing empties); record byte 0 != 5 or `last_saved_in_BNC` false
(reject as pre-BNC).
