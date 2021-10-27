# pin-lerna-package-versions

[![License][]](https://opensource.org/licenses/ISC)
[![NPM Package][]](https://npmjs.org/package/@typescript-tools/pin-lerna-package-versions)
[![Build Status]](https://github.com/typescript-tools/typescript-tools/actions/workflows/ci.yml)
[![semantic-release]](https://github.com/semantic-release/semantic-release)

[license]: https://img.shields.io/badge/License-ISC-blue.svg
[npm package]: https://img.shields.io/npm/v/@typescript-tools/pin-lerna-package-versions.svg
[build status]: https://github.com/typescript-tools/typescript-tools/actions/workflows/ci.yml/badge.svg
[semantic-release]: https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg

> Pin lerna dependencies to latest managed version

## Install

```shell
npm install --save-dev @typescript-tools/pin-lerna-package-versions
```

## Use

```
Usage:
    pin-lerna-package-versions [--dist-tag=<tag>] [<root>]

Options:
    root                Root of lerna mono-repository, defaults to cwd
    --dist-tag=<tag>    Pin versions of internal packages to dist tag
```

## Related

- [@typescript-tools/typescript-build-linker](https://github.com/typescript-tools/typescript-build-linker)
