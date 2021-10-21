#!/usr/bin/env node

import * as t from 'io-ts'
import * as E from 'fp-ts/Either'
import * as T from 'fp-ts/Task'
import * as TE from 'fp-ts/TaskEither'
import * as IO from 'fp-ts/IO'
import * as Console from 'fp-ts/Console'
import * as PathReporter from 'io-ts/lib/PathReporter'
import { pipe, flow, Endomorphism, identity } from 'fp-ts/lib/function'
import { withEncode, decodeDocopt as decodeDocopt_ } from 'io-ts-docopt'
import { PackageDiscoveryError } from '@typescript-tools/lerna-packages'
import {
  linkLocalDependenciesIn as linkLocalDependenciesIn_,
  linkAllLocalDependencies as linkAllLocalDependencies_,
  LinkLocalDependenciesError as LinkLocalDependenciesError_,
} from './index'
import { LernaPackage } from '@typescript-tools/io-ts/dist/lib/LernaPackage'
import { lernaPackages as lernaPackages_ } from './lerna-packages'

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

type LinkLocalDependenciesError =
  | LinkLocalDependenciesError_
  | PackageDiscoveryError
  | { type: 'docopt decode'; error: string }

const err: Endomorphism<LinkLocalDependenciesError> = identity

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

const linkLocalDependencies = (packages: Map<string, LernaPackage>) =>
  flow(linkLocalDependenciesIn_(packages), TE.mapLeft(err))

const linkAllLocalDependencies = flow(linkAllLocalDependencies_, TE.mapLeft(err))

const lernaPackages = flow(lernaPackages_, TE.mapLeft(err))

const exit = (code: 0 | 1) => () => process.exit(code)

const main: T.Task<void> = pipe(
  TE.bindTo('options')(decodeDocopt(CommandLineOptions, docstring)),
  // FIXME: process.cwd should instead be exposed as a parameter
  TE.bind('packages', () => lernaPackages(process.cwd())),
  TE.chain(({ options, packages }) =>
    options.pkg
      ? linkLocalDependencies(packages.map)(options.pkg)
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
