#!/usr/bin/env node

/**
 * configure-lerna-manifest
 * Configure lerna manifest properties
 */

import * as fs from 'fs'
import * as path from 'path'

import {
  LernaPackage,
  PackageName,
  Path,
  StringifiedJSON,
} from '@typescript-tools/io-ts'
import {
  PackageDiscoveryError,
  lernaPackages as lernaPackages_,
} from '@typescript-tools/lerna-packages'
import {
  readFile as readFile_,
  writeFile as writeFile_,
} from '@typescript-tools/lerna-utils'
import { monorepoRoot, MonorepoRootError } from '@typescript-tools/monorepo-root'
import { stringifyJSON as stringifyJSON_ } from '@typescript-tools/stringify-json'
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
    configure-lerna-manifest [--root <root>] --packages [<package>]...

Options:
    packages         Package names or paths to include in the lerna manifest (also reads from stdin)
    --root=<root>    Root of lerna mono-repository
`

const CommandLineOptions = withEncode(
  t.type({
    '<package>': t.array(PackageName),
    '--root': t.union([t.null, t.string]),
  }),
  (a) => ({
    root: a['--root'] !== null ? a['--root'] : undefined,
    packages: a['<package>'],
  }),
)

type CommandLineOptions = t.OutputOf<typeof CommandLineOptions>

const LernaManifest = StringifiedJSON(
  t.type({
    packages: t.array(t.string),
  }),
)

type Err =
  | MonorepoRootError
  | PackageDiscoveryError
  | { type: 'docopt decode'; error: string }
  | { type: 'unable to read lerna manifest'; error: NodeJS.ErrnoException }
  | { type: 'unable to decode lerna manifest'; error: string }
  | { type: 'unable to stringify manifest'; error: unknown }
  | { type: 'unable to write lerna manifest'; error: NodeJS.ErrnoException }
  | { type: 'unknown package'; package: string }

const readFile = (file: fs.PathLike) =>
  pipe(
    readFile_(file),
    TE.mapLeft((error) => ({ type: 'unable to read lerna manifest', error } as const)),
  )

const writeFile = (file: fs.PathLike) => (contents: string) =>
  pipe(
    writeFile_(file)(contents),
    TE.mapLeft((error) => ({ type: 'unable to write lerna manifest', error } as const)),
  )

const writeJson = (file: fs.PathLike) =>
  flow(
    stringifyJSON_(
      (error): Err => ({ type: 'unable to stringify manifest', error } as const),
    ),
    TE.fromEither,
    TE.chainW(writeFile(file)),
  )

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
    E.mapLeft((error) => ({
      type: 'docopt decode',
      error: PathReporter.failure(error).join('\n'),
    })),
    TE.fromEither,
    TE.chainW(findMonorepoRoot),
  )

const decodeLernaManifest = (manifest: string) =>
  pipe(
    LernaManifest.decode(manifest),
    E.mapLeft(
      flow(
        (errors) => PathReporter.failure(errors).join('\n'),
        (error) => ({ type: 'unable to decode lerna manifest', error }),
      ),
    ),
    TE.fromEither,
  )

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

const packagePath = (packages: Map<string, LernaPackage>) => (root: string) => (
  packagePathOrName: string,
) =>
  pipe(
    O.fromNullable(packages.get(packagePathOrName)),
    // search by absolute path if no match found yet
    O.alt(() => O.fromNullable(packages.get(path.join(root, packagePathOrName)))),
    // WISH: turn into a relative path (if necessary)
    O.map((_) => _.location),
    E.fromOption(
      (): Err => ({
        type: 'unknown package',
        package: packagePathOrName,
      }),
    ),
    TE.fromEither,
  )

const exit = (code: 0 | 1): IO.IO<void> => () => process.exit(code)

const main: T.Task<void> = pipe(
  decodeDocopt(CommandLineOptions, docstring, {
    argv: [
      ...process.argv.slice(2),
      ...(!process.stdin.isTTY
        ? fs
            .readFileSync('/dev/stdin', 'utf-8')
            .trim()
            .split('\n')
            .filter((s) => s.length > 0)
        : []),
    ],
  }),
  TE.chain((options) =>
    pipe(
      TE.Do,
      TE.bind('options', () => TE.right(options)),
      TE.bind('manifest', () =>
        pipe(
          readFile(path.join(options.root, 'lerna.json')),
          TE.chainW(decodeLernaManifest),
        ),
      ),
      TE.bindW('packages', () => lernaPackages(options.root)),
    ),
  ),
  TE.chainW(({ options, manifest, packages }) =>
    pipe(
      options.packages,
      TE.traverseArray(packagePath(packages.map)(options.root)),
      TE.map((packagePaths) => ({ options, manifest, packagePaths })),
    ),
  ),
  TE.chainW(({ options, manifest, packagePaths }) =>
    pipe(
      Object.assign(manifest, { packages: packagePaths }),
      writeJson(path.join(options.root, 'lerna.json')),
    ),
  ),
  TE.getOrElseW(
    flow(
      T.fromIOK(Console.error),
      T.chainIOK(() => exit(1)),
    ),
  ),
)

main()

// Local Variables:
// mode: typescript
// End:
