/**
 * lerna-utils
 * Internal utilities for interacting with a lerna monorepo
 */

import * as path from 'path'
import * as fs from 'fs'
import * as t from 'io-ts'
import * as A from 'fp-ts/Array'
import * as E from 'fp-ts/Either'
import * as O from 'fp-ts/Option'
import * as NEA from 'fp-ts/NonEmptyArray'
import * as F from 'fluture'
import * as most from 'most'
import execa from 'execa'
import buffer from 'most-buffer'
import { constant, flow, pipe } from 'fp-ts/lib/function'
import { get } from 'shades'
import { LernaPackage } from '@typescript-tools/io-ts/dist/lib/LernaPackage'
import { StringifiedJSON } from '@typescript-tools/io-ts/dist/lib/StringifiedJSON'
import { PackageJsonDependencies } from '@typescript-tools/io-ts/dist/lib/PackageJsonDependencies'

export type DependencyGraph = { [packageName: string]: LernaPackage[] }

export const readFile = (file: fs.PathLike): F.FutureInstance<NodeJS.ErrnoException, string> =>
    F.node(done => fs.readFile(file, 'utf8', done))

export const writeFile = (file: fs.PathLike) => (contents: string): F.FutureInstance<NodeJS.ErrnoException, void> =>
    F.node(done => fs.writeFile(file, contents, done))

export const fromFuture = <L extends Error, R>(future: F.FutureInstance<L, R>): most.Stream<R> =>
    most.fromPromise(F.promise(future))

// TODO: pull into its own external package
/* eslint-disable @typescript-eslint/no-explicit-any */
export function trace(
    logger: typeof console.log,
    ...tag: any[]
): <T>(value: T) => T {
    return function trace<T>(value: T): T {
        if (tag.length > 0) {
            logger(...tag, value)
        } else {
            logger(value)
        }
        return value
    }
}

// TODO: pull into its own package
export function prettyStringifyJson<E>(
    u: unknown,
    onError: (reason: unknown) => E
): E.Either<E, string> {
    return E.tryCatch(() => JSON.stringify(u, null, 4) + '\n', onError)
}

// TODO: pull into its own package
/**
 * Get list of all lerna packages from `lerna list --all`.
 */
export function lernaPackages(
    root: string
): F.FutureInstance<unknown, LernaPackage[]> {
    return F.Future((reject, resolve) => {

        const subcommand = execa.command(
            'npx lerna list --all --json',
            { cwd: root }
        )

        subcommand
            .then(({ stdout }) => pipe(
                stdout,
                StringifiedJSON(t.array(LernaPackage)).decode.bind(null),
                E.fold(reject, resolve)
            ))
            .catch(reject)

        return function onCancel() {
            subcommand.cancel()
        }
    })
}

// TODO: pull into its own package
export function packagePackageJsons(
    root: string
): F.FutureInstance<unknown,{
    pkg: LernaPackage,
    contents: E.Json
}[]> {
    return lernaPackages(root)
        .pipe(F.chain(
            flow(
                A.map(pkg =>
                    readFile(path.resolve(pkg.location, 'package.json'))
                        .pipe(F.chain(contents => pipe(
                            E.parseJSON(contents, E.toError),
                            E.map(contents => F.resolve({pkg, contents})),
                            E.getOrElseW(error => F.reject(`Unable to parse ${pkg.location}/package.json, ${error.message}`))
                        )))
                     ),
                F.parallel(200)
            )
        ))
}

// TODO: pull into its own package
// TODO: rename to denote that this only graphs internal dependencies
export function dependencyGraph(
    root: string
): F.FutureInstance<unknown, DependencyGraph> {

    // REFACTOR: use packagePackageJsons here, `most` is not necessary
    return lernaPackages(root)
        .pipe(F.chain(
            packages => F.attemptP(
                async () => most.from(packages)
                // parse each package's package.json file
                    .chain(
                        pkg => most.of(pkg.location)
                            .map(dir => path.resolve(dir, 'package.json'))
                            .map(readFile)
                            .chain(fromFuture)
                            .map(contents => pipe(
                                E.parseJSON(contents, E.toError),
                                E.mapLeft(error => `Unable to parse ${pkg.location}/package.json, ${error.message}`),
                                E.map(contents => ({pkg, contents}))
                            ))
                    )
                    .thru(buffer())
                // report all parse errors, if any
                    .chain(results => pipe(
                        NEA.fromArray(A.lefts(results)),
                        O.fold(
                            () => most.of(A.rights(results)),
                            // Nasty type assertion, but at least it'll complain if we change the type of the above line
                            failures => most.throwError(new Error([`Aborting, errors encountered:`].concat(failures).join('\n'))) as most.Stream<Array<{pkg: LernaPackage, contents: E.Json}>>
                        )
                    ))
                // map package's package.json file into a list of internal dependencies
                    .map(packages => {

                        // map of a package name to its metadata
                        const internalPackages = packages
                            .map(get('pkg'))
                            .reduce(
                                (acc, pkg) => Object.assign(acc, {[pkg.name]: pkg}),
                                {} as { [packageName: string]: LernaPackage }
                            )

                        // map of a package name to its internal dependencies
                        const internalDependencies = packages
                            .reduce(
                                (acc, {pkg, contents}) => Object.assign(
                                    acc,
                                    {
                                        [pkg.name]: pipe(
                                            PackageJsonDependencies.decode(contents),
                                            E.map(contents => [
                                                ...Object.keys(contents.dependencies ?? {}),
                                                ...Object.keys(contents.devDependencies ?? {}),
                                                ...Object.keys(contents.optionalDependencies ?? {}),
                                                ...Object.keys(contents.peerDependencies ?? {}),
                                            ]),
                                            E.map(A.filter(dependency => internalPackages.hasOwnProperty(dependency))),
                                            E.getOrElse(constant([] as string[])),
                                            A.map(dependency => internalPackages[dependency])
                                        )
                                    }
                                ),
                                {} as { [packageName: string]: LernaPackage[] }
                            )

                        // Recursively list all internal dependencies, even transitive ones
                        const allInternalDependencies = (pkg: string): LernaPackage[] => {
                            const processed = new Set<string>()
                            const deps: LernaPackage[] = []
                            let next = internalDependencies[pkg]

                            do {
                                next.forEach(dependency => {
                                    processed.add(dependency.name)
                                    deps.push(dependency)
                                })
                                next = pipe(
                                    next,
                                    A.map(dependency => internalDependencies[dependency.name] ?? []),
                                    A.flatten,
                                    A.filter(dependency => !processed.has(dependency.name))
                                )
                            } while (!A.isEmpty(next))

                            return deps
                        }

                        return packages.reduce(
                            (acc, {pkg}) => Object.assign(
                                acc,
                                { [pkg.name]: allInternalDependencies(pkg.name) }
                            ),
                            {} as { [packageName: string]: LernaPackage[] }
                        )
                    })
                // stream only emits a single value
                    .reduce(
                        (_, value) => value,
                        {} as { [packageName: string]: LernaPackage[] }
                    )
            )
        ))
}
