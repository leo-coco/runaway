/**
 * Result<T, E> — explicit success/failure without throwing.
 *
 * Services return `Result` so that callers handle errors as values. This keeps
 * try/catch out of components and makes error paths type-checked.
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;

/** Map the success value, passing errors through untouched. */
export const mapResult = <T, U, E>(r: Result<T, E>, fn: (value: T) => U): Result<U, E> =>
  r.ok ? ok(fn(r.value)) : r;

/** Unwrap or fall back to a default — for read paths where a default is sensible. */
export const unwrapOr = <T, E>(r: Result<T, E>, fallback: T): T => (r.ok ? r.value : fallback);
