import { LernaPackage } from '@typescript-tools/io-ts/dist/lib/LernaPackage'
import { PackageName } from '@typescript-tools/io-ts/dist/lib/PackageName'
import { Path } from '@typescript-tools/io-ts/dist/lib/Path'
import { lernaPackages as lernaPackages_ } from '@typescript-tools/lerna-packages'
import { eqString } from 'fp-ts/Eq'
import * as M from 'fp-ts/Map'
import * as A from 'fp-ts/ReadonlyArray'
import { getFirstSemigroup } from 'fp-ts/Semigroup'
import * as TE from 'fp-ts/TaskEither'
import { pipe, flow } from 'fp-ts/function'

export const lernaPackages = flow(
  lernaPackages_,
  TE.map((packages) =>
    pipe(
      packages,
      A.chain((pkg): [[PackageName, LernaPackage], [Path, LernaPackage]] => [
        [pkg.name, pkg],
        [pkg.location, pkg],
      ]),
      M.fromFoldable(eqString, getFirstSemigroup<LernaPackage>(), A.readonlyArray),
      (packagesMap) => ({ list: packages, map: packagesMap }),
    ),
  ),
)
