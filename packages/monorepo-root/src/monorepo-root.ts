/**
 * monorepo-root
 * Find the monorepo root directory
 */

import * as path from 'path'
import findUp from 'find-up'
import * as E from 'fp-ts/Either'
import { pipe, constant } from 'fp-ts/function'

export type MonorepoRootError =
    | { type: 'cannot find lerna manifest upwards from known path', path: string }

const err = (path: string): MonorepoRootError => ({
    type: 'cannot find lerna manifest upwards from known path',
    path
})

const findup = (target: string, cwd: string) => pipe(
    // FIXME: this should be async
    findUp.sync(target, { cwd, type: 'file' }),
    E.fromNullable(err(cwd)),
    E.map(path.dirname)
)

/**
 * Find the monorepo root directory, searching upwards from `path`.
 */
export function monorepoRoot(
    pathInsideMonorepo?: string
): E.Either<MonorepoRootError, string> {
    return pipe(
        E.fromNullable (err('')) (pathInsideMonorepo),
        E.chain(from => findup('lerna.json', from)),
        E.alt(
            () => pipe(
                findup('lerna.json', process.cwd()),
                E.mapLeft(constant(err(process.cwd())))
            )
        )
    )
}
