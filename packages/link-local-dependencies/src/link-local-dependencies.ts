#!/usr/bin/env node

import * as Console from 'fp-ts/Console'
import * as E from 'fp-ts/Either'
import * as IO from 'fp-ts/IO'
import * as T from 'fp-ts/Task'
import * as TE from 'fp-ts/TaskEither'
import { pipe, flow } from 'fp-ts/function'
import * as t from 'io-ts'
import { withEncode, decodeDocopt as decodeDocopt_ } from 'io-ts-docopt'
import * as PathReporter from 'io-ts/lib/PathReporter'

import { lernaPackages } from './lerna-packages'

import { linkLocalDependenciesIn, linkAllLocalDependencies } from './index'

const docstring = `
Usage:
    link-local-dependencies [<package>]

Options:
    package    Path or name of single package for which to install local dependencies
`

const CommandLineOptions = withEncode(
  t.type({
    '<package>': t.union([t.null, t.string]),
  }),
  (a) => ({
    pkg: a['<package>'],
  }),
)

const decodeDocopt = flow(
  decodeDocopt_,
  E.mapLeft(
    flow(
      (errors) => PathReporter.failure(errors).join('\n'),
      (error) => ({ type: 'docopt decode', error } as const),
    ),
  ),
  TE.fromEither,
)

const exit = (code: 0 | 1) => () => process.exit(code)

const main: T.Task<void> = pipe(
  TE.bindTo('options')(decodeDocopt(CommandLineOptions, docstring)),
  // FIXME: process.cwd should instead be exposed as a parameter
  TE.bindW('packages', () => lernaPackages(process.cwd())),
  TE.chainW(({ options, packages }) =>
    options.pkg !== null
      ? linkLocalDependenciesIn(packages.map)(options.pkg)
      : linkAllLocalDependencies(packages.map, packages.list),
  ),
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
