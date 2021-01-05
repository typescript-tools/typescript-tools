import * as t from 'io-ts'
import { PackageName } from './PackageName'
import { PackageVersion } from './PackageVersion'
import { getStructSemigroup, getFirstSemigroup, getObjectSemigroup } from 'fp-ts/lib/Semigroup'

export const PackageLockJson = t.type({
    name: PackageName,
    version: PackageVersion,
    lockfileVersion: t.literal(1),
    dependencies: t.UnknownRecord,
})

export type PackageLockJson = t.TypeOf<typeof PackageLockJson>;

export const PackageLockJsonSemigroup = getStructSemigroup<PackageLockJson>({
    name: getFirstSemigroup<PackageName>(),
    version: getFirstSemigroup<PackageVersion>(),
    lockfileVersion: getFirstSemigroup<1>(),
    dependencies: getObjectSemigroup<Record<string, unknown>>(),
})
