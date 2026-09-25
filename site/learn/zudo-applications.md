---
title: "ZudoJS application development — ZudoJS Academy"
description: "Build real applications: data architecture, transactions, storage and file uploads, cryptography, authentication, OAuth, permissions and the security layer, caching, and type-safe application design."
source: https://zudojs.oyinlola.site/learn/zudo-applications
---

LEVEL 13 · ZUDOJS

Course Core

# ZudoJS application development

Build real applications: data architecture, transactions, storage and file uploads, cryptography, authentication, OAuth, permissions and the security layer, caching, and type-safe application design.

- **12 lessons**
- **10 h** to read and try
- **Before this:** [ZudoJS fundamentals](https://zudojs.oyinlola.site/learn/zudo-fundamentals)

0 of 12 lessons done

[Start lesson 1 →](https://zudojs.oyinlola.site/learn/zudo-database)

## When you finish, you can

- Secure a public API with @zudojs/security
- Authenticate users with passwords, sessions, JWTs and OAuth
- Authorise actions with roles, attributes and resource rules
- Persist data with repositories, migrations and transactions
- Store files and cache hot data
- Design the whole application with end-to-end types, from DTOs to events

**You build:** The Task API with users, roles, PostgreSQL, uploads, caching and a typed billing module

MODULE 1

## Data

1. [1**Databases with @zudojs/database**Connect the Task API to real PostgreSQL with @zudojs/database: migrations, seeds, a repository, a query builder, pagination, transactions and health checks.50 min](https://zudojs.oyinlola.site/learn/zudo-database)
2. [2**Data architecture with ZudoJS**Design the Task API's data layer with @zudojs/database: entities and DTOs, repositories, query services, keyset pagination, indexes and safe concurrent writes.55 min](https://zudojs.oyinlola.site/learn/zudo-data-architecture)
3. [3**Storage abstractions**Use @zudojs/storage's driver-independent contracts for files, serialization, locks and pools, with local file storage and a health report for the Task API.Advanced45 min](https://zudojs.oyinlola.site/learn/zudo-storage)
4. [4**Transactions**Coordinate transactions across functions with @zudojs/transactions: propagation via AsyncLocalStorage, savepoints, after-commit hooks, retries and timeouts.Advanced45 min](https://zudojs.oyinlola.site/learn/zudo-transactions)
5. [5**"Project: a file upload system"**Build task attachments with @zudojs/http and @zudojs/storage: size limits, sniffed content types, safe keys, metadata, fenced locks and failure recovery.60 min](https://zudojs.oyinlola.site/learn/zudo-file-uploads)

MODULE 2

## Security and identity

1. [6**Cryptography with @zudojs/crypto**Use @zudojs/crypto for random ids, tokens, hashes, HMAC, password hashing, AES-GCM encryption with key ids and constant-time checks, building reset tokens.55 min](https://zudojs.oyinlola.site/learn/zudo-crypto)
2. [7**Authentication**Let users log in to the Task API: hash passwords, issue JWTs, keep sessions with real logout, protect routes, and stop guessing with lockouts and limits.55 min](https://zudojs.oyinlola.site/learn/zudo-auth)
3. [8**Sign in with OAuth**Add Sign in with Google to the Task API with @zudojs/auth-oauth: the OAuth 2 code flow, state and PKCE, provider presets, tested offline.Advanced50 min](https://zudojs.oyinlola.site/learn/zudo-oauth)
4. [9**Permissions**Decide what each logged-in user may do with @zudojs/permissions: roles, wildcards, hierarchy, owner and deny rules, policies, and stopping privilege escalation.45 min](https://zudojs.oyinlola.site/learn/zudo-permissions)
5. [10**Security for every public API**Protect the Task API from the open internet with @zudojs/security: rate limiting, CORS, CSRF, security headers, secure cookies, body limits, SSRF checks.50 min](https://zudojs.oyinlola.site/learn/zudo-security)

MODULE 3

## Caching

1. [11**Caching**Keep copies of slow results so the Task API answers fast: keys, TTL, namespaces, tags, invalidation, stampede protection, locks and metrics.40 min](https://zudojs.oyinlola.site/learn/zudo-cache)

MODULE 4

## Type-safe application design

1. [12**Type-safe application design**Design a billing module for the Task API where ids, money, states, DTOs, commands, queries, events, errors, config and DI are all checked by TypeScript.60 min](https://zudojs.oyinlola.site/learn/zudo-typed-design)

## Course checkpoint

Prove you can move on. The checkpoint picks 20 questions at random from every lesson in this course. Get 16 right to pass. Your result is saved in this browser only.
