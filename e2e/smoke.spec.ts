import { test, expect, type Page } from '@playwright/test';

/**
 * Post-deploy smoke: the critical end-to-end journey through the real site.
 * Sign in → ensure a plan exists → open dashboard → run a simulation
 * (Monte Carlo) → verify persistence across a reload → visit the main sections.
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

/** A section renders successfully when its content is shown and no error boundary tripped. */
const expectSectionOk = async (page: Page, planId: string, section: string) => {
  await page.goto(appPath(`/plan/${planId}/${section}`));
  await expect(page.locator('.app-content')).toBeVisible();
  await expect(page.locator('.feature-error')).toHaveCount(0);
};

test.beforeAll(() => {
  test.skip(
    !EMAIL || !PASSWORD,
    'Set SMOKE_TEST_EMAIL and SMOKE_TEST_PASSWORD to run the deployed smoke.',
  );
});

test('critical journey: sign in, plan, dashboard, simulation, reload, sections', async ({
  page,
}) => {
  await signIn(page);

  const planId = await openAPlan(page);
  await expect(page.locator('.app-content')).toBeVisible();
  await expect(page.locator('.feature-error')).toHaveCount(0);

  // Run a simulation (Monte Carlo) and the projection engine.
  await expectSectionOk(page, planId, 'monte-carlo');
  await expectSectionOk(page, planId, 'projection');
  await expectSectionOk(page, planId, 'portfolio');

  // Persistence: reload the dashboard and confirm the plan is still there
  // (the API served it back, sidebar rehydrated).
  await page.goto(appPath(`/plan/${planId}/dashboard`));
  await page.reload();
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('.sb-plan')).not.toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/plan/${planId}/dashboard`));
  await expect(page.locator('.feature-error')).toHaveCount(0);
});
