# IWA type-ID registry — notes

Companion to `type-registry.json`. IDs are `TSP.MessageInfo.type` values from `.iwa` components
(Snappy-framed protobuf); each app resolves them through its runtime `TSPRegistry`
(`_messageTypeToPrototypeMap`). The registry is **per-app**: the `TS*` blocks are registered
identically by Keynote, Pages and Numbers, while app-local blocks reuse overlapping numeric space.

## Sources

| Source | What it is | App version | Extraction method |
|---|---|---|---|
| psobot/keynote-parser @ `6bc3849` | `keynote_parser/versions/v14_4/mapping.py` | Keynote 14.4 | lldb dump of the registry from the app binary (`dumper/extract_mapping.py`) |
| masaccio/numbers-parser @ `2dd9dbe` | `src/numbers_parser/generated/mapping.py` | Numbers 14.4 era (project states support through Numbers 14.4 / Creator Studio 15.1, Feb 2026) | lldb dump (`src/build/extract_mapping.py`) |
| obriensp/iWorkFileFormat @ `8575e44` | `iWorkFileInspector/.../IWMessageTypeRegistry.mm` | iWork '13 (Pages 5.0, Nov 2013) | hand-reconstructed registry; the only historical TP source and the only one that separates common vs per-app registration in code |
| 6over3/WorkKit @ `c2c2ce0` | `scripts/{common,pages,keynote,numbers}_registry.json` | mid-2026 apps (commit 2026-07-15; exact version not stated) | Frida dump of `[TSPRegistry sharedRegistry]` from all three running apps; `common` = IDs identical across all three |

Cross-checks: SheetJS iwa notes (github.com/SheetJS/notes, `iwa/README.md`) confirm 1 = `TN.DocumentArchive`,
2 = `TN.SheetArchive`, 6000/6001/6002 = `TST.TableInfoArchive`/`TableModelArchive`/`Tile`, and document the
same two dump methods. keynote-parser and numbers-parser have **zero disagreements** on shared IDs; WorkKit's
2026 common table agrees with both on all 531 overlapping entries; WorkKit's per-app Keynote/Numbers leftovers
are byte-identical to the parser dumps. Confidence in `shared`, `keynote`, `numbers`: **very high**.

## Family ranges (derived from the data)

App-local blocks (same numeric space, different meaning per app):

| Range | Keynote | Pages | Numbers |
|---|---|---|---|
| 1–199 | `KN.*` 1–195 (+`KNSOS` 146/174/175; also registers `TSWP.TextualAttachmentArchive` at **14**) | only **7** = `TP.PlaceholderArchive` | `TN.*` 1–7 |
| 10000–10175 | 10011 = `TSWP.SectionPlaceholderArchive` | **`TP.*` main block** (10000–10175, incl. `TPSOS` 10165/10167/10172) | 10011 = `TSWP.SectionPlaceholderArchive` |
| 12002–12059 | — | — | `TN.*` command/UI block (+`TNSOS` 12044/12045) |

Shared `TS*` blocks (identical in all three apps):

| Block | Family | Contents |
|---|---|---|
| 200–215 | `TSK` | document/undo infrastructure (200 `TSK.DocumentArchive`, 201 `TSK.LocalCommandHistory`) |
| 215–289 | `TSCK` | collaboration/activity-stream, interleaved right after TSK (+`TSCKSOS` 259/287/288) |
| 242 | `TSD` | outlier: `TSD.PencilAnnotationStorageArchive` inside the 200s block |
| 290–291 | `TSK` | 2025/26 additions (see "recent changes") |
| 400–419 | `TSS` | styles: **400 `TSS.StyleArchive`, 401 `TSS.StylesheetArchive`, 402 `TSS.ThemeArchive`** |
| 600–642 | `TSA` | application-shared (600 `TSA.DocumentArchive`; `TSASOS` interleaved 611–640) |
| 2001–2128, 2206–2242, 2400–2413 | `TSWP` | text engine: **2001 `TSWP.StorageArchive`**, 2002 selection, 2021–2026 style archives (2021 Character, 2022 Paragraph, 2023 List, 2024 Column, 2025 Shape, 2026 TOCEntry), 2031/2032 smart fields, commands above 2100 (+`TSWPSOS` 2053; outlier 2061 `TSK.DeprecatedChangeAuthorArchive`) |
| 3002–3098 | `TSD` | drawables: 3002 `TSD.DrawableArchive`, 3004 Shape, 3005 Image, 3008 Group (3000/3001 unused) |
| 4000–4011 | `TSCE` | calc engine |
| 5000–5031, 5103–5157 | `TSCH` | charts (5000–5017 legacy `TSCH.PreUFF.*`, 5021 `TSCH.ChartDrawableArchive`, 5022 `TSCH.ChartStyleArchive`; commands from 5103) |
| 6000–6034, 6100–6384 | `TST` | tables (6000 `TST.TableInfoArchive`, 6001 `TST.TableModelArchive`, 6002 `TST.Tile`; commands/selections from 6100) |
| 10011, 10020–10024 | `TSWP` | 10011 only in Keynote/Numbers (see below); 10020–10024 registered by **all three** apps (SelectionTransformers, `ShapeContentDescription`, `TateChuYokoFieldArchive`, `DropCapStyleArchive`) |
| 11000–11027 | `TSP` | persistence wrappers: 11000 `TSP.PasteboardObject`, **11006 `TSP.PackageMetadata`** (11007 is `TSP.PasteboardMetadata` — easy to confuse), 11011 `TSP.DocumentMetadata`, 11012 `TSP.SupportMetadata`, 11016+ LargeArray segments |

Resolution rule for Pages documents: look an ID up in `pages` first, then `shared`.
The only genuinely divergent ID is **10011** (`TP.SectionArchive` in Pages vs
`TSWP.SectionPlaceholderArchive` in Keynote/Numbers — true in 2013 and still true in 2026).

## TP table (Pages) — provenance and confidence

`pages` is the union of the 2013 obriensp table (47 IDs) and WorkKit's mid-2026 live dump (51 IDs):

- **51 IDs confirmed live in mid-2026 Pages: high confidence.** The 2013 table proved highly stable —
  every structural archive kept its ID for 13 years; only undo-command entries churned.
- **15 IDs present only in the 2013 table** (all `*CommandArchive` undo types, e.g. 10108, 10109, 10117,
  10120–10121, 10128, 10134, 10142, 10148, 10150–10156): kept in the table for reading old documents;
  medium confidence, irrelevant for modern files.
- **8 renames 2013 → 2026** are in the JSON `conflicts` array (modern name wins in `pages`), the biggest being
  the master→section-template rebranding: 10143 `TP.PageMasterArchive` → `TP.SectionTemplateArchive`,
  10125/10126/10127/10140 `*MasterDrawables*` → `*SectionTemplateDrawables*`, and a UI-state shuffle:
  10133 `ViewStateArchive` → `UIStateArchive`, 10147 `UIStateArchive` → `ViewStateRootArchive`.

### TP IDs that matter for document / text / section / style work

| ID | Message | Role |
|---|---|---|
| **10000** | `TP.DocumentArchive` | document root (Pages' "type 1"; the actual ID 1 slot is unused in Pages — root component is 10000) |
| **10011** | `TP.SectionArchive` | section (page-group) structure; overrides shared 10011 in Pages |
| **10012** | `TP.SettingsArchive` | document settings |
| **10001** | `TP.ThemeArchive` | theme (presets; style lookups go through shared 401/402 `TSS.StylesheetArchive`/`ThemeArchive`) |
| 7 | `TP.PlaceholderArchive` | text placeholders |
| 10010 | `TP.FloatingDrawablesArchive` | floating (non-inline) drawables per section |
| 10015 | `TP.DrawablesZOrderArchive` | z-order of drawables |
| 10017 | `TP.PageTemplateArchive` | page template (added post-2013) |
| 10143 | `TP.SectionTemplateArchive` | section template (2013: `PageMasterArchive`) |
| 10133 | `TP.UIStateArchive` | UI state (2013 meaning: `ViewStateArchive`) |
| 10147 | `TP.ViewStateRootArchive` | view-state root (2013 meaning: `UIStateArchive`) |
| 10175 | `TP.MailMergeSettingsArchive` | mail-merge settings (recent addition) |

Actual text content, styles and stylesheets are **shared-family** objects: 2001 `TSWP.StorageArchive`
(body/header/footnote text), 2021/2022/2023 `TSWP.CharacterStyleArchive`/`ParagraphStyleArchive`/`ListStyleArchive`,
400–402 `TSS.*`, drawables 3002+, tables 6000+.

## IDs added/removed in recent app versions

- Added by mid-2026 apps (present in WorkKit, absent from the 14.4-era parser dumps):
  **290 `TSK.AIGeneratedContentCommandArchive`**, **291 `TSK.SetLastPremiumUserActivityTimestampCommandArchive`**.
- Added to Pages after 2013 (in the 2026 dump): 10016 `TP.UserDefinedGuideMapArchive`, 10017 `TP.PageTemplateArchive`,
  10135/10136 section-selection archives, 10160–10175 block (selections, `TPSOS.*` sync commands,
  10169 `TP.ReplaceHeaderFooterStorageCommandArchive`, 10170/10171 page-template commands,
  10173/10174 sections pasteboard objects, 10175 mail merge).
- No shared IDs were removed between Keynote/Numbers 14.4 and the 2026 dump — additions only.
- Since iWork '13 the shared registry dropped 92 IDs (almost all `*CommandArchive` undo types) and renamed 4:
  201 `TSK.CommandHistory` → `TSK.LocalCommandHistory`, 215 `TSK.…` → `TSCK.SetAnnotationAuthorColorCommandArchive`,
  4004 `TSCE.ReferenceTrackerArchive` → `TSCE.TrackedReferenceStoreArchive`,
  6256 `TST.CommandNotifyForTransformingArchive` → `TST.CommandJustForNotifyingArchive`.
  For iWork '13-era files consult obriensp's `IWMessageTypeRegistry.mm` directly.

## Verified anchors

1 → `KN.DocumentArchive` / `TN.DocumentArchive` · 2 → `TN.SheetArchive` · 401 → `TSS.StylesheetArchive` ·
402 → `TSS.ThemeArchive` · 2001 → `TSWP.StorageArchive` · 6000/6001/6002 → `TST.TableInfoArchive`/`TableModelArchive`/`Tile` ·
10000 → `TP.DocumentArchive` · 10011 → `TP.SectionArchive` (Pages) · 10012 → `TP.SettingsArchive` ·
**11006 → `TSP.PackageMetadata`** (not 11007, which is `TSP.PasteboardMetadata`).

Generated by `extract_registry.py` (scratchpad) on 2026-07-30.
