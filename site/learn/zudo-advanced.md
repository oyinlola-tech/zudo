---
title: "ZudoJS advanced systems — ZudoJS Academy"
description: "Events, messages and CQRS, queues and schedulers, serialization, RPC, API operations and OpenAPI, then testing, logging, observability and documentation, and platform features: feature flags, tenancy, plugins and adapters."
source: https://zudojs.oyinlola.site/learn/zudo-advanced
---

LEVEL 14 · ZUDOJS

Course Advanced

# ZudoJS advanced systems

Events, messages and CQRS, queues and schedulers, serialization, RPC, API operations and OpenAPI, then testing, logging, observability and documentation, and platform features: feature flags, tenancy, plugins and adapters.

- **18 lessons**
- **13 h** to read and try
- **Before this:** [ZudoJS application development](https://zudojs.oyinlola.site/learn/zudo-applications)

0 of 18 lessons done

[Start lesson 1 →](https://zudojs.oyinlola.site/learn/zudo-events)

## When you finish, you can

- Decouple features with events and messages
- Separate commands from queries
- Move slow work to queues and run work on a schedule
- Serialize values across services and call them with RPC
- Describe the API in an OpenAPI document generated from its schemas
- Hide external systems behind adapters and extend an app with plugins
- Roll out features gradually and isolate tenants
- Test, log, trace and measure a ZudoJS application

**You build:** An event-driven, observable Task API with background jobs and feature flags

MODULE 1

## Events, messages and CQRS

1. [1**Events**Decouple Task API features with events: handlers, wildcards, priorities, sequential and parallel dispatch, middleware and handler errors with @zudojs/events.40 min](https://zudojs.oyinlola.site/learn/zudo-events)
2. [2**Messaging**Ask another part of the Task API to do something and get an answer back with @zudojs/messaging: messages, middleware, correlation ids, timeouts, cancellation.35 min](https://zudojs.oyinlola.site/learn/zudo-messaging)
3. [3**Commands and queries (CQRS)**Split the Task API into commands that change data and queries that only read it: buses, handlers, middleware, execution context, results with @zudojs/cqrs.40 min](https://zudojs.oyinlola.site/learn/zudo-cqrs)

MODULE 2

## Background work

1. [4**Background jobs**Move slow, unreliable work out of the request into a job queue: jobs, processors, workers, concurrency, retries with backoff, dead letters with @zudojs/queue.45 min](https://zudojs.oyinlola.site/learn/zudo-queue)
2. [5**Scheduled tasks**Run work on the clock, not a request: intervals, cron expressions, time zones, retries, overlapping runs and running on one instance with @zudojs/scheduler.40 min](https://zudojs.oyinlola.site/learn/zudo-scheduler)

MODULE 3

## Services and contracts

1. [6**Serialization**Turn values into text and back without losing what they were: Dates, BigInts, Maps, Sets, bytes, custom types and versioned payloads with @zudojs/serialization.35 min](https://zudojs.oyinlola.site/learn/zudo-serialization)
2. [7**Calling services with RPC**Call a function in another service as if it were local: procedures, clients, transports, validation, errors, identity, timeouts and retries with @zudojs/rpc.45 min](https://zudojs.oyinlola.site/learn/zudo-rpc)
3. [8**One operation, many transports**Write business logic once as an operation with @zudojs/api, then run it from HTTP, RPC and a queue with the same validation, errors and timeouts.45 min](https://zudojs.oyinlola.site/learn/zudo-api)
4. [9**OpenAPI documents**Describe the Task API in an OpenAPI document with @zudojs/openapi: schemas as components, OpenAPI 3.0 or 3.1, validation, JSON or YAML, a docs page.40 min](https://zudojs.oyinlola.site/learn/zudo-openapi)

MODULE 4

## Quality and insight

1. [10**Testing a ZudoJS app**Test the Task API with Vitest and @zudojs/testing: a test clock, mocks and recording buses, a test container, ordered cleanup, and real HTTP integration tests.Core45 min](https://zudojs.oyinlola.site/learn/zudo-testing)
2. [11**Testing a ZudoJS application layer by layer**Test the Task API one layer at a time with Vitest: services, PGlite repositories, auth sessions, events and queues, CQRS buses, HTTP routes and a full workflow.60 min](https://zudojs.oyinlola.site/learn/zudo-testing-apps)
3. [12**Structured logging**Replace console.log with structured entries a program can search: levels, child loggers, request ids, redaction and JSON logs with @zudojs/logger.40 min](https://zudojs.oyinlola.site/learn/zudo-logging)
4. [13**Observability**See inside a running Task API: metrics count what happens, traces show where time goes, and logs share one trace id with @zudojs/observability.Production45 min](https://zudojs.oyinlola.site/learn/zudo-observability)
5. [14**Documentation as data with @zudojs/docs**Turn the Task API's Markdown docs into checked data with @zudojs/docs: documents, frontmatter, a registry, link and navigation checks, and generated output.50 min](https://zudojs.oyinlola.site/learn/zudo-docs)

MODULE 5

## Platform

1. [15**Feature flags**Turn features on and off without deploying: rules, evaluation context, percentage rollouts, A/B variants and kill switches with @zudojs/feature-flags.40 min](https://zudojs.oyinlola.site/learn/zudo-feature-flags)
2. [16**Multi-tenancy**Serve many companies from one Task API without mixing their data: tenant ids, resolvers, trust levels and tenant-scoped queries with @zudojs/tenancy.45 min](https://zudojs.oyinlola.site/learn/zudo-tenancy)
3. [17**Plugins**Extend the Task API through a fixed interface without editing it: plugin lifecycle, dependencies, scoped context, rollback and diagnostics with @zudojs/plugins.45 min](https://zudojs.oyinlola.site/learn/zudo-plugins)
4. [18**Adapters with @zudojs/adapters**Put a payment provider behind an adapter with @zudojs/adapters, then swap a fake for a real HTTP provider without touching checkout.55 min](https://zudojs.oyinlola.site/learn/zudo-adapters)

## Course checkpoint

Prove you can move on. The checkpoint picks 20 questions at random from every lesson in this course. Get 16 right to pass. Your result is saved in this browser only.
