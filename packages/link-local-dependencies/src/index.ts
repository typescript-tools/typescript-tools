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
import { Endomorphism, identity, pipe, flow, constVoid } from 'fp-ts/function'
import { trace } from '@strong-roots-capital/trace'
import {
    packageManifest as packageManifest_,
    PackageManifestsError,
} from '@typescript-tools/package-manifests'
import { LernaPackage } from '@typescript-tools/io-ts/dist/lib/LernaPackage'
import {
    PackageJsonDependencies,
    dependencies,
} from '@typescript-tools/io-ts/dist/lib/PackageJsonDependencies'
import { PackageName } from '@typescript-tools/io-ts/dist/lib/PackageName'
import { Path } from '@typescript-tools/io-ts/dist/lib/Path'
import { eqString } from 'fp-ts/lib/Eq'

const debug = {
    cmd: Debug('link'),
}

export type LinkLocalDependenciesError =
    | PackageManifestsError
    | { type: 'unknown package'; package: string }
    | { type: 'unable to decode package manifest'; error: string }
    | { type: 'unable to create directory'; path: string; error: Error }
    | {
          type: 'unable to create symlink'
          target: string
          path: string
          error: Error
      }

const err: Endomorphism<LinkLocalDependenciesError> = identity

const findPackageIn = (packages: Map<string, LernaPackage>) => (
    packagePathOrName: string
) =>
    pipe(
        M.lookup(eqString)(packagePathOrName)(packages),
        E.fromOption(
            (): LinkLocalDependenciesError => ({
                type: 'unknown package',
                package: packagePathOrName,
            })
        ),
        TE.fromEither,
        TE.bimap(err, trace(debug.cmd, 'Linking dependencies for package'))
    )

const packageManifest = flow(
    packageManifest_,
    TE.bimap(err, ({ contents }) => contents)
)

const decodeManifest = (manifest: E.Json) =>
    pipe(
        PackageJsonDependencies.decode(manifest),
        E.mapLeft(
            flow(
                errors => PathReporter.failure(errors).join('\n'),
                error =>
                    err({ type: 'unable to decode package manifest', error })
            )
        ),
        TE.fromEither
    )

const internalDependencies = (packages: Map<string, LernaPackage>) => (
    dependencies: readonly PackageName[]
) => {
    return pipe(
        dependencies,
        A.chain(dependency =>
            pipe(
                M.lookup(eqString)(dependency)(packages),
                O.map(A.of),
                O.getOrElseW(() => A.empty)
            )
        )
    )
}

const internalPackageDependencies = (packages: Map<string, LernaPackage>) =>
    flow(
        packageManifest,
        TE.chain(decodeManifest),
        TE.map(
            flow(
                dependencies,
                A.map(([dependency]) => dependency),
                internalDependencies(packages)
            )
        )
    )

const mkdir = (target: string) =>
    pipe(
        TE.tryCatch(
            async () =>
                new Promise<void>((resolve, reject) =>
                    fs.mkdir(target, { recursive: true }, error =>
                        error !== null && error !== undefined
                            ? reject(error)
                            : resolve(constVoid())
                    )
                ),
            flow(E.toError, error =>
                err({ type: 'unable to create directory', path: target, error })
            )
        )
    )

/**
 * Note: defaults to no action when `target` already exists.
 * Wonder if I should instead remove the existing file before creating `target`.
 */
const symlink = (target: string, link: string) =>
    pipe(
        mkdir(path.dirname(link)),
        TE.chain(() =>
            pipe(
                TE.tryCatch(
                    async () =>
                        new Promise<void>((resolve, reject) =>
                            fs.symlink(target, link, error =>
                                error !== null && error !== undefined
                                    ? reject(error)
                                    : resolve(constVoid())
                            )
                        ),
                    E.toError
                ),
                // recover from symlink-already-exists error
                TE.orElse(error =>
                    error.message.startsWith('EEXIST:')
                        ? TE.right(constVoid())
                        : TE.left(error)
                ),
                TE.mapLeft(error =>
                    err({
                        type: 'unable to create symlink',
                        target,
                        path: link,
                        error,
                    })
                )
            )
        )
    )

const nodeModules = (packageDirectory: string) =>
    path.resolve(packageDirectory, 'node_modules')

const symlinkPackage = (targetPackage: Path) => (
    lernaPackage: LernaPackage
) => {
    const symlinkLocation = path.resolve(
        nodeModules(targetPackage),
        lernaPackage.name
    )

    debug.cmd(
        'Linking ',
        path.relative(path.dirname(symlinkLocation), lernaPackage.location),
        'to',
        symlinkLocation
    )

    return symlink(
        path.relative(path.dirname(symlinkLocation), lernaPackage.location),
        symlinkLocation
    )
}

export const linkLocalDependencies = (packages: Map<string, LernaPackage>) => (
    packagePathOrName: string
): TE.TaskEither<LinkLocalDependenciesError, void> =>
    pipe(
        TE.bindTo('lernaPackage')(findPackageIn(packages)(packagePathOrName)),
        TE.bind('dependencies', ({ lernaPackage }) =>
            internalPackageDependencies(packages)(lernaPackage)
        ),
        TE.chain(({ lernaPackage, dependencies }) =>
            TE.traverseArray(symlinkPackage(lernaPackage.location))(
                dependencies
            )
        ),
        TE.map(constVoid)
    )

export const linkAllLocalDependencies = (
    packagesList: LernaPackage[],
    packagesMap: Map<string, LernaPackage>
): TE.TaskEither<LinkLocalDependenciesError, void> =>
    pipe(
        packagesList,
        TE.traverseArray(
            flow(pkg => pkg.location, linkLocalDependencies(packagesMap))
        ),
        TE.map(constVoid)
    )
