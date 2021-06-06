#!/usr/bin/env node

/**
 * packages-to-rebuild-on-changes-cli
 * CLI for packages-to-rebuild-on-changes
 */

import * as fs from 'fs'
import * as path from 'path'
import * as t from 'io-ts'
import * as A from 'fp-ts/ReadonlyArray'
import * as E from 'fp-ts/Either'
import * as O from 'fp-ts/Option'
import * as T from 'fp-ts/Task'
import * as TE from 'fp-ts/TaskEither'
import * as IO from 'fp-ts/IO'
import * as Console from 'fp-ts/Console'
import * as PathReporter from 'io-ts/lib/PathReporter'
import { ordString } from 'fp-ts/Ord'
import { match } from 'ts-pattern'
import { pipe, flow, identity, constant, Endomorphism } from 'fp-ts/function'
import { packagesToRebuildOnChanges as packagesToRebuildOnChanges_, PackagesToRebuildOnChangesError } from '@typescript-tools/packages-to-rebuild-on-changes'
import { withEncode, decodeDocopt as decodeDocopt_ } from 'io-ts-docopt'
import { DocoptOption } from 'docopt'
import { PackageName } from '@typescript-tools/io-ts/dist/lib/PackageName'
import { monorepoRoot, MonorepoRootError } from '@typescript-tools/monorepo-root'
import { FindPackageError, findPackageIn as findPackageIn_ } from '@typescript-tools/find-package'
import { lernaPackages as lernaPackages_, PackageDiscoveryError } from '@typescript-tools/lerna-packages'
import { LernaPackage } from '@typescript-tools/io-ts/dist/lib/LernaPackage'

const docstring = `
Usage:
    packages-to-rebuild-on-changes [--root <root>] [--path] <package>...

Options:
    packages         Package names or paths to rebuild when listed packages change (also reads from stdin)
    --root=<root>    Root of lerna mono-repository
    --path           Print the relative path to each package from root
`

const CommandLineOptions = withEncode(
    t.type({
        '<package>': t.array(PackageName),
        '--path': t.boolean,
        '--root': t.union([t.null, t.string]),
    }),
    a => ({
        root: a['--root'] !== null ? a['--root'] : undefined,
        packages: a['<package>'],
        mode: a['--path'] ? 'path' : 'name'
    })
)

type CommandLineOptions = t.OutputOf<typeof CommandLineOptions>;

const unary = <A, B>(f: (a: A) => B) => (a: A): B => f(a)

type Err =
    | PackagesToRebuildOnChangesError
    | MonorepoRootError
    | FindPackageError
    | PackageDiscoveryError
    | { type: 'docopt decode', error: string }

// Widens the type of a particular Err into an Err
const err: Endomorphism<Err> = identity

const findMonorepoRoot = (a: CommandLineOptions) =>
    pipe(
        O.fromNullable(a.root),
        O.fold(
            flow(monorepoRoot, E.mapLeft(err)),
            E.right,
        ),
        E.map(root => Object.assign(a, { root })),
        TE.fromEither,
    )

const decodeDocopt = <C extends t.Mixed>(
    codec: C,
    docstring: string,
    options: DocoptOption,
) => pipe(
    decodeDocopt_(codec, docstring, options),
    E.mapLeft((error) => err({ type: 'docopt decode', error: PathReporter.failure(error).join('\n') })),
    TE.fromEither,
    TE.chain(findMonorepoRoot)
)

const packagesToRebuildOnChanges = flow(packagesToRebuildOnChanges_, TE.mapLeft(err))
const lernaPackages = flow(lernaPackages_, TE.mapLeft(err))

// REFACTOR: avoid O(n) runtime
const findPackageIn = (packages: LernaPackage[]) =>
    flow(
        findPackageIn_(packages),
        TE.mapLeft(err)
    )

const exit = (code: 0 | 1): IO.IO<void> => () => process.exit(code)

const main: T.Task<void> =
    pipe(
        TE.bindTo('options')(decodeDocopt(
            CommandLineOptions,
            docstring,
            {
                argv: [
                    ...process.argv.slice(2),
                    ...!process.stdin.isTTY ? fs.readFileSync('dev/stdin', 'utf-8').trim().split('\n') : []
                ]
            }
        )),
        TE.bind('packages', ({ options }) => lernaPackages(options.root)),
        TE.bind('dependencies', ({ options, packages }) => pipe(
            packagesToRebuildOnChanges(options.root),
            TE.chain(graph => pipe(
                options.packages,
                TE.traverseArray(pkg => findPackageIn(packages)(pkg)),
                TE.map(
                    A.chain(
                        pkg => pipe(
                            O.fromNullable(graph.get(pkg.name)),
                            O.getOrElseW(constant(A.empty))
                        )
                    )
                ),
            )),
        )),
        TE.map(({ options, dependencies }) => match(options.mode)
            .with(
                'path',
                () => dependencies
                    .map(_ => _.location)
                    .map(location => path.relative(options.root, location))
            )
            .otherwise(() => dependencies.map(_ => _.name))),
        TE.map(A.uniq(ordString)),
        TE.map((dependencies: readonly string[]) => dependencies.forEach(unary(console.log))),
        TE.fold(
            flow(Console.error, IO.chain(() => exit(1)), T.fromIO),
            constant(T.of(undefined))
        ),
    )

main()

// Local Variables:
// mode: typescript
// End:
