# Zudojs Package Dependencies

> This document defines the dependency rules for the Zudojs framework.
> It is the single source of truth for allowed cross-package imports.
> All contributors must follow these rules.

---

## 1. Dependency Principles

### 1.1 Dependencies Flow Inward

Foundation packages have no `@zudojs/*` dependencies.
Higher-level packages may depend on lower-level packages.
No package may depend on a package in a higher tier.

```
Foundation → Runtime Primitives → Application Architecture → Infrastructure Abstractions → Transport → Developer Experience
```

### 1.2 Why This Matters

- Prevents circular dependencies.
- Ensures changes to higher-level packages never break foundation code.
- Makes the system easier to reason about.
- Enables independent testing and versioning of packages.

### 1.3 The Golden Rule

> If package A depends on package B, then B must be in the same tier or a lower tier than A.

---

## 2. Package Tiers

### Tier 0 — Leaf (no @zudojs dependencies)

These packages depend on nothing except Node.js built-ins and external libraries.

| Package          | Purpose                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `@zudojs/errors` | Shared error base class, error codes, error categories, error utilities |
| `@zudojs/types`  | Type guards, utility types, converters, branded types                   |

**Rules:**

- Must not import from any other `@zudojs/*` package.
- External dependencies only.
- These are the foundation of the entire framework.

---

### Tier 1 — Foundation

Depends only on Tier 0.

| Package                 | Depends On                              | Purpose                                               |
| ----------------------- | --------------------------------------- | ----------------------------------------------------- |
| `@zudojs/constants`     | errors                                  | Branded IDs, enums, serialization constants           |
| `@zudojs/container`     | errors                                  | DI container with token-based registration            |
| `@zudojs/logger`        | errors                                  | Structured logging with transports                    |
| `@zudojs/crypto`        | errors                                  | Hashing, encryption, tokens                           |
| `@zudojs/validation`    | errors                                  | Schema validation with Zod                            |
| `@zudojs/schema`        | errors, constants, types                | Schema definition, parsing, type inference            |
| `@zudojs/config`        | errors                                  | Layered configuration with sources                    |
| `@zudojs/middleware`    | errors                                  | Composable middleware pipeline                        |
| `@zudojs/serialization` | errors, constants, types, validation    | JSON serializer, type transformers, envelopes         |
| `@zudojs/events`        | errors, constants                       | Event bus, emitter, middleware, registry              |
| `@zudojs/messaging`     | errors, constants                       | In-process message bus                                |
| `@zudojs/lifecycle`     | errors, constants                       | State machine, dependency ordering, graceful shutdown |
| `@zudojs/transactions`  | errors                                  | Transaction lifecycle, AsyncLocalStorage context      |
| `@zudojs/permissions`   | errors, constants                       | RBAC, ABAC, resource authorization                    |
| `@zudojs/feature-flags` | errors                                  | Feature flag evaluation, rule engine                  |
| `@zudojs/plugins`       | errors, constants, types                | Plugin registration, lifecycle, orchestration         |
| `@zudojs/security`      | errors, constants                       | Input validation, CORS, CSRF, rate limiting           |
| `@zudojs/tenancy`       | errors, constants                       | Multi-tenant context and isolation                    |
| `@zudojs/docs`          | errors                                  | Documentation infrastructure                          |
| `@zudojs/cache`         | errors, types, serialization            | Cache abstraction with memory adapter                 |
| `@zudojs/storage`       | errors, constants, types, serialization | Database, object storage, repository abstractions     |
| `@zudojs/adapters`      | errors, constants, types, lifecycle     | Adapter contracts, registry, transport abstractions   |
| `@zudojs/queue`         | errors, constants, serialization        | Background job and async task infrastructure          |
| `@zudojs/scheduler`     | errors, constants, types                | Job scheduling, cron, triggers                        |
| `@zudojs/database`      | errors                                  | Database clients, repositories, transactions          |
| `@zudojs/observability` | errors                                  | Structured logging, metrics, tracing, exporters       |

**Rules:**

- May import from Tier 0 only.
- Must not import from any Tier 2+ package.
- Peer dependencies on higher-tier packages are allowed only when explicitly documented and optional.

---

### Tier 2 — Application Architecture

Depends on Tier 0 + Tier 1.

| Package           | Depends On                                                 | Purpose                              |
| ----------------- | ---------------------------------------------------------- | ------------------------------------ |
| `@zudojs/core`    | errors, constants, messaging                               | Lifecycle, context, runtime, modules |
| `@zudojs/cqrs`    | errors, events, messaging                                  | Commands, queries, handlers          |
| `@zudojs/auth`    | errors, constants, permissions                             | JWT, sessions, password hashing      |
| `@zudojs/runtime` | errors, constants, container, config, logger, events, core | Application lifecycle orchestrator   |
| `@zudojs/openapi` | errors, constants, schema                                  | OpenAPI document generation          |
| `@zudojs/rpc`     | errors, constants, types, schema                           | RPC primitives                       |
| `@zudojs/api`     | errors, constants, types, schema                           | API abstraction layer                |

**Rules:**

- May import from Tier 0 and Tier 1 only.
- Must not import from Tier 3+ packages.
- Must not import from transport packages (`http`, `rpc`, `api`, `openapi`) unless explicitly documented.
- Must not import from `@zudojs/testing` or `@zudojs/cli`.

---

### Tier 3 — Transport

Depends on Tier 0 + Tier 1 + Tier 2.

| Package        | Depends On                     | Purpose                                    |
| -------------- | ------------------------------ | ------------------------------------------ |
| `@zudojs/http` | core, errors, logger, security | HTTP request handling, routing, middleware |
| `@zudojs/cli`  | config, core, errors, logger   | Command-line interface                     |

**Rules:**

- May import from Tier 0, Tier 1, and Tier 2 only.
- Must not import from other transport packages (`http` must not import from `rpc`, `api`, `openapi`; `rpc` must not import from `http`, `api`, `openapi`).
- Transport packages translate external requests into internal application calls.
- Transport packages must not contain business logic.

---

### Tier 4 — Developer Experience

Depends on any tier.

| Package           | Depends On | Purpose                       |
| ----------------- | ---------- | ----------------------------- |
| `@zudojs/testing` | many       | Test helpers, fixtures, mocks |
| `@zudojs/docs`    | errors     | Documentation generation      |

**Rules:**

- May import from any package.
- Must not be imported by production runtime packages (testing only).
- `@zudojs/testing` must not be listed as a dependency in any production package.

---

## 3. Complete Dependency Graph

```
Tier 0: errors, types
    │
    ▼
Tier 1: constants, container, logger, crypto, validation, schema,
        config, middleware, serialization, events, messaging,
        lifecycle, transactions, permissions, feature-flags,
        plugins, security, tenancy, docs, cache, storage,
        adapters, queue, scheduler, database, observability
    │
    ▼
Tier 2: core, cqrs, auth, runtime, openapi, rpc, api
    │
    ▼
Tier 3: http, cli
    │
    ▼
Tier 4: testing, docs
```

---

## 4. Forbidden Dependency Patterns

These patterns must **never** occur:

| Pattern                 | Reason                                           |
| ----------------------- | ------------------------------------------------ |
| `errors → @zudojs/*`    | Leaf package must stay leaf                      |
| `constants → @zudojs/*` | Leaf package must stay leaf                      |
| `types → @zudojs/*`     | Leaf package must stay leaf                      |
| `core → http`           | Core must not know about transport               |
| `core → rpc`            | Core must not know about transport               |
| `cqrs → http`           | CQRS must not know about transport               |
| `events → http`         | Events must not know about transport             |
| `http → rpc`            | Transport packages must not depend on each other |
| `http → api`            | Transport packages must not depend on each other |
| `rpc → http`            | Transport packages must not depend on each other |
| `runtime → http`        | Runtime must not know about specific transports  |
| `database → http`       | Infrastructure must not know about transport     |
| `queue → http`          | Infrastructure must not know about transport     |
| `testing → production`  | Testing must not be imported by production code  |

---

## 5. Peer Dependencies

Peer dependencies are allowed only when all three conditions are met:

1. The dependency is in a higher or equal tier.
2. The dependency is truly optional (the package functions without it).
3. The peer dependency is explicitly documented with its purpose.

Current peer dependencies:

| Package               | Peer           | Tier | Purpose                         |
| --------------------- | -------------- | ---- | ------------------------------- |
| `@zudojs/permissions` | `@zudojs/http` | 3    | HTTP-specific permission guards |
| `@zudojs/tenancy`     | `@zudojs/http` | 3    | HTTP-specific tenant resolution |

**Rules:**

- Peer dependencies must be declared in `peerDependencies` with `"optional": true` in `peerDependenciesMeta`.
- Peer dependencies must not create circular dependency chains.
- Peer dependencies must not be required for the package's core functionality.

---

## 6. Dependency Versioning

### 6.1 External Dependencies

External dependencies (non-`@zudojs/*`) should use caret ranges (`^`) for SemVer-compatible libraries.

### 6.2 Internal Dependencies

Internal `@zudojs/*` dependencies must use exact versions (`0.1.0`), not wildcards (`*`) or ranges.

This ensures:

- Consistent builds across the monorepo.
- No accidental version drift.
- Predictable dependency resolution.

### 6.3 Future Versioning

When Zudojs reaches `1.0.0`:

- Internal dependencies should use caret ranges (`^1.0.0`).
- Breaking changes require coordinated version bumps across affected packages.

---

## 7. Circular Dependency Rules

### 7.1 Definition

A circular dependency occurs when package A depends on package B, and package B (directly or transitively) depends on package A.

### 7.2 Detection

Circular dependencies are detected by:

- `architect-check.js` — manual script.
- `tests/architect/boundaries.test.ts` — automated test.
- CI pipeline — must pass before merging.

### 7.3 Resolution

When a circular dependency is detected:

1. Identify the cycle.
2. Determine which dependency is "incorrect" (usually the one violating tier rules).
3. Extract the shared code into a lower-tier package.
4. Update imports in both packages.

Example:

```
Before (circular):
  @zudojs/http → @zudojs/permissions → @zudojs/http

After (resolved):
  @zudojs/permissions-core (Tier 1) — shared authorization logic
  @zudojs/permissions (Tier 1) — imports permissions-core
  @zudojs/http (Tier 3) — imports permissions
```

### 7.4 Prevention

- Run `npm run architect:check` before committing.
- Review dependency changes in PRs.
- Use the tier system to guide package design.

---

## 8. Dependency Direction

### 8.1 General Rule

Dependencies must flow from higher-level packages to lower-level packages.

```
Good:
  http → core → events → errors

Bad:
  errors → events → core → http
```

### 8.2 Exception: Peer Dependencies

Peer dependencies flow upward but are optional.

```
  @zudojs/permissions (Tier 1)
      ↑ (peer, optional)
  @zudojs/http (Tier 3)
```

This is allowed because:

- The dependency is optional.
- `permissions` functions without `http`.
- The peer dependency is explicitly documented.

### 8.3 Exception: Developer Experience

`@zudojs/testing` may import from any package.

```
  @zudojs/testing (Tier 4)
      → @zudojs/http
      → @zudojs/database
      → @zudojs/events
      → ...
```

This is allowed because:

- Testing code is never imported by production packages.
- It enables comprehensive test coverage.

---

## 9. Enforcement

### 9.1 Automated Checks

The following automated checks enforce these rules:

1. **Wildcard version check** — ensures all `@zudojs/*` dependencies use exact versions.
2. **Tier violation check** — ensures no package depends on a higher-tier package.
3. **Circular dependency check** — ensures no circular dependencies exist.

Run with:

```bash
npm run architect:check
```

### 9.2 CI Integration

The architecture check runs in CI:

- On every pull request.
- On every push to main.

PRs that fail `architect:check` cannot be merged.

### 9.3 Code Review

Reviewers must verify:

- New dependencies respect the tier system.
- No circular dependencies are introduced.
- Peer dependencies are justified and documented.

---

## 10. Adding a New Package

When adding a new package to Zudojs:

### 10.1 Determine the Tier

1. What does the package do?
2. What existing `@zudojs/*` packages does it need to import?
3. What is the highest tier of those dependencies?
4. The new package belongs in that tier or higher.

### 10.2 Update Documentation

1. Add the package to the appropriate tier table in this document.
2. Update `architect-check.js` with the package tier.
3. Update `tests/architect/boundaries.test.ts` with the package tier.
4. Update `ROADMAP.md` with the new package.

### 10.3 Implement the Package

1. Create `packages/<name>/package.json` with exact `@zudojs/*` versions.
2. Implement the package following `PACKAGE_RULES.md`.
3. Write tests.
4. Run `npm run architect:check` to verify compliance.

---

## 11. Changing Dependencies

When changing a package's dependencies:

### 11.1 Adding a Dependency

1. Verify the dependency is in a lower or equal tier.
2. Verify no circular dependency will be created.
3. Add the dependency to `package.json` with exact version `0.1.0`.
4. Run `npm run architect:check`.
5. Update this document if a new tier relationship is established.

### 11.2 Removing a Dependency

1. Remove the import from source code.
2. Remove the dependency from `package.json`.
3. Run `npm run architect:check`.

### 11.3 Upgrading a Dependency

1. Update the version in `package.json`.
2. Run `npm run typecheck` in the package.
3. Run `npm run architect:check`.

---

## 12. Quick Reference

| Tier            | Can Import From         | Examples                        |
| --------------- | ----------------------- | ------------------------------- |
| 0 (Leaf)        | Nothing (external only) | `errors`, `types`               |
| 1 (Foundation)  | Tier 0                  | `container`, `logger`, `events` |
| 2 (Application) | Tier 0, Tier 1          | `core`, `cqrs`, `runtime`       |
| 3 (Transport)   | Tier 0, Tier 1, Tier 2  | `http`, `cli`                   |
| 4 (DX)          | Any                     | `testing`, `docs`               |

| Action             | Command                                       |
| ------------------ | --------------------------------------------- |
| Check architecture | `npm run architect:check`                     |
| Check types        | `npm run typecheck --workspace=@zudojs/<pkg>` |
| Run tests          | `npm run test --workspace=@zudojs/<pkg>`      |
| Build package      | `npm run build --workspace=@zudojs/<pkg>`     |
