import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Other agent worktrees live under .claude/worktrees/** as separate git
// checkouts; without this they get scanned too and their stale test files fail
// the run (and thus the pre-push hook).
// Playwright specs under e2e/** match Vitest's default *.spec.ts glob; they run
// via `npm run test:e2e`, not Vitest, so keep them out of this run.
const sharedExclude = [...configDefaults.exclude, '**/.claude/**', 'e2e/**'];

// `.test.ts` files that still need a DOM. Everything else with that extension
// runs in the far cheaper `node` environment — booting jsdom costs ~0.9s per
// file. A new test that needs the DOM fails loudly with "document is not
// defined"; add it here.
const DOM_TEST_TS = [
  // renderHook needs a React DOM container.
  'src/hooks/useDebouncedValue.test.ts',
  'src/hooks/useMediaQuery.test.ts',
  // These fetch relative URLs, which need a document origin to resolve.
  'src/infrastructure/exchangeRateClient.test.ts',
  'src/infrastructure/httpClient.test.ts',
  'src/infrastructure/marketClient.contract.test.ts',
  // localStorage-backed store hydration.
  'src/store/seedSandbox.test.ts',
  // Drives the worker through the DOM postMessage protocol.
  'src/workers/monteCarlo.worker.test.ts',
];

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // In dev the browser only talks to the Vite origin; /api is proxied to the
    // local Hono server (npm run dev:api). No CORS, cookies stay first-party.
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.API_PORT ?? 8787}`,
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    css: false,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          globals: true,
          environment: 'node',
          setupFiles: ['./src/test/setup.node.ts'],
          include: ['**/*.test.ts'],
          exclude: [...sharedExclude, ...DOM_TEST_TS],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          globals: true,
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          include: ['**/*.test.tsx', ...DOM_TEST_TS],
          exclude: sharedExclude,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'server/**/*.ts'],
      exclude: [
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
        'src/test/**',
        'server/test/**',
        'server/scripts/**',
        'src/i18n/**',
        // Bootstrap entrypoints and declarative table definitions: no branches
        // worth asserting, and including them only dilutes the ratchet below.
        'src/main.tsx',
        'server/dev.ts',
        'server/db/schema.ts',
      ],
      // A ratchet, not a target. Set just under the measured baseline
      // (2026-07-21: 61.10/47.85/46.91/61.85), so coverage can only go up.
      // Raise these as gaps close; never lower them to make CI green.
      thresholds: {
        statements: 59,
        branches: 47,
        functions: 45,
        lines: 60,
      },
    },
  },
});
