import './setup.node';
import '@testing-library/jest-dom/vitest';
// Initialise i18n (default English) so components using `t()` render real strings.
import '@/i18n';

// jsdom has no ResizeObserver; RunwayTimeline (and anything else that measures
// its container) needs a stub or it throws in every test that renders it.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;
