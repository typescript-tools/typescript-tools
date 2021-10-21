import * as t from 'io-ts'

export interface PathBrand {
  readonly Path: unique symbol
}

export const Path = t.brand(
  t.string,
  (_): _ is t.Branded<string, PathBrand> => true,
  'Path',
)

export type Path = t.TypeOf<typeof Path>
