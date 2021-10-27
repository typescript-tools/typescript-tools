# packages-to-rebuild-on-changes-cli

[![License][]](https://opensource.org/licenses/ISC)
[![NPM Package][]](https://npmjs.org/package/@typescript-tools/packages-to-rebuild-on-changes-cli)

[license]: https://img.shields.io/badge/License-ISC-blue.svg
[npm package]: https://img.shields.io/npm/v/@typescript-tools/packages-to-rebuild-on-changes-cli.svg

> Enumerate packages reachable from graph traversal given starting packages

## Install

```shell
npm install --save-dev @typescript-tools/packages-to-rebuild-on-changes-cli
```

## Use

```
Usage:
    packages-to-rebuild-on-changes [--root <root>] [--path] [<package>]...

Options:
    packages         Package names or paths to rebuild when listed packages change (also reads from stdin)
    --root=<root>    Root of lerna mono-repository
    --path           Print the relative path to each package from root
```

This packages offers a CLI to invoke [packages-to-rebuild-on-changes],
and calculates which packages in a monorepo need to be built and
tested given a changed set of packages.

The changed set of packages can be specified as arguments or from
`stdin`, as paths or by (scoped) package name.

The set of packages to rebuild is calculated as follows:

```
given set_of_changed_packages,
let downstream = internal_dependers(set_of_changed_packages)
let dependencies = internal_dependencies(downstream)
let packags_to_rebuild = set_of_changed_packages ∪ downstream ∪ dependencies
```

where `∪` is the [union] of two sets.

The set of downstream packages (internal dependers) is included to
ensure no changed packages has violated a contract that another
package is reliant upon.

The set of dependencies is required in order to build.

Note that the `dependencies` set need only be rebuilt and not re-tested.

[packages-to-rebuild-on-changes]: https://github.com/typescript-tools/typescript-tools/tree/master/packages/packages-to-rebuild-on-changes
[union]: https://en.wikipedia.org/wiki/Union_(set_theory)

## Example

Consider a monorepo with the following packages

```
A ---B --- C
 \
  -- D
```

Invoking `packages-to-rebuild-on-changes` with the following inputs
would yield this output

| input | output          |
| ----- | --------------- |
| `A`   | `A` `B` `C` `D` |
| `B`   | `A` `B` `C`     |
| `D`   | `A` `D`         |

## Related

- [@typescript-tools/packages-to-rebuild-on-changes](https://github.com/typescript-tools/typescript-tools/tree/master/packages/packages-to-rebuild-on-changes)
