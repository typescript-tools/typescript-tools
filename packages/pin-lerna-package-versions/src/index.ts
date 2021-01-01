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
import { pipe } from 'fp-ts/function'
import { constVoid, constant } from 'fp-ts/function'
import { match } from 'ts-pattern'
import { withEncode, decodeDocopt } from 'io-ts-docopt'
import { LernaPackage } from '@typescript-tools/io-ts/dist/lib/LernaPackage'
import { PackageName } from '@typescript-tools/io-ts/dist/lib/PackageName'
import { PackageVersion } from '@typescript-tools/io-ts/dist/lib/PackageVersion'
import { StringifiedJSON } from '@typescript-tools/io-ts/dist/lib/StringifiedJSON'
import { validationErrors } from '@typescript-tools/io-ts/dist/lib/error'
import { PackageJsonDependencies } from '@typescript-tools/io-ts/dist/lib/PackageJsonDependencies'
import { stringifyJSON } from '@typescript-tools/stringify-json'
import { trace } from '@strong-roots-capital/trace'
import {
    lernaPackages,
    readFile,
    writeFile,
} from '@typescript-tools/lerna-utils'

const debug = {
    cmd: Debug('pin')
}

const docstring = `
Usage:
    pin-lerna-package-versions [--dist-tag=<tag>] <root>

Options:
    root                Root of lerna mono-repository
    --dist-tag=<tag>    Pin versions of internal packages to dist tag
`

const CommandLineOptions = withEncode(
    t.type({
        '<root>': t.string,
        '--dist-tag': t.union([t.null, PackageVersion]),
    }),
    a => pipe(
        {
            root: a['<root>'],
            distTag: a['--dist-tag'] !== null ? a['--dist-tag'] : undefined,
        },
        value => {
            // FIXME: interested in a better pattern around this
            if (a['--dist-tag'] === null) {
                delete value.distTag
            }
            return value
        }
    )
)

type CommandLineOptions = t.TypeOf<typeof CommandLineOptions>;

function packageDictionary(
    packages: LernaPackage[]
): Record<PackageName, PackageVersion> {
    return packages.reduce(
        (acc, {name, version}) => Object.assign(acc, {[name]: `^${version}`}),
        {} as Record<PackageName, PackageVersion>
    )
}

function updateDependencies(
    dependencies: Record<PackageName, PackageVersion>,
    distTag?: PackageVersion,
): (packageJson: string) => F.FutureInstance<unknown, void> {
    return function updateDependenciesFor(packageJson) {

        type NoChanges =
            | { type: 'no-op' }
            | { type: 'error', error: Error }

        const withLatestDependencies = (
            deps: Record<PackageName, PackageVersion> | undefined
        ): Record<PackageName, PackageVersion> | undefined => pipe(
            O.fromNullable(deps),
            O.map(deps => Object.entries(deps).reduce(
                (acc, [pkg, version]) => Object.assign(
                    acc,
                    {
                        [pkg]: pipe(
                            R.lookup (pkg) (dependencies),
                            O.map(internalVersion => O.getOrElse (constant(internalVersion)) (O.fromNullable(distTag))),
                            O.getOrElse (constant(version))
                        )
                    }
                ),
                {} as Record<PackageName, PackageVersion>
            )),
            O.toUndefined
        )

        return readFile(packageJson)
            .pipe(
            F.chain(
            (string): F.FutureInstance<Error, O.Option<PackageJsonDependencies>> => pipe(
                StringifiedJSON(PackageJsonDependencies).decode(string),
                E.map(originalJson => pipe(
                    originalJson,
                    mod ('dependencies') (withLatestDependencies),
                    mod ('devDependencies') (withLatestDependencies),
                    mod ('optionalDependencies') (withLatestDependencies),
                    mod ('peerDependencies') (withLatestDependencies),
                    R.filter(value => value !== undefined),
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
                    stringifyJSON(updates, E.toError),
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
        decodeDocopt(CommandLineOptions, docstring),
        E.map(options => lernaPackages(options.root)
            .pipe(F.chain(
                packages => {
                    const dictionary = packageDictionary(packages)

                    const packageJsons = packages
                        .map(pkg => pkg.location)
                        .map(dir => path.resolve(dir, 'package.json'))

                    return F.parallel (Infinity) (packageJsons.map(updateDependencies(dictionary, options.distTag)))
                }
            ))),
        E.getOrElseW(errors => F.reject(validationErrors('argv', errors)) as F.FutureInstance<unknown, void[]>),
        F.fork (error => (console.error(error), process.exit(1))) (constVoid)
    )
}

main()

//  LocalWords:  packageJson devDependencies optionalDependencies

// Local Variables:
// mode: typescript
// End:
