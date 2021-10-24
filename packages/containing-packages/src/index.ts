#!/usr/bin/env node

/**
 * configure-lerna-manifest
 * Configure lerna manifest properties
 */

import * as fs from 'fs'
import * as path from 'path'

import { LernaPackage } from '@typescript-tools/io-ts/dist/lib/LernaPackage'
import { PackageName } from '@typescript-tools/io-ts/dist/lib/PackageName'
import { Path } from '@typescript-tools/io-ts/dist/lib/Path'
import { lernaPackages as lernaPackages_ } from '@typescript-tools/lerna-packages'
import { monorepoRoot } from '@typescript-tools/monorepo-root'
import { DocoptOption } from 'docopt'
import * as Console from 'fp-ts/Console'
import * as E from 'fp-ts/Either'
import { eqString } from 'fp-ts/Eq'
import * as IO from 'fp-ts/IO'
import * as M from 'fp-ts/Map'
import * as O from 'fp-ts/Option'
import * as A from 'fp-ts/ReadonlyArray'
import { getFirstSemigroup } from 'fp-ts/Semigroup'
import * as T from 'fp-ts/Task'
import * as TE from 'fp-ts/TaskEither'
import { pipe, flow } from 'fp-ts/function'
import * as t from 'io-ts'
import { withEncode, decodeDocopt as decodeDocopt_ } from 'io-ts-docopt'
import * as PathReporter from 'io-ts/lib/PathReporter'

const docstring = `
Usage:
    containing-packages [--root <root>] <file>...

Options:
    --root=<root>    Root of lerna mono-repository
`

const CommandLineOptions = withEncode(
  t.type({
    '<file>': t.array(t.string),
    '--root': t.union([t.null, t.string]),
  }),
  (a) => ({
    root: a['--root'] !== null ? a['--root'] : undefined,
    files: a['<file>'],
  }),
)

type CommandLineOptions = t.OutputOf<typeof CommandLineOptions>

const findMonorepoRoot = (a: CommandLineOptions) =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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

/**
 * Create a Map<PackageName | PackagePath, LernaPackage> for easy look-ups.
 */
const lernaPackages = flow(
  lernaPackages_,
  TE.map((packages) =>
    pipe(
      packages,
      A.chain((pkg): [[PackageName, LernaPackage], [Path, LernaPackage]] => [
        [pkg.name, pkg],
        [pkg.location, pkg],
      ]),
      M.fromFoldable(eqString, getFirstSemigroup<LernaPackage>(), A.readonlyArray),
      (packagesMap) => ({ list: packages, map: packagesMap }),
    ),
  ),
)

const containingPackage = (root: string, packages: Map<string, LernaPackage>) => (
  file: string,
): O.Option<LernaPackage> => {
  // path.dirname returns '/' or '.' in the base case
  while (file.length > 1) {
    const searchPath = path.join(root, file)
    const match = packages.get(searchPath)
    if (match !== undefined) {
      return O.some(match)
    }

    file = path.dirname(file)
  }

  return O.none
}

const exit = (code: 0 | 1): IO.IO<void> => () => process.exit(code)

const main: T.Task<void> = pipe(
  decodeDocopt(CommandLineOptions, docstring, {
    argv: [
      ...process.argv.slice(2),
      ...(!process.stdin.isTTY
        ? fs.readFileSync('/dev/stdin', 'utf-8').trim().split('\n')
        : []),
    ],
  }),
  TE.chainW((options) =>
    pipe(
      lernaPackages(),
      TE.map((packages) =>
        pipe(
          options.files,
          A.chain(
            flow(
              containingPackage(options.root, packages.map),
              O.fold(
                () => [],
                (_) => [_.name],
              ),
            ),
          ),
          A.uniq(eqString),
          (packages) => packages.join('\n'),
        ),
      ),
    ),
  ),
  TE.fold(
    flow(
      T.fromIOK(Console.error),
      T.chainIOK(() => exit(1)),
    ),
    T.fromIOK(Console.log),
  ),
)

main()

// Local Variables:
// mode: typescript
// End:
