#!/usr/bin/env node

/**
 * use-hoisted-version
 * Update lerna package to use hoisted version of npm dependency
 */

import * as t from 'io-ts'
import * as E from 'fp-ts/Either'
import { pipe } from 'fp-ts/function'
import { decodeDocopt, withEncode } from 'io-ts-docopt'
import { withFallback } from 'io-ts-types'
import { validationErrors } from '@typescript-tools/io-ts/dist/lib/error'

const docstring = `
Usage:
    use-hoisted-version <package> [<dependency>]

Options:
    package       Package for which to update dependencies
    dependency    Singular dependency to update
                  [default behavior: update all dependencies]
`

const fallbackToUndefined = <C extends t.Any>(codec: C) => withFallback(
    t.union([codec, t.undefined]),
    undefined
)

const CommandLineOptions = withEncode(
    t.intersection([
        // TODO: resolve this from current monorepo root -- can we determine that?
        // We've always asked the user to supply it in other versions
        // (because we may be operating on a different repository or from outside a monorepo).
        // I don't think these possibilities exist with _this_ command, so maybe
        // we should be inferring it
        t.type({
            '<package>': t.string,
        }),
        t.partial({
            '<dependency>': fallbackToUndefined(t.string)
        })
    ]),
    a => ({
        package: a['<package>'],
        dependency: a['<dependency>']
    })
)

function main(): void {
    pipe(
        decodeDocopt(CommandLineOptions, docstring, { help: true, exit: true }),
        // RESUME: calculate the hoisted dep versions so we can compare against the package versions
        // https://github.com/lerna/lerna/blob/main/commands/bootstrap/index.js
        E.fold(
            error => console.error(validationErrors('CommandLineOptions', error)),
            console.log
        )
    )
}

main()

// Local Variables:
// mode: typescript
// End:
