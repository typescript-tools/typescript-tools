# configure-lerna-manifest

[![License][]](https://opensource.org/licenses/ISC)
[![NPM Package][]](https://npmjs.org/package/@typescript-tools/configure-lerna-manifest)
[![Build Status]](https://github.com/typescript-tools/typescript-tools/actions/workflows/ci.yml)
[![semantic-release]](https://github.com/semantic-release/semantic-release)

[license]: https://img.shields.io/badge/License-ISC-blue.svg
[npm package]: https://img.shields.io/npm/v/@typescript-tools/configure-lerna-manifest.svg
[build status]: https://github.com/typescript-tools/typescript-tools/actions/workflows/ci.yml/badge.svg
[semantic-release]: https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg

> Configure Lerna manifest properties

## Install

```shell
npm install --save-dev @typescript-tools/configure-lerna-manifest
```

## Use

```
Usage:
    configure-lerna-manifest [--root <root>] --packages [<package>]...

Options:
    packages         Package names or paths to include in the lerna manifest (also reads from stdin)
    --root=<root>    Root of lerna mono-repository
```

For example:

```shell
git diff --name-only "origin/${CI_DEFAULT_BRANCH}" \
  | npx containing-packages \
  | npx packages-to-rebuild-on-changes \
  | npx configure-lerna-manifest --packages
```

This one-liner

1. determines the packages that contain diffs when compared against the default git branch,
2. calculates internal dependencies and internal consumers, and
3. sets the `packages` property of `lerna.json` to this list
