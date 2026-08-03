/**
 * Type-aware linting over everything that ships or tests what ships.
 *
 * The base is typescript-eslint's recommended-type-checked set — the point
 * of paying for the type-checker in lint is rules like no-floating-promises
 * and no-unnecessary-condition that plain syntax lint cannot see.
 *
 * Deviations are few and stated:
 *
 * - `no-unused-vars` allows a leading underscore, the conventional spelling
 *   for "this parameter is part of a signature I don't control".
 * - `no-bitwise` and friends stay off wholesale — this library is a binary
 *   codec; masking and shifting are the domain, not a smell.
 * - Non-null assertions stay legal everywhere: with
 *   `noUncheckedIndexedAccess` on, every `!` is a conscious claim about a
 *   measured invariant, and a crash on a wrong one is the assertion
 *   working. Banning it would trade that signal for ceremony.
 * - Getters may report what a document might lack (`string | undefined`)
 *   while their setters demand the real thing: you cannot write an
 *   absence. `related-getter-setter-pairs` wants them symmetric; the
 *   asymmetry is this API's contract, so the rule is off.
 * - Template literals may interpolate numbers, bigints and booleans —
 *   this is a binary codec; offsets and object ids in messages are the
 *   norm. `string | undefined` still fails, because printing "undefined"
 *   is a real bug.
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/related-getter-setter-pairs": "off",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true },
      ],
    },
  },
  {
    ignores: ["node_modules/", "dist/", "docs/.vitepress/", "src/proto/vendored.ts", "*.config.js"],
  },
);
