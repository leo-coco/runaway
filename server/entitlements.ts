import { eq } from 'drizzle-orm';
import { db } from './db/client.js';
import { tierConfig, user as userTable } from './db/schema.js';
import {
  DEFAULT_TIER_CONFIG,
  resolveEntitlements,
  type Entitlements,
  type TierConfig,
} from '../src/domain/entitlements.js';

/** The single tier_config row id. */
const CONFIG_ID = 'default';

/** The session user shape we need for entitlement + admin decisions. */
export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly role?: string | null;
  readonly tier?: string | null;
  readonly premiumUntil?: string | Date | null;
}

/**
 * Narrow a Better Auth session user down to the fields we care about. The freemium
 * columns ride on the session via `user.additionalFields` (auth.ts) but aren't in
 * Better Auth's static type, so we read them off an index signature.
 */
export const toAuthUser = (
  u: { id: string; email: string } & Record<string, unknown>,
): AuthUser => ({
  id: u.id,
  email: u.email,
  role: (u.role as string | null | undefined) ?? null,
  tier: (u.tier as string | null | undefined) ?? null,
  premiumUntil: (u.premiumUntil as string | Date | null | undefined) ?? null,
});

/**
 * Load the admin-editable tier config, seeding the default row on first read so the
 * admin editor always has something to load. Falls back to DEFAULT_TIER_CONFIG.
 */
/**
 * Backfill feature flags a stored row predates (flags added after it was seeded)
 * from the defaults, so both the resolver and the admin editor always see a
 * complete `features` object regardless of when the row was last written.
 */
const normalizeConfig = (data: TierConfig): TierConfig => ({
  ...data,
  free: {
    ...data.free,
    features: { ...DEFAULT_TIER_CONFIG.free.features, ...data.free.features },
  },
  premium: {
    ...data.premium,
    features: { ...DEFAULT_TIER_CONFIG.premium.features, ...data.premium.features },
  },
});

export const loadTierConfig = async (): Promise<TierConfig> => {
  const [row] = await db.select().from(tierConfig).where(eq(tierConfig.id, CONFIG_ID));
  if (row) return normalizeConfig(row.data);
  await db
    .insert(tierConfig)
    .values({ id: CONFIG_ID, data: DEFAULT_TIER_CONFIG })
    .onConflictDoNothing();
  return DEFAULT_TIER_CONFIG;
};

/** Persist an updated tier config (admin only; the caller validates the shape). */
export const saveTierConfig = async (data: TierConfig): Promise<TierConfig> => {
  const [row] = await db
    .insert(tierConfig)
    .values({ id: CONFIG_ID, data, updatedAt: new Date() })
    .onConflictDoUpdate({ target: tierConfig.id, set: { data, updatedAt: new Date() } })
    .returning();
  return row!.data;
};

/**
 * Resolve a user's effective entitlements from the live user row + live config.
 *
 * Better Auth sessions can outlive an admin/subscription tier change. Never trust
 * the tier copied into the session for quota enforcement: a stale `premium` value
 * would otherwise turn every limit into `null` until that session is refreshed.
 */
export const getEntitlements = async (user: AuthUser): Promise<Entitlements> => {
  const [config, rows] = await Promise.all([
    loadTierConfig(),
    db
      .select({ tier: userTable.tier, premiumUntil: userTable.premiumUntil })
      .from(userTable)
      .where(eq(userTable.id, user.id)),
  ]);
  const currentUser = rows[0];

  // A valid authenticated user should always have a row. If it disappeared,
  // fail closed as Free instead of granting privileges from a stale session.
  return resolveEntitlements(currentUser?.tier ?? null, currentUser?.premiumUntil ?? null, config);
};

/** True when the user may access admin surfaces: an explicit `admin` role. */
export const isAdmin = (user: AuthUser): boolean => user.role === 'admin';
