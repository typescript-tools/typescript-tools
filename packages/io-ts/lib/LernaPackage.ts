import * as t from 'io-ts'
import { Path } from './Path'
import { PackageName } from './PackageName'
import { PackageVersion } from './PackageVersion'

export const LernaPackage = t.type({
  name: PackageName,
  version: PackageVersion,
  location: Path,
  private: t.boolean,
})

export type LernaPackage = t.TypeOf<typeof LernaPackage>
