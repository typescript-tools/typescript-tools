#!/usr/bin/env node

/**
 * hoisted-package-json
 * Generate the package.json used during a hoisted bootstrap
 */

import * as path from 'path'
import * as fs from 'fs'
import * as t from 'io-ts'
import * as E from 'fp-ts/Either'
import * as T from 'fp-ts/Task'
import * as TE from 'fp-ts/TaskEither'
import * as Console from 'fp-ts/Console'
import * as PathReporter from 'io-ts/lib/PathReporter'
import { sequenceS } from 'fp-ts/Apply'
import { pipe, flow, Endomorphism, identity } from 'fp-ts/function'
import { decodeDocopt as decodeDocopt_ } from 'io-ts-docopt'
import { PackageJsonDependencies } from '@typescript-tools/io-ts/dist/lib/PackageJsonDependencies'
import { PackageName } from '@typescript-tools/io-ts/dist/lib/PackageName'
import { PackageVersion } from '@typescript-tools/io-ts/dist/lib/PackageVersion'
import { StringifiedJSON } from '@typescript-tools/io-ts/dist/lib/StringifiedJSON'
import { LernaPackage } from '@typescript-tools/io-ts/dist/lib/LernaPackage'
import { lernaPackages as lernaPackages_ } from '@typescript-tools/lerna-packages'
import {
    monorepoRoot as monorepoRoot_,
    MonorepoRootError,
} from '@typescript-tools/monorepo-root'
import {
    hoistedPackages as hoistedPackages_,
    PackageManifestsError,
} from '@typescript-tools/hoisted-packages'

const docstring = `
Usage:
    hoisted-package-json

Options:
`

const CommandLineOptions = t.type({})

type Err =
    | PackageManifestsError
    | MonorepoRootError
    | { type: 'docopt decode'; error: string }
    | { type: 'unexpected contents in top-level package.json'; error: string }
    | { type: 'unable to stringify package.json'; error: Error }

const err: Endomorphism<Err> = identity

const readFile = (filename: string) =>
    TE.tryCatch(
        async () =>
            new Promise<string>((resolve, reject) =>
                fs.readFile(filename, 'utf8', (error, data) =>
                    error !== null && error !== undefined
                        ? reject(error)
                        : resolve(data),
                ),
            ),
        flow(E.toError, (error) =>
            err({ type: 'unable to read file', filename, error }),
        ),
    )

const decodeDocopt = flow(
    decodeDocopt_,
    E.mapLeft(
        flow(
            (errors) => PathReporter.failure(errors).join('\n'),
            (error) => err({ type: 'docopt decode', error }),
        ),
    ),
    TE.fromEither,
)

const monorepoRoot = flow(monorepoRoot_, E.mapLeft(err), TE.fromEither)
const hoistedPackages = flow(hoistedPackages_, TE.mapLeft(err))
const lernaPackages = flow(lernaPackages_, TE.mapLeft(err))

const readRootPackageJson = (
    root: string,
): TE.TaskEither<Err, PackageJsonDependencies> =>
    pipe(
        path.resolve(root, 'package.json'),
        readFile,
        TE.chain(
            flow(
                StringifiedJSON(PackageJsonDependencies).decode.bind(null),
                E.mapLeft(
                    flow(
                        (errors) => PathReporter.failure(errors).join('\n'),
                        (error) =>
                            err({
                                type:
                                    'unexpected contents in top-level package.json',
                                error,
                            }),
                    ),
                ),
                TE.fromEither,
            ),
        ),
    )

const hoistedPackageJson = (
    hoisted: Map<PackageName, PackageVersion>,
    manifest: PackageJsonDependencies,
): PackageJsonDependencies =>
    Object.assign({}, manifest, {
        devDependencies: undefined,
        peerDependencies: undefined,
        optionalDependencies: undefined,
        dependencies: Object.fromEntries(hoisted),
    })

const stringifyJson = (
    json: Record<string, unknown>,
): TE.TaskEither<Err, string> =>
    pipe(
        E.tryCatch(() => JSON.stringify(json, null, 2), E.toError),
        E.mapLeft((error) =>
            err({ type: 'unable to stringify package.json', error }),
        ),
        TE.fromEither,
    )

const removeInternalPackages = (
    hoisted: Map<PackageName, PackageVersion>,
    internalPackages: LernaPackage[],
): Map<PackageName, PackageVersion> => {
    for (const pkg of internalPackages) {
        hoisted.delete(pkg.name)
    }
    return hoisted
}

const main: T.Task<void> = pipe(
    TE.bindTo('options')(decodeDocopt(CommandLineOptions, docstring)),
    TE.bind('root', () => monorepoRoot()),
    TE.chain(({ root }) =>
        pipe(
            {
                // FIXME: remove internal packages
                hoisted: hoistedPackages(root),
                lernaPackages: lernaPackages(root),
                rootPackageJson: readRootPackageJson(root),
            },
            sequenceS(TE.ApplicativePar),
            TE.chain(({ hoisted, lernaPackages, rootPackageJson }) =>
                pipe(
                    removeInternalPackages(hoisted, lernaPackages),
                    (hoisted) => hoistedPackageJson(hoisted, rootPackageJson),
                    stringifyJson,
                ),
            ),
        ),
    ),
    TE.fold(flow(Console.error, T.fromIO), flow(Console.log, T.fromIO)),
)

main()

// Local Variables:
// mode: typescript
// End:
