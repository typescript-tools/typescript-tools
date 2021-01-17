/**
 * monorepo-root
 * Find the monorepo root directory
 */

import * as path from 'path'
import findUp from 'find-up'
import * as E from 'fp-ts/Either'
import { pipe, constant } from 'fp-ts/function'

// REFACTOR: TODO: rename this to ...Error
export type MonorepoRootErr =
    | { type: 'cannot find lerna manifest upwards from known path', path: string }

const err = (path: string): MonorepoRootErr => ({
    type: 'cannot find lerna manifest upwards from known path',
    path
})

const findup = (target: string, cwd: string) => pipe(
    findUp.sync(target, { cwd, type: 'file' }),
    E.fromNullable(err(cwd)),
    E.map(path.dirname)
)

/**
 * Find the monorepo root directory, searching upwards from `path`.
 */
export function monorepoRoot(
    path?: string
): E.Either<MonorepoRootErr, string> {
    return pipe(
        E.fromNullable (err('')) (path),
        E.chain(from => findup('lerna.json', from)),
        E.alt(
            () => pipe(
                findup('lerna.json', process.cwd()),
                E.mapLeft(constant(err(process.cwd())))
            )
        )
    )
}
