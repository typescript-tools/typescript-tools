import * as t from 'io-ts'
import { PackageName } from './PackageName'
import { PackageVersion } from './PackageVersion'

export const LernaPackage = t.type({
    name: PackageName,
    version: PackageVersion,
    location: t.string,
    private: t.boolean
})

export type LernaPackage = t.TypeOf<typeof LernaPackage>;
