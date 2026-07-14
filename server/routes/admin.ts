import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { user as userTable } from '../db/schema.js';
import { auth } from '../auth.js';
import {
  isAdmin,
  loadTierConfig,
  saveTierConfig,
  toAuthUser,
  type AuthUser,
} from '../entitlements.js';
import type { TierConfig } from '../../src/domain/entitlements.js';

type Vars = { admin: AuthUser };

const limitsSchema = z.object({
  maxPlans: z.number().int().nonnegative().nullable(),
  maxAssets: z.number().int().nonnegative().nullable(),
  maxAccounts: z.number().int().nonnegative().nullable(),
});

const featuresSchema = z.object({
  monteCarlo: z.boolean(),
  withdrawalOrdering: z.boolean(),
  taxOptimization: z.boolean(),
  multiAccount: z.boolean(),
  phasedSpending: z.boolean(),
  realEstate: z.boolean(),
});

const tierConfigSchema = z.object({
  free: z.object({ limits: limitsSchema, features: featuresSchema }),
  premium: z.object({ limits: limitsSchema, features: featuresSchema }),
  pricing: z.object({
    annual: z.number().nonnegative(),
    currency: z.string().trim().min(1).max(8),
    introPrice: z.number().nonnegative(),
    introActive: z.boolean(),
  }),
});

const userPatchSchema = z.object({
  tier: z.enum(['free', 'premium']).optional(),
  role: z.enum(['user', 'admin']).optional(),
  // ISO datetime string to grant Premium until, or null to clear the expiry.
  premiumUntil: z.string().datetime().nullable().optional(),
});

export const adminRoutes = new Hono<{ Variables: Vars }>();

// Admin gate: valid session AND admin (role or ADMIN_EMAILS bootstrap).
adminRoutes.use('*', async (c, next) => {
  const res = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!res?.user) return c.json({ error: 'Unauthorized' }, 401);
  const user = toAuthUser(res.user);
  if (!isAdmin(user)) return c.json({ error: 'Forbidden' }, 403);
  c.set('admin', user);
  await next();
});

// Tier config (limits, features, pricing) the admin edits at runtime.
adminRoutes.get('/config', async (c) => c.json(await loadTierConfig()));

adminRoutes.put('/config', async (c) => {
  const parsed = tierConfigSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid config', issues: parsed.error.issues }, 400);
  const saved = await saveTierConfig(parsed.data as TierConfig);
  return c.json(saved);
});

// User list + manual tier/role/premium grants.
adminRoutes.get('/users', async (c) => {
  const rows = await db
    .select({
      id: userTable.id,
      email: userTable.email,
      name: userTable.name,
      role: userTable.role,
      tier: userTable.tier,
      premiumUntil: userTable.premiumUntil,
      createdAt: userTable.createdAt,
    })
    .from(userTable)
    .orderBy(desc(userTable.createdAt));
  return c.json(rows);
});

adminRoutes.patch('/users/:id', async (c) => {
  const parsed = userPatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid patch', issues: parsed.error.issues }, 400);

  const set: Partial<typeof userTable.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.tier !== undefined) set.tier = parsed.data.tier;
  if (parsed.data.role !== undefined) set.role = parsed.data.role;
  if (parsed.data.premiumUntil !== undefined) {
    set.premiumUntil = parsed.data.premiumUntil ? new Date(parsed.data.premiumUntil) : null;
  }

  const [row] = await db
    .update(userTable)
    .set(set)
    .where(eq(userTable.id, c.req.param('id')))
    .returning({
      id: userTable.id,
      email: userTable.email,
      name: userTable.name,
      role: userTable.role,
      tier: userTable.tier,
      premiumUntil: userTable.premiumUntil,
    });
  if (!row) return c.json({ error: 'Not found' }, 404);
  return c.json(row);
});
