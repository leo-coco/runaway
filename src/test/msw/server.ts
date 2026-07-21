import { setupServer } from 'msw/node';

/**
 * Shared msw server for tests that exercise the network boundary
 * (src/infrastructure/**). Lifecycle is wired in src/test/setup.ts.
 *
 * No default handlers on purpose: every test declares the responses it needs
 * via `server.use(...)`, and anything unhandled fails the run (see setup.ts).
 */
export const server = setupServer();
