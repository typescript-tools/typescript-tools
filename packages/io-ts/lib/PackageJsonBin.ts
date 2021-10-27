import * as t from 'io-ts'

import { ExecutableName } from './ExecutableName'
import { Path } from './Path'

export const PackageJsonBin = t.partial({
  bin: t.record(ExecutableName, Path),
})

// DISCUSS: why does the computed type use {} instead of a typed record?
// Really crimping my type-inferencing style
export type PackageJsonBin = t.TypeOf<typeof PackageJsonBin>
