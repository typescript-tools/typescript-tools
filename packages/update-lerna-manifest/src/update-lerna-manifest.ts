#!/usr/bin/env node

/**
 * update-lerna-manifest
 * Keep the lerna manifest up to date
 */

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
import {
    readFile,
    writeFile,
    prettyStringifyJson,
    trace,
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
    | { type: 'unable to parse lerna.json', err: string }
    | { type: 'unable to stringify new lerna.json', err: Error }
    | { type: 'unable to read lerna.json', err: NodeJS.ErrnoException }
    | { type: 'unable to write lerna.json', err: NodeJS.ErrnoException }
    | { type: 'no-op' }  // not an error, was lazy of me to put here

const decodeDocopt: (codec: t.Mixed, docstring: string) => F.FutureInstance<Err, CommandLineOptions> = flow(
    D.decodeDocopt,
    E.map(F.resolve),
    E.getOrElseW(err => F.reject(({ type: 'docopt decode', err: PathReporter.report(E.left(err)).join('n) ')}) as Err))
)

const findup = flow(
    findUp.sync as (name: string | readonly string[], options?: findUp.Options) => string | undefined,
    O.fromNullable,
    O.map(path.dirname),
    E.fromOption((): Err => ({ type: 'package not in monorepo' })),
)

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
            ({root, packages}: {root: string, packages: string[]}) =>
                readFile(path.join(root, 'lerna.json'))
                    .pipe(F.mapRej((err): Err => ({ type: 'unable to read lerna.json', err })))
                    .pipe(F.chain(
                        contents => {
                            const LernaManifest = StringifiedJSON(
                                t.type({
                                    packages: t.array(t.string)
                                })
                            )
                            return pipe(
                                LernaManifest.decode(contents),
                                E.mapLeft(decodeError => ({ type: 'unable to parse lerna.json', err: PathReporter.report(E.left(decodeError)).join('\n') } as Err)),
                                E.chain(manifest => {
                                    return deepEqual(manifest.packages, packages)
                                        ? E.left({ type: 'no-op' } as Err)
                                        : E.right((manifest.packages = packages, manifest))
                                }),
                                E.chain(contents => pipe(
                                    prettyStringifyJson(contents, E.toError),
                                    E.map(trace(debug.manifest, 'Updating lerna manifest')),
                                    E.mapLeft((err): Err => ({ type: 'unable to stringify new lerna.json', err })))
                                ),
                                E.map(contents => writeFile (path.join(root, 'lerna.json')) (contents).pipe(F.mapRej((err): Err => ({ type: 'unable to write lerna.json', err })))),
                                E.getOrElseW(F.reject)
                            )
                        }
                    ))

        ))
        .pipe(F.fork
              (error => {
                  match(error)
                      .with({ type: 'no-op' }, constVoid)
                      .otherwise(() => {
                          console.error(error)
                          process.exit(1)
                      })
              })
              (constVoid)
             )
}

main()

// Local Variables:
// mode: typescript
// End:
