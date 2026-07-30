import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
  {
    name: "geneaquilt/ignores",
    ignores: ["web/dist/**", "web/pkg/**"],
  },
  {
    ...js.configs.recommended,
    name: "geneaquilt/recommended",
  },
  ...tseslint.configs.recommended,
  {
    name: "geneaquilt/browser",
    files: ["web/src/**/*.js"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    name: "geneaquilt/typescript-browser",
    files: ["web/src/**/*.ts"],
    ignores: ["web/src/workers/*.worker.ts"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    name: "geneaquilt/typescript-worker",
    files: ["web/src/workers/*.worker.ts"],
    languageOptions: {
      globals: globals.worker,
    },
  },
  {
    name: "geneaquilt/node",
    files: ["web/*.config.js", "web/src/**/*.test.js", "scripts/**/*.mjs"],
    languageOptions: {
      globals: globals.node,
    },
  },
];
