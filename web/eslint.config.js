// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["public/**", "node_modules/**", "eslint.config.js"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // The escape hatches that make TypeScript behave like JavaScript.
      // All of them are errors, not warnings.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/ban-ts-comment": ["error", {
        "ts-ignore": true, "ts-expect-error": "allow-with-description", "ts-nocheck": true,
      }],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "eqeqeq": ["error", "always"],           // no == coercion
      "no-implicit-coercion": "error",         // no +x, !!x, "" + x
      "no-var": "error",
      "prefer-const": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  {
    // The service worker runs in a worker context, not the DOM; it has its
    // own tsconfig with the WebWorker lib.
    files: ["src/sw.ts"],
    languageOptions: {
      parserOptions: { project: "./tsconfig.sw.json", projectService: false,
                       tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    // A wrong assertion in a test fails the test; it cannot reach a user.
    files: ["test/**"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
);
