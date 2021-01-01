import * as t from 'io-ts'
import { PackageName } from './PackageName'
import { PackageVersion } from './PackageVersion'

export const PackageJsonDependencies = t.partial({
    dependencies: t.record(PackageName, PackageVersion),
    devDependencies: t.record(PackageName, PackageVersion),
    optionalDependencies: t.record(PackageName, PackageVersion),
    peerDependencies: t.record(PackageName, PackageVersion),
})

// DISCUSS: why does the computed type use {} instead of a typed record?
// Really crimping my type-inferencing style
export type PackageJsonDependencies = t.TypeOf<typeof PackageJsonDependencies>;
