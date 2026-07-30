import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "./harness.ts";

const script = fileURLToPath(new URL("../scripts/coverage-matrix.ts", import.meta.url));
const privacy = fileURLToPath(new URL("../scripts/scan-fixture-privacy.ts", import.meta.url));

describe("repository guards", () => {
  it("docs/COVERAGE.md matches the fixtures and capability table", () => {
    // The matrix is generated, so it goes stale the moment a fixture is
    // added or a capability changes status. Failing here is the mechanism
    // that keeps it honest — run `npm run coverage` to regenerate.
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
