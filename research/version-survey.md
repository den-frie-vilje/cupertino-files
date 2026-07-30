# iWork file-format version survey

Compiled 2026-07-30. Purpose: give the parser a concrete, evidence-based model of what
changes between iWork format eras, using real files rather than assumptions.

Every claim below was measured by decompressing the IWA components (raw Snappy → the
`TSP.ArchiveInfo` / `TSP.MessageInfo` framing → generic protobuf field walk) and reading
`Metadata/Properties.plist` + `Metadata/BuildVersionHistory.plist` as binary plists.
Where something was not observed, this document says **"not observed"** rather than guessing.

## Version-marker vocabulary

- **`fileFormatVersion`** — `Metadata/Properties.plist`. Per-app numbering, *not* the app
  version. Numbers 15.1 writes `26.0.0`; Numbers 15.2/15.2.1 write `26.1.0`.
- **BuildVersionHistory** — `Metadata/BuildVersionHistory.plist`, an *append-only array*.
  Element 0 is the origin (`Template: Blank (11.2)`, or an import marker: `xlsx`, `csv`,
  `docx`). Later elements name each app build that saved the file:
  `M<ver>-<build>-<n>` = macOS, `T<ver> (<build>)` = iOS/iPadOS, `G-r<rev>-<build>` =
  iCloud/web. The **last** element is the writer that produced the bytes on disk.
- The two disagree deliberately: a file can be `fileFormatVersion` 26.1.0 with a
  BuildVersionHistory 180 entries long reaching back to a 2014 build.

## Newest available in open source (as of 2026-07-30)

| App | Newest `fileFormatVersion` found | Newest app build found | Where |
|---|---|---|---|
| Numbers | **26.1.0** | **`M15.2.1-7048.0.3-2`** (Numbers 15.2.1) | masaccio/numbers-parser `tests/data/` |
| Pages | 14.4.1 | `M14.5-7045.0.17-4` (Pages 14.5) | reichenbach/iwork_mcp `examples/sample.pages` |
| Keynote | 14.4.1 | `M14.5-7045.0.17-4` (Keynote 14.5) | reichenbach/iwork_mcp `examples/sample.key` |

**No `.pages` or `.key` with a 26.x `fileFormatVersion` exists in any open-source repository
surveyed.** The 26.x format is represented only by Numbers files. Repos checked and what they
had: `masaccio/numbers-parser` (89 files, Numbers only, up to 26.1.0);
`reichenbach/iwork_mcp` (4 files, all three apps, 14.5-era — the newest Pages/Keynote found);
`orcastor/iwork-converter` (3 files, best is Pages 14.1); `psobot/keynote-parser`
(3 files, best is Keynote 10.1); `apache/tika` (23 files, 2013-2018 era);
`LibreOffice/libetonyek` (13 files + directory packages, 2013-2018 era);
`6over3/WorkKit` and `openpreserve/format-corpus` ship **no** iWork documents;
`kreuzberg-dev/kreuzberg` ships none either.

For context, `numbers-parser`'s `src/numbers_parser/constants.py` declares
`SUPPORTED_NUMBERS_VERSIONS` as `10.0`–`14.5` plus `26.0`–`26.3` (commented
"Numbers Creator Studio"). Files saved by `26.2`/`26.3` were **not observed** — the newest
actually present is 26.1.0.

## Files inspected

Structural analysis of every file below; `sv` = `storage_version`, `bnc` =
`Tile.last_saved_in_BNC`, `f6` = count of `TST.TileRowInfo` populating field 6
(`cell_storage_buffer`) out of total row infos. "unresolved type ids" = `TSP.MessageInfo.type`
values with no name in `research/type-registry.json` for that app.

| file | app | `fileFormatVersion` | app build (BuildVersionHistory) | container layout | cell storage generation | `styles_for_*` in stylesheets | unresolved type ids |
|---|---|---|---|---|---|---|---|
| `numbers-parser-v26.1-date-formats.numbers` | numbers | 26.1.0 | Template: Blank (dev/15.3) ; M15.2.1-7048.0.3-2 | Index/*.iwa, 43 entries | Tile.sv=[5] bnc=[True] / row.sv=[5] f6=11/11 | 10_0,10_1 | 0 |
| `numbers-parser-v26.1-custom-formats.numbers` | numbers | 26.1.0 | Template: Blank (11.2) ... M15.2.1-7048.0.3-2 (5 entries) | Index/*.iwa, 73 entries | Tile.sv=[5] bnc=[True] / row.sv=[5] f6=163/163 | 10_0,10_1 | 0 |
| `numbers-parser-v26.1-xlsx-lineage.numbers` | numbers | 26.1.0 | xlsx ... M15.2.1-7048.0.3-2 (144 entries) | Index/*.iwa, Data/, 51 entries | Tile.sv=[5] bnc=[True] / row.sv=[5] f6=41/41 | 10_0,10_1 | 0 |
| `numbers-parser-v26.1-form-sheet.numbers` | numbers | 26.1.0 | Template: Blank (11.2) ... M15.2-7046.0.71-2 (180 entries) | Index/*.iwa, 43 entries | Tile.sv=[5] bnc=[True] / row.sv=[5] f6=15/15 | 10_0,10_1 | 0 |
| `numbers-parser-v26.0-categories.numbers` | numbers | 26.0.0 | Template: Blank (11.2) ... M15.1-7044.0.271-2 (3 entries) | Index/*.iwa, 343 entries | Tile.sv=[5] bnc=[True] / row.sv=[5] f6=341/341 | 10_0,10_1 | 0 |
| `numbers-parser-v26.0-issue102.numbers` | numbers | 26.0.0 | csv ... M15.1-7044.0.271-2 (22 entries) | Index/*.iwa, 43 entries | Tile.sv=[5] bnc=[True] / row.sv=[5] f6=7/7 | 10_0,10_1 | 0 |
| `numbers-parser-v14.4-issue102.numbers` | numbers | 14.4.1 | csv ... M14.5-7045.0.17-4 (21 entries) | Index/*.iwa, 43 entries | Tile.sv=[5] bnc=[True] / row.sv=[5] f6=7/7 | 10_0,10_1 | 0 |
| `iwork-mcp-v14.5-earnings.numbers` | numbers | 14.4.1 | Template: Blank (11.2) ; M14.5-7045.0.17-4 | Index/*.iwa, 223 entries | Tile.sv=[5] bnc=[True] / row.sv=[5] f6=61/61 | 10_0,10_1 | 0 |
| `sample.numbers` | numbers | 14.4.1 | Template: Blank (11.2) ; M14.5-7045.0.17-4 | Index/*.iwa, 43 entries | Tile.sv=[5] bnc=[True] / row.sv=[5] f6=5/5 | 10_0,10_1 | 0 |
| `a.numbers` | numbers | 11.1.2 | csv ; M11.1-7031.0.102-2 | Index/*.iwa, 74 entries | Tile.sv=[5] bnc=[True] / row.sv=[5] f6=21/21 | 10_0,10_1 | 0 |
| `pre-bnc.numbers` | numbers | 13.1.2 | Template: Blank (11.2) ... M13.1-7037.0.101-2 (3 entries) | Index/*.iwa, 44 entries | Tile.sv=[5] bnc=[False, True] / row.sv=[5] f6=1/12 | 10_0,10_1 | 0 |
| `tika-testNumbers2013.numbers` | numbers | 2.0.24 | Template: Blank (2015-09-16 11:33) ; T2.6.1 (2163) | Index/*.iwa, 53 entries | Tile.sv=[0] bnc=[] / row.sv=[4] f6=0/24 | none | - |
| `numbers3-file.numbers` | numbers | 1.5.0 | TE-v1.5.0 (Dec 10 2014) ; M3.5.3-2150-2 | Index/*.iwa, 27 entries | Tile.sv=[0] bnc=[] / row.sv=[3] f6=0/3 | none | 6219 |
| `iwork-mcp-v14.5-sample.pages` | pages | 14.4.1 | Template: Blank (13.2) ; M14.5-7045.0.17-4 | Index/*.iwa, 13 entries | no tiles | 10_0,10_1 | - |
| `a.pages` | pages | 14.1.1 | docx ... M14.1-7040.0.73-4 (3 entries) | Index/*.iwa, Data/, 50 entries | Tile.sv=[5] bnc=[True] / row.sv=[5] f6=11/11 | 10_0,10_1 | - |
| `libetonyek-pages5-extra-dir.pages` | pages | 3.2.13 | Template: 02_Modern_Business_Project_Proposal (2018-07-09 14:14) ; G-r320-3C102 | wrapper `Project Proposal.pages/`, inner Index.zip, Data/, 11 entries | Tile.sv=[5] bnc=[True] / row.sv=[5] f6=6/6 | none | - |
| `tika-testPages2013.pages` | pages | 2.0.24 | Template: Blank (2015-09-16 11:13) ; T2.6.1 (2160) | Index/*.iwa, 26 entries | Tile.sv=[0] bnc=[] / row.sv=[4] f6=0/4 | none | - |
| `libetonyek-pages5-file.pages` | pages | 1.5.0 | Template: Blank (2014-07-09 11:15) ; M5.5.3-2152-2 | Index/*.iwa, 14 entries | no tiles | none | 608 |
| `tika-iwork09-testPages.pages` | pages | None | - | 4 entries | no tiles | none | - |
| `iwork-mcp-v14.5-sample.key` | keynote | 14.4.1 | Template: 21_BasicWhite (13.2) ; M14.5-7045.0.17-4 | Index/*.iwa, Data/, 57 entries | no tiles | 10_0,10_1,12_1 | - |
| `unicode-asset-filename.key` | keynote | 10.1.8 | Template: 21_BasicWhite (10.0) ... M10.1-6913-2 (3 entries) | Index/*.iwa, Data/, 18 entries | no tiles | 10_0,10_1 | - |
| `table.key` | keynote | 4.2.3 | Template: White (4.1) ; M9.2-6520-2 | Index/*.iwa, Data/, 47 entries | Tile.sv=[5] bnc=[True] / row.sv=[] f6=0/0 | none | - |
| `tika-testKeynote2018.key` | keynote | 3.2.13 | Template: New_Template5 (2018-02-21 14:36) ; G-r320-3D139 | wrapper `Presentation.key/`, inner Index.zip, Data/, 7 entries | no tiles | none | - |
| `simple-oneslide.key` | keynote | 3.2.13 | Template: White (2018-02-21 14:41) ; M8.3-5989-2 | Index/*.iwa, Data/, 42 entries | no tiles | none | - |
| `a.key` | keynote | 3.1.2 | Template: Black (2018-02-21 14:27) ; M8.1-5683-2 | Index/*.iwa, Data/, 43 entries | no tiles | none | - |
| `tika-testKeynote2013.key` | keynote | 2.0.24 | Template: White (2015-09-16 11:52) ; T2.6.1 (2180) | Index/*.iwa, Data/, 62 entries | Tile.sv=[0] bnc=[] / row.sv=[4] f6=0/3 | none | - |
| `keynote6-file.key` | keynote | 1.5.0 | Template: White (2014-07-17 17:01) ; M6.5.3-2151-2 | Index/*.iwa, Data/, 42 entries | no tiles | none | - |
