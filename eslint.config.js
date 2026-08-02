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
 * - Test files may use non-null assertions: a test that dereferences a
 *   missing value should crash the test, which is the assertion working.
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
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
    },
  },
  {
    files: ["test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    ignores: ["node_modules/", "dist/", "src/proto/vendored.ts", "*.config.js"],
  },
);
