# depender-graph

[![License][]](https://opensource.org/licenses/ISC)
[![NPM Package][]](https://npmjs.org/package/@typescript-tools/depender-graph)
[![Build Status]](https://github.com/typescript-tools/typescript-tools/actions/workflows/ci.yml)
[![semantic-release]](https://github.com/semantic-release/semantic-release)

[license]: https://img.shields.io/badge/License-ISC-blue.svg
[npm package]: https://img.shields.io/npm/v/@typescript-tools/depender-graph.svg
[build status]: https://github.com/typescript-tools/typescript-tools/actions/workflows/ci.yml/badge.svg
[semantic-release]: https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg

> Generate depender graph of internal packages

## Install

```shell
npm install @typescript-tools/depender-graph
```

## API

```typescript
export function dependerGraph(
  {
    root,
    recursive,
  }: {
    root?: string
    recursive?: boolean
  } = {
    root: undefined,
    recursive: true,
  },
): TE.TaskEither<DependerGraphError, Map<PackageName, PackageManifest[]>>
```

## Related

- [@typescript-tools/dependency-graph](https://github.com/typescript-tools/typescript-tools/tree/master/packages/dependency-graph)
