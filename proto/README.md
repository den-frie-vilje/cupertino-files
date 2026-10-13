# Apple iWork protobuf schemas (.proto)

> **These files are load-bearing.** `src/proto/vendored.ts` is generated
> from them by `npm run proto:embed` — via `protobufjs`, not a parser of
> ours — and the library resolves every field number and enum value it can
> through that table. Change anything here and
> re-run `proto:embed`, or the test suite fails. They are also published
> with the package, so an installed copy carries the authority for its own
> field numbers.

The schemas describe the modern iWork IWA file format and are **not
published by Apple**. Each application embeds its protobuf descriptors in
its binaries, and the files below are those descriptors decompiled back to
`.proto` source, checked in byte-for-byte as the dumper writes them.
Nothing has been edited.

## Layout

- `current/` — the **shared** iWork families (TSP, TSK, TSS, TSD, TSWP,
  TSA, TSCH, TST, TSCK, TSCE), identical in every bundle.
- `pages-15.1/` — the Pages-specific `TP*` files.
- `keynote-15.1/` — the Keynote-specific `KN*` files.
- `numbers-15.1/` — the Numbers-specific `TN*` files.

## Provenance

Every directory comes from the same release of the applications,
extracted first-hand from the installed bundles on macOS. The dumper is
`protodump.py` from
[masaccio/numbers-parser](https://github.com/masaccio/numbers-parser)
at commit `2dd9dbe3f8f3440bbd19e23668d5ade72a2e1629` (`src/build/protodump.py`,
a descendant of Sean Patrick O'Brien's 2013 `proto-dump`), run with
Python 3.11 and `protobuf` 7.36 over each bundle's whole `Contents/`
tree, main executable and frameworks alike.

| Directory | Files | Extracted from | App version (build) | Main executable, SHA-256 |
|---|---|---|---|---|
| `current/` | 29 × `TS*.proto` | Pages.app (byte-identical in Numbers.app and Keynote.app) | Pages 15.1.1 (7044.0.273) | `0ba0bd6990ff0c1d0636fa478a418a577902d6ab3ca39c24a51108c67f2d887b` |
| `pages-15.1/` | 3 × `TP*.proto` | Pages.app | Pages 15.1.1 (7044.0.273) | as above |
| `keynote-15.1/` | 4 × `KN*.proto` | Keynote.app | Keynote 15.1.1 (7044.0.273) | `26a3d93f615a92f30a8462b93c70d5e6dccba9a3d905bf89f23ab383fed437a3` |
| `numbers-15.1/` | 4 × `TN*.proto` | Numbers.app | Numbers 15.1 (7044.0.271) | `c9b1d2e23e07ecfa6ebdc62fe7c5f2ae9327be3ce87ae36a9492db7e841fa735` |

The digests are of the universal (x86_64 + arm64) executables as
installed. The 29 shared files dumped from the three bundles are
byte-identical to one another, which is the cross-check that they are
one schema and not three.

Earlier sets — numbers-parser's and keynote-parser's 14.4 dumps and
obriensp/iWorkFileFormat's Pages 5.0 dump from 2013 — are in git history
at the tag `proto-before-15.1`.

## Refreshing a dump

1. Dump each bundle into a scratch directory:
   `python3 protodump.py "/Applications/Pages.app/Contents" out/Pages`,
   and the same for Numbers and Keynote.
2. Replace the files: the `TS*` set into `current/` (from any one bundle,
   after checking the three agree), `TP*` into `pages-<version>/`, `KN*`
   into `keynote-<version>/`, `TN*` into `numbers-<version>/`.
3. Update the provenance table above with the versions and digests.
4. `npm run proto:embed`, then `npm test`.

A field that has appeared in the newer dump makes its `measuredFields`
declaration throw — that is deliberate, and moving it to `protoFields`
is the point. A renamed field keeps its number; the declaration follows
the new name.

## Notes on file naming

The dumper writes companion files with dot-spelled names
(`TSCHArchives.Common.proto`, `TSCHArchives.GEN.proto`, `*.sos.proto`),
and the `import` lines inside the files use the same spelling, so the
import graph of each directory resolves within `proto/` plus the standard
`google/protobuf/descriptor.proto`.

The `*.sos.proto` files declare separate `…SOS` packages (`TSKSOS`,
`TSWPSOS`, `TSDSOS`, …) — companion schemas used by the command and
collaboration subsystem — and are imported by the `*CommandArchives`
files.

## Caveats

- All schemas are `syntax = "proto2"` and use field numbers and
  `.TSP.Reference` indirection resolved through the IWA object index
  (`TSPArchiveMessages` `ArchiveInfo`/`MessageInfo` framing).
- Two kinds of number are in no dump and never will be: archive **type
  ids** (`TSWP.StorageArchive = 2001`), which are the apps' object
  registry, and plain `uint32` codes whose meaning the schema does not
  name (`TSK.FormatStructArchive.format_type`,
  `TST.CellSpecArchive.interaction_type`). Both are measured from the
  corpus and the applications.
- Unknown fields met when decoding a document must be preserved
  round-trip whatever the schema says.

## Licenses

This project claims no copyright in the recovered schemas; see
[THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md) and
[docs/LEGAL.md](../docs/LEGAL.md). The dumper is MIT-licensed
(© 2021 Jon Connell; proto-dump © 2013 Sean Patrick O'Brien) and is not
redistributed here.
