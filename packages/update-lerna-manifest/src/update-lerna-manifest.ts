#!/usr/bin/env node

/**
 * update-lerna-manifest
 * Keep the lerna manifest up to date
 */

import * as fs from 'fs'
import * as path from 'path'

import { trace } from '@strong-roots-capital/trace'
import { StringifiedJSON } from '@typescript-tools/io-ts'
import {
  readFile as readFile_,
  writeFile as writeFile_,
} from '@typescript-tools/lerna-utils'
import { stringifyJSON } from '@typescript-tools/stringify-json'
import Debug from 'debug'
import deepEqual from 'fast-deep-equal'
import glob from 'fast-glob'
import findUp from 'find-up'
import * as Console from 'fp-ts/Console'
import * as E from 'fp-ts/Either'
import * as IO from 'fp-ts/IO'
import * as O from 'fp-ts/Option'
import { ordString } from 'fp-ts/Ord'
import * as RA from 'fp-ts/ReadonlyArray'
import * as RNEA from 'fp-ts/ReadonlyNonEmptyArray'
import * as T from 'fp-ts/Task'
import * as TE from 'fp-ts/TaskEither'
import { pipe, flow, constVoid } from 'fp-ts/function'
import * as t from 'io-ts'
import * as D from 'io-ts-docopt'
import { withEncode } from 'io-ts-docopt'
import * as PathReporter from 'io-ts/lib/PathReporter'
import { match } from 'ts-pattern'

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

type RecoverableErrors = { type: 'no-op' }

type UnrecoverableErrors =
  | { type: 'docopt decode'; error: string }
  | { type: 'found no matching packages' }
  | { type: 'package not in monorepo' }
  | { type: 'unable to stringify json'; json: unknown; error: Error }
  | { type: 'unable to read file'; error: NodeJS.ErrnoException }
  | { type: 'unable to write file'; error: NodeJS.ErrnoException }
  | { type: 'json parse error'; filename: string; error: string }

type Err = RecoverableErrors | UnrecoverableErrors

const decodeDocopt = flow(
  D.decodeDocopt,
  E.mapLeft(
    flow(
      (errors) => PathReporter.failure(errors).join('\n'),
      (error) => ({ type: 'docopt decode', error } as const),
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
        (error) => ({ type: 'json parse error', filename, error } as const),
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
  E.fromOption(() => ({ type: 'package not in monorepo' } as const)),
)

const readFile = (file: fs.PathLike) =>
  pipe(
    readFile_(file),
    TE.mapLeft((error) => ({ type: 'unable to read file', error } as const)),
  )

const writeFile = (file: fs.PathLike) => (contents: string) =>
  pipe(
    writeFile_(file)(contents),
    TE.mapLeft((error) => ({ type: 'unable to write file', error } as const)),
  )

const exit = (code: 0 | 1): IO.IO<void> => () => process.exit(code)

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
      TE.chainW(
        flow(
          RA.filter(
            ({ isLernaPackage }: { file: string; isLernaPackage: boolean }) =>
              isLernaPackage,
          ),
          RA.map(({ file }) => file),
          RNEA.fromReadonlyArray,
          E.fromOption(() => ({ type: 'found no matching packages' } as const)),
          E.chainW((packages) =>
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
      TE.chainW(({ root, packages }: { root: string; packages: readonly string[] }) =>
        pipe(
          readFile(path.join(root, 'lerna.json')),
          TE.chainW((contents) => {
            const LernaManifest = StringifiedJSON(
              t.type({
                packages: t.array(t.string),
              }),
            )
            return pipe(
              decode(LernaManifest)('lerna.json')(contents),
              E.chainW((manifest) =>
                deepEqual(manifest.packages, packages)
                  ? E.left({ type: 'no-op' } as const)
                  : E.right((manifest.packages = packages, manifest)),
              ),
              E.chainW((json) =>
                pipe(
                  stringifyJSON(E.toError)(json),
                  E.map(trace(debug.manifest, 'Updating lerna manifest')),
                  E.mapLeft(
                    (error) =>
                      ({
                        type: 'unable to stringify json',
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                        json,
                        error,
                      } as const),
                  ),
                ),
              ),
              TE.fromEither,
              TE.chainW(writeFile(path.join(root, 'lerna.json'))),
            )
          }),
          // do not report a no-op as an error
          TE.orElse((err) =>
            match<Err, TE.TaskEither<Err, void>>(err)
              .with({ type: 'no-op' }, () => TE.of(constVoid()))
              .otherwise(() => TE.left(err)),
          ),
        ),
      ),
    ),
  ),
  TE.fold(
    flow(
      T.fromIOK(Console.error),
      T.chainIOK(() => exit(1)),
    ),
    () => T.of(constVoid()),
  ),
)

main()

// Local Variables:
// mode: typescript
// End:
