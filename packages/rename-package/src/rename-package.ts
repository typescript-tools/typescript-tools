#!/usr/bin/env node

/**
 * rename-package
 * Rename an internal package
 */

import * as path from 'path'
import * as t from 'io-ts'
import * as A from 'fp-ts/Array'
import * as E from 'fp-ts/Either'
import * as O from 'fp-ts/Option'
import * as R from 'fp-ts/Record'
import * as T from 'fp-ts/These'
import * as NEA from 'fp-ts/NonEmptyArray'
import * as F from 'fluture'
import * as D from 'io-ts-docopt'
import { PathReporter } from 'io-ts/lib/PathReporter'
import { pipe, flow, constFalse, constTrue, identity } from 'fp-ts/function'
import { withEncode } from 'io-ts-docopt'
import { trace } from '@strong-roots-capital/trace'
import { PackageJsonDependencies } from '@typescript-tools/io-ts/dist/lib/PackageJsonDependencies'
import { PackageName } from '@typescript-tools/io-ts/dist/lib/PackageName'
import { PackageVersion } from '@typescript-tools/io-ts/dist/lib/PackageVersion'
import { writeFile } from '@typescript-tools/lerna-utils'
import { packageManifests } from '@typescript-tools/package-manifests'
import { stringifyJSON as StringifjJSON_ } from '@typescript-tools/stringify-json'
import Debug from 'debug'
import deepEqual from 'fast-deep-equal'

// DISCUSS: do we get alphabetical ordering of imports for free? or
// do we need to add that explicitly. I think I saw it

const debug = {
    cmd: Debug('rename')
}

const docstring = `
Usage:
    rename-package --root=<dir> <current-package-name> <desired-package-name>

Options:
    --root=<dir>              Monorepo root directory
    <current-package-name>    Current name (including scope) of target package
    <desired-package-name>    Desired name (including scope) of target package
`

const CommandLineOptions = withEncode(
    t.intersection([
        t.type({
            '<current-package-name>': t.string,
            '<desired-package-name>': t.string,
        }),
        t.partial({
            '<dir>': t.string,
        }),
    ]),
    a => ({
        root: O.fromNullable(a['<dir>']),
        current: a['<current-package-name>'],
        desired: a['<desired-package-name>'],
    })
)

type Err =
    | { type: 'docopt decode', err: string }
    | { type: 'package not in monorepo' }
    | { type: 'unable to parse package.json', err: string }
    | { type: 'unable to write package.json', err: unknown }
    | { type: 'unable to stringify package.json', err: Error }

// Allows for the widening of a particular error into the Err type
const err = (error: Err): Err => error

const decodeDocopt = <C extends t.Mixed>(codec: C, docstring: string): F.FutureInstance<Err, C['_O']> => pipe(
    D.decodeDocopt(codec, docstring),
    E.mapLeft((err): Err => ({ type: 'docopt decode', err: PathReporter.report(E.left(err)).join('\n') })),
    E.map(options => F.resolve(options) as F.FutureInstance<Err, C['_O']>),
    E.getOrElse(err => F.reject(err) as F.FutureInstance<Err, C['_O']>),
)

const stringifyJSON = flow(
    StringifjJSON_(E.toError),
    E.mapLeft((err): Err => ({ type: 'unable to stringify package.json', err }))
)

const write = (file: string) => (contents: string): F.FutureInstance<Err, void> =>
    writeFile (file) (contents)
        .pipe(F.mapRej((err): Err => ({ type: 'unable to write package.json', err })))

function main(): void {

    const hasDependency = (
        dependencyGroup: Record<PackageName, PackageVersion> | undefined,
        dependency: string
    ) =>
        pipe(
            O.fromNullable(dependencyGroup),
            O.chain(R.lookup(dependency)),
            O.fold(constFalse, constTrue)
        )

    const PackageJson = t.intersection([
        t.type({ name: PackageName }),
        PackageJsonDependencies,
    ])

    type PackageJson = t.TypeOf<typeof PackageJson>;

    decodeDocopt(CommandLineOptions, docstring)
        .pipe(F.chain(
            options =>
                packageManifests(O.toUndefined(options.root))
                    .pipe(F.chain(
                        packages => {

                            const replaceDependency = (dependencies: Record<PackageName, PackageVersion> | undefined) =>
                                pipe(
                                    O.fromNullable(dependencies),
                                    O.map(R.reduceWithIndex(
                                        {} as Record<PackageName, PackageVersion>,
                                        (name, acc, version) => Object.assign(
                                            acc,
                                            { [name.replace(RegExp(`^${options.current}$`), options.desired)]: version }
                                        ))),
                                    O.toUndefined
                                )

                            return pipe(
                                packages,
                                A.map(({ pkg, contents }) => pipe(
                                    PackageJson.decode(contents),
                                    E.mapLeft(errors => err({ type: 'unable to parse package.json', err: PathReporter.report(E.left(errors)).join('\n') })),
                                    E.map(contents => ({ pkg, contents }))
                                )),
                                flow(
                                    A.separate,
                                    ({ left, right }) => T.both(left, right),
                                    T.mapLeft(A.map(err => F.resolve(E.left(err)) as F.FutureInstance<never, E.Either<Err, void>>))
                                ),
                                T.map(A.filter(
                                    // DISCUSS: this isn't strictly necessary, is it?
                                    ({ contents }) =>
                                        contents.name === options.current
                                        || hasDependency(contents.dependencies, options.current)
                                        || hasDependency(contents.devDependencies, options.current)
                                        || hasDependency(contents.peerDependencies, options.current)
                                        || hasDependency(contents.optionalDependencies, options.current)
                                )),
                                T.map(
                                    A.chain(
                                        ({ pkg, contents }) => {
                                            const updated = {
                                                ...contents,
                                                name: contents.name.replace(RegExp(`^${options.current}$`), options.desired),
                                                dependencies: replaceDependency(contents.dependencies),
                                                devDependencies: replaceDependency(contents.devDependencies),
                                                peerDependencies: replaceDependency(contents.peerDependencies),
                                                optionalDependencies: replaceDependency(contents.optionalDependencies),
                                            }
                                            return deepEqual(contents, updated)
                                                ? []
                                                : [{ pkg, contents: updated }]
                                        }
                                    )),
                                T.map(
                                    A.map(
                                        ({ pkg, contents }): F.FutureInstance<never, E.Either<Err, void>> => pipe(
                                            stringifyJSON(contents),
                                            E.map(trace(debug.cmd, `Writing ${path.resolve(pkg.location, 'package.json')}`)),
                                            E.map(write(path.resolve(pkg.location, 'package.json'))),
                                            E.getOrElseW(F.reject),
                                            future => F.coalesce (e => E.left(e) as E.Either<Err, void>) (a => E.right(a) as E.Either<Err, void>) (future),
                                            value => value
                                        )
                                    )
                                ),
                                flow(
                                    T.toTuple(
                                        [] as F.FutureInstance<never, E.Either<Err, void>>[],
                                        [] as F.FutureInstance<never, E.Either<Err, void>>[]
                                    ),
                                    A.chain(identity),
                                    F.parallel(250),
                                )
                            )
                        }
                    ))
        ))
        .pipe(F.chainRej(
            decodeError => F.resolve([E.left(decodeError) as E.Either<Err, void>])
        ))
        .pipe(
            F.fork
            // This should never run, but the fluture typings are all
            // weird and I'm not 100% confident in that
            ((error: never) => (console.error('Impossible', error), process.exit(1)))
            (flow(
                A.lefts,
                NEA.fromArray,
                O.map(failures => (
                    console.log('Encountered errors:', failures),
                    process.exit(1)
                ))
            ))
        )
}

main()

// Local Variables:
// mode: typescript
// End:
