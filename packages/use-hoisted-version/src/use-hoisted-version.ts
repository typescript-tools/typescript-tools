#!/usr/bin/env node

/**
 * use-hoisted-version
 * Update lerna package to use hoisted version of npm dependency
 */

import * as path from 'path'

import { trace } from '@strong-roots-capital/trace'
import {
  hoistedPackages,
  PackageManifestsError,
} from '@typescript-tools/hoisted-packages'
import {
  PackageJsonDependencies,
  PackageName,
  PackageVersion,
  StringifiedJSON,
} from '@typescript-tools/io-ts'
import {
  readFile as readFile_,
  writeFile as writeFile_,
} from '@typescript-tools/lerna-utils'
import { monorepoRoot, MonorepoRootError } from '@typescript-tools/monorepo-root'
import { stringifyJSON } from '@typescript-tools/stringify-json'
import Debug from 'debug'
import deepEqual from 'fast-deep-equal'
import * as Console from 'fp-ts/Console'
import * as E from 'fp-ts/Either'
import * as IO from 'fp-ts/IO'
import * as O from 'fp-ts/Option'
import * as R from 'fp-ts/Record'
import * as T from 'fp-ts/Task'
import * as TE from 'fp-ts/TaskEither'
import { pipe, flow, constant } from 'fp-ts/function'
import * as t from 'io-ts'
import * as D from 'io-ts-docopt'
import { withEncode } from 'io-ts-docopt'
import * as PathReporter from 'io-ts/lib/PathReporter'
import { mod } from 'shades'
import { match } from 'ts-pattern'

const debug = {
  cmd: Debug('hoist'),
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
  (a) => ({
    package: a['<package>'],
  }),
)

type Err =
  | MonorepoRootError
  | PackageManifestsError
  | { type: 'docopt decode'; error: string }
  | { type: 'package not in monorepo' }
  | { type: 'unable to read file'; filename: string; error: NodeJS.ErrnoException }
  | { type: 'unable to parse file'; filename: string; error: string }
  | { type: 'unable to write file'; filename: string; error: unknown }
  | { type: 'unable to stringify package.json'; error: Error }
  | { type: 'no-op' }

// Widens the type of a particular Err into Err
const err = (error: Err): Err => error

const decodeDocopt = flow(
  D.decodeDocopt,
  E.mapLeft((error) =>
    err({ type: 'docopt decode', error: PathReporter.failure(error).join('\n') }),
  ),
  TE.fromEither,
)

const readFile = (filename: string): TE.TaskEither<Err, string> =>
  pipe(
    readFile_(filename),
    TE.mapLeft((error) => err({ type: 'unable to read file', filename, error })),
  )

const writeFile = (filename: string) => (contents: string) =>
  pipe(
    contents,
    trace(debug.cmd, `Writing file ${filename}`),
    writeFile_(filename),
    TE.mapLeft((error) => err({ type: 'unable to write file', filename, error })),
  )

const updateDependencies = (packageJson: string) => (
  hoistedPackages: Map<PackageName, PackageVersion>,
) => {
  const withHoistedDependencies = (
    deps: Record<PackageName, PackageVersion> | undefined,
  ): Record<PackageName, PackageVersion> | undefined =>
    pipe(
      O.fromNullable(deps),
      O.map(
        R.reduceWithIndex(
          {} as Record<PackageName, PackageVersion>,
          (pkg, acc, version) =>
            Object.assign(acc, {
              [pkg]: O.getOrElse(constant(version))(
                O.fromNullable(hoistedPackages.get(pkg)),
              ),
            }),
        ),
      ),
      O.toUndefined,
    )

  return pipe(
    readFile(packageJson),
    TE.chain((contents) =>
      pipe(
        StringifiedJSON(PackageJsonDependencies).decode(contents),
        E.map((originalJson) =>
          pipe(
            originalJson,
            mod('dependencies')(withHoistedDependencies),
            mod('devDependencies')(withHoistedDependencies),
            mod('optionalDependencies')(withHoistedDependencies),
            mod('peerDependencies')(withHoistedDependencies),
            R.filter((value) => value !== undefined),
            (updatedJson) =>
              deepEqual(originalJson, updatedJson) ? O.none : O.some(updatedJson),
          ),
        ),
        E.mapLeft((errors) => PathReporter.failure(errors).join('\n')),
        E.mapLeft((error) =>
          err({ type: 'unable to parse file', filename: packageJson, error }),
        ),
        TE.fromEither,
      ),
    ),
    TE.chain((updates) =>
      pipe(
        updates,
        E.fromOption(() => err({ type: 'no-op' })),
        E.map(trace(debug.cmd, 'Updating file', packageJson)),
        E.chain(
          flow(
            stringifyJSON(E.toError),
            E.mapLeft((error) =>
              err({ type: 'unable to stringify package.json', error }),
            ),
          ),
        ),
        TE.fromEither,
        TE.chain((updates) =>
          pipe(
            writeFile(packageJson)(updates),
            TE.mapLeft((error) =>
              err({ type: 'unable to write file', filename: packageJson, error }),
            ),
          ),
        ),
        TE.orElse((error) =>
          match<Err, TE.TaskEither<Err, void>>(error)
            .with({ type: 'no-op' }, () => TE.of(undefined))
            .otherwise(() => TE.left(error)),
        ),
      ),
    ),
  )
}

const main: T.Task<void> = pipe(
  decodeDocopt(CommandLineOptions, docstring),
  TE.chain((options) =>
    pipe(
      monorepoRoot(options.package) as E.Either<Err, string>,
      E.map((root) => ({ options, root })),
      TE.fromEither,
    ),
  ),
  TE.chain(({ options, root }) =>
    pipe(
      hoistedPackages(root),
      TE.chain(updateDependencies(path.resolve(options.package, 'package.json'))),
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

//  LocalWords:  packageJson devDependencies optionalDependencies

// Local Variables:
// mode: typescript
// End:
