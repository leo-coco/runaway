import { Hono } from 'hono';
import { z } from 'zod';
import { auth } from '../auth.js';
import { sendContactEmail } from '../email.js';
import { hitRateLimit } from '../lib/rateLimit.js';
import { CONTACT_SUBJECTS } from '../../src/domain/contact.js';

/**
 * Footer contact form. Guests must be able to write in (that's often the point —
 * they can't sign in), so there is no session gate. When a session does exist its
 * identity wins over the posted name/email: a signed-in message can then never be
 * attributed to an address the sender doesn't own.
 *
 * Because every accepted post sends a billed Resend email to a fixed support
 * mailbox, the open route is a spam/resource-exhaustion target (OWASP API4:2023).
 * Two cheap defences guard it: a hidden honeypot field that automated fillers
 * trip, and a shared per-IP rate limit. Better Auth's own limiter only covers
 * /api/auth/* and lives in process memory, so it does not help here.
 */
export const contactRoutes = new Hono();

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 3;

const bodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email(),
  subject: z.enum(CONTACT_SUBJECTS),
  message: z.string().trim().min(10).max(2000),
  // Honeypot: a hidden field real users never see. A bot that autofills it gets
  // a silent success without any email being sent, so we don't reveal the trap.
  website: z.string().optional(),
});

/** First hop in x-forwarded-for is the client on Vercel; fall back to a shared bucket. */
const clientIp = (header: string | undefined): string => header?.split(',')[0]?.trim() || 'unknown';

contactRoutes.post('/', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'Invalid contact request' }, 400);

  if (parsed.data.website) return c.json({ ok: true });

  const ip = clientIp(c.req.header('x-forwarded-for'));
  const { limited } = await hitRateLimit(`contact:${ip}`, WINDOW_MS, MAX_PER_WINDOW);
  if (limited) return c.json({ error: 'Too many messages, please try again later' }, 429);

  const res = await auth.api.getSession({ headers: c.req.raw.headers });
  const sender = res?.user
    ? { name: res.user.name || parsed.data.name, email: res.user.email, userId: res.user.id }
    : { name: parsed.data.name, email: parsed.data.email, userId: null };

  const sent = await sendContactEmail({
    subject: parsed.data.subject,
    message: parsed.data.message,
    ...sender,
  });
  if (!sent) return c.json({ error: 'Could not send your message' }, 502);
  return c.json({ ok: true });
});
