# End-to-end tests against the real iWork apps

Everything else in this repository verifies the library against *our
understanding* of the format. These tests verify it against **Apple** — by
driving Pages, Numbers and Keynote through `osascript` and asking them what
they see.

They answer the one question the unit suite structurally cannot: *does the
app actually accept what we wrote?*

## Running

Requires macOS with the relevant apps installed.

```sh
npm run test:e2e     # only the app-driven tests
npm run test         # everything else (never launches an app)
npm run test:all     # both
```

`npm test` deliberately **excludes** these, so running the normal suite
never launches a GUI application as a side effect.

### First run: automation permission

The first attempt to script each app raises a one-time macOS prompt. Approve
it, or set it later in **System Settings → Privacy & Security → Automation**
by allowing your terminal (or Node) to control Pages / Numbers / Keynote.

If permission is missing, the tests **skip** with exactly that message
rather than failing.

### Everywhere else

On Linux, in CI, or on a Mac without the apps, every test skips with a
printed reason:

```
e2e skipped —
  Pages: requires macOS (running on linux)
  ...
```

A silent no-op is impossible: the harness always logs why it skipped.

## Safety

These tests drive applications that may already hold your real documents,
so the harness is defensive by construction:

- **Refuses to run when an app already has documents open** — it skips with
  a message asking you to close them, rather than risk interfering.
- **Only touches a scratch directory** created under the system temp dir;
  repository fixtures are copied in, never edited in place.
- **Closes documents with `saving no`** unless a test explicitly saves.
- **Restores app run state**: an app that was not running before the test
  is quit afterwards; one that was already running is left alone.
- Cleanup is armed on process exit, so an aborted run still tidies up.

## What each direction proves

| Direction | Question answered |
|---|---|
| we write → the app opens it | Does the app accept our package at all? A malformed one fails at `open`. |
| the app writes → we parse it | Does the parser handle output from the app version installed *today*, not just the archived corpus? |
| we write → app re-saves → we parse | Does our edit survive the app rewriting the entire package? |

## Manufacturing coverage the corpus lacks

The fixture corpus has a hard limit: it can only contain documents that
exist and are licensed for redistribution. Some features simply were not
found in any such document.

The e2e harness sidesteps that by having the app *create* the missing case.
The clearest example is **Keynote transitions**: every archived deck in the
corpus has `effect: "none"`, so `docs/COVERAGE.md` reports the transition
read/write path as validated by **zero** fixtures. Here, AppleScript sets a
real `dissolve effect` with a duration and an automatic trigger, and the
tests assert that:

1. the library reads back an enabled, correctly-parameterised transition;
2. a transition the *library* writes is accepted by Keynote and reported
   back with the duration we set.

The same approach covers speaker notes and Numbers cell values written by
the app itself.

## Scope and limits

- The scripting dictionaries are narrow. Pages exposes little beyond
  `body text`; Keynote is richer (slides, presenter notes, transition
  properties); Numbers exposes cell values. Features outside those
  dictionaries — footnotes, comments, image filters, cell *styling* —
  cannot be asserted this way, and are covered by the fixture suite
  instead.
- These tests are slow and interactive by nature. They are not part of CI.

## What only the apps can confirm

Several things in this repository are validated *here and nowhere else*,
because no amount of reading Apple's files can prove them
(`roundtrip.e2e.test.ts` and `authoring.e2e.test.ts`):

- **Cell writing.** The unit suite proves our records re-encode
  byte-identically and reload through our own parser. Only Numbers can
  confirm it agrees — so the e2e suite writes a cell with the library and
  asks Numbers, through AppleScript, what it reads back.
- **Keynote transitions.** No licensed deck in the corpus has a non-`none`
  effect, so the app has to create the case for us (above) — and read
  back one we wrote.
- **blank() documents**, opened and read back in all three apps.
- **Merge survival** through a full Numbers rewrite of the package.
- **The formula-recompute probe**, which settled that Numbers rebuilds
  its dependency tracker on open rather than trusting the file's.

These are the claims the scripting dictionaries happen to expose.
Others cannot be reached this way at all — cell fills, paragraph border
positions, shadow geometry, colour spaces — and those are collected in
[`docs/VERIFICATION.md`](VERIFICATION.md) with what would settle each. That
file is generated from the capability table, so it cannot quietly fall
behind the code.
