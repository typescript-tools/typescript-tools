/**
 * lerna-utils
 * Internal utilities for interacting with a lerna monorepo
 */

import * as path from 'path'
import * as fs from 'fs'
import * as t from 'io-ts'
import * as A from 'fp-ts/Array'
import * as E from 'fp-ts/Either'
import * as F from 'fluture'
import execa from 'execa'
import { flow, pipe } from 'fp-ts/lib/function'
import { LernaPackage } from '@typescript-tools/io-ts/dist/lib/LernaPackage'
import { StringifiedJSON } from '@typescript-tools/io-ts/dist/lib/StringifiedJSON'

export const readFile = (file: fs.PathLike): F.FutureInstance<NodeJS.ErrnoException, string> =>
    F.node(done => fs.readFile(file, 'utf8', done))

export const writeFile = (file: fs.PathLike) => (contents: string): F.FutureInstance<NodeJS.ErrnoException, void> =>
    F.node(done => fs.writeFile(file, contents, done))

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
