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
translated away.

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
- **Ask for comments on the cells themselves.** The checker's preferred
  reply channel is the app's comment function, which works on the exact
  cell in question and costs nothing on a phone. Instructions invite a
  comment on whatever is off; a notes column may exist beside that, but
  it is the fallback, not the ask.

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
