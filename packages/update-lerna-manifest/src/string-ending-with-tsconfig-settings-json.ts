import * as t from 'io-ts'

export interface StringEndingWithBrand {
  readonly StringEndingWithTsconfigSettingsJson: unique symbol
}

export const StringEndingWithTsconfigSettingsJson = t.brand(
  t.string,
  (s): s is t.Branded<string, StringEndingWithBrand> =>
    s.endsWith('/tsconfig.settings.json'),
  'StringEndingWithTsconfigSettingsJson',
)

export type StringEndingWith = t.TypeOf<typeof StringEndingWithTsconfigSettingsJson>
