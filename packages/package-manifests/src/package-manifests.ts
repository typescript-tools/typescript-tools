/**
 * package-manifests
 * Read every package's package.json
 */

import * as path from 'path'
import * as A from 'fp-ts/Array'
import * as E from 'fp-ts/Either'
import * as TE from 'fp-ts/TaskEither'
import { pipe, flow } from 'fp-ts/function'
import { readFile as readFile_ } from '@typescript-tools/lerna-utils'
import { lernaPackages as lernaPackages_, PackageDiscoveryError } from '@typescript-tools/lerna-packages'
import { LernaPackage } from '@typescript-tools/io-ts/dist/lib/LernaPackage'
import { monorepoRoot as monorepoRoot_, MonorepoRootErr } from '@typescript-tools/monorepo-root'

// FIXME: I think the errors in here and in lernaPackages can be
// cleaned up (narrowed from unknown)

export type PackageManifestsError =
    | MonorepoRootErr
    | PackageDiscoveryError
    | { type: 'unable to read file', filename: string, error: NodeJS.ErrnoException }
    | { type: 'unable to parse json', filename: string, error: Error }

// Widens the type of a particular DependencyGraphError into a DependencyGraphError
const err = (error: PackageManifestsError): PackageManifestsError => error

const monorepoRoot = flow(monorepoRoot_, E.mapLeft(err), TE.fromEither)
const lernaPackages = flow(lernaPackages_, TE.mapLeft(err))

const readFile = (filename: string) => pipe(
    readFile_(filename),
    TE.mapLeft(error => err({ type: 'unable to read file', filename, error }))
)

export function packageManifests(
    somePathInMonorepo?: string
): TE.TaskEither<PackageManifestsError, ReadonlyArray<{ pkg: LernaPackage, contents: E.Json }>> {
    return pipe(
        monorepoRoot(somePathInMonorepo),
        TE.chain(lernaPackages),
        TE.chain(flow(
            A.map(pkg => {
                const filename = path.resolve(pkg.location, 'package.json')
                return pipe(
                    readFile(filename),
                    TE.chain(contents => pipe(
                        E.parseJSON(contents, E.toError),
                        E.map(contents => ({ pkg, contents })),
                        E.mapLeft(error => err({ type: 'unable to parse json', filename, error })),
                        TE.fromEither
                    ))
                )
            }),
            value => value,
            TE.sequenceArray,
        )),
        value => value,
    )
}
