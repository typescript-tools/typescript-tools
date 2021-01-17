#!/usr/bin/env node

/**
 * lock-internal-packages
 * Add internal packages to lockfiles
 */

import * as path from 'path'
import * as t from 'io-ts'
import * as A from 'fp-ts/Array'
import * as E from 'fp-ts/Either'
import * as NEA from 'fp-ts/NonEmptyArray'
import * as F from 'fluture'
import * as D from 'io-ts-docopt'
import { withEncode } from 'io-ts-docopt'
import { PathReporter } from 'io-ts/lib/PathReporter'
import { pipe, constVoid } from 'fp-ts/function'
import { nonEmptyArray } from 'io-ts-types/lib/nonEmptyArray'
import { readFile as readFile_, writeFile as writeFile_ } from '@typescript-tools/lerna-utils'
import { stringifyJSON as stringifyJSON_ } from '@typescript-tools/stringify-json'
import { dependencyGraph as dependencyGraph_, DependencyGraphError, PackageManifest } from '@typescript-tools/dependency-graph'
import { lernaPackages as lernaPackages_, PackageDiscoveryError } from '@typescript-tools/lerna-packages'
import { PackageLockJson } from '@typescript-tools/io-ts/dist/lib/PackageLockJson'
import { LernaPackage } from '@typescript-tools/io-ts/dist/lib/LernaPackage'
import { PackageName } from '@typescript-tools/io-ts/dist/lib/PackageName'
import { StringifiedJSON } from '@typescript-tools/io-ts/dist/lib/StringifiedJSON'
import { DistTag } from '@typescript-tools/io-ts/dist/lib/DistTag'
import { NpmRegistry } from '@typescript-tools/io-ts/dist/lib/NpmRegistry'
import { RegistryMetadata } from '@typescript-tools/io-ts/dist/lib/RegistryMetadata'
import execa from 'execa'

// REFACTOR: this entire data-flow is pretty shocking. It's clear I
// need to find some patterns with Futures analogous to sequenceS with
// fp-ts monads.

const docstring = `
Usage:
    lock-internal-packages [--root=<path>] [--dist-tag=<tag>] --registry=<url>

Options:
    --root=<path>       Path to root of monorepo [default: .]
    --dist-tag=<tag>    NPM dist-tag to use for published internal-packages [default: latest]
    --registry=<url>    NPM registry hosting internal packages
`

// DISCUSS
// TODO: take as input the base url of the npm registry
const CommandLineOptions = withEncode(
    t.type({
        '--root': t.string,
        '--dist-tag': DistTag,
        '--registry': NpmRegistry,
    }),
    a => ({
        root: a['--root'],
        tag: a['--dist-tag'],
        registry: a['--registry'],
    })
)

// Temporary helper to infer types, see https://github.com/fluture-js/Fluture/issues/455
function map<RA, RB>(mapper: (value: RA) => RB):
  <L>(source: F.FutureInstance<L, RA>) => F.FutureInstance<L, RB> {
  return F.map (mapper)
}

type Err =
    | PackageDiscoveryError
    | { type: 'docopt decode', err: string }
    | { type: 'unable to create dependency graph', err: DependencyGraphError }
    | { type: 'unable to decode registry metadata', err: string }
    | { type: 'unable to read file', file: string, err: NodeJS.ErrnoException }
    | { type: 'unable to parse lockfile', file: string, err: string }
    | { type: 'unable to stringify json', json: unknown, err: Error }
    | { type: 'unable to write file', file: string, err: NodeJS.ErrnoException }

// Widens the type of a particular Err into an Err
const error = (error: Err): Err => error

const decodeDocopt = <C extends t.Mixed>(codec: C, docstring: string): F.FutureInstance<Err, C['_O']> => pipe(
    D.decodeDocopt(codec, docstring),
    E.mapLeft(err => error({ type: 'docopt decode', err: PathReporter.report(E.left(err)).join('\n') })),
    E.map(options => F.resolve(options) as F.FutureInstance<Err, C['_O']>),
    E.getOrElse(err => F.reject(err) as F.FutureInstance<Err, C['_O']>),
)

const dependencyGraph = (root?: string): F.FutureInstance<Err, Map<PackageName, LernaPackage[]>> => pipe(
    dependencyGraph_(root),
    F.mapRej(err => error({ type: 'unable to create dependency graph', err }))
)

const lernaPackages = (root?: string): F.FutureInstance<Err, Map<PackageName, LernaPackage>> => pipe(
    lernaPackages_(root),
    map(A.reduce(
        new Map<PackageName, LernaPackage>(),
        (acc, pkg) => (acc.set(pkg.name, pkg), acc)
    ))
)

const decodeRegistryMetadata = (value: string): E.Either<Err, RegistryMetadata> => pipe(
    StringifiedJSON(nonEmptyArray(RegistryMetadata)).decode(value),
    E.map(NEA.head),
    E.mapLeft(errors => PathReporter.report(E.left(errors)).join('\n')),
    E.mapLeft(err => error({ type: 'unable to decode registry metadata', err })),
)

const registryMetadata = (tag: DistTag) => (packageName: PackageName): F.FutureInstance<Err, RegistryMetadata> =>
    F.Future((reject, resolve) => {
        const subcommand = execa.command(
            `npm pack ${packageName}@${tag} --dry-run --json`
        )

        subcommand
            .then(({ stdout }) => pipe(
                decodeRegistryMetadata(stdout),
                E.fold(reject, resolve)
            ))

        return function onCancel() {
            subcommand.cancel()
        }
    })

const readFile = (file: string): F.FutureInstance<Err, string> => pipe(
    readFile_(file),
    F.mapRej(err => error({ type: 'unable to read file', file, err }))
)

const decodePackageLockJson = (file: string) => (contents: string): F.FutureInstance<Err, PackageLockJson> => pipe(
    StringifiedJSON(PackageLockJson).decode(contents),
    E.mapLeft(errors => PathReporter.report(E.left(errors)).join('\n')),
    E.mapLeft(err => error({ type: 'unable to parse lockfile', file, err })),
    E.map(F.resolve),
    E.getOrElseW(F.reject)
)

const readPackageLockJson = (name: PackageName) => (file: string): F.FutureInstance<Err, { name: PackageName, lockfile: PackageLockJson }> =>
    pipe(
        readFile(file),
        F.chain(decodePackageLockJson(file)),
        map(lockfile => ({ name, lockfile }))
    )

const stringifyJSON = (onError: (reason: unknown) => Error) => (json: unknown): F.FutureInstance<Err, string> => pipe(
    stringifyJSON_ (onError) (json),
    E.map(F.resolve),
    E.getOrElseW(err => F.reject(error({ type: 'unable to stringify json', json, err })))
)

const writeJsonFile = (file: string) => (contents: unknown): F.FutureInstance<Err, void> => pipe(
    stringifyJSON (E.toError) (contents),
    F.chain(contents => pipe(
        writeFile_ (file) (contents),
        F.mapRej(err => error({ type: 'unable to write file', file, err }))
    ))
)

// REFACTOR: these `parallel` calls should be run in parallel, not serially.
// DISCUSS: is this a time for TaskEither to shine?
const lockInternalPackages =
    (tag: DistTag) =>
    (registry: NpmRegistry) =>
    (packageMetadata: LernaPackage) =>
    (dependencies: Map<PackageName, PackageManifest>) =>
    (lockfile: PackageLockJson): F.FutureInstance<Err, void> =>
    pipe(
        Array.from(dependencies.keys()),
        A.map(registryMetadata(tag)),
        F.parallel(Infinity),
        map(A.reduce(
            new Map<PackageName, RegistryMetadata>(),
            (acc, metadata) => (acc.set(metadata.name, metadata), acc)
        )),
        F.chain(dependencyMetadata => pipe(
            Array.from(dependencies.values()),
            A.map(manifest => pipe(
                path.resolve(manifest.location, 'package-lock.json'),
                readPackageLockJson(manifest.name)
            )),
            F.parallel(Infinity),
            map(A.reduce(
                new Map<PackageName, PackageLockJson>(),
                (acc, { name, lockfile }) => (acc.set(name, lockfile), acc)
            )),
            map(dependencyLockfiles => ({ dependencyMetadata, dependencyLockfiles }))
        )),
        // combine the maps :grimacing:
        map(({ dependencyMetadata, dependencyLockfiles }) => pipe(
            Array.from(dependencyMetadata.keys()),
            A.reduce(
                new Map<PackageName, { registry: RegistryMetadata, lockfile: PackageLockJson, manifest: PackageManifest }>(),
                (acc, name) => (
                    acc.set(name, {
                        registry: dependencyMetadata.get(name)!,
                        lockfile: dependencyLockfiles.get(name)!,
                        manifest: dependencies.get(name)!,
                    }),
                    acc
                )
            )
        )),
        F.chain(dependencyMetadata => {

            for (const [dependency, depMetadata] of dependencyMetadata.entries()) {
                lockfile.dependencies[dependency] = {
                    version: depMetadata.registry.version,
                    resolved: `${registry}/${depMetadata.manifest.name}/-/${depMetadata.registry.filename}`,
                    integrity: depMetadata.registry.integrity,
                    requires: Object.assign(
                        {},
                        depMetadata.manifest.dependencies,
                        depMetadata.manifest.peerDependencies,
                        depMetadata.manifest.optionalDependencies,
                    ),
                    dependencies: depMetadata.lockfile.dependencies,
                }
            }

            return writeJsonFile (path.resolve(packageMetadata.location, 'package-lock.json')) (lockfile)
        })
    )


function main(): void {

    pipe(
        decodeDocopt(CommandLineOptions, docstring),
        F.chain(options => pipe(
            lernaPackages(options.root),
            F.chain(lernaPackages => pipe(
                dependencyGraph(options.root),
                map(dependencyGraph => ({ lernaPackages, dependencyGraph }))
            )),
            value => value,
            F.chain(({ lernaPackages, dependencyGraph }:
                     { lernaPackages: Map<PackageName, LernaPackage>,
                       dependencyGraph: Map<PackageName, PackageManifest[]>
                     }) => pipe(
                         Array.from(lernaPackages.values()),
                         A.map(pkg => pipe(
                             readPackageLockJson (pkg.name) (path.resolve(pkg.location, 'package-lock.json')),
                             map(value => value.lockfile),
                             F.chain(
                                 lockInternalPackages
                                 (options.tag)
                                 (options.registry)
                                 (lernaPackages.get(pkg.name)!)
                                 (pipe(
                                     Array.from(dependencyGraph.get(pkg.name)!.values()),
                                     A.reduce(
                                         new Map<PackageName, PackageManifest>(),
                                         (acc, manifest) => (acc.set(manifest.name, manifest), acc)
                                     )
                                 ))
                             )
                         )),
                         F.parallel(Infinity)
                     )),
        )),
        F.fork (error => (console.error(error), process.exit(1)))
               (constVoid)
    )
}

main()

// Local Variables:
// mode: typescript
// End:
