# dependency-graph

[![License][]](https://opensource.org/licenses/ISC)
[![NPM Package][]](https://npmjs.org/package/@typescript-tools/dependency-graph)
[![Build Status]](https://github.com/typescript-tools/typescript-tools/actions/workflows/ci.yml)
[![semantic-release]](https://github.com/semantic-release/semantic-release)

[license]: https://img.shields.io/badge/License-ISC-blue.svg
[npm package]: https://img.shields.io/npm/v/@typescript-tools/dependency-graph.svg
[build status]: https://github.com/typescript-tools/typescript-tools/actions/workflows/ci.yml/badge.svg
[semantic-release]: https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg

> Generate dependency graph of internal packages

## Install

```shell
npm install @typescript-tools/dependency-graph
```

## API

```typescript
export function dependencyGraph(
  {
    root,
    recursive,
  }: {
    root?: string
    recursive: boolean
  } = {
    recursive: true,
  },
): TE.TaskEither<DependencyGraphError, Map<PackageName, PackageManifest[]>>
```

## Related

- [@typescript-tools/depender-graph](https://github.com/typescript-tools/typescript-tools/tree/master/packages/depender-graph)
