import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Drives the real contact handler. The impure edges are mocked: Better Auth's
 * session lookup, the Resend send, and the DB-backed rate limiter (its own SQL
 * is covered by exercising the handler's decisions, not re-implemented here).
 * The focus is the security-relevant wiring: session identity overriding the
 * posted name/email, the honeypot, and the per-IP volume cap.
 */

const getSession = vi.fn();
vi.mock('../auth.js', () => ({ auth: { api: { getSession } } }));

const sendContactEmail = vi.fn();
vi.mock('../email.js', () => ({ sendContactEmail }));

const hitRateLimit = vi.fn();
vi.mock('../lib/rateLimit.js', () => ({ hitRateLimit }));

const { contactRoutes } = await import('./contact.js');

const VALID = {
  name: 'Ada',
  email: 'ada@example.com',
  subject: 'question',
  message: 'This is a long enough message.',
};

const post = (body: unknown, headers: Record<string, string> = {}) =>
  contactRoutes.request('/', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  getSession.mockReset();
  sendContactEmail.mockReset();
  hitRateLimit.mockReset();
  getSession.mockResolvedValue(null);
  sendContactEmail.mockResolvedValue(true);
  hitRateLimit.mockResolvedValue({ limited: false, remaining: 2 });
});

describe('validation', () => {
  it('rejects a malformed body without sending or counting a hit', async () => {
    const res = await post({ name: '', email: 'nope', subject: 'question', message: 'short' });
    expect(res.status).toBe(400);
    expect(sendContactEmail).not.toHaveBeenCalled();
    expect(hitRateLimit).not.toHaveBeenCalled();
  });

  it('rejects a non-JSON body', async () => {
    const res = await contactRoutes.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
    expect(sendContactEmail).not.toHaveBeenCalled();
  });
});

describe('identity substitution', () => {
  it('a signed-in sender cannot spoof an email they do not own', async () => {
    getSession.mockResolvedValue({
      user: { id: 'user-1', name: 'Real Name', email: 'real@acme.com' },
    });
    const res = await post({ ...VALID, name: 'Spoofed', email: 'victim@elsewhere.com' });
    expect(res.status).toBe(200);
    expect(sendContactEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'real@acme.com', userId: 'user-1', name: 'Real Name' }),
    );
  });

  it('keeps the signed-in email even when the account has no name', async () => {
    getSession.mockResolvedValue({ user: { id: 'user-1', name: '', email: 'real@acme.com' } });
    const res = await post({ ...VALID, name: 'Posted Name', email: 'victim@elsewhere.com' });
    expect(res.status).toBe(200);
    expect(sendContactEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'real@acme.com', name: 'Posted Name' }),
    );
  });

  it('a guest keeps the posted name/email with a null userId', async () => {
    const res = await post(VALID);
    expect(res.status).toBe(200);
    expect(sendContactEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ada@example.com', name: 'Ada', userId: null }),
    );
  });
});

describe('honeypot', () => {
  it('silently accepts a submission with the honeypot filled and sends nothing', async () => {
    const res = await post({ ...VALID, website: 'http://spam.example' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendContactEmail).not.toHaveBeenCalled();
    // Tripping the honeypot must not cost the caller a rate-limit slot.
    expect(hitRateLimit).not.toHaveBeenCalled();
  });
});

describe('rate limiting', () => {
  it('returns 429 without sending once the per-IP limit is exceeded', async () => {
    hitRateLimit.mockResolvedValue({ limited: true, remaining: 0 });
    const res = await post(VALID);
    expect(res.status).toBe(429);
    expect(sendContactEmail).not.toHaveBeenCalled();
  });

  it('buckets by the first x-forwarded-for hop', async () => {
    await post(VALID, { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' });
    expect(hitRateLimit).toHaveBeenCalledWith(
      'contact:203.0.113.7',
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('falls back to a shared bucket when the client IP is unknown', async () => {
    await post(VALID);
    expect(hitRateLimit).toHaveBeenCalledWith(
      'contact:unknown',
      expect.any(Number),
      expect.any(Number),
    );
  });
});

describe('delivery failure', () => {
  it('surfaces a 502 when Resend reports the message was not sent', async () => {
    sendContactEmail.mockResolvedValue(false);
    const res = await post(VALID);
    expect(res.status).toBe(502);
  });
});
