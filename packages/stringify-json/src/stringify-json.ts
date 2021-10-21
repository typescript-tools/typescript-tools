/**
 * stringify-json
 * Stringify JSON for file writes
 */

import * as E from 'fp-ts/Either'

/**
 * Stringify `value` as JSON, with `space`-space indention.
 */
export const stringifyJSON = <E>(onError: (reason: unknown) => E, space = 2) => (
  value: unknown,
): E.Either<E, string> =>
  E.tryCatch(() => JSON.stringify(value, null, space) + '\n', onError)
