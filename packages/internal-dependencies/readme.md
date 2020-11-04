# internal-dependencies
[![License][]](https://opensource.org/licenses/ISC)
[![NPM Package][]](https://npmjs.org/package/@typescript-tools/internal-dependencies)
[![Build status][]](https://travis-ci.org/typescript-tools/internal-dependencies)
[![Code Coverage][]](https://codecov.io/gh/typescript-tools/internal-dependencies)

[License]: https://img.shields.io/badge/License-ISC-blue.svg
[NPM Package]: https://img.shields.io/npm/v/@typescript-tools/internal-dependencies.svg
[Build status]: https://travis-ci.org/typescript-tools/internal-dependencies.svg?branch=master
[Code Coverage]: https://codecov.io/gh/typescript-tools/internal-dependencies/branch/master/graph/badge.svg

> Calculate package dependencies living in the same monorepo

## Install

``` shell
npm install --save-dev @typescript-tools/internal-dependencies
```

## Use

``` shell
Usage:
    internal-dependencies [--path] <root> <package>...

Options:
    root        Root of lerna mono-repository
    packages    Packages to print dependencies of (also reads from stdin)
    --path      Print the relative path to each package from root
```

## Example

`internal-dependencies` can read one or more package names (the `name`
property in the package's `package.json`) either as arguments or stdin.

It outputs the internal dependencies that the list of packages depends
upon, either directly or transitively.

``` shell
$ echo @typescript-tools/lerna-utils | node ./packages/internal-dependencies/dist/src/internal-dependencies.js .
@typescript-tools/io-ts
```

Use `--path` to print the path to the dependencies rather than the
package names.

``` shell
$ internal-dependencies --path . @typescript-tools/internal-dependencies
packages/io-ts
packages/lerna-utils
```
