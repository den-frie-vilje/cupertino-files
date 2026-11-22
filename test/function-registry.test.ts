import { existsSync, readFileSync } from "node:fs";
import { readFunctionRegistry } from "../scripts/function-registry.ts";
import { HARVESTED_FUNCTIONS } from "../src/tst/function-names.ts";
import { describe, expect, it } from "./harness.ts";

const NUMBERS =
  "/Applications/Numbers Creator Studio.app/Contents/Frameworks/TSTables.framework/Versions/A/TSTables";

/** The app versions the reader was measured on; a newer app is an open ledger row, not a failing run. */
const MEASURED = /^1[56]\./;
const version = (() => {
  try {
    // The bundle's Info.plist is XML; the version follows its key.
    const text = readFileSync("/Applications/Numbers Creator Studio.app/Contents/Info.plist", "utf8");
    return /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/.exec(text)?.[1] ?? "";
  } catch {
    return "";
  }
})();
const skip = !existsSync(NUMBERS) ? true : MEASURED.test(version) ? false : `Numbers ${version} is not a build the registry reader was measured on (docs/BLOCKERS.md)`;

describe("the function registry read from the app", { skip }, () => {
  it("agrees with the generated table on every index it registers", () => {
    const reading = readFunctionRegistry(NUMBERS);
    const disagreements: string[] = [];
    for (const [index, name] of reading.functions) {
      const have = HARVESTED_FUNCTIONS.get(index);
      if (have !== name) disagreements.push(`${index}: table ${have}, registry ${name}`);
    }
    expect(disagreements).toEqual([]);
    // T is the one function the registry registers by another route; the
    // document harvest supplies it.
    const missing = [...HARVESTED_FUNCTIONS]
      .filter(([index]) => !reading.functions.has(index))
      .map(([, name]) => name);
    expect(missing).toEqual(["T"]);
    expect(reading.functions.get(296)).toBe("FIND.CASEINSENSITIVE");
  });
});
