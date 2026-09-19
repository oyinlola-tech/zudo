---
title: "Contributing"
description: "Help build the Zudo framework. Guidelines for contributions, development setup, code style, testing, and PR review process."
source: https://zudojs.oyinlola.site/docs/contributing
---

v1.0.0

# Contributing

How to contribute to the Zudo framework — setup, workflow, code style, and PR process.

CONTRIBUTING OPEN SOURCE PR

## How to Contribute

We welcome contributions of all kinds — bug fixes, new features, documentation improvements, and more.

01

Fork

Fork the repository

02

Branch

Create a feature branch

03

Code

Make your changes

04

PR

Submit a pull request

## Development Setup

```ts
# Clone your fork
git clone https://github.com/YOUR_USERNAME/zudo.git
cd zudo

# Install dependencies
npm install

# Build all packages
npm run build

# Run all tests
npm test

# Run tests for a specific package
npm run --workspace=@zudojs/errors test
```

## Code Style & Conventions

Required

- Named exports only (no default exports)
- readonly on all interface properties
- import type for type-only imports
- .js extensions on all relative imports
- JSDoc on all public API surfaces

Forbidden

- No any — use unknown or specific types
- No var — use const or let
- No default exports
- No business logic in barrel index.ts files
- No inline comments unless absolutely necessary

## Testing Requirements

All new code must include unit tests. Tests run with Vitest.

```ts
# Run all tests
npm test

# Run tests for a specific package
npm run --workspace=@zudojs/errors test

# Run tests with coverage
npm run test:coverage
```

> **Before Submitting**
>
> Always run npm run typecheck and npm test before submitting your PR. CI will reject PRs that fail these checks.

## PR Review Process

| Severity | Category | Action |
| --- | --- | --- |
| Critical | Error hierarchy, DI container, lifecycle state machine changes | Must be reviewed by maintainer |
| Should Fix | Files > 150 lines, folders > 5 files, wrong naming convention | Fix before merge |
| Nice to Have | Missing JSDoc, missing tests, missing barrel exports | Address in follow-up |

## Issue Templates

Use the appropriate issue template when reporting bugs or requesting features.

Bug Report

Include reproduction steps, expected vs actual behavior, and environment details.

Feature Request

Describe the problem, your proposed solution, and alternatives considered.

Documentation

Report missing or incorrect documentation with the affected page URL.
