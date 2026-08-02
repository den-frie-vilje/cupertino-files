# Legal posture

Research memo, August 2026. This records why the project believes its
activity is lawful, what remains genuinely gray, and which decisions were
taken on that basis. It is research, not legal advice.

## The activity: settled ground

Reverse-engineering a file format for interoperability — shipping no
vendor code, circumventing no protection measure — is the best-protected
category of reverse engineering in software-IP law:

- **US:** intermediate copying for interoperability is fair use — *Sega
  v. Accolade*, 977 F.2d 1510 (9th Cir. 1992); *Sony v. Connectix*, 203
  F.3d 596 (9th Cir. 2000). Reimplementing an interface surface for a
  new platform is fair use — *Google v. Oracle*, 593 U.S. 1 (2021).
  Systems and methods are outside copyright — 17 U.S.C. §102(b); facts
  are free — *Feist v. Rural*, 499 U.S. 340 (1991); functionally
  dictated material merges — *Lexmark v. Static Control*, 387 F.3d 522
  (6th Cir. 2004).
- **EU, directly on point:** data file formats are not protected
  expression of a program — *SAS Institute v. World Programming*,
  C-406/10 (CJEU 2012). Observation rights cannot be waived by contract
  and decompilation for interoperability is permitted — Directive
  2009/24/EC Arts. 5–6, with **Art. 8 voiding contrary contract terms**;
  reaffirmed in *Top System*, C-13/20 (CJEU 2021).
- **DMCA §1201 is out of frame by design:** iWork documents in this
  library's path are unencrypted zip + Snappy + protobuf; the descriptors
  sit unencrypted in the binaries; and **password-protected documents are
  refused** (`EncryptedDocumentError`). Even where §1201 applies,
  §1201(f)(3) expressly permits sharing interoperability information.
  This refusal is a deliberate, load-bearing property — keep it.

This project's pattern is stronger than the winning defendants' in every
case above: most knowledge comes from black-box measurement of documents
(the method Wine mandates), and the published artifact contains no Apple
code at all.

## The two gray items, and the decisions taken

**1. The vendored `.proto` dumps.** The schemas under `proto/` were
recovered from application binaries by third-party projects and have
been continuously public since 2013 (obriensp/iWorkFileFormat) and 2021
(masaccio/numbers-parser); this repo redistributes their bytes with
commit-pinned provenance. Their content — names, numbers, types — is a
set of facts about the wire format (Feist, merger, §102(b); SAS in the
EU), but no court has ruled on dumped descriptors as such, a US
breach-of-contract theory against an *extractor* exists in some circuits
(*Bowers v. Baystate*; *Davidson v. Jung* — against; *Vault v. Quaid* —
preempted; EU: voided by Art. 8), and EU Art. 6(2)(b) limits sharing
decompilation-derived information to what interoperability needs (these
files are the compiled-in input of `src/proto/vendored.ts`, which is that).
**Decision:** keep shipping the dumps with the no-copyright-claimed
notice in THIRD-PARTY-NOTICES.md; the fallback, should it ever be
needed, is regenerating schema text from this project's own measured
tables and shipping only that — the SheetJS/libetonyek pattern.

**2. The name.** `iwork-files` uses a (now retired — Creator Studio
replaced the iWork brand in 2026) Apple mark descriptively, inside a
twelve-year peer convention (`iWorkFileFormat` 2013, `keynote-parser`
2019, `numbers-parser` 2021) that has never drawn enforcement. Apple has
C&D'd open-source *names* before (iPodder → Juice, 2005), and npm's
dispute policy sides with trademark holders (kik, 2016), so the realistic
worst case is a compelled rename — cheapest to absorb now, at v0.1.0.
Names leading with Apple's house mark or the live Creator Studio brand
would be strictly worse under the nominative-use factors (*New Kids*,
*Toyota v. Tabari*) and Apple's own trademark guidelines; the only
zero-surface option is a coined name (the libetonyek pattern).
**Decision:** recorded in the repo history alongside this memo.

## Apple's observed enforcement line

Twelve to eighteen years of directly comparable projects — the three
iWork parsers above, SheetJS, libetonyek inside LibreOffice, and
libimobiledevice — with **no takedown, C&D or suit found against any
iWork format project, ever**. What Apple does act on: leaked verbatim
source (iBoot 2018; the 2025 apps.apple.com purge), commercial
replication shipping Apple's software (*Psystar*), and names tracking its
device brands. The one time Apple publicly tested the interop-RE line
(*OdioWorks*, iTunesDB, 2009), it withdrew in writing after EFF sued.
*Apple v. Corellium* ended with fair use affirmed for far more invasive
copying than anything here. GitHub's post-youtube-dl DMCA process
(technical + legal review, counter-notice, reinstatement) is the
backstop, and this repo's provenance tables are the counter-notice
exhibit.

## License

**MIT, kept deliberately.** It satisfies the goals — OSI-approved,
maximally permissive, battle-tested warranty and liability disclaimer,
derivative- and commercial-friendly — and matches every direct peer.
Apache-2.0's extra liability language buys nothing real here: its patent
grant binds only *contributors* (the realistic patent holder for a
format library would never be one), and it costs GPLv2-only
compatibility, which matters for a library meant to be embedded
anywhere. If corporate contributors arrive, dual `MIT OR Apache-2.0`
adds contributor-patent hygiene without losing reach. Public-domain-style
licenses (0BSD, Unlicense) were rejected: attribution chains are this
project's spine, and jurisdictional public-domain problems are real.

Mixed-content structure: root [LICENSE](../LICENSE) (MIT) for the
project's own work; [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md)
(shipped in the npm artifact) for the recovered schemas and redistributed
fixtures; [LICENSES/](../LICENSES/) with full MIT, Apache-2.0 and MPL-2.0
texts; [REUSE.toml](../REUSE.toml) declaring per-directory licensing
without editing byte-fidelity-critical files.

## Sources

Primary: the cases and statutes linked inline above; Apple, *Guidelines
for Using Apple Trademarks*; Directive 2009/24/EC; 17 U.S.C. §§102,
107, 512, 1201; EFF *Coders' Rights Reverse Engineering FAQ*; GitHub
DMCA takedown policy and the youtube-dl reinstatement; npm disputes
policy. Peer-practice evidence: the repositories of
obriensp/iWorkFileFormat, psobot/keynote-parser,
masaccio/numbers-parser, SheetJS, libetonyek, libimobiledevice, Asahi
Linux (copyright & RE policy), Wine (clean-room policy), Samba (PFIF).
