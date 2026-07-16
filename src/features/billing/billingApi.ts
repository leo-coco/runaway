/** Client calls to the Stripe billing endpoints. Each returns a Stripe-hosted URL
 * the browser is redirected to. */

/** Thrown when billing isn't configured server-side (503), so the UI can fall back
 * to the "coming soon" copy instead of showing a hard error. */
export class BillingUnavailableError extends Error {
  constructor() {
    super('Billing not configured');
    this.name = 'BillingUnavailableError';
  }
}

const postForUrl = async (path: string): Promise<string> => {
  const res = await fetch(path, { method: 'POST', credentials: 'include' });
  if (res.status === 503) throw new BillingUnavailableError();
  if (!res.ok) throw new Error(`API ${res.status}`);
  const { url } = (await res.json()) as { url?: string };
  if (!url) throw new Error('Missing checkout URL');
  return url;
};

/** Start a Premium subscription: redirect to Stripe Checkout. */
export const startCheckout = async (): Promise<void> => {
  window.location.assign(await postForUrl('/api/billing/checkout'));
};

/** Open the Stripe billing portal to manage or cancel the subscription. */
export const openBillingPortal = async (): Promise<void> => {
  window.location.assign(await postForUrl('/api/billing/portal'));
};
