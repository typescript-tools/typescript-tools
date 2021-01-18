#!/usr/bin/env node

/**
 * use-hoisted-version
 * Update lerna package to use hoisted version of npm dependency
 */

import * as path from 'path'
import * as t from 'io-ts'
import * as E from 'fp-ts/Either'
import * as O from 'fp-ts/Option'
import * as R from 'fp-ts/Record'
import * as F from 'fluture'
import * as D from 'io-ts-docopt'
import { withEncode } from 'io-ts-docopt'
import { PathReporter } from 'io-ts/lib/PathReporter'
import { pipe, flow, constant, constVoid } from 'fp-ts/function'
import { StringifiedJSON } from '@typescript-tools/io-ts/dist/lib/StringifiedJSON'
import { PackageJsonDependencies } from '@typescript-tools/io-ts/dist/lib/PackageJsonDependencies'
import { PackageName } from '@typescript-tools/io-ts/dist/lib/PackageName'
import { PackageVersion } from '@typescript-tools/io-ts/dist/lib/PackageVersion'
import { hoistedPackages } from '@typescript-tools/hoisted-packages'
import { readFile, writeFile } from '@typescript-tools/lerna-utils'
import { stringifyJSON } from '@typescript-tools/stringify-json'
import { monorepoRoot, MonorepoRootErr } from '@typescript-tools/monorepo-root'
import { trace } from '@strong-roots-capital/trace'
import { mod } from 'shades'
import { match } from 'ts-pattern'
import Debug from 'debug'
import deepEqual from 'fast-deep-equal'

const debug = {
    cmd: Debug('hoist')
}

const docstring = `
Usage:
    use-hoisted-version <package>

Options:
    <package>    Path to package for which to update dependencies
`

const CommandLineOptions = withEncode(
    t.type({
        '<package>': t.string,
    }),
    a => ({
        package: a['<package>']
    })
)

type Err =
    | MonorepoRootErr
    | { type: 'docopt decode', err: string }
    | { type: 'package not in monorepo' }
    | { type: 'unable to parse package.json', err: string }
    | { type: 'unable to write package.json', err: unknown }
    | { type: 'unable to stringify package.json', err: Error }
    | { type: 'no-op' }

const decodeDocopt = flow(
    D.decodeDocopt,
    E.mapLeft((err): Err => ({ type: 'docopt decode', err: PathReporter.report(E.left(err)).join('\n') })),
)

const updateDependencies =
    (packageJson: string) =>
    (hoistedPackages: Map<PackageName, PackageVersion>): F.FutureInstance<unknown, void> => {

        const withHoistedDependencies = (
            deps: Record<PackageName, PackageVersion> | undefined
        ): Record<PackageName, PackageVersion> | undefined => pipe(
            O.fromNullable(deps),
            O.map(R.reduceWithIndex(
                {} as Record<PackageName, PackageVersion>,
                (pkg, acc, version) => Object.assign(
                    acc,
                    { [pkg]: O.getOrElse (constant(version)) (O.fromNullable(hoistedPackages.get(pkg))) }
                )
            )),
            O.toUndefined
        )

        return readFile(packageJson)
            .pipe(F.chain(
                (contents) => pipe(
                    StringifiedJSON(PackageJsonDependencies).decode(contents),
                    E.map(originalJson => pipe(
                        originalJson,
                        mod ('dependencies') (withHoistedDependencies),
                        mod ('devDependencies') (withHoistedDependencies),
                        mod ('optionalDependencies') (withHoistedDependencies),
                        mod ('peerDependencies') (withHoistedDependencies),
                        R.filter(value => value !== undefined),
                        updatedJson => deepEqual(originalJson, updatedJson)
                            ? O.none
                            : O.some(updatedJson)
                    )),
                    E.map(F.resolve),
                    E.getOrElseW(() => F.reject({ type: 'unable to parse parse package.json', err: `Could not parse JSON from '${packageJson}` }))
                )
            ))
            .pipe(F.chain(updates => pipe(
                updates,
                E.fromOption((): Err => ({ type: 'no-op' })),
                E.map(trace(debug.cmd, 'Updating file', packageJson)),
                E.chain(flow(
                    stringifyJSON(E.toError),
                    E.mapLeft((err): Err => ({ type: 'unable to stringify package.json', err }))
                )),
                E.map(
                    updates => writeFile(packageJson) (updates)
                        .pipe(F.mapRej((err): Err => ({ type: 'unable to write package.json', err })))
                ),
                E.getOrElseW(
                    error => match<Err, F.FutureInstance<Err, undefined>>(error)
                        .with({ type: 'no-op' }, () => F.resolve(undefined))
                        .otherwise(() => F.reject(error))
                )
            )))
    }

function main(): void {
    pipe(
        decodeDocopt(CommandLineOptions, docstring),
        E.chain(options => pipe(
            monorepoRoot(options.package) as E.Either<Err, string>,
            E.map(root => ({ options, root }))
        )),
        E.map(
            ({options, root}) => hoistedPackages(root)
                .pipe(F.chain(updateDependencies(path.resolve(options.package, 'package.json'))))
        ),
        E.getOrElseW(errors => F.reject(errors) as F.FutureInstance<Err, void>),
        F.fork (error => (console.error(error), process.exit(1))) (constVoid)
    )
}

main()

//  LocalWords:  packageJson devDependencies optionalDependencies

// Local Variables:
// mode: typescript
// End:
