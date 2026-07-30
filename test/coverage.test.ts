import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "./harness.ts";

const script = fileURLToPath(new URL("../scripts/coverage-matrix.ts", import.meta.url));
const privacy = fileURLToPath(new URL("../scripts/scan-fixture-privacy.ts", import.meta.url));
const harvest = fileURLToPath(new URL("../scripts/harvest-functions.ts", import.meta.url));

describe("repository guards", () => {
  it("docs/COVERAGE.md and docs/VERIFICATION.md match the fixtures and capability table", () => {
    // Both are generated, so they go stale the moment a fixture is added or
    // a capability changes status. Failing here is the mechanism that keeps
    // them honest — run `npm run coverage` to regenerate.
    //
    // VERIFICATION.md especially: a hand-kept list of "things to check some
    // day" rots the moment someone ships a feature and forgets a line.
    let ok = true;
    let output = "";
    try {
      output = execFileSync(process.execPath, [script, "--check"], { encoding: "utf8" });
    } catch (e) {
      ok = false;
      output = String((e as { stderr?: string }).stderr ?? e);
    }
    expect(ok ? "up to date" : output).toBe("up to date");
  });

  it("the generated function table matches the recorded harvest", () => {
    // The function-index table is produced by a manual protocol (see
    // docs/MANUAL-WORK.md). Both halves are checked in, so a hand-edit to
    // either one would silently diverge from the measurement that produced
    // it — this catches that.
    let ok = true;
    let output = "";
    try {
      output = execFileSync(process.execPath, [harvest, "--check"], { encoding: "utf8" });
    } catch (e) {
      ok = false;
      output = String((e as { stderr?: string }).stderr ?? e);
    }
    expect(ok ? "checked" : output).toBe("checked");
  });

  it("no fixture carries unreviewed personal data", () => {
    let ok = true;
    let output = "";
    try {
      execFileSync(process.execPath, [privacy], { encoding: "utf8" });
    } catch (e) {
      ok = false;
      output = String((e as { stderr?: string }).stderr ?? e);
    }
    expect(ok ? "clean" : output).toBe("clean");
  });
});
