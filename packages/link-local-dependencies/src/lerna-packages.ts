import * as A from 'fp-ts/ReadonlyArray'
import * as M from 'fp-ts/Map'
import * as TE from 'fp-ts/TaskEither'
import { pipe, flow } from 'fp-ts/lib/function'
import {
    lernaPackages as lernaPackages_,
} from '@typescript-tools/lerna-packages'
import { LernaPackage } from '@typescript-tools/io-ts/dist/lib/LernaPackage'
import { eqString } from 'fp-ts/Eq'
import { getFirstSemigroup } from 'fp-ts/Semigroup'
import { PackageName } from '@typescript-tools/io-ts/dist/lib/PackageName'
import { Path } from '@typescript-tools/io-ts/dist/lib/Path'

export const lernaPackages = flow(
    lernaPackages_,
    TE.map(packages =>
        pipe(
            packages,
            A.chain((pkg): [
                [PackageName, LernaPackage],
                [Path, LernaPackage]
            ] => [
                [pkg.name, pkg],
                [pkg.location, pkg],
            ]),
            M.fromFoldable(
                eqString,
                getFirstSemigroup<LernaPackage>(),
                A.readonlyArray
            ),
            packagesMap => ({ list: packages, map: packagesMap })
        )
    )
)
