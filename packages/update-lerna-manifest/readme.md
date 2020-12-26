# update-lerna-manifest
[![License][]](https://opensource.org/licenses/ISC)
[![NPM Package][]](https://npmjs.org/package/@typescript-tools/update-lerna-manifest)
[![Build status][]](https://travis-ci.org/typescript-tools/update-lerna-manifest)
[![Code Coverage][]](https://codecov.io/gh/typescript-tools/update-lerna-manifest)

[License]: https://img.shields.io/badge/License-ISC-blue.svg
[NPM Package]: https://img.shields.io/npm/v/@typescript-tools/update-lerna-manifest.svg
[Build status]: https://travis-ci.org/typescript-tools/update-lerna-manifest.svg?branch=master
[Code Coverage]: https://codecov.io/gh/typescript-tools/update-lerna-manifest/branch/master/graph/badge.svg

> Keep the lerna manifest up to date

This tool solves a very specific use-case:

- when a new lerna package is added or removed from the monorepo,
  modify the lerna.json manifest to reflect the new monorepo state

You may get value from this tool if you:

- cannot write regex-based package whitelists in your lerna.json manifest

This is sometimes the case when e.g. retrofitting an existing monorepo
with lerna.

It is recommended to hook this tool automatically into the build
process somewhow, before running `lerna bootstrap`.

## Install

``` shell
npm install --save-dev @typescript-tools/update-lerna-manifest
```

## Use

```
Usage:
    update-lerna-manifest --package-dir=<glob>...

Options:
    --package-dir=<glob>    Glob of package directories to search for lerna packages
```

`update-lerna-manifest` will search for a `tsconfig.json` file
extending a parent's tsconfig.json file, like the following:

```json
{
    "extends": "../tsconfig.settings.json",
    "include": [
        "src/**/*",
        "test/**/test-*"
    ],
    "exclude": [
        "node_modules",
        "dist"
    ],
    "compilerOptions": {
        "outDir": "./dist",
    }
}
```

Specifically, it considers a package to be a lerna package if the
`extends` property ends with `/tsconfig.settings.json`. This may
result in false positives with your monorepo, in which case tightening
the `--package-dir` globs would be prudent.
