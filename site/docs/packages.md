---
title: "Packages — @zudojs/*"
description: "Browse all 38 @zudojs packages. Filter by category, search by name, and select versions. Foundation, runtime, application, transport, security, and platform packages."
source: https://zudojs.oyinlola.site/docs/packages
---

## Architecture Tiers

Dependencies flow inward: a package may depend only on packages of the same or a lower tier. Tier 0 means it depends on no other Zudo package. The tiers below are the ones defined in `scripts/package-tiers.js`, the single source of truth the architecture tests enforce — a category spanning a range simply groups packages that sit at different tiers.

Tier 0–1

Foundation

Tier 1

Runtime Primitives

Tier 2

Application

Tier 3

Transport

Tier 1–2

Security

Tier 1–4

Platform / DX

## Foundation

11 packages

The building blocks everything else rests on. `@zudojs/errors` and `@zudojs/types` are tier 0 — they depend on no other Zudo package. The other nine sit at tier 1, depending only on those two.

[@zudojs/errors v1.0.1

Shared error base class, error codes, and error handling utilities for the Zudo framework.

No dependencies](https://zudojs.oyinlola.site/docs/packages-errors.md) [@zudojs/types v1.0.0

Shared type guards, utility types, and type converters for the Zudo framework.

No dependencies](https://zudojs.oyinlola.site/docs/packages-types.md) [@zudojs/constants v1.0.1

Shared constants, enums, and type-safe literals for the Zudo framework.

depends on: errors](https://zudojs.oyinlola.site/docs/packages-constants.md) [@zudojs/container v1.1.0

Token-based dependency injection container for managing application dependencies and service lifetimes.

depends on: errors](https://zudojs.oyinlola.site/docs/packages-container.md) [@zudojs/logger v1.1.0

Structured logging with transports, log levels, and context propagation for Zudo applications.

depends on: errors](https://zudojs.oyinlola.site/docs/packages-logger.md) [@zudojs/crypto v1.1.0

Cryptographic primitives for hashing, encryption, tokens, and secure random generation.

depends on: constants, errors](https://zudojs.oyinlola.site/docs/packages-crypto.md) [@zudojs/validation v1.0.1

Schema validation with Zod integration, constraints, parsers, composers, and depth/size checks.

depends on: errors](https://zudojs.oyinlola.site/docs/packages-validation.md) [@zudojs/schema v1.0.1

Type-safe schema definition, parsing, and validation engine for data contracts.

depends on: errors, constants, types](https://zudojs.oyinlola.site/docs/packages-schema.md) [@zudojs/config v1.0.1

Layered configuration management with multiple sources, validation, and environment-specific overrides.

depends on: errors](https://zudojs.oyinlola.site/docs/packages-config.md) [@zudojs/middleware v1.0.1

Composable middleware pipeline with composition, timing, error handling, and context propagation.

depends on: errors](https://zudojs.oyinlola.site/docs/packages-middleware.md) [@zudojs/serialization v1.0.1

Data translation layer with JSON serializer, type transformers, envelopes, and registry.

depends on: constants, errors, types, validation](https://zudojs.oyinlola.site/docs/packages-serialization.md)

## Runtime Primitives

11 packages

Infrastructure for events, messaging, lifecycle, storage, and background processing.

[@zudojs/events v1.0.1

Event-driven architecture with event bus, emitter, middleware, and registry for decoupled communication.

depends on: errors, constants](https://zudojs.oyinlola.site/docs/packages-events.md) [@zudojs/messaging v1.0.1

In-process message bus infrastructure with handlers, middleware, and publish/subscribe patterns.

depends on: errors, constants](https://zudojs.oyinlola.site/docs/packages-messaging.md) [@zudojs/lifecycle v1.1.0

Application and component lifecycle orchestration with state machine, dependency ordering, graceful shutdown.

depends on: errors, constants](https://zudojs.oyinlola.site/docs/packages-lifecycle.md) [@zudojs/transactions v1.1.0

Transaction lifecycle and coordination with state machine, AsyncLocalStorage, savepoints, and hooks.

depends on: errors](https://zudojs.oyinlola.site/docs/packages-transactions.md) [@zudojs/cache v1.0.1

Caching primitives, abstractions, and adapters for the Zudo framework.

depends on: errors, types, serialization](https://zudojs.oyinlola.site/docs/packages-cache.md) [@zudojs/storage v1.1.0

Storage abstractions including database, object storage, repository, serialization, locking, and lifecycle.

depends on: errors, constants, types, serialization](https://zudojs.oyinlola.site/docs/packages-storage.md) [@zudojs/queue v1.1.0

Background job and asynchronous task infrastructure with in-memory and adapter-based queue implementations.

depends on: errors, constants, serialization](https://zudojs.oyinlola.site/docs/packages-queue.md) [@zudojs/scheduler v1.1.0

Scheduled task and job infrastructure with cron-like scheduling, persistence, and worker management.

depends on: errors, constants, types](https://zudojs.oyinlola.site/docs/packages-scheduler.md) [@zudojs/adapters v1.0.1

Boundary layer between Zudo and external platforms with adapter contracts, registry, and transport abstractions.

depends on: errors, constants, types, lifecycle](https://zudojs.oyinlola.site/docs/packages-adapters.md) [@zudojs/database v1.1.0

Database abstraction layer with clients, repositories, transactions, and query building.

depends on: errors](https://zudojs.oyinlola.site/docs/packages-database.md) [@zudojs/observability v1.0.1

Structured logging, metrics, tracing, context propagation, and exporters for Zudo applications.

depends on: errors](https://zudojs.oyinlola.site/docs/packages-observability.md)

## Application Architecture

7 packages

High-level application patterns: CQRS, runtime, API operations, auth, RPC, and OpenAPI.

[@zudojs/core v1.1.0

Application lifecycle management, execution context propagation, and runtime orchestration.

depends on: errors, constants, messaging](https://zudojs.oyinlola.site/docs/packages-core.md) [@zudojs/cqrs v1.0.1

CQRS primitives for separating read and write operations.

depends on: errors, events, messaging](https://zudojs.oyinlola.site/docs/packages-cqrs.md) [@zudojs/auth v1.1.0

Authentication and authorization services — JWT tokens, sessions, RBAC, and password hashing.

depends on: errors, constants, permissions](https://zudojs.oyinlola.site/docs/packages-auth.md) [@zudojs/auth-oauth v1.1.1

Sign in with Google, GitHub, Microsoft, Apple or Discord — authorization URLs, PKCE, state checks, and code exchange.

no dependencies](https://zudojs.oyinlola.site/docs/packages-auth-oauth.md) [@zudojs/runtime v1.1.0

Application lifecycle orchestrator with dependency ordering, rollback, signals, and readiness checks.

depends on: errors, constants, container, config, logger, events, core](https://zudojs.oyinlola.site/docs/packages-runtime.md) [@zudojs/api v1.0.1

Application-facing API layer — operation definitions, execution context, interceptors, and result types.

depends on: errors, constants, types, schema](https://zudojs.oyinlola.site/docs/packages-api.md) [@zudojs/rpc v1.1.0

Remote procedure call infrastructure for Zudo applications.

depends on: errors, constants, types, schema](https://zudojs.oyinlola.site/docs/packages-rpc.md) [@zudojs/openapi v1.2.0

OpenAPI 3.1 specification generation, validation, and SDK generation for Zudo applications.

depends on: errors, constants, schema](https://zudojs.oyinlola.site/docs/packages-openapi.md)

## Transport

2 packages

External interfaces — HTTP server and CLI tooling.

[@zudojs/http v1.1.0

HTTP primitives, request handling, routing, middleware, and server infrastructure.

depends on: core, errors, logger, security](https://zudojs.oyinlola.site/docs/packages-http.md) [zudojs-cli v1.1.1

Command-line interface for scaffolding, generating, and managing Zudo framework projects.

depends on: config, core, errors, logger](https://zudojs.oyinlola.site/docs/packages-cli.md)

## Security

4 packages

Authentication, authorization, input validation, and cryptographic security.

[@zudojs/security v1.0.1

Security primitives for input validation, header security, CORS, CSRF, rate limiting, and security headers.

depends on: errors, constants](https://zudojs.oyinlola.site/docs/packages-security.md) [@zudojs/permissions v1.1.0

Generic authorization engine with RBAC, ABAC, resource authorization, wildcards, role hierarchy, and policies.

depends on: errors, constants](https://zudojs.oyinlola.site/docs/packages-permissions.md) [@zudojs/crypto Foundation

Cryptographic primitives for hashing, encryption, tokens. Listed in Foundation above.](https://zudojs.oyinlola.site/docs/packages-crypto.md) [@zudojs/auth Application

Authentication and authorization. Listed in Application above.](https://zudojs.oyinlola.site/docs/packages-auth.md) [@zudojs/auth-oauth Application

OAuth 2.0 sign-in. Listed in Application above.](https://zudojs.oyinlola.site/docs/packages-auth-oauth.md)

## Platform & DX

4 packages

Multi-tenancy, feature flags, plugins, documentation infrastructure, and testing utilities.

[@zudojs/tenancy v1.1.0

Multi-tenant context and isolation with tenant resolution, AsyncLocalStorage propagation, and guard middleware.

depends on: errors, constants](https://zudojs.oyinlola.site/docs/packages-tenancy.md) [@zudojs/feature-flags v1.1.0

Feature flag system with deterministic rollouts, rule engine, providers, variants, and evaluation context.

depends on: errors](https://zudojs.oyinlola.site/docs/packages-feature-flags.md) [@zudojs/plugins v1.1.0

Plugin system for extending Zudo applications with modular capabilities.

depends on: errors, constants, types](https://zudojs.oyinlola.site/docs/packages-plugins.md) [@zudojs/docs v1.0.1

Documentation infrastructure with structured document model, registry, validation, navigation, and generation.

depends on: errors](https://zudojs.oyinlola.site/docs/packages-docs.md) [@zudojs/testing v1.1.0

Test helpers, fixtures, mocks, and utilities for testing Zudo applications.

depends on: 15 packages](https://zudojs.oyinlola.site/docs/packages-testing.md)

0

No packages match your filter.
