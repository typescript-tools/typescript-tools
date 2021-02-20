#!/usr/bin/env node

import * as t from 'io-ts'
import * as E from 'fp-ts/Either'
import * as T from 'fp-ts/Task'
import * as TE from 'fp-ts/TaskEither'
import * as IO from 'fp-ts/IO'
import * as Console from 'fp-ts/Console'
import * as PathReporter from 'io-ts/lib/PathReporter'
import { pipe, flow, Endomorphism, identity } from 'fp-ts/lib/function'
import { withEncode, decodeDocopt as decodeDocopt_ } from 'io-ts-docopt'
import {
    linkDependencyExecutables as linkDependencyExecutables_,
    LinkDependencyExecutablesError as LinkDependencyExecutablesError_,
} from './index'

const docstring = `
Usage:
    link-dependency-executables <internal-package> <dependency>

Options:
    internal-package    Path or name of package into which to link dependency's executables
    dependency          Name of dependency containing executables to link
`

const CommandLineOptions = withEncode(
    t.type({
        '<internal-package>': t.string,
        '<dependency>': t.string,
    }),
    a => ({
        internalPackage: a['<internal-package>'],
        dependency: a['<dependency>'],
    })
)

type LinkDependencyExecutablesError =
    | LinkDependencyExecutablesError_
    | { type: 'docopt decode', error: string }

const err: Endomorphism<LinkDependencyExecutablesError> = identity

const decodeDocopt = flow(
    decodeDocopt_,
    E.mapLeft(flow(
        errors => PathReporter.failure(errors).join('\n'),
        error => err({ type: 'docopt decode', error })
    )),
    TE.fromEither
)

const linkDependencyExecutables = (internalPackagePathOrName: string) =>
    flow(
        linkDependencyExecutables_(internalPackagePathOrName),
        TE.mapLeft(err),
    )

const exit = (code: 0 | 1) => () => process.exit(code)

const main: T.Task<void> = pipe(
    decodeDocopt(CommandLineOptions, docstring),
    TE.chain(({ internalPackage, dependency }) => linkDependencyExecutables (internalPackage) (dependency)),
    TE.getOrElseW(flow(Console.error, IO.chain(() => exit(1)), T.fromIO))
)

main()

// Local Variables:
// mode: typescript
// End:
