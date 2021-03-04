#!/usr/bin/env node

/**
 * internal-dependencies
 * Calculate package dependencies living in the same monorepo
 */

import * as fs from 'fs'
import * as path from 'path'
import * as t from 'io-ts'
import * as A from 'fp-ts/Array'
import * as E from 'fp-ts/Either'
import * as O from 'fp-ts/Option'
import * as T from 'fp-ts/Task'
import * as TE from 'fp-ts/TaskEither'
import * as IO from 'fp-ts/IO'
import * as Console from 'fp-ts/Console'
import * as PathReporter from 'io-ts/lib/PathReporter'
import { ordString } from 'fp-ts/Ord'
import { get } from 'shades'
import { match } from 'ts-pattern'
import { pipe } from 'fp-ts/pipeable'
import { constant, Endomorphism, flow } from 'fp-ts/function'
import { dependencyGraph as dependencyGraph_, DependencyGraphError } from '@typescript-tools/dependency-graph'
import { withEncode, decodeDocopt as decodeDocopt_ } from 'io-ts-docopt'
import { DocoptOption } from 'docopt'
import { PackageName } from '@typescript-tools/io-ts/dist/lib/PackageName'
import { monorepoRoot, MonorepoRootError } from '@typescript-tools/monorepo-root'

const docstring = `
Usage:
    internal-dependencies [--root <root>] [--path] <package>...

Options:
    packages         Packages to print dependencies of (also reads from stdin)
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
    | DependencyGraphError
    | MonorepoRootError
    | { type: 'docopt decode', err: string }

// Widens the type of a particular Err into an Err
const error: Endomorphism<Err> = t.identity

const decodeDocopt = <C extends t.Mixed>(
    codec: C,
    docstring: string,
    options: DocoptOption,
) => pipe(
    decodeDocopt_(codec, docstring, options),
    E.mapLeft((err): Err => ({ type: 'docopt decode', err: PathReporter.failure(err).join('\n') })),
    TE.fromEither
)

const findMonorepoRoot = (a: CommandLineOptions) =>
    pipe(
        O.fromNullable(a.root),
        O.fold(
            flow(monorepoRoot, E.mapLeft(error)),
            E.right,
        ),
        E.map(root => Object.assign(a, { root })),
        TE.fromEither,
    )

const dependencyGraph = flow(dependencyGraph_, TE.mapLeft(error))

const exit = (code: 0 | 1): IO.IO<void> => () => process.exit(code)

const main: T.Task<void> =
    pipe(
        decodeDocopt(
            CommandLineOptions,
            docstring,
            {
                argv: [
                    ...process.argv.slice(2),
                    // file descriptor '0' is stdin
                    ...!process.stdin.isTTY ? fs.readFileSync(0, 'utf-8').trim().split('\n') : []
                ]
            }
        ),
        TE.chain(findMonorepoRoot),
        TE.chain(options => pipe(
            dependencyGraph(options.root),
            TE.map(graph => pipe(
                options.packages,
                A.chain(
                    pkg => pipe(
                        O.fromNullable(graph.get(pkg)),
                        O.getOrElseW(constant(A.empty))
                    )
                )
            )),
            TE.map(dependencies => match(options.mode)
                .with(
                    'path',
                    () => dependencies
                        .map(get('location'))
                        .map(location => path.relative(options.root, location))
                )
                .otherwise(() => dependencies.map(get('name')))
            ),
            TE.map(A.uniq(ordString)),
            TE.map((dependencies: string[]) => dependencies.forEach(unary(console.log))),
        )),
        TE.fold(
            flow(Console.error, IO.chain(() => exit(1)), T.fromIO),
            constant(T.of(undefined))
        ),
    )

main()

// Local Variables:
// mode: typescript
// End:
