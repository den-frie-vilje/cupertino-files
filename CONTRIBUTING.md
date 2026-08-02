# Contributing

Thanks for your interest — contributions of every size are welcome, and
several of the most valuable ones involve no code at all.

## Ways to help without writing code

**Make an example document.** This project runs on real documents, and a
five-minute file made in Pages, Numbers or Keynote regularly settles
questions that weeks of code cannot.
[`docs/BLOCKERS.md`](docs/BLOCKERS.md) keeps a short list of documents we
wish existed — each with exact instructions and a script that reads the
answer out of your file automatically. Attach one to an issue and you may
close a long-standing gap on the spot.

**Open something we wrote and tell us what you see.** Documents this
library authors need a human with the apps to confirm they look right —
the ladder files (`npm run pages:docs`, `npm run keynote:docs`) each
state on their face what you should see, so a check takes seconds per
file. "It looked wrong" reports are especially prized: every serious bug
here was found by someone noticing exactly that.

**Report a document that misbehaves.** A file the library misreads, or a
file it wrote that an app refuses — either one, with the app version,
teaches us something no fixture can. Please only share files that are
yours to share and free of personal data; if the file can't be shared,
the issue forms show how to run diagnostics locally instead.

## Contributing code

The short version: `npm install`, `npm test` (Node ≥ 22.18), and open the
PR whenever you like — early and unfinished is welcome, and CI plus
review will catch what needs catching. A few house habits, offered as
orientation rather than hurdles:

- **Defaults come from measurement.** When code needs a magic value —
  a field number, a style convention, a byte layout — we measure it from
  real documents rather than guessing. If you don't have a document to
  measure from, open the PR anyway and note it; finding evidence together
  is a normal part of review here.
- **The apps get the last word.** A written document can be perfectly
  well-formed and still wrong; `docs/VERIFICATION.md` tracks which
  behaviors the apps have confirmed. If your change writes something new,
  we'll help you get it in front of an app — or track it honestly until
  someone can.
- **Generated files are regenerated, not edited** — `npm run coverage`,
  `npm run conformance`, `npm run proto:embed`. A test will remind you if
  one goes stale.
- **New sample documents** go in `fixtures/` only when they're
  redistributable, with a row in `fixtures/ATTRIBUTION.md`
  (`npm run privacy:check` screens for personal data). Documents that
  can't be redistributed still help — we keep their *measurements*, with
  a note saying where they came from.

If you're unsure whether something fits, open an issue or a draft PR and
ask. An imperfect start that teaches us something beats a perfect patch
that never arrives.
