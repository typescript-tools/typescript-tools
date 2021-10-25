# tsconfig-includes

[![License][]](https://opensource.org/licenses/ISC)
[![NPM Package][]](https://npmjs.org/package/@typescript-tools/tsconfig-includes)
[![Build Status]](https://github.com/typescript-tools/typescript-tools/actions/workflows/ci.yml)
[![semantic-release]](https://github.com/semantic-release/semantic-release)

[license]: https://img.shields.io/badge/License-ISC-blue.svg
[npm package]: https://img.shields.io/npm/v/@typescript-tools/tsconfig-includes.svg
[build status]: https://github.com/typescript-tools/typescript-tools/actions/workflows/ci.yml/badge.svg
[semantic-release]: https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg

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
