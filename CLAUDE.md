# Working notes for Claude

## Asking for manual verification

Anything in this project that touches an iWork app for real has to be
checked by a person on a Mac, and that request is the only part of the work
the machine cannot do. Make it as cheap as possible to act on:

- **Attach the files again, every time.** Never say "the file from before"
  or "rungs 11 and 12" or "the three I sent". Regenerate and re-send.
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
