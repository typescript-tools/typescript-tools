/**
 * dependency-graph
 * Generate dependency graph of internal packages
 */

import * as path from 'path'
import * as A from 'fp-ts/Array'
import * as O from 'fp-ts/Option'
import * as E from 'fp-ts/Either'
import * as F from 'fluture'
import * as NEA from 'fp-ts/NonEmptyArray'
import * as most from 'most'
import buffer from 'most-buffer'
import { constant, pipe } from 'fp-ts/lib/function'
import { get } from 'shades'
import { lernaPackages, readFile } from '@typescript-tools/lerna-utils'
import { PackageJsonDependencies } from '@typescript-tools/io-ts/dist/lib/PackageJsonDependencies'
import { LernaPackage } from '@typescript-tools/io-ts/dist/lib/LernaPackage'
import { PackageName } from '@typescript-tools/io-ts/dist/lib/PackageName'

// TODO: use Map over POJO for performance

const fromFuture = <L extends Error, R>(future: F.FutureInstance<L, R>): most.Stream<R> =>
    most.fromPromise(F.promise(future))

/**
 * Generate a DAG of internal dependencies.
 */
export function dependencyGraph(
    root: string
): F.FutureInstance<unknown, Map<PackageName, LernaPackage[]>> {

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
                                    A.chain(dependency => internalDependencies[dependency.name] ?? []),
                                    A.filter(dependency => !processed.has(dependency.name))
                                )
                            } while (!A.isEmpty(next))

                            return deps
                        }

                        return packages.reduce(
                            (acc, {pkg}) => (acc.set(pkg.name, allInternalDependencies(pkg.name)), acc),
                            new Map<PackageName, LernaPackage[]>()
                        )
                    })
                    // stream only emits a single value
                    .reduce((_, value) => value, new Map())
            )
        ))
}
