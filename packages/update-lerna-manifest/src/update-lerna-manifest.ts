#!/usr/bin/env node

/**
 * update-lerna-manifest
 * Keep the lerna manifest up to date
 */

import * as fs from 'fs'
import * as path from 'path'
import * as t from 'io-ts'
import * as RA from 'fp-ts/ReadonlyArray'
import * as E from 'fp-ts/Either'
import * as O from 'fp-ts/Option'
import * as RNEA from 'fp-ts/ReadonlyNonEmptyArray'
import * as D from 'io-ts-docopt'
import * as T from 'fp-ts/Task'
import * as TE from 'fp-ts/TaskEither'
import * as IO from 'fp-ts/IO'
import * as Console from 'fp-ts/Console'
import * as PathReporter from 'io-ts/lib/PathReporter'
import Debug from 'debug'
import deepEqual from 'fast-deep-equal'
import findUp from 'find-up'
import glob from 'fast-glob'
import { ordString } from 'fp-ts/Ord'
import { pipe, flow, constant } from 'fp-ts/function'
import { withEncode } from 'io-ts-docopt'
import { match } from 'ts-pattern'
import { StringifiedJSON } from '@typescript-tools/io-ts/dist/lib/StringifiedJSON'
import { trace } from '@strong-roots-capital/trace'
import { stringifyJSON } from '@typescript-tools/stringify-json'
import {
  readFile as readFile_,
  writeFile as writeFile_,
} from '@typescript-tools/lerna-utils'
import { StringEndingWithTsconfigSettingsJson } from './string-ending-with-tsconfig-settings-json'

const debug = {
  manifest: Debug('manifest'),
}

const docstring = `
Usage:
    update-lerna-manifest [--root <root>] [--depth <depth>] <dirs>...

Options:
    <dirs>             Directories to recursively search for lerna packages
    --root=<root>      Root of lerna mono-repository
    --depth=<depth>    Maximum directory depth in package search
`

const CommandLineOptions = withEncode(
  t.type({
    '<dirs>': t.array(t.string),
    '--root': t.union([t.string, t.null]),
    '--depth': t.union([t.number, t.null]),
  }),
  (a) => ({
    dirs: a['<dirs>'],
    root: a['--root'],
    depth: a['--depth'],
  }),
)

type CommandLineOptions = typeof CommandLineOptions['_O']

type Err =
  | { type: 'docopt decode'; error: string }
  | { type: 'found no matching packages' }
  | { type: 'package not in monorepo' }
  | { type: 'unable to stringify json'; json: unknown; error: Error }
  | { type: 'unable to read file'; error: NodeJS.ErrnoException }
  | { type: 'unable to write file'; error: NodeJS.ErrnoException }
  | { type: 'json parse error'; filename: string; error: string }
  | { type: 'no-op' } // not an error, was lazy of me to put here. I regret it already

// Widens the type of a particular Err into Err
const err = (error: Err): Err => error

const decodeDocopt = flow(
  D.decodeDocopt,
  E.mapLeft(
    flow(
      (errors) => PathReporter.failure(errors).join('\n'),
      (error) => err({ type: 'docopt decode', error }),
    ),
  ),
  TE.fromEither,
)

const decode = <C extends t.Mixed>(codec: C) => (filename: string) => (
  contents: unknown,
) =>
  pipe(
    codec.decode(contents),
    E.mapLeft(
      flow(
        (errors) => PathReporter.failure(errors).join('\n'),
        (error) => err({ type: 'json parse error', filename, error }),
      ),
    ),
  )

const findup = flow(
  findUp.sync as (
    name: string | readonly string[],
    options?: findUp.Options,
  ) => string | undefined,
  O.fromNullable,
  O.map(path.dirname),
  E.fromOption(() => err({ type: 'package not in monorepo' })),
)

const readFile = (file: fs.PathLike) =>
  pipe(
    readFile_(file),
    TE.mapLeft((error) => err({ type: 'unable to read file', error })),
  )

const writeFile = (file: fs.PathLike) => (contents: string) =>
  pipe(
    writeFile_(file)(contents),
    TE.mapLeft((error) => err({ type: 'unable to write file', error })),
  )

const main: T.Task<void> = pipe(
  TE.Do,
  TE.bind('options', () => decodeDocopt(CommandLineOptions, docstring)),
  TE.chain(({ options }) =>
    pipe(
      glob.sync(
        // TODO: use monorepo-root package
        options.dirs.map((glob) =>
          path.resolve(options.root ?? '', glob, '**', 'tsconfig.json'),
        ),
        {
          followSymbolicLinks: false,
          onlyFiles: true,
          unique: true,
          deep: options.depth ?? 3,
          ignore: ['node_modules/**'],
        },
      ),
      (candidates) => {
        const isCandidate = (candidate: string) =>
          pipe(
            readFile(candidate),
            TE.chain((contents) =>
              TE.of({
                file: candidate,
                isLernaPackage: StringifiedJSON(
                  t.type({
                    extends: StringEndingWithTsconfigSettingsJson,
                  }),
                ).is(contents),
              }),
            ),
          )

        return TE.sequenceArray(candidates.map(isCandidate))
      },
      TE.chain(
        flow(
          RA.filter(
            ({ isLernaPackage }: { file: string; isLernaPackage: boolean }) =>
              isLernaPackage,
          ),
          RA.map(({ file }) => file),
          RNEA.fromReadonlyArray,
          E.fromOption(() => err({ type: 'found no matching packages' })),
          E.chain((packages) =>
            pipe(
              findup('lerna.json', {
                cwd: options.root ?? RNEA.head(packages),
              }),
              E.map((root) => ({
                root,
                packages: pipe(
                  packages,
                  RA.map((pkg) => path.relative(root, pkg)),
                  RA.map(path.dirname),
                  RA.sort(ordString),
                ),
              })),
            ),
          ),
          TE.fromEither,
        ),
      ),
      TE.chain(({ root, packages }: { root: string; packages: readonly string[] }) =>
        pipe(
          readFile(path.join(root, 'lerna.json')),
          TE.chain((contents) => {
            const LernaManifest = StringifiedJSON(
              t.type({
                packages: t.array(t.string),
              }),
            )
            return pipe(
              decode(LernaManifest)('lerna.json')(contents),
              E.chain((manifest) =>
                deepEqual(manifest.packages, packages)
                  ? E.left({ type: 'no-op' } as Err)
                  : E.right(((manifest.packages = packages), manifest)),
              ),
              E.chain((json) =>
                pipe(
                  stringifyJSON(E.toError)(json),
                  E.map(trace(debug.manifest, 'Updating lerna manifest')),
                  E.mapLeft((error) =>
                    err({
                      type: 'unable to stringify json',
                      json,
                      error,
                    }),
                  ),
                ),
              ),
              TE.fromEither,
              TE.chain(writeFile(path.join(root, 'lerna.json'))),
            )
          }),
          // do not report a no-op as an error
          TE.orElse((err) =>
            match<Err, TE.TaskEither<Err, void>>(err)
              .with({ type: 'no-op' }, () => TE.of(undefined))
              .otherwise(() => TE.left(err)),
          ),
        ),
      ),
    ),
  ),
  TE.fold(
    flow(
      Console.error,
      IO.chain(() => process.exit(1) as IO.IO<void>),
      T.fromIO,
    ),
    constant(T.of(undefined)),
  ),
)

main()

// Local Variables:
// mode: typescript
// End:
