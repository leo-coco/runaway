import { Hono } from 'hono';
import { and, eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { plans } from '../db/schema';
import { auth } from '../auth';
import type { Plan } from '../../src/domain/plan';

type Vars = { userId: string };

/** Envelope validation. `data` is the domain Plan, stored opaquely as JSONB. */
const upsertSchema = z.object({
  name: z.string().trim().min(1).max(200),
  schemaVersion: z.number().int().nonnegative(),
  data: z.object({ id: z.string().min(1) }).passthrough(),
});

const toRow = (r: typeof plans.$inferSelect) => ({
  id: r.id,
  name: r.name,
  schemaVersion: r.schemaVersion,
  data: r.data,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

export const plansRoutes = new Hono<{ Variables: Vars }>();

// Auth gate: every route below requires a valid session.
plansRoutes.use('*', async (c, next) => {
  const res = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!res?.user) return c.json({ error: 'Unauthorized' }, 401);
  c.set('userId', res.user.id);
  await next();
});

plansRoutes.get('/', async (c) => {
  const rows = await db
    .select()
    .from(plans)
    .where(eq(plans.userId, c.get('userId')))
    .orderBy(desc(plans.updatedAt));
  return c.json(rows.map(toRow));
});

plansRoutes.get('/:id', async (c) => {
  const [row] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.id, c.req.param('id')), eq(plans.userId, c.get('userId'))));
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(toRow(row));
});

// Idempotent upsert keyed by the client-generated plan id, scoped to the user.
plansRoutes.put('/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const parsed = upsertSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid plan', issues: parsed.error.issues }, 400);
  if (parsed.data.data.id !== id) return c.json({ error: 'Id mismatch' }, 400);

  const [row] = await db
    .insert(plans)
    .values({
      id,
      userId,
      name: parsed.data.name,
      schemaVersion: parsed.data.schemaVersion,
      data: parsed.data.data as unknown as Plan,
    })
    .onConflictDoUpdate({
      target: plans.id,
      // Only the owner may overwrite; a non-owner's id collision updates nothing.
      setWhere: eq(plans.userId, userId),
      set: {
        name: parsed.data.name,
        schemaVersion: parsed.data.schemaVersion,
        data: parsed.data.data as unknown as Plan,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!row) return c.json({ error: 'Conflict' }, 409);
  return c.json(toRow(row));
});

plansRoutes.delete('/:id', async (c) => {
  await db
    .delete(plans)
    .where(and(eq(plans.id, c.req.param('id')), eq(plans.userId, c.get('userId'))));
  return c.body(null, 204);
});
