#!/usr/bin/env node

/**
 * internal-dependencies
 * Calculate package dependencies living in the same monorepo
 */

import * as fs from 'fs'
import * as path from 'path'
import * as t from 'io-ts'
import * as F from 'fluture'
import * as A from 'fp-ts/Array'
import * as E from 'fp-ts/Either'
import * as O from 'fp-ts/Option'
import { ordString } from 'fp-ts/Ord'
import { PathReporter } from 'io-ts/lib/PathReporter'
import { get } from 'shades'
import { match } from 'ts-pattern'
import { pipe } from 'fp-ts/pipeable'
import { constVoid, constant } from 'fp-ts/function'
import { dependencyGraph as dependencyGraph_, DependencyGraphError, PackageManifest } from '@typescript-tools/dependency-graph'
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

// Temporary helper to infer types, see https://github.com/fluture-js/Fluture/issues/455
function map<RA, RB>(mapper: (value: RA) => RB):
  <L>(source: F.FutureInstance<L, RA>) => F.FutureInstance<L, RB> {
  return F.map (mapper)
}

type Err =
    | DependencyGraphError
    | { type: 'docopt decode', err: string }

// Widens the type of a particular Err into an Err
const error = (error: Err): Err => error

const decodeDocopt = <C extends t.Mixed>(
    codec: C,
    docstring: string,
    options: DocoptOption,
): F.FutureInstance<Err, C['_O']> => pipe(
    decodeDocopt_(codec, docstring, options),
    E.mapLeft((err): Err => ({ type: 'docopt decode', err: PathReporter.report(E.left(err)).join('\n') })),
    E.map(options => F.resolve(options) as F.FutureInstance<Err, C['_O']>),
    E.getOrElse(err => F.reject(err) as F.FutureInstance<Err, C['_O']>),
)

const dependencyGraph = (root?: string): F.FutureInstance<Err, Map<PackageName, PackageManifest[]>> => pipe(
    dependencyGraph_(root),
    F.mapRej(error)
)

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
        F.chain(options => pipe(
            dependencyGraph(options.root),
            map(graph => pipe(
                options.packages,
                A.chain(
                    pkg => pipe(
                        O.fromNullable(graph.get(pkg)),
                        O.getOrElseW(constant(A.empty))
                    )
                )
            )),
            map(dependencies => match(options.mode)
                .with(
                    'path',
                    () => dependencies
                        .map(get('location'))
                        .map(location => path.relative(options.root, location))
                )
                .otherwise(() => dependencies.map(get('name')))
               ),
            map(A.uniq(ordString)),
            map((dependencies: string[]) => dependencies.forEach(unary(console.log)))
        )),
        F.fork (error => (console.error(error), process.exit(1)))
               (constVoid)
    )
}

main()

// Local Variables:
// mode: typescript
// End:
