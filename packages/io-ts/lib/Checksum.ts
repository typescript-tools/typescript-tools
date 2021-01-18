import * as t from 'io-ts'

export interface ChecksumBrand {
    readonly Checksum: unique symbol;
}

export const Checksum = t.brand(
    t.string,
    (_): _ is t.Branded<string, ChecksumBrand> => true,
    'Checksum'
)

export type Checksum = t.TypeOf<typeof Checksum>;
