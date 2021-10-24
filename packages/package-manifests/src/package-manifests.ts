/**
 * package-manifests
 * Read every package's package.json
 */

import * as path from 'path'

import { LernaPackage } from '@typescript-tools/io-ts/dist/lib/LernaPackage'
import {
  lernaPackages as lernaPackages_,
  PackageDiscoveryError,
} from '@typescript-tools/lerna-packages'
import { readFile as readFile_ } from '@typescript-tools/lerna-utils'
import {
  monorepoRoot as monorepoRoot_,
  MonorepoRootError,
} from '@typescript-tools/monorepo-root'
import * as E from 'fp-ts/Either'
import * as TE from 'fp-ts/TaskEither'
import { pipe, flow } from 'fp-ts/function'

export type PackageManifestsError =
  | MonorepoRootError
  | PackageDiscoveryError
  | { type: 'unable to read file'; filename: string; error: NodeJS.ErrnoException }
  | { type: 'unable to parse json'; filename: string; error: Error }

// Widens the type of a particular DependencyGraphError into a DependencyGraphError
const err = (error: PackageManifestsError): PackageManifestsError => error

const monorepoRoot = flow(monorepoRoot_, E.mapLeft(err), TE.fromEither)
const lernaPackages = flow(lernaPackages_, TE.mapLeft(err))

const readFile = (filename: string) =>
  pipe(
    readFile_(filename),
    TE.mapLeft((error) => err({ type: 'unable to read file', filename, error })),
  )

const packageJson = (lernaPackage: LernaPackage) =>
  path.resolve(lernaPackage.location, 'package.json')

export const packageManifest = (
  lernaPackage: LernaPackage,
): TE.TaskEither<PackageManifestsError, { package: LernaPackage; contents: E.Json }> =>
  pipe(
    readFile(packageJson(lernaPackage)),
    TE.chain((contents) =>
      pipe(
        E.parseJSON(contents, E.toError),
        E.map((contents) => ({ package: lernaPackage, contents })),
        E.mapLeft((error) =>
          err({
            type: 'unable to parse json',
            filename: packageJson(lernaPackage),
            error,
          }),
        ),
        TE.fromEither,
      ),
    ),
  )

export function packageManifests(
  somePathInMonorepo?: string,
): TE.TaskEither<
  PackageManifestsError,
  ReadonlyArray<{ package: LernaPackage; contents: E.Json }>
> {
  return pipe(
    monorepoRoot(somePathInMonorepo),
    TE.chain(lernaPackages),
    TE.chain(TE.traverseArray(packageManifest)),
  )
}
