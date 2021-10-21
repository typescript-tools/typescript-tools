/**
 * link-dependency-executables
 * Link a package's executables into node_modules
 */

import Debug from 'debug'
import * as fs from 'fs'
import * as path from 'path'
import * as E from 'fp-ts/Either'
import * as R from 'fp-ts/Record'
import * as TE from 'fp-ts/TaskEither'
import * as Apply from 'fp-ts/Apply'
import * as PathReporter from 'io-ts/lib/PathReporter'
import { Endomorphism, identity, flow, pipe, constVoid } from 'fp-ts/function'
import { PackageJsonBin } from '@typescript-tools/io-ts/dist/lib/PackageJsonBin'
import {
  MonorepoRootError,
  monorepoRoot as monorepoRoot_,
} from '@typescript-tools/monorepo-root'
import {
  FindPackageError,
  findPackage as findPackage_,
} from '@typescript-tools/find-package'
import { StringifiedJSON } from '@typescript-tools/io-ts/dist/lib/StringifiedJSON'
import { ExecutableName } from '@typescript-tools/io-ts/dist/lib/ExecutableName'
import { Path } from '@typescript-tools/io-ts/dist/lib/Path'

const debug = {
  cmd: Debug('link'),
}

export type LinkDependencyExecutablesError =
  | FindPackageError
  | MonorepoRootError
  | { type: 'unable to read file'; filename: string; error: Error }
  | {
      type: 'unable to decode dependency package.json'
      dependency: string
      error: string
    }
  | { type: 'unable to create directory'; path: string; error: Error }
  | { type: 'unable to create symlink'; target: string; path: string; error: Error }

const err: Endomorphism<LinkDependencyExecutablesError> = identity

const findPackage = (packagePathOrName: string) =>
  pipe(
    // FIXME: this should be exposed as a parameter
    findPackage_(process.cwd(), packagePathOrName),
    TE.mapLeft(err),
  )

const monorepoRoot = flow(monorepoRoot_, E.mapLeft(err), TE.fromEither)

const packageJson = (packageDirectory: string) =>
  path.resolve(packageDirectory, 'package.json')

const topLevelDependency = (monorepoRoot: string) => (dependency: string) =>
  path.resolve(monorepoRoot, 'node_modules', dependency)

const readFile = (filename: string) =>
  TE.tryCatch(
    async () =>
      new Promise<string>((resolve, reject) =>
        fs.readFile(filename, 'utf8', (error, data) =>
          error !== null && error !== undefined ? reject(error) : resolve(data),
        ),
      ),
    flow(E.toError, (error) => err({ type: 'unable to read file', filename, error })),
  )

const decodePackageJsonBin = (dependency: string) =>
  flow(
    StringifiedJSON(PackageJsonBin).decode.bind(null),
    E.mapLeft(
      flow(
        (errors) => PathReporter.failure(errors).join('\n'),
        (error) =>
          err({ type: 'unable to decode dependency package.json', dependency, error }),
      ),
    ),
    TE.fromEither,
  )

const externalPackageManifest = (monorepoRoot: string) => (dependencyName: string) =>
  pipe(
    packageJson(topLevelDependency(monorepoRoot)(dependencyName)),
    readFile,
    TE.chain(decodePackageJsonBin(dependencyName)),
  )

const mkdir = (target: string) =>
  pipe(
    TE.tryCatch(
      async () =>
        new Promise<void>((resolve, reject) =>
          fs.mkdir(target, { recursive: true }, (error) =>
            error !== null && error !== undefined
              ? reject(error)
              : resolve(constVoid()),
          ),
        ),
      flow(E.toError, (error) =>
        err({ type: 'unable to create directory', path: target, error }),
      ),
    ),
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
              fs.symlink(target, link, (error) =>
                error !== null && error !== undefined
                  ? reject(error)
                  : resolve(constVoid()),
              ),
            ),
          E.toError,
        ),
        // recover from symlink-already-exists error
        TE.orElse((error) =>
          error.message.startsWith('EEXIST:') ? TE.right(constVoid()) : TE.left(error),
        ),
        TE.mapLeft((error) =>
          err({ type: 'unable to create symlink', target, path: link, error }),
        ),
      ),
    ),
  )

const symlinkExecutable = (
  monorepoRoot: string,
  internalPackageDirectory: string,
  dependencyName: string,
) => (executableName: ExecutableName, targetPath: Path) => {
  const symlinkLocation = path.resolve(
    internalPackageDirectory,
    'node_modules',
    '.bin',
    executableName,
  )
  const target = path.relative(
    path.dirname(symlinkLocation),
    path.resolve(topLevelDependency(monorepoRoot)(dependencyName), targetPath),
  )
  return pipe(
    () => debug.cmd(`Creating symlink from ${symlinkLocation} -> ${target}`),
    TE.fromIO,
    TE.chain(() => symlink(target, symlinkLocation)),
  )
}

export const linkDependencyExecutables = (internalPackagePathOrName: string) => (
  dependencyName: string,
): TE.TaskEither<LinkDependencyExecutablesError, void> =>
  pipe(
    TE.bindTo('monorepoRoot')(monorepoRoot()),
    TE.bind('internalPackage', () => findPackage(internalPackagePathOrName)),
    TE.bind('dependencyManifest', ({ monorepoRoot }) =>
      externalPackageManifest(monorepoRoot)(dependencyName),
    ),
    TE.chain(({ monorepoRoot, internalPackage, dependencyManifest }) =>
      pipe(
        (dependencyManifest.bin ?? {}) as Record<ExecutableName, Path>,
        R.mapWithIndex(
          symlinkExecutable(monorepoRoot, internalPackage.location, dependencyName),
        ),
        (value) => value,
        Apply.sequenceS(TE.taskEither),
      ),
    ),
    TE.map(constVoid),
  )
