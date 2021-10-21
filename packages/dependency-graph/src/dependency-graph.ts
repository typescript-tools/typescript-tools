/**
 * dependency-graph
 * Generate dependency graph of internal packages
 */

import * as t from 'io-ts'
import * as path from 'path'
import * as A from 'fp-ts/Array'
import * as O from 'fp-ts/Option'
import * as E from 'fp-ts/Either'
import * as R from 'fp-ts/Record'
import * as TE from 'fp-ts/TaskEither'
import * as PathReporter from 'io-ts/lib/PathReporter'
import { constant, pipe, flow } from 'fp-ts/lib/function'
import { readFile as readFile_ } from '@typescript-tools/lerna-utils'
import {
  lernaPackages as lernaPackages_,
  PackageDiscoveryError,
} from '@typescript-tools/lerna-packages'
import { PackageJsonDependencies } from '@typescript-tools/io-ts/dist/lib/PackageJsonDependencies'
import { LernaPackage } from '@typescript-tools/io-ts/dist/lib/LernaPackage'
import { PackageName } from '@typescript-tools/io-ts/dist/lib/PackageName'
import { StringifiedJSON } from '@typescript-tools/io-ts/dist/lib/StringifiedJSON'

// REFACTOR: move this to our io-ts package
export type PackageManifest = LernaPackage & PackageJsonDependencies

export type DependencyGraphError =
  | PackageDiscoveryError
  | { type: 'unable to read file'; filename: string; error: NodeJS.ErrnoException }
  | { type: 'unexpected file contents'; filename: string; error: string }

// Widens the type of a particular DependencyGraphError into a DependencyGraphError
const err = (error: DependencyGraphError): DependencyGraphError => error

const lernaPackages = flow(lernaPackages_, TE.mapLeft(err))

const readFile = (filename: string) =>
  pipe(
    readFile_(filename),
    TE.mapLeft((error) => err({ type: 'unable to read file', filename, error })),
  )

const decode = <C extends t.Mixed>(codec: C) => (filename: string) => (
  value: unknown,
): TE.TaskEither<DependencyGraphError, t.TypeOf<C>> =>
  pipe(
    codec.decode(value),
    E.mapLeft((errors) => PathReporter.failure(errors).join('\n')),
    E.mapLeft((error) => err({ type: 'unexpected file contents', filename, error })),
    TE.fromEither,
  )

/**
 * Generate a DAG of internal dependencies.
 */
export function dependencyGraph(
  root?: string,
  options: { recursive: boolean } = { recursive: true },
): TE.TaskEither<DependencyGraphError, Map<PackageName, PackageManifest[]>> {
  return pipe(
    lernaPackages(root),
    TE.chain((packages) =>
      pipe(
        packages,
        // REFACTOR: use These to report all errors instead of just the first
        A.map((pkg) =>
          pipe(
            path.resolve(pkg.location, 'package.json'),
            readFile,
            TE.chain(decode(StringifiedJSON(PackageJsonDependencies))(pkg.location)),
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
                (options.recursive ? internalDependencies[dependency.name] : []) ?? [],
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
