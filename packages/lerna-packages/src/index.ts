/**
 * lerna-packages
 * Discover internal packages
 */

import * as t from 'io-ts'
import * as F from 'fluture'
import * as E from 'fp-ts/Either'
import { pipe, absurd } from 'fp-ts/function'
import { PathReporter } from 'io-ts/lib/PathReporter'
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

const decodeLernaPackages = (packages: string): E.Either<PackageDiscoveryError, LernaPackage[]> => pipe(
    StringifiedJSON(t.array(LernaPackage)).decode(packages),
    E.mapLeft(errors => PathReporter.report(E.left(errors)).join('\n')),
    E.mapLeft(err => error({ type: 'unable to decode list of packages', err })),
)

/**
 * Search the monorepo and enumerate all internal packages.
 */
export function lernaPackages(
    root?: string,
): F.FutureInstance<PackageDiscoveryError, LernaPackage[]> {

    return pipe(
        E.fromNullable (absurd) (root),
        E.orElse(monorepoRoot),
        E.map(root => F.Future<PackageDiscoveryError, LernaPackage[]>((reject, resolve) => {

            const subcommand = execa.command(
                'npx lerna list --all --json',
                { cwd: root }
            )

            subcommand
                .then(({ stdout }) => pipe(
                    decodeLernaPackages(stdout),
                    E.fold(reject, resolve)
                ))
                .catch(err => reject(error({ type: 'unable to discover internal packages', err })))

            return function onCancel() {
                subcommand.cancel()
            }
        })),
        E.mapLeft(error),
        E.getOrElseW(F.reject)
    )
}
