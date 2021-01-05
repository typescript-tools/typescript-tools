#!/usr/bin/env node

/**
 * merge-package-locks
 * Merge two package locks
 */

import * as t from 'io-ts'
import * as E from 'fp-ts/Either'
import * as NEA from 'fp-ts/NonEmptyArray'
import * as F from 'fluture'
import * as D from 'io-ts-docopt'
import { withEncode } from 'io-ts-docopt'
import { PathReporter } from 'io-ts/lib/PathReporter'
import { pipe, constVoid } from 'fp-ts/function'
import { fold } from 'fp-ts/lib/Semigroup'
import { nonEmptyArray } from 'io-ts-types/lib/nonEmptyArray'
import { readFile as readFile_, writeFile as writeFile_ } from '@typescript-tools/lerna-utils'
import { stringifyJSON as stringifyJSON_ } from '@typescript-tools/stringify-json'
import { PackageLockJson, PackageLockJsonSemigroup } from '@typescript-tools/io-ts/dist/lib/PackageLockJson'
import { trace } from '@strong-roots-capital/trace'
import Debug from 'debug'

const debug = {
    cmd: Debug('merge')
}

const docstring = `
Usage:
    merge-package-locks <target> <source>...

Options:
    <target>    Target package-lock.json in which to accumulate information
    <source>    List of package-lock.json files to merge into <target>

Note: only supports lockfileVersion v1 for now (npm version 6)
`

const CommandLineOptions = withEncode(
    t.type({
        '<target>': t.string,
        '<source>': nonEmptyArray(t.string),
    }),
    a => ({
        target: a['<target>'],
        sources: a['<source>'],
    })
)

// Temporary helper to infer types, see https://github.com/fluture-js/Fluture/issues/455
export function map<RA, RB>(mapper: (value: RA) => RB):
  <L>(source: F.FutureInstance<L, RA>) => F.FutureInstance<L, RB> {
  return F.map (mapper)
}

type Err =
    | { type: 'docopt decode', err: string }
    | { type: 'unable to read file', file: string, err: NodeJS.ErrnoException }
    | { type: 'unable to parse file', file: string, err: Error }
    | { type: 'unexpected file contents', file: string, err: string }
    | { type: 'unable to stringify json', json: unknown, err: Error }
    | { type: 'unable to write file', file: string, err: NodeJS.ErrnoException }

// Widens the type of a particular Err into an Err
const error = (error: Err): Err => error

const decodeDocopt = <C extends t.Mixed>(codec: C, docstring: string): F.FutureInstance<Err, C['_O']> => pipe(
    D.decodeDocopt(codec, docstring),
    E.mapLeft((err): Err => ({ type: 'docopt decode', err: PathReporter.report(E.left(err)).join('\n') })),
    E.map(options => F.resolve(options) as F.FutureInstance<Err, C['_O']>),
    E.getOrElse(err => F.reject(err) as F.FutureInstance<Err, C['_O']>),
)

const readFile = (file: string): F.FutureInstance<Err, string> => pipe(
    readFile_(file),
    F.mapRej(err => error({ type: 'unable to read file', file, err })),
)

const parseJson = (file: string) => (contents: string): F.FutureInstance<Err, E.Json> => pipe(
    E.parseJSON(contents, E.toError),
    E.map(F.resolve),
    E.getOrElseW(err => F.reject(error({ type: 'unable to parse file', file, err })))
)

const decodeFile = (file: string) => (contents: E.Json): F.FutureInstance<Err, PackageLockJson> => pipe(
    PackageLockJson.decode(contents),
    E.mapLeft(errors => PathReporter.report(E.left(errors)).join('\n')),
    E.map(F.resolve),
    E.getOrElseW(err => F.reject(error({ type: 'unexpected file contents', file, err })))
)

const stringifyJSON = (onError: (reason: unknown) => Error) => (json: unknown): F.FutureInstance<Err, string> => pipe(
    stringifyJSON_ (onError) (json),
    E.map(F.resolve),
    E.getOrElseW(err => F.reject(error({ type: 'unable to stringify json', json, err })))
)

const writeFile = (file: string) => (contents: string) => pipe(
    contents,
    trace(debug.cmd, `Writing file ${file}`),
    writeFile_(file),
    F.mapRej(err => error({ type: 'unable to write file', file, err }))
)

// FEATURE: do not write a file that hasn't changed
// FEATURE: support npm 7 lockfiles

function main(): void {

    pipe(
        decodeDocopt(CommandLineOptions, docstring),
        F.chain(
            options => pipe(
                NEA.cons(options.target, options.sources),
                NEA.map(file => pipe(
                    readFile(file),
                    F.chain(parseJson(file)),
                    F.chain(decodeFile(file)),
                )),
                F.parallel(Infinity),
                map(([target, ...sources]) => fold (PackageLockJsonSemigroup) (target, sources)),
                F.chain(stringifyJSON(E.toError)),
                F.chain(writeFile(options.target)),
            )
        ),
        F.fork (error => (console.error(error), process.exit(1)))
               (constVoid)
    )
}

main()

// Local Variables:
// mode: typescript
// End:
