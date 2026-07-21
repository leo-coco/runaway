import type { z } from 'zod';
import { appError, type AppError } from '@/domain/errors';
import { err, ok, type Result } from '@/domain/result';

/**
 * Thin fetch wrapper that returns a typed Result and validates the body with Zod.
 * No raw response ever escapes this layer: callers receive parsed domain-shaped data.
 */
export interface GetJsonOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT = 12_000;

export const getJson = async <T>(
  url: string,
  schema: z.ZodType<T>,
  options: GetJsonOptions = {},
): Promise<Result<T, AppError>> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT);
  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let response: Response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
  } catch (cause) {
    clearTimeout(timeout);
    // Checked by name, not `instanceof DOMException`: the class is per-realm, so
    // the instance check silently fails whenever fetch and the global come from
    // different realms (jsdom + undici under test, some SSR/polyfill setups).
    const aborted = cause instanceof Error && cause.name === 'AbortError';
    return err(
      appError(
        'network',
        aborted
          ? 'The request timed out. Check your connection and try again.'
          : 'Could not reach the data provider. Check your connection and try again.',
        cause,
      ),
    );
  }
  clearTimeout(timeout);

  if (response.status === 429) {
    return err(
      appError('rate_limit', 'The data provider is rate-limiting requests. Try again shortly.'),
    );
  }
  if (!response.ok) {
    return err(appError('http', `The data provider returned an error (HTTP ${response.status}).`));
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (cause) {
    return err(appError('parse', 'The data provider returned a malformed response.', cause));
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return err(
      appError('parse', 'The data provider returned data in an unexpected format.', parsed.error),
    );
  }
  return ok(parsed.data);
};
