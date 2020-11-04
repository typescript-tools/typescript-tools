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
import * as R from 'fp-ts/Record'
import { ordString } from 'fp-ts/Ord'
import * as F from 'fluture'
import { get } from 'shades'
import { match } from 'ts-pattern'
import { pipe } from 'fp-ts/pipeable'
import { constVoid, constant } from 'fp-ts/function'
import { LernaPackage } from '@typescript-tools/io-ts/dist/lib/LernaPackage'
import {
    decodeCommandLineArguments,
    DependencyGraph,
    dependencyGraph
} from '@typescript-tools/lerna-utils'

const docstring = `
Usage:
    internal-dependencies [--path] <root> <package>...

Options:
    root        Root of lerna mono-repository
    packages    Packages to print dependencies of (also reads from stdin)
    --path      Print the relative path to each package from root
`

const CommandLineOptions = t.type({
    '<root>': t.string,
    '<package>': t.array(t.string),
    '--path': t.boolean
})

type CommandLineOptions = t.TypeOf<typeof CommandLineOptions>;

function mapOptions(
    a: CommandLineOptions
): {
    root: string,
    packages: string[],
    mode: 'name' | 'path'
} {
    return {
        root: a['<root>'],
        packages: a['<package>'],
        mode: a['--path'] ? 'path' : 'name'
    }
}

const unary = <A, B>(f: (a: A) => B) => (a: A): B => f(a)

function main(): void {

    pipe(
        decodeCommandLineArguments(
            CommandLineOptions,
            docstring,
            {
                map: mapOptions,
                input: [
                    ...process.argv.slice(2),
                    // file descriptor '0' is stdin
                    ...!process.stdin.isTTY ? fs.readFileSync(0, 'utf-8').trim().split('\n') : []
                ]
            }),
        E.map(options => dependencyGraph(options.root)
            .pipe(F.map(
                // TODO: why is type inferencing breaking down?
                // I think this is this a bug in fluture?
                (graph: DependencyGraph) => pipe(
                    options.packages.map(
                        pkg => O.getOrElse(constant([] as LernaPackage[])) (R.lookup (pkg) (graph))
                    ),
                    A.flatten
                )))
            .pipe(F.map(
                (dependencies: LernaPackage[]) => match(options.mode)
                    .with(
                        'path',
                        () => dependencies
                            .map(get('location'))
                            .map(location => path.relative(options.root, location))
                    )
                    .otherwise(() => dependencies.map(get('name')))
            ))
            .pipe(F.map(A.uniq(ordString)))
            .pipe(F.map((dependencies: string[]) => dependencies.forEach(unary(console.log))))
             ),
        E.fold(
            console.error,
            F.fork (console.error) (constVoid)
        )
    )
}

main()


// Local Variables:
// mode: typescript
// End:
