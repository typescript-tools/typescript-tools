/**
 * lerna-utils
 * Internal utilities for interacting with a lerna monorepo
 */

import * as fs from 'fs'
import * as TE from 'fp-ts/TaskEither'
import { flow } from 'fp-ts/function'

export const readFile = flow(
    TE.taskify(fs.readFile),
    TE.map(buffer => buffer.toString()),
)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const write: (filename: fs.PathLike, data: string, options: any) =>
    TE.TaskEither<NodeJS.ErrnoException, void> = TE.taskify(fs.writeFile)

export const writeFile =
    (filename: fs.PathLike) =>
    (contents: string): TE.TaskEither<NodeJS.ErrnoException, void> =>
    write(filename, contents, {})
