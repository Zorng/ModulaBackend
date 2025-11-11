// Result/Either pattern for functional error handling
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export const isOk = <T, E>(
  result: Result<T, E>
): result is { ok: true; value: T } => result.ok === true;

export const isErr = <T, E>(
  result: Result<T, E>
): result is { ok: false; error: E } => result.ok === false;
