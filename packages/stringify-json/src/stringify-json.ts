/**
 * stringify-json
 * Stringify JSON for file writes
 */

import * as E from 'fp-ts/Either'

/**
 * Stringify `value` as JSON, with `space`-space indention.
 */
export function stringifyJSON<E>(
    value: unknown,
    onError: (reason: unknown) => E,
    space = 4
): E.Either<E, string> {
    return E.tryCatch(() => JSON.stringify(value, null, space) + '\n', onError)
}
