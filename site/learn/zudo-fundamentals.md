---
title: "ZudoJS fundamentals — ZudoJS Academy"
description: "Enter ZudoJS knowing what it abstracts: its package architecture, the CLI, the anatomy of a project, the core, runtime and lifecycle, shared types and constants, dependency injection, configuration, errors, HTTP, middleware, schemas and validation."
source: https://zudojs.oyinlola.site/learn/zudo-fundamentals
---

LEVEL 12 · ZUDOJS

Course Core

# ZudoJS fundamentals

Enter ZudoJS knowing what it abstracts: its package architecture, the CLI, the anatomy of a project, the core, runtime and lifecycle, shared types and constants, dependency injection, configuration, errors, HTTP, middleware, schemas and validation.

- **19 lessons**
- **15 h** to read and try
- **Before this:** [Software design and architecture](https://zudojs.oyinlola.site/learn/software-architecture)

0 of 19 lessons done

[Start lesson 1 →](https://zudojs.oyinlola.site/learn/zudo-welcome)

## When you finish, you can

- Explain what each ZudoJS package does and when not to use it
- Create, generate and run a project with the zudojs CLI
- Trace a request from the entry point through the container to a handler
- Wire services with @zudojs/container
- Configure an application in layers and handle errors the ZudoJS way
- Serve a validated HTTP API with routes and middleware

**You build:** The Task API rebuilt with ZudoJS

MODULE 1

## Entering ZudoJS

1. [1**Welcome to ZudoJS**Meet ZudoJS: its 38 packages and how they are layered, the zudojs CLI and three application shapes. Then run three of its packages together in your browser.25 min](https://zudojs.oyinlola.site/learn/zudo-welcome)
2. [2**Your first Zudo code**Install your first ZudoJS packages, check untrusted data at runtime with @zudojs/schema, and report failures with the ready-made errors in @zudojs/errors.35 min](https://zudojs.oyinlola.site/learn/zudo-first-code)
3. [3**Create the Task API project**Install the zudojs CLI, create the Task API project, run it in development, find your way around its files, try each command, and build it for production.50 min](https://zudojs.oyinlola.site/learn/zudo-create-project)
4. [4**The ZudoJS CLI in depth**Use every command and option of the zudojs CLI, see how it finds your project and names and wires generated files, and read its errors in time.50 min](https://zudojs.oyinlola.site/learn/zudo-cli)
5. [5**Anatomy of a ZudoJS project**Trace a generated ZudoJS project from src/server.ts through config, runtime and composition root to controller, service and repository, with its real files.55 min](https://zudojs.oyinlola.site/learn/zudo-project-anatomy)

MODULE 2

## Core, runtime and lifecycle

1. [6**The core: applications, modules and context**Build an application with @zudojs/core, compose it from modules, and carry each request's identity through async code with the execution context.50 min](https://zudojs.oyinlola.site/learn/zudo-core)
2. [7**The application runtime and lifecycle**See how @zudojs/runtime starts your app's modules in dependency order, rolls back a failed start, reports readiness honestly and shuts down gracefully.45 min](https://zudojs.oyinlola.site/learn/zudo-runtime)
3. [8**Components with @zudojs/lifecycle**Start and stop a database, a job queue and an HTTP server in order with @zudojs/lifecycle: retries, timeouts, priorities, optional parts, rollback, shutdown.55 min](https://zudojs.oyinlola.site/learn/zudo-lifecycle)
4. [9**Types and constants: guards, ids and time**Check untrusted values with @zudojs/types, keep ids apart with branded types, use the shared HTTP and time constants, and make clocks and randomness testable.50 min](https://zudojs.oyinlola.site/learn/zudo-types-constants)

MODULE 3

## Dependency injection

1. [10**Dependency injection with @zudojs/container**Let a container build and share your services: tokens, class, factory and value providers, lifetimes, cycle detection, disposal and swapping in test fakes.40 min](https://zudojs.oyinlola.site/learn/zudo-container)
2. [11**DI architecture with ZudoJS**Decide where every object in a ZudoJS app is built: one composition root, constructor or factory injection, fakes in tests and frozen wiring in production.50 min](https://zudojs.oyinlola.site/learn/zudo-di-architecture)

MODULE 4

## HTTP

1. [12**Routes, requests and responses**Serve the Task API with @zudojs/http: a server, routes with parameters, query strings, headers, cookies and JSON bodies read safely, and the right status codes.50 min](https://zudojs.oyinlola.site/learn/zudo-http)
2. [13**Routing in depth**Control which handler answers a request in @zudojs/http: path patterns, matching order, route middleware, groups, repeated query keys and canonical targets.50 min](https://zudojs.oyinlola.site/learn/zudo-routing)
3. [14**Middleware, CORS, security headers and graceful shutdown**Wrap every Task API route in middleware: how a pipeline runs, security headers, a CORS allow-list, rate limits, and a shutdown that lets requests finish.50 min](https://zudojs.oyinlola.site/learn/zudo-middleware)
4. [15**Middleware pipelines with @zudojs/middleware**Build one pipeline for HTTP, CLI and jobs with @zudojs/middleware: logging, auth checks, validation, rate limits, timeouts, error modes and execution tracking.55 min](https://zudojs.oyinlola.site/learn/zudo-middleware-pipelines)

MODULE 5

## Configuration, validation and errors

1. [16**Configuration**Keep settings out of code with @zudojs/config: layered sources, validation at startup, secrets kept out of logs, and a Task API stricter in production.45 min](https://zudojs.oyinlola.site/learn/zudo-config)
2. [17**Schemas and validation in depth**Validate everything crossing the Task API's boundary with @zudojs/schema: issues, coercion, transforms, refinements, unknown fields, responses and hostile JSON.50 min](https://zudojs.oyinlola.site/learn/zudo-validation)
3. [18**Validation rules with @zudojs/validation**Go beyond data shapes with @zudojs/validation: constraints, normalizers, composers, Zod, guards and errors, and treat request and response failures differently.55 min](https://zudojs.oyinlola.site/learn/zudo-validation-rules)
4. [19**The ZudoJS error system**Handle failures the ZudoJS way: expected errors versus bugs, your own error classes, safe bodies for clients, full logs, and one handler for the Task API.45 min](https://zudojs.oyinlola.site/learn/zudo-errors)

## Course checkpoint

Prove you can move on. The checkpoint picks 20 questions at random from every lesson in this course. Get 16 right to pass. Your result is saved in this browser only.
