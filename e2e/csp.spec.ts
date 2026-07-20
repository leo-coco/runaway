import { test, expect, type Page } from '@playwright/test';

/**
 * Post-deploy smoke: the marketing landing page's CTAs must lead into a
 * working app without tripping the production Content-Security-Policy
 * (script-src 'self', see vercel.json). This guards against inline <script>
 * tags creeping back in from build tooling (Sentry release/debug-id
 * injection, analytics snippets, etc.) that a strict CSP silently blocks,
 * leaving the app unable to boot.
 *
 * No auth needed: this only exercises the public marketing → app hand-off.
 */

const collectCspViolations = (page: Page) =>
  page.addInitScript(() => {
    (window as unknown as { __cspViolations: string[] }).__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __cspViolations: string[] }).__cspViolations.push(
        `${e.violatedDirective}: ${e.blockedURI}`,
      );
    });
  });

const readCspViolations = (page: Page) =>
  page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations);

test.describe('marketing landing CTAs reach the app cleanly (no CSP violations)', () => {
  test('"Se connecter" reaches the sign-in screen', async ({ page }) => {
    await collectCspViolations(page);
    await page.goto('/');
    await page.locator('a[href*="/app/signin"]').first().click();
    await expect(page.locator('.auth-screen')).toBeVisible();
    expect(await readCspViolations(page)).toEqual([]);
  });

  test('"Essayer sans email" reaches the sandbox app', async ({ page }) => {
    await collectCspViolations(page);
    await page.goto('/');
    await page.locator('a[href*="/app/sandbox"]').first().click();
    await expect(page.locator('.app-shell')).toBeVisible();
    expect(await readCspViolations(page)).toEqual([]);
  });

  test('"Créer mon plan gratuitement" reaches the sign-up screen', async ({ page }) => {
    await collectCspViolations(page);
    await page.goto('/');
    await page.locator('a[href*="/app/signup"]').first().click();
    await expect(page.locator('.auth-screen')).toBeVisible();
    expect(await readCspViolations(page)).toEqual([]);
  });
});
