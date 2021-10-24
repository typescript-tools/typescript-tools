#!/usr/bin/env node

/**
 * hoisted-package-json
 * Generate the package.json used during a hoisted bootstrap
 */

import * as fs from 'fs'
import * as path from 'path'

import {
  hoistedPackages,
  PackageManifestsError,
} from '@typescript-tools/hoisted-packages'
import {
  LernaPackage,
  PackageJsonDependencies,
  PackageName,
  PackageVersion,
  StringifiedJSON,
} from '@typescript-tools/io-ts'
import { lernaPackages } from '@typescript-tools/lerna-packages'
import { monorepoRoot, MonorepoRootError } from '@typescript-tools/monorepo-root'
import { sequenceS } from 'fp-ts/Apply'
import * as Console from 'fp-ts/Console'
import * as E from 'fp-ts/Either'
import * as T from 'fp-ts/Task'
import * as TE from 'fp-ts/TaskEither'
import { pipe, flow } from 'fp-ts/function'
import * as t from 'io-ts'
import { decodeDocopt as decodeDocopt_ } from 'io-ts-docopt'
import * as PathReporter from 'io-ts/lib/PathReporter'

const docstring = `
Usage:
    hoisted-package-json

Options:
`

const CommandLineOptions = t.type({})

type Err =
  | PackageManifestsError
  | MonorepoRootError
  | { type: 'docopt decode'; error: string }
  | { type: 'unexpected contents in top-level package.json'; error: string }
  | { type: 'unable to stringify package.json'; error: Error }

const readFile = (filename: string) =>
  TE.tryCatch(
    async () =>
      new Promise<string>((resolve, reject) => {
        fs.readFile(filename, 'utf8', (error, data) => {
          if (error !== null && error !== undefined) {
            reject(error)
          } else {
            resolve(data)
          }
        })
      }),
    flow(
      E.toError,
      (error) => ({ type: 'unable to read file', filename, error } as const),
    ),
  )

const decodeDocopt = flow(
  decodeDocopt_,
  E.mapLeft(
    flow(
      (errors) => PathReporter.failure(errors).join('\n'),
      (error) => ({ type: 'docopt decode', error } as const),
    ),
  ),
  TE.fromEither,
)

const readRootPackageJson = (
  root: string,
): TE.TaskEither<Err, PackageJsonDependencies> =>
  pipe(
    path.resolve(root, 'package.json'),
    readFile,
    TE.chainW(
      flow(
        StringifiedJSON(PackageJsonDependencies).decode.bind(null),
        E.mapLeft(
          flow(
            (errors) => PathReporter.failure(errors).join('\n'),
            (error) =>
              ({
                type: 'unexpected contents in top-level package.json',
                error,
              } as const),
          ),
        ),
        TE.fromEither,
      ),
    ),
  )

const hoistedPackageJson = (
  hoisted: Map<PackageName, PackageVersion>,
  manifest: PackageJsonDependencies,
): PackageJsonDependencies =>
  Object.assign({}, manifest, {
    devDependencies: undefined,
    peerDependencies: undefined,
    optionalDependencies: undefined,
    dependencies: Object.fromEntries(hoisted),
  })

const stringifyJson = (json: Record<string, unknown>): TE.TaskEither<Err, string> =>
  pipe(
    E.tryCatch(() => JSON.stringify(json, null, 2), E.toError),
    E.mapLeft(
      (error) => ({ type: 'unable to stringify package.json', error } as const),
    ),
    TE.fromEither,
  )

const removeInternalPackages = (
  hoisted: Map<PackageName, PackageVersion>,
  internalPackages: LernaPackage[],
): Map<PackageName, PackageVersion> => {
  for (const pkg of internalPackages) {
    hoisted.delete(pkg.name)
  }
  return hoisted
}

const main: T.Task<void> = pipe(
  TE.bindTo('options')(decodeDocopt(CommandLineOptions, docstring)),
  TE.bindW('root', () => TE.fromEither(monorepoRoot())),
  TE.chainW(({ root }) =>
    pipe(
      {
        // FIXME: remove internal packages
        hoisted: hoistedPackages(root),
        lernaPackages: lernaPackages(root),
        rootPackageJson: readRootPackageJson(root),
      },
      sequenceS(TE.ApplicativePar),
      TE.chain(({ hoisted, lernaPackages, rootPackageJson }) =>
        pipe(
          removeInternalPackages(hoisted, lernaPackages),
          (hoisted) => hoistedPackageJson(hoisted, rootPackageJson),
          stringifyJson,
        ),
      ),
    ),
  ),
  TE.fold(flow(Console.error, T.fromIO), flow(Console.log, T.fromIO)),
)

main()

// Local Variables:
// mode: typescript
// End:
