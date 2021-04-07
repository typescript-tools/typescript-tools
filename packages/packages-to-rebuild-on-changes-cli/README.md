# packages-to-rebuild-on-changes-cli
[![License][]](https://opensource.org/licenses/ISC)
[![NPM Package][]](https://npmjs.org/package/@typescript-tools/packages-to-rebuild-on-changes-cli)
[![Build status][]](https://travis-ci.org/typescript-tools/packages-to-rebuild-on-changes-cli)
[![Code Coverage][]](https://codecov.io/gh/typescript-tools/packages-to-rebuild-on-changes-cli)

[License]: https://img.shields.io/badge/License-ISC-blue.svg
[NPM Package]: https://img.shields.io/npm/v/@typescript-tools/packages-to-rebuild-on-changes-cli.svg
[Build status]: https://travis-ci.org/typescript-tools/packages-to-rebuild-on-changes-cli.svg?branch=master
[Code Coverage]: https://codecov.io/gh/typescript-tools/packages-to-rebuild-on-changes-cli/branch/master/graph/badge.svg

> Enumerate packages reachable from graph traversal given starting packages

## Install

``` shell
npm install @typescript-tools/packages-to-rebuild-on-changes-cli
```

## Use

``` typescript
Usage:
    packages-to-rebuild-on-changes [--root <root>] [--path] <package>...

Options:
    packages         Package names or paths to rebuild when listed packages change (also reads from stdin)
    --root=<root>    Root of lerna mono-repository
    --path           Print the relative path to each package from root
```
