# What is still unknown, why, and exactly how to settle it

Everything in this project that is not done is on this page, with the
reason it is not done and the shortest path to finishing it. Nothing here
is "hard"; each item is blocked on one specific fact.

Read this before starting work. It is ordered by how much it unblocks.

---

## The shape of every remaining blocker

There are three kinds left, and only the first two need a Mac.

**Kind A — an integer enum Apple never published.** The archive is fully
readable; one field is a number whose meaning is not in any schema. Reading
works around it (the value is carried through, and the meaning is derived
some other way); *writing* cannot, because a wrong code produces a file
that loads and misbehaves.

**Kind B — a structure no fixture contains.** The schema describes it, so
the code can be written, but nothing checks the code is right. Shipping it
unmarked would be the one thing this project refuses to do.

Both are settled the same way: **one document made in the app, read back
with `npm run probe -- <file>`.** That script reports every unknown in a
single pass, so a well-chosen document closes several at once.

**Kind C — a layout or an enum nobody wrote down, in files that already
exist.** No app and no new document is involved; the evidence is on disk,
or on somebody's disk, and the work is measurement. This turned out to be
most of the page — priorities 1, 3 and 8 were all this kind while filed as
something harder. **Before writing another manual protocol, check the
question is not really this one**; see "Borrowed corpora" below.

---

## Start here on a Mac: does our output open at all?

Everything below settles an unknown. **This settles a risk**, and it is the
larger of the two.

```sh
npm run bisect:docs ~/Desktop/rungs    # one document per feature, 00 … 15
npm run verify:doc                     # or everything in one file
```

### What the app has already told us

Three rounds of opening these in Numbers found three bugs the offline suite
could not, and they are worth reading as a set, because each failed
differently:

1. **A conditional rule was malformed.** `cell_style` and `text_style` are
   `required` in proto2 and were being omitted. Numbers refused the whole
   document. Now caught by `npm run required:check`, which reads the
   vendored schema instead of trusting the writer.
2. **A cell style was missing `super`**, also `required` — found by that
   same checker the moment it existed, in `setCellFormatting`, a feature
   that had been shipped for some time.
3. **Controls never drew.** Nothing was malformed: a widget needs a *format*
   as well as a spec, and without one the cell renders its value and the
   widget is simply absent (FORMAT.md §14.7.1). Every offline check passed,
   including a byte comparison against Apple, because a byte comparison
   confirms the parts you thought to write.

The third is the instructive one. It is why
`test/authored-shape.test.ts` now asks the opposite question — what does a
*real* cell have that ours does not — and why the answer to "is it
verified?" has to come from the app for anything the format does not
mechanically enforce.

**Verified in Numbers so far:** the file opens; checkbox, star rating,
slider and stepper all draw, which also settles the 4/5 stepper/slider
pairing that used to rest on elimination.

### Pages has its own ladder now, and none of it has been run

Everything above is Numbers. Every rung of `npm run bisect:docs` writes a
`.numbers` file, so **no document this library authored has ever been opened
in Pages** — despite Pages having the most fixtures here (20 of 38) and the
largest write surface. Thirteen unverified claims touch it, three of them
high risk, including the most basic one there is: that Pages opens a file we
saved at all.

```sh
npm run pages:docs ~/Desktop/pages-rungs    # P00 … P11
```

P00 is the load-and-save-with-no-edit case, which isolates the container
layer from every feature above it. P01 up each add one thing: a paragraph,
character formatting, a paragraph style, a hyperlink, header and footer
text, a page-number field, a section break, a comment, a footnote, page
setup, an inline image.

All twelve pass `npm run required:check` and read back their own change, so
what remains is exactly the class of fault that check cannot see — the one
that cost three round trips on the Numbers side.

### Still to answer

Open the ladder in order and stop at the first failure — each rung changes
exactly one thing more than the one below, so whatever breaks names itself.

1. Do the formulas recompute when a value they depend on changes?
2. Is the conditional format on the negative number and not the positive?
3. Is the merged row actually merged?
4. Does the regrouped table (rung 11) show the moved row under its new
   group heading?
5. In rung 12, is *only* the first chart's first series recoloured — the
   others share that style archive, and the copy-on-write is the thing
   being tested.

A failure is worth more than a pass. `npm run test:e2e` covers "does it
open" automatically.

---

## What still needs a Mac — about 12 minutes

Most of this page has been settled without one. Three documents remain, and
none of them takes long.

**1. `rules.numbers` — 5 min.** One numeric column. Add a
conditional-formatting rule using **greater than** and another using
**greater than or equal to** — those two conditions, specifically; the other
four comparisons are already confirmed. Then
`npm run harvest:predicates -- rules.numbers`.
→ *Finishes priority 2.* While you are there, add "between", "text
contains" and "is blank": those compile to function calls and widen the
function table.

**2. `animated.key` — 5 min.** Three slides, a different build effect on
each; on one, animate a text box delivered **by line** so it has chunks.
Give one build a non-default duration and delay. Then
`npm run probe -- animated.key`.
→ *Settles priority 4*, the last gap with no data anywhere.

**3. `borders.pages` — 2 min.** Four paragraphs, each with a paragraph
border set to a different position: top, bottom, top-and-bottom, all. Give
each a distinct rule colour so you can tell them apart. Then
`npm run probe -- borders.pages`.
→ *Settles protocol 2*, the one remaining inferred mapping in the text
model. Only "which edge does 1 draw?" is actually in question.

**Nobody needs to report back on this one.** An iWork package carries a
rendered `preview.jpg` of its first page, so the file itself shows which
edge each value drew — the whole answer is inside it. Just make the
document and hand it over.

The catch, and the reason 128 documents produced no evidence: Apple's
templates *define* bordered heading styles that documents never apply, and
an unused style renders nothing. The paragraphs must actually carry the
border. `npm run probe` now labels each one `USED` or
`(defined but unused)` so this cannot be missed twice.

Each finding goes in the [`MANUAL-WORK.md`](MANUAL-WORK.md) ledger and
becomes a test. Then `npm run coverage` to refresh the matrices.

**Before making any of these, read "Borrowed corpora" below.** Two of the
three might already exist in somebody's test data, and reading a file is
faster than making one.

---

## Priority 1 — Formula authoring — **reading DONE, authoring open**

**271 function indexes are named**, harvested from public spreadsheets that
spell each call out as text beside the live formula — the same layout this
script emits, authored by someone else. Zero conflicts, and the two indexes
previously proven by arithmetic (168 `SUM`, 212 `DURATION`) came out of the
harvest unchanged. Every function in every committed fixture renders by
name.

**Ruled out along the way:** the index is **not alphabetical**, and not
category-then-alphabetical either. `DURATION` sorts before `SUM` in both
orderings, yet is 212 against SUM's 168.

**What is still open** is authoring, and it is no longer about the table: a
function outside the 271 has no index, and writing a formula also means
writing the dependency records the calc engine keeps beside it. Widening
the table is the same harvest against more documents.

The harvest itself is unchanged and re-runnable:

```sh
npm run harvest -- --ingest doc.numbers [more.numbers ...]
npm run harvest -- --emit-sheet probe.tsv   # to author a probe sheet
npm run harvest -- --drive                  # macOS: drive Numbers directly
```

It refuses to guess: a name is accepted only when every observation agreed,
an index claimed by two names is rejected, and rows that are not genuine
probe rows are ignored. Protocol 1 in [`MANUAL-WORK.md`](MANUAL-WORK.md).

---

## Priority 2 — Conditional-formatting and filter rule authoring

**Blocked on:** two codes of the `predicate_type` enum, and only their
pairing.

Numbers' condition menu lists the numeric comparisons in a fixed order —
equal to, not equal to, greater than, greater than or equal to, less than,
less than or equal to — and laying that out from 5 predicts all six codes.
**Four are now observed**: 5 `=`, 6 `<>`, 9 `<`, 10 `<=`, each exactly
where the menu says. That leaves codes 7 and 8 and operators `>` and `>=`;
the only open question is whether they are in menu order or swapped.

`PREDICATE_TYPE_HYPOTHESIS` in `src/tst/predicates.ts` records the full
prediction and is **never used when reading** — reading takes the operator
from the rule's formula, which states it outright.

**How to settle it:** any document with a "greater than" conditional rule.

```sh
npm run harvest:predicates -- rules.numbers
```

It prints each pairing, scores it against the prediction, and ends in
`CONFIRMED`, `REFUTED`, or a list of conditions still untested. Protocol 4
in [`MANUAL-WORK.md`](MANUAL-WORK.md).

**What it unblocks:** the remaining two conditional-formatting operators.
Conditional-rule authoring itself is **done** for `=`, `<>`, `<` and `<=`,
byte-identical to Apple's. Filter authoring needs more than this code: see
Priority 7.

---

## Priority 3 — Numbers cell controls — **DONE**

`interaction_type` is **4 stepper, 5 slider, 6 star rating, 7 pop-up menu,
8 checkbox**, measured from borrowed documents that lay one widget out per
row and say in their own cell values which row is which: a checkbox row
holding FALSE/TRUE, a star row bounded `[0…5]`, a slider row whose bounds
match a published test building exactly that cell as a slider. Stepper is
the remaining range widget once the other four are accounted for.

That also found a bug. A checkbox's whole archive is a single varint, and
the reader skipped exactly that shape to avoid misreading a bare
`TSP.Reference` — so it dropped every checkbox in every file. The list
entry's spec is field 12, which removes the guess and the bug together.

`controlShape` survives and stays useful: it classifies by populated fields
independently of the enum, so a future sixth widget degrades to "range" or
"chooser" rather than misreading.

**Still open:** *writing* a control. Nothing here creates one — a widget the
apps silently drop looks exactly like one that was never written, and that
needs the app to check.

---

## Priority 4 — Keynote builds

**Blocked on:** no fixture (Kind B), and this is now the *only* gap with no
data anywhere. Eight decks in this repository span 2013 to 26.1, and a
further seven borrowed from three parser projects were checked as well —
fifteen decks, not one animation. Keynote test corpora do not animate,
so this one really does need a deck made on purpose.

The schema is complete — `KN.BuildArchive`, `KN.BuildChunkArchive`,
`KN.BuildAttributesArchive` with its five enums — so `src/keynote/builds.ts`
reads and edits builds today. What it will not do is create one, and
`effect` is exposed as the raw string Apple stores rather than an enum of
invented names.

**How to settle it — 5 minutes:** one deck with three slides, each
animating one object with a different effect, one of them text delivered
by line so it has build chunks. Then:

```sh
npm run probe -- animated.key
```

Section 4 prints each build's delivery string, effect name and the
attribute fields it populates.

**What it unblocks:** confidence in the read model, an effect vocabulary,
and build creation.

---

## Priority 5 — Chart appearance

**Blocked on:** nothing but work. Chart *data* is fully editable; type,
colours, axes and legend are held in style references this library does not
model. This is a normal implementation task on the TSCH style archives, not
a reverse-engineering one — the corpus has only two charts, so a document
with several chart types would help.

---

## Priority 6 — Writing merge ranges

**Blocked on:** nothing conceptual any more. A merge is a formula owned by
a UUID derived from the table's own, and since the formula-owner map landed
(`src/tsce/owners.ts`, FORMAT.md §14.11) those identities are readable and
nameable. What remains is writing the owner entry, its dependency records
and the merge formula together, then checking the result in Numbers.

---

## Priority 7 — Category *creation*, and recomputing filtered rows — **half done**

The old entry filed both under "evaluation, not understanding", and for
categories that was half wrong. Grouping rows by a column's value is not
calc-engine work — the values are right there — so `regroupCategories`
now puts rows back where their values say they belong, and regrouping
unchanged data reproduces Apple's archive **byte for byte** across every
by-value table in the fixture.

What is genuinely blocked is *creating* a group: its identity, its sort
position, and the run of fields the archive carries beside the tree (eight
messages at fields 7–13 and 16, a count at 14, per-row UUID pairs at 15)
are not explained by any fixture. Bucketed groupings ("dates by quarter")
stay blocked too — placing a row in a bucket means evaluating the
grouping formula.

Filters remain fully blocked, for the original reason: which rows a filter
hides lives in `TST.HiddenStateExtentArchive` and computing it means
evaluating predicates.

---

## Priority 8 — Pre-BNC cell storage — **DONE**

Filed "out of scope", which was wrong: the classification was inherited
from the reference Python implementation rather than earned. Six of the
corpus's fifty tables use it, in four files already on disk, and no Mac was
involved — the records were here and the string table beside them was a
free oracle.

**All 123 pre-BNC records in the corpus now decode, none refused.** The
proof is not that values come out; a wrong offset also produces values. It
is that the values *mean* something: `tika-testNumbers2013.numbers` reads
as a month of October 2009 transactions in date order, with descriptions
matching their amounts, rent negative and the paycheck positive.

`src/tst/prebnc.ts` decodes; `npm run prebnc` re-derives the measurements
on demand. What they establish:

- The header is 12 bytes and is v5's header with a wider extras word:
  version(1) type(1) pad(2) flags(u32 @4) extras(u32 @8). Version is 4 and
  the pad is 0 in all 123 records.
- Payload sizes come out of a linear system — flag word against record
  length — that six flag combinations over-determine. Bits 1, 3 and 7 are
  pinned outright at 4 bytes by pairs differing in exactly that bit. The
  rest are pinned relative to bit 2: `size(2)+size(4)=8`,
  `size(2)+size(5)=16`, `size(2)+size(6)=16`.
- Bit 2 is set in every record, so it is a marker or a field every cell
  carries — which is why its size is the last free variable, and why
  `size(2)` is 0 or 4 with nothing else fitting.
- The values are already legible. Text cells resolve against the string
  table exactly: a whole header row (`Type · Date · Description · Category ·
  Amount · Balance`) and a whole description column come back as sensible
  English. Number cells hold IEEE doubles landing on exact bit patterns
  (2.0, 0.5, 0.1, 7.0); date cells hold seconds-since-2001 the same way.

**Why it decodes by position, not by flag.** Bit 2 is set in every record,
so its size cannot be separated from bits 4, 5 and 6 by length alone, and
the exact flag→field assignment stays open. What is *not* open is where the
value sits: across all six combinations it lands at the same place relative
to the **end** of the record — a text cell's string key is the last four
bytes, a number or date's double is the eight before a single trailing
word. That is what the reader uses, and it refuses any record shape it has
not measured rather than extending the rule on faith.

**Still unnamed, and deliberately so.** Bit 2's size (0 or 4); what the
leading words are (they look like per-cell style keys, incrementing by row);
what the trailing word after a number is (constant per column, so probably a
format key). None of these are needed to read a value, and none are guessed
— `PreBncRecord.leading` and `.trailingId` report them raw.

**Not implemented and not planned: writing pre-BNC storage.** A current app
converts these documents on open, so the useful operation is to read an old
file and save it modern, which the v5 writer already does. Pre-BNC formulas
are also not decoded; `isFormula` is false throughout rather than guessed.

---

## Borrowed corpora — the technique that closed most of this page

Three of the blockers on this page were settled in an afternoon by a method
worth naming, because it applies to the rest.

**Somebody has already made the document you need.** Every parser project
for a format keeps test files, and those files exist precisely to exercise
one feature each — which is exactly what a fixture gap is. A public
spreadsheet that demonstrates 271 functions by writing each call out as text
beside a live formula *is* the probe sheet this project emits, already
filled in.

The rule that keeps it clean: **read the properties, keep the measurement,
discard the file.** Nothing borrowed is committed here. What survives is
constants with the evidence written down, and tests that rebuild the
structures byte-for-byte from that evidence — see `test/controls.test.ts`,
where each spec is reconstructed as it appeared rather than as it would be
convenient. A test that needs a file nobody may redistribute is a test that
cannot run.

Two tools make a borrowed corpus pay:

```sh
npm run stress -- <dir>    # every reader over every file; what throws?
npm run probe -- <dir>/*   # every unknown, one pass
```

`stress` answers robustness, and it is the one that finds bugs. The first
run over 87 borrowed documents turned up two: `readPredicate` assumed a
field was length-delimited where a real document put a varint, and the
control reader dropped every checkbox. Neither could have surfaced from the
committed corpus, because neither shape is in it.

**What the scale also says.** Across 176 borrowed tables, exactly **one**
carried filter rules — 164 had a filter set and 163 of those were empty.
The long-standing worry that this library's filter reader was untested was
half right: it is barely exercised because Numbers writes an empty set for
almost every table, not because the corpus was unlucky.

**A second run, targeted at the three remaining gaps.** Borrowing again —
this time asking only "which documents demonstrate filters, categories or
charts?" — settled two of them and sharpened the third:

- **Charts.** 14 real charts across 10 chart types showed that series style
  archives are *shared*: one was referenced by ten charts, and nine of the
  eighteen present by more than one. That turned a straightforward setter
  into a copy-on-write one, and it is not a thing any amount of reading the
  proto would have suggested. See FORMAT.md §14.10.1.
- **Categories.** The borrowed corpus turned out to be unnecessary — the
  committed fixture already carries every grouping the UI offers. Worth
  recording as a caution: check what is already on disk before borrowing.
- **Filters.** The one populated set uses `predicate_type` 54, whose
  predicates are function calls rather than comparisons. It teaches the
  container and nothing about the common case.

The files were read and deleted, as before. Nothing borrowed is committed.

---

## Settled without a Mac — kept as a record of method

These were on this list and are not any more. The reasoning is worth
keeping, because it generalises.

**Cross-table formula references.** An AST's `table_id` matched no table,
and this was filed as an unresolvable derived UUID. It was neither: the id
is a *calc-engine owner* identifier, and `TSCE.FormulaOwnerDependenciesArchive`
maps every owner to its object. All 1020 cross-table references in the
corpus now name their table.

> **The lesson:** the proto for the archive that *uses* an identifier
> rarely explains it. Look for the archive that *issues* identifiers —
> usually a registry or dependency tracker elsewhere in the same family —
> before concluding an identifier is derived or opaque.

**`FUNCTION_212` and the token-node bug.** Chasing the corpus's one unnamed
function proved 212 = `DURATION` arithmetically, and in doing so exposed a
rendering bug: `TOKEN_NODE` carries `AST_token_node_boolean`, so omitted
arguments were rendering as `TRUE`. `DURATION(TRUE,TRUE,8,22,11,500)` would
evaluate to something eight days off the cached result — which is how the
bug was caught.

> **The lesson:** when a rendered formula and its cached result disagree,
> the renderer is wrong. The cached value is a free oracle and it was not
> being used.

**Owner kind 200.** Looked like an unresolved owner in every document until
the identities were compared: all 23 are the same hardcoded `uid = 666`
from `base = 466`. A constant repeated across every file and every app is a
sentinel, not data.

**The `owner_kind` enum — nine of thirteen values.** Apple publishes no
enum, and none was needed. Every derived owner is *used* by a field
somewhere, so matching each field's UUID back to its owner entry names the
kind: `conditional_style_formula_owner_id` → 3,
`hidden_state_formula_owner_for_rows` → 4, the inline `merge_owner` → 5,
`GroupByArchive.group_by_uid` → 8, `aggregate_formula_owner_uuid` → 9,
`hidden_state_formula_owner_for_columns` → 11, `haunted_owner` → 35. Each
unanimous across every file that exercises it. Kinds 6, 7, 10 and 12 have
no field pointing at them in the protos available here, so they stay
unnamed.

> **The lesson:** an unpublished enum can often be read off the *usage*
> rather than the definition. If a value labels something, find what reads
> it. This is the method to try before writing another manual protocol.

---

## Running the probes

```sh
npm run probe -- <file...>              # every unknown, one pass
npm run harvest -- --emit-sheet f.tsv   # function-index probe sheet
npm run harvest -- --ingest f.numbers   # ingest it
npm run harvest -- --drive              # macOS: drive Numbers directly
npm run harvest:predicates -- f.numbers # score the predicate-enum prediction
npm run prebnc                          # measure the pre-BNC cell record
npm run stress -- <dir>                 # every reader over every file: what throws?
npm run verify:doc                      # a document exercising everything we author
npm run proto:check                     # field constants against the vendored schemas
npm run coverage                        # regenerate COVERAGE.md + VERIFICATION.md
```

Anything learned goes in [`MANUAL-WORK.md`](MANUAL-WORK.md)'s ledger and
becomes a test. A finding that lives only in a commit message has to be
rediscovered.
