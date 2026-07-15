import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/lib/authClient';
import { queryKeys } from '@/providers/queryKeys';
import {
  DEFAULT_TIER_CONFIG,
  resolveEntitlements,
  type Entitlements,
  type TierFeatures,
  type TierLimits,
} from '@/domain/entitlements';
import { fetchEntitlements } from '@/features/billing/entitlementsApi';

/** Free defaults, used while loading and for guests. */
const GUEST_FALLBACK: Entitlements = resolveEntitlements(null, null, DEFAULT_TIER_CONFIG);

/**
 * The current user's effective entitlements (limits, features, pricing). Backed by
 * react-query and keyed on the session so it refetches on sign-in/out. Never
 * suspends or throws — falls back to the free tier while loading / when offline.
 */
export const useEntitlements = (): Entitlements => {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? 'guest';
  const { data } = useQuery({
    queryKey: queryKeys.entitlements(userId),
    queryFn: fetchEntitlements,
    staleTime: 5 * 60_000,
  });
  return data ?? GUEST_FALLBACK;
};

/** Convenience: is a given premium feature available to the current user? */
export const useFeature = (feature: keyof TierFeatures): boolean =>
  useEntitlements().features[feature];

/** Convenience: the current user's limit for a resource (`null` = unlimited). */
export const useLimit = (limit: keyof TierLimits): number | null => useEntitlements().limits[limit];

/**
 * True once the server has responded at least once this session — i.e. `useEntitlements()`
 * is no longer returning the loading/guest fallback. Lets callers avoid treating "still
 * loading" as a real tier before the actual entitlements are known.
 */
export const useEntitlementsReady = (): boolean => {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? 'guest';
  const { isSuccess } = useQuery({
    queryKey: queryKeys.entitlements(userId),
    queryFn: fetchEntitlements,
    staleTime: 5 * 60_000,
  });
  return isSuccess;
};
