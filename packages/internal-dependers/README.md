# internal-dependers
[![License][]](https://opensource.org/licenses/ISC)
[![NPM Package][]](https://npmjs.org/package/@typescript-tools/internal-dependers)

[License]: https://img.shields.io/badge/License-ISC-blue.svg
[NPM Package]: https://img.shields.io/npm/v/@typescript-tools/internal-dependers.svg

> Calculate dependents of a package in the same monorepo

## Install

``` shell
npm install --save-dev @typescript-tools/internal-dependers
```

## Use

```
Usage:
    internal-dependers [--root <root>] [--path] <package>...

Options:
    packages         Package names or paths to print dependers of (also reads from stdin)
    --root=<root>    Root of lerna mono-repository
    --path           Print the relative path to each package from root
```

`internal-dependers` reads one or more packages either as arguments
or from `stdin`, and outputs the internal packages that depend on that
list, either directly or transitively.

Packages may be specified by path or by (scoped) name.

## Examples

> Note: all examples run from the root of this monorepo

``` shell
$ node ./packages/internal-dependers/dist/src/index.js @typescript-tools/hoisted-packages
@typescript-tools/hoisted-package-json
@typescript-tools/use-hoisted-version
```

``` shell
$ npx internal-dependers --path @typescript-tools/hoisted-packages
packages/hoisted-package-json
packages/use-hoisted-version
```
