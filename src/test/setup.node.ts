// Setup shared by both Vitest projects: nothing here may touch the DOM, since
// the `node` project runs without jsdom. jsdom-only additions live in setup.ts.
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './msw/server';

// msw intercepts real fetch calls. Tests that stub `globalThis.fetch` outright
// bypass it entirely, so this is additive for the existing suite.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
