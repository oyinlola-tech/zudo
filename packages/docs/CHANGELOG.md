# @zudojs/docs

## 1.1.0

### Minor Changes

- Round 12 platform fixes (findings 94–101, 104–106, 125, 132, 134 from the academy lessons).

  **@zudojs/docs**

  - Security: `validateLinks` now scans every link form a renderer turns into a live link and applies the URL-scheme allow-list to each. `[x](javascript:alert(1))` (parentheses in the target), `[x](<javascript:…>)`, titled targets, reference definitions `[x]: javascript:…`, raw `<a href="…">` in any quoting and `<scheme:…>` autolinks are all reported as `UNSAFE_LINK`; each was previously missed. Every scanner is linear on hostile input.
  - `validateAll` / `validateLinks` take `brokenLinkSeverity` and `validateAll` takes `orphanSeverity` (`"error" | "warning"`, default `"warning"`), so a documentation set with dead links or unreachable documents can be made to fail validation. Defaults are unchanged.
  - `createDocument({ …, strict: true })` rejects an unknown `category`, `status` or `visibility` at creation; without it the builder accepts them as before. Built documents no longer carry explicit `undefined` keys for options that were not supplied.
  - `getAdjacent(id, nav, { scope: "tree" })` walks previous/next across section boundaries in reading order. `SearchDocument`, `SearchResult`, `DocumentationSourceLoader` and `DocumentationVersion` are documented as contracts the package does not implement.

  **@zudojs/plugins**

  - The hook-timeout timer is no longer `unref`'d. A `start()` that never settles, in a process where nothing else holds the event loop, used to exit Node with code 13 before the timeout could fire — no `PluginTimeoutError`, no rollback. It now times out, is rolled back and rejects `start()`.
  - Lifecycle failures name the plugin: a hook's error that is not already a `PluginError` is thrown as `PluginInitializationError` (install/initialize), `PluginStartError` (start) or `PluginStopError` (stop), with `pluginName` set, the original as `cause` and its message quoted (`Plugin "x" failed to start: boom`). Typed plugin errors (`PluginTimeoutError`, `PluginStateError`, …) propagate unchanged. `diagnostics()` and the `failed` event keep the hook's own error.
  - `PluginManager.register(plugin, options)` types `options` from `Plugin<TOptions>`. `PluginContext.host` carries the host application's metadata (the `plugin` of the context passed to `start()`), and `createPluginContext` takes a `host` option. `PluginContainer` declares optional `resolve()` and `has()`, so a real container is accepted without casting.
  - Behaviour change in `diagnostics()`: a plugin that is idle — `registered`, or cleanly `stopped` or `disposed` — is now `healthy` instead of `degraded` (every plugin read `degraded` after a clean `stop()`); a plugin part-way through boot or a transition is `degraded`; a `started` plugin may report its own health through a new optional `Plugin.health()`. New export `resolvePluginHealth`.

  **@zudojs/adapters**

  - Behaviour change: `stopAll()` and `disposeAll()` now run in reverse registration order (the mirror of `initializeAll()`/`startAll()`), as the lifecycle and cleanup managers do.
  - `initializeAll()`, `startAll()` and `stopAll()` take `AdapterOperationOptions` (`timeout`, `retry`, `signal`) like `healthAll()`. The `AggregateError` they throw now holds typed per-adapter errors — `AdapterInitializationError`, `AdapterOperationError` (operation `"start"`/`"stop"`) or `AdapterTimeoutError` — naming the adapter, with the hook's own error as `cause`; previously each entry was the bare error and nothing said which adapter had failed. `disposeAll()`/`removeAndDispose()` still rethrow the hooks' own errors. Code that read `errors[i].message` from `initializeAll()`/`startAll()`/`stopAll()` should read `errors[i].cause` instead.
  - `AdapterCapabilities` is open: any capability name (`refunds`) can be declared and looked up with `findByCapability`, `supports` and `requireCapability`; the well-known keys live in the new `KnownAdapterCapabilities`.
  - `healthAll().adapters` keys are in registration order regardless of which check finished first. `withRetry`, `collectAdapterHealth`, `configureAdapter`, `runAdapterLifecycle` and `toAdapterLifecycleError` are exported from the package root.
  - Not changed here (needs `@zudojs/errors`): `AdapterTimeoutError` and `AdapterConnectionError` still carry `statusCode: 500`.

  **@zudojs/testing**

  - `createMockFn` gains `mockReturnValueOnce`, `mockResolvedValueOnce`, `mockRejectedValueOnce` and `mockImplementationOnce`. One-shot results are consumed in order before the persistent mode; `mockReset` drops them, `mockClear` keeps them.

  **@zudojs/rpc**

  - An `RPCTransportError`, or an `RPCTimeoutError` naming a different procedure, thrown inside a handler or middleware — what an `RPCClient` raises when a downstream call cannot be reached or times out — is now answered with `RPC_UNAVAILABLE` and the new `UNAVAILABLE_ERROR_MESSAGE`, instead of `RPC_INTERNAL_ERROR` (transport) or this procedure's own `RPC_TIMEOUT` (timeout). The dispatcher wraps it in an `RPCUnavailableError` with the original as `cause`, which the server hands to `onInternalError`. A timeout about the procedure itself — the dispatcher's own, a cooperative handler rethrowing `context.signal.reason`, or a handler throwing an `RPCTimeoutError` under its own procedure name — still maps to `RPC_TIMEOUT`. `mapRPCError` applies the same rule to a bare `RPCTransportError`.
  - Documented: `retry()`'s `attempts` counts calls, not retries (`attempts: 3` = three calls); `@zudojs/lifecycle` counts the other way.

  **@zudojs/openapi**

  - New `implicitLimits` option (default `true`) on `createOpenAPIManager`, `createOpenAPIDocumentFromRoutes`, `convertSchema`, `resolveSchemaInput` and the route scanner. The emitted `maxLength: 255` / `maxItems: 1000` on strings and arrays without their own `.max()` reflect the ceilings `@zudojs/schema` actually enforces, so the default is kept; `implicitLimits: false` emits only explicitly declared bounds.
  - Not changed here (lives in `@zudojs/http`): `mountOpenAPI` still serves `/docs` by default in every environment; pass `docsPath: false` to disable it.

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.4.0

## 1.0.6

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.2

## 1.0.5

### Patch Changes

- Updated dependencies []:
  - @zudojs/errors@1.3.1

## 1.0.4

### Patch Changes

- [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - The npm `homepage` now links to this package's documentation page on https://zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Updated dependencies [[`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), `9f073ae`, `9f073ae`, `9f073ae`, [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5), `9f073ae`, [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a)]:
  - @zudojs/errors@1.3.0

## 1.0.3

### Patch Changes

- Tooling correctness fixes for the testing, docs, adapters, feature-flag and CLI packages.

  - `createStub()` now returns the same no-op function for a given property on every access, so `stub.handler === stub.handler`. A `bus.on("x", stub.handler)` / `bus.off("x", stub.handler)` pair written against a stub now actually removes the listener instead of leaking it between tests.
  - `InMemoryTestStorage.set(key, value, 0)` now treats a zero TTL as a deadline of "now" — the entry is already expired on the next read. Only an omitted TTL means "never expires". A test that wrote `0` to mean "already stale" previously got an entry that never expired.
  - `generateMarkdown` now HTML-escapes the deprecation blockquote (`deprecatedMessage`) and the `**Owner:**` line, as every other text position it writes already did. A document built from untrusted JSON can no longer put raw `<script>`/`<img>` tags into generated markdown that a renderer with HTML enabled would execute.
  - `AdapterRegistry.healthAll()` no longer loses an adapter named `__proto__`: the per-adapter report is built on a null-prototype object, so the entry is present, the aggregate status reflects it, and nothing writes through to `Object.prototype`. `AdapterRegistry.register()` now refuses the names `__proto__`, `constructor` and `prototype` with an `AdapterConfigurationError`.
  - `AdapterOperationOptions.retry` is now implemented rather than merely declared. `healthAll({ retry: { attempts, delay } })` re-runs a check that reports `unhealthy` up to `attempts` times in total, pausing `delay` ms between tries; `timeout` still bounds each try and an aborted signal stops the retries immediately. Without `retry` the behaviour is unchanged (one try).
  - `valuesEqual` now compares structurally instead of by `JSON.stringify`: key order no longer matters, a key whose value is `undefined` is no longer equal to an absent key, arrays compare element-wise, `Date`s compare by instant, `NaN` equals `NaN`, and a self-referencing value is compared rather than throwing a `TypeError` out of a function typed to return a boolean.
  - `FeatureFlags.snapshot()` and `getAll()` now reject with `FeatureFlagProviderError` when the flags were never loaded, instead of resolving to an empty result that is indistinguishable from "no flags are configured". Once a load has succeeded they keep serving that data even if a later reload fails, and a provider that genuinely holds no flags still resolves empty. `evaluate()` is unchanged and still reports `reason: "error"`.
  - New `providerCooloffMs` option (default 5,000 ms; `0` restores the old behaviour) leaves a failing flag provider alone for that window instead of re-running `getAll()` and `get(key)` on every single evaluation during an outage. A successful call closes the window immediately and `refresh()` always probes.
  - `CLIParser({ stopAtFirstArgument: true })` no longer reports the first positional token as the command. The token now appears only in `args`; previously it appeared in both `commands`/`command` and `args`.

- Updated dependencies [`c904687`, `c904687`]:
  - @zudojs/errors@1.2.0

## 1.0.2

### Patch Changes

- Round 10 audit fixes.

  - `stripMarkdown` runs in linear time; 2 KB of newlines used to block for ~6 s (tooling/DOCS-01).
  - `validateLinks` scans in linear time; a 99 KB document used to take ~30 s under the 100 KB scan cap (tooling/DOCS-02).
  - Frontmatter `tags` always parses to a string array (`tags: http` → `["http"]`, `tags:` → `[]`, `tags: [a, b]` → `["a", "b"]`); `createDocument` no longer spreads a string tag into characters. Empty arrays/objects serialize as `[]`/`{}` and round-trip (tooling/DOCS-03).
  - Structured-node markdown generation HTML-escapes text (`&`, `<`, `>`) outside code blocks and writes links whose scheme is not http, https, mailto, tel, ftp or ftps as plain text; `validateLinks`/`validateAll` report such links as `UNSAFE_LINK` errors (tooling/DOCS-04).
  - Visibility filtering fails closed: only an unset or exactly `"CLIENT"` visibility reaches the `"CLIENT"` filter and `generateIndex`; every other value (e.g. `"server"`) is treated as server-only (tooling/DOCS-05).
  - `parseFrontmatter` removes only the single blank separator line after the block, keeping body indentation and further blank lines; numeric literals become numbers only when the conversion is lossless (`1e+21` and `1.5e-7` round-trip, `007` stays a string) (tooling/DOCS-06).

  Behaviour changes: structured paragraphs/tables/quotes/lists/headings are HTML-escaped; `javascript:`/`data:` links become plain text and fail validation; `getAll({ visibility: "SERVER" })` also returns documents with unrecognised visibility; frontmatter bodies are no longer left-trimmed.

- Updated dependencies [`d2b01bf`]:
  - @zudojs/errors@1.1.0

## 1.0.1

### Patch Changes

- - `nodesToMarkdown` no longer resolves an unknown callout `kind` such as `"constructor"` through `Object.prototype`; the label is the upper-cased kind instead of a function's source text.
  - `deepFreezeClone` (and therefore `createDocument` and the registry) no longer freezes the caller's nested objects in place when the value cannot be structured-cloned; the fallback now copies plain objects, arrays and Dates recursively.
  - `validateNavigation` reports `NAVIGATION_DUPLICATE_DOCUMENT` when the same navigation node object is mounted in more than one place.
- Updated dependencies []:
  - @zudojs/errors@1.0.1

## 1.0.0

### Major Changes

- [`16f14c3`](https://github.com/oyinlola-tech/zudo/commit/16f14c36d05f664d914bc6e1b9de70f67ff55860) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - BREAKING CHANGE: Rename all packages from `@zudojs/*` to `@zudojs/*` and `@zudojs/cli` to `zudojs-cli`.

  - Scoped packages: `@zudojs/adapters`, `@zudojs/api`, `@zudojs/auth`, etc.
  - CLI package: `zudojs-cli` (unscoped)
  - All internal imports, docs, CI, and examples updated

  Migration:

  ```bash
  # Old
  npm install @zudojs/cli
  npm install @zudojs/errors

  # New
  npm install zudojs-cli
  npm install @zudojs/errors
  ```

### Patch Changes

- Updated dependencies [[`16f14c3`](https://github.com/oyinlola-tech/zudo/commit/16f14c36d05f664d914bc6e1b9de70f67ff55860)]:
  - @zudojs/errors@1.0.0

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
