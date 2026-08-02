<!-- Thank you for contributing! A couple of sentences on each point is
     plenty — and if anything below doesn't apply or you're not sure,
     just say so. We're glad you're here. -->

## What does this change?

## Example documents

<!-- If this touches how documents are read or written, a small example
     file made in Pages, Numbers or Keynote is the most helpful thing you
     can attach — often more helpful than the code itself. Made-by-you is
     perfect; please avoid files with personal data in them.

     Can't make one (no Mac, no time)? Totally fine — say so here and
     we'll produce one together during review. -->

## If this changes what documents contain

The apps are the final judges of anything we write, and checking is a
shared job — no Mac required to contribute:

- [ ] I opened the result in Pages / Numbers / Keynote — here's what I saw:
- [ ] I couldn't check in an app — no problem; we'll note it in
      `scripts/coverage-matrix.ts` so it's tracked, and help verify it
- [ ] This doesn't change what gets written into documents

## Checks

<!-- CI runs all of these too, so don't worry about getting it perfect
     before opening the PR — opening early is welcome. -->

- [ ] `npm test`
- [ ] `npm run lint` and `npm run typecheck`
- [ ] Regenerated docs if the capability matrix changed (`npm run coverage`)
- [ ] Any new sample documents are shareable and listed in
      `fixtures/ATTRIBUTION.md` (we're happy to help with this part)
