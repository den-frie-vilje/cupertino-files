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
Mac to *confirm*. This file covers work that produces *new knowledge*.

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

**Why:** the value is a plain `int32`, and the corpus only ever contains
0, 1 and 2. The current reading — none / top / bottom / top and bottom /
all — fits the deprecated enum's shape and the five choices in the Pages
inspector, but 3 and 4 are unconfirmed and even 1-vs-2 could be inverted.

**Procedure** (about ten minutes):

1. Take any Pages document and, with the library, create five paragraphs
   each with a thick coloured `border` and `borderPositions` set to 0, 1,
   2, 3 and 4 respectively.
2. Open it in Pages, click each paragraph, and read Format ▸ Style ▸
   Borders & Rules.
3. Record what each value showed in the ledger below, and correct
   `BorderPosition` in `src/tswp/schema.ts` if the inference was wrong.

---

## Protocol 3 — Name a cross-table formula reference

**What it produces:** a way to resolve the `table_id` inside
`AST_cross_table_reference_extra_info` to a table, replacing the
`OTHER_TABLE::` placeholder.

**Why:** the UUID matches no table's own identifier. It is *derived* — in
every file examined it differs from the table's UUID by a small delta in
one half, the same pattern used for merge owners — and the calc engine's
dependency records do not map it back either.

**Procedure:**

1. In Numbers, create a document with three tables named distinctly, and in
   table 1 write a formula referencing a known cell in each of tables 2
   and 3.
2. Save, and dump both tables' UUID-shaped fields alongside the `table_id`
   in each formula's AST (`node.getMessage(28)`).
3. With three known pairs, the derivation should be readable — a fixed
   offset, a discriminator byte, or a lookup through a structure not yet
   examined. Record the finding, then implement and test it.

This one is open research rather than a checklist. Record what you learn
even if it does not resolve, so the next attempt starts further along.

---

## Ledger

Every run of a protocol above gets a row. Keep failed and partial attempts:
knowing that something was tried and did not work is worth as much as
knowing it did.

| Date | Protocol | App version | Result | Artifact |
|---|---|---|---|---|
| — | 1 — function index | — | **not yet run.** `src/tst/function-names.ts` is empty; only the corpus-proven entry (168 = SUM) is in effect. | — |
| — | 2 — border positions | — | **not yet run.** Mapping remains inferred. | — |
| — | 3 — cross-table names | — | **not yet run.** References render with the `OTHER_TABLE::` marker. | — |

### Findings that came out of file analysis alone

Recorded here because they were expensive to establish and easy to lose,
even though they needed no app:

| Finding | Evidence |
|---|---|
| `AST_function_node_index` **168 = SUM** | `libetonyek-pages5-extra-dir.pages` sums 5500 + 1170 + 1250 to a cached 7920; the `Cats` TOTAL row in both `numbers-parser-*-issue102.numbers` uses the same index. |
| Merges live in the calc engine, not `merge_region_map` | No fixture has a region map. Colon-tract nodes in `merge_owner.formula_store` decode to rectangles where every anchor holds a value and no covered cell does, and the 14.4 and 26.0 saves of one document agree. |
| `TSP.Color` gained an undocumented fixed32 at field 13 in the 26.x era | Present only in 26.x files, always paired with an explicit `rgbspace`, always exactly 1.0 across every document examined. |
| Cell and table styles have no shadow field | `TST.CellStylePropertiesArchive` and `TableStylePropertiesArchive` contain none; shadows are on the drawable's `ShapeStyleArchive`/`MediaStyleArchive`. |
| Media style bags omit `fill`, shifting later fields down one | Confirmed structurally on 1475 style objects: field 2 is a message in a shape bag and a float in a media bag. |
