import * as t from 'io-ts'

export interface DistTagBrand {
    readonly DistTag: unique symbol;
}

export const DistTag = t.brand(
    t.string,
    (_): _ is t.Branded<string, DistTagBrand> => true,
    'DistTag'
)

export type DistTag = t.TypeOf<typeof DistTag>;
