import * as t from 'io-ts'

// FIXME: can probably use an npm package to validate npm versions,
// although that does sound like a daunting regex

export interface PackageVersionBrand {
    readonly PackageVersion: unique symbol;
}

export const PackageVersion = t.brand(
    t.string,
    (_): _ is t.Branded<string, PackageVersionBrand> => true,
    'PackageVersion'
)

export type PackageVersion = t.TypeOf<typeof PackageVersion>;
