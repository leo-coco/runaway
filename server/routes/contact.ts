import { Hono } from 'hono';
import { z } from 'zod';
import { auth } from '../auth.js';
import { sendContactEmail } from '../email.js';
import { CONTACT_SUBJECTS } from '../../src/domain/contact.js';

/**
 * Footer contact form. Guests must be able to write in (that's often the point —
 * they can't sign in), so there is no session gate. When a session does exist its
 * identity wins over the posted name/email: a signed-in message can then never be
 * attributed to an address the sender doesn't own.
 */
export const contactRoutes = new Hono();

const bodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email(),
  subject: z.enum(CONTACT_SUBJECTS),
  message: z.string().trim().min(10).max(2000),
});

contactRoutes.post('/', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'Invalid contact request' }, 400);

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
