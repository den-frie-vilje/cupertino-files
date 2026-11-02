import { existsSync } from "node:fs";
import { readFunctionRegistry } from "../scripts/function-registry.ts";
import { HARVESTED_FUNCTIONS } from "../src/tst/function-names.ts";
import { describe, expect, it } from "./harness.ts";

const NUMBERS =
  "/Applications/Numbers Creator Studio.app/Contents/Frameworks/TSTables.framework/Versions/A/TSTables";

describe("the function registry read from the app", { skip: !existsSync(NUMBERS) }, () => {
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
