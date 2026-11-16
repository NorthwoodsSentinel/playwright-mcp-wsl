// ESLint flat config. Lint runs with --max-warnings 0 (AGENTS.md "Lint has no warning tier").
// Scope: every .js and .mjs file in the repo. The .d.ts files are not linted (plain ESLint cannot parse them);
// `tsc` checks them instead. Out of scope: installs, coverage output and agent scratch space
// (AGENTS.md "Build output is never a gate target").
import js from '@eslint/js';
import globals from 'globals';
import { globalIgnores } from 'eslint/config';

export default [
  globalIgnores(['**/node_modules/', 'coverage/', '.scratch/']),
  js.configs.recommended,
  {
    // The published wrapper: CommonJS on Node.
    files: ['**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
  {
    // Tests, gate tooling and config: ES modules on Node.
    files: ['**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
  },
];
