# iWork 2013+ (IWA) Format Invariants — extracted from reference implementations

Sources (cloned, citations use paths relative to the clone roots):

- `keynote-parser` = github.com/psobot/keynote-parser @ `6bc3849` (2025-04-13), Python, reads+writes `.key`, ships protos for Keynote 14.4 only (`keynote-parser/keynote_parser/versions/` contains only `v14_4`).
- `numbers-parser` = github.com/masaccio/numbers-parser @ `2dd9dbe` (2026-07-30, v4.19.0), Python, reads+writes `.numbers`. Its IWA codec (`numbers-parser/src/numbers_parser/iwafile.py:L1`) is an explicit fork of keynote-parser's `codec.py`, so the byte-level layers agree almost everywhere; differences are flagged below.

Some byte-level claims are additionally verified against the Apple-generated fixture `numbers-parser/src/numbers_parser/data/empty.numbers` (saved by Numbers 14.1, per its `Metadata/Properties.plist` `fileFormatVersion` = "14.1.1").

---

## A. Snappy / IWA chunk framing

### A1. Chunk header layout

An `.iwa` file is a sequence of chunks. Each chunk = **4-byte header + compressed payload**:

- Byte 0: chunk type, must be `0x00`. Both parsers hard-fail on anything else; `0x00` is the only type handled. `keynote-parser/keynote_parser/codec.py:L99-L102`:
  ```python
  if first_byte != 0x00:
      raise ValueError("IWA chunk does not start with 0x00! (found %x)" % first_byte)
  ```
  (identical: `numbers-parser/src/numbers_parser/iwafile.py:L71-L75`)
- Bytes 1..3: **payload length as 3-byte little-endian unsigned int** (length of the *compressed* payload, not counting the 4 header bytes). Decoded by zero-padding to 4 bytes: `keynote-parser/keynote_parser/codec.py:L104-L107`:
  ```python
  unpacked = struct.unpack_from("<I", bytes(header[1:]) + b"\x00")
  length = unpacked[0]
  chunk = data[4 : 4 + length]
  ```
  (identical: `numbers-parser/src/numbers_parser/iwafile.py:L77-L79`)
- **No stream identifier, no CRC, no magic** anywhere in the .iwa container. `numbers-parser` sniffs whether a blob is IWA purely by walking this chunk chain and checking the lengths tile the file exactly (`numbers-parser/src/numbers_parser/iwafile.py:L347-L360`, `is_iwa_file`).

All decompressed chunk payloads are **concatenated before archive parsing**, so a protobuf archive may straddle chunk boundaries (`keynote-parser/keynote_parser/codec.py:L117-L124`: `data = b"".join(cls._decompress_all(data))`; same `numbers-parser/src/numbers_parser/iwafile.py:L89-L97`).

Empirical check (`Index/Metadata.iwa` from Apple's `empty.numbers`): first bytes `00 bc 41 00` = type 0, compressed length 0x0041BC = 16828; zip entry is 16832 bytes = 4 + 16828. One chunk for the whole file.

### A2. Write-side chunking and compression

Both writers serialize all archives to one uncompressed byte string, then split it into **65536-byte (64 KiB) uncompressed pieces** and snappy-compress each piece with real compression (python-snappy, i.e. Google's C snappy — not literal-only blocks). The 3-byte header length is the *compressed* size. `keynote-parser/keynote_parser/codec.py:L133-L144`:

```python
def to_buffer(self):
    uncompressed = b"".join([archive.to_buffer() for archive in self.archives])
    payloads = []
    while uncompressed:
        payloads.append(snappy.compress(uncompressed[:65536]))
        uncompressed = uncompressed[65536:]
    return b"".join(
        [b"\x00" + struct.pack("<I", len(payload))[:3] + payload
         for payload in payloads])
```

Byte-identical logic in `numbers-parser/src/numbers_parser/iwafile.py:L106-L114`. Dependencies: `python-snappy>=0.5.3` (`keynote-parser/requirements.txt:L4`), `python-snappy>=0.7` (`numbers-parser/pyproject.toml:L10`).

### A3. Snappy dialect quirks

- Each chunk payload is **raw snappy format** (starts with the uncompressed-length varint preamble), as produced/consumed by `snappy.compress`/`snappy.uncompress`. It is **not** the snappy *framing* format — there is no `sNaPpY` stream identifier chunk and no CRC-32C; Apple's 4-byte `00 + len24` header plays that role. Verified on Apple's own file: after the 4-byte header, `Index/Metadata.iwa` continues `e7 b1 01` (varint 22759 = uncompressed size) then `f0 69` (a standard raw-snappy literal tag), i.e. plain raw snappy.
- Read-side tolerance: if `snappy.uncompress` throws, the chunk payload is passed through as if it were stored uncompressed — `keynote-parser/keynote_parser/codec.py:L109-L115`:
  ```python
  try:
      yield snappy.uncompress(chunk)
  except Exception:
      # Try to see if this data isn't compressed in the first place.
      yield chunk
  ```
  (identical `numbers-parser/src/numbers_parser/iwafile.py:L81-L87`). Neither writer ever emits uncompressed chunks.
- No other deviation from standard snappy exists in either repo (they call the stock library; there is no custom snappy implementation to have offset/length quirks).

---

## B. Archive stream structure

### B4. One archive within the decompressed stream

Layout per archive segment (`keynote-parser/keynote_parser/codec.py:L329-L334`, `get_archive_info_and_remainder`; identical `numbers-parser/src/numbers_parser/iwafile.py:L289-L294`):

1. **varint** (protobuf base-128, decoded with `_DecodeVarint32`) = byte length of the ArchiveInfo message;
2. **`TSP.ArchiveInfo`** message of exactly that length;
3. **payloads**, one per `ArchiveInfo.message_infos[i]`, concatenated in `message_infos` order with **no separators**; payload *i* occupies exactly `message_infos[i].length` bytes. Parsing walks a running offset: `keynote-parser/keynote_parser/codec.py:L207-L239` (`message_payload = payload[n : n + message_info.length]` … `n += message_info.length`); the remainder after the last payload is the start of the next archive (`return cls(archive_info, payloads), payload[n:]`, L239).

**Multiple message_infos / merge semantics:** a `message_info` with `type == 0` when `archive_info.should_merge` is set (and at least one payload already parsed) is a **patch**; its payload is decoded using the *type of the base message*, found via `archive_info.message_infos[message_info.base_message_index].type` — `keynote-parser/keynote_parser/codec.py:L209-L217`. keynote-parser additionally interprets `message_info.diff_field_path` and refuses anything but exactly one path element, and refuses `fields_to_remove` (`codec.py:L160-L177`, raises `NotImplementedError`). numbers-parser deliberately ignores `diff_field_path`/`fields_to_remove` and just parses the patch payload as the base type (`numbers-parser/src/numbers_parser/iwafile.py:L130-L138`, comment at L132-L134). Patches are re-serialized with `SerializePartialToString()` (missing required fields allowed): `codec.py:L179-L180`, `iwafile.py:L137-L138`. Neither library ever *creates* multi-message or merge archives when writing new objects.

### B5. ArchiveInfo / MessageInfo / FieldInfo definitions

From `numbers-parser/src/protos/TSPArchiveMessages.proto:L6-L56` — the file is **byte-identical** to `keynote-parser/protos/versions/14.4/TSPArchiveMessages.proto` (verified with `diff`):

```proto
message ArchiveInfo {
  optional uint64 identifier = 1;
  repeated .TSP.MessageInfo message_infos = 2;
  optional bool should_merge = 3;
}

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

message FieldPath {
  repeated uint32 path = 1 [packed = true];
}
```

### B6. TSP.Reference

`numbers-parser/src/protos/TSPMessages.proto:L24-L28` (identical in `keynote-parser/protos/versions/14.4/TSPMessages.proto:L24-L28`):

```proto
message Reference {
  required uint64 identifier = 1;
  optional int32 deprecated_type = 2;
  optional bool deprecated_is_external = 3;
}
```

Also relevant: `message DataReference { required uint64 identifier = 1; }` (`TSPMessages.proto:L30-L32`) and `message UUID { required uint64 lower = 1; required uint64 upper = 2; }` (`TSPMessages.proto:L126-L129`).

---

## C. Package / zip layout

### C7. Layouts handled; Metadata/ contents

**keynote-parser** distinguishes only by suffix: a path ending `.key` is an **outer zip** containing `Index/*.iwa`, `Data/*`, `Metadata/*` directly; anything else is treated as an unpacked directory tree (`keynote-parser/keynote_parser/file_utils.py:L35-L39`). Zip member names are fixed from cp437 to UTF-8 on read (`file_utils.py:L44-L45`). It has **no nested `Index.zip` support** and **never parses** `Metadata/Properties.plist`, `Metadata/DocumentIdentifier`, or `Metadata/BuildVersionHistory.plist` — non-IWA files pass through byte-identical (`file_utils.py:L216`: `sink(filename, contents or handle.read())`).

**numbers-parser** handles three layouts (`numbers-parser/src/numbers_parser/iwork.py`):
- **Directory package**: `.numbers` directory containing an `Index.zip` (all the `.iwa`s) plus loose `Metadata/`, `Data/`, `preview*.jpg` files — `iwork.py:L120-L122` and `_read_objects_from_package` L188-L203 (any file named `index.zip`, case-insensitive, is opened as a zip).
- **Single zip, nested**: `.numbers` zip containing `Index.zip` — `_read_objects_from_zipfile` recurses into any entry whose name ends with `index.zip` (`iwork.py:L214-L218`).
- **Single zip, flat**: `.numbers` zip with `Index/*.iwa` entries directly (the fixture `empty.numbers` is this shape).

`Metadata/` in a real file holds `Properties.plist` (binary plist with keys observed in `empty.numbers`: `revision`, `documentUUID`, `versionUUID`, `privateUUID`, `isMultiPage`, `stableDocumentUUID`, `shareUUID`, `fileFormatVersion`), `DocumentIdentifier` (bare UUID text, equal to `documentUUID`), and `BuildVersionHistory.plist`. numbers-parser *reads* `Properties.plist` for `fileFormatVersion` and *requires* both plists to exist (`iwork.py:L66-L93`), but **neither parser ever rewrites any Metadata/ file** — they are stored as opaque blobs and written back verbatim (`numbers-parser/src/numbers_parser/containers.py:L62-L63`, `iwork.py:L155-L174`; keynote-parser as above).

### C8. Zip re-packing: compression and order

**keynote-parser** writes with `ZipFile(output_path, "w")` and `zipfile.writestr(...)` — Python's default `compression=ZIP_STORED`, i.e. **every entry is STORED (uncompressed)** (`keynote-parser/keynote_parser/file_utils.py:L155-L162`). Entry order is the insertion order of its `files_to_write` dict, which equals read order = **sorted by filename** (`file_utils.py:L46`: `sorted(zipfile.filelist, key=lambda x: x.filename)`). No code gives any file a privileged position, so neither library treats zip order as significant. Apple's own `empty.numbers` also uses STORED for every entry (verified: `compress_type=0` for all members).

**numbers-parser** likewise: `zipf = ZipFile(filepath, "w")` + `writestr` (STORED) for single-file saves (`numbers-parser/src/numbers_parser/iwork.py:L167-L174`), and `ZipFile(filepath / "Index.zip", "w")` for package saves, with non-IWA blobs written to the filesystem next to it (`iwork.py:L154-L164`). Order = `file_store` dict insertion order (original read order, with newly created IWA files appended at the end).

### C9. Metadata.iwa / TSP.PackageMetadata

`Index/Metadata.iwa` is a **completely normal IWA archive** — same chunk framing, same varint+ArchiveInfo header; numbers-parser reads it through the same `_store_blob` path as every other component (`iwork.py:L227-L242`). Invariants:

- Object identifier: **2** (`numbers-parser/src/numbers_parser/constants.py:L61-L62`: `DOCUMENT_ID = 1`, `PACKAGE_ID = 2`; all PackageMetadata mutation goes through `self._objects[PACKAGE_ID]`).
- Type ID: **11006 = TSP.PackageMetadata** (`numbers-parser/src/numbers_parser/generated/mapping.py:L588`; `keynote-parser/keynote_parser/versions/v14_4/mapping.py:L689`).
- Empirical decode of `empty.numbers`'s `Index/Metadata.iwa` decompressed head: `20` (ArchiveInfo len 32) `08 02` (identifier=2) `12 1c` (message_infos) `08 fe 55` (type=11006) `12 03 01 00 05` (version=[1,0,5] packed) `18 91 b0 01` (length=22545) `22 09 …` (one FieldInfo: path=[10], type=ObjectReference, unknown_field_rule=IgnoreAndPreserve — field 10 is `data_metadata_map`) `2a 03 db b0 37` (object_references=[907355]).

Proto definitions, `numbers-parser/src/protos/TSPArchiveMessages.proto` (identical in keynote-parser 14.4):

```proto
// L107-L124
message PackageMetadata {
  enum PackageType { Default = 0; Directory = 1; SingleFile = 2; }
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

// L58-L78
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

// L80-L84
message ComponentExternalReference {
  required uint64 component_identifier = 1;
  optional uint64 object_identifier = 2;
  optional bool is_weak = 3;
}

// L86-L94
message ComponentDataReference {
  message ObjectReference {
    required uint64 object_identifier = 1;
    required uint32 count = 2;
  }
  required uint64 data_identifier = 1;
  repeated .TSP.ComponentDataReference.ObjectReference object_reference_list = 2;
}

// L141-L165 (trimmed to the fields either library writes; full list in the proto)
message DataInfo {
  enum DownloadPriority { High = 0; Default = 1; }
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

// L167-L178
message DataMetadataMap {
  message DataMetadataMapEntry {
    required uint64 data_identifier = 1;
    required .TSP.Reference data_metadata = 2;
  }
  repeated .TSP.DataMetadataMap.DataMetadataMapEntry data_metadata_entries = 1;
}
message DataMetadata {
  optional .TSP.Color fallback_color = 1;
}
```

---

## D. Mutation invariants

### D10. keynote-parser text find/replace, end-to-end

Modules: `keynote_parser/replacement.py` (the algorithm), `keynote_parser/file_utils.py` (`process_file`, which files), `keynote_parser/codec.py` (length fix-up). (`macos_app_version.py` is unrelated — it only compares installed-app version strings.)

- **Which archives:** every `.iwa` in the package is parsed; a `Replacement` fires on any object matching the key path `chunks.[].archives.[].objects.[].text.[]` (`keynote-parser/keynote_parser/replacement.py:L37`, `DEFAULT_KEY_PATH`). i.e. any archive object with a `text` field — in practice `TSWP.StorageArchive`. `should_replace` probes the *parsed protobuf* via `hasattr`/`getattr` (`replacement.py:L140-L147`); if any replacement matches, the whole IWA file is converted to dict form, rewritten, and rebuilt (`file_utils.py:L177-L191`: `data = file.to_dict(); data = replacement.perform_on(data); sink(filename, IWAFile.from_dict(data))`). Untouched IWA files are still re-serialized (recompressed) but not dict-round-tripped (`file_utils.py:L191`).
- **Text replacement** is `re.sub(self.find, self.replace, …)` applied *per character-style run* (`replacement.py:L101-L112`).
- **table_char_style fix-up** (`correct_charstyle_replacement`, `replacement.py:L81-L115`): if `tableCharStyle` has >1 entries, the text is split at consecutive entries' `characterIndex`, each run is replaced independently, and every entry's `characterIndex` is rewritten to the cumulative start of its new run (`replacement.py:L113-L114`). A replacement spanning two style runs can therefore never match (acknowledged TODO at L89-L90).
- **table_para_style fix-up** (`correct_multiline_replacement`, `replacement.py:L50-L79`): recomputes one offset per paragraph — 0, then `i + 1 + surrogate_pair_correction` after each `"\n"` — and writes them into `tableParaStyle.entries[k].characterIndex` (`replacement.py:L77-L78`). `surrogate_pair_correction` adds +1 for every char with `ord(c) > 0xFFFF` (`replacement.py:L66-L70`), i.e. **character indexes are UTF-16 code-unit offsets**, not Unicode code points. If the paragraph count changed, it raises `NotImplementedError` (`replacement.py:L73-L75`). The docstring records the crash mode this prevents: a stale index past end-of-text makes Keynote size the text box 2^16 points tall and crash (`replacement.py:L56-L59`).
  - Internal inconsistency worth knowing: the char-style path computes new indexes with Python `len()` (code points, `replacement.py:L107-L110`) while the para path corrects for surrogate pairs — so astral characters inside styled runs would still drift.
- **Not fixed up:** `table_smartfield`, `table_para_data`, `table_attachment`, `table_list_style`, `table_para_starts`, etc. — nothing else in the storage is touched.
- **Length bookkeeping** is automatic at serialization: `IWAArchiveSegment.to_buffer` re-measures each object and overwrites `message_info.length` (`keynote-parser/keynote_parser/codec.py:L262-L275`). numbers-parser has no find/replace feature at all (only `redact_strings` for producing sanitized test fixtures, `numbers-parser/src/numbers_parser/iwafile.py:L231-L258`).

### D11. What is updated around an edited object

Both libraries, on serialize (`keynote-parser/keynote_parser/codec.py:L262-L279`; `numbers-parser/src/numbers_parser/iwafile.py:L210-L229`):

- **`MessageInfo.length`**: recomputed to `len(obj.SerializeToString())` whenever it differs.
- **`ArchiveInfo` everything else** (`identifier`, `should_merge`, `message_infos[].type/version/field_infos/base_message_index/...`): preserved as parsed. In keynote-parser's YAML round-trip, `length` is deliberately deleted from the dict (`codec.py:L290-L294`) and re-seeded with a dummy 0 (`codec.py:L322-L326`) before the write-time fix-up; `field_infos` survive the round-trip as part of the header dict.
- **`object_references`**: keynote-parser **never recomputes** them — preserved verbatim. numbers-parser **does** recompute them for every object it writes back: `copy_object_to_iwa_file` walks the new message for `TSP.Reference` submessages (`find_references`, `numbers-parser/src/numbers_parser/iwafile.py:L316-L330`), then pops all existing `message_infos[0].object_references` and appends the found identifiers (`iwafile.py:L333-L344`) — but only if at least one reference was found (`if len(references) > 0`, L339), so an object edited down to zero references keeps its stale list.
- **`data_references`**: never touched by either library (no occurrence outside the protos).
- **Unknown fields**: numbers-parser edits parsed messages in place, so protobuf's unknown-field preservation applies on reserialization. keynote-parser's *changed-file* path round-trips through `MessageToDict`/`ParseDict(..., ignore_unknown_fields=True)` (`codec.py:L313-L319`), which silently **drops** any field missing from its compiled protos.

### D12. numbers-parser save: components, IDs, registration

Pipeline: `Document.save` → per-table `recalculate_table_data` (`numbers-parser/src/numbers_parser/document.py:L127-L158`; pivot tables skipped with a warning L149-L155) → `_NumbersModel.save` (`model.py:L252-L253`) → `ObjectStore.save` → `IWork.save`. **Every** `.iwa` in the file store is re-serialized (they are held as parsed `IWAFile` objects, `iwork.py:L242`); non-IWA blobs are written back verbatim.

- **Object-ID allocation**: at load, `ObjectStore.__init__` sets `_max_id = max(self._objects.keys())` rounded **up to the next multiple of 1,000,000** (`numbers-parser/src/numbers_parser/containers.py:L51-L53`), so new IDs live in a fresh block far above existing ones. Each `new_message_id()` increments the counter **and writes it into `PackageMetadata.last_object_identifier`** (field 1 of object 2): `containers.py:L74-L78`:
  ```python
  def new_message_id(self):
      self._max_id += 1
      self._objects[PACKAGE_ID].last_object_identifier = self._max_id
      return self._max_id
  ```
- **Creating an object** (`create_object_from_dict`, `containers.py:L80-L101`): builds a fresh single-message archive via `create_iwa_segment` (`iwafile.py:L297-L313`) with `ArchiveInfo.identifier = new_id` and `MessageInfo = {type: NAME_ID_MAP[class], version: [1, 0, 5]}` (no field_infos, no object_references — those come later, see D13). The segment is appended to an existing IWA file whose path contains the given key (e.g. `"CalculationEngine"` → `Index/CalculationEngine.iwa`), or, if no file matches (e.g. `"Index/Tables/Tile-{}"`), a **new file** `Index/Tables/Tile-<new_id>.iwa` is created containing a single chunk (`containers.py:L92-L97`).
- **Component registration**: objects that get their own IWA file also get a **new `ComponentInfo`** appended to `PackageMetadata.components` — `add_component_metadata` (`numbers-parser/src/numbers_parser/model.py:L1203-L1217`):
  ```python
  component_info = TSPArchiveMessages.ComponentInfo(
      identifier=object_id,
      locator=locator,                     # e.g. "Tables/Tile-907000123"
      preferred_locator=preferred_locator, # digits suffix stripped, e.g. "Tables/Tile"
      is_stored_outside_object_archive=False,
      document_read_version=[2, 0, 0],
      document_write_version=[2, 0, 0],
      save_token=1,
  )
  ```
  followed by `add_component_reference(object_id, location=parent)` which appends `ComponentExternalReference(component_identifier=object_id)` to the *parent* component (e.g. `CalculationEngine`). Note the component's `identifier` equals the root object's ID.
- **save_token / versions / features on *existing* components**: never bumped — `save_token=1` at `model.py:L1214` is the only write; `PackageMetadata.save_token`, `read_version`, `write_version`, `file_format_version`, and all `feature_infos` are preserved untouched.
- **Flushing edits**: `ObjectStore.update_object_file_store` (`containers.py:L103-L113`) copies every tracked in-memory protobuf back into `archives[…].objects[0]` of its IWA file and recomputes `object_references` (see D11); called at the end of `recalculate_table_data` (`model.py:L1299`).
- **GC**: `remove_unreferenced_objects` (`containers.py:L115-L148`) deletes archives whose IDs are referenced from nowhere, always keeping `DOCUMENT_ID`, `PACKAGE_ID`, and every ID listed in `PackageMetadata.components` (`containers.py:L117`, `L136-L137`).

### D13. Cross-component references

Two independent bookkeeping layers exist, and numbers-parser maintains both:

1. **`MessageInfo.object_references` computed from content** — yes, this code exists: `find_references` + `copy_object_to_iwa_file` (`numbers-parser/src/numbers_parser/iwafile.py:L316-L344`) recursively collects `TSP.Reference.identifier` from every field of the written message and replaces the archive's `message_infos[0].object_references` with that list. It does **not** distinguish same-component from cross-component targets — all referenced IDs go in. (keynote-parser has no equivalent.)
2. **`ComponentInfo.external_references` in PackageMetadata** — `add_component_reference` (`numbers-parser/src/numbers_parser/model.py:L1219-L1236`) appends to the *referencing* component's `external_references`:
   - `{object_identifier: X, component_identifier: C}` when a specific object `X` living in component `C` is referenced (e.g. the Document component records `{object_identifier: table_info_id, component_identifier: calc_engine_id}` after a new table's `TableInfoArchive` — created inside `CalculationEngine` — is referenced from a sheet: `model.py:L1619-L1623`; stylesheet objects referenced by a caption `StorageArchive` in CalculationEngine: `model.py:L458-L468`);
   - `{component_identifier: X}` alone when the target is itself a component root (`model.py:L1228-L1231`);
   - `is_weak=True` supported (a new `SheetArchive` in Document is weak-referenced from CalculationEngine: `model.py:L1761-L1766`).
3. `ComponentInfo.object_uuid_map_entries` gains an entry when an object addressed by UUID is added (caption info: `model.py:L484-L490`, `ObjectUUIDMapEntry(identifier=caption_info_id, uuid=NumbersUUID().protobuf2)`).
4. Formula machinery: new tables also require `TSCE.FormulaOwnerDependenciesArchive` objects in CalculationEngine (one `owner_kind=TABLE_MODEL`, one `owner_kind=HAUNTED_OWNER=35`), registered in `calc_engine.dependency_tracker.formula_owner_dependencies` and `owner_id_map` with `internal_owner_id = max+1` (`model.py:L1634-L1750`; design notes in `numbers-parser/docs/Numbers.md:L24-L113`).

### D14. Adding Data/ files (images)

numbers-parser only (keynote-parser never *adds* data, see below):

- Bytes: `store_image` writes the raw image to `Data/<filename>` in the file store; duplicate names raise `IndexError` — no auto-renaming/`-NNN` suffixing (`numbers-parser/src/numbers_parser/model.py:L2687-L2693`).
- Metadata: `add_cell_style` computes **`digest = hashlib.sha1(data).digest()`** (raw 20 bytes) and appends to `PackageMetadata.datas`(`model.py:L1958-L1974`):
  ```python
  datas.append(TSPArchiveMessages.DataInfo(
      identifier=image_id,
      digest=digest,
      preferred_file_name=style.bg_image.filename,
      file_name=style.bg_image.filename,
      materialized_length=len(style.bg_image.data)))
  ```
  Duplicate content is deduplicated by digest (`model.py:L1959-L1961`).
- Data-ID allocation: `next_image_identifier()` = `max(identifier for DataInfo in PackageMetadata.datas) + 1` (`model.py:L2695-L2700`) — DataInfo identifiers are a **separate ID space** from object IDs.
- **Not updated**: `ComponentInfo.data_references`, `MessageInfo.data_references`, and the `data_metadata_map` are never maintained (no code touches them).
- keynote-parser's image path only **replaces the bytes of an existing** `Data/` file (matched by name prefix, rescaled with PIL to the original's pixel size and saved in the original format, `keynote-parser/keynote_parser/file_utils.py:L194-L215`) and **does not update `DataInfo.digest`** in Metadata.iwa — i.e. it ships with a digest/content mismatch that Keynote evidently tolerates.

### D15. Deliberate preservation / refusals

- All non-IWA files (plists, previews, Data/) are passed through **byte-identical** in both libraries (C7). IWA files, however, are always re-serialized — neither library preserves original IWA bytes even when unchanged (recompression is not byte-stable).
- numbers-parser stores any `.iwa` that fails the `is_iwa_file` structural sniff as an opaque blob, passed through untouched (`numbers-parser/src/numbers_parser/iwork.py:L227`, `iwafile.py:L347-L360`).
- numbers-parser refuses to modify **pivot tables** (`numbers-parser/src/numbers_parser/document.py:L147-L155`, warns "Not modifying pivot table" and skips recalculation).
- keynote-parser refuses ProtobufPatch archives with `fields_to_remove` or multi-element `diff_field_path` (`keynote-parser/keynote_parser/codec.py:L162-L171`).
- `field_infos`, `MessageInfo.version`, `should_merge`, `diff_*` fields are carried through unmodified by both.
- numbers-parser's biggest invariant strategy: new documents are never built from scratch — `Document()` starts from the bundled Apple-saved `empty.numbers` (`numbers-parser/src/numbers_parser/constants.py:L22`, `model.py:L227-L228`) and mutates it.

---

## E. Misc

### E16. Password / encryption detection

numbers-parser: an encrypted iWork file is detected by the presence of a zip member named **`.iwph`** (iWork protection header) — `numbers-parser/src/numbers_parser/iwork.py:L205-L212`:
```python
try:
    _ = zipf.getinfo(".iwph")
except KeyError:
    pass
else:
    msg = f"{zipf.filename}: encrypted documents are not supported"
    raise UnsupportedError(msg)
```
Neither library implements decryption; keynote-parser has no detection at all (it would fail later on non-zip/undecodable content).

### E17. Version gates

- numbers-parser reads `fileFormatVersion` from `Metadata/Properties.plist` (`iwork.py:L55-L93`) and warn-only checks it against `SUPPORTED_NUMBERS_VERSIONS` ("10.0"…"14.5", "26.0"…"26.3", `numbers-parser/src/numbers_parser/constants.py:L77-L101`; check at `iwork.py:L126-L128`, missing plists are a hard `FileFormatError`, malformed plist only a warning `iwork.py:L86-L92`). On save, nothing is bumped: Properties.plist, `PackageMetadata.read_version/write_version/file_format_version` and existing component versions are all preserved. The only versions *written* are on **new** structures: `MessageInfo.version = [1, 0, 5]` (`iwafile.py:L306`) and `ComponentInfo.document_read_version = document_write_version = [2, 0, 0]` (`model.py:L1211-L1212`).
- keynote-parser warn-only compares the **installed Keynote.app** version (`/Applications/Keynote.app/Contents/version.plist`) against its supported version (`keynote-parser/keynote_parser/bundle_utils.py:L25-L35`, `L99-L119`); it never reads or writes version metadata inside the document. One proto schema (v14.4) is used for both read and write (`keynote-parser/keynote_parser/versions/__init__.py:L13`, `codec.py:L21-L38`).

### E18. TSWP.StorageArchive fields touched by keynote-parser replacement

From `keynote-parser/protos/versions/14.4/TSWPArchives.proto:L84-L123` (`message StorageArchive`), the replacement logic touches exactly:

| Field | Number | What is changed | Where |
|---|---|---|---|
| `text` | 3 (`repeated string`) | `re.sub` result written to `text[0]` | `replacement.py:L112`, key path `…objects.[].text.[]` L37 |
| `table_para_style` | 5 (`ObjectAttributeTable`) | each `entries[k].characterIndex` rewritten to new paragraph offsets (UTF-16 units) | `replacement.py:L72-L78` |
| `table_char_style` | 8 (`ObjectAttributeTable`) | each `entries[k].characterIndex` rewritten to new style-run starts | `replacement.py:L98-L114` |

All other attribute tables (`table_para_data`=6, `table_list_style`=7, `table_attachment`=9, `table_smartfield`=11, `table_layout_style`=12, `table_para_starts`=14, `table_language`=19, etc.) are left as-is — which is safe only when replacements do not change string length across their index boundaries.

---

## Cross-repo agreement summary

The two implementations agree on every byte-level structure (chunk framing, 64 KiB write chunking, archive layout, protos — their `TSPArchiveMessages.proto`/`TSPMessages.proto` are identical). They differ only in policy: (1) merge-patch payloads — keynote-parser validates `diff_field_path` and decodes the patched *field's* type, numbers-parser decodes the whole base type and ignores diff paths; (2) keynote-parser never recomputes `object_references`, numbers-parser recomputes them from message content on every save; (3) keynote-parser's changed-file dict round-trip drops unknown fields, numbers-parser's in-place editing preserves them; (4) only numbers-parser maintains PackageMetadata (`last_object_identifier`, `components`, `datas`, external references) — keynote-parser leaves Metadata.iwa semantically untouched.
