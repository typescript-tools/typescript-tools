# link-dependency-executables

[![License][]](https://opensource.org/licenses/ISC)
[![NPM Package][]](https://npmjs.org/package/@typescript-tools/link-dependency-executables)
[![Build Status]](https://github.com/typescript-tools/typescript-tools/actions/workflows/ci.yml)
[![semantic-release]](https://github.com/semantic-release/semantic-release)

[license]: https://img.shields.io/badge/License-ISC-blue.svg
[npm package]: https://img.shields.io/npm/v/@typescript-tools/link-dependency-executables.svg
[build status]: https://github.com/typescript-tools/typescript-tools/actions/workflows/ci.yml/badge.svg
[semantic-release]: https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg

> Link a package's executables into node_modules

This command performs one phase of a `lerna bootstrap`: adding `bin` scripts from
external dependencies into the `node_modules/.bin` directory of an internal dependency.

## Install

```shell
npm install --save-dev @typescript-tools/link-dependency-executables
```

## Use

```
Usage:
    link-dependency-executables <internal-package> <dependency>

Options:
    internal-package    Path or name of package into which to link dependency's executables
    dependency          Name of dependency containing executables to link
```

## Related

- [link-local-dependencies](https://github.com/typescript-tools/typescript-tools/tree/master/packages/link-local-dependencies)
