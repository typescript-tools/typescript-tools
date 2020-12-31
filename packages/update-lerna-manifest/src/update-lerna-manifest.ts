#!/usr/bin/env node

/**
 * update-lerna-manifest
 * Keep the lerna manifest up to date
 */

import * as fs from 'fs'
import * as path from 'path'
import * as t from 'io-ts'
import * as A from 'fp-ts/Array'
import * as E from 'fp-ts/Either'
import * as O from 'fp-ts/Option'
import * as NEA from 'fp-ts/NonEmptyArray'
import * as D from 'io-ts-docopt'
import * as F from 'fluture'
import Debug from 'debug'
import deepEqual from 'fast-deep-equal'
import findUp from 'find-up'
import glob from 'fast-glob'
import { ordString } from 'fp-ts/Ord'
import { pipe, flow } from 'fp-ts/function'
import { constVoid } from 'fp-ts/function'
import { withEncode} from 'io-ts-docopt'
import { PathReporter } from 'io-ts/lib/PathReporter'
import { match } from 'ts-pattern'
import { StringifiedJSON } from '@typescript-tools/io-ts/dist/lib/StringifiedJSON'
import { trace } from '@strong-roots-capital/trace'
import {
    readFile as readFile_,
    writeFile as writeFile_,
    prettyStringifyJson,
} from '@typescript-tools/lerna-utils'
import { StringEndingWithTsconfigSettingsJson } from './string-ending-with-tsconfig-settings-json'

const debug = {
    manifest: Debug('manifest')
}

const docstring = `
Usage:
    update-lerna-manifest <glob>...

Options:
    <glob>    Glob of package directories to search for lerna packages
`

const CommandLineOptions = withEncode(
    t.type({
        '<glob>': t.array(t.string),
    }),
    a => ({
        globs: a['<glob>']
    })
)

type CommandLineOptions = (typeof CommandLineOptions)['_O'];

type Err =
    | { type: 'docopt decode', err: string }
    | { type: 'found no matching packages' }
    | { type: 'package not in monorepo' }
    | { type: 'unable to stringify json', json: unknown, err: Error }
    | { type: 'unable to read file', err: NodeJS.ErrnoException }
    | { type: 'unable to write file', err: NodeJS.ErrnoException }
    | { type: 'json parse error', file: string, error: string }
    | { type: 'no-op' }  // not an error, was lazy of me to put here

const decodeDocopt: (codec: t.Mixed, docstring: string) => F.FutureInstance<Err, CommandLineOptions> = flow(
    D.decodeDocopt,
    E.map(F.resolve),
    E.getOrElseW(err => F.reject(({ type: 'docopt decode', err: PathReporter.report(E.left(err)).join('n) ')}) as Err))
)

const decode = <C extends t.Mixed>(codec: C) => (file: string) => (contents: unknown): E.Either<Err, C['_A']> => pipe(
    codec.decode(contents),
    E.mapLeft(decodeError => ({ type: 'json parse error', file, error: PathReporter.report(E.left(decodeError)).join('\n') }))
)

const findup = flow(
    findUp.sync as (name: string | readonly string[], options?: findUp.Options) => string | undefined,
    O.fromNullable,
    O.map(path.dirname),
    E.fromOption((): Err => ({ type: 'package not in monorepo' })),
)

const readFile = (file: fs.PathLike): F.FutureInstance<Err, string> =>
    readFile_(file)
        .pipe(F.mapRej((err): Err => ({ type: 'unable to read file', err })))

const writeFile = (file: fs.PathLike) => (contents: string): F.FutureInstance<Err, void> =>
    writeFile_ (file) (contents)
        .pipe(F.mapRej((err): Err => ({ type: 'unable to write file', err })))

function main(): void {
    decodeDocopt(CommandLineOptions, docstring)
        .pipe(
            F.map(
                ({ globs }: CommandLineOptions) => glob.sync(
                    globs.map(glob => path.resolve(glob, '**', 'tsconfig.json')),
                    {
                        followSymbolicLinks: false,
                        onlyFiles: true,
                        unique: true,
                        deep: 2,
                        ignore: ['node_modules/**']
                    }
                )
            )
        )
        .pipe(
            F.chain(
                candidates => {
                    const isCandidate = (candidate: string) =>
                        readFile(candidate)
                            .pipe(
                                F.chain(
                                    (contents): F.FutureInstance<never, { file: string, isLernaPackage: boolean }> => (
                                        F.resolve({
                                            file: candidate,
                                            isLernaPackage: StringifiedJSON(
                                                t.type({
                                                    extends: StringEndingWithTsconfigSettingsJson
                                                })
                                            ).is(contents)
                                        })
                                    )
                                )
                            )

                    return F.parallel (Infinity) (candidates.map(isCandidate))
                }
            )
        )
        .pipe(F.chain(
            flow(
                A.filter(({ isLernaPackage }: { file: string, isLernaPackage: boolean }) => isLernaPackage),
                A.map(({ file }) => file),
                NEA.fromArray,
                E.fromOption((): Err => ({ type: 'found no matching packages' })),
                E.chain(packages => pipe(
                    findup('lerna.json', { cwd: NEA.head(packages) }),
                    E.map(root => ({
                        root,
                        packages: pipe(
                            packages,
                            A.map(pkg => path.relative(root, pkg)),
                            A.map(path.dirname),
                            A.sort(ordString)
                        )
                    }))
                )),
                E.map(F.resolve),
                E.getOrElseW(F.reject)
            )
        ))
        .pipe(F.chain(
            ({root, packages}: {root: string, packages: string[]}) => {
                const updateLernaManifest = readFile(path.join(root, 'lerna.json'))
                    .pipe(F.chain(
                        contents => {
                            const LernaManifest = StringifiedJSON(
                                t.type({
                                    packages: t.array(t.string)
                                })
                            )
                            return pipe(
                                decode (LernaManifest) ('lerna.json') (contents),
                                E.chain(manifest =>
                                    deepEqual(manifest.packages, packages)
                                    ? E.left({ type: 'no-op' } as Err)
                                    : E.right((manifest.packages = packages, manifest))
                                ),
                                E.chain(contents => pipe(
                                    prettyStringifyJson(contents, E.toError),
                                    E.map(trace(debug.manifest, 'Updating lerna manifest')),
                                    E.mapLeft((err): Err => ({ type: 'unable to stringify json', json: contents, err }))
                                )),
                                E.map(writeFile(path.join(root, 'lerna.json'))),
                                E.getOrElseW(F.reject)
                            )
                        }
                    ))
                    // do not report a no-op as an error
                    .pipe(F.chainRej(err =>
                        match<Err, F.FutureInstance<Err, unknown>>(err)
                            .with({ type: 'no-op' }, () => F.resolve(void 0))
                            .otherwise(() => F.reject(err))
                    ))

                const updateTopLevelTsconfig = readFile(path.join(root, 'tsconfig.json'))
                    .pipe(F.chain(
                        contents => {
                            const TsconfigManifest = StringifiedJSON(
                                t.type({
                                    references: t.array(t.type({path: t.string}))
                                })
                            )
                            const references = packages.map(pkg => ({path: pkg}))
                            return pipe(
                                decode (TsconfigManifest) ('tsconfig.json') (contents),
                                E.chain(manifest =>
                                    deepEqual(manifest.references, references)
                                    ? E.left({ type: 'no-op' } as Err)
                                    : E.right((manifest.references = references, manifest))
                                ),
                                E.chain(contents => pipe(
                                    prettyStringifyJson(contents, E.toError),
                                    E.mapLeft((err): Err => ({ type: 'unable to stringify json', json: contents, err }))
                                )),
                                E.map(writeFile(path.join(root, 'tsconfig.json'))),
                                E.getOrElseW(F.reject)
                            )
                        }
                    ))
                    // do not report some errors, since this is ancillary functionality
                    .pipe(F.chainRej(err =>
                        match<Err, F.FutureInstance<Err, unknown>>(err)
                            .with({ type: 'no-op' }, () => F.resolve(void 0))
                            .with({ type: 'unable to stringify json' }, () => F.resolve(void 0))
                            .with({ type: 'unable to read file' }, () => F.resolve(void 0))
                            .otherwise(() => F.reject(err))
                    ))

                return F.parallel (2) ([updateLernaManifest, updateTopLevelTsconfig])
            }
        ))
        .pipe(F.fork (error => (console.error(error), process.exit(1))) (constVoid))
}

main()

// Local Variables:
// mode: typescript
// End:
