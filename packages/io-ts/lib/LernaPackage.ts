import * as t from 'io-ts'

export const LernaPackage = t.type({
    name: t.string,
    version: t.string,
    location: t.string,
    private: t.boolean
})

export type LernaPackage = t.TypeOf<typeof LernaPackage>;
