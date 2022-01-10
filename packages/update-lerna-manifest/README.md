# update-lerna-manifest

[![License][]](https://opensource.org/licenses/ISC)
[![NPM Package][]](https://npmjs.org/package/@typescript-tools/update-lerna-manifest)
[![Build Status]](https://github.com/typescript-tools/typescript-tools/actions/workflows/ci.yml)
[![semantic-release]](https://github.com/semantic-release/semantic-release)

[license]: https://img.shields.io/badge/License-ISC-blue.svg
[npm package]: https://img.shields.io/npm/v/@typescript-tools/update-lerna-manifest.svg
[build status]: https://github.com/typescript-tools/typescript-tools/actions/workflows/ci.yml/badge.svg
[semantic-release]: https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg

> Keep the Lerna manifest up to date

This tool solves a very specific use-case:

- when a new lerna package is added or removed from the monorepo,
  modify the lerna.json manifest to reflect the new monorepo state

You may get value from this tool if you:

- cannot write regex-based package whitelists in your lerna.json manifest

This is sometimes the case when e.g. retrofitting an existing monorepo
with Lerna, or using a monorepo containing projects in multiple languages.

It is recommended to hook this tool automatically into the build
process, before running `lerna bootstrap`.

## Install

```shell
npm install --save-dev @typescript-tools/update-lerna-manifest
```

## Use

```
Usage:
    update-lerna-manifest [--root <root>] [--depth <depth>] <dirs>...

Options:
    <dirs>             Directories to recursively search for lerna packages
    --root=<root>      Root of lerna mono-repository
    --depth=<depth>    Maximum directory depth in package search
```

Example:

```shell
npx update-lerna-manifest packages
```

Note that the glob only needs to point to a parent directory
containing lerna packages; each glob will be scanned recursively.

`update-lerna-manifest` will search for a `tsconfig.json` file
extending a parent's tsconfig.json file, like the following:

```json
{
  "extends": "../tsconfig.settings.json",
  "include": ["src/**/*", "test/**/test-*"],
  "exclude": ["node_modules", "dist"],
  "compilerOptions": {
    "outDir": "./dist"
  }
}
```

Specifically, it considers a package to be a lerna package if the
`extends` property ends with `/tsconfig.settings.json`. This may
result in false positives with your monorepo, in which case tightening
the `dirs` globs would be prudent.

### JSON compatibility

Like the rest of the typescript-tools, `update-lerna-manifest` requires
all package `tsconfig.json` files to be valid [JSON] documents, not [JSON5]
or [json-c]. The TypeScript compiler accepts JSON5, but the typescript-tools do not.

[json]: https://www.json.org/json-en.html
[json5]: https://json5.org/
[json-c]: https://github.com/json-c/json-c
