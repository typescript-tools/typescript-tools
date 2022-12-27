# TypeScript Tools

[![Build Status]](https://github.com/typescript-tools/typescript-tools/actions/workflows/release.yml)

[build status]: https://github.com/typescript-tools/typescript-tools/actions/workflows/release.yml/badge.svg?event=push

## State of This Monorepo

This repository is **not** actively maintained.

These days I am using this style of monorepo less than I was before, so there
is not enough return on investment to justify further maintenance of this
repository.

For an alternative solution, see the [Rust implementation of the typescript-
tools][rust-implementation].

[rust-implementation]: https://github.com/typescript-tools/rust-implementation

## The Problem

Whereas [Lerna] was created for managing JavaScript monorepos, TypeScript monorepos have
additional requirements introduced by the compilation step.

Furthermore, Lerna is a tool that does a great many actions. The `typescript-tools` each
aim to uphold the [Unix philosophy]: to do a single task well, and compose with other
tools.

[lerna]: https://github.com/lerna/lerna
[unix philosophy]: https://en.wikipedia.org/wiki/Unix_philosophy

## Goals

The goals of the `typescript-tools` are to give back the maximum amount of human time
possibly; chiefly through stability and aggressive automation.

## Acknowledgments

- [fp-ts](https://github.com/gcanti/fp-ts)
- [io-ts](https://github.com/gcanti/io-ts)
- [lerna]
