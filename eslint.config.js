import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  // `.claude` holds Claude Code state, including nested git worktrees
  // (.claude/worktrees/*) that are full copies of this repo. Never lint into
  // them: a nested worktree's own tsconfig makes typescript-eslint see two
  // candidate roots and fail with a "multiple TSConfigRootDirs" parse error.
  globalIgnores(['dist', 'coverage', '.claude', '.astro']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser },
      // Pin the root so tseslint resolves tsconfig deterministically no matter
      // where the repo is checked out (e.g. inside a parent's worktree tree).
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Spec: no `any`, no `as unknown`.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // DI/context/store files legitimately export non-components alongside hooks.
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Playwright config + specs run under Node and read process.env.
    files: ['e2e/**/*.ts', 'playwright.config.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
]);
