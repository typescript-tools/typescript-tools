import * as t from 'io-ts'

export interface PackageNameBrand {
    readonly PackageName: unique symbol;
}

export const PackageName = t.brand(
    t.string,
    (_): _ is t.Branded<string, PackageNameBrand> => true,
    'PackageName'
)

export type PackageName = t.TypeOf<typeof PackageName>;
