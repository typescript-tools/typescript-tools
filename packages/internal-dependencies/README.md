# internal-dependencies
[![License][]](https://opensource.org/licenses/ISC)
[![NPM Package][]](https://npmjs.org/package/@typescript-tools/internal-dependencies)

[License]: https://img.shields.io/badge/License-ISC-blue.svg
[NPM Package]: https://img.shields.io/npm/v/@typescript-tools/internal-dependencies.svg

> Calculate package dependencies living in the same monorepo

## Install

``` shell
npm install --save-dev @typescript-tools/internal-dependencies
```

## Use

```
Usage:
    internal-dependencies [--root <root>] [--path] <package>...

Options:
    packages         Package names or paths to print dependencies of (also reads from stdin)
    --root=<root>    Root of lerna mono-repository
    --path           Print the relative path to each package from root
```

`internal-dependencies` reads one or more packages either as arguments
or from `stdin`, and outputs the internal dependencies that the list
of packages depends upon, either directly or transitively.

Packages may be specified by path or by (scoped) name.

## Examples

> Note: all examples run from the root of this monorepo

Given the following `package.json`

```json
{
    "name": "@typescript-tools/lerna-utils",
    "version": "2.1.1",
    "dependencies": {
        "@typescript-tools/io-ts": "^2.2.0"
    },
}
```

`internal-dependencies` prints the following

``` shell
$ echo @typescript-tools/lerna-utils | npx internal-dependencies
@typescript-tools/io-ts

$ echo @typescript-tools/lerna-utils | npx internal-dependencies
@typescript-tools/io-ts
```

Use `--path` to print the path to the dependencies rather than the
package names

```json

{
    "name": "@typescript-tools/internal-dependencies",
    "version": "2.2.4",
    "dependencies": {
        "@typescript-tools/dependency-graph": "^2.1.5",
        "@typescript-tools/find-package": "^1.1.3",
        "@typescript-tools/io-ts": "^2.2.0",
        "@typescript-tools/lerna-packages": "^2.2.2",
        "@typescript-tools/monorepo-root": "^1.3.2"
    },
    "devDependencies": {
}
```

``` shell
$ npx internal-dependencies --path @typescript-tools/internal-dependencies
packages/dependency-graph
packages/find-package
packages/io-ts
packages/lerna-packages
packages/monorepo-root
packages/lerna-utils
```
