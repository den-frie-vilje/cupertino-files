## What changed

<!-- One paragraph. If it changes what the library writes into documents,
     say which archive types. -->

## Evidence

<!-- This project's rule: measured, not guessed. Where does the change's
     shape come from — corpus measurement, a schema field, an app check?
     Cite the numbers the way the codebase does ("28 of 28 sections…"). -->

## App verification

<!-- Well-formed is not working. Pick one: -->

- [ ] Does not change what gets written into documents
- [ ] Changes writes, **confirmed in the app** — say which app/version and what was checked
- [ ] Changes writes, not yet app-checked — a `manualProof` block is added in
      `scripts/coverage-matrix.ts` (and `docs/VERIFICATION.md` regenerated), or a
      ladder rung exercises it

## Checklist

- [ ] `npm test` — 549+ green, including the built-in guards
- [ ] `npm run lint` and `npm run typecheck` clean
- [ ] Generated docs regenerated if touched (`npm run coverage`, `npm run conformance`)
- [ ] New fixtures (if any) are redistributable, listed in `fixtures/ATTRIBUTION.md`
      with source/commit/license/md5, and pass `npm run privacy:check`
- [ ] No verbatim Apple-derived material added outside `proto/`
      (see `THIRD-PARTY-NOTICES.md`)
