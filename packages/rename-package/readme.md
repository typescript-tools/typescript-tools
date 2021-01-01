# rename-package
[![License][]](https://opensource.org/licenses/ISC)
[![NPM Package][]](https://npmjs.org/package/@typescript-tools/rename-package)
[![Build status][]](https://travis-ci.org/typescript-tools/rename-package)
[![Code Coverage][]](https://codecov.io/gh/typescript-tools/rename-package)

[License]: https://img.shields.io/badge/License-ISC-blue.svg
[NPM Package]: https://img.shields.io/npm/v/@typescript-tools/rename-package.svg
[Build status]: https://travis-ci.org/typescript-tools/rename-package.svg?branch=master
[Code Coverage]: https://codecov.io/gh/typescript-tools/rename-package/branch/master/graph/badge.svg

> Rename an internal package

## Install

``` shell
npm install -g @typescript-tools/rename-package
```

## Use

```
Usage:
    rename-package --root=<dir> <current-package-name> <desired-package-name>

Options:
    --root=<dir>              Monorepo root directory
    <current-package-name>    Current name (including scope) of target package
    <desired-package-name>    Desired name (including scope) of target package
```
