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
import * as F from 'fluture'
import { PathReporter } from 'io-ts/lib/PathReporter'
import { constant, pipe } from 'fp-ts/lib/function'
import { readFile as readFile_ } from '@typescript-tools/lerna-utils'
import { lernaPackages as lernaPackages_, PackageDiscoveryError } from '@typescript-tools/lerna-packages'
import { PackageJsonDependencies } from '@typescript-tools/io-ts/dist/lib/PackageJsonDependencies'
import { LernaPackage } from '@typescript-tools/io-ts/dist/lib/LernaPackage'
import { PackageName } from '@typescript-tools/io-ts/dist/lib/PackageName'

// Temporary helper to infer types, see https://github.com/fluture-js/Fluture/issues/455
function map<RA, RB>(mapper: (value: RA) => RB):
  <L>(source: F.FutureInstance<L, RA>) => F.FutureInstance<L, RB> {
  return F.map (mapper)
}

// REFACTOR: move this to our io-ts package
export type PackageManifest =
    & LernaPackage
    & PackageJsonDependencies

export type DependencyGraphError =
    | PackageDiscoveryError
    | { type: 'unable to read file', file: string, err: NodeJS.ErrnoException }
    | { type: 'unable to parse file', file: string, err: Error }
    | { type: 'unexpected file contents', file: string, err: string }

// Widens the type of a particular DependencyGraphError into a DependencyGraphError
const error = (error: DependencyGraphError): DependencyGraphError => error

const lernaPackages = (root?: string): F.FutureInstance<DependencyGraphError, LernaPackage[]> => pipe(
    lernaPackages_(root),
    F.mapRej(error)
)

const readFile = (file: string): F.FutureInstance<DependencyGraphError, string> => pipe(
    readFile_(file),
    F.mapRej(err => error({ type: 'unable to read file', file, err }))
)

const parseJson = (file: string) => (contents: string): F.FutureInstance<DependencyGraphError, E.Json> => pipe(
    E.parseJSON(contents, E.toError),
    E.map(F.resolve),
    E.getOrElseW(err => F.reject(error({ type: 'unable to parse file', file, err })))
)

const decode = <C extends t.Mixed>(codec: C) => (file: string) => (value: unknown): F.FutureInstance<DependencyGraphError, t.TypeOf<C>> => pipe(
    codec.decode(value),
    E.mapLeft(errors => PathReporter.report(E.left(errors)).join('\n')),
    E.map(F.resolve),
    E.getOrElseW(err => F.reject(error({ type: 'unexpected file contents', file, err })))
)

/**
 * Generate a DAG of internal dependencies.
 */
export function dependencyGraph(
    root?: string,
): F.FutureInstance<DependencyGraphError, Map<PackageName, PackageManifest[]>> {

    return pipe(
        lernaPackages(root),
        F.chain(packages => pipe(
            packages,
            // REFACTOR: use These to report all errors instead of just the first
            A.map(pkg => pipe(
                path.resolve(pkg.location, 'package.json'),
                readFile,
                F.chain(parseJson(pkg.location)),
                F.chain(decode (PackageJsonDependencies) (pkg.location)),
                map(manifest => ({ ...pkg, ...manifest }))
            )),
            F.parallel(Infinity),
        )),
        map(manifests => {

            // map of a package name to its metadata
            const internalPackages = manifests.reduce(
                (acc, pkg) => Object.assign(acc, { [pkg.name]: pkg }),
                {} as { [packageName: string]: PackageManifest }
            )

            // map of a package name to its internal dependencies
            const internalDependencies = manifests.reduce(
                (acc, manifest) => Object.assign(
                    acc,
                    {
                        [manifest.name]: pipe(
                            [
                                ...Object.keys(manifest.dependencies ?? {}),
                                ...Object.keys(manifest.devDependencies ?? {}),
                                ...Object.keys(manifest.optionalDependencies ?? {}),
                                ...Object.keys(manifest.peerDependencies ?? {}),
                            ],
                            A.chain(dependency => pipe(
                                R.lookup (dependency) (internalPackages),
                                O.map(A.of),
                                O.getOrElseW(constant(A.empty)),
                            )),
                        )
                    }
                ),
                {} as { [packageName: string]: PackageManifest[] }
            )

            const allInternalDependencies = (pkg: string): PackageManifest[] => {
                const processed = new Set<string>()
                const deps: PackageManifest[] = []
                let next = internalDependencies[pkg]

                do {
                    next.forEach(dependency => {
                        processed.add(dependency.name)
                        deps.push(dependency)
                    })
                    next = pipe(
                        next,
                        A.chain(dependency => internalDependencies[dependency.name] ?? []),
                        A.filter(dependency => !processed.has(dependency.name))
                    )
                } while (!A.isEmpty(next))

                return deps
            }

            return manifests.reduce(
                (acc, { name }) => (acc.set(name, allInternalDependencies(name)), acc),
                new Map<PackageName, PackageManifest[]>()
            )
        }),
    )
}

// TODO: record who's using this so we know when it is safe to delete it
/**
 * A hack for libraries not using the same version of fluture.
 */
export const dependencyGraphPromise = (root: string) => F.promise(
    dependencyGraph(root)
        .pipe(F.mapRej(left => new Error(`${left}`)))
)
