import type { ReactNode } from 'react';
import { useFeature } from '@/hooks/useEntitlements';
import type { TierFeatures } from '@/domain/entitlements';

/**
 * Render `children` only when the current user has `feature`; otherwise render
 * `fallback` (nothing by default). UI-only gate — the server independently enforces
 * limits, and the calc engines are never branched on tier.
 */
export const FeatureGate = ({
  feature,
  children,
  fallback = null,
}: {
  feature: keyof TierFeatures;
  children: ReactNode;
  fallback?: ReactNode;
}) => (useFeature(feature) ? <>{children}</> : <>{fallback}</>);
