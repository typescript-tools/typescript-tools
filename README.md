# TypeScript Tools

[![License][]](https://opensource.org/licenses/ISC)
[![Build Status]](https://github.com/typescript-tools/typescript-tools/actions/workflows/ci.yml)
[![semantic-release]](https://github.com/semantic-release/semantic-release)

[license]: https://img.shields.io/badge/License-ISC-blue.svg
[build status]: https://github.com/typescript-tools/typescript-tools/actions/workflows/ci.yml/badge.svg
[semantic-release]: https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg

The `typescript-tools` are an opinionated collection of utilities for working with TypeScript
monorepos.

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

## State of This Monorepo

This repository is actively maintained. It has less code coverage than Lerna (read:
none) but is implemented in TypeScript, which helps avoid some bugs.

## Acknowledgments

- [fp-ts](https://github.com/gcanti/fp-ts)
- [io-ts](https://github.com/gcanti/io-ts)
- [lerna]
