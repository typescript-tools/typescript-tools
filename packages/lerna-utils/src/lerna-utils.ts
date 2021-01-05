/**
 * lerna-utils
 * Internal utilities for interacting with a lerna monorepo
 */

import * as fs from 'fs'
import * as t from 'io-ts'
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
