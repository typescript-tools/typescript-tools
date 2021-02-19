/**
 * link-local-dependencies
 * Install local lerna dependencies
 */

import Debug from 'debug'
import * as fs from 'fs'
import * as path from 'path'
import * as A from 'fp-ts/ReadonlyArray'
import * as E from 'fp-ts/Either'
import * as M from 'fp-ts/Map'
import * as O from 'fp-ts/Option'
import * as TE from 'fp-ts/TaskEither'
import * as PathReporter from 'io-ts/lib/PathReporter'
import { Endomorphism, identity, pipe, flow, constVoid } from 'fp-ts/lib/function'
import { trace } from '@strong-roots-capital/trace'
import { findPackageIn as findPackageIn_, FindPackageError } from '@typescript-tools/find-package'
import { packageManifest as packageManifest_, PackageManifestsError } from '@typescript-tools/package-manifests'
import { lernaPackages as lernaPackages_, PackageDiscoveryError } from '@typescript-tools/lerna-packages'
import { LernaPackage } from '@typescript-tools/io-ts/dist/lib/LernaPackage'
import { PackageJsonDependencies, dependencies } from '@typescript-tools/io-ts/dist/lib/PackageJsonDependencies'
import { PackageName, Eq as eqPackageName } from '@typescript-tools/io-ts/dist/lib/PackageName'
import { getFirstSemigroup } from 'fp-ts/lib/Semigroup'

const debug = {
    cmd: Debug('link')
}

export type LinkLocalDependenciesError =
    | FindPackageError
    | PackageDiscoveryError
    | PackageManifestsError
    | { type: 'docopt decode', error: string }
    | { type: 'unable to decode package manifest', error: string }
    | { type: 'unable to create directory', path: string, error: Error }
    | { type: 'unable to create symlink', target: string, path: string, error: Error }

const err: Endomorphism<LinkLocalDependenciesError> = identity

const lernaPackages = flow(lernaPackages_, TE.mapLeft(err))

const findPackageIn = (packages: LernaPackage[]) => flow(
    findPackageIn_(packages),
    TE.mapLeft(err),
    TE.map(trace(debug.cmd, 'Linking dependencies for package')),
)

const packageManifest = flow(
    packageManifest_,
    TE.bimap(err, ({ contents }) => contents)
)

const decodeManifest = (manifest: E.Json) => pipe(
    PackageJsonDependencies.decode(manifest),
    E.mapLeft(flow(
        errors => PathReporter.failure(errors).join('\n'),
        error => err({ type: 'unable to decode package manifest', error })
    )),
    TE.fromEither
)

const internalDependencies = (packages: LernaPackage[]) => (dependencies: readonly PackageName[]) => {
    const packagesByName = pipe(
        packages,
        A.map((pkg): [PackageName, LernaPackage] => [pkg.name, pkg]),
        M.fromFoldable(
            eqPackageName,
            getFirstSemigroup<LernaPackage>(),
            A.readonlyArray,
        )
    )
    return pipe(
        dependencies,
        A.chain(dependency => pipe(
            M.lookup (eqPackageName) (dependency) (packagesByName),
            value => value,
            O.map(A.of),
            O.getOrElseW(() => A.empty)
        ))
    )
}

const internalPackageDependencies = (packages: LernaPackage[]) => flow(
    findPackageIn(packages),
    TE.chain(packageManifest),
    TE.chain(decodeManifest),
    TE.map(flow(
        dependencies,
        A.map(([ dependency ]) => dependency),
        internalDependencies(packages)
    )),
)

const mkdir = (target: string) => pipe(
    TE.tryCatch(
        async () => new Promise<void>((resolve, reject) => fs.mkdir(
            target,
            { recursive: true },
            error => error !== null && error !== undefined ? reject(error) : resolve(constVoid())
        )),
        flow(
            E.toError,
            error => err({ type: 'unable to create directory', path: target, error })
        )
    )
)

/**
 * Note: defaults to no action when `target` already exists.
 * Wonder if I should instead remove the existing file before creating `target`.
 */
const symlink = (target: string, link: string) => pipe(
    mkdir(path.dirname(link)),
    TE.chain(() => pipe(
        TE.tryCatch(
            async () => new Promise<void>((resolve, reject) => fs.symlink(
                target,
                link,
                error => error !== null && error !== undefined ? reject(error) : resolve(constVoid())
            )),
            E.toError,
        ),
        // recover from symlink-already-exists error
        TE.orElse(error => error.message.startsWith('EEXIST:') ? TE.right(constVoid()) : TE.left(error)),
        TE.mapLeft(error => err({ type: 'unable to create symlink', target, path: link, error }))
    )),
)

const nodeModules = (packageDirectory: string) =>
    path.resolve(packageDirectory, 'node_modules')

const symlinkPackage = (targetPackage: string) => (lernaPackage: LernaPackage) => {
    const symlinkLocation = path.resolve(nodeModules(targetPackage), lernaPackage.name)
    return symlink(
        path.relative(path.dirname(symlinkLocation), lernaPackage.location),
        symlinkLocation,
    )

}

export const linkLocalDependencies = (
    packagePathOrName: string,
): TE.TaskEither<LinkLocalDependenciesError, void> => pipe(
    lernaPackages(process.cwd()),
    TE.chain(packages => internalPackageDependencies (packages) (packagePathOrName)),
    TE.chain(TE.traverseArray(symlinkPackage(packagePathOrName))),
    TE.map(() => constVoid())
)
