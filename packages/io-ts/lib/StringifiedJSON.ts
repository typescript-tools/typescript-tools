import * as t from 'io-ts'
import * as E from 'fp-ts/Either'
import { pipe } from 'fp-ts/pipeable'

export const StringifiedJSON = <C extends t.Mixed>(
  codec: C,
): t.Type<t.TypeOf<C>, string, unknown> =>
  new t.Type(
    `StringifiedJSON`.concat(codec.name),
    (u): u is C =>
      typeof u !== 'string'
        ? false
        : pipe(
            E.parseJSON(u, E.toError),
            E.fold(() => false, codec.is),
          ),
    (u, c) =>
      E.either.chain(t.string.validate(u, c), (string) =>
        pipe(
          E.parseJSON(string, E.toError),
          E.fold(() => t.failure(u, c), codec.decode.bind(null)),
        ),
      ),
    codec.encode,
  )
