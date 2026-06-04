import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import globals from "globals";

const eslintConfig = defineConfig([
  globalIgnores(["dist/**"]),
  js.configs.recommended,
  tseslint.configs.recommended,
  react.configs.flat.recommended,
  jsxA11y.flatConfigs.recommended,
  reactHooks.configs.flat["recommended-latest"],
  {
    plugins: { "react-refresh": reactRefresh },
    languageOptions: { globals: { ...globals.browser } },
    settings: { react: { version: "detect" } },
    rules: {
      // React 19 + TypeScript: no React import needed for JSX, types replace PropTypes.
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // jsx-a11y recommended sets these to error; eslint-config-next never
      // enabled them, so they are NEW findings — kept at warn to keep the
      // migration lint-clean. Real issues: triage after the migration lands.
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
      "jsx-a11y/interactive-supports-focus": "warn",
      "jsx-a11y/click-events-have-key-events": "warn",
    },
  },
  {
    // The repo's module convention (`export * from "./consts"` — see CLAUDE.md)
    // is invisible to react-refresh's export analysis and would warn on every
    // feature component forever. Keep the rule for entry/top-level files only.
    files: ["src/components/**", "src/context/**"],
    rules: { "react-refresh/only-export-components": "off" },
  },
]);

export default eslintConfig;
