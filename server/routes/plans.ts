import { Hono } from 'hono';
import { and, eq, desc, count } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { plans } from '../db/schema.js';
import { auth } from '../auth.js';
import { getEntitlements, toAuthUser, type AuthUser } from '../entitlements.js';
import { atLimit } from '../../src/domain/entitlements.js';
import {
  encrypt,
  encryptJson,
  decrypt,
  decryptJson,
  isEnvelope,
  type EncryptedEnvelope,
} from '../crypto/dataCrypto.js';
import type { Plan } from '../../src/domain/plan.js';

type Vars = { userId: string; user: AuthUser };

/** Count array-valued plan fields defensively (client may omit them). */
const len = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

/** Envelope validation. `data` is the domain Plan, stored opaquely as JSONB. */
const upsertSchema = z.object({
  name: z.string().trim().min(1).max(200),
  schemaVersion: z.number().int().nonnegative(),
  data: z.object({ id: z.string().min(1) }).passthrough(),
});

/** Decrypt a stored plan blob. Legacy plaintext rows (pre-backfill) pass through. */
const decryptData = (data: EncryptedEnvelope | Plan): Plan =>
  isEnvelope(data) ? decryptJson<Plan>(data) : (data as Plan);

/** Decrypt a stored plan name (a JSON-stringified envelope). Legacy names pass through. */
const decryptName = (name: string): string => {
  try {
    const parsed: unknown = JSON.parse(name);
    if (isEnvelope(parsed)) return decrypt(parsed);
  } catch {
    // Not JSON — a legacy plaintext name from before encryption.
  }
  return name;
};

const toRow = (r: typeof plans.$inferSelect) => ({
  id: r.id,
  name: decryptName(r.name),
  schemaVersion: r.schemaVersion,
  data: decryptData(r.data),
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

export const plansRoutes = new Hono<{ Variables: Vars }>();

// Auth gate: every route below requires a valid session.
plansRoutes.use('*', async (c, next) => {
  const res = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!res?.user) return c.json({ error: 'Unauthorized' }, 401);
  const user = toAuthUser(res.user);
  c.set('userId', user.id);
  c.set('user', user);
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

  // Tier enforcement (authoritative). Load the caller's effective entitlements and
  // the existing row (owner-scoped) up front: the row's presence distinguishes a
  // create from an update, and its counts anchor the growth-only caps below.
  const ent = await getEntitlements(c.get('user'));
  const data = parsed.data.data as unknown as Plan;
  const [existing] = await db
    .select()
    .from(plans)
    .where(and(eq(plans.id, id), eq(plans.userId, userId)));

  // Plan cap: only blocks creating a NEW plan past the limit; updates always pass.
  if (!existing) {
    const [countRow] = await db.select({ n: count() }).from(plans).where(eq(plans.userId, userId));
    if (atLimit(countRow?.n ?? 0, ent.limits.maxPlans)) {
      return c.json(
        { error: 'Plan limit reached', reason: 'limit', limit: 'plans', max: ent.limits.maxPlans },
        403,
      );
    }
  }

  // Asset/account caps are growth-only: block increases past the cap, but never
  // reject data a (possibly lapsed-premium) user already has — so no data loss.
  // The stored blob is encrypted, so decrypt before counting.
  const prevData = existing ? decryptData(existing.data) : undefined;
  const prevAssets = prevData ? len(prevData.holdings) : 0;
  const newAssets = len(data.holdings);
  if (ent.limits.maxAssets !== null && newAssets > ent.limits.maxAssets && newAssets > prevAssets) {
    return c.json(
      { error: 'Asset limit reached', reason: 'limit', limit: 'assets', max: ent.limits.maxAssets },
      403,
    );
  }
  const prevAccounts = prevData ? len(prevData.accounts) : 0;
  const newAccounts = len(data.accounts);
  if (
    ent.limits.maxAccounts !== null &&
    newAccounts > ent.limits.maxAccounts &&
    newAccounts > prevAccounts
  ) {
    return c.json(
      {
        error: 'Account limit reached',
        reason: 'limit',
        limit: 'accounts',
        max: ent.limits.maxAccounts,
      },
      403,
    );
  }

  // Encrypt at rest: `data` becomes an envelope object, `name` a stringified envelope.
  const encName = JSON.stringify(encrypt(parsed.data.name));
  const encData = encryptJson(data);

  const [row] = await db
    .insert(plans)
    .values({
      id,
      userId,
      name: encName,
      schemaVersion: parsed.data.schemaVersion,
      data: encData,
    })
    .onConflictDoUpdate({
      target: plans.id,
      // Only the owner may overwrite; a non-owner's id collision updates nothing.
      setWhere: eq(plans.userId, userId),
      set: {
        name: encName,
        schemaVersion: parsed.data.schemaVersion,
        data: encData,
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
