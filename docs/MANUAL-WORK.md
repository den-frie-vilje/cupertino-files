# Manual work: protocols and ledger

Some facts about the iWork format cannot be derived from files. They live
inside Apple's applications, and the only way to learn them is to make an
app do something and observe the result.

This file is the durable record of that work. It has two halves:

- **Protocols** — repeatable procedures anyone can run, each producing a
  checked-in artifact rather than a note in someone's head.
- **The ledger** — what has actually been run, by whom, against which app
  version, and what it produced.

The rule that makes this worth keeping: **manual work must end in an
artifact the repository can hold.** A finding that lives only in a commit
message or a person's memory has to be rediscovered. A finding that lands
in `data/` and regenerates a source file is permanent and extensible.

Related: [`docs/VERIFICATION.md`](VERIFICATION.md) lists claims that need a
Mac to *confirm*. This file covers work that produces *new knowledge*, and
[`docs/BLOCKERS.md`](BLOCKERS.md) is the priority-ordered view — what is
still unknown, what each unknown blocks, and the shortest path to settling
it. **Start there.**

One command reports every remaining unknown in a document at once:

```sh
npm run probe -- <file...>
```

so a well-chosen file closes several protocols in a single pass.

---

## Protocol 1 — Harvest the formula function-index table

**What it produces:** `data/function-index.json` and the generated
`src/tst/function-names.ts`, mapping `AST_function_node_index` to function
names.

**Why it cannot be automated away:** the index points into a list compiled
into Apple's binaries. No schema contains it, and a document records the
index but never the name. Numbers is the only authority.

**The trick that makes it cheap:** a formula that fails to *evaluate* still
stores its function node. `=ABS()` has the wrong argument count, so the
cell shows an error — and the AST is written anyway. The harvest therefore
needs no knowledge of any function's real signature; it writes several
argument shapes per candidate and keeps whichever parsed.

### 1a. Automated (preferred) — a Mac with Numbers

```sh
node scripts/harvest-functions.ts --drive
```

That builds the probe sheet, has Numbers open and save it, reads the result
back, and writes both artifacts. Expect a one-time macOS automation prompt.
Nothing else is required.

### 1b. Manual (last resort) — about two minutes of your time

Use this when there is no Mac to hand from the automation host, automation
permission is refused, or a Numbers version will not accept a scripted
formula.

1. **Generate the probe sheet** (anywhere — no Mac needed):

   ```sh
   node scripts/harvest-functions.ts --emit-sheet ~/Desktop/probe.tsv
   ```

   You get a tab-separated file: one row per candidate function per
   argument shape, roughly two thousand rows. Column A is the function
   name, column C the formula to try.

2. **Open it in Numbers.** Double-click, or File ▸ Open. Numbers imports
   delimited text and evaluates every cell starting with `=` exactly as if
   it had been typed — which is the whole point of shipping it this way
   rather than asking you to paste anything.

   *Expect a wall of errors.* Most of these formulas are deliberately
   malformed. Errors are fine; they mean the formula parsed.

3. **Save as a Numbers document**: File ▸ Save, anywhere, e.g.
   `~/Desktop/probe.numbers`.

4. **Ingest it** (anywhere the file can be copied to):

   ```sh
   node scripts/harvest-functions.ts --ingest ~/Desktop/probe.numbers \
     --app "Numbers 26.1"
   ```

   Pass whatever Numbers reports under Numbers ▸ About. It is recorded, not
   parsed.

5. **Commit** `data/function-index.json` and `src/tst/function-names.ts`,
   and add a ledger row below.

### What the ingest tells you

- **resolved** — indexes it is confident about. A name is only accepted
  when every argument shape agreed, and an index claimed by two names is
  rejected rather than guessed at.
- **unrecognised** — candidate names Numbers did not know. Usually a
  misspelling or a function from a different spreadsheet; correct or drop
  them in `data/numbers-function-candidates.txt`.
- **conflicts** — never trusted, always printed.
- **alphabetical ordering** — a diagnostic, not a conclusion. If indexes
  turn out to follow one alphabetical list, gaps become predictable and
  cheap to verify. Predictions still have to be measured before they are
  written down; extrapolating from a correlation is exactly the guessing
  this tooling exists to replace.

### Extending the candidate list

`data/numbers-function-candidates.txt` is plain text, one name per line,
`#` for comments. Adding a name costs nothing — an unknown one is reported,
never silently wrong. If Apple ships new functions, add them and re-run.

---

## Protocol 2 — Settle the paragraph border-position mapping

**What it produces:** a confirmed meaning for
`ParagraphStylePropertiesArchive.border_positions`, replacing the inferred
mapping in `src/tswp/schema.ts`.

**Why:** file analysis got part of the way and then stopped, which is worth
knowing before you start.

*Established:* **0 is "none"** — 4208 paragraph styles carry position 0 with
no stroke, and a further 127 carry 0 *with* a stroke, which is a border
configured and switched off.

*Not established:* which edge 1 and 2 mean. Only **four** styles in the
entire corpus use a non-zero position — three "Heading 3" and one "Title",
all inheriting from Apple's stock templates — so there is one effective
data point per value and no way to tell edges apart without rendering.
1 and 2 may well be inverted, and 3 and 4 are never observed.

So this protocol only needs to answer one question: **which edge does 1
draw?** Everything else follows.

**Procedure** (about ten minutes):

1. Take any Pages document and, with the library, create five paragraphs
   each with a thick coloured `border` and `borderPositions` set to 0, 1,
   2, 3 and 4 respectively.
2. Open it in Pages, click each paragraph, and read Format ▸ Style ▸
   Borders & Rules.
3. Record what each value showed in the ledger below, and correct
   `BorderPosition` in `src/tswp/schema.ts` if the inference was wrong.

---

## Protocol 3 — Name a cross-table formula reference — **SOLVED, no manual work needed**

Kept as a record of how it was closed, because the reasoning generalises to
the other identity puzzles in this format.

**The question was:** an AST's `table_id` is a UUID that matches no table's
own identifier, so a reference into another table could only render as
`OTHER_TABLE::A2`.

**The answer:** it is not a table identifier at all — it is a *calc-engine
owner* identifier. `TSCE.FormulaOwnerDependenciesArchive` (type 4008) maps
every owner UUID to the object that owns it, directly through
`formula_owner` or, for derived owners, through `base_owner_uid` to the
entry that carries one. All 1020 cross-table references in the corpus now
resolve to real table names. See `docs/FORMAT.md` §14.11.

**What made it findable**, for next time: the proto for the *archive that
uses* an identifier rarely explains it. The explanation was in the archive
that *issues* identifiers — the dependency tracker — which nothing in the
table schema points at. When an identifier looks underivable, look for a
registry archive elsewhere in the same family before assuming a derivation.

---

## Protocol 4 — Map the `predicate_type` enum

**What it produces:** entries for `PREDICATE_TYPE_OPERATORS` in
`src/tst/predicates.ts`, which is what would let this library *author*
conditional-formatting and filter rules rather than only read them.

**Why:** a predicate stores its condition twice — as a TSCE formula and as
`predicate_type` plus operands (§14.7). Reading works from the formula, so
the enum is not needed. Writing is the reverse: the app's condition editor
reads `predicate_type`, so a rule written with the wrong value shows the
wrong condition in the UI even though the calc engine evaluates correctly.
The corpus contains exactly two values (5 = `=`, 9 = `<`), from an xlsx
import; Numbers' own UI offers roughly twenty conditions.

**Procedure:**

1. In Numbers, make a table with one column of numbers and one of text.
2. Add conditional-formatting rules one at a time, each with a *distinct*
   fill colour so they stay distinguishable, working through the whole
   condition menu: equal to, not equal to, greater than, greater than or
   equal to, less than, less than or equal to, between, not between, then
   the text conditions (contains, does not contain, starts with, ends with,
   is, is not), the date conditions, and the blank/not-blank pair.
3. Save, then run:

   ```
   node scripts/harvest-predicates.ts <file.numbers>
   ```

   It prints one row per rule: `predicate_type`, `qualifier1/2`, the
   operand kinds, and the operator the formula AST states. The formula is
   the check — a row where the AST says `>=` pins that `predicate_type` to
   `>=` with no guessing.
4. Paste the printed table block into `PREDICATE_TYPE_OPERATORS` and record
   the Numbers version here. Conditions with no simple operator (text
   `contains`, `between`) compile to function calls; record their type
   codes with the function index so they are not lost, but leave the
   operator map alone.

Order matters for one reason only: rules are stored in the order authored,
so adding them one at a time and in a known order lets you match a rule to
the condition you chose even where two look alike.

**Bonus, same document:** conditional rules are the only place the corpus
exercises real predicates, so this document also settles the open question
about the second conditional id in a cell record (flag `0x100`). After
step 3, change a cell's value so a *different* rule fires, save again, and
diff the id. If it tracks which rule matched, it is a live cache; if not,
it means something this library has yet to identify.

## Protocol 5 — Name the Keynote build vocabulary

**What it produces:** the delivery strings, effect names and attribute
fields a real animation uses, checking the schema-derived read model in
`src/keynote/builds.ts` — which today has *nothing* to check it against.

**Why:** all eight decks in the corpus span 2013 to 26.1 and not one has an
animation. The protos are complete, so the code is written; but a field
number read from a schema and never seen in a file is a guess with good
manners.

**Procedure:**

1. In Keynote, make a deck of three slides. On each, animate one object
   with a *different* effect (say Dissolve, Move In, Anvil). On one slide,
   animate a text box delivered **by line**, so the build has chunks.
2. Give one build a non-default duration and delay, so those fields are
   populated rather than defaulted.
3. Save, then run:

   ```sh
   npm run probe -- animated.key
   ```

   Section 4 prints each build's `delivery`, `effect` and the attribute
   field numbers it populates.
4. Record the effect strings in the ledger. If any attribute field appears
   that `BuildAttributesFields` does not name, add it.

**Bonus:** the same deck settles whether builds survive `duplicateSlide` —
worth checking, since slide duplication is implemented and untested against
animated slides.

---

## Protocol 6 — Name the cell-control `interaction_type` enum

**What it produces:** the mapping from `interaction_type` to the five
widgets, which is what stands between reading controls and writing them.

**Why:** no fixture has one. All 37 were surveyed: zero control spec
tables, zero cells with the control flag, zero `CellSpecArchive` objects.
`src/tst/controls.ts` therefore classifies a control by which fields it
populates, which distinguishes a range widget from a chooser but cannot
tell a slider from a stepper.

**Procedure:**

1. In Numbers, make a table with five columns and set each to a different
   control: checkbox, star rating, slider, stepper, pop-up menu.
2. Give the slider and stepper non-default minimum, maximum and increment,
   and the pop-up menu three items.
3. Save, then run:

   ```sh
   npm run probe -- controls.numbers
   ```

   Section 3 prints `interaction_type`, the derived shape and the populated
   field numbers for each.
4. Five rows of output name the enum. Record them in the ledger and add
   them to `src/tst/controls.ts`.

**Also worth capturing from the same file:** which list-entry field the
control-spec table uses to hold its payload. `controlsOf` currently probes
for it structurally, because no proto in this repository states it.

---

## Ledger

Every run of a protocol above gets a row. Keep failed and partial attempts:
knowing that something was tried and did not work is worth as much as
knowing it did.

| Date | Protocol | App version | Result | Artifact |
|---|---|---|---|---|
| — | 1 — function index | — | **not yet run.** `src/tst/function-names.ts` is empty; only the corpus-proven entry (168 = SUM) is in effect. | — |
| — | 2 — border positions | — | **not yet run.** Mapping remains inferred. | — |
| 2026-07-31 | 3 — cross-table names | n/a — file analysis only | **SOLVED without an app.** The AST's `table_id` is a calc-engine *owner* id, mapped by `TSCE.FormulaOwnerDependenciesArchive`. All 1020 cross-table references in the corpus now name their table. | `src/tsce/owners.ts`, `test/owners.test.ts` |
| — | 4 — predicate_type enum | — | **not yet run.** Two values known from file analysis (5 = `=`, 9 = `<`), and a full prediction recorded in `PREDICATE_TYPE_HYPOTHESIS` that one run confirms or kills. | — |
| — | 5 — Keynote build vocabulary | — | **not yet run.** Read model is schema-derived; no deck in the corpus has an animation. | — |
| — | 6 — cell-control interaction_type | — | **not yet run.** No fixture has a control; shape is derived from populated fields instead. | — |

### Findings that came out of file analysis alone

Recorded here because they were expensive to establish and easy to lose,
even though they needed no app:

| Finding | Evidence |
|---|---|
| `AST_function_node_index` **212 = DURATION** | In `numbers-parser-v26.1-custom-formats.numbers`, `=$A$11+FUNCTION_212(,,8,22,11,500)` lands exactly 8h22m11.5s after A11's midnight, and sibling rows differing only in the third argument (8→12→24) shift by that many hours. |
| The function index is **not alphabetical**, nor category-then-name | `DURATION` sorts before `SUM` in both orderings, yet is 212 against SUM's 168. The table must be measured. |
| `TOKEN_NODE` marks an **omitted argument**, not a boolean | It carries `AST_token_node_boolean`, so it rendered as `TRUE`; the DURATION arithmetic shows the two leading tokens contribute zero. |
| `AST_function_node_index` **168 = SUM** | `libetonyek-pages5-extra-dir.pages` sums 5500 + 1170 + 1250 to a cached 7920; the `Cats` TOTAL row in both `numbers-parser-*-issue102.numbers` uses the same index. |
| Merges live in the calc engine, not `merge_region_map` | No fixture has a region map. Colon-tract nodes in `merge_owner.formula_store` decode to rectangles where every anchor holds a value and no covered cell does, and the 14.4 and 26.0 saves of one document agree. |
| `TSP.Color` gained an undocumented fixed32 at field 13 in the 26.x era | Present only in 26.x files, always paired with an explicit `rgbspace`, always exactly 1.0 across every document examined. |
| Cell and table styles have no shadow field | `TST.CellStylePropertiesArchive` and `TableStylePropertiesArchive` contain none; shadows are on the drawable's `ShapeStyleArchive`/`MediaStyleArchive`. |
| Media style bags omit `fill`, shifting later fields down one | Confirmed structurally on 1475 style objects: field 2 is a message in a shape bag and a float in a media bag. |
| An AST cross-table `table_id` is a **calc-engine owner id**, not a table id | `TSCE.FormulaOwnerDependenciesArchive` maps owner → object; 418 of 524 owners resolve and every one lands on a `TST.TableInfoArchive`. |
| `TSP.CFUUIDArchive` and `TSP.UUID` are the same 128 bits | Four `uint32` words pack as `lo = w0 \| w1<<32`, `hi = w2 \| w3<<32`; the AST's CFUUID then matches the calc engine's UUID exactly. |
| Derived owner ids are `base + owner_kind` in current files | Holds for 339 of 409 entries carrying a base; older files use unrelated random UUIDs, so the stored `base_owner_uid` is authoritative. |
| Nine of thirteen `owner_kind` values named from files alone | Each derived owner is *used* by a field; matching the field's UUID back to its owner entry names the kind. 1 table, 3 conditional style, 4 hidden rows, 5 merge, 8 categories, 9 summary aggregates, 11 hidden columns, 35 haunted, 200 document — each unanimous across every file that exercises it. |
| `owner_kind` 200 is the **document**, with a hardcoded identity | Every kind-200 owner in all 23 files that have one, across three apps and every era, is `uid = 666` derived from `base = 466`. |
| Conditional formatting and filters share one predicate archive | `TST.FormulaPredicateArchive` is the rule body in both `ConditionalStyleSetArchive` and `FilterRuleArchive`, told apart only by `for_conditional_style`. |
| `predicate_type` 5 = `=` and 9 = `<` | The three rule sets in `numbers-parser-v26.1-xlsx-lineage.numbers` each carry a formula whose terminal AST node is the documented comparison enum, independently stating the condition. |
| Conditional rule sets are interned and refcounted like strings | In the same fixture, three sets cover 1921 cells and each data-list `refcount` (957/734/230) equals its cell count exactly. |
| Filter sets belong to a hidden-state extent, not the table | Reached via `hidden_states_owner → HiddenStatesArchive → HiddenStateExtentArchive.filter_set`; the traversal finds every `FilterSetArchive` in every fixture that has one, across all three apps. |
| Every filter set in the corpus is empty | 20 fixtures contain one; all are mode "all" (one row set is "any"), disabled, with no rules — so filter *rule* layout is schema-derived, not fixture-proven. |
| Category `row_lookup_uids` holds row **indexes**, not UIDs | Across every categorised table in the corpus, the rows a group names hold exactly that group's value in the grouping column, and the groups partition the data rows exactly once. |
| The complete `grouping_type` enum: 0 value, 1 year, 2 year+month, 3 weekday, 4 day, 5 year+week, 6 year+quarter | `numbers-parser-v26.0-categories.numbers` has one table per bucketing. Each code is confirmed by the shape of the dates it produces, not the table's name: year groups are all 1 January, quarter groups only in months 1/4/7/10, week groups every land on the *same weekday*, weekday groups collapse to ≤7 dates in one reference week. |
| `series_theme_styles` is a six-colour palette, not a per-series list | Both corpus charts carry exactly 6, one with 2 series and one with 5. Per-series overrides live in the sparse arrays instead. |
| `SparseReferenceArray.count` equals its entry count | Three observations across two charts: 6 entries/count 6, 5 entries/count 5, 0 entries/count 0. |
| A footnote reference is a **U+000E**, not the U+FFFC every other attachment uses | It lives in `table_footnote`, its own table; the U+FFFC inside the note storage is the *number's* placeholder, anchored in that storage's own attachment table. |
| A comment's author is shared, not per-comment | Every comment in both comment-bearing fixtures points at the same `TSK.AnnotationAuthorArchive`, which is listed once in the document's `AnnotationAuthorStorageArchive`. |
| An image mask's frame is in the **image's** coordinate space | Across the 79 masked images, `image.pos + mask.pos` puts the visible rect at a non-negative position 78 times and the crop window inside the image 75 times, versus 48 for the page-local reading. Full-bleed cases settle it: an image at (-91,-102) carries a mask at (91,102), cropping exactly at the page origin. |
| A mask's path is stretched to `naturalSize`, per axis | Of 79 masks, 30 write the path at exactly `naturalSize`, 12 at a uniform scale, 37 at another scale; one is a plain 100×100 box stretched to 860×880. `naturalSize` equals the mask's frame in every file. |
| Row and column UIDs are **not unique across a document** | A table duplicated from another keeps its source's identities: in the categories fixture, `Uncategorized` row 0 and `Categories` row 0 share a UID. A UID keys a row within its table only. |
| A Pages floating drawable draws only if the document's z-order lists it | Both P19 rungs failed until the copy joined `TP.DrawablesZOrderArchive`; with the entry, both render ("Both p19 work now"). Keynote/Numbers keep paint order in-container instead. |
| The paragraph-styles panel reads the theme's `paragraph_style_presets` | A style with name, identifier, map entry and both bags applies but never lists; adding the theme-list entry (the fourth requirement) lists it ("P15 works now"). |
| A bookmark's `ranged` flag describes the run, not the name | Corpus: `ranged=true` at run lengths 13 and 46, `false` at exactly 1, name orthogonal. Pages, handed a named `ranged=false` bookmark over 13 characters, bookmarked one ("the B character is a bookmark"); with the flag corrected the same bookmark spans its phrase — a name-plus-range shape the corpus never exhibits, accepted by the app. |
| A pop-up menu's slot 0 is a bare `NIL_TYPE` None entry | Without it Numbers dropped the first choice; with a *valued* slot 0 the choices returned but the current-value checkmark vanished. Three-way experiment in the app. |
