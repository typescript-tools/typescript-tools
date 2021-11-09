#!/usr/bin/env node

/**
 * pin-lerna-package-versions
 * Pin lerna dependencies to latest managed version
 */

import * as path from 'path'

import { trace } from '@strong-roots-capital/trace'
import {
  LernaPackage,
  PackageJsonDependencies,
  PackageName,
  PackageVersion,
  StringifiedJSON,
} from '@typescript-tools/io-ts'
import { lernaPackages, PackageDiscoveryError } from '@typescript-tools/lerna-packages'
import {
  readFile as readFile_,
  writeFile as writeFile_,
} from '@typescript-tools/lerna-utils'
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
import { withEncode, decodeDocopt as decodeDocopt_ } from 'io-ts-docopt'
import * as PathReporter from 'io-ts/lib/PathReporter'
import { mod } from 'shades'
import { match } from 'ts-pattern'

const debug = {
  cmd: Debug('pin'),
}

const docstring = `
Usage:
    pin-lerna-package-versions [--dist-tag=<tag>] [<root>]

Options:
    root                Root of lerna mono-repository, defaults to cwd
    --dist-tag=<tag>    Pin versions of internal packages to dist tag
`

const CommandLineOptions = withEncode(
  t.type({
    '<root>': t.union([t.null, t.string]),
    '--dist-tag': t.union([t.null, PackageVersion]),
  }),
  (a) =>
    pipe(
      {
        root: a['<root>'] !== null ? a['<root>'] : undefined,
        distTag: a['--dist-tag'] !== null ? a['--dist-tag'] : undefined,
      },
      (value) => {
        // FIXME: interested in a better pattern around this
        if (a['--dist-tag'] === null) {
          delete value.distTag
        }
        return value
      },
    ),
)

type CommandLineOptions = t.TypeOf<typeof CommandLineOptions>

type Err =
  | PackageDiscoveryError
  | { type: 'docopt decode'; error: string }
  | { type: 'unexpected file contents'; filename: string; error: string }
  | { type: 'unable to read file'; filename: string; error: NodeJS.ErrnoException }
  | { type: 'unable to write file'; filename: string; error: NodeJS.ErrnoException }

// Widens the type of a particular Err into Err
const err = (error: Err): Err => error

const decodeDocopt = flow(
  decodeDocopt_,
  E.mapLeft((errors) => PathReporter.failure(errors).join('\n')),
  E.mapLeft((error) => err({ type: 'docopt decode', error })),
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

function packageDictionary(
  packages: LernaPackage[],
): Record<PackageName, PackageVersion> {
  return packages.reduce(
    (acc, { name, version }) => Object.assign(acc, { [name]: `^${version}` }),
    {} as Record<PackageName, PackageVersion>,
  )
}

function updateDependencies(
  dependencies: Record<PackageName, PackageVersion>,
  distTag?: PackageVersion,
) {
  return function updateDependenciesFor(packageJson: string) {
    type NoChanges = { type: 'no-op' } | { type: 'error'; error: Error }

    const withLatestDependencies = (
      deps: Record<PackageName, PackageVersion> | undefined,
    ): Record<PackageName, PackageVersion> | undefined =>
      pipe(
        O.fromNullable(deps),
        O.map((deps) =>
          Object.entries(deps).reduce(
            (acc, [pkg, version]) =>
              Object.assign(acc, {
                [pkg]: pipe(
                  R.lookup(pkg)(dependencies),
                  O.map((internalVersion) =>
                    O.getOrElse(constant(internalVersion))(O.fromNullable(distTag)),
                  ),
                  O.getOrElse(constant(version)),
                ),
              }),
            {} as Record<PackageName, PackageVersion>,
          ),
        ),
        O.toUndefined,
      )

    return pipe(
      readFile(packageJson),
      TE.chain(
        (string): TE.TaskEither<Err, O.Option<PackageJsonDependencies>> =>
          pipe(
            StringifiedJSON(PackageJsonDependencies).decode(string),
            E.map((originalJson) =>
              pipe(
                originalJson,
                mod('dependencies')(withLatestDependencies),
                mod('devDependencies')(withLatestDependencies),
                mod('optionalDependencies')(withLatestDependencies),
                mod('peerDependencies')(withLatestDependencies),
                R.filter((value) => value !== undefined),
                (updatedJson) =>
                  deepEqual(originalJson, updatedJson) ? O.none : O.some(updatedJson),
              ),
            ),
            E.mapLeft(
              flow(
                (errors) => PathReporter.failure(errors).join('\n'),
                (error) =>
                  err({
                    type: 'unexpected file contents',
                    filename: packageJson,
                    error,
                  }),
              ),
            ),
            TE.fromEither,
          ),
      ),
      TE.chain((updates) =>
        pipe(
          updates,
          E.fromOption((): NoChanges => ({ type: 'no-op' })),
          E.chain(
            flow(
              stringifyJSON(E.toError),
              E.mapLeft((error): NoChanges => ({ type: 'error', error })),
            ),
          ),
          E.map(writeFile(packageJson)),
          E.getOrElseW((error) =>
            match<NoChanges, TE.TaskEither<Err, void>>(error)
              .with({ type: 'no-op' }, () => TE.right(undefined))
              .with(
                { type: 'error' },
                ({ error }) => TE.left(error) as TE.TaskEither<Err, void>,
              )
              .run(),
          ),
        ),
      ),
    )
  }
}

const main: T.Task<void> = pipe(
  decodeDocopt(CommandLineOptions, docstring),
  TE.chain((options) =>
    pipe(
      lernaPackages(options.root),
      TE.chain((packages) => {
        const dictionary = packageDictionary(packages)

        const packageJsons = packages.map(
          flow(
            (pkg) => pkg.location,
            (dir) => path.resolve(dir, 'package.json'),
          ),
        )

        return TE.sequenceArray(
          packageJsons.map(updateDependencies(dictionary, options.distTag)),
        )
      }),
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
