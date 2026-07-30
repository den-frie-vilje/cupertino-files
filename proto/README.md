# Apple iWork protobuf schemas (.proto)

Curated set of protobuf schema definitions for the modern iWork IWA file format,
collected to support a TypeScript library that reads/writes Apple Pages
(`.pages`) documents. These schemas are **not published by Apple**; they were
recovered from the iWork application binaries by open-source projects using
"proto-dump"-style extraction (protobuf descriptors are embedded in the app
binaries and can be decompiled back into `.proto` source). The files below are
verbatim copies from those projects — nothing has been edited.

## Layout

- `current/` — newest available dumps of the **shared** iWork frameworks
  (TSP, TSK, TSS, TSD, TSWP, TSA, TSCH, TST, TSCK, TSCE families), taken from
  `masaccio/numbers-parser` (extracted from Numbers.app 14.4 — the same
  framework versions used by current Pages/Keynote).
- `pages-2013/` — the **Pages-specific** `TP*` schemas from
  `obriensp/iWorkFileFormat` (extracted from Pages 5.x, iWork '13). This is the
  only public Pages-specific dump.

## Provenance

| Directory | Files | Source repo | Commit (`git rev-parse HEAD`) | Path in repo | Extraction method | App version dumped | License |
|---|---|---|---|---|---|---|---|
| `current/` | 29 × `TS*.proto` | [masaccio/numbers-parser](https://github.com/masaccio/numbers-parser) | `2dd9dbe3f8f3440bbd19e23668d5ade72a2e1629` | `src/protos/` | `src/build/protodump.py` run against the Numbers.app binary (descendant of obriensp's 2013 `proto-dump`), then `rename_proto_files.py` | Numbers 14.4 (last macOS Numbers release; repo tested through Feb 2026) | MIT (© 2021 Jon Connell) |
| `pages-2013/` | 2 × `TP*.proto` (`TPArchives.proto`, `TPCommandArchives.proto` — every TP file the repo has) | [obriensp/iWorkFileFormat](https://github.com/obriensp/iWorkFileFormat) | `8575e441beaaaa56f480fdd91721f5bb06d07d43` | `iWorkFileInspector/iWorkFileInspector/Messages/Proto/` | [proto-dump](https://github.com/obriensp/proto-dump) against the Pages app binary | Pages 5.0 (iWork '13) | MIT (© 2013 Sean Patrick O'Brien) |
| (cross-check only, nothing copied) | — | [psobot/keynote-parser](https://github.com/psobot/keynote-parser) | `6bc3849e80f531f51d2878550bd634706d3f036d` | `protos/versions/14.4/` | `dumper/protodump.py` ("Inspired by Sean Patrick O'Brien's 2013 proto-dump") against the Keynote.app binary | Keynote 14.4 | MIT |

Cross-check result: the shared `TS*` families in numbers-parser and
keynote-parser 14.4 are **identical** for every file compared
(`TSPMessages`, `TSPArchiveMessages`, `TSPDatabaseMessages`, `TSKArchives`,
`TSSArchives`, `TSWPArchives`, `TSAArchives`, `TSTArchives`), except two float
default literals in `TSDArchives.proto` that differ only in decimal spelling
(`0.200000003` vs `0.2`, `0.600000024` vs `0.6` — the same float32 value).
keynote-parser ships real `.proto` sources (not just compiled `_pb2.py`), but
per preference the numbers-parser copies are the ones vendored here.

## Notes on file naming in `current/`

numbers-parser stores some schemas twice with equivalent content: dot-named
duplicates (`TSCHArchives.Common.proto`, `*.sos.proto`) differ from the
underscore-named files (`TSCHArchives_Common.proto`, `*_sos.proto`) only in
their `import` statement spelling. Only the underscore-named set is vendored
here because it is the complete, self-consistent one (the import graph of
`current/` resolves entirely within the directory, plus the standard
`google/protobuf/descriptor.proto`).

The `*_sos.proto` files declare separate `…SOS` packages (`TSKSOS`, `TSWPSOS`,
`TSDSOS`, …) — "SOS" companion schemas used by the command/collaboration
subsystem — and are imported by `TSDCommandArchives.proto`,
`TSWPCommandArchives.proto`, `TSTCommandArchives.proto`.

Numbers-app-specific `TN*` schemas were deliberately omitted (nothing in the
`TS*` families imports them, and this project targets Pages).

## Caveats

- **Version skew**: the `TP*` schemas in `pages-2013/` are from **iWork '13
  (Pages 5.0)** while the shared `TS*` families in `current/` are from the
  **14.4-era** frameworks. Current Pages certainly extends the TP messages
  (new fields, possibly new messages), so `pages-2013/` is a starting map,
  not ground truth for modern `.pages` files. Unknown fields encountered when
  decoding modern documents must be preserved round-trip.
- The TP files import 2013-era `TS*` files by name; compiling `pages-2013/`
  against `current/` TS schemas may work for many messages (Apple rarely
  renumbers fields) but is not guaranteed — obriensp's matching 2013 `TS*`
  dumps live in the same repo directory if needed.
- All schemas are `syntax = "proto2"` and use field numbers/`.TSP.Reference`
  indirection resolved through the IWA object index (`TSPArchiveMessages`
  `ArchiveInfo`/`MessageInfo` framing).

## Licenses

Both source repos are MIT-licensed. Retain their copyright notices if these
files are redistributed:

- numbers-parser: MIT, Copyright 2021 Jon Connell
- iWorkFileFormat: MIT, Copyright (c) 2013 Sean Patrick O'Brien (http://obriensp.com)
- keynote-parser (cross-check source): MIT, Copyright Peter Sobot
