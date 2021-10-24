/**
 * dependency-graph
 * Generate dependency graph of internal packages
 */

import * as path from 'path'

import {
  LernaPackage,
  PackageJsonDependencies,
  PackageName,
  StringifiedJSON,
} from '@typescript-tools/io-ts'
import { lernaPackages, PackageDiscoveryError } from '@typescript-tools/lerna-packages'
import { readFile as readFile_ } from '@typescript-tools/lerna-utils'
import * as A from 'fp-ts/Array'
import * as E from 'fp-ts/Either'
import * as O from 'fp-ts/Option'
import * as R from 'fp-ts/Record'
import * as TE from 'fp-ts/TaskEither'
import { constant, pipe, flow } from 'fp-ts/function'
import * as t from 'io-ts'
import * as PathReporter from 'io-ts/lib/PathReporter'

// REFACTOR: move this to our io-ts package
export type PackageManifest = LernaPackage & PackageJsonDependencies

type ReadFileError = {
  type: 'unable to read file'
  filename: string
  error: NodeJS.ErrnoException
}

type UnexpectedFileContentsError = {
  type: 'unexpected file contents'
  filename: string
  error: string
}

export type DependencyGraphError =
  | PackageDiscoveryError
  | ReadFileError
  | UnexpectedFileContentsError

const readFile = (filename: string) =>
  pipe(
    readFile_(filename),
    TE.mapLeft(
      (error): ReadFileError => ({ type: 'unable to read file', filename, error }),
    ),
  )

const decode = <C extends t.Mixed>(codec: C) => (filename: string) => (
  value: unknown,
): E.Either<UnexpectedFileContentsError, t.TypeOf<C>> =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  pipe(
    codec.decode(value),
    E.mapLeft(
      flow(
        (errors) => PathReporter.failure(errors).join('\n'),
        (error) => ({ type: 'unexpected file contents', filename, error }),
      ),
    ),
  )

/**
 * Generate a DAG of internal dependencies.
 */
export function dependencyGraph(
  {
    root,
    recursive,
  }: {
    root?: string
    recursive: boolean
  } = {
    recursive: true,
  },
): TE.TaskEither<DependencyGraphError, Map<PackageName, PackageManifest[]>> {
  return pipe(
    lernaPackages(root),
    TE.chainW((packages) =>
      pipe(
        packages,
        // REFACTOR: use These to report all errors instead of just the first
        A.map((pkg) =>
          pipe(
            path.resolve(pkg.location, 'package.json'),
            readFile,
            TE.chainEitherKW(
              decode(StringifiedJSON(PackageJsonDependencies))(pkg.location),
            ),
            TE.map((manifest) => ({ ...pkg, ...manifest })),
          ),
        ),
        TE.sequenceArray,
      ),
    ),
    TE.map((manifests) => {
      // map of a package name to its metadata
      const internalPackages = manifests.reduce(
        (acc, pkg) => Object.assign(acc, { [pkg.name]: pkg }),
        {} as { [packageName: string]: PackageManifest },
      )

      // map of a package name to its (direct) internal dependencies
      const internalDependencies = manifests.reduce(
        (acc, manifest) =>
          Object.assign(acc, {
            [manifest.name]: pipe(
              [
                ...Object.keys(manifest.dependencies ?? {}),
                ...Object.keys(manifest.devDependencies ?? {}),
                ...Object.keys(manifest.optionalDependencies ?? {}),
                ...Object.keys(manifest.peerDependencies ?? {}),
              ],
              A.chain((dependency) =>
                pipe(
                  R.lookup(dependency)(internalPackages),
                  O.map(A.of),
                  O.getOrElseW(constant(A.empty)),
                ),
              ),
            ),
          }),
        {} as { [packageName: string]: PackageManifest[] },
      )

      const allInternalDependencies = (pkg: string): PackageManifest[] => {
        const processed = new Set<string>()
        const deps: PackageManifest[] = []
        let next = internalDependencies[pkg] ?? []

        do {
          next.forEach((dependency) => {
            processed.add(dependency.name)
            deps.push(dependency)
          })
          next = pipe(
            next,
            A.chain(
              (dependency) =>
                (recursive ? internalDependencies[dependency.name] : []) ?? [],
            ),
            A.filter((dependency) => !processed.has(dependency.name)),
          )
        } while (!A.isEmpty(next))

        return deps
      }

      return manifests.reduce(
        (acc, { name }) => (acc.set(name, allInternalDependencies(name)), acc),
        new Map<PackageName, PackageManifest[]>(),
      )
    }),
  )
}
