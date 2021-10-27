/**
 * depender-graph
 * Generate depender graph of internal packages
 */

import * as path from 'path'

import {
  LernaPackage,
  PackageJsonDependencies,
  PackageName,
  StringifiedJSON,
} from '@typescript-tools/io-ts'
import {
  lernaPackages as lernaPackages_,
  PackageDiscoveryError,
} from '@typescript-tools/lerna-packages'
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

export type DependerGraphError =
  | PackageDiscoveryError
  | {
      type: 'unable to read file'
      filename: string
      error: NodeJS.ErrnoException
    }
  | { type: 'unexpected file contents'; filename: string; error: string }

// Widens the type of a particular DependerGraphError into a DependerGraphError
const err = (error: DependerGraphError): DependerGraphError => error

const lernaPackages = flow(lernaPackages_, TE.mapLeft(err))

const readFile = (filename: string) =>
  pipe(
    readFile_(filename),
    TE.mapLeft((error) => err({ type: 'unable to read file', filename, error })),
  )

const decode = <C extends t.Mixed>(codec: C) => (filename: string) => (
  value: unknown,
): TE.TaskEither<DependerGraphError, t.TypeOf<C>> =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  pipe(
    codec.decode(value),
    E.mapLeft((errors) => PathReporter.failure(errors).join('\n')),
    E.mapLeft((error) => err({ type: 'unexpected file contents', filename, error })),
    TE.fromEither,
  )

/**
 * Generate a DAG of internal dependers.
 */
export function dependerGraph(
  {
    root,
    recursive,
  }: {
    root?: string
    recursive?: boolean
  } = {
    recursive: true,
  },
): TE.TaskEither<DependerGraphError, Map<PackageName, PackageManifest[]>> {
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

      // map of a package name to its (direct) internal dependers
      const internalDependers = manifests.reduce(
        (acc, manifest) =>
          pipe(
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
            // this is direct dependencies
            (dependencies) => {
              for (const dependency of dependencies) {
                acc[dependency.name] = pipe(
                  O.fromNullable(acc[dependency.name]),
                  O.map((dependers) => (dependers.push(manifest), dependers)),
                  O.getOrElse(() => [manifest]),
                )
              }
            },
            () => acc,
          ),
        {} as { [packageName: string]: PackageManifest[] },
      )

      // NOTE: the types in this file may be kinda janky, it's
      // copy-pasta from dependency-graph.ts with the exception of
      // the implementation of `internalDependencies`
      const allInternalDependers = (pkg: string): PackageManifest[] => {
        const processed = new Set<string>()
        const deps: PackageManifest[] = []
        let next = internalDependers[pkg] ?? []

        do {
          next.forEach((dependency) => {
            processed.add(dependency.name)
            deps.push(dependency)
          })
          next = pipe(
            next,
            A.chain(
              (dependency) =>
                (recursive === true ? internalDependers[dependency.name] : []) ?? [],
            ),
            A.filter((dependency) => !processed.has(dependency.name)),
          )
        } while (!A.isEmpty(next))

        return deps
      }

      return manifests.reduce(
        (acc, { name }) => (acc.set(name, allInternalDependers(name)), acc),
        new Map<PackageName, PackageManifest[]>(),
      )
    }),
  )
}

//  LocalWords:  dependers
