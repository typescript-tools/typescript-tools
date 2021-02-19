/**
 * lerna-packages
 * Discover internal packages
 */

import * as t from 'io-ts'
import * as E from 'fp-ts/Either'
import * as TE from 'fp-ts/TaskEither'
import * as PathReporter from 'io-ts/lib/PathReporter'
import { pipe, absurd } from 'fp-ts/function'
import { monorepoRoot as monorepoRoot_, MonorepoRootErr } from '@typescript-tools/monorepo-root'
import { LernaPackage } from '@typescript-tools/io-ts/dist/lib/LernaPackage'
import { StringifiedJSON } from '@typescript-tools/io-ts/dist/lib/StringifiedJSON'
import execa from 'execa'

export type PackageDiscoveryError =
    | MonorepoRootErr
    | { type: 'unable to discover internal packages', err: unknown }
    | { type: 'unable to decode list of packages', err: string }

// Widens the type of a particular Err into an Err
const error = (error: PackageDiscoveryError): PackageDiscoveryError => error

const monorepoRoot = (): E.Either<PackageDiscoveryError, string> => pipe(
    monorepoRoot_(),
    E.mapLeft(error),
)

const decodeLernaPackages = (packages: string): TE.TaskEither<PackageDiscoveryError, LernaPackage[]> => pipe(
    StringifiedJSON(t.array(LernaPackage)).decode(packages),
    E.mapLeft(errors => PathReporter.failure(errors).join('\n')),
    E.mapLeft(err => error({ type: 'unable to decode list of packages', err })),
    TE.fromEither,
)

/**
 * Search the monorepo and enumerate all internal packages.
 */
export function lernaPackages(
    root?: string,
): TE.TaskEither<PackageDiscoveryError, LernaPackage[]> {

    return pipe(
        E.fromNullable (absurd) (root),
        E.orElse(monorepoRoot),
        TE.fromEither,
        TE.chain(root => TE.tryCatch(
            () => execa.command('npx lerna list --all --json', { cwd: root }),
            err => error({ type: 'unable to discover internal packages', err }),
        )),
        TE.map(({ stdout }) => stdout),
        TE.chain(decodeLernaPackages),
        TE.mapLeft(error),
    )
}
