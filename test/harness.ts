/** Minimal vitest-compatible assertion shim over node:test / node:assert. */
import assert from "node:assert/strict";
export { describe, it } from "node:test";

export function expect(actual: unknown): {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toBeLessThan(n: number): void;
  toBeGreaterThan(n: number): void;
  toBeCloseTo(n: number, digits?: number): void;
  toContain(item: unknown): void;
  toThrow(): void;
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
    toThrow() {
      assert.throws(actual as () => unknown);
    },
  };
}
