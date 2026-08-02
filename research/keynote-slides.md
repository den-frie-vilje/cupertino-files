# Keynote slide model — KN.* archives (reading slides, notes, transitions)

How a modern `.key` file encodes its slide structure, speaker notes and
transitions, precisely enough to read it by **field number** with the raw
protobuf machinery in this repo. Schemas: `proto/keynote-14.4/KNArchives.proto`
(verbatim from psobot/keynote-parser @ `6bc3849`, dumped from Keynote 14.4 —
line numbers below refer to the vendored copy). Registry IDs:
`keynote_parser/versions/v14_4/mapping.py` (lldb dump of Keynote's
`TSPRegistry sharedRegistry` via `dumper/extract_mapping.py`).

Everything marked **[verified]** was checked against real files with this
repo's own reader (`dist/`): `fixtures/tika-testKeynote2013.key`,
`fixtures/tika-testKeynote2018.key`, keynote-parser's
`tests/data/simple-oneslide.key` / `table.key` / `unicode-asset-filename.key`,
and libetonyek's `keynote6-file.key` (earliest IWA era).

## Registry type IDs (KN block, IDs < 200 overlap TP/TN per app)

From `keynote_parser/versions/v14_4/mapping.py:77-102` (`TSPRegistryMapping`);
identical in WorkKit's mid-2026 Frida dump. `TSP.MessageInfo.type` → message:

| ID | Message | Notes |
|---|---|---|
| 1 | `KN.DocumentArchive` | root object, component `Index/Document.iwa` **[verified]** |
| 2 | `KN.ShowArchive` | **[verified]** |
| 3 | `KN.UIStateArchive` | view state, ignore for reading |
| 4 | `KN.SlideNodeArchive` | **[verified]** |
| **5** | `KN.SlideArchive` | content *and* master slides **[verified]** |
| **6** | `KN.SlideArchive` | legacy master-slide slot, same class — accept both |
| 7 | `KN.PlaceholderArchive` | title/body/object/slide-number **[verified]** |
| 8 | `KN.BuildArchive` | animation builds |
| 9 | `KN.SlideStyleArchive` | slide background/style **[verified]** |
| 10 | `KN.ThemeArchive` | **[verified]** |
| 12 | `KN.PlaceholderArchive` | second placeholder slot, same class |
| 14 | `TSWP.TextualAttachmentArchive` | KN-local registration of a TSWP type |
| 15 | `KN.NoteArchive` | speaker notes **[verified]** |
| 16–18 | `KN.Recording*Archive` | slideshow recordings |
| 19/20 | `KN.ClassicStylesheetRecordArchive` / `ClassicThemeRecordArchive` | |
| 21 | `KN.Soundtrack` | |
| 22 | `KN.SlideNumberAttachmentArchive` | |
| 26 | `KN.MotionBackgroundStyleArchive` | dynamic backgrounds (Keynote 14) |
| 153 | `KN.BuildChunkArchive` | referenced from `SlideArchive.buildChunks` |
| 100–195 | `KN.Command*` etc. | undo/collab commands, never in a saved document body |

There is **no `KN.MasterSlideArchive` message** — not in 14.4 and not even in
iWork '13 (obriensp's 2013 `KNArchives.proto` already modeled masters as
`SlideArchive`). Both ID 5 and 6 decode as `KN.SlideArchive`; in every fixture
examined, masters and content slides alike are stored under type **5**
**[verified]** (6 never appeared, but a reader should treat 5 and 6
identically). Masters are distinguished *structurally* (see "Masters" below).

Shared types needed here: 2001 `TSWP.StorageArchive` (text), 2011
`TSWP.ShapeInfoArchive`, 400–402 `TSS.*`, 3002+ drawables (see
`research/type-registry-notes.md`).

## Object graph

```
KN.DocumentArchive (type 1, id 1, "Index/Document.iwa")
  └─ show(2) ──▶ KN.ShowArchive (type 2)
       ├─ theme(2) ──▶ KN.ThemeArchive (type 10)
       │     └─ templates(2)* ──▶ KN.SlideNodeArchive (type 4)   [masters]
       │           └─ slide(2) ──▶ KN.SlideArchive (type 5/6, "Index/MasterSlide-N.iwa")
       ├─ slideTree(3)  — INLINE KN.SlideTreeArchive, not a Reference
       │     └─ slides(2)* ──▶ KN.SlideNodeArchive (type 4)      [presentation order]
       │           ├─ children(1)* ──▶ KN.SlideNodeArchive       [nested/indented slides]
       │           └─ slide(2) ──▶ KN.SlideArchive (type 5/6, "Index/Slide-N.iwa")
       │                 ├─ transition(4)         — INLINE KN.TransitionArchive
       │                 ├─ note(27) ──▶ KN.NoteArchive (type 15)
       │                 │     └─ containedStorage(1) ──▶ TSWP.StorageArchive (2001, kind=NOTE)
       │                 ├─ titlePlaceholder(5)/bodyPlaceholder(6)/… ──▶ KN.PlaceholderArchive (7)
       │                 │     └─ super(1).owned_storage(4) ──▶ TSWP.StorageArchive (2001)
       │                 ├─ owned_drawables(7)* / drawables_z_order(42)* ──▶ TSD drawables
       │                 ├─ builds(2)* ──▶ KN.BuildArchive (8); buildChunks(43)* ──▶ (153)
       │                 └─ template_slide(17) ──▶ master KN.SlideArchive
       └─ size(4) — TSP.Size {width=1, height=2}
```

All `TSP.Reference` values are `{ required uint64 identifier = 1; }` resolved
through the object index; `slideTree` and `transition` are inline submessages
**[verified]**.

## KN.DocumentArchive / KN.ShowArchive / KN.SlideTreeArchive

`proto/keynote-14.4/KNArchives.proto:466-470, 442-464, 437-440`:

```proto
message DocumentArchive {
  required .TSA.DocumentArchive super = 3;
  required .TSP.Reference show = 2;
  optional .TSP.Reference tables_custom_format_list = 4;
}

message ShowArchive {
  enum KNShowMode {
    kKNShowModeNormal = 0;
    kKNShowModeAutoPlay = 1;
    kKNShowModeHyperlinksOnly = 2;
  }
  optional .TSP.Reference uiState = 1;
  required .TSP.Reference theme = 2;
  required .KN.SlideTreeArchive slideTree = 3;
  required .TSP.Size size = 4;
  required .TSP.Reference stylesheet = 5;
  optional bool slideNumbersVisible = 6;
  optional .TSP.Reference recording = 7;
  optional bool loop_presentation = 8;
  optional .KN.ShowArchive.KNShowMode mode = 9 [default = kKNShowModeNormal];
  optional double autoplay_transition_delay = 10 [default = 5];
  optional double autoplay_build_delay = 11 [default = 2];
  optional bool idle_timer_active = 15;
  optional double idle_timer_delay = 16 [default = 900];
  optional .TSP.Reference soundtrack = 17;
  optional bool automatically_plays_upon_open = 18;
  optional .TSP.Reference slideList = 19;
}

message SlideTreeArchive {
  optional .TSP.Reference rootSlideNode = 1 [deprecated = true];
  repeated .TSP.Reference slides = 2;
}
```

Observed slide size: 1024×768 / 1920×1080 as `TSP.Size` floats **[verified]**.

### Deriving the ordered slide list

Two generations, both in the wild **[verified]**:

- **Modern (Keynote ≥ ~6.5 through 14.x)**: `slideTree.slides` (field 2) is
  the flat, presentation-ordered list of top-level `SlideNodeArchive` refs;
  `rootSlideNode` is absent. Every fixture's nodes sat in this list with
  `depth`(21) = 1 and empty `children`.
- **Legacy (first IWA release, keynote6-file.key)**: `slides` is empty and
  `rootSlideNode` (field 1) points to a *container* node with **no `slide`
  ref** whose `children`(1) are the actual slides.

Robust walk: if `slides` non-empty, DFS each entry (node first, then its
`children` recursively — pre-order, matching navigator order; indented slides
hang off `children` with `depth` > 1); otherwise DFS `rootSlideNode`'s
children. Collect `SlideNodeArchive.slide`(2) at each node.

## KN.SlideNodeArchive

`proto/keynote-14.4/KNArchives.proto:276-313` (map-entry submessage elided):

```proto
message SlideNodeArchive {
  repeated .TSP.Reference children = 1;
  optional .TSP.Reference slide = 2;
  optional uint32 depth = 21 [default = 1];
  repeated .TSP.DataReference thumbnails = 16;
  repeated .TSP.Size thumbnailSizes = 10;
  optional bool thumbnailsAreDirty = 14;
  repeated string digests_for_datas_needing_download_for_thumbnail = 25;
  required bool isSkipped = 4;
  optional bool isCollapsed = 5 [deprecated = true];
  optional bool isCollapsedInOutlineView = 17 [deprecated = true];
  optional bool hasBodyInOutlineView = 19 [deprecated = true];
  required bool hasBuilds = 6 [deprecated = true];
  required bool hasTransition = 7;
  optional bool hasNote = 8;
  optional bool isSlideNumberVisible = 18 [default = false];
  optional string uniqueIdentifier = 11 [deprecated = true];
  optional string copyFromSlideIdentifier = 12;
  optional uint32 slideSpecificHyperlinkCount = 13 [deprecated = true];
  optional uint32 build_event_count = 15;
  optional uint32 build_event_count_cache_version = 26;
  optional bool build_event_count_is_up_to_date = 22 [deprecated = true];
  optional bool has_explicit_builds = 20;
  optional uint32 has_explicit_builds_cache_version = 27;
  optional bool has_explicit_builds_is_up_to_date = 23 [deprecated = true];
  repeated .KN.SlideNodeArchive.SlideSpecificHyperlinkMapEntry slideSpecificHyperlinkMap = 24;
  optional bool background_is_no_fill_or_color_fill_with_alpha = 28;
  optional .TSP.UUID template_slide_id = 29;
  repeated .TSP.UUID live_video_source_ids = 30;
  repeated .KN.LiveVideoSourceUsageEntry live_video_source_usage_entries = 31;
  optional .TSP.Reference database_thumbnail = 3 [deprecated = true];
  repeated .TSP.Reference database_thumbnails = 9 [deprecated = true];
}
```

Reader cares about: `children`(1), `slide`(2), `isSkipped`(4) (2013 name:
`isHidden`, same number), `hasTransition`(7), `hasNote`(8), `depth`(21).
`hasNote`/`hasTransition` are denormalized hints: a slide whose note storage
exists but is empty has `hasNote = false` **[verified]** — treat them as
fast-path hints only, trust the slide's own fields.

## KN.SlideArchive

`proto/keynote-14.4/KNArchives.proto:218-274` (nested map-entry messages
elided). Field 17 was `master` in 2013; `owned_drawables`(7) was `drawables`
— numbers unchanged since iWork '13:

```proto
message SlideArchive {
  required .TSP.Reference style = 1;                 // -> KN.SlideStyleArchive (type 9)
  repeated .TSP.Reference builds = 2;                // -> KN.BuildArchive (type 8)
  repeated .KN.BuildChunkArchive buildChunkArchives = 3 [deprecated = true];
  repeated .TSP.Reference buildChunks = 43;          // -> KN.BuildChunkArchive (type 153)
  required .KN.TransitionArchive transition = 4;     // INLINE, always present
  optional .TSP.Reference titlePlaceholder = 5;      // -> KN.PlaceholderArchive kind 2
  optional .TSP.Reference bodyPlaceholder = 6;       // -> KN.PlaceholderArchive kind 3
  optional .TSP.Reference objectPlaceholder = 30;    //    kind 4
  optional .TSP.Reference slideNumberPlaceholder = 20; //  kind 1
  repeated .TSP.Reference owned_drawables = 7;
  repeated .TSP.Reference drawables_z_order = 42;    // render order incl. placeholders
  repeated .KN.SlideArchive.SageTagMapEntry sage_tag_to_info_map = 28;
  optional .KN.SlideArchive.InstructionalTextMap instructional_text_map = 45;
  optional string name = 10;                         // set on masters ("Title & Subtitle")
  optional .TSD.GeometryArchive titlePlaceholderGeometry = 11;
  optional uint32 titlePlaceholderShapeStyleIndex = 12;
  optional uint32 titlePlaceholderTextStyleIndex = 13;
  optional .TSWP.ShapeStylePropertiesArchive titleLayoutProperties = 24;
  optional .TSD.GeometryArchive bodyPlaceholderGeometry = 14;
  optional uint32 bodyPlaceholderShapeStyleIndex = 15;
  optional uint32 bodyPlaceholderTextStyleIndex = 16;
  optional .TSWP.ShapeStylePropertiesArchive bodyLayoutProperties = 25;
  optional .TSD.GeometryArchive slideNumberPlaceholderGeometry = 21;
  optional uint32 slideNumberPlaceholderShapeStyleIndex = 22;
  optional uint32 slideNumberPlaceholderTextStyleIndex = 23;
  optional .TSWP.ShapeStylePropertiesArchive slideNumberLayoutProperties = 26;
  optional .TSP.Reference classicStylesheetRecord = 29;
  repeated .TSP.Reference bodyParagraphStyles = 31;
  repeated .TSP.Reference bodyListStyles = 35;
  optional string thumbnailTextForTitlePlaceholder = 37;
  optional string thumbnailTextForBodyPlaceholder = 38;
  optional bool slide_objects_layer_with_template = 41 [default = false];
  optional .TSP.Reference template_slide = 17;       // -> master KN.SlideArchive (2013: "master")
  repeated .TSD.GuideArchive staticGuides = 18;
  optional .TSP.Reference userDefinedGuideStorage = 36;
  required bool inDocument = 19;
  optional .TSP.Reference note = 27;                 // -> KN.NoteArchive (type 15)
  repeated .TSP.Reference infos_using_object_placeholder_geometry = 44;
  optional bool deprecated_objectPlaceholderVisibleForExport = 34;
  optional .TSP.Reference info_using_object_placeholder_geometry = 39;
  optional bool info_using_object_placeholder_geometry_matches_object_placeholder_geometry = 40;
}
```

**[verified]** on content slides: fields 1, 4, 5, 6, 7, 17, 19, 20, 27, 36, 42
populated; `owned_drawables` lists the placeholder shapes too;
`drawables_z_order` mirrors it in stacking order. Masters additionally carry
10 (name), 29–31, 35, 37, 38, 41 and have **no** 17/27.

## Speaker notes

`proto/keynote-14.4/KNArchives.proto:203-205`:

```proto
message NoteArchive {
  required .TSP.Reference containedStorage = 1;
}
```

Chain **[verified]** (incl. a real note "A nice note" in
tika-testKeynote2013.key): `SlideArchive.note`(27) → `KN.NoteArchive`
(type 15) → `containedStorage`(1) → `TSWP.StorageArchive` (type 2001) with
`kind`(1) = **4 = NOTE** and the plain text in `text`(3)[0]
(`proto/current/TSWPArchives.proto:84-98`: `kind = 1` with enum
`{BODY=0, HEADER=1, FOOTNOTE=2, TEXTBOX=3, NOTE=4, CELL=5, …}`,
`repeated string text = 3`). Slides without any note simply omit field 27;
slides whose notes were opened-but-empty have the whole chain with
`text = []` **[verified]**. Paragraph/character styling of notes uses the
usual `table_para_style`(5)/`table_char_style`(8) attribute tables.

## Transitions

Transitions live **inline on `KN.SlideArchive.transition` (field 4, required)**
— not on the SlideNode (which only has the `hasTransition` bool hint).
`proto/keynote-14.4/KNArchives.proto:65-67, 32-63, 13-30`:

```proto
message TransitionArchive {
  required .KN.TransitionAttributesArchive attributes = 2;
}

message TransitionAttributesArchive {
  enum TransitionCustomAttributesTimingCurveType {
    TransitionCustomAttributesTimingCurveTypeLinear = 1;
    TransitionCustomAttributesTimingCurveTypeEaseIn = 2;
    TransitionCustomAttributesTimingCurveTypeEaseOut = 3;
    TransitionCustomAttributesTimingCurveTypeEaseInEaseOut = 4;
    TransitionCustomAttributesTimingCurveTypeCustom = 5;
  }
  enum TransitionCustomAttributesTextDeliveryType {
    TransitionCustomAttributesTextDeliveryTypeByObject = 1;
    TransitionCustomAttributesTextDeliveryTypeByWord = 2;
    TransitionCustomAttributesTextDeliveryTypeByCharacter = 3;
    TransitionCustomAttributesTextDeliveryTypeByLine = 4;
  }
  optional .KN.AnimationAttributesArchive animationAttributes = 8;
  optional float custom_twist = 9;
  optional uint32 custom_mosaic_size = 10;
  optional uint32 custom_mosaic_type = 11;
  optional bool custom_bounce = 12;
  optional bool custom_magic_move_fade_unmatched_objects = 13;
  optional .KN.TransitionAttributesArchive.TransitionCustomAttributesTimingCurveType custom_timing_curve = 15;
  optional .KN.TransitionAttributesArchive.TransitionCustomAttributesTextDeliveryType custom_text_delivery_type = 16;
  optional bool custom_motion_blur = 17;
  optional float custom_travel_distance = 18;
  // fields 1-7: database_* copies of AnimationAttributes, all [deprecated = true]
}

message AnimationAttributesArchive {
  optional string animation_type = 1;   // "Transition" on slide transitions [verified]
  optional string effect = 2;           // effect identifier; "none" = no transition [verified]
  optional double duration = 3;         // seconds
  optional uint32 direction = 4;        // opaque numeric direction code
  optional double delay = 5;            // seconds (auto-advance delay)
  optional bool is_automatic = 6;       // start transition automatically
  optional .TSP.Color color = 7;
  optional .TSD.PathSourceArchive custom_effect_timing_curve_1 = 8;   // ..._2 = 9, ..._3 = 10
  optional uint32 random_number_seed = 11;
  optional double custom_detail = 12;
  optional string custom_effect_timing_curve_theme_name_1 = 13;       // _2 = 14, _3 = 15
  optional bool writing_direction_is_rtl = 16;
}
```

- **"No transition"** is an explicit encoding, not an absent field: every
  fixture slide (and master) carries
  `transition(4).attributes(2).animationAttributes(8)` with
  `animation_type = "Transition"`, `effect = "none"`, `duration = 1`,
  `delay = 0` or `0.5`, `is_automatic = false` **[verified across 6 files,
  ~60 slides]**. Named effects put Keynote's internal effect identifier in
  `effect` (string, e.g. the Magic Move / Dissolve identifiers; the
  `custom_magic_move_fade_unmatched_objects`/`custom_twist`/`custom_mosaic_*`
  fields exist for specific effects). No fixture with a non-"none" effect was
  available; treat the string as opaque and map `"none"` → no transition.
- Theme/style defaults: `KN.SlideStylePropertiesArchive`
  (`KNArchives.proto:472-480`) can also carry a
  `transition = 2` (`TransitionAttributesArchive`) plus `bool transition_null = 3`
  inside `KN.SlideStyleArchive.slide_properties`(11) — the style-layer default
  a slide inherits when its own attributes are unset;
  `transition_null = true` pins "no transition" at the style level.

## Builds (brief)

`proto/keynote-14.4/KNArchives.proto:183-189, 69-78`:

```proto
message BuildArchive {
  optional .TSP.Reference drawable = 1;        // target drawable on the slide
  required string delivery = 2;                // e.g. build-in/out delivery identifier
  optional double duration = 3 [deprecated = true];
  required .KN.BuildAttributesArchive attributes = 4;
  optional int32 chunk_id_seed = 5;
}

message BuildChunkArchive {                    // type 153 when referenced via field 43
  optional .TSP.Reference build = 1;
  optional uint32 index = 2 [deprecated = true];
  optional double delay = 3;
  optional double duration = 4;
  optional bool automatic = 5;
  optional bool referent = 6;
  optional .KN.BuildChunkIdentifierArchive build_chunk_identifier = 7;
  optional .TSP.UUID build_id = 8;
}
```

`SlideArchive.builds`(2) lists the `KN.BuildArchive`s (type 8);
`SlideArchive.buildChunks`(43) holds the *ordered click sequence* as refs to
`KN.BuildChunkArchive` objects (type 153), each pointing back at its build.
The effect name/duration/direction sit in
`BuildArchive.attributes(4).animationAttributes(18)` — the same
`KN.AnimationAttributesArchive` as transitions (`effect` = 2, `duration` = 3);
`BuildAttributesArchive` (`KNArchives.proto:110-181`) adds per-effect knobs
(`eventTrigger` = 4, text delivery = 20, delivery option = 21, action_*
fields for motion/rotate/scale actions). Fixtures contained no builds; this
part is proto-only.

## Masters and themes

`proto/keynote-14.4/KNArchives.proto:424-435, 482-486`:

```proto
message ThemeArchive {
  required .TSS.ThemeArchive super = 1;
  repeated .TSP.Reference templates = 2;       // 2013 name: "masters" — master slide NODES
  optional string uuid = 3;
  repeated .TSP.Reference classicThemeRecords = 4;
  optional .TSP.Reference default_template_slide_node = 5;
  optional .TSP.Reference default_template_slide_node_reference = 6;
  optional bool default_template_slide_node_is_our_best_guess = 7;
  repeated .KN.ThemeCustomTimingCurveArchive custom_effect_timing_curves = 8;
  optional .TSP.Reference live_video_source_collection = 9;
  repeated .TSP.Reference motion_background_style_presets = 10;
}

message SlideStyleArchive {
  required .TSS.StyleArchive super = 1;
  optional uint32 override_count = 10 [default = 0];
  optional .KN.SlideStylePropertiesArchive slide_properties = 11;  // fill = 1, transition = 2 …
}
```

A master is: `ShowArchive.theme`(2) → `ThemeArchive.templates`(2)[i] →
`SlideNodeArchive` → `slide`(2) → `SlideArchive` **[verified]** — masters get
their own SlideNode wrappers, live in `Index/MasterSlide-<id>.iwa` components
(content slides in `Index/Slide-<id>.iwa`; component `preferred_locator`
"MasterSlide"/"Slide" in `TSP.PackageMetadata`), have `name`(10) set, no
`template_slide`(17), no `note`(27). A content slide points to its master via
`template_slide`(17) (ref to the master's *SlideArchive*, not its node).
Identify masters by membership in `theme.templates`, not by registry type.

## Slide text (titles/bodies)

`KN.PlaceholderArchive` (`KNArchives.proto:191-201`): `super = 1`
(`TSWP.ShapeInfoArchive`) + `kind = 2`
(enum: 0 generic, 1 slide number, 2 **title**, 3 **body**, 4 object).
Text chain **[verified]**: `super(1).owned_storage(4)` (2013-era files:
`deprecated_storage(2)` instead — `proto/current/TSWPArchives.proto:717-723`)
→ `TSWP.StorageArchive.text`(3)[0]. Master placeholders hold prompt text
("Title Text"); real content lives on the content slide's placeholders.

## What keynote-parser itself does (citations)

keynote-parser has **no semantic slide model** — it round-trips whole IWA
files to YAML and regex-replaces text:

- `keynote_parser/codec.py:199-239` (`IWAArchiveSegment.from_buffer`): frames
  each object (varint length + `TSP.ArchiveInfo`, then one payload per
  `MessageInfo`), resolving `message_info.type` through the registry at
  line 219 `klass = import_version(version)[0][message_info.type]`.
- `keynote_parser/versions/v14_4/mapping.py:77-102` KN registry table;
  `:712-727` `compute_maps()` builds `ID_NAME_MAP` from it.
- `keynote_parser/codec.py:91-115` Snappy de-framing (`0x00` + 3-byte LE
  length chunks, tolerates uncompressed payloads).
- `keynote_parser/replacement.py:37`
  `DEFAULT_KEY_PATH = "chunks.[].archives.[].objects.[].text.[]"` — text
  replacement hits *every* `TSWP.StorageArchive.text` list in every component,
  which is how it reaches titles, bodies **and speaker notes** without ever
  walking `Slide → note`; `:50-79` fixes up `tableParaStyle`/`tableCharStyle`
  `characterIndex` entries after multiline/styled edits.

## Reader checklist (TypeScript)

1. Find object of type 1 (`Document.iwa`), read ref field 2 → Show.
2. Show: size(4), theme(2), inline slideTree(3).
3. Slides: `slideTree.slides`(2) else legacy `rootSlideNode`(1); pre-order DFS
   over `children`(1); per node read `slide`(2), `isSkipped`(4), `depth`(21).
4. Per slide: accept types 5 *and* 6; notes via 27 → type 15 → storage kind 4
   text(3); transition via inline 4/2/8 with `effect == "none"` → none;
   builds via 2 + ordered 43; master link via 17; title/body via 5/6 →
   placeholder super(1).owned_storage(4) (fallback deprecated_storage(2)).
5. Masters: collect `theme.templates`(2) node → slide refs into a set; slides
   in that set are masters (never listed in slideTree) **[verified]**.
```
