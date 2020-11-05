#!/usr/bin/env node

/**
 * pin-lerna-package-versions
 * Pin lerna dependencies to latest managed version
 */

import * as path from 'path'
import * as t from 'io-ts'
import * as E from 'fp-ts/Either'
import * as O from 'fp-ts/Option'
import * as R from 'fp-ts/Record'
import * as F from 'fluture'
import Debug from 'debug'
import deepEqual from 'fast-deep-equal'
import { mod } from 'shades'
import { pipe } from 'fp-ts/pipeable'
import { constVoid, constant } from 'fp-ts/function'
import { match } from 'ts-pattern'
import { LernaPackage } from '@typescript-tools/io-ts/dist/lib/LernaPackage'
import { StringifiedJSON } from '@typescript-tools/io-ts/dist/lib/StringifiedJSON'
import {
    decodeCommandLineArguments,
    lernaPackages,
    readFile,
    writeFile,
    trace,
    withEncode
} from '@typescript-tools/lerna-utils'

const debug = {
    cmd: Debug('pin')
}

const docstring = `
Usage:
    pin-lerna-package-versions <root>

Options:
    root    Root of lerna mono-repository
`

const CommandLineOptions = withEncode(
    t.type({
        '<root>': t.string
    }),
    a => ({
        root: a['<root>']
    })
)

type CommandLineOptions = t.TypeOf<typeof CommandLineOptions>;

function prettyStringifyJson<E>(
    u: unknown,
    onError: (reason: unknown) => E
): E.Either<E, string> {
    return E.tryCatch(() => JSON.stringify(u, null, 4), onError)
}

const PackageJsonRequired = t.type({
    name: t.string,
    version: t.string,
})

const PackageJsonOptional = t.partial({
    dependencies: t.record(t.string, t.string),
    devDependencies: t.record(t.string, t.string),
})

const PackageJson = t.intersection([PackageJsonRequired, PackageJsonOptional])
type PackageJson = t.TypeOf<typeof PackageJson>;

type Package = string;
type VersionString = string;

function packageDictionary(
    packages: LernaPackage[]
): Record<Package, VersionString> {
    return packages.reduce(
        (acc, {name, version}) => Object.assign(acc, {[name]: `^${version}`}),
        {} as Record<Package, VersionString>
    )
}

function updateDependencies(
    dependencies: Record<Package, VersionString>
): (packageJson: string) => F.FutureInstance<unknown, unknown> {
    return function updateDependenciesFor(packageJson) {

        type NoChanges =
            | { type: 'no-op' }
            | { type: 'error', error: Error }

        const withLatestDependencies = (
            deps: Record<Package, VersionString> | undefined
        ): Record<Package, VersionString> =>
            Object.entries(deps ?? {}).reduce(
            (acc, [pkg, version]) => Object.assign(
                acc,
                {[pkg]: O.getOrElse (constant(version)) (R.lookup (pkg) (dependencies)) }
            ),
            {} as Record<Package, VersionString>
        )

        return readFile(packageJson)
            .pipe(
            F.chain(
            (string): F.FutureInstance<Error, O.Option<PackageJson>> => pipe(
                StringifiedJSON(PackageJson).decode(string),
                E.map(originalJson => pipe(
                    originalJson,
                    mod ('dependencies') (withLatestDependencies),
                    mod ('devDependencies') (withLatestDependencies),
                    updatedJson => deepEqual(originalJson, updatedJson)
                        ? O.none
                        : O.some(updatedJson)
                )),
                E.map(F.resolve),
                E.getOrElseW(() => F.reject(new Error(`Could not parse JSON from '${packageJson}'`)))
            )
        ))
            .pipe(F.chain(updates => pipe(
                updates,
                E.fromOption((): NoChanges => ({ type: 'no-op' })),
                E.map(trace(debug.cmd, 'Updating file', packageJson)),
                E.chain(updates => pipe(
                    prettyStringifyJson(updates, E.toError),
                    E.mapLeft((error): NoChanges => ({ type: 'error', error }))
                )),
                E.map(writeFile(packageJson)),
                E.getOrElseW(
                    error => match<NoChanges, F.FutureInstance<Error, undefined>>(error)
                        .with({ type: 'no-op' }, () => F.resolve(undefined))
                        .with({ type: 'error' }, ({ error }) => F.reject(error))
                        .run()
                )
            )))
    }
}

function main(): void {
    pipe(
        decodeCommandLineArguments(CommandLineOptions, docstring),
        E.map(options => lernaPackages(options.root)
            .pipe(F.chain(
                packages => {
                    const dictionary = packageDictionary(packages)

                    const packageJsons = packages
                        .map(pkg => pkg.location)
                        .map(dir => path.resolve(dir, 'package.json'))

                    return F.parallel (Infinity) (packageJsons.map(updateDependencies(dictionary)))
                }
            ))),
        // DISCUSS: folding the either into a future
        E.fold(
            // TODO: use validateErrors to print a human-readable error message
            error => {
                console.error(error)
                process.exit(1)
            },
            // TODO: set non-zero exit code on failure
            F.fork (console.error) (constVoid)
        )
    )
}

main()

//  LocalWords:  packageJson devDependencies

// Local Variables:
// mode: typescript
// End:
