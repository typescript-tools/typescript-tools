import * as t from 'io-ts'
import { PackageName } from './PackageName'
import { PackageVersion } from './PackageVersion'
import { Checksum } from './Checksum'

export const RegistryMetadata = t.type({
    name: PackageName,
    version: PackageVersion,
    integrity: Checksum,
    filename: t.string,
})

export type RegistryMetadata = t.TypeOf<typeof RegistryMetadata>;
