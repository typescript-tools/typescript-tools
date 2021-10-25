# link-local-dependencies

[![License][]](https://opensource.org/licenses/ISC)
[![NPM Package][]](https://npmjs.org/package/@typescript-tools/link-local-dependencies)
[![Build Status]](https://github.com/typescript-tools/typescript-tools/actions/workflows/ci.yml)
[![semantic-release]](https://github.com/semantic-release/semantic-release)

[license]: https://img.shields.io/badge/License-ISC-blue.svg
[npm package]: https://img.shields.io/npm/v/@typescript-tools/link-local-dependencies.svg
[build status]: https://github.com/typescript-tools/typescript-tools/actions/workflows/ci.yml/badge.svg
[semantic-release]: https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg

> Link internal dependencies dependencies

This command performs one phase of a `lerna bootstrap`: symlinking internal dependencies
into the `node_modules` directory of an internal package.

## Install

```shell
npm install @typescript-tools/link-local-dependencies
```

## Use

```
Usage:
    link-local-dependencies [<package>]

Options:
    package    Path or name of single package for which to install local dependencies
```

## Related

- [link-dependency-executables](https://github.com/typescript-tools/typescript-tools/tree/master/packages/link-dependency-executables)
