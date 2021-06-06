#!/usr/bin/env node

/**
 * configure-lerna-manifest
 * Configure lerna manifest properties
 */

import * as fs from 'fs'
import * as path from 'path'
import * as t from 'io-ts'
import * as A from 'fp-ts/ReadonlyArray'
import * as M from 'fp-ts/Map'
import * as E from 'fp-ts/Either'
import * as O from 'fp-ts/Option'
import * as T from 'fp-ts/Task'
import * as TE from 'fp-ts/TaskEither'
import * as IO from 'fp-ts/IO'
import * as Console from 'fp-ts/Console'
import * as PathReporter from 'io-ts/lib/PathReporter'
import { sequenceS } from 'fp-ts/Apply'
import { DocoptOption } from 'docopt'
import { pipe, flow, Endomorphism, identity, constVoid } from 'fp-ts/function'
import { withEncode, decodeDocopt as decodeDocopt_ } from 'io-ts-docopt'
import {
    monorepoRoot,
    MonorepoRootError,
} from '@typescript-tools/monorepo-root'
import { PackageName } from '@typescript-tools/io-ts/dist/lib/PackageName'
import { stringifyJSON as stringifyJSON_ } from '@typescript-tools/stringify-json'
import { PackageDiscoveryError } from '@typescript-tools/lerna-packages'
import { StringifiedJSON } from '@typescript-tools/io-ts/dist/lib/StringifiedJSON'
import { lernaPackages as lernaPackages_ } from '@typescript-tools/lerna-packages'
import { LernaPackage } from '@typescript-tools/io-ts/dist/lib/LernaPackage'
import { eqString } from 'fp-ts/Eq'
import { Path } from '@typescript-tools/io-ts/dist/lib/Path'
import { getFirstSemigroup } from 'fp-ts/Semigroup'
import {
    readFile as readFile_,
    writeFile as writeFile_,
} from '@typescript-tools/lerna-utils'

const docstring = `
Usage:
    configure-lerna-manifest [--root <root>] --packages <package>...

Options:
    packages         Package names or paths to rebuild when listed packages change (also reads from stdin)
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

// Widens the type of a particular Err into an Err
const err: Endomorphism<Err> = identity

const readFile = (file: fs.PathLike) =>
    pipe(
        readFile_(file),
        TE.mapLeft((error) =>
            err({ type: 'unable to read lerna manifest', error }),
        ),
    )

const writeFile = (file: fs.PathLike) => (contents: string) =>
    pipe(
        writeFile_(file)(contents),
        TE.mapLeft((error) =>
            err({ type: 'unable to write lerna manifest', error }),
        ),
    )

const writeJson = (file: fs.PathLike) =>
    flow(
        stringifyJSON_(
            (error): Err => ({ type: 'unable to stringify manifest', error }),
        ),
        TE.fromEither,
        TE.chain(writeFile(file)),
    )

const findMonorepoRoot = (a: CommandLineOptions) =>
    pipe(
        O.fromNullable(a.root),
        O.fold(flow(monorepoRoot, E.mapLeft(err)), E.right),
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
        E.mapLeft((error) =>
            err({
                type: 'docopt decode',
                error: PathReporter.failure(error).join('\n'),
            }),
        ),
        TE.fromEither,
        TE.chain(findMonorepoRoot),
    )

const decodeLernaManifest = (manifest: string) =>
    pipe(
        LernaManifest.decode(manifest),
        E.mapLeft(
            flow(
                (errors) => PathReporter.failure(errors).join('\n'),
                (error) =>
                    err({ type: 'unable to decode lerna manifest', error }),
            ),
        ),
        TE.fromEither,
    )

const lernaPackages = flow(
    lernaPackages_,
    TE.map((packages) =>
        pipe(
            packages,
            A.chain((pkg): [
                [PackageName, LernaPackage],
                [Path, LernaPackage],
            ] => [
                [pkg.name, pkg],
                [pkg.location, pkg],
            ]),
            M.fromFoldable(
                eqString,
                getFirstSemigroup<LernaPackage>(),
                A.readonlyArray,
            ),
            (packagesMap) => ({ list: packages, map: packagesMap }),
        ),
    ),
    TE.mapLeft(err),
)

const packagePath = (packages: Map<string, LernaPackage>) => (packagePathOrName: string) =>
    pipe(
        O.fromNullable(packages.get(packagePathOrName)),
        // WISH: turn into a relative path (if necessary)
        O.map(_ => _.location),
        E.fromOption(
            (): Err => ({
                type: 'unknown package',
                package: packagePathOrName
            })
        ),
        TE.fromEither
    )

const exit = (code: 0 | 1): IO.IO<void> => () => process.exit(code)

const main: T.Task<void> = pipe(
    decodeDocopt(CommandLineOptions, docstring, {
        argv: [
            ...process.argv.slice(2),
            // file descriptor '0' is stdin
            ...(!process.stdin.isTTY
                ? fs.readFileSync(0, 'utf-8').trim().split('\n')
                : []),
        ],
    }),
    TE.chain(options => pipe(
        {
            manifest: pipe(
                readFile(path.join(options.root, 'lerna.json')),
                TE.chain(decodeLernaManifest),
            ),
            packages: lernaPackages(options.root)
        },
        sequenceS(TE.ApplicativePar),
        TE.map(data => Object.assign(data, { options })),
    )),
    TE.chain(({ options, manifest, packages }) => pipe(
        options.packages,
        TE.traverseArray(packagePath(packages.map)),
        TE.map(packagePaths => ({ options, manifest, packagePaths })),
    )),
    TE.chain(({ options, manifest, packagePaths }) =>
        pipe(
            Object.assign(manifest, { packages: packagePaths }),
            writeJson(path.join(options.root, 'lerna.json')),
        ),
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
