#!/usr/bin/env node

/**
 * internal-dependencies
 * Calculate package dependencies living in the same monorepo
 */

import * as path from 'path'
import * as t from 'io-ts'
import * as A from 'fp-ts/Array'
import * as E from 'fp-ts/Either'
import * as O from 'fp-ts/Option'
import * as R from 'fp-ts/Record'
import * as F from 'fluture'
import { get } from 'shades'
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
    internal-dependencies <root> <package>...

Options:
    root:        Root of lerna mono-repository
    packages:    Packages to print dependencies of
`

const CommandLineOptions = t.type({
    '<root>': t.string,
    '<package>': t.array(t.string)
})

type CommandLineOptions = t.TypeOf<typeof CommandLineOptions>;

function mapCommandLineOptions(
    a: CommandLineOptions
): {
    root: string,
    packages: string[]
} {
    return {
        root: a['<root>'],
        packages: a['<package>']
    }
}

const unary = <A, B>(f: (a: A) => B) => (a: A): B => f(a)

function main(): void {
    pipe(
        decodeCommandLineArguments(CommandLineOptions, docstring, mapCommandLineOptions),
        E.map(options => dependencyGraph(options.root)
            .pipe(F.map(
                // TODO: why is type inferencing breaking down?
                // I think this is this a bug in fluture?
                (graph: DependencyGraph) => pipe(
                    options.packages.map(
                        pkg => O.getOrElse(constant([] as LernaPackage[])) (R.lookup (pkg) (graph))
                    ),
                    A.flatten,
                    A.map(get('location')),
                    A.map(path.basename.bind(null))
                )))
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
