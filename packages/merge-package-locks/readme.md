# merge-package-locks
[![License][]](https://opensource.org/licenses/ISC)
[![NPM Package][]](https://npmjs.org/package/@typescript-tools/merge-package-locks)
[![Build status][]](https://travis-ci.org/typescript-tools/merge-package-locks)
[![Code Coverage][]](https://codecov.io/gh/typescript-tools/merge-package-locks)

[License]: https://img.shields.io/badge/License-ISC-blue.svg
[NPM Package]: https://img.shields.io/npm/v/@typescript-tools/merge-package-locks.svg
[Build status]: https://travis-ci.org/typescript-tools/merge-package-locks.svg?branch=master
[Code Coverage]: https://codecov.io/gh/typescript-tools/merge-package-locks/branch/master/graph/badge.svg

> Merge two package locks

## Install

``` shell
npm install --save-dev @typescript-tools/merge-package-locks
```

## Use

``` typescript
Usage:
    merge-package-locks <target> <source>...

Options:
    <target>    Target package-lock.json in which to accumulate information
    <source>    List of package-lock.json files to merge into <target>
```

> Note: only supports lockfileVersion v1 for now (npm version 6)
