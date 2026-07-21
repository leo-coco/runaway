import { test as base, expect, type ConsoleMessage } from '@playwright/test';

/**
 * Capture browser-side warnings and errors in both the GitHub Actions log and
 * the Playwright report. This makes production smoke failures diagnosable
 * without reproducing them locally.
 */
export const test = base.extend({
  page: async ({ page }, run, testInfo) => {
    const browserMessages: string[] = [];
    const onConsole = (message: ConsoleMessage) => {
      if (!['warning', 'error'].includes(message.type())) return;

      const location = message.location();
      const source = location.url ? ` (${location.url}:${location.lineNumber})` : '';
      const entry = `[browser ${message.type()}] ${message.text()}${source}`;
      browserMessages.push(entry);
      // Printed directly in the Actions job log, where it is available even
      // before downloading the Playwright report artifact.
      console.error(entry);
    };

    page.on('console', onConsole);
    await run(page);
    page.off('console', onConsole);

    if (browserMessages.length > 0 && testInfo.status !== testInfo.expectedStatus) {
      await testInfo.attach('browser-console', {
        body: Buffer.from(`${browserMessages.join('\n')}\n`),
        contentType: 'text/plain',
      });
    }
  },
});

export { expect };
