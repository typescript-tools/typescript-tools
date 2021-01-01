/**
 * package-manifests
 * Read every package's package.json
 */

import * as path from 'path'
import * as F from 'fluture'
import * as A from 'fp-ts/Array'
import * as E from 'fp-ts/Either'
import { pipe, flow } from 'fp-ts/function'
import { lernaPackages, readFile } from '@typescript-tools/lerna-utils'
import { LernaPackage } from '@typescript-tools/io-ts/dist/lib/LernaPackage'
import { monorepoRoot } from '@typescript-tools/monorepo-root'

// FIXME: I think the errors in here and in lernaPackages can be
// cleaned up (narrowed from unknown)

export function packageManifests(
    somePathInMonorepo?: string
): F.FutureInstance<unknown,{
    pkg: LernaPackage,
    contents: E.Json,
}[]> {
    return pipe(
        monorepoRoot(somePathInMonorepo),
        E.map(root => lernaPackages(root)
            .pipe(F.chain(
                flow(
                    A.map(pkg =>
                        readFile(path.resolve(pkg.location, 'package.json'))
                            .pipe(F.chain(contents => pipe(
                                E.parseJSON(contents, E.toError),
                                E.map(contents => F.resolve({pkg, contents})),
                                E.getOrElseW(error => F.reject(`Unable to parse ${pkg.location}/package.json, ${error.message}`))
                            )))
                         ),
                    F.parallel(200)
                )
            ))),
        E.getOrElseW(F.reject)
    )
}
