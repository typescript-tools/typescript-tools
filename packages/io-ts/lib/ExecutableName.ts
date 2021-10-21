import * as t from 'io-ts'

export interface ExecutableNameBrand {
  readonly ExecutableName: unique symbol
}

export const ExecutableName = t.brand(
  t.string,
  (_): _ is t.Branded<string, ExecutableNameBrand> => true,
  'ExecutableName',
)

export type ExecutableName = t.TypeOf<typeof ExecutableName>
