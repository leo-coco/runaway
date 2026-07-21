import '@testing-library/jest-dom/vitest';
// Initialise i18n (default English) so components using `t()` render real strings.
import '@/i18n';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './msw/server';

// msw intercepts real fetch calls. Tests that stub `globalThis.fetch` outright
// bypass it entirely, so this is additive for the existing suite.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
