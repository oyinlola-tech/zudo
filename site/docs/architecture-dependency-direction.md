---
title: "Dependency Direction"
description: "Strict dependency rules that prevent circular imports and maintain clean architecture in the Zudo TypeScript framework. Package dependency graph, allowed and forbidden patterns."
source: https://zudojs.oyinlola.site/docs/architecture-dependency-direction
---

v1.0.0

# Dependency Direction

All 39 packages, the exact dependencies each one declares, and a script that proves there are no cycles.

39 PACKAGES SIX TIERS VERIFIABLE

## Overview

Zudo is 39 packages. Each one lists the others it needs in its `package.json`. Those lists, taken together, form a graph — and the shape of that graph is the architecture.

The rule is simple: the graph has no cycles. No package depends on itself, directly or through any chain of other packages.

That is not a style preference. Without it you cannot build the packages one at a time, cannot test one in isolation, and cannot reason about what installing one will drag in.

> IN PLAIN WORDS
>
>
>
> A **cycle** is a loop: A needs B, B needs C, C needs A. Nobody can go first. Zudo has zero of these, and the last section on this page is a script you can run to confirm it.

Everything below is read straight from the packages' own manifests. If a number here disagrees with the repository, the repository is right and this page is stale.

## The Six Tiers

A package's **tier** is the length of its longest chain of `@zudojs` dependencies. Tier 0 means "depends on no Zudo package". Tier 3 means the longest path down to a tier 0 package is three hops.

Tiers are computed, not assigned. Add a dependency and a package moves up on its own.

| Tier | Packages | Count |
| --- | --- | --- |
| **0** | `errors`, `types`, `auth-oauth` | 3 |
| **1** | `config`, `constants`, `container`, `database`, `docs`, `feature-flags`, `logger`, `middleware`, `observability`, `openapi`, `transactions`, `validation` | 12 |
| **2** | `core`, `crypto`, `events`, `lifecycle`, `messaging`, `plugins`, `scheduler`, `schema`, `security`, `serialization` | 10 |
| **3** | `adapters`, `api`, `cache`, `cli`, `cqrs`, `http`, `queue`, `rpc`, `runtime`, `storage` | 10 |
| **4** | `permissions`, `tenancy`, `testing` | 3 |
| **5** | `auth` | 1 |

Three results in that table are worth explaining, because they are not what most people guess.

- **`core` is tier 2, not the top.** It depends only on `errors` and `constants`. The packages that depend on *it* — `http`, `runtime`, `cli` — sit above it.
- **`auth-oauth` is tier 0.** It uses Node built-ins only and declares no `@zudojs` dependency at all, so it installs on its own with nothing else attached.
- **`auth` is alone at tier 5.** It depends on `permissions`, which lists `http` as a peer, which depends on `core`. That is the longest chain in the framework.

## The Full Graph

Every `@zudojs` dependency of every package, in alphabetical order. A dash means the package declares none. Entries marked `peer` are peer dependencies, explained in the next section.

```ts
adapters        errors, constants, types, lifecycle
api             errors, constants, types, schema
auth            errors, constants, permissions
auth-oauth      — none
cache           errors, types, serialization
cli             config, core, errors, logger
config          errors
constants       errors
container       errors
core            errors, constants
cqrs            errors, events
crypto          constants, errors
database        errors
docs            errors
errors          — none
events          errors, constants
feature-flags   errors
http            core, errors, logger, security
lifecycle       errors, constants
logger          errors
messaging       errors, constants
middleware      errors
observability   errors
openapi         errors
permissions     errors   [peer: http]
plugins         errors, constants, types
queue           errors, constants, serialization
rpc             errors, constants, types, schema
runtime         errors, constants, container, config, logger, events, core
scheduler       errors, constants, types
schema          errors, constants, types
security        errors, constants
serialization   constants, errors, types, validation
storage         errors, constants, types, serialization
tenancy         errors, constants   [peer: http]
testing         config, constants, container, errors, events, http, logger,
                messaging, middleware, queue, security, serialization,
                storage, types, validation
transactions    errors
types           — none
validation      errors
```

Two observations fall out of that list. `errors` appears in 36 of the 39 packages, which makes it the single most load-bearing package in the framework. And `testing` pulls in fifteen packages, more than anything else, because its job is to fake all of them.

> TIP
>
>
>
> Reading this list is the fastest way to size an install. Adding `@zudojs/cache` brings `errors`, `types`, `serialization` and `validation` with it. Adding `@zudojs/openapi` brings only `errors`.

## Peer Dependencies

A **peer dependency** is a package you must install yourself; it is not pulled in automatically. It says "I work with this, and if you use both, we must agree on the version."

Three packages use them:

| Package | Peer | Why |
| --- | --- | --- |
| `permissions` | `@zudojs/http` | Ships HTTP middleware for permission checks; the core logic works without a server |
| `tenancy` | `@zudojs/http` | Resolves a tenant from a request; the tenant model itself is transport-agnostic |
| `database` | `@prisma/client` | You bring your own generated Prisma client |

Peers still count for tier placement on this page. `permissions` can reach `http`, so it must sit above it — otherwise the two could end up depending on each other and the graph would grow a cycle.

> WATCH OUT
>
>
>
> Installing `@zudojs/permissions` alone will not give you `@zudojs/http`. If you use the HTTP middleware, install both. npm and pnpm will warn about an unmet peer dependency, and that warning is worth reading rather than scrolling past.

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

✓http → core

✓http → security

✓runtime → container

✓serialization → validation

✓adapters → lifecycle

✓anything → errors

### FORBIDDEN

✗core → http

✗errors → anything

✗types → anything

✗logger → container

✗http → permissions

✗any package → itself

> DANGER
>
>
>
> `core → http` looks harmless and is the mistake people actually make. It would make `@zudojs/core` — which every application imports — drag an HTTP stack into command-line tools, workers and tests that will never serve a request.

## Verify It Yourself

Nothing on this page has to be taken on trust. Save the script below as `tiers.mjs` in the repository root and run `node tiers.mjs`. It reads the manifests, reports any cycle, and prints the tier table.

What you should see:

```ts
39 packages, no cycles
tier 0: auth-oauth, errors, types
tier 1: config, constants, container, database, docs, feature-flags, logger, middleware, observability, openapi, transactions, validation
tier 2: core, crypto, events, lifecycle, messaging, plugins, scheduler, schema, security, serialization
tier 3: adapters, api, cache, cli, cqrs, http, queue, rpc, runtime, storage
tier 4: permissions, tenancy, testing
tier 5: auth
```

If a future change introduces a loop, `tierOf` throws with the package name it looped through. That message is the first place to look.

## Related

- [All packages](https://zudojs.oyinlola.site/docs/packages.md) — one reference page per package, with its real exports.
- [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) — the tier 0 package that 36 of the other 38 depend on.
- [@zudojs/core](https://zudojs.oyinlola.site/docs/packages-core.md) — tier 2, and the package most applications start from.
- [Architecture Overview](https://zudojs.oyinlola.site/docs/architecture.md) — the same tiers with the reasoning behind them.
- [Module System](https://zudojs.oyinlola.site/docs/architecture-module-system.md) — the same "point downward" rule applied inside your own application.
