import * as A from 'fp-ts/Array'
import * as E from 'fp-ts/Either'
import * as O from 'fp-ts/Option'
import * as R from 'fp-ts/Record'
import * as TE from 'fp-ts/TaskEither'
import { contramap, ordNumber, getDualOrd } from 'fp-ts/Ord'
import { pipe } from 'fp-ts/function'
import {
  packageManifests,
  PackageManifestsError,
} from '@typescript-tools/package-manifests'
import { PackageName } from '@typescript-tools/io-ts/dist/lib/PackageName'
import { PackageVersion } from '@typescript-tools/io-ts/dist/lib/PackageVersion'
import { PackageJsonDependencies } from '@typescript-tools/io-ts/dist/lib/PackageJsonDependencies'

export { PackageManifestsError } from '@typescript-tools/package-manifests'

/**
 * Note: this departs from the canonical lerna hoisting algorithm
 * found here:
 * https://github.com/lerna/lerna/blob/72414ec1c679cf8a7ae4bfcefce52d50a6120a70/commands/bootstrap/index.js#L371
 *
 * Changes:
 * - "tied" packages are not hoisted
 *     - if external package A is used in 1 internal package and
 *       package B is used in 1 internal package, neither is considered
 *       hoisted.
 */
export function hoistedPackages(
  // REFACTOR: have hoistedPackages determine the monorepo root
  root: string,
): TE.TaskEither<PackageManifestsError, Map<PackageName, PackageVersion>> {
  return pipe(
    packageManifests(root),
    TE.map((packages) => {
      /**
       * Map of dependencies to install
       *
       * Map {
       *   "<externalName>": Map {
       *     "<versionRange>": Set { "<dependent1>", "<dependent2>", ... }
       *   }
       * }
       *
       * Example:
       *
       * Map {
       *   "react": Map {
       *     "15.x": Set { "my-component1", "my-component2", "my-component3" },
       *     "^0.14.0": Set { "my-component4" },
       *   }
       * }
       */
      const depsToInstall = packages.reduce((acc, manifest) => {
        pipe(
          PackageJsonDependencies.decode(manifest.contents),
          // BUG(io-ts): why are these decoded records not typed?
          E.map((json) =>
            Object.assign(
              {} as Record<PackageName, PackageVersion>,
              json.dependencies,
              json.devDependencies,
              json.optionalDependencies,
              json.peerDependencies,
            ),
          ),
          E.map(
            R.mapWithIndex((name: PackageName, version: PackageVersion) => {
              const dependency = pipe(
                O.fromNullable(acc.get(name)),
                O.getOrElse(() => acc.set(name, new Map()).get(name)!),
              )
              const version_ = pipe(
                O.fromNullable(dependency.get(version)),
                O.getOrElse(() => dependency.set(version, new Set()).get(version)!),
              )
              version_.add(manifest.package.name)
            }),
          ),
        )
        return acc
      }, new Map<PackageName, Map<PackageVersion, Set<string>>>())

      return Array.from(depsToInstall).reduce(
        (acc, [dependencyName, dependencyVersions]) => {
          const frequencies = pipe(
            Array.from(dependencyVersions.keys()),
            A.map((version) => ({
              version,
              frequency: dependencyVersions.get(version)?.size ?? 0,
            })),
            A.sort(
              contramap(({ frequency }: { frequency: number }) => frequency)(
                getDualOrd(ordNumber),
              ),
            ),
          )
          // Only a non-ambiguous mode can be hoisted
          if (frequencies[0].frequency > (frequencies[1]?.frequency ?? 0)) {
            acc.set(dependencyName, frequencies[0].version)
          }
          return acc
        },
        new Map<PackageName, PackageVersion>(),
      )
    }),
  )
}
