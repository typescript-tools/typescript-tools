# containing-packages

[![License][]](https://opensource.org/licenses/ISC)
[![NPM Package][]](https://npmjs.org/package/@typescript-tools/containing-packages)
[![Build Status]](https://github.com/typescript-tools/typescript-tools/actions/workflows/ci.yml)
[![semantic-release]](https://github.com/semantic-release/semantic-release)

[license]: https://img.shields.io/badge/License-ISC-blue.svg
[npm package]: https://img.shields.io/npm/v/@typescript-tools/containing-packages.svg
[build status]: https://github.com/typescript-tools/typescript-tools/actions/workflows/ci.yml/badge.svg
[semantic-release]: https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg

> Map a list of files into the list of packages containing those files

## Install

```shell
npm install @typescript-tools/containing-packages
```

## Use

```
Usage:
    containing-packages [--root <root>] <file>...

Options:
    --root=<root>    Root of lerna mono-repository
```

## Example

```shell
$ npx ts-node ./src/index.ts packages/containing-packages/src/index.ts

@typescript-tools/containing-packages
```

## Related

- [configure-lerna-manifest](https://github.com/typescript-tools/typescript-tools/tree/master/packages/configure-lerna-manifest)
