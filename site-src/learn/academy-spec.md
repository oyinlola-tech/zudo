# ZudoJS Academy — lesson specification

The curriculum behind `course.json`. Each new lesson lists what it must cover.
Existing lessons (marked *existing*) stay at their URLs; the notes say what to
adjust so they fit the academy. Sources: the three outlines the user supplied on
2026-09-24 (JavaScript mastery, TypeScript, ZudoJS), merged and deduplicated.

## Teaching rules for every lesson

- Teach through problems, not definitions. For every tool: the problem, why it
  exists, the general engineering solution, the implementation, (for ZudoJS:
  the ZudoJS abstraction), a real application, failure cases, testing, and
  production concerns.
- Every lesson has at least one `<reason>` block (the continuous reasoning
  track): the learner thinks through inputs, edge cases, what can fail, what
  can be trusted, before seeing code. Backend lessons ask questions like "What
  happens if the second database write fails? Can the request arrive twice?"
- Real-world examples: shops, banks and transfers (₦ amounts are welcome),
  tasks, bookings, inventories, users and permissions. No foo/bar.
- Every output shown is real (produced by the checker), never typed by hand.

## Level 1 — Programming thinking (`programming-thinking`)

Start here: welcome, dev-environment, how-programs-run, how-the-web-works (*existing*).
- **think-programming** — What programming is: program, instruction, algorithm, programming language, source code vs machine execution, compiler vs interpreter, runtime, input → processing → output. The problem-solving loop: understand → break down → inputs → outputs → design steps → implement → test → improve. Tiny runnable JS only to show IPO.
- **think-decomposition** — Problem decomposition: "Build a banking application" → users, accounts, authentication, deposits, withdrawals, transfers, transactions, notifications; break "transfer" down further, until each piece is one clear step. Top-down vs bottom-up, dependency between pieces.
- **think-algorithms** — Algorithms: definition and properties (finite, precise, input, output), sequential, conditional and repetitive algorithms; searching, sorting, counting, filtering, transformation in everyday terms, then as tiny JS.
- **think-pseudocode** — Pseudocode (START/IF/ELSE/END conventions, the withdrawal example) and flowcharts (start/end, process, decision, input/output, loops, branches). Draw with text/SVG diagrams in HTML; translate pseudocode into JS.
- **think-reasoning** — Logical reasoning: what do I know, what don't I know, assumptions, conditions that must be true, what if false, boundaries, what could go wrong, can I prove it works. Edge-case tables; invariants; test cases derived from reasoning.
- **logic-boolean** — Boolean logic: true/false, AND, OR, NOT, XOR; truth tables; building truth tables with JS loops.
- **logic-conditions** — Conditional reasoning: turn rules ("withdraw only if active AND balance >= amount AND not locked") into logic; De Morgan's laws; simplifying and inverting conditions; guard clauses as negated conditions.
- **logic-sets** — Sets: membership, union, intersection, difference, subsets, with JavaScript `Set` (including the ES2025 set methods if present in Node 24 and Chromium — verify) and real uses (permissions, tags, dedupe).
- **logic-math** — Mathematical reasoning: variables, expressions, functions, equations, inequalities, ratios, percentages (discounts, VAT, interest), rounding money correctly (integer kobo/cents), floating-point surprises.
- **logic-sequences** — Sequences: patterns, arithmetic and geometric sequences, growth (linear vs exponential, compound interest), recurrence relations, computing them with loops.
- **logic-counting** — Counting: counting objects, frequency tables, the multiplication principle, permutations and combinations, why brute force explodes; small JS programs that count.
- **solve-beginner** — Beginner problem workshop, each reasoned first then coded: even or odd, largest of three, temperature conversion, grade calculator, password checker, age calculator, discount calculator, ATM withdrawal, shopping cart total, tax calculator.
- **solve-intermediate** — Intermediate workshop: duplicate detection, frequency counting, searching, filtering, grouping, pagination, ranking, inventory calculation.
- **solve-broken** — "Why doesn't this work?": broken algorithms (off-by-one, wrong condition order, missing base case, mutation during iteration, float comparison), found by reasoning and tracing, not by syntax.

## Level 2 — JavaScript fundamentals (`javascript`)

- **js-intro** — JavaScript's history and ecosystem: ECMAScript, TC39 and the proposal stages, yearly versions, engines (V8, SpiderMonkey, JavaScriptCore), browser vs Node.js; first program; syntax: statements vs expressions, comments, semicolons and ASI traps, whitespace, naming conventions.
- setup, js-values (*existing*).
- **js-types-deep** — Beyond primitives: all 7 primitives incl. BigInt and Symbol briefly; the object types (objects, arrays, functions, Date, Map, Set, WeakMap, WeakSet, RegExp, Error) as a map of the language; primitive vs reference values, mutability, identity, equality (`===`, `==`, `Object.is`), type coercion rules and tables.
- js-scope (*existing*; covers let/const/var, hoisting, TDZ, call stack).
- js-operators (*existing*; make sure bitwise, unary, relational, `in`, `delete`, `void`, `new`, `typeof`, `instanceof` and precedence are covered — extend if missing).
- js-conditions, js-loops (*existing*; loops should mention labels).
- js-functions (*existing*).
- **js-closures** — Closures in depth: lexical environments, closures as private state (counters, bank account), closures in loops (`var` vs `let`), factories, memoization, closures and memory (what they keep alive).
- **js-recursion** — Recursion: base case and recursive case, the call stack during recursion, recursion over nested data (folder trees, comments, org charts), stack overflow, turning recursion into iteration.
- js-arrays, js-data (*existing*).
- **js-objects-deep** — Objects in depth: creation forms, computed properties, shorthand, destructuring and spread/rest on objects, property descriptors, `Object.defineProperty`, getters and setters, `Object.freeze/seal/preventExtensions`, shallow vs deep copies, `structuredClone`, object identity.
- js-modern, js-classes, js-errors, js-modules, js-async (*existing*).

## Level 3 — Algorithms and data structures (`algorithms`)

Each lesson: implement in JavaScript, test with assertions, state complexity.
- **dsa-complexity** — Big O, Big Ω, Big Θ; time and space complexity; best, average, worst case; O(1), O(log n), O(n), O(n log n), O(n²), O(2ⁿ) with measured timings; "what is the complexity of this code?" exercises; amortized cost of `push`.
- **dsa-arrays-strings** — How arrays and strings behave: indexing cost, insert/delete in the middle, `shift` cost, immutable strings and building strings, common array/string problems (reverse, palindrome, anagram, rotate).
- **dsa-hash-maps** — Hash tables: hashing, buckets, collisions, load factor; implement a simple one; `Map` vs object; sets; typical uses (lookup, counting, dedupe, two-sum).
- **dsa-stacks-queues** — Stacks and queues: implementation, undo/redo, balanced brackets, a job queue, why `Array.shift` makes a slow queue, a ring buffer / two-stack queue, deque.
- **dsa-linked-lists** — Singly and doubly linked lists: insert, delete, reverse, detect a cycle; when a linked list beats an array (an LRU cache).
- **dsa-trees** — Trees and binary trees: terminology, traversals (pre/in/post/level order), binary search trees (insert, search, delete), balanced vs unbalanced, real trees (DOM, file systems, categories).
- **dsa-heaps** — Heaps and priority queues: array representation, sift up/down, heap sort, top-k, a priority job queue, merging sorted lists.
- **dsa-graphs** — Graphs: vertices, edges, directed/undirected, weighted; adjacency list vs matrix; modelling (social networks, routes, package dependencies); topological sort for dependency ordering.
- **dsa-tries** — Tries: prefix trees, autocomplete, prefix counts, memory trade-offs.
- **dsa-searching** — Linear search and binary search (iterative and recursive), bugs in binary search, searching sorted data, lower/upper bound.
- **dsa-sorting** — Bubble, selection, insertion, merge and quick sort; stability; `Array.prototype.sort` (comparators, stability, `toSorted`), sorting objects by several keys, complexity comparison with measurements.
- **dsa-divide-conquer** — Divide and conquer: merge sort revisited, quickselect, fast power, recursion trees, the master theorem intuition.
- **dsa-graph-search** — Breadth-first and depth-first search: shortest path in unweighted graphs, connected components, cycle detection, maze solving, Dijkstra introduction.
- **dsa-greedy** — Greedy algorithms: making change (and when greedy fails), interval scheduling, activity selection, proving greedy choices.
- **dsa-backtracking** — Backtracking: permutations, subsets, combinations, N-queens / sudoku, pruning.
- **dsa-dynamic-programming** — Dynamic programming: overlapping subproblems, memoization vs tabulation, Fibonacci, coin change, longest common subsequence, knapsack, space optimisation.
- **pattern-frequency** — Frequency counter pattern (anagram, first unique character, majority element). Every pattern lesson: problem → naive solution → its problem → pattern → improved solution → complexity → new problems.
- **pattern-two-pointers** — Two pointers and fast/slow pointers: pair sum in sorted array, remove duplicates, container with most water, cycle detection, middle of a list.
- **pattern-sliding-window** — Sliding window and prefix sums: max sum subarray of size k, longest substring without repeats, subarray sums, range queries.
- **pattern-binary-search** — Binary search as a pattern: search on the answer, first/last position, rotated arrays, minimum capacity problems.
- **pattern-practice** — Mixed practice: pick the pattern for 10+ problems, reason about it, solve, analyse complexity; interview-style walkthroughs.

## Level 4a — Advanced JavaScript (`javascript-advanced`)

- **js-this** — `this` in every kind of call: method, plain function, strict mode, arrow functions, `call/apply/bind`, callbacks losing `this`, class methods, event handlers.
- **js-prototypes** — The prototype chain, `Object.prototype`, `Object.create`, constructor functions and `new` (what `new` does step by step), `instanceof`, what `class` becomes conceptually.
- **js-composition** — Inheritance vs composition: fragile base classes, mixins, delegation, composing behaviour with functions and objects; private fields, static members, getters/setters revisited in design.
- **js-strings** — String in depth: methods, template literals, Unicode, UTF-16 code units vs code points vs grapheme clusters (`Intl.Segmenter`), normalization, emoji length, `localeCompare`, `Intl` formatting.
- **js-numbers** — Number in depth: IEEE-754, precision (0.1 + 0.2), `Number.EPSILON`, safe integers, `Math`, rounding, `toFixed` pitfalls, BigInt, money handling, `Intl.NumberFormat`.
- **js-collections** — Map, Set, WeakMap, WeakSet (and WeakRef briefly): when each fits, iteration order, keys by identity, caches keyed by objects, set operations.
- **js-dates** — Date in depth: timestamps, time zones, UTC vs local, parsing pitfalls, `Intl.DateTimeFormat`, date arithmetic, storing dates in APIs; the Temporal API (use it only if available in Node 24 and Chromium at check time — otherwise explain it without runnable examples).
- **js-regexp** — Regular expressions: syntax, flags, groups, named groups, lookarounds, `matchAll`, `replace` with functions, validating vs parsing, catastrophic backtracking (ReDoS).
- **js-iterators** — Iterables and iterators: the iterator protocol, `Symbol.iterator`, `for...of` under the hood, spread and destructuring use it, custom iterators (a range, a paginated list), iterator helpers if available.
- **js-generators** — Generator functions, `yield`, generator objects, lazy sequences, infinite sequences, `yield*` delegation, `return`/`throw`, async generators preview.
- **js-symbols** — Symbols: uniqueness, description, global registry, well-known symbols (`Symbol.iterator`, `Symbol.toPrimitive`, `Symbol.toStringTag`, `Symbol.asyncIterator`), custom protocols.
- **js-functional** — Functional techniques: pure functions, side effects, immutability, first-class and higher-order functions, composition and pipelines, currying, partial application, point-free style used sensibly.
- **js-promises** — Promises in depth: callbacks and callback hell, promise states, resolution vs fulfilment, chaining, returning promises from `then`, error propagation, thenables, promisifying callback APIs.
- **js-promise-combinators** — `Promise.all`, `allSettled`, `race`, `any`, `Promise.withResolvers`; timeouts; running tasks in parallel vs in sequence; batching.
- **js-event-loop** — The event loop: call stack, task (macrotask) queue, microtask queue, job ordering puzzles, `queueMicrotask`, `setTimeout(0)`, `setImmediate` vs `process.nextTick` in Node, starving the loop.
- **js-concurrency** — Concurrency vs parallelism, scheduling, limiting concurrency (a pool), cancellation with `AbortController`/`AbortSignal` (`AbortSignal.timeout`, `any`), cancelling fetches and timers, race conditions in async code.
- **js-execution** — How JavaScript runs: parsing, compilation (JIT) at a conceptual level, execution contexts, the call stack, the heap, the relationship to the event loop and host APIs; stack traces.
- **js-memory** — Memory: stack vs heap, references, garbage collection and reachability, memory leaks (globals, timers, listeners, closures, caches), WeakMap/WeakRef/FinalizationRegistry, measuring memory with `process.memoryUsage()` and heap snapshots.
- **js-error-design** — Designing error handling: error propagation, causes (`{ cause }`), `AggregateError`, recoverable vs unrecoverable errors, which layer handles which error, error boundaries at program edges, never swallowing errors.
- **js-module-systems** — Module systems in depth: ESM vs CommonJS, `require` and `module.exports`, interop in Node, dynamic `import()`, module resolution (relative, bare, `exports` field), top-level await, circular dependencies and how each system behaves.

## Level 4b — JavaScript in the browser and on the server (`javascript-platforms`)

Browser lessons use `runtime="dom"` examples (see the brief).
- **browser-dom** — The DOM: document, nodes vs elements, selectors, traversing, creating, updating and removing elements, attributes vs properties, `textContent` vs `innerHTML` (XSS), `DocumentFragment`, templates; build a task list UI.
- **browser-events** — Events: listeners, the event object, bubbling and capturing, `stopPropagation`, `preventDefault`, event delegation, custom events, forms and input events, removing listeners.
- **browser-apis** — Browser APIs: `fetch` (against local data), Storage (`localStorage`/`sessionStorage`), `URL`/`URLSearchParams`, History API, timers, `requestAnimationFrame`, Web Workers overview, what "Web APIs" are.
- **browser-networking** — Networking from JavaScript: HTTP from the browser, request lifecycle, headers, JSON, cookies (and why JS can't read HttpOnly), CORS and preflight, same-origin policy, credentials; Browser → API → Server with the Task API.
- **browser-realtime** — Real-time and background: WebSockets, Server-Sent Events, Web Workers (message passing), when to use which; a Node server side for each.
- node-runtime, node-apis, node-streams (*existing*).
- **node-events-processes** — EventEmitter, child processes (`spawn`, `exec`, `execFile`), worker threads, signals (SIGINT, SIGTERM), `process` events, the `os` module.
- **node-crypto** — `node:crypto`: hashes, HMAC, secure random values and UUIDs, `scrypt` password hashing, AES-GCM encryption, `timingSafeEqual`; which to use when.
- node-http, node-task-api, npm-packages (*existing*).
- **npm-ecosystem** — The npm ecosystem: semantic versioning in depth, ranges, lockfiles and `npm ci`, dependencies vs devDependencies vs peer, npm scripts, scopes, local packages, workspaces and monorepos, publishing a package, supply-chain security (`npm audit`, provenance, typosquatting).
- **js-tooling** — Tooling and why each category exists: linters (ESLint), formatters (Prettier), bundlers, transpilers, source maps, environment configuration (`--env-file`), package scripts, editor integration.
- **debug-method** — The debugging method: observe → reproduce → isolate → hypothesize → test → fix → verify; reading stack traces; logging well; minimal reproductions.
- **debug-tools** — Debugging tools: breakpoints, step over/into/out, watch expressions, inspecting objects, `node --inspect` with Chrome DevTools/VS Code, the browser debugger, network inspection, source maps.
- **debug-practice** — Debugging practice: binary-search debugging (and `git bisect`), root cause analysis, async bugs, "works on my machine" bugs; several full bug hunts.
- git (*existing*).
- **git-collaboration** — Professional Git: pull requests, code review (giving and receiving), merge vs rebase, resolving conflicts, issues, releases and tags, semantic versioning, changelogs, contributing to open source.

## Level 5 — TypeScript (`typescript`)

- ts-setup (*existing*: the JavaScript problem, installing, tsconfig).
- **ts-compiler** — What TypeScript actually is: superset, static type checking, compile time vs runtime, type erasure, transpilation, `tsc` output, `--noEmit`, watch mode, Node 24 type stripping and its limits, package scripts; why TS does not replace runtime validation.
- ts-types (*existing*).
- **ts-inference** — Inference: inferred vs annotated, literal inference, widening (`let` vs `const`), contextual typing, when annotations help (function boundaries, public APIs), `string` vs `String`.
- ts-functions, ts-objects (*existing*).
- **ts-unions** — Unions, literal types, intersections and discriminated unions in depth: modelling states (`pending | approved | rejected`), `Result` types, exhaustive checks with `never`, common union mistakes.
- **ts-aliases-interfaces** — Type aliases and interfaces: reusable domain types, extension, declaration merging, recursive types, the actual differences, when each fits.
- **ts-special-types** — any, unknown, never, void, object, {} and Object: what each means, why uncontrolled `any` destroys safety, `unknown` at boundaries.
- **ts-narrowing** — Narrowing: typeof, instanceof, equality, truthiness (and its traps), `in`, discriminants, control-flow analysis, custom type guards (`value is User`), assertion functions (`asserts value is User`).
- **ts-assertions** — Type assertions: `as`, angle-bracket form, double assertions, non-null `!`, why assertions never convert or validate, when they are justified, when they signal poor design; `const request.body as User` is unsafe.
- **ts-enums** — Enums and alternatives: numeric, string and const enums, what JavaScript they compile to, reverse mappings, pitfalls, `erasableSyntaxOnly`, literal unions and `as const` objects as alternatives.
- **ts-tuples** — Tuples: fixed-length arrays, optional and rest elements, readonly tuples, named elements, tuple inference, returning tuples (`useState`-style).
- ts-generics (*existing*).
- **ts-generic-design** — Designing generic APIs: generic interfaces, classes and defaults, constraints with `keyof`, building reusable `Repository<T>`, `Result<T, E>`, `Page<T>`, `ApiResponse<T>`, `Cache<K, V>` and typed events.
- ts-classes, ts-modules (*existing*).
- **ts-tsconfig** — tsconfig in depth: target, module, moduleResolution, lib, strict and every strict flag, noUncheckedIndexedAccess, exactOptionalPropertyTypes, useUnknownInCatchVariables, noImplicitOverride, allowJs/checkJs, declaration, sourceMap, outDir/rootDir, paths, verbatimModuleSyntax; why each exists.
- ts-runtime (*existing*).
- **ts-validation** — Runtime validation: `const body: User = req.body` validates nothing; hand-written validators; Zod, Valibot and JSON Schema (via a validator) compared; inferring types from schemas; compile-time vs runtime safety.
- **ts-errors** — Typed error handling: `unknown` in catch, custom error subclasses, error narrowing, `Result` patterns and discriminated error results, async errors; project: a typed application error system.
- **ts-async** — Async TypeScript: `Promise<T>`, typing async functions, typing combinators (`Promise.all` tuples), `Awaited`, async iterators and generators with types.

## Level 6 — Advanced TypeScript (`typescript-advanced`)

- ts-advanced (*existing*, stays in Level 5 as the overview of type operators).
- **ts-type-operators** — keyof, typeof, indexed access `T[K]`, `typeof arr[number]`; deriving types from existing values and structures.
- **ts-utility-types** — Partial, Required, Readonly, Pick, Omit, Record, Exclude, Extract, NonNullable, ReturnType, Parameters, ConstructorParameters, InstanceType, Awaited, ThisType; recreate simplified versions.
- **ts-mapped-types** — Mapped types: modifiers (+/- readonly, ?), key remapping with `as`, filtering keys, nested mapped types; project: a type-safe configuration system.
- **ts-conditional-types** — Conditional types: `T extends U ? X : Y`, distributive behaviour and how to stop it, `infer`, nested conditionals, `Unwrap<Promise<Promise<User>>>`.
- **ts-template-literals** — Template literal types: string unions, combinations, `Uppercase` etc., key generation, route typing, event names, permission strings; project: a compile-time safe event name system.
- **ts-inference-deep** — Advanced inference: generic inference, contextual typing, return and parameter inference, const type parameters, `satisfies` vs `as`, `as const`, deriving unions from arrays (`typeof roles[number]`).
- **ts-advanced-functions** — Overloads, call and construct signatures, `this` parameters, callable objects, variadic tuple types, callback compatibility and parameter bivariance; project: a type-safe command router.
- **ts-oop** — Object-oriented TypeScript: encapsulation, abstraction, inheritance, polymorphism, interfaces, composition, dependency inversion; OOP vs functional design and when each fits.
- **ts-functional** — Functional TypeScript: pure functions, immutability (`readonly`, `ReadonlyArray`), composition, Option and Result types, algebraic data types, referential transparency.
- **ts-type-system** — The type system in depth: structural typing, type compatibility, variance (covariance, contravariance, `in`/`out` annotations), recursive and recursive conditional types, type-level computation, knowing when a clever type is a bad type.
- **ts-branded-types** — Branded and nominal types: `UserId` vs `OrderId`, smart constructors, validating on creation, units (kobo vs naira).
- **ts-domain-modeling** — Type-safe domain modelling: users, orders, payments, products, permissions, roles, events and transactions; making illegal states unrepresentable; project: a typed commerce domain.
- **ts-typed-events** — A type-safe event system: an event map, `emit(name, payload)` checked per event, typed listeners, wildcard limits; prepares for @zudojs/events.
- **ts-typed-cqrs** — Type-safe CQRS: commands, queries, handlers and results; a generic command bus and query bus.
- **ts-typed-di** — A type-safe dependency injection container: tokens, providers, factories, lifetimes (singleton, scoped, transient), and the limits of compile-time types in DI.
- **ts-decorators** — Decorators: TC39 standard decorators (class, method, field, accessor, `context.metadata`) vs the old `experimentalDecorators`/`emitDecoratorMetadata`, runtime behaviour, why frameworks use them.
- **ts-declarations** — Declaration files: `.d.ts`, ambient and global declarations, `declare module`, typing a JavaScript library, `@types` packages, module augmentation, generating declarations.
- **ts-publishing** — Publishing TypeScript packages: package.json `exports`/`types`/`files`, ESM and CommonJS, dual packages, declaration output, source maps, semver, `npm pack` and publishing.
- **ts-monorepos** — TypeScript monorepos: npm and pnpm workspaces, package boundaries, shared types, internal packages, project references, build graphs, dependency management.
- **ts-testing** — Testing TypeScript: unit and integration tests with Vitest, testing generics and error paths, type-level tests (`expectTypeOf`, `@ts-expect-error`, "should compile / should fail").
- **ts-debugging** — Debugging TypeScript: reading type errors, hover and `tsc --explainFiles`/`--traceResolution`, generic inference problems, module and build problems, runtime vs type bugs.
- **ts-performance** — Compiler performance: `--extendedDiagnostics`, incremental builds, project references, type complexity, deep recursive types, `skipLibCheck`, declaration generation cost.

## Level 7 — Backend engineering (`backend`)

- http-deep, rest-design, databases, sql-basics, sql-advanced, testing-basics (*existing*; they come after TypeScript now, so references to "earlier" lessons may need fixing).
- **ts-node** — TypeScript on Node.js: `@types/node`, typed env vars, `fs`, `http`, streams, buffers, events, processes, signals and child processes in TypeScript.
- bookstore-http, bookstore-data, bookstore-auth (*existing*).
- **ts-api-layers** — Type-safe API architecture: request/response types, DTOs vs entities (`User` vs `CreateUserDTO` vs `UpdateUserDTO`), controllers, services, repositories, mappers, error responses, pagination, authentication and authorization, dependency inversion — the BookStore refactored.
- **testing-strategies** — Testing strategies: unit, integration, end-to-end; mocks, spies, stubs, fakes, fixtures; test isolation; contract testing; property-based testing (fast-check); load testing basics; security testing basics.
- **backend-caching** — Caching concepts without a framework: why caches exist, cache-aside, TTL, invalidation, stampedes, locks, what to cache, measuring hit rate.
- **backend-queues** — Queues, background jobs, events and messaging concepts without a framework: producers, consumers, retries, at-least-once delivery, idempotent consumers.
- **backend-files** — File storage: uploads, multipart, streaming to disk, size limits, content types, object storage concepts (S3-style), signed URLs, file metadata.

## Level 8 — Database engineering (`database-engineering`)

- Builds on databases, sql-basics, sql-advanced (Level 7).
- **db-modeling** — Relational modelling: entities and relationships, one-to-many, many-to-many, normalisation (1NF–3NF) and deliberate denormalisation, constraints; model a shop.
- **db-indexes** — Indexes and query planning: B-tree indexes, `EXPLAIN (ANALYZE)`, composite indexes, index-only scans, when indexes hurt, finding slow queries.
- **db-transactions** — Transactions in depth: ACID, isolation levels, anomalies (lost update, non-repeatable read, phantom), row locks, `SELECT ... FOR UPDATE`, deadlocks and how to avoid them, optimistic concurrency.
- **db-operations** — Operating databases: connection pooling, migrations (forward-only, zero-downtime), seeds, backups and restores, replication concepts, read replicas, consistency.
- **db-typescript** — Typing database code: row types, nullable columns, entity vs DTO, repository types, generated types, ORM and query-builder typing trade-offs.

## Level 9 — API engineering (`api-engineering`)

- Builds on rest-design (Level 7).
- **api-pagination-versioning** — Offset vs cursor pagination in depth, stable sorting, versioning strategies (URL, header), deprecation, backwards compatibility.
- **api-idempotency** — Idempotency: the ₦10,000 transfer reasoning problem (authentication, active account, balance, recipient, partial failure, double submission), idempotency keys, safe retries, exactly-once illusions.
- **api-rate-limiting** — Rate limiting: fixed window, sliding window, token bucket; per-user vs per-IP; 429 and `Retry-After`; the 50,000 requests/second bottleneck reasoning problem.
- **api-contracts** — API contracts: OpenAPI as a contract, request/response schemas, contract tests, event and message contracts, schema evolution and backward compatibility, serialization.

## Level 10 — Security (`security`)

- **sec-authentication** — Authentication: password hashing (scrypt/argon2), sessions vs JWTs, secure cookies (HttpOnly, Secure, SameSite), token expiry and rotation, logout, brute-force protection.
- **sec-oauth** — OAuth 2.0 and OpenID Connect: roles, authorization code flow, PKCE, state, scopes, tokens; common mistakes.
- **sec-web** — Browser attacks and defences: CSRF, CORS misconfiguration, XSS (stored, reflected, DOM), Content-Security-Policy and other security headers.
- **sec-injection** — Injection and server-side attacks: SQL injection, command injection, path traversal, SSRF, request smuggling, prototype pollution, ReDoS.
- **sec-crypto** — Cryptography for developers: hashing vs HMAC vs encryption, symmetric vs asymmetric, TLS and HTTPS, secrets management, key rotation.
- **ts-security** — Types are not security: TypeScript protects developers, runtime validation protects applications, security controls protect systems; untrusted data, secret typing, authorization models, API boundaries.

## Level 11 — Software design and architecture (`software-architecture`)

- **design-principles** — Separation of concerns, cohesion, coupling, encapsulation, abstraction, composition — each through a refactoring problem.
- **design-solid** — SOLID, DRY, KISS, YAGNI through problems, including where they are misapplied.
- **design-patterns-creational** — Factory, abstract factory, builder, singleton (and why DI usually replaces singletons) — each solving a real problem.
- **design-patterns-structural** — Adapter, decorator, proxy, repository.
- **design-patterns-behavioral** — Strategy, observer, command, chain of responsibility (middleware).
- backend-architecture (*existing*).
- **arch-clean** — Layered and clean architecture: HTTP → application → domain → infrastructure, ports and adapters, domain models, DTOs and mappers, dependency direction.
- **arch-styles** — Architecture styles: monolith, modular monolith, microservices, event-driven, CQRS, message-driven systems, API gateways, service boundaries, failure handling, observability — trade-offs without dogma.
- frameworks (*existing*).
- **framework-build-core** — Build a mini framework, part 1: application object, container, config, logger, lifecycle.
- **framework-build-http** — Build a mini framework, part 2: router, middleware, controllers, validation, error handling, event bus; compare with ZudoJS.
- **framework-read-source** — Reading framework source code: navigating packages, type declarations, generic APIs, internal abstractions, CLI implementations, middleware systems and containers.

## Level 12 — ZudoJS fundamentals (`zudo-fundamentals`)

- zudo-welcome, zudo-first-code, zudo-create-project (*existing*).
- **zudo-cli** — The zudojs CLI as a productivity system: every command and option the published CLI really has (check `zudojs --help` and each subcommand), project detection, scaffolding, code generation and templates, validation and generation errors, what each generated file is for.
- **zudo-project-anatomy** — Anatomy of a ZudoJS project: entry point, config, modules, routes, services, repositories, tests, generated files; trace CLI → application → container → runtime → HTTP → handler → service → database.
- **zudo-core** — @zudojs/core: application creation, application and execution context, context propagation, startup/shutdown, component registration, composition.
- zudo-runtime (*existing*).
- **zudo-lifecycle** — @zudojs/lifecycle: state machines, components, dependencies, priorities, critical components, startup timeout and retry, shutdown timeout, SIGINT/SIGTERM, rollback; coordinate database → queue → HTTP server.
- **zudo-types-constants** — @zudojs/types and @zudojs/constants: type guards, converters, branded ids, timestamps, HTTP constants, injectable clocks and randomness, deterministic testing; project: a type-safe id and time system.
- zudo-container (*existing*).
- **zudo-di-architecture** — DI architecture with ZudoJS: composition root, constructor vs factory injection, test replacements and snapshots, production composition, avoiding the service locator.
- zudo-config, zudo-errors, zudo-http (*existing*).
- **zudo-routing** — Routing in depth with @zudojs/http: registration, parameters, matching, route middleware, groups, query parameters (repeated), path normalisation, canonical targets.
- zudo-middleware (*existing*).
- **zudo-middleware-pipelines** — @zudojs/middleware: composable pipelines, priority ordering, execution tracking, error handling, timeouts, logging, rate limiting, context; build logging → auth → authorization → validation → rate limit → handler.
- zudo-validation (*existing*: @zudojs/schema in depth).
- **zudo-validation-rules** — @zudojs/validation: constraints, parsers, composers, Zod integration, validation errors, circular detection, depth and size limits, request vs response validation.

## Level 13 — ZudoJS application development (`zudo-applications`)

- zudo-security (*existing*).
- **zudo-crypto** — @zudojs/crypto: hashing, password hashing, encryption/decryption, tokens, random values, key handling, secure comparison; build reset tokens, signed values and secure ids.
- zudo-auth, zudo-oauth, zudo-permissions, zudo-database (*existing*).
- **zudo-data-architecture** — Data architecture with ZudoJS: entities, DTOs, repositories, transactions, query boundaries, pagination, indexes, consistency.
- zudo-transactions, zudo-storage (*existing*).
- **zudo-file-uploads** — Project: a file upload system with @zudojs/storage and @zudojs/http — limits, content types, metadata, object storage, locks with fencing tokens.
- zudo-cache, zudo-openapi (*existing*).
- **zudo-typed-design** — Type-safe application design with ZudoJS: User, Product, Order, Payment, Notification with typed DTOs, services, repositories, events, commands, queries, errors and responses; how TypeScript powers config, DI, handlers and events.

## Level 14 — ZudoJS advanced systems (`zudo-advanced`)

- zudo-events, zudo-messaging, zudo-cqrs, zudo-queue, zudo-scheduler, zudo-serialization, zudo-rpc, zudo-api (*existing*).
- **zudo-adapters** — @zudojs/adapters: adapter contracts, registry, capabilities, initialization, connection, health, timeout, disposal, errors; project: a fake payment provider adapter swapped for a real one without touching business logic.
- zudo-plugins, zudo-feature-flags, zudo-tenancy, zudo-testing (*existing*).
- **zudo-testing-apps** — Testing ZudoJS applications layer by layer: service unit tests, repository integration tests, HTTP tests, auth tests, event and queue tests, CQRS tests, end-to-end workflows.
- zudo-logging, zudo-observability (*existing*).
- **zudo-docs** — @zudojs/docs: structured documentation, document models, registry, validation, navigation, frontmatter, generation.

## Level 15 — ZudoJS architecture (`zudo-architecture`)

- **zudo-monolith** — A complete ZudoJS monolith: auth, users, products, orders, payments, notifications in one app, well structured.
- zudo-modular-monolith, zudo-microservices (*existing*).
- **zudo-event-driven** — Event-driven applications: OrderCreated → email, audit, analytics; handler retries, idempotency, dead-letter concepts, event versioning and contracts.
- **zudo-cqrs-system** — A full CQRS system: write model and read model, commands, queries, events, transactions, queues, API and observability combined.

## Level 16 — Distributed systems (`distributed-systems`)

- **dist-fundamentals** — Distributed systems fundamentals: partial failure, network unreliability, time and clocks, consistency models, CAP intuition, service discovery concepts.
- **dist-contracts** — Contracts between services: shared contracts, API/event/message schemas, versioning, backward compatibility, serialization, schema evolution (@zudojs/serialization envelopes).
- **dist-reliability** — Failure engineering: deliberately break database, queue, cache, OAuth provider, external API, workers, plugins, config; timeouts, retries with backoff and jitter, fallbacks, circuit breakers, graceful degradation, health and readiness.
- **dist-transactions** — Transactions across services: why 2PC is rare, sagas (orchestration vs choreography), compensation, the outbox pattern, idempotent consumers.

## Level 17 — Production engineering (`production`)

- production-engineering (*existing*).
- **zudo-production-security** — A production security review: authn, authz, CORS, CSRF, cookies, JWT, OAuth, rate limiting, SSRF, XSS, SQL injection, path traversal, request smuggling, prototype pollution, secrets, error and logging leakage — as a checklist applied to the Task API.
- **zudo-performance** — Performance diagnosis: measure first; caching, pooling, query optimisation, connection limits, queue workers, concurrency, middleware and serialization cost, event-loop lag, memory, CPU, hot keys.
- deployment (*existing*).
- **zudo-ci-cd** — CI/CD: push → install → type check → lint → unit → integration → build → security checks → deploy, with GitHub Actions; environments, migrations, rollbacks.

## Level 18 — Framework engineering (`framework-engineering`)

- **zudo-internals** — Reading ZudoJS internals: package boundaries, public APIs, internal abstractions, dependency graphs, error architecture, context propagation, adapters, lifecycle; answering "how does this feature actually work?" from the published source.
- **zudo-create-package** — Creating a ZudoJS package (e.g. `@mycompany/zudo-payments`): structure, public vs internal API, types, errors, adapters, tests, documentation, versioning, publishing.
- **zudo-create-plugin** — Building a complete ZudoJS plugin: metadata, dependencies, capabilities, lifecycle, context, events, diagnostics, rollback.

## Level 19 — Real-world projects and capstone (`capstone`)

- **usecase-rest-api** — Users, products and orders API: HTTP, routing, validation, database, authentication, OpenAPI.
- **usecase-auth-platform** — Authentication platform: registration, login, sessions, JWT, password reset, RBAC, OAuth.
- **usecase-payments** — Payment system: create payment → transaction → provider adapter → payment event → queue → notification, with idempotency, failures, retries and security.
- **usecase-saas** — Multi-tenant SaaS: organization → tenant → users → roles → resources with tenancy, permissions, auth, feature flags, database and cache.
- **usecase-background-jobs** — Background processing: API → queue → worker → database → event with retries, concurrency, scheduling, observability and recovery.
- **usecase-microservices** — Microservice platform: gateway, auth, users, orders, payments, notifications with RPC, events, queues, serialization, adapters and observability.
- **zudo-cli-project** — A whole project through the CLI: create → generate module/service/repository/controller/schema/test → run → API docs → build → test → deploy (only commands the CLI really has).
- capstone-shopflow (*existing*).
- **capstone-saas** — The final capstone: a production-grade SaaS combining core, DI, config, database, storage, cache, HTTP, API operations, validation, OpenAPI, security, auth, OAuth, permissions, services, repositories, commands, queries, events, queue, scheduler, messaging, RPC, plugins, adapters, flags, tenancy, transactions, retries, timeouts, shutdown, health, logs, metrics, tracing and tests — with the graduation standard as its checklist.
- final-challenge (*existing*).

## Graduation standard (from the user's ZudoJS outline, verbatim list)

A student graduates when they can independently: design a backend; create a ZudoJS application; use the CLI;
structure modules; configure the application; use dependency injection; build HTTP APIs; validate input;
handle errors; authenticate users; authorize users; use OAuth; work with databases; use transactions; cache
data; store files; publish events; process messages; run background jobs; schedule tasks; use CQRS; build RPC
services; serialize distributed data; create adapters; create plugins; implement tenancy; use feature flags;
generate OpenAPI documentation; test the system; instrument the system; secure the system; deploy the system;
debug failures; reason about architecture; scale the system; read framework source code; extend ZudoJS. Most
importantly, they understand why they are doing each of these things. (capstone-saas#graduation maps each to
the lessons that teach it.)
