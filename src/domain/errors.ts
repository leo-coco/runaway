/** Typed application error. Discriminated by `kind` so the UI can react precisely. */
export type AppErrorKind =
  | 'network' // request failed / offline / timeout
  | 'http' // non-2xx response
  | 'parse' // response did not match the expected Zod schema
  | 'rate_limit' // provider throttled us
  | 'not_configured' // a required API key is missing
  | 'not_found' // symbol/asset not found
  | 'unknown';

export interface AppError {
  readonly kind: AppErrorKind;
  /** Human-readable, actionable message safe to show in the UI. */
  readonly message: string;
  /** Optional machine context for logging (never rendered raw). */
  readonly cause?: unknown;
}

export const appError = (kind: AppErrorKind, message: string, cause?: unknown): AppError => ({
  kind,
  message,
  cause,
});
