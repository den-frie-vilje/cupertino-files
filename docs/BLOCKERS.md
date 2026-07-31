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

**Kind C — a layout nobody wrote down, in files we already have.** No app
and no new document is involved; the evidence is on disk and the work is
measurement. Priority 8 is the only one of these, and it is only on this
page because it was mislabelled "out of scope" for long enough to matter.
Before writing another manual protocol, check the question is not really
this kind.

---

## The whole thing in one Mac session — about 25 minutes

Four documents settle everything below. Make them in the apps, drop them
anywhere, and run the commands. Nothing needs scripting.

**1. `functions.numbers` — 2 min.** Run `npm run harvest -- --emit-sheet probe.tsv`
first, open the TSV in Numbers, save as `.numbers`. Then
`npm run harvest -- --ingest functions.numbers`.
→ *Settles priority 1.* On a Mac with Numbers, `npm run harvest -- --drive`
does the whole thing in one command instead.

**2. `rules.numbers` — 10 min.** One numeric column, one text column. Add a
conditional-formatting rule for each of the six numeric comparisons
(equal to, not equal to, greater than, greater than or equal to, less than,
less than or equal to), then one "between", one "text contains", one
"is blank". Then `npm run harvest:predicates -- rules.numbers`.
→ *Settles priority 2*, and the non-comparison conditions feed priority 1.

**3. `controls.numbers` — 2 min.** Five columns, one control each: checkbox,
star rating, slider, stepper, pop-up menu. Give the slider and stepper
non-default min/max/increment and the menu three items. Then
`npm run probe -- controls.numbers`.
→ *Settles priority 3.*

**4. `animated.key` — 5 min.** Three slides, a different build effect on
each; on one, animate a text box delivered **by line** so it has chunks.
Give one build a non-default duration and delay. Then
`npm run probe -- animated.key`.
→ *Settles priority 4.*

**5. `borders.pages` — 5 min.** Four paragraphs, each with a paragraph
border set to a different position: top, bottom, top-and-bottom, all. Give
each a distinct rule colour so you can tell them apart in the output. Then
`npm run probe -- borders.pages`.
→ *Settles protocol 2*, the one remaining inferred mapping in the text
model. Note down which paragraph drew which edge; only "which edge does 1
draw?" is actually in question.

Each finding goes in the [`MANUAL-WORK.md`](MANUAL-WORK.md) ledger and
becomes a test. Then `npm run coverage` to refresh the matrices.

---

## Priority 1 — Formula authoring

**Blocked on:** the function-index table (Kind A).
`AST_function_node_index` is a position in an Apple-internal list. Two
entries are proven by arithmetic against the corpus — 168 = `SUM`,
212 = `DURATION` — and every function in every fixture now renders by name,
but authoring a formula means writing an index for a function nobody has
measured.

**Ruled out already:** the index is **not alphabetical**, and not
category-then-alphabetical either. `DURATION` sorts before `SUM` in both
orderings, yet is 212 against SUM's 168. There is no shortcut; it must be
measured.

**How to settle it — 2 minutes, no scripting:**

```sh
npm run harvest -- --emit-sheet probe.tsv      # writes a TSV
# open probe.tsv in Numbers, save as probe.numbers
npm run harvest -- --ingest probe.numbers      # writes src/tst/function-names.ts
```

Or, on a Mac with Numbers installed, one command:
`npm run harvest -- --drive` drives about 300 candidate names through the
app in a single pass.

The ingest refuses to guess: a name is accepted only when every argument
shape agreed, an index claimed by two names is rejected, and rows that are
not genuine probe rows are ignored. Protocol 1 in
[`MANUAL-WORK.md`](MANUAL-WORK.md).

**What it unblocks:** naming every function in every document; the
prerequisite for `TableModel.setFormula`.

---

## Priority 2 — Conditional-formatting and filter rule authoring

**Blocked on:** the `predicate_type` enum (Kind A). The corpus contains two
values, 5 = `=` and 9 = `<`.

**There is a prediction on the table.** Numbers' condition menu lists the
numeric comparisons in a fixed order — equal to, not equal to, greater
than, greater than or equal to, less than, less than or equal to — and
laying that out from 5 puts `=` at 5 and `<` at 9. Both observations land
exactly where the menu predicts. `PREDICATE_TYPE_HYPOTHESIS` in
`src/tst/predicates.ts` records the full prediction, and it is **never used
when reading** — reading takes the operator from the rule's formula, which
states it outright.

**How to settle it — 10 minutes:** make a Numbers table with one numeric
column and add a conditional-formatting rule for each of the six
comparisons, then:

```sh
npm run harvest:predicates -- rules.numbers
```

It prints each pairing and scores it against the prediction, ending in
`CONFIRMED`, `REFUTED`, or a list of conditions still untested. One
document either promotes the whole enum into `PREDICATE_TYPE_OPERATORS` or
kills the hypothesis outright. Protocol 4 in [`MANUAL-WORK.md`](MANUAL-WORK.md).

**Then also add**, in the same document, the conditions that are *not*
plain comparisons — "between", "text contains", "is blank". Those compile
to function calls, so they surface as unnamed function indexes and feed
Priority 1 too.

**What it unblocks:** creating conditional formats and filter rules, and
the "authoring" halves of two capability rows.

---

## Priority 3 — Numbers cell controls

**Blocked on:** `interaction_type` (Kind A) *and* no fixture (Kind B).
All 37 documents were surveyed: zero control spec tables, zero cells with
the control flag set, zero `CellSpecArchive` objects.

Reading is implemented in `src/tst/controls.ts` and classifies a control by
**which fields it populates** rather than by the unpublished enum — a spec
with min/max/increment is a range widget, one with a popup model is a
chooser. That is honest but coarse: it cannot tell a slider from a stepper.

**How to settle it — 2 minutes:** one Numbers document with a column of
each control: checkbox, star rating, slider, stepper, pop-up menu. Then:

```sh
npm run probe -- controls.numbers
```

Section 3 prints `interaction_type` and the populated fields for each. Five
rows of output name the whole enum.

**What it unblocks:** naming the widgets, and writing them — creation is
withheld today only because a control the apps silently drop is
indistinguishable from one that was never written.

---

## Priority 4 — Keynote builds

**Blocked on:** no fixture (Kind B). Eight decks span 2013 to 26.1 and not
one has an animation.

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

## Priority 7 — Category authoring, and recomputing filtered rows

**Blocked on:** evaluation, not understanding. Grouping rows means
computing the group tree; deciding which rows a filter hides means
evaluating its predicates. Both are calc-engine work. Reading is complete
for both, including a staleness check for categories.

---

## Priority 8 — Pre-BNC cell storage

**Blocked on:** one field, and it is being measured now. This was filed
"out of scope" and that was wrong — the classification was inherited from
the reference Python implementation rather than earned. Six of the corpus's
fifty tables use it, in four files already on disk, and **no Mac is
involved**: the records are here and the string table beside them is a free
oracle.

`npm run prebnc` does the measuring. What it establishes:

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

**What is left:** cells whose flag word sets bit 7 keep their text somewhere
other than the plain string slot. Column 0 of the `Transactions` fixture is
the one that does it, and it reads like a pop-up menu (`Type`, `101`, `102`,
`Debit Card`, `DEP`) — while `src/tst/formats.ts` already records format 266
as a pre-BNC-only pop-up menu. So bit 7 is very likely the control field and
a menu cell's text lives with the menu. Confirming that fixes `size(2)` and
the decoder follows.

Reading is the whole goal here. **Writing pre-BNC storage is not** — a
current app converts these files on open, so the useful behaviour is to read
an old document and save it in the modern storage, not to author a 2013
format.

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
npm run coverage                        # regenerate COVERAGE.md + VERIFICATION.md
```

Anything learned goes in [`MANUAL-WORK.md`](MANUAL-WORK.md)'s ledger and
becomes a test. A finding that lives only in a commit message has to be
rediscovered.
