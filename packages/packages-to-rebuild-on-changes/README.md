# packages-to-rebuild-on-changes

[![License][]](https://opensource.org/licenses/ISC)
[![NPM Package][]](https://npmjs.org/package/@typescript-tools/packages-to-rebuild-on-changes)
[![Build Status]](https://github.com/typescript-tools/typescript-tools/actions/workflows/ci.yml)
[![semantic-release]](https://github.com/semantic-release/semantic-release)

[license]: https://img.shields.io/badge/License-ISC-blue.svg
[npm package]: https://img.shields.io/npm/v/@typescript-tools/packages-to-rebuild-on-changes.svg
[build status]: https://github.com/typescript-tools/typescript-tools/actions/workflows/ci.yml/badge.svg
[semantic-release]: https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg

> Calculate packages required to rebuild when a given package changes

## The Problem

A user has made changes to one or more internal packages, and we want to validate the
minimum-but-sufficient subset of internal packages that may be affected by this change.

This set of packages is calculated as:

1. the changed packages
2. the set of packages consuming (1)
3. the set of dependencies of (1) and (2)

## Install

```shell
npm install --save-dev @typescript-tools/packages-to-rebuild-on-changes
```

## API

```typescript
export function packagesToRebuildOnChanges(
  root?: string,
): TE.TaskEither<PackagesToRebuildOnChangesError, Map<PackageName, PackageManifest[]>>
```

## Related

- [packages-to-rebuild-on-changes-cli](https://github.com/typescript-tools/typescript-tools/tree/master/packages/packages-to-rebuild-on-changes-cli)
