# Working notes for Claude

## After a context compaction, read the manual

A compaction keeps the laws and loses the fingertips: the first
minutes after one have produced probes that guessed at method names
this repository defines, re-implemented printers `src/cli.ts` already
ships, and shelled out to python for listings `cupertino-dump ls`
prints. Before the first probe after a compaction, re-read the
surfaces: `skills/cupertino-files/SKILL.md` for the API, the CLI's
usage line for the tooling, and the relevant `docs/` page for the
domain. One read costs less than one failed guess, and the guesses
are visible to the person watching. Dog-food the library and its CLI
for inspection work — friction found that way is API evidence, which
python one-liners never produce.

## The repository speaks English

Everything checked in — code, docs, demo builders and the documents
they generate — is English: this is an open-source project, and text
only one language community can read walls the rest out. The demos
began in Danish because the checker reviews on a Danish-UI Mac and
phone; that was a locale courtesy, not a requirement, and it is over.
Where an instruction names a menu the checker must find in a Danish
UI, give the English path with the Danish label in parentheses once.
The checker's own words stay verbatim in whatever language they
arrive in — quotes in the ledger are evidence, and evidence is not
translated away. The shipped prose (README, changelog, skill, docs
site, and docblocks) follows the Apple Style Guide: closed em dashes, the serial
comma, no Latin abbreviations, and Apple's own names for the apps'
controls (Format sidebar, slide layout, presenter notes). Spelling
stays British; the style guide's American spelling does not apply.

## A returned file is read notes-first

Twice now a returned demo was diffed structurally before its cells
were read, and both times the notes column already contained the
answer — once naming the fault, once refuting a hypothesis an hour of
archive-diffing then rebuilt wrong (»I've done the right formula in
D«, misread as the app relocating library formulas). The protocol is
mechanical: on any returned file, dump every table's cells *and its
cell comments* first — the checker prefers answering as comments on
the cells themselves (`cellComments()`), so a dump that skips them
reads a clean file where the verdict sits — quote the checker's words
into the analysis verbatim, and only then open the archives. The
notes and comments are the measurement; the archives are the
explanation.

## Verification documents are comparisons, not questionnaires

The review loop began as "does this render?" and taught us more every
time the checker *authored* something than when they only looked. Build
that in: beside or below each feature this library writes, leave a
clearly labelled empty slot — values pre-filled where that saves work —
asking the checker to build the same thing with the app's own controls.
The returned file then carries Apple's construction next to ours, and
the diff answers questions no visual check can: not "did it draw" but
"what does the app write that we do not". A rung that passes visually
and returns an authored twin is still a measurement; a rung that only
passes is a dead end the moment something subtler goes wrong.

## A clone is a structure donor, nothing more

Tables, sheets and slides are created by copying because a from-scratch
build would omit state only the app knows about. That dependency cuts
both ways: everything the donor carries arrives too, and nothing about
it fits the clone by default. So cloning is followed by deliberate
choice, every time — row and column count cut to what the new table
uses, column widths set, formats and per-cell styling reset where the
donor's leak through, contents cleared where they linger. The failure
mode is not a broken file and no automated check sees it: a person
opens a mostly-empty husk, someone else's column widths, wrap styles
on number cells, or stale values, and reads carelessness. What is
kept from a donor is a decision, never a default.

## Documents get reviewed on a phone

The checker works from an iPhone as often as a Mac, and Numbers
documents especially must read on a phone screen without horizontal
scrolling: keep a table's total width modest, put instructions in one
wrapped column rather than many, and never assume a wide canvas.

Layout rules that have already bitten:

- **Headers are short.** The header band is *pinned* while scrolling,
  on the phone too, so whatever sits in row 0 rides along on every
  screen. It gets one-word labels only; the document's title and intro
  go in the first content row, which scrolls away, or in a comment. A
  sentence in a narrow header column once grew a permanent five-line
  band across the whole review.
- **Long text wraps; values do not.** Any cell holding prose gets
  `textWrap: true` and its row left to fit itself. Number, date and
  boolean cells never wrap — their column is made wide enough for the
  content instead. A Pages table with long row notes shipped with
  truncated cells because nothing set the wrap; that is the failure
  this rule exists to prevent.

## Asking for manual verification

Anything in this project that touches an iWork app for real has to be
checked by a person on a Mac, and that request is the only part of the work
the machine cannot do. Make it as cheap as possible to act on:

- **Attach the files again, every time.** Never say "the file from before"
  or "rungs 11 and 12" or "the three I sent". Regenerate and re-send.
- **The files are the last thing sent before waiting.** Whenever a turn
  ends in a state that depends on the checker acting, the files ride
  that final message — after every measurement and deliberation, never
  above them. The checker acts from the bottom of the conversation and
  must never scroll back to find what to open.
- **Write instructions that stand alone.** Someone reading only the latest
  message should know what to open, what to look at, and what a pass and a
  failure each look like. No pointing back up the conversation.
- **Say what a failure means**, not just what to look for — a failure is
  usually the more informative outcome and should not feel like bad news.
- **One thing per file where it is cheap to do so.** A ladder of documents
  that each change one thing localises a fault without a second round trip.
- **The file must carry its own answer.** A checker should not need the
  original to tell whether a rung passed. This bites hardest on deletions
  and on anything visual: a word that is absent looks exactly like a word
  that was never there, and a graphic that failed to appear looks exactly
  like a blank page. Put the expected result *in* the document — a line
  that says what the line below should say — rather than in the message.
- **Feedback is the app's comment function, never a column.** The
  checker replies as a comment on the exact cell (`cellComments()`
  reads them back, replies included), and has declined typed-in
  feedback columns explicitly — twice. Demo tables carry no notes,
  feedback or verdict columns; they cost table width on a phone and
  ask the checker to type where a comment is cheaper. Instructions
  say: comment on the cell itself; no comment means as expected.

## What counts as verified

The suite proves this library agrees with its own reading of Apple's files.
That is not the same as proving an app accepts what we invented, and three
bugs have now made the difference concrete:

1. A conditional rule omitted two `required` fields — malformed, and
   Numbers refused the document.
2. A cell style omitted `super` — same class, in shipped code.
3. A control had no *format* — perfectly well-formed, every required field
   present, and the widget silently never drew.

The first two are now caught by `npm run required:check`, which reads the
vendored schema rather than trusting the writer. Nothing static catches the
third, because nothing about it is wrong; it is wrong only by omission
against what Apple writes. That is what `test/authored-shape.test.ts` is
for — it asks what a real cell has that ours does not — and `npm run
shape:audit` generalises the question: it runs every ladder rung and
compares each archive we write against the corpus profile for its type,
in fields and in referrers both.

So: **well-formed is not working.** When a feature has never been opened in
the app, say so plainly, and put it in a `manualProof` block in
`scripts/coverage-matrix.ts` rather than describing it as done. When it has
been checked, add `settled:` to that block so the request moves off
`docs/VERIFICATION.md` and keeps its reasoning.

## Changelog and release notes face downstream

The changelog and the release notes it generates are read by people
who install the package, not by people who watch this repository.
Entries describe bug fixes, API changes and new features — what
changed for a user, in a sentence or two each, under Fixed/Added/
Changed headings. They never mention demo files, review rounds, field
reports, corpus counts or how a finding was made: maintainers have
git history, pull requests and `docs/BLOCKERS.md` for all of that.
After editing a released section, run Actions → Sync release notes
for that version so the published page matches the changelog.

## Defaults are Apple's

Where this library supplies a default — a fresh shadow's parameters, a
stroke's shape, anything a user gets without asking — the default is
what the app itself writes for the same action, measured, never a
value we find reasonable. People reaching for cupertino-files expect
"add a shadow" to look like Pages' "add a shadow"; deviating hands
them styling nobody chose. When the app's own default has not been
measured yet, say so in the docblock rather than inventing one, and
prefer measuring it (a returned one-delta file settles it) over
shipping a guess.

## Measured numbers in prose

A count stated in README, docs/FORMAT.md or the skill was true the day
it was written and silently stops being true when the corpus grows.
Every such number gets an entry in `test/docs-claims.test.ts`, which
re-measures it against the live fixtures — register the claim when you
write it, and when the test fails, update the sentence to the number
the failure names. Generated pages (coverage, verification,
conformance, tool docs, blanks) are already gated by their own
`--check` modes, and the site's API reference is rebuilt from the
docblocks on every deploy; numbers in code docblocks are pinned by the
invariant tests beside them, not here.

## Borrowed documents

Measurements from documents that cannot be redistributed live as constants
in the test files, each naming where it came from so it can be re-measured.
Do not add such a document to `fixtures/`.

## Comments record state; commits record history

A comment or docblock describes the *current* state of knowledge: what a
field means, what the invariant is, what is still unmeasured. It does not
narrate how or when that knowledge arrived — no dates, no run-by-run
stories, no obituaries for refuted guesses, and no "see the ledger"
pointers either: git blame reaches the history without a signpost.
Provenance lives where history lives: the commit message that landed the
change, the ledger in `docs/BLOCKERS.md`, and the changelog.
(`manualProof`/`settled` blocks in `scripts/coverage-matrix.ts` are part
of that history layer, not of the code.) When a measurement closes a
question, rewrite the comment to the settled state and put the story in
the commit message. A test still names the fixture or document it
re-measures — that is evidence, not history — but not the date it was
first run. Test titles and describe blocks are comments too: name the
file, never who provided it or the session that produced it — "donated",
"returned", "measured on the phone" all belong in the commit message or
`fixtures/ATTRIBUTION.md`, never in code. Code that narrates its own
past fills context fast and goes stale faster.

## Reading the apps' binaries with REA and Ghidra

The installed Pages, Numbers and Keynote bundles answer what no document
can: the names behind plain integer codes, the defaults a writer emits,
and the schema itself. REA is registered as an MCP server in the DFV
profile, and Ghidra 12.1.4 under `~/Applications` is its decompiler.
The traps, each paid for once:

- **REA setup registers whatever launcher ran it.** Under `pnpm dlx` it
  writes the absolute path of pnpm's cache copy, which pnpm prunes within
  a day. The registered command must read `pnpm dlx rea-agents@<version>
  mcp`; REA's own `doctor` then calls the entry stale, which is cosmetic,
  but a `rea setup` re-run writes the cache path again.
- **Ghidra 12.1.4 ships no macOS natives.** `gradle buildNatives` from
  `support/gradle/` builds the decompiler and sleigh for the host in half a
  minute, run through pkgx with Gradle, bison 3 and a JDK 21. The
  Makefile route hard-codes x86_64 and is the wrong one on this Mac.
- **The bridge refuses universal binaries.** Thin the slice first
  (`lipo -thin arm64`) into the scratch area, and pass `--snapshot` so
  REA keeps its evidence. Each REA call still re-imports the target into
  Ghidra, about eleven minutes for TSTables, so chain as little as
  possible and prefer the cheap reads: `inspect-native-dispatch-metadata`
  gives Objective-C method addresses without a decompiler (capped at
  20000 records), `search --kind strings` and `xrefs` reach data.
- **Objective-C methods are addressed as `Class::selector:`**, colons
  kept, class and instance methods alike. A string's first reference is
  usually its CFString constant in `__DATA_CONST`; the code is one hop
  further.
- **The engine is in the frameworks, not the app binary.** TSPersistence
  holds the IWA layer, TSTables the table engine and formula specs,
  TSUtility the format types, TSDrawables and TSStyles the rest. Each is
  a far smaller target than the app.
- **What leaves the session is the fact, never the code.** Pseudocode,
  evidence bundles, snapshots and thinned binaries stay under `/tmp`;
  the repository gets a measured constant, its test and a ledger row
  (docs/LEGAL.md, item 3).
- **The CLI did the work, not the MCP tools.** Every measured fact came
  from `pnpm dlx rea-agents@6.4.0 <analyze|decompile|function|search|xrefs|
  inspect-native-dispatch-metadata> <thin slice> --provider ghidra
  --snapshot /tmp/rea-snapshots/<FW>.json --format json > out.json`, run
  in the background with `GHIDRA_INSTALL_DIR=~/Applications/
  ghidra_12.1.4_PUBLIC`, `JAVA_HOME=~/.pkgx/openjdk.org/v21.0.8.7` and
  `REA_GHIDRA_STARTUP_TIMEOUT_MS=5400000` exported. The output file may
  carry pnpm noise before the JSON, so parse from the first `{`; the
  pseudocode sits at `normalized_result`. `--token-limit` and
  `--format json` do not combine.
- **Name forms.** An address from `nm -n` always works and
  `Class::selector:` works; `-[Class sel:]` and underscore forms are
  rejected. `xrefs` returns a bare array of addresses. Dispatch metadata
  lands at `.normalized_result.result.objc_classes[].methods[]` with
  `selector` and `address`, capped at 20000 records. Between app
  versions, map addresses by symbol name with `nm -n`.
- **Timings on the 15.4 slices.** TSStyles analyses in 75 s and
  decompiles in about a minute, TSKit about 150 s per decompile,
  TSUtility about 300 s, TSTables 673 s to analyse and 610 to 760 s per
  call, past the foreground shell limit. Two Ghidra jobs take 1 to 1.6
  GB each; a failed cleanup leaves an orphan java and `rea-ghidra-*`
  directories under `$TMPDIR` to remove by hand. Snapshots and slices
  vanish on reboot and nothing in the repository depends on them.
- **When Ghidra fails, `otool` does.** `otool -tv -p <symbol>` reads one
  function's instructions, `otool -ov` the Objective-C class and method
  tables, and a node read of `__DATA_CONST` settled the whole formula
  registry (`scripts/function-registry.ts`); a duration format's
  defaults were four `mov` immediates read that way.
- **Read the file before decompiling.** The formula registry, the duration
  initialiser and the group-by sidecar fields were all settled by reading
  bytes and instructions in node or by a corpus census, in minutes; the
  Ghidra route costs eleven minutes per TSTables call and its `xrefs`
  step died twice in provider cleanup. Decompile when the question is a
  switch or a computed value; measure the data when it is a table.
- **Every new writer gets a ladder rung before it gets a commit.** The
  shape audit (`npm run shape:audit`) compares what a rung writes with
  the corpus in fields and referrers, and in one night it caught a
  category tree nothing pointed at, a filter field no app-written set
  carries, and a build aimed at a text storage instead of its
  placeholder. None of the unit tests saw any of them. A rung is three
  lines in `make-bisect-docs.ts`, `make-pages-docs.ts` or
  `make-keynote-docs.ts`; the audit's budget (`shape:check`) is the gate.
- **A donor grafted across apps carries its app's wiring.** The neutral
  Numbers table under a Pages body or a Keynote slide anchors exactly as
  the corpus does, and the shape audit still listed seven referrer
  patterns no Pages or Keynote table shares: declared back-references,
  the preset outside the theme, a style outside the network. Two closed
  by measurement (table infos never declare their parent, styles are
  listed in the stylesheet); the rest ship the feature as
  `experimental`, carried by seeds rather than the audited ladders, so
  the budget stays honest and the app gets the question.
- **Ladder scripts write into the current directory by default.** Pass
  an output directory (`npm run keynote:docs -- /tmp/kladder`); a bare
  run litters the repository root with `.key` files that only `git
  status` reveals.
- **A fresh test is read notes-first too.** Three of the night's test
  failures were the test's own mistake — a donor set collected after the
  add, slide objects compared by identity across two `slides()` calls, a
  float32 colour compared to its decimal — and each cost a diagnostic
  script the assertion message already answered. Read the actual value
  before touching the writer.
- **A round trip over the corpus is an instrument too.** Exporting every
  fixture to Markdown, building a document back and exporting again
  found three things no unit test saw: table names headed tables that
  hid them, the Numbers reader and writer disagreed on heading levels,
  and the Keynote reader made a slide of every heading. Any writer with
  a matching reader gets a corpus round trip (`test/markdown-corpus.test.ts`
  is the pattern), comparing the structure the pair claims to carry.
- **A reference extractor must reproduce Apple's order, not just its
  set.** The table-model extractor matched every corpus model as a set
  on the first try and broke a byte-identical round trip on the second,
  because a dirtied Apple-written object is re-declared by the extractor
  and the apps declare in a field sequence that is not field order.
  Measure the sequence per field (single-field scans, nested stores
  included) and compare lists, not sets, before registering; the merge
  fixture's round trip is the gate.
