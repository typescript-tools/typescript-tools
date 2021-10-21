#!/usr/bin/env node

/**
 * tsconfig-includes
 * Enumerate files included by tsconfig.json
 */

import Debug from 'debug'
import * as fs from 'fs'
import * as path from 'path'
import * as t from 'io-ts'
import * as A from 'fp-ts/ReadonlyArray'
import * as E from 'fp-ts/Either'
import * as T from 'fp-ts/Task'
import * as TE from 'fp-ts/TaskEither'
import * as IO from 'fp-ts/IO'
import * as Console from 'fp-ts/Console'
import * as PathReporter from 'io-ts/lib/PathReporter'
import { withEncode, decodeDocopt as decodeDocopt_ } from 'io-ts-docopt'
import { Endomorphism, identity, pipe, flow, constVoid } from 'fp-ts/function'
import { nonEmptyArray, withFallback } from 'io-ts-types'
import { StringifiedJSON } from '@typescript-tools/io-ts/dist/lib/StringifiedJSON'
import { trace } from '@strong-roots-capital/trace'
import glob from 'fast-glob'

const debug = {
  cmd: Debug('tsconfig-includes'),
}

const defaultIncludes = () => ['**/*']

const Includes = t.array(t.string)
type Includes = t.TypeOf<typeof Includes>

const TSConfig = t.type({
  include: withFallback(Includes, defaultIncludes()),
})
type TSConfig = t.TypeOf<typeof TSConfig>

const docstring = `
Usage:
    tsconfig-includes <tsconfig>...

Options:
    tsconfig    Path to tsconfig for which to enumerate included files
`

const CommandLineOptions = withEncode(
  t.type({
    '<tsconfig>': nonEmptyArray(t.string),
  }),
  (a) => ({
    tsconfigs: a['<tsconfig>'],
  }),
)

type Err =
  | { type: 'docopt decode'; error: string }
  | {
      type: 'unable to read file'
      filename: string
      error: NodeJS.ErrnoException
    }
  | { type: 'unable to parse tsconfig'; error: string }
  | { type: 'unable to resolve globs'; globs: Includes; error: Error }

const err: Endomorphism<Err> = identity

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

const readFile = (filename: string) =>
  TE.tryCatch(
    async () =>
      new Promise<string>((resolve, reject) =>
        fs.readFile(filename, 'utf8', (error, data) =>
          error !== null && error !== undefined ? reject(error) : resolve(data),
        ),
      ),
    flow(E.toError, (error) => err({ type: 'unable to read file', filename, error })),
  )

const readTsconfig = flow(
  readFile,
  TE.chain(
    flow(
      StringifiedJSON(TSConfig).decode.bind(null),
      E.mapLeft(
        flow(
          (errors) => PathReporter.failure(errors).join('\n'),
          (error) => err({ type: 'unable to parse tsconfig', error }),
        ),
      ),
      TE.fromEither,
    ),
  ),
  TE.map(trace(debug.cmd, 'tsconfig')),
)

const resolveIncludes = (tsconfig: string) => (includes: Includes) => {
  const cwd = path.dirname(tsconfig)
  return pipe(
    TE.tryCatch(
      async () => glob(includes, { cwd }),
      flow(E.toError, (error) =>
        err({ type: 'unable to resolve globs', globs: includes, error }),
      ),
    ),
    TE.map(A.map((a) => path.join(cwd, a))),
  )
}

const exit = (code: 0 | 1) => () => process.exit(code)

const main: T.Task<void> = pipe(
  decodeDocopt(CommandLineOptions, docstring, {
    argv: [
      ...process.argv.slice(2),
      // file descriptor '0' is stdin
      ...(!process.stdin.isTTY
        ? fs.readFileSync('/dev/stdin', 'utf-8').trim().split(/\s+/)
        : []),
    ],
  }),
  TE.chain(({ tsconfigs }) =>
    pipe(
      tsconfigs,
      A.filter((s) => s.length > 0),
      A.map((tsconfig) =>
        pipe(
          readTsconfig(tsconfig),
          TE.chain(({ include }) => resolveIncludes(tsconfig)(include)),
          TE.chain(flow(A.map(Console.log), IO.sequenceArray, TE.fromIO)),
        ),
      ),
      TE.sequenceArray,
    ),
  ),
  TE.map(constVoid),
  TE.getOrElseW(
    flow(
      Console.error,
      IO.chain(() => exit(1)),
      T.fromIO,
    ),
  ),
)

main()

// Local Variables:
// mode: typescript
// End:
