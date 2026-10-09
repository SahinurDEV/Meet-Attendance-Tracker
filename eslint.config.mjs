// ESLint flat config. Run with `npm run lint`.
import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/", "dist/", "legacy/", "test-results/", "docs/"] },
  js.configs.recommended,
  {
    files: ["extension/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: { ...globals.browser, ...globals.webextensions, ...globals.commonjs, MAT: "writable" },
    },
  },
  {
    files: ["extension/background.js"],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    files: ["**/*.mjs"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...globals.node } },
  },
  {
    files: ["**/*.cjs", "test/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "commonjs", globals: { ...globals.node } },
  },
  {
    // Integration tests pass callbacks to page.evaluate(), which run in the browser.
    files: ["test/integration/**", "test/helpers/**", "scripts/screenshots.mjs"],
    languageOptions: { globals: { ...globals.browser, ...globals.webextensions, mockMeet: "readonly" } },
  },
  {
    rules: {
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      // On by default in ESLint 10; enabled here so ESLint 9 and 10 agree.
      "no-useless-assignment": "error",
    },
  },
];
