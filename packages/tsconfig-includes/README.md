# tsconfig-includes

[![License][]](https://opensource.org/licenses/ISC)
[![NPM Package][]](https://npmjs.org/package/@typescript-tools/tsconfig-includes)
[![Build status][]](https://travis-ci.org/typescript-tools/tsconfig-includes)
[![Code Coverage][]](https://codecov.io/gh/typescript-tools/tsconfig-includes)

[license]: https://img.shields.io/badge/License-ISC-blue.svg
[npm package]: https://img.shields.io/npm/v/@typescript-tools/tsconfig-includes.svg
[build status]: https://travis-ci.org/typescript-tools/tsconfig-includes.svg?branch=master
[code coverage]: https://codecov.io/gh/typescript-tools/tsconfig-includes/branch/master/graph/badge.svg

> Enumerate files included by tsconfig.json

Supports the following properties in a `tsconfig.json` file:

- [x] `include`
- [ ] `exclude`
- [ ] `files`
- [ ] `extends`

See [more](https://www.typescriptlang.org/tsconfig#include) about
these settings.

## Install

```shell
npm install @typescript-tools/tsconfig-includes
```

## Use

```
Usage:
    tsconfig-includes <tsconfig>...

Options:
    tsconfig    Path to tsconfig for which to enumerate included files
```
