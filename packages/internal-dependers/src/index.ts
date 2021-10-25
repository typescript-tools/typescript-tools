#!/usr/bin/env node

/**
 * internal-dependers
 * Calculate dependents of a package in the same monorepo
 */

import * as fs from 'fs'
import * as path from 'path'

import { dependerGraph } from '@typescript-tools/depender-graph'
import { findPackageIn } from '@typescript-tools/find-package'
import { PackageName } from '@typescript-tools/io-ts'
import { lernaPackages } from '@typescript-tools/lerna-packages'
import { monorepoRoot } from '@typescript-tools/monorepo-root'
import { DocoptOption } from 'docopt'
import * as Console from 'fp-ts/Console'
import * as E from 'fp-ts/Either'
import * as IO from 'fp-ts/IO'
import * as O from 'fp-ts/Option'
import { ordString } from 'fp-ts/Ord'
import * as A from 'fp-ts/ReadonlyArray'
import * as T from 'fp-ts/Task'
import * as TE from 'fp-ts/TaskEither'
import { pipe, flow, constant } from 'fp-ts/function'
import * as t from 'io-ts'
import { withEncode, decodeDocopt as decodeDocopt_ } from 'io-ts-docopt'
import * as PathReporter from 'io-ts/lib/PathReporter'
import { match } from 'ts-pattern'

const docstring = `
Usage:
    internal-dependers [--root <root>] [--path] <package>...

Options:
    packages         Package names or paths to print dependers of (also reads from stdin)
    --root=<root>    Root of lerna mono-repository
    --path           Print the relative path to each package from root
`

const CommandLineOptions = withEncode(
  t.type({
    '<package>': t.array(PackageName),
    '--path': t.boolean,
    '--root': t.union([t.null, t.string]),
  }),
  (a) => ({
    root: a['--root'] !== null ? a['--root'] : undefined,
    packages: a['<package>'],
    mode: a['--path'] ? 'path' : 'name',
  }),
)

type CommandLineOptions = t.OutputOf<typeof CommandLineOptions>

const unary = <A, B>(f: (a: A) => B) => (a: A): B => f(a)

const findMonorepoRoot = (a: CommandLineOptions) =>
  pipe(
    O.fromNullable(a.root),
    O.fold(monorepoRoot, E.right),
    E.map((root) => Object.assign(a, { root })),
    TE.fromEither,
  )

const decodeDocopt = <C extends t.Mixed>(
  codec: C,
  docstring: string,
  options: DocoptOption,
) =>
  pipe(
    decodeDocopt_(codec, docstring, options),
    E.mapLeft(
      (error) =>
        ({
          type: 'docopt decode',
          error: PathReporter.failure(error).join('\n'),
        } as const),
    ),
    TE.fromEither,
    TE.chainW(findMonorepoRoot),
  )

const exit = (code: 0 | 1): IO.IO<void> => () => process.exit(code)

const main: T.Task<void> = pipe(
  TE.bindTo('options')(
    decodeDocopt(CommandLineOptions, docstring, {
      argv: [
        ...process.argv.slice(2),
        // file descriptor '0' is stdin
        ...(!process.stdin.isTTY
          ? fs.readFileSync('/dev/stdin', 'utf-8').trim().split('\n')
          : []),
      ],
    }),
  ),
  TE.bindW('packages', ({ options }) => lernaPackages(options.root)),
  TE.bindW('dependencies', ({ options, packages }) =>
    pipe(
      dependerGraph({ root: options.root }),
      TE.chainW((graph) =>
        pipe(
          options.packages,
          TE.traverseArray(findPackageIn(packages)),
          TE.map(
            A.chain((pkg) =>
              pipe(
                O.fromNullable(graph.get(pkg.name)),
                O.getOrElseW(constant(A.empty)),
              ),
            ),
          ),
        ),
      ),
    ),
  ),
  TE.map(({ options, dependencies }) =>
    match(options.mode)
      .with('path', () =>
        dependencies
          .map((_) => _.location)
          .map((location) => path.relative(options.root, location)),
      )
      .otherwise(() => dependencies.map((_) => _.name)),
  ),
  TE.map(A.uniq(ordString)),
  TE.map((dependencies: readonly string[]) => dependencies.forEach(unary(console.log))),
  TE.fold(
    flow(
      Console.error,
      IO.chain(() => exit(1)),
      T.fromIO,
    ),
    constant(T.of(undefined)),
  ),
)

main()

// Local Variables:
// mode: typescript
// End:
