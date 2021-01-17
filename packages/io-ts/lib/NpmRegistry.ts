import * as t from 'io-ts'

export interface NpmRegistryBrand {
    readonly NpmRegistry: unique symbol;
}

export const NpmRegistry = t.brand(
    t.string,
    (_): _ is t.Branded<string, NpmRegistryBrand> => true,
    'NpmRegistry'
)

export type NpmRegistry = t.TypeOf<typeof NpmRegistry>;
