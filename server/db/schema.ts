import { pgTable, text, boolean, timestamp, jsonb, integer, index } from 'drizzle-orm/pg-core';
import type { Plan } from '../../src/domain/plan';
import type { EncryptedEnvelope } from '../crypto/dataCrypto';
import type { TierConfig } from '../../src/domain/entitlements';

/**
 * Better Auth core tables. Column shapes match what Better Auth 1.6 expects (see
 * @better-auth/core/db/schema). The JS property keys are the field names Better
 * Auth references; the string arg is the snake_case DB column.
 */
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  // The preferred UI and transactional-email language. Kept on the user rather
  // than only in localStorage so it follows the account across devices.
  language: text('language').notNull().default('en'),
  // Freemium fields (exposed to Better Auth via user.additionalFields in auth.ts).
  // `role` gates the admin surface; `tier` + `premiumUntil` drive entitlements. In
  // phase 1 these are set manually from the admin panel; phase 2 a Stripe webhook
  // writes them.
  role: text('role').notNull().default('user'),
  tier: text('tier').notNull().default('free'),
  premiumUntil: timestamp('premium_until'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * A saved retirement plan, owned by a user. The whole `Plan` object (holdings,
 * accounts, tax settings, Monte Carlo settings, scenario…) lives in `data` as
 * JSONB, so any field added to the domain `Plan` is persisted with no SQL change.
 * `schemaVersion` mirrors the old zustand/persist version for forward migration.
 *
 * `data` and `name` are encrypted at rest (AES-256-GCM, see server/crypto): `data`
 * holds an EncryptedEnvelope object and `name` a JSON-stringified envelope. The Plan
 * union member covers pre-encryption rows still awaiting backfill.
 */
export const plans = pgTable(
  'plans',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    data: jsonb('data').$type<EncryptedEnvelope | Plan>().notNull(),
    schemaVersion: integer('schema_version').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('plans_user_id_idx').on(t.userId)],
);

/**
 * Generic shared cache for third-party market API responses (FX rates, stock
 * quotes, symbol search). Keyed by a namespaced string (e.g. 'fx:USD',
 * 'quote:AAPL'); `payload` is the already-validated upstream DTO stored as JSONB.
 * A single row is reused by every user until `expiresAt`, so one upstream call
 * per key per TTL serves the whole app — this is what keeps free-tier quotas
 * (especially Alpha Vantage's ~25 req/day) viable. See server/lib/cachedFetch.ts.
 */
export const apiCache = pgTable(
  'api_cache',
  {
    key: text('key').primaryKey(),
    payload: jsonb('payload').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('api_cache_expires_at_idx').on(t.expiresAt)],
);

/**
 * Admin-editable freemium configuration (tier limits, feature flags, pricing).
 * A single row keyed `'default'`; `data` is the domain `TierConfig` stored as JSONB
 * so the shape can evolve with no SQL change. Read by both the entitlement resolver
 * and the admin editor; falls back to DEFAULT_TIER_CONFIG when absent.
 */
export const tierConfig = pgTable('tier_config', {
  id: text('id').primaryKey(),
  data: jsonb('data').$type<TierConfig>().notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const authSchema = { user, session, account, verification };
export type PlanRow = typeof plans.$inferSelect;
export type ApiCacheRow = typeof apiCache.$inferSelect;
export type TierConfigRow = typeof tierConfig.$inferSelect;
