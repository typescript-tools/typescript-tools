/**
 * lerna-packages
 * Discover internal packages
 */

import * as t from 'io-ts'
import * as E from 'fp-ts/Either'
import * as TE from 'fp-ts/TaskEither'
import * as PathReporter from 'io-ts/lib/PathReporter'
import { pipe } from 'fp-ts/function'
import {
  monorepoRoot as monorepoRoot_,
  MonorepoRootError,
} from '@typescript-tools/monorepo-root'
import { LernaPackage } from '@typescript-tools/io-ts/dist/lib/LernaPackage'
import { StringifiedJSON } from '@typescript-tools/io-ts/dist/lib/StringifiedJSON'
import execa from 'execa'

export type PackageDiscoveryError =
  | MonorepoRootError
  | { type: 'unable to discover internal packages'; error: unknown }
  | { type: 'unable to decode list of packages'; error: string }

// Widens the type of a particular Err into an Err
const err = (error: PackageDiscoveryError): PackageDiscoveryError => error

const monorepoRoot = (path?: string): E.Either<PackageDiscoveryError, string> =>
  pipe(monorepoRoot_(path), E.mapLeft(err))

const decodeLernaPackages = (
  packages: string,
): TE.TaskEither<PackageDiscoveryError, LernaPackage[]> =>
  pipe(
    StringifiedJSON(t.array(LernaPackage)).decode(packages),
    E.mapLeft((errors) => PathReporter.failure(errors).join('\n')),
    E.mapLeft((error) => err({ type: 'unable to decode list of packages', error })),
    TE.fromEither,
  )

/**
 * Search the monorepo and enumerate all internal packages.
 */
export function lernaPackages(
  findRootFrom?: string,
): TE.TaskEither<PackageDiscoveryError, LernaPackage[]> {
  return pipe(
    E.fromNullable(
      err({ type: 'unable to discover internal packages', error: 'absurd' }),
    )(findRootFrom),
    E.chain(monorepoRoot),
    E.orElse(() => monorepoRoot()),
    TE.fromEither,
    TE.chain((root) =>
      TE.tryCatch(
        () => execa.command('npx lerna list --all --json', { cwd: root }),
        (error) => err({ type: 'unable to discover internal packages', error }),
      ),
    ),
    TE.map(({ stdout }) => stdout),
    TE.chain(decodeLernaPackages),
    TE.mapLeft(err),
  )
}
