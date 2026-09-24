---
title: "Learn ZudoJS — from JavaScript to production backends"
description: "A free, hands-on path from your first line of JavaScript to Node.js, backend fundamentals, TypeScript and production ZudoJS applications. Every example runs in your browser or on your computer, with the real output shown."
source: https://zudojs.oyinlola.site/learn
---

FREE COURSE

# Learn ZudoJS

Start with plain JavaScript, learn Node.js and how backends work, move to TypeScript, then build real backends with ZudoJS and take them to production. ZudoJS is the destination, not the starting point: every lesson shows the real output of the code, in the terminal on the page or on your own computer.

[Start lesson 1 →](https://zudojs.oyinlola.site/learn/welcome)

## How this course works

The path has five stages, and each one builds on the last:

1. **JavaScript**: the language itself, from your first line to classes, errors, asynchronous code and modules.
2. **Node.js and backend fundamentals**: the runtime, npm, HTTP, REST, databases and SQL, Git and testing. You build a **Task API** with no framework at all, so you know exactly what a framework does for you later.
3. **TypeScript**: the same code with types, finished with a **BookStore API** written in TypeScript by hand.
4. **ZudoJS**: the framework, one package at a time. You rebuild the Task API with ZudoJS and grow it with a database, authentication, permissions, events, queues, caching, OpenAPI, tests and observability.
5. **Architecture and production**: modular monoliths, microservices, deployment with Docker, and the **ShopFlow** capstone, a complete commerce backend.

Each lesson gives you two ways to run the code:

| Where | How | Good for |
| --- | --- | --- |
| **In your browser** | Press **Run in browser** on any example. A terminal opens at the bottom of the page and runs the code. You can edit it and run it again. | Trying ideas quickly, on any device, with nothing installed |
| **On your computer** | Each lesson lists the exact commands to type, and the output you should see. | Building the real project. A backend runs on a computer, so this is where you will end up |

Every example also has an **Edit** button. It opens the **editor**, a workspace that looks and works like Visual Studio Code: files on the left, tabs, and a terminal underneath. Change the code, run it with Ctrl + Enter, create your own files, and everything you write is saved in your browser.

Every lesson ends with a **test**: five questions picked at random from a bank of 30 to 50. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it. Get 4 of 5 right to pass and the lesson is marked as done. If you don't pass, you try again with five different questions.

The output under each example is the real output. It was produced by running that example with Node.js and in the browser terminal, and both print exactly the same thing.

> TIP
>
> You can also open the terminal at any time with the >_ button in the header, or with Ctrl + `.

## What you need

- A computer running Windows, macOS or Linux, where you can install programs.
- A code editor. [Visual Studio Code](https://code.visualstudio.com/) is free and works well with TypeScript.
- No programming experience with JavaScript is required. If you have written a little code in any language, you will move faster.

## Not every lesson is for everyone

Every part and lesson carries one of four labels. A complete beginner follows the whole path in order. If you already know JavaScript, skip to [Node.js and npm](https://zudojs.oyinlola.site/learn/node-runtime); if you already build backends in TypeScript, go straight to [Meet ZudoJS](https://zudojs.oyinlola.site/learn/zudo-welcome).

- FoundationMust understand before moving on.
- CoreRequired for everyday ZudoJS development.
- AdvancedLearn it when your application needs it.
- ProductionLearn it when you prepare a real application for deployment.

PART 1 Foundation

## Start here

What this course is, the tools a developer uses every day, how a program runs, how the web works, and your first program.

1. [1**Welcome to the learning path**What this free course is, who it is for, what you will build, and how the lessons and the terminal on each page work.10 min](https://zudojs.oyinlola.site/learn/welcome)
2. [2**Your developer environment**Meet the tools a developer uses every day, the terminal, a code editor and the browser's developer tools, and learn to move around your files by typing commands.35 min](https://zudojs.oyinlola.site/learn/dev-environment)
3. [3**How programs run**What happens between the code you type and the result on the screen, what JavaScript engines and runtimes are, and the difference between a syntax error and a runtime error.25 min](https://zudojs.oyinlola.site/learn/how-programs-run)
4. [4**How the web works**Follow a request from your browser to a server and back, and learn what clients, servers, IP addresses, DNS, ports, HTTP, HTTPS, APIs and databases are.30 min](https://zudojs.oyinlola.site/learn/how-the-web-works)
5. [5**Set up your computer**Install Node.js, try JavaScript in the Node.js REPL, write and run your first program, and turn its folder into a project.30 min](https://zudojs.oyinlola.site/learn/setup)

PART 2 Foundation

## JavaScript fundamentals

The language itself: values, operators, decisions, loops, functions, arrays, objects, classes, errors, asynchronous code and modules.

1. [6**Values, variables and types**Store values in variables with const and let, meet the seven primitive types, and learn how JavaScript handles text, numbers, true and false, and "no value".35 min](https://zudojs.oyinlola.site/learn/js-values)
2. [7**Operators**Calculate, compare and combine values with JavaScript's operators, give missing values safe defaults with ?? and ?., and avoid the classic precedence traps.30 min](https://zudojs.oyinlola.site/learn/js-operators)
3. [8**Making decisions**Let your program choose what to do with if, else if and else, the ternary operator and switch, and keep decisions readable with guard clauses.30 min](https://zudojs.oyinlola.site/learn/js-conditions)
4. [9**Loops**Repeat work with for, while, do...while, for...of and for...in, control a loop with break and continue, and build a number guessing game.35 min](https://zudojs.oyinlola.site/learn/js-loops)
5. [10**Functions**Package logic into reusable functions, pass values in and get results out, pass functions to other functions, and meet scope, closures and recursion.40 min](https://zudojs.oyinlola.site/learn/js-functions)
6. [11**Arrays**Keep ordered lists in arrays, add and remove items, search them, and transform them with map, filter, reduce and sort, then build a small student management system.40 min](https://zudojs.oyinlola.site/learn/js-arrays)
7. [12**Objects and JSON**Group related values into objects, read and change their properties, copy and take them apart safely, and turn them into JSON, the text format every API speaks.40 min](https://zudojs.oyinlola.site/learn/js-data)
8. [13**Modern JavaScript**Take a piece of old-style JavaScript and rewrite it step by step with the modern syntax a backend uses every day, fixing real bugs on the way.35 min](https://zudojs.oyinlola.site/learn/js-modern)
9. [14**Scope and how code runs**Learn where a name can be used, how closures remember values, why some names exist before their line runs, and how the call stack and the heap work, so you can read error messages and debug real programs.40 min](https://zudojs.oyinlola.site/learn/js-scope)
10. [15**this, prototypes and classes**Understand what this means inside a method and why it gets lost, how objects share methods through prototypes, and how to write classes with private fields, getters, static methods and inheritance.45 min](https://zudojs.oyinlola.site/learn/js-classes)
11. [16**Handling errors**Tell syntax, runtime and logic errors apart, throw and catch errors, read an Error object's name, message, cause and stack, write your own error classes, and turn errors into safe API answers.40 min](https://zudojs.oyinlola.site/learn/js-errors)
12. [17**Asynchronous JavaScript**Learn why a backend waits without blocking, how callbacks, promises and async/await work, how errors travel through asynchronous code, and how to run work in sequence or in parallel.50 min](https://zudojs.oyinlola.site/learn/js-async)
13. [18**Modules**Split a program into files with ES modules, understand the older CommonJS require, choose between named and default exports, and avoid circular dependencies.40 min](https://zudojs.oyinlola.site/learn/js-modules)

PART 3 Foundation

## Node.js and npm

JavaScript on the server: the runtime and event loop, files and streams, npm packages, and an HTTP server with no framework at all.

1. [19**What Node.js is**Learn what Node.js adds to JavaScript, how its event loop decides what runs next, and how a program talks to the computer through process, exit codes and environment variables.35 min](https://zudojs.oyinlola.site/learn/node-runtime)
2. [20**Files, paths and your computer**Use Node.js's built-in modules to build safe file paths, read and write files and folders, learn about the computer, make random ids and hashes, and announce events. Then save tasks to a JSON file.40 min](https://zudojs.oyinlola.site/learn/node-apis)
3. [21**Streams and buffers**Learn what the bytes behind text really are, then handle data piece by piece with readable, writable and transform streams, pipeline and readline, so a program can process files far bigger than its memory.35 min](https://zudojs.oyinlola.site/learn/node-streams)
4. [22**npm and packages**Install, update and remove packages with npm, read package.json and package-lock.json, understand version ranges, write npm scripts, share code with workspaces, see what publishing would send, and keep the packages you install safe.40 min](https://zudojs.oyinlola.site/learn/npm-packages)
5. [23**An HTTP server with no framework**Build a web server with nothing but Node.js's node:http module. Read the method, path, headers, query and body of each request, send JSON back with the right status code, and route requests by hand.40 min](https://zudojs.oyinlola.site/learn/node-http)
6. [24**Build a plain Node.js Task API**Finish a complete Task API with no framework, split into modules, with middleware, centralized error handling, API-key protection and configuration from the environment. Then look honestly at what hurts when it grows to 20,000 lines.50 min](https://zudojs.oyinlola.site/learn/node-task-api)

PART 4 Foundation

## Backend fundamentals

HTTP in depth, REST API design, databases and SQL with PostgreSQL, Git and GitHub, and testing.

1. [25**HTTP in depth**See the exact bytes of an HTTP request and response, then learn the parts every backend developer uses daily: headers, cookies, content types, methods and status codes.40 min](https://zudojs.oyinlola.site/learn/http-deep)
2. [26**Designing a REST API**Turn the Task API into a well-designed REST API: resources and URLs, a written contract, filtering, sorting, offset and cursor pagination, versioning and one consistent error format.40 min](https://zudojs.oyinlola.site/learn/rest-design)
3. [27**How databases work**Why a backend keeps its data in a database, how relational databases organise it into tables and relationships, and what keys, constraints, indexes, transactions and migrations do, with real PostgreSQL running inside Node.js.45 min](https://zudojs.oyinlola.site/learn/databases)
4. [28**SQL with PostgreSQL**Install PostgreSQL with an installer or with Docker, talk to it with psql, and learn the SQL every backend uses: create, insert, select, update and delete, with filters, sorting and paging, and parameterized queries that stop SQL injection.45 min](https://zudojs.oyinlola.site/learn/sql-basics)
5. [29**Joins, grouping and transactions**Combine tables with joins, summarise data with group by and aggregates, filter groups with having, nest queries, control transactions yourself, measure queries with explain analyze, and connect Node.js to a real PostgreSQL server.45 min](https://zudojs.oyinlola.site/learn/sql-advanced)
6. [30**Git and GitHub**Track every change to your code with Git, work on branches, merge them and resolve a real conflict, keep node_modules and secrets out of your repository, and share your work through GitHub with remotes and pull requests.40 min](https://zudojs.oyinlola.site/learn/git)
7. [31**Testing fundamentals**Why automated tests matter, the difference between unit, integration and end-to-end tests, and how to write them with node:assert and Node's built-in test runner, including mocks, spies, isolated tests and a fresh test database. Then the same tests in Vitest.45 min](https://zudojs.oyinlola.site/learn/testing-basics)

PART 5 Foundation

## TypeScript

Add types to the same JavaScript: basic types, functions, interfaces and unions, generics, advanced and utility types, classes, modules, and where types stop and runtime checks begin.

1. [32**Why TypeScript exists**See a bug that JavaScript runs without complaint, install TypeScript, write a tsconfig.json, and learn the three ways to run TypeScript on Node.js 24.35 min](https://zudojs.oyinlola.site/learn/ts-setup)
2. [33**Basic types**The everyday types of TypeScript - strings, numbers, booleans, arrays, tuples and object types - plus any vs unknown, null and undefined under strict mode, void, and never for exhaustive checks.35 min](https://zudojs.oyinlola.site/learn/ts-types)
3. [34**Typing functions**Give functions parameter and return types, use optional, default and rest parameters, describe functions and callbacks as types, type async functions with Promise, and meet overloads.35 min](https://zudojs.oyinlola.site/learn/ts-functions)
4. [35**Interfaces, unions and literal types**Name object shapes with interfaces and type aliases, mark properties optional or readonly, extend and combine shapes, and model data that can take several forms with unions, literal types and discriminated unions.40 min](https://zudojs.oyinlola.site/learn/ts-objects)
5. [36**Generics**Write one function, interface or class that works for many types without losing type safety, set rules with constraints and keyof, give type parameters defaults, and build a Result type and a generic repository.35 min](https://zudojs.oyinlola.site/learn/ts-generics)
6. [37**Advanced and utility types**Build new types from existing ones with keyof, typeof, indexed access, mapped, conditional and template literal types, and use the built-in utility types (Partial, Pick, Omit, Record, ReturnType, Awaited and more) to keep one source of truth.45 min](https://zudojs.oyinlola.site/learn/ts-advanced)
7. [38**Classes in TypeScript**Declare typed class properties, use parameter properties and access modifiers, compare private with #private, write abstract classes and classes that implement interfaces, and wire classes together with constructor injection.40 min](https://zudojs.oyinlola.site/learn/ts-classes)
8. [39**Modules in TypeScript**Split a TypeScript project into files, import types with import type, see why verbatimModuleSyntax exists, write .js in import paths, and understand how NodeNext resolution, "type" - "module" and the "exports" field fit together.40 min](https://zudojs.oyinlola.site/learn/ts-modules)
9. [40**TypeScript and JavaScript together**See exactly what TypeScript becomes when it runs, why types cannot check outside data, and how to close that gap by hand with type guards, assertion functions and a validator that returns a Result.45 min](https://zudojs.oyinlola.site/learn/ts-runtime)

PART 6 Core

## Project: a TypeScript backend

Build a BookStore API with TypeScript and no framework, and feel the problems a framework exists to solve.

1. [41**"BookStore API: HTTP and routing"**Start a TypeScript backend with no framework at all. Set up the folder, read configuration from the environment, write a small typed router, JSON helpers and error responses, and serve books and authors over HTTP.45 min](https://zudojs.oyinlola.site/learn/bookstore-http)
2. [42**"BookStore API: validation and PostgreSQL"**Check every request body by hand with type guards, move the BookStore data into PostgreSQL with PGlite, write repositories with parameterized SQL, and map typed errors to 400, 404 and 409.50 min](https://zudojs.oyinlola.site/learn/bookstore-data)
3. [43**"BookStore API: authentication and tests"**Add users to the BookStore. Hash passwords with scrypt, issue signed log-in tokens with a secret from the environment, protect the order routes, test it all with node:test, and then look honestly at what this hand-built backend now gets wrong.50 min](https://zudojs.oyinlola.site/learn/bookstore-auth)

PART 7 Core

## Architecture and frameworks

Controllers, services, repositories and dependency direction, then what a framework actually does for you.

1. [44**Backend architecture**Give backend code a shape. Learn controllers, services, repositories, models and DTOs, middleware, dependency injection and configuration, the difference between domain, application and infrastructure code, and which way dependencies must point. Then refactor the BookStore's orders into those layers.45 min](https://zudojs.oyinlola.site/learn/backend-architecture)
2. [45**What a framework does**The difference between a library and a framework, inversion of control, and the jobs a backend framework takes over: lifecycle, dependency injection, routing, configuration, validation, database access, testing and application structure. Build a tiny framework to see how it works inside.30 min](https://zudojs.oyinlola.site/learn/frameworks)

PART 8 Core

## Meet ZudoJS

What ZudoJS is, your first ZudoJS code, and the Task API project you build for the rest of the course.

1. [46**Welcome to ZudoJS**What ZudoJS is, how its packages are layered, what each of its packages is for, what the zudojs command-line tool does, and the three application shapes it can create. Then run three ZudoJS packages together in your browser.25 min](https://zudojs.oyinlola.site/learn/zudo-welcome)
2. [47**Your first Zudo code**Install your first ZudoJS packages, check untrusted data at runtime with @zudojs/schema, and report failures with the ready-made errors in @zudojs/errors.35 min](https://zudojs.oyinlola.site/learn/zudo-first-code)
3. [48**Create the Task API project**Install the ZudoJS command-line tool, create the Task API project with flags or by answering its questions, start it in development, find your way around the files, use every CLI command, and build and run it for production.50 min](https://zudojs.oyinlola.site/learn/zudo-create-project)

PART 9 Core

## The ZudoJS core

The runtime and lifecycle, dependency injection, HTTP routing and middleware, configuration, validation and errors.

1. [49**The application runtime and lifecycle**Learn how the ZudoJS runtime starts the parts of your application in dependency order, rolls back when startup fails, reports readiness, and shuts everything down gracefully.45 min](https://zudojs.oyinlola.site/learn/zudo-runtime)
2. [50**Dependency injection with @zudojs/container**Let a container build and share your services. Learn tokens, class, factory and value providers, the singleton, scoped and transient lifetimes, circular dependency detection, disposal, and swapping real services for fakes in tests.40 min](https://zudojs.oyinlola.site/learn/zudo-container)
3. [51**Routes, requests and responses**Serve the Task API over HTTP with @zudojs/http. Start a server, add routes with parameters, read query strings, headers, cookies and JSON bodies safely, and answer with the right status codes.50 min](https://zudojs.oyinlola.site/learn/zudo-http)
4. [52**Middleware, CORS, security headers and graceful shutdown**Wrap every Task API route in middleware. Learn how a middleware pipeline runs, then add security headers, a CORS allow-list, rate limits with @zudojs/security, and a graceful shutdown that lets requests in progress finish.50 min](https://zudojs.oyinlola.site/learn/zudo-middleware)
5. [53**Configuration**Keep settings out of the code with @zudojs/config. Layer defaults, a config file and environment variables by priority, validate the result with a schema, keep secrets out of logs, and make the Task API's generated configuration stricter in production than in development.45 min](https://zudojs.oyinlola.site/learn/zudo-config)
6. [54**Schemas and validation in depth**Validate everything that crosses the Task API's boundary with @zudojs/schema. Read issues, coerce query strings, transform and refine values, block unknown fields, validate requests in routes and responses on the way out, and guard against hostile JSON with @zudojs/validation.50 min](https://zudojs.oyinlola.site/learn/zudo-validation)
7. [55**The ZudoJS error system**Handle failures the ZudoJS way. Tell expected errors from bugs, use and extend the error classes in @zudojs/errors, choose codes and categories, serialize errors safely for clients and fully for logs, and turn every error in the Task API into the right HTTP response.45 min](https://zudojs.oyinlola.site/learn/zudo-errors)

PART 10 Core

## Data

Databases, repositories and migrations, storage abstractions, and transactions.

1. [56**Databases with @zudojs/database**Connect the Task API to PostgreSQL through @zudojs/database, with migrations, seeds, a repository, a query builder, pagination, transactions and health checks, all running against real PostgreSQL.50 min](https://zudojs.oyinlola.site/learn/zudo-database)
2. [57**Storage abstractions**Use @zudojs/storage's driver-independent contracts for databases, files, serialization, locks, connection pools and start-up and shutdown, with a PostgreSQL adapter and local file storage for the Task API.Advanced45 min](https://zudojs.oyinlola.site/learn/zudo-storage)
3. [58**Transactions**Coordinate transactions across many functions with @zudojs/transactions, with context that follows your code through AsyncLocalStorage, rollbacks, savepoints, after-commit hooks, retries, timeouts and rollback-only state, against real PostgreSQL.Advanced45 min](https://zudojs.oyinlola.site/learn/zudo-transactions)

PART 11 Core

## Users and security

Passwords, JWTs and sessions, OAuth sign-in, permissions, and the security layer every public API needs.

1. [59**Authentication**Let users log in to the Task API. Hash passwords, issue and check JWTs, keep server-side sessions with a real logout, protect routes in @zudojs/http, and stop password guessing with lockouts and rate limits, using @zudojs/auth and @zudojs/crypto.55 min](https://zudojs.oyinlola.site/learn/zudo-auth)
2. [60**Sign in with OAuth**Add "Sign in with Google" to the Task API with @zudojs/auth-oauth. Learn the OAuth 2 authorization code flow, state and PKCE, the provider presets, and the callback, all tested offline against a stand-in provider.Advanced50 min](https://zudojs.oyinlola.site/learn/zudo-oauth)
3. [61**Permissions**Decide what each logged-in user may do with @zudojs/permissions. Roles, resource:action permissions, wildcards, role hierarchy, owner rules, deny rules, policies and explain mode, and the mistakes that let a normal user become an admin.45 min](https://zudojs.oyinlola.site/learn/zudo-permissions)
4. [62**Security for every public API**Protect the Task API from the open internet with @zudojs/security and the security helpers in @zudojs/http. Rate limiting, CORS, CSRF, security headers, HSTS and CSP, secure cookies, body limits, SSRF protection and input checks, each shown blocking a real attack.50 min](https://zudojs.oyinlola.site/learn/zudo-security)

PART 12 Advanced

## Events, messages and background work

Caching, events, messaging, CQRS, queues, scheduled jobs and serialization.

1. [63**Caching**Keep copies of slow results so the Task API can answer again fast. Learn keys, TTL, namespaces, tags and invalidation, stampede protection, locks and cache metrics with @zudojs/cache.Core40 min](https://zudojs.oyinlola.site/learn/zudo-cache)
2. [64**Events**Announce that something happened and let other parts of the Task API react, without the code that announces it knowing who listens. Handlers, wildcards, priorities, dispatch modes, middleware and handler errors with @zudojs/events.40 min](https://zudojs.oyinlola.site/learn/zudo-events)
3. [65**Messaging**Ask another part of the Task API to do something and get an answer back, without importing it. Messages, handlers, middleware, correlation and causation ids, timeouts and cancellation with @zudojs/messaging.35 min](https://zudojs.oyinlola.site/learn/zudo-messaging)
4. [66**Commands and queries (CQRS)**Split the Task API's operations into commands that change data and queries that only read it. Command and query buses, handlers, middleware, execution context, results, and when CQRS is worth it, with @zudojs/cqrs.40 min](https://zudojs.oyinlola.site/learn/zudo-cqrs)
5. [67**Background jobs**Move slow and unreliable work out of the request and into a job queue. Queues, jobs, processors, workers, concurrency, retries with exponential backoff, delayed jobs, dead letters and graceful shutdown with @zudojs/queue.45 min](https://zudojs.oyinlola.site/learn/zudo-queue)
6. [68**Scheduled tasks**Run work on the clock, not on a request. Intervals, one-off runs and cron expressions, time zones, retries and failed runs, overlapping runs, restarts, and running a schedule on one instance only, with @zudojs/scheduler.40 min](https://zudojs.oyinlola.site/learn/zudo-scheduler)
7. [69**Serialization**Turn values into text and back without losing what they were. See exactly what plain JSON loses, keep Dates, BigInts, Maps, Sets, bytes and Errors with @zudojs/serialization, add your own types, read untrusted input safely, and version your payloads with envelopes.35 min](https://zudojs.oyinlola.site/learn/zudo-serialization)

PART 13 Advanced

## APIs and services

Calling other services with RPC, one operation served over many transports, and OpenAPI documents generated from your code.

1. [70**Calling services with RPC**Call a function that runs in another service as if it were local. Define procedures with @zudojs/rpc, call them through a client and a transport, and handle validation, errors, identity, timeouts and retries.45 min](https://zudojs.oyinlola.site/learn/zudo-rpc)
2. [71**One operation, many transports**Write your business logic once as an operation with @zudojs/api, then run it from HTTP, RPC and a queue with the same validation, errors, interceptors and timeouts.45 min](https://zudojs.oyinlola.site/learn/zudo-api)
3. [72**OpenAPI documents**Describe the Task API in an OpenAPI document with @zudojs/openapi. Turn your schemas into components, choose between OpenAPI 3.0 and 3.1, validate the document, save it as JSON or YAML, and serve a documentation page.40 min](https://zudojs.oyinlola.site/learn/zudo-openapi)

PART 14 Core

## Testing and observability

Test a ZudoJS application end to end, log in a structured way, and see inside a running system with metrics and traces.

1. [73**Testing a ZudoJS app**Test the Task API with Vitest and @zudojs/testing. Control time with a test clock, replace services with mocks and recording buses, wire fakes through a test container, clean up in the right order, and run integration tests against a real HTTP server.45 min](https://zudojs.oyinlola.site/learn/zudo-testing)
2. [74**Structured logging**Replace console.log with structured log entries that a program can search. Levels, child loggers, request ids, request and error logging, secret redaction and JSON logs for production with @zudojs/logger.40 min](https://zudojs.oyinlola.site/learn/zudo-logging)
3. [75**Observability**See inside a running Task API. Metrics count what happens, traces show where the time goes, and logs, metrics and traces share one trace id across requests and services, with @zudojs/observability.Production45 min](https://zudojs.oyinlola.site/learn/zudo-observability)

PART 15 Advanced

## Platform features

Feature flags, multi-tenancy and plugins.

1. [76**Feature flags**Turn features on and off without deploying. Rules, evaluation context, percentage rollouts, A/B variants, kill switches and browser snapshots with @zudojs/feature-flags.40 min](https://zudojs.oyinlola.site/learn/zudo-feature-flags)
2. [77**Multi-tenancy**Serve many companies from one Task API without ever mixing their data. Tenant ids, resolvers and trust levels, resolver chains, AsyncLocalStorage context and tenant-scoped queries with @zudojs/tenancy.45 min](https://zudojs.oyinlola.site/learn/zudo-tenancy)
3. [78**Plugins**Let other code extend the Task API without editing it. Write plugins, declare dependencies, run their lifecycle, give each one a scoped context, roll back failed starts, read diagnostics and publish a plugin to npm with @zudojs/plugins.45 min](https://zudojs.oyinlola.site/learn/zudo-plugins)

PART 16 Advanced

## Architecture with ZudoJS

From one application to a modular monolith, then to microservices, with the communication tools ZudoJS already has.

1. [79**From monolith to modular monolith**Split one growing application into modules with clear boundaries. Each module has a small public API, owns its data, and talks to the others through that API, events and commands, all inside one deployable app.45 min](https://zudojs.oyinlola.site/learn/zudo-modular-monolith)
2. [80**Microservices**Why some teams split one application into many services, why you should not start that way, and how services find and call each other, stay consistent without distributed transactions, survive failures and stay observable.55 min](https://zudojs.oyinlola.site/learn/zudo-microservices)

PART 17 Production

## Production

Production engineering, deployment with Docker, the ShopFlow capstone, and the final challenge.

1. [81**Production engineering**What changes when real users depend on your app. A checklist for configuration, secrets, logs, metrics, traces, health and readiness checks, graceful shutdown, timeouts, rate limits, caching and database performance, with a small runnable proof for each item.55 min](https://zudojs.oyinlola.site/learn/production-engineering)
2. [82**Deploying a ZudoJS app**Take the Task API from your computer to a server. Build it for production, run it under systemd or in Docker, add PostgreSQL and Redis with Docker Compose, put Caddy in front for HTTPS, run migrations during a deployment, read the logs and back up the database.60 min](https://zudojs.oyinlola.site/learn/deployment)
3. [83**Capstone: ShopFlow**The final project. Plan and build ShopFlow, a small online shop, with ZudoJS. A complete, runnable core for accounts, products and a checkout that never oversells, followed by milestones with acceptance criteria that take it to a modular monolith and then to services.120 min](https://zudojs.oyinlola.site/learn/capstone-shopflow)
4. [84**Final production challenge**Someone else's gift-card feature works in the demo and fails everything else. Find its architectural problems, then make it production-ready step by step, with acceptance criteria, hints and worked solutions for the key fixes.120 min](https://zudojs.oyinlola.site/learn/final-challenge)
