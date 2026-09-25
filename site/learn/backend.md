---
title: "Backend engineering — ZudoJS Academy"
description: "How backends work, framework-free: HTTP in depth, typed Node.js, the BookStore API in TypeScript with PostgreSQL and authentication, layered API design, testing strategies, and the building blocks every backend needs: caches, queues and file storage."
source: https://zudojs.oyinlola.site/learn/backend
---

LEVEL 7 · BACKEND ENGINEERING

Course Core

# Backend engineering

How backends work, framework-free: HTTP in depth, typed Node.js, the BookStore API in TypeScript with PostgreSQL and authentication, layered API design, testing strategies, and the building blocks every backend needs: caches, queues and file storage.

- **15 lessons**
- **12 h** to read and try
- **Before this:** [TypeScript](https://zudojs.oyinlola.site/learn/typescript), [JavaScript in the browser and on the server](https://zudojs.oyinlola.site/learn/javascript-platforms)

0 of 15 lessons done

[Start lesson 1 →](https://zudojs.oyinlola.site/learn/http-deep)

## When you finish, you can

- Read and write raw HTTP and explain every part of a request and response
- Build a typed HTTP API with controllers, services, repositories and DTOs
- Store data in PostgreSQL with parameterized SQL
- Test a backend at the unit, integration and end-to-end level
- Explain when to add a cache, a queue or object storage, and what each costs

**You build:** The BookStore API: a TypeScript backend with PostgreSQL, authentication and tests, built without a framework

MODULE 1

## HTTP and REST

1. [1**HTTP in depth**See the exact bytes of an HTTP request and response, then learn the headers, content types, cookies, methods and status codes every backend relies on.40 min](https://zudojs.oyinlola.site/learn/http-deep)
2. [2**Designing a REST API**Design the Task API as a REST API: resource URLs, a written contract, filtering and sorting, offset and cursor pages, versions and one error format.40 min](https://zudojs.oyinlola.site/learn/rest-design)

MODULE 2

## Databases and SQL

1. [3**How databases work**Why a backend needs a database, and how tables, keys, relationships, constraints, indexes, transactions and migrations work, on real PostgreSQL in Node.js.45 min](https://zudojs.oyinlola.site/learn/databases)
2. [4**SQL with PostgreSQL**Run PostgreSQL with an installer or Docker, use psql, and write everyday SQL: insert, select, update, delete, and placeholders that stop SQL injection.45 min](https://zudojs.oyinlola.site/learn/sql-basics)
3. [5**Joins, grouping and transactions**Join tables, summarise them with group by and having, nest queries, run transactions by hand, measure with explain analyze, and connect Node.js to PostgreSQL.45 min](https://zudojs.oyinlola.site/learn/sql-advanced)

MODULE 3

## Testing

1. [6**Testing fundamentals**Test a backend with Node's built-in runner: unit, integration and end-to-end tests, assertions, mocks and spies, isolated tests and a fresh test database.45 min](https://zudojs.oyinlola.site/learn/testing-basics)

MODULE 4

## TypeScript on the server

1. [7**TypeScript on Node.js**Type Node.js with @types/node: typed env vars, files, HTTP, buffers, streams, events, child processes and signals, so the compiler catches server bugs early.50 min](https://zudojs.oyinlola.site/learn/ts-node)
2. [8**"BookStore API: HTTP and routing"**Start a TypeScript backend with no framework: a project folder, checked configuration, a typed router, JSON helpers and error responses for books and authors.45 min](https://zudojs.oyinlola.site/learn/bookstore-http)
3. [9**"BookStore API: validation and PostgreSQL"**Check BookStore request bodies with type guards, move the data into PostgreSQL, write repositories with parameterized SQL, and map errors to 400, 404 and 409.50 min](https://zudojs.oyinlola.site/learn/bookstore-data)
4. [10**"BookStore API: authentication and tests"**Add users to the BookStore: scrypt password hashes, signed log-in tokens, protected order routes and node:test tests, then an honest review of what still hurts.50 min](https://zudojs.oyinlola.site/learn/bookstore-auth)
5. [11**Type-safe API layers**Refactor the BookStore into typed layers: entities, DTOs, mappers, controllers, services and repositories, with typed errors, cursor paging and role checks.60 min](https://zudojs.oyinlola.site/learn/ts-api-layers)

MODULE 5

## Testing strategies

1. [12**Testing strategies**Plan the tests for a checkout: unit, integration and e2e tests, test doubles, fixtures, isolation, contract, property-based, load and security tests.60 min](https://zudojs.oyinlola.site/learn/testing-strategies)

MODULE 6

## Backend building blocks

1. [13**Caching**Build a cache from scratch: cache-aside with TTL, invalidation on writes, stampede protection, stale-while-revalidate, hit-rate metrics and what to cache.50 min](https://zudojs.oyinlola.site/learn/backend-caching)
2. [14**Queues and background jobs**Move slow, fragile work out of the request: a job queue with retries, backoff, dead letters, at-least-once delivery, idempotent consumers and an outbox.55 min](https://zudojs.oyinlola.site/learn/backend-queues)
3. [15**File uploads and storage**Accept uploads safely with node:http: stream multipart bodies to disk, enforce size limits, sniff real content types and serve files through signed URLs.55 min](https://zudojs.oyinlola.site/learn/backend-files)

## Course checkpoint

Prove you can move on. The checkpoint picks 20 questions at random from every lesson in this course. Get 16 right to pass. Your result is saved in this browser only.
