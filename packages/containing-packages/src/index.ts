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
import { DocoptOption } from 'docopt'
import { pipe, flow, Endomorphism, identity, constVoid } from 'fp-ts/function'
import { withEncode, decodeDocopt as decodeDocopt_ } from 'io-ts-docopt'
import {
    monorepoRoot,
    MonorepoRootError,
} from '@typescript-tools/monorepo-root'
import { PackageName } from '@typescript-tools/io-ts/dist/lib/PackageName'
import { PackageDiscoveryError } from '@typescript-tools/lerna-packages'
import { lernaPackages as lernaPackages_ } from '@typescript-tools/lerna-packages'
import { LernaPackage } from '@typescript-tools/io-ts/dist/lib/LernaPackage'
import { eqString } from 'fp-ts/Eq'
import { Path } from '@typescript-tools/io-ts/dist/lib/Path'
import { getFirstSemigroup } from 'fp-ts/Semigroup'

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

type Err =
    | MonorepoRootError
    | PackageDiscoveryError
    | { type: 'docopt decode'; error: string }

// Widens the type of a particular Err into an Err
const err: Endomorphism<Err> = identity

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

const containingPackage = (
    root: string,
    packages: Map<string, LernaPackage>,
) => (file: string): O.Option<LernaPackage> => {
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
            // file descriptor '0' is stdin
            ...(!process.stdin.isTTY
                ? fs.readFileSync('/dev/stdin', 'utf-8').trim().split('\n')
                : []),
        ],
    }),
    TE.chain((options) =>
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
                    packages => packages.join('\n')
                ),
            ),
        ),
    ),
    TE.fold(
        flow(
            Console.error,
            IO.chain(() => exit(1)),
            T.fromIO,
        ),
        flow(Console.log, T.fromIO),
    ),
)

main()

// Local Variables:
// mode: typescript
// End:
