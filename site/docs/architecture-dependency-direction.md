---
title: "Dependency Direction"
description: "Dependency rules that keep ZudoJS packages free of circular imports: the package graph, allowed and forbidden import patterns, and how they are enforced."
source: https://zudojs.oyinlola.site/docs/architecture-dependency-direction
---

v1.0.0

# Dependency Direction

All 40 packages, the exact dependencies each one declares, and a script that proves there are no cycles.

40 PACKAGES SIX TIERS VERIFIABLE

## Overview

Zudo is 40 packages: 38 under the `@zudojs` scope, plus the `zudojs-cli` command-line tool (in `packages/cli`) and the `zudojs` launcher that installs it (in `packages/zudojs`). Each one lists the others it needs in its `package.json`. Those lists, taken together, form a graph — and the shape of that graph is the architecture.

The rule is simple: the graph has no cycles. No package depends on itself, directly or through any chain of other packages.

That is not a style preference. Without it you cannot build the packages one at a time, cannot test one in isolation, and cannot reason about what installing one will drag in.

> IN PLAIN WORDS
>
>
>
> A **cycle** is a loop: A needs B, B needs C, C needs A. Nobody can go first. Zudo has zero of these, and the last section on this page is a script you can run to confirm it.

Everything below is read straight from the packages' own manifests. If a number here disagrees with the repository, the repository is right and this page is stale.

## The Six Tiers

A package's **tier** is the length of its longest chain of dependencies on other Zudo packages. Tier 0 means "depends on no Zudo package". Tier 3 means the longest path down to a tier 0 package is three hops.

Tiers are computed, not assigned. Add a dependency and a package moves up on its own.

| Tier | Packages | Count |
| --- | --- | --- |
| **0** | `errors`, `types` | 2 |
| **1** | `adapters`, `constants`, `container`, `docs`, `feature-flags`, `logger`, `middleware`, `plugins`, `transactions` | 9 |
| **2** | `config`, `core`, `crypto`, `database`, `events`, `lifecycle`, `messaging`, `observability`, `openapi`, `permissions`, `scheduler`, `schema`, `security`, `tenancy`, `validation` | 15 |
| **3** | `auth`, `auth-oauth`, `cli`, `cqrs`, `http`, `runtime`, `serialization` | 7 |
| **4** | `cache`, `queue`, `rpc`, `storage`, `zudojs` | 5 |
| **5** | `api`, `testing` | 2 |

Five results in that table are worth explaining, because they are not what most people guess.

- **`core` is tier 2, not the top.** It depends only on `errors` and `constants`, and `constants` depends on `errors`: two hops. Only `runtime` and `cli` depend on *it*. `http` sits above it but does not depend on it at all.
- **`auth-oauth` is tier 3, with only two dependencies.** They are `errors` and `security`, and `security` is itself tier 2 (`security` → `constants` → `errors`). A short dependency list does not mean a low tier. What counts is how deep the chain underneath goes.
- **`auth` is tier 3, not the top.** It depends on `permissions`, but `permissions` depends only on `errors` and `middleware`, so it is tier 2. The longest chains from `auth` are three hops: `auth` → `permissions` → `middleware` → `errors`, and `auth` → `crypto` → `constants` → `errors`.
- **`api` and `testing` share tier 5.** The longest chain in the framework runs through `serialization`: `api` → `queue` → `serialization` → `validation` → `constants` → `errors`. That is five hops. `testing` reaches the same depth through `queue` or `storage`.
- **`zudojs` is tier 4.** The launcher declares a single dependency, `zudojs-cli`, and the chain under it is four hops: `zudojs` → `cli` → `config` → `constants` → `errors`. Neither name starts with `@zudojs/`, which is why the script below matches dependencies against the manifests' own names instead of a scope prefix.

These numbers are not the tiers shown on [All Packages](https://zudojs.oyinlola.site/docs/packages.md#layer-legend). Those come from `scripts/package-tiers.js`: five tiers (0 to 4), set by hand, that act as a ceiling. The architecture tests enforce it: a package may depend only on packages at the same or a lower tier in that map. The table above is something else, the computed depth of the dependency graph, where every hop counts. Because the ceiling allows dependencies within a tier, the two disagree. `api` is tier 2 in `package-tiers.js` and tier 5 here, because `queue`, `serialization`, `validation` and `constants` all share tier 1 in that map. Both numbers are correct. They measure different things.

## The Full Graph

Every dependency on another Zudo package, for every package, in alphabetical order. A dash means the package declares none. All of them are ordinary `dependencies`; no package lists another Zudo package as a peer. The `cli` directory is published as `zudojs-cli`.

```ts
adapters        errors
api             errors, openapi, queue, rpc, schema, security, serialization,
                types
auth            constants, crypto, errors, permissions, types
auth-oauth      errors, security
cache           constants, errors, serialization, types
cli             config, core, errors, logger
config          constants, errors
constants       errors
container       errors
core            errors, constants
cqrs            errors, events, middleware
crypto          constants, errors
database        errors, logger, types
docs            errors
errors          — none
events          constants, errors, middleware
feature-flags   errors, types
http            crypto, errors, logger, middleware, openapi, security
lifecycle       errors, constants
logger          errors
messaging       constants, errors, middleware
middleware      errors
observability   errors, logger
openapi         constants, errors
permissions     errors, middleware
plugins         errors
queue           errors, constants, serialization
rpc             constants, errors, schema, security, serialization, types
runtime         constants, container, core, errors, events, logger
scheduler       errors, constants, types
schema          errors, constants, types
security        errors, constants
serialization   constants, errors, types, validation
storage         errors, constants, types, serialization
tenancy         errors, constants, middleware
testing         config, constants, container, errors, events, http, logger,
                messaging, middleware, queue, security, serialization, storage,
                types
transactions    errors
types           — none
validation      constants, errors, types
zudojs          cli   [published as zudojs-cli]
```

Two observations fall out of that list. `errors` appears in 37 of the 40 packages (all but `errors` itself, `types` and the `zudojs` launcher), which makes it the single most load-bearing package in the framework. And `testing` pulls in fourteen packages, more than anything else, because its job is to fake all of them.

> TIP
>
>
>
> Reading this list is the fastest way to size an install. Adding `@zudojs/cache` brings `errors`, `constants`, `types`, `serialization` and `validation` with it. Adding `@zudojs/middleware` brings only `errors`.

## Peer Dependencies

A **peer dependency** is a package you must install yourself; it is not pulled in automatically. It says "I work with this, and if you use both, we must agree on the version."

One package uses one:

| Package | Peer | Why |
| --- | --- | --- |
| `database` | `@prisma/client` | You bring your own generated Prisma client |

`@prisma/client` is not a Zudo package, so it plays no part in tier placement. A peer on another Zudo package would: the script below reads `peerDependencies` alongside `dependencies`, because a peer can be reached just like a dependency, and counting it is what keeps the graph from quietly growing a cycle.

`permissions` and `tenancy` ship HTTP middleware without any dependency on `@zudojs/http`, peer or otherwise. They describe the request and middleware shapes they need with their own types, and those shapes fit the route `middleware` list of `@zudojs/http`. That keeps them at tier 2, below `http`.

> WATCH OUT
>
>
>
> Installing `@zudojs/database` alone will not give you `@prisma/client`. Install it yourself, in a version from 7.0.0 up to (not including) 8. npm and pnpm will warn about an unmet peer dependency, and that warning is worth reading rather than scrolling past.

## The Rules

### 1. No cycles, ever

A package may never depend on itself through any chain. This is the only rule that is absolute; everything else follows from it.

### 2. Depend downward, not sideways

Prefer a package in a lower tier. Two packages in the same tier never depend on each other today, and adding such an edge would push one of them up a tier.

### 3. Import from the package root

Use `import { X } from "@zudojs/core"`. Deep paths into a package's internals are not part of the public surface and can change without notice.

### 4. When two packages need each other, extract a third

This is why `@zudojs/errors` and `@zudojs/types` exist at tier 0. They hold what everyone needs so that nobody has to reach sideways for it.

The same rules stated as allowed and forbidden edges:

### ALLOWED

✓http → openapi

✓http → security

✓runtime → container

✓serialization → validation

✓runtime → core

✓anything → errors

### FORBIDDEN

✗core → http

✗errors → anything

✗types → anything

✗logger → http

✗permissions → auth

✗any package → itself

> DANGER
>
>
>
> `core → http` looks harmless and is the mistake people actually make. It would make `@zudojs/core` — which every application imports — drag an HTTP stack into command-line tools, workers and tests that will never serve a request.

## Verify It Yourself

Nothing on this page has to be taken on trust. Save the script below as `tiers.mjs` in the repository root and run `node tiers.mjs`. It reads the manifests, reports any cycle, and prints the tier table.

It covers every folder in `packages/` and recognises a dependency by the `name` field of the manifests, not by the `@zudojs/` prefix. That matters twice: `packages/cli` is published as `zudojs-cli`, and `packages/zudojs` is published as `zudojs` and depends on it. A prefix test would miss that edge and put the launcher at tier 0.

What you should see:

```ts
40 packages, no cycles
tier 0: errors, types
tier 1: adapters, constants, container, docs, feature-flags, logger, middleware, plugins, transactions
tier 2: config, core, crypto, database, events, lifecycle, messaging, observability, openapi, permissions, scheduler, schema, security, tenancy, validation
tier 3: auth, auth-oauth, cli, cqrs, http, runtime, serialization
tier 4: cache, queue, rpc, storage, zudojs
tier 5: api, testing
```

If a future change introduces a loop, `tierOf` throws with the package name it looped through. That message is the first place to look.

## Related

- [All packages](https://zudojs.oyinlola.site/docs/packages.md) — one reference page per package, with its real exports.
- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — the tier 0 package that 37 of the other 39 depend on.
- [@zudojs/core](https://zudojs.oyinlola.site/docs/packages-core.md) — tier 2, and the package most applications start from.
- [Architecture Overview](https://zudojs.oyinlola.site/docs/architecture.md) — the same tiers with the reasoning behind them.
- [Module System](https://zudojs.oyinlola.site/docs/architecture-module-system.md) — the same "point downward" rule applied inside your own application.
