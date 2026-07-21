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
import { useAppMode } from '@/providers/AppModeContext';

/** Free defaults, used only while the live tier config is loading or unavailable. */
const GUEST_FALLBACK: Entitlements = resolveEntitlements(null, null, DEFAULT_TIER_CONFIG);

export const loadEntitlements = async (sandbox: boolean): Promise<Entitlements> => {
  try {
    return await fetchEntitlements(sandbox);
  } catch {
    return GUEST_FALLBACK;
  }
};

/**
 * The current user's effective entitlements (limits, features, pricing). Backed by
 * react-query and keyed on the session so it refetches on sign-in/out. Never
 * suspends or throws — falls back to the free tier while loading / when offline.
 */
export const useEntitlements = (): Entitlements => {
  const { data: session } = useSession();
  const { sandbox } = useAppMode();
  const userId = sandbox ? 'sandbox' : (session?.user?.id ?? 'guest');
  const { data } = useQuery({
    queryKey: queryKeys.entitlements(userId),
    queryFn: () => loadEntitlements(sandbox),
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
 * True once the entitlements query has settled — succeeded, or given up retrying
 * and failed — so callers waiting on the real tier don't gate on it forever. A
 * failure still means `useEntitlements()` returns the free-tier fallback, same as
 * while loading; this only unblocks callers that treat "loading" as "not yet
 * known" (e.g. the app shell holding a splash screen until the tier is settled).
 */
export const useEntitlementsReady = (): boolean => {
  const { data: session } = useSession();
  const { sandbox } = useAppMode();
  const userId = sandbox ? 'sandbox' : (session?.user?.id ?? 'guest');
  const { isSuccess, isError } = useQuery({
    queryKey: queryKeys.entitlements(userId),
    queryFn: () => loadEntitlements(sandbox),
    staleTime: 5 * 60_000,
  });
  return isSuccess || isError;
};
