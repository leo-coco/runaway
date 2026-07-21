import { test, expect, type Page } from '@playwright/test';

/**
 * Post-deploy smoke: the critical end-to-end journey through the real site.
 * Sign in → ensure a plan exists → open dashboard → read the projection and
 * portfolio output → check the Monte Carlo verdict → verify persistence across
 * a reload.
 *
 * Each section asserts its own characteristic content, not merely the absence of
 * an error boundary: a section that renders blank, or a chart that renders with
 * no values, is a release-blocking regression that "no error was thrown" misses
 * entirely.
 *
 * Selectors are structural (stable class names), not translated text, so the
 * test is language-independent. Sign-up needs email verification, so this signs
 * IN a pre-provisioned verified user rather than registering one.
 */

const LANG = 'en';
const EMAIL = process.env.SMOKE_TEST_EMAIL;
const PASSWORD = process.env.SMOKE_TEST_PASSWORD;

const appPath = (path: string) => `/${LANG}/app${path}`;

const signIn = async (page: Page) => {
  await page.goto(appPath('/signin'));
  await page.locator('#auth-email').fill(EMAIL as string);
  await page.locator('#auth-password').fill(PASSWORD as string);
  await page.locator('.auth-form button[type="submit"]').click();
  // Land inside the authenticated shell (present on every signed-in page).
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('.auth-screen')).toHaveCount(0);
};

/** Guarantee at least one plan, then open it and return its id from the URL. */
const openAPlan = async (page: Page): Promise<string> => {
  if ((await page.locator('.sb-plan').count()) === 0) {
    await page.locator('.sb-new').click();
    await expect(page.locator('.sb-plan').first()).toBeVisible();
  }
  await page.locator('.sb-plan__name').first().click();
  await page.waitForURL(/\/plan\/[^/]+\/dashboard/);
  const match = /\/plan\/([^/]+)\//.exec(page.url());
  expect(match, 'a plan id should be present in the URL').not.toBeNull();
  return match![1]!;
};

/** Open a section and assert the shell rendered it without tripping a boundary. */
const gotoSection = async (page: Page, planId: string, section: string) => {
  await page.goto(appPath(`/plan/${planId}/${section}`));
  await expect(page.locator('.app-content')).toBeVisible();
  await expect(page.locator('.feature-error')).toHaveCount(0);
};

test.beforeAll(() => {
  if (EMAIL && PASSWORD) return;
  const message =
    'SMOKE_TEST_EMAIL and SMOKE_TEST_PASSWORD are required to run the deployed smoke.';
  // Locally these are optional. In CI they are the release gate: skipping on a
  // missing or expired secret would report a silent green for a deploy nobody
  // actually verified.
  if (process.env.CI) throw new Error(message);
  test.skip(true, message);
});

test('critical journey: sign in, plan, dashboard, projection, portfolio, simulation, reload', async ({
  page,
}) => {
  await signIn(page);

  const planId = await openAPlan(page);
  await expect(page.locator('.app-content')).toBeVisible();
  await expect(page.locator('.feature-error')).toHaveCount(0);
  // The dashboard hero renders its Monte Carlo card in one of two states — the
  // verdict, or the locked upsell on a free plan. Neither may be missing.
  await expect(page.locator('.mc-card')).toBeVisible();

  // Projection: the deterministic engine ran and produced three stat values
  // (portfolio today, at retirement, depletion year). Empty or skeleton cards
  // fail here, where the old "no error boundary" check passed them.
  await gotoSection(page, planId, 'projection');
  const projectionStats = page.locator('.projection-summary .hero__big');
  await expect(projectionStats).toHaveCount(3);
  await expect(projectionStats.first()).toHaveText(/\d/);
  await expect(projectionStats.nth(1)).toHaveText(/\d/);

  // Portfolio: the holdings breakdown renders. When the plan carries assets, the
  // total row must show a real figure rather than an empty cell.
  await gotoSection(page, planId, 'portfolio');
  await expect(page.locator('.breakdown')).toBeVisible();
  if ((await page.locator('.asset-sym').count()) > 0) {
    await expect(page.locator('.total-row')).toHaveText(/\d/);
  }

  // Monte Carlo: a premium plan renders a success percentage, a free plan the
  // upsell. One of them must appear — a blank analysis pane is a regression.
  // Wait on `.or()` rather than branching on a count: the simulation runs in a
  // worker, so an immediate count would race it and see neither state.
  await gotoSection(page, planId, 'monte-carlo');
  const verdict = page.locator('.prob-success-card__value .hero__big');
  const upsell = page.locator('.upgrade-card');
  await expect(verdict.or(upsell).first()).toBeVisible();
  if (await verdict.isVisible()) {
    await expect(verdict).toHaveText(/^\d{1,3}\s*%$/);
  }

  // Persistence: reload the dashboard and confirm the plan is still there
  // (the API served it back, sidebar rehydrated).
  await page.goto(appPath(`/plan/${planId}/dashboard`));
  await page.reload();
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('.sb-plan')).not.toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/plan/${planId}/dashboard`));
  await expect(page.locator('.feature-error')).toHaveCount(0);
});
