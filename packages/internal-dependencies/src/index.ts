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
import { constant, flow } from 'fp-ts/function'
import { dependencyGraph as dependencyGraph_, DependencyGraphError } from '@typescript-tools/dependency-graph'
import { withEncode, decodeDocopt as decodeDocopt_ } from 'io-ts-docopt'
import { DocoptOption } from 'docopt'
import { PackageName } from '@typescript-tools/io-ts/dist/lib/PackageName'

const docstring = `
Usage:
    internal-dependencies [--path] <root> <package>...

Options:
    root        Root of lerna mono-repository
    packages    Packages to print dependencies of (also reads from stdin)
    --path      Print the relative path to each package from root
`

const CommandLineOptions = withEncode(
    t.type({
        '<root>': t.string,
        '<package>': t.array(PackageName),
        '--path': t.boolean
    }),
    a => ({
        root: a['<root>'],
        packages: a['<package>'],
        mode: a['--path'] ? 'path' : 'name'
    })
)

type CommandLineOptions = t.TypeOf<typeof CommandLineOptions>;

const unary = <A, B>(f: (a: A) => B) => (a: A): B => f(a)

type Err =
    | DependencyGraphError
    | { type: 'docopt decode', err: string }

// Widens the type of a particular Err into an Err
const error = (error: Err): Err => error

const decodeDocopt = <C extends t.Mixed>(
    codec: C,
    docstring: string,
    options: DocoptOption,
) => pipe(
    decodeDocopt_(codec, docstring, options),
    E.mapLeft((err): Err => ({ type: 'docopt decode', err: PathReporter.failure(err).join('\n') })),
    TE.fromEither
)

const dependencyGraph = flow(dependencyGraph_, TE.mapLeft(error))

function main(): void {

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
            TE.map((dependencies: string[]) => dependencies.forEach(unary(console.log)))
        )),
        TE.fold(
            flow(Console.error, IO.chain(() => process.exit(1)), T.fromIO),
            constant(T.of(undefined))
        )
    )
}

main()

// Local Variables:
// mode: typescript
// End:
