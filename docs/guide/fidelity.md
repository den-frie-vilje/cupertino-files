# Fidelity

The promise this library organizes itself around: what you don't touch,
you get back.

## Round trips

Components you don't edit — and every non-IWA package entry — are
emitted byte-identically. For documents written by current apps, that
extends to the whole file: open, edit a cell, save, and the result is
byte-for-byte what the app itself would have written, down to the Snappy
compression and the zip container's quirks. The suite enforces this on
real Apple-written fixtures (`test/byte-identity.test.ts` pins which
files qualify and why the exceptions are exceptions).

## Why the wire codec is hand-rolled

A typed protobuf decoder discards fields it does not model. This library
models a few dozen of the format's 1468 message types while promising
untouched archives come back byte-identical — so `RawMessage` keeps
every field as raw bytes and re-serializes only along mutated paths.
Editing a document from a future app release is safe for the same
reason: fields the library has never heard of ride along unharmed.

## Where the field numbers come from

The vendored `.proto` dumps in [`proto/`](https://github.com/den-frie-vilje/cupertino-files/tree/main/proto)
are read, not just cited: `npm run proto:embed` resolves declared field
*names* into the numeric table the runtime imports. A misspelled or
invented field throws at import rather than reading the wrong bytes, and
the suite fails if the generated table and the schemas drift apart.

Fields newer than the dumps are declared with `measuredFields`, which
requires a sentence saying how the number was established — and refuses
a declaration the schema already covers, so the measured list shrinks
as dumps are refreshed instead of being forgotten.

## Version awareness

Apple evolves the format additively — verified across 2013 → 2026
documents: no field renumbering, ever. The library addresses fields by
number, preserves what it doesn't model, treats the type registry as
replaceable data, and warns rather than fails on newer versions. What
the apps validate on save — payload lengths, reference bookkeeping,
object-id allocation, stylesheet registration — is maintained, with
provenance in [FORMAT.md §10](/FORMAT#_10-writing-files-the-full-invariant-checklist).
