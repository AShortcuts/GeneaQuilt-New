import js from "@eslint/js";
import globals from "globals";

export default [
  {
    name: "geneaquilt/ignores",
    ignores: ["web/dist/**", "web/pkg/**"],
  },
  {
    ...js.configs.recommended,
    name: "geneaquilt/recommended",
  },
  {
    name: "geneaquilt/browser",
    files: ["web/src/**/*.js"],
    languageOptions: {
      globals: globals.browser,
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
