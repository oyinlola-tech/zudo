# Zudojs Roadmap

> This document tracks the implementation status of the Zudojs framework.
> It is updated as packages are completed, modified, or deprecated.

---

## Legend

- ✅ **Complete** — Package is implemented, tested, and documented.
- 🔄 **In Progress** — Package is partially implemented.
- ⏳ **Planned** — Package is designed but not yet implemented.
- ❌ **Not Started** — Package is identified but not yet designed.

---

## Phase 1 — Foundation

The foundational layer. These packages have no `@zudojs/*` dependencies (except `@zudojs/errors`).

| Package                 | Status      | Notes                                                  |
| ----------------------- | ----------- | ------------------------------------------------------ |
| `@zudojs/errors`        | ✅ Complete | Shared error base class, error codes, error categories |
| `@zudojs/types`         | ✅ Complete | Type guards, utility types, converters                 |
| `@zudojs/constants`     | ✅ Complete | Branded IDs, enums, serialization constants            |
| `@zudojs/container`     | ✅ Complete | DI container with token-based registration             |
| `@zudojs/logger`        | ✅ Complete | Structured logging with transports                     |
| `@zudojs/crypto`        | ✅ Complete | Hashing, encryption, tokens                            |
| `@zudojs/validation`    | ✅ Complete | Schema validation with Zod                             |
| `@zudojs/schema`        | ✅ Complete | Schema definition, parsing, type inference             |
| `@zudojs/config`        | ✅ Complete | Layered configuration with sources                     |
| `@zudojs/middleware`    | ✅ Complete | Composable middleware pipeline                         |
| `@zudojs/serialization` | ✅ Complete | JSON serializer, type transformers, envelopes          |

**Phase 1 Goal:** Provide the building blocks for all higher-level packages.

---

## Phase 2 — Runtime Primitives

Runtime building blocks that depend on foundation packages.

| Package                 | Status      | Notes                                                 |
| ----------------------- | ----------- | ----------------------------------------------------- |
| `@zudojs/events`        | ✅ Complete | Event bus, emitter, middleware, registry              |
| `@zudojs/messaging`     | ✅ Complete | In-process message bus                                |
| `@zudojs/lifecycle`     | ✅ Complete | State machine, dependency ordering, graceful shutdown |
| `@zudojs/transactions`  | ✅ Complete | Transaction lifecycle, AsyncLocalStorage context      |
| `@zudojs/cache`         | ✅ Complete | Cache abstraction with memory adapter                 |
| `@zudojs/storage`       | ✅ Complete | Database, object storage, repository abstractions     |
| `@zudojs/queue`         | ✅ Complete | Background job and async task infrastructure          |
| `@zudojs/scheduler`     | ✅ Complete | Job scheduling, cron, triggers                        |
| `@zudojs/adapters`      | ✅ Complete | Adapter contracts, registry, transport abstractions   |
| `@zudojs/database`      | ✅ Complete | Database clients, repositories, transactions          |
| `@zudojs/observability` | ✅ Complete | Structured logging, metrics, tracing, exporters       |

**Phase 2 Goal:** Provide the runtime infrastructure for application architecture.

---

## Phase 3 — Application Architecture

Patterns and structures for building applications.

| Package                 | Status      | Notes                                         |
| ----------------------- | ----------- | --------------------------------------------- |
| `@zudojs/core`          | ✅ Complete | Lifecycle, context, runtime, modules          |
| `@zudojs/cqrs`          | ✅ Complete | Commands, queries, handlers                   |
| `@zudojs/auth`          | ✅ Complete | JWT, sessions, password hashing               |
| `@zudojs/runtime`       | ✅ Complete | Application lifecycle orchestrator            |
| `@zudojs/permissions`   | ✅ Complete | RBAC, ABAC, resource authorization            |
| `@zudojs/security`      | ✅ Complete | Input validation, CORS, CSRF, rate limiting   |
| `@zudojs/tenancy`       | ✅ Complete | Multi-tenant context and isolation            |
| `@zudojs/feature-flags` | ✅ Complete | Feature flag evaluation, rule engine          |
| `@zudojs/plugins`       | ✅ Complete | Plugin registration, lifecycle, orchestration |
| `@zudojs/openapi`       | ✅ Complete | OpenAPI document generation                   |
| `@zudojs/rpc`           | ✅ Complete | RPC primitives                                |
| `@zudojs/api`           | ✅ Complete | API abstraction layer                         |

**Phase 3 Goal:** Provide the application architecture layer.

---

## Phase 4 — Transport

External interface packages.

| Package        | Status      | Notes                                      |
| -------------- | ----------- | ------------------------------------------ |
| `@zudojs/http` | ✅ Complete | HTTP request handling, routing, middleware |
| `@zudojs/cli`  | ✅ Complete | Command-line interface                     |

**Phase 4 Goal:** Provide external interfaces for Zudojs applications.

---

## Phase 5 — Developer Experience

Tooling for building, testing, and documenting Zudojs applications.

| Package           | Status      | Notes                         |
| ----------------- | ----------- | ----------------------------- |
| `@zudojs/testing` | ✅ Complete | Test helpers, fixtures, mocks |
| `@zudojs/docs`    | ✅ Complete | Documentation infrastructure  |

**Phase 5 Goal:** Provide excellent developer experience.

---

## Phase 6 — Integration & Examples

Real-world applications that validate the framework end-to-end.

| Example                     | Status      | Notes                                          |
| --------------------------- | ----------- | ---------------------------------------------- |
| `examples/hello-world`      | ✅ Complete | Minimal HTTP server                            |
| `examples/basic-api`        | ✅ Complete | CRUD with CQRS, database, events               |
| `examples/modular-monolith` | ✅ Complete | Modular monolith; runs in `pnpm test:all`      |
| `examples/monolith`         | ✅ Complete | Single-deployment application                  |
| `examples/micro-service`    | ✅ Complete | Service split across independent packages      |
| `examples/worker`           | ✅ Complete | Background job processing                      |
| `examples/cqrs`             | ⏳ Planned  | Command/query separation in isolation          |
| `examples/events`           | ⏳ Planned  | Event-driven architecture in isolation         |
| `examples/plugins`          | ⏳ Planned  | Plugin system demo                             |

**Phase 6 Goal:** Validate that packages work together correctly.

---

## Phase 7 — Advanced Features

Features that build on the core architecture.

| Feature              | Status     | Notes                           |
| -------------------- | ---------- | ------------------------------- |
| Hot plugin reloading | ⏳ Planned | Dev-time plugin reload          |
| Distributed tracing  | ⏳ Planned | Full OpenTelemetry integration  |
| Horizontal scaling   | ⏳ Planned | Multi-instance support          |
| Edge runtime support | ⏳ Planned | Vercel Edge, Cloudflare Workers |
| Plugin marketplace   | ⏳ Planned | Versioned, isolated plugins     |

---

## Completed Milestones

### Milestone 1 — Foundation (Completed)

- All Tier 0 and Tier 1 packages implemented.
- Dependency direction enforced.
- No circular dependencies.

### Milestone 2 — Runtime Primitives (Completed)

- All runtime infrastructure packages implemented.
- State machine patterns established.
- Lifecycle coordination working.

### Milestone 3 — Application Architecture (Completed)

- CQRS, events, messaging working.
- Plugin system implemented.
- Runtime orchestrator complete.

### Milestone 4 — Transport Layer (Completed)

- HTTP transport complete.
- CLI transport complete.

### Milestone 5 — Developer Experience (Completed)

- Testing utilities complete.
- Documentation infrastructure complete.

### Milestone 6 — Architecture Governance (Completed)

- `ARCHITECTURE.md` created.
- `DEPENDENCIES.md` created.
- `PACKAGE_RULES.md` created.
- `architect-check.js` automated validation.
- `tests/architect/boundaries.test.ts` automated tests.

---

### Milestone 7 — Audit & Hardening (Ongoing)

A numbered audit series over every package. Each round reproduces every
finding by executing the real source before it is written down, fixes it with
a regression test that fails against the unfixed code, and publishes.

- Rounds 4–8 — per-package sweeps; OAuth2 extracted into `@zudojs/auth-oauth`.
- Round 9 — all 39 packages; `release:check` gate and the site export-index
  tooling introduced.
- Round 10 — all 39 packages, 209 findings.
- Round 11 — all 39 packages, 98 findings, 3 critical. `pnpm release:check`
  green at 7,891 tests.

The dominant defect class across every round is worth stating plainly, because
it is what the reviews now look for first: **a capability that is typed,
implemented in its own module, exported from the barrel and documented on the
site, whose one call site never invokes it.** Module-level unit tests pass for
every instance of it; only an end-to-end assertion through the public facade
catches it.

---

## Next Steps

1. **Split the ~394 files over 150 lines** — The largest remaining deviation
   from `AGENTS.md`; tracked but deliberately deferred through rounds 9–11.
2. **Consolidate `core` / `runtime` / `lifecycle`** — Three overlapping
   lifecycle implementations; see the five-step plan in `runtime.status.md`.
3. **Performance testing** — Benchmark request throughput and memory usage.
   No benchmark suite exists yet.
4. **`httpQuery()` client helper** — A convenience method for GET requests
   with query-string building. The server-side `httpQuery` parsing module is
   complete and hardened; the client-side helper is not yet written.
5. **Alias `@zudojs/observability` logger types to `@zudojs/logger`** — Needs a
   major version.
6. **Unify `database` and `storage` transaction types** — A design decision,
   not a defect.

---

## How to Update This Document

When completing a package or milestone:

1. Update the package status in the appropriate phase table.
2. Add notes if relevant.
3. Mark completed milestones.
4. Update "Next Steps" based on current priorities.
