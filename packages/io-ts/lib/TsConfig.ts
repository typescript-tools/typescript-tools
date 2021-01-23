import * as t from 'io-ts'
import { PackageName } from './PackageName'

export const TsConfigReference = t.type({
    path: PackageName,
})

export type TsConfigReference = t.TypeOf<typeof TsConfigReference>;

export const TsConfig = t.partial({
    references: t.array(TsConfigReference),
})

export type TsConfig = t.TypeOf<typeof TsConfig>;
