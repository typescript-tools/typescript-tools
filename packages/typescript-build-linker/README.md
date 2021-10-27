# typescript-build-linker

[![License][]](https://opensource.org/licenses/ISC)
[![NPM Package][]](https://npmjs.org/package/@typescript-tools/typescript-build-linker)
[![Build Status]](https://github.com/typescript-tools/typescript-tools/actions/workflows/ci.yml)
[![semantic-release]](https://github.com/semantic-release/semantic-release)

[license]: https://img.shields.io/badge/License-ISC-blue.svg
[npm package]: https://img.shields.io/npm/v/@typescript-tools/typescript-build-linker.svg
[build status]: https://github.com/typescript-tools/typescript-tools/actions/workflows/ci.yml/badge.svg
[semantic-release]: https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg

> Link together TypeScript packages in a monorepo

Automatically manage [TypeScript Project References] in a [Lerna] monorepo.

[typescript project references]: https://www.typescriptlang.org/docs/handbook/project-references.html
[lerna]: https://github.com/lerna/lerna

## The Problem

Whereas [Lerna] was created for managing JavaScript monorepos, TypeScript monorepos have
additional requirements introduced by the compilation step.

Specifically, the TypeScript compiler can only create an accurate DAG of build
dependencies when [TypeScript Project References] are up to date.

## The Solution

The `typescript-build-linker` uses your monorepo's `package.json` files as the single
source of truth to calculate the DAG of internal package dependencies, and automates
upkeep of your TypeScript Project References.

This affords us two ways to build:

1. from the top level

   Build every package, in the proper order, using cached results from prior
   compilations where possible.

2. a single package

   Builds the specified package and all internal dependencies, in the proper order,
   using cached results from prior compilations where possible.

## Install

```shell
npm install --save-dev @typescript-tools/typescript-build-linker
```

## Use

```
Usage:
    typescript-build-linker [<repository>]

Options:
    <repository>    Path to monorepo root, defaults to cwd
```

Point tsl at the root directory of your monorepo and it will write the references list
in each tsconfig.json file of every leaf package and parent directory.

When the `DEBUG` environment variable is set to `link`, the `typescript-build-linker`
will print the file modifications it's making to stdout.

## Integrate into Your Build System

Simply configure `typescript-build-linker` to run before `tsc`.

Example `package.json` in monorepo root:

```json
{
  "name": "root",
  "private": true,
  "scripts": {
    "bootstrap": "lerna bootstrap --hoist --strict --force-local",
    "prebuild": "typescript-build-linker .",
    "build": "tsc --build --verbose packages"
  },
  "devDependencies": {
    "@typescript-tools/typescript-build-linker": "latest",
    "lerna": "^4.0.0"
  }
}
```

## Limitations

### JSON vs jsonc

Note that some `tsconfig.json` files include comments; this is not valid JSON syntax,
but rather [JSONC]. The `typescript-build-linker` currently does not support JSONC, so
be sure to strip out the comments from your `tsconfig.json` files before use.

As mentioned in the
[update-ts-references](https://github.com/eBayClassifiedsGroup/update-ts-references#where-are-the-comments-from-my-tsconfig)
FAQ, it is possible to use the `extends` keyword to shunt the comments to a JSON file
not managed by the `typescript-build-linker`.

[jsonc]: https://github.com/microsoft/node-jsonc-parser

### Single Threaded Builds

There is an [open issue](https://github.com/microsoft/TypeScript/issues/30235) in the
TypeScript project to support multi-threaded compilation, but for now the stock tooling
can only compile packages serially.

## Related

- [update-ts-references](https://github.com/eBayClassifiedsGroup/update-ts-references)
- [lerna]

## Acknowledgments

- [lern-a](https://github.com/RyanCavanaugh/learn-a)
