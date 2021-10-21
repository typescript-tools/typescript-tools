# pin-lerna-package-versions

[![License][]](https://opensource.org/licenses/ISC)
[![NPM Package][]](https://npmjs.org/package/@typescript-tools/pin-lerna-package-versions)
[![Build status][]](https://travis-ci.org/typescript-tools/pin-lerna-package-versions)
[![Code Coverage][]](https://codecov.io/gh/typescript-tools/pin-lerna-package-versions)

[license]: https://img.shields.io/badge/License-ISC-blue.svg
[npm package]: https://img.shields.io/npm/v/@typescript-tools/pin-lerna-package-versions.svg
[build status]: https://travis-ci.org/typescript-tools/pin-lerna-package-versions.svg?branch=master
[code coverage]: https://codecov.io/gh/typescript-tools/pin-lerna-package-versions/branch/master/graph/badge.svg

> Pin lerna dependencies to latest managed version

## Install

```shell
npm install --save-dev @typescript-tools/pin-lerna-package-versions
```

## Use

```shell
Usage:
    pin-lerna-package-versions [--dist-tag=<tag>] [<root>]

Options:
    root                Root of lerna mono-repository, defaults to cwd
    --dist-tag=<tag>    Pin versions of internal packages to dist tag
```

## Related

- [@typescript-tools/typescript-build-linker](https://github.com/typescript-tools/typescript-build-linker)
