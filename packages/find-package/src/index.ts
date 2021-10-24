/**
 * find-package
 * Find lerna package by path or name
 */

import * as path from 'path'

import { LernaPackage } from '@typescript-tools/io-ts/dist/lib/LernaPackage'
import { lernaPackages, PackageDiscoveryError } from '@typescript-tools/lerna-packages'
import * as O from 'fp-ts/Option'
import * as A from 'fp-ts/ReadonlyArray'
import * as TE from 'fp-ts/TaskEither'
import { pipe } from 'fp-ts/function'

export type FindPackageError =
  | PackageDiscoveryError
  | { type: 'unable to find package in monorepo'; package: string }

const findPackageByPath = (packages: LernaPackage[]) => (
  packagePath: string,
): O.Option<LernaPackage> =>
  pipe(
    packages,
    // FIXME: only works with relative paths
    A.filter(({ location }) => location === path.resolve(process.cwd(), packagePath)),
    A.head,
  )

const findPackageByName = (packages: LernaPackage[]) => (
  packageName: string,
): O.Option<LernaPackage> =>
  pipe(
    packages,
    A.filter(({ name }) => name === packageName),
    A.head,
  )

export const findPackageIn = (packages: LernaPackage[]) => (
  packagePathOrName: string,
): TE.TaskEither<FindPackageError, LernaPackage> =>
  pipe(
    findPackageByPath(packages)(packagePathOrName),
    O.alt(() => findPackageByName(packages)(packagePathOrName)),
    O.fold(
      () =>
        TE.left({
          type: 'unable to find package in monorepo',
          package: packagePathOrName,
        }),
      TE.right,
    ),
  )

/**
 * Returns specified package metadata.
 */
export const findPackage = (
  pathInsideMonorepo: string,
  packagePathOrName: string,
): TE.TaskEither<FindPackageError, LernaPackage> =>
  pipe(
    lernaPackages(pathInsideMonorepo),
    TE.chain((packages) => findPackageIn(packages)(packagePathOrName)),
  )
