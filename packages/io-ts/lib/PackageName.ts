import * as t from 'io-ts'
import * as E from 'fp-ts/Eq'

export interface PackageNameBrand {
    readonly PackageName: unique symbol;
}

export const PackageName = t.brand(
    t.string,
    (_): _ is t.Branded<string, PackageNameBrand> => true,
    'PackageName'
)

export type PackageName = t.TypeOf<typeof PackageName>;

export const Eq: E.Eq<PackageName> = E.eqString
