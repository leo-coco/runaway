import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

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
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Other agent worktrees live under .claude/worktrees/** as separate git
    // checkouts; without this they get scanned too and their stale test
    // files fail the run (and thus the pre-push hook).
    // Playwright specs under e2e/** match Vitest's default *.spec.ts glob; they
    // run via `npm run test:e2e`, not Vitest, so keep them out of this run.
    exclude: [...configDefaults.exclude, '**/.claude/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['src/services/**', 'src/hooks/**', 'src/domain/**'],
    },
  },
});
