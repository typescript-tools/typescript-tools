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
    linkLocalDependencies as linkLocalDependencies_,
    LinkLocalDependenciesError as LinkLocalDependenciesError_,
} from './index'

const docstring = `
Usage:
    link-local-dependencies <package>

Options:
    package    Path or name of package for which to install local dependencies
`

const CommandLineOptions = withEncode(
    t.type({
        '<package>': t.string,
    }),
    a => ({
        pkg: a['<package>']
    })
)

type LinkLocalDependenciesError =
    | LinkLocalDependenciesError_
    | { type: 'docopt decode', error: string }

const err: Endomorphism<LinkLocalDependenciesError> = identity

const decodeDocopt = flow(
    decodeDocopt_,
    E.mapLeft(flow(
        errors => PathReporter.failure(errors).join('\n'),
        error => err({ type: 'docopt decode', error })
    )),
    TE.fromEither
)

const linkLocalDependencies = flow(linkLocalDependencies_, TE.mapLeft(err))

const exit = (code: 0 | 1) => () => process.exit(code)

const main: T.Task<void> = pipe(
    decodeDocopt(CommandLineOptions, docstring),
    TE.chain(({ pkg }) => linkLocalDependencies(pkg)),
    TE.getOrElseW(flow(Console.error, IO.chain(() => exit(1)), T.fromIO))
)

main()

// Local Variables:
// mode: typescript
// End:
