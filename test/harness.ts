/** Minimal vitest-compatible assertion shim over node:test / node:assert. */
import assert from "node:assert/strict";
import { describe as nodeDescribe, it as nodeIt } from "node:test";

/**
 * node:test's `describe`/`it` return promises, but they are the runner's to
 * track — a test file has nothing to do with them, and leaving the return
 * type as `Promise` makes every test in the suite a `no-floating-promises`
 * finding. Re-typed to `void` here so the lint rule guards real promises.
 */
type TestOptions = { skip?: boolean | string; timeout?: number };
type TestFn = {
  (name: string, fn: () => void | Promise<void>): void;
  (name: string, options: TestOptions, fn: () => void | Promise<void>): void;
};
// The `unknown` hop is deliberate: a direct assignment trips
// `no-misused-promises` (promise-returning assigned where void is declared),
// and that promise being dropped is exactly the point.
export const describe = nodeDescribe as unknown as TestFn;
export const it = nodeIt as unknown as TestFn;

export function expect(actual: unknown): {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toBeLessThan(n: number): void;
  toBeGreaterThan(n: number): void;
  toBeCloseTo(n: number, digits?: number): void;
  toContain(item: unknown): void;
  toContainEqual(item: unknown): void;
  toThrow(pattern?: RegExp): void;
  not: {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toContain(needle: string): void;
  };
} {
  return {
    toBe(expected) {
      assert.strictEqual(actual, expected);
    },
    toEqual(expected) {
      assert.deepStrictEqual(actual, expected);
    },
    toBeLessThan(n) {
      assert.ok((actual as number) < n, `expected ${String(actual)} < ${n}`);
    },
    toBeGreaterThan(n) {
      assert.ok((actual as number) > n, `expected ${String(actual)} > ${n}`);
    },
    /**
     * Values that survive a float32 round-trip are never bit-identical, so
     * comparisons on them need a tolerance rather than strict equality.
     */
    toBeCloseTo(n, digits = 2) {
      const delta = Math.abs((actual as number) - n);
      const tolerance = Math.pow(10, -digits) / 2;
      assert.ok(delta < tolerance, `expected ${String(actual)} ≈ ${n} (±${tolerance})`);
    },
    toContain(item) {
      if (typeof actual === "string") {
        assert.ok(actual.includes(item as string), `expected ${JSON.stringify(actual)} to contain ${JSON.stringify(item)}`);
      } else {
        assert.ok((actual as unknown[]).includes(item), `expected array to contain ${String(item)}`);
      }
    },
    /** Membership by deep equality, for arrays of plain objects. */
    toContainEqual(item) {
      const found = (actual as unknown[]).some((candidate) => {
        try {
          assert.deepStrictEqual(candidate, item);
          return true;
        } catch {
          return false;
        }
      });
      assert.ok(found, `expected ${JSON.stringify(actual)} to contain ${JSON.stringify(item)}`);
    },
    toThrow(pattern?: RegExp) {
      // RegExp only: assert.throws treats a string second argument as the
      // assertion message, which silently checks nothing.
      if (pattern) assert.throws(actual as () => unknown, pattern);
      else assert.throws(actual as () => unknown);
    },
    not: {
      toBe(expected) {
        assert.notStrictEqual(actual, expected);
      },
      toEqual(expected) {
        assert.notDeepStrictEqual(actual, expected);
      },
      toContain(needle) {
        assert.ok(
          typeof actual === "string" && !actual.includes(needle),
          `expected ${JSON.stringify(actual)} not to contain ${JSON.stringify(needle)}`,
        );
      },
    },
  };
}
