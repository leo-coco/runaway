import type { AppError } from '@/domain/errors';
import { AlertIcon } from '@/components/icons';

/** Compact, actionable error banner for failed data loads. */
export const InlineError = ({ error }: { error: AppError }) => (
  <div className="inline-alert" role="alert">
    <AlertIcon size={16} />
    <span>{error.message}</span>
  </div>
);
