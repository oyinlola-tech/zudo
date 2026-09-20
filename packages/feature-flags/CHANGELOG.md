# @zudojs/feature-flags

## 1.3.0

### Minor Changes

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

### Patch Changes

- Updated dependencies [`c904687`, `c904687`]:
  - @zudojs/errors@1.2.0
  - @zudojs/types@1.1.1

## 1.2.0

### Minor Changes

- Round 10 fixes.

  - **FF-01 (bug):** a dependency is satisfied only when the prerequisite _evaluates_ on for the same context (not disabled/draft/archived/expired, not `false`/`null`/`undefined`, its own dependencies satisfied). `resolveDependencies` takes an optional fifth `context` argument.
  - **FF-02 (bug):** attribute rules gain an optional `result` (the value served on a match, default `true`). An attribute rule without `result` on a non-boolean flag is skipped instead of serving `true`.
  - **FF-03 (security):** `matches` refuses patterns that can backtrack catastrophically (a repeated group that itself repeats or alternates, or a backreference) and tests only values up to 1,024 characters.
  - **FF-04 (bug):** `createFeatureFlags` remembers unknown keys for `missingFlagTtlMs` (new option, default 30 s, at most 1,000 keys, cleared on reload). `createCachedProvider` gains `maxEntries` (default 1,000).
  - **FF-05 (convention):** `isPlainObject` now matches `@zudojs/types` semantics (false for `Date`, `Map`, class instances) and is deprecated in favour of `@zudojs/types`.

  Behaviour changes: dependents turn off where their prerequisite is archived, expired or not rolled out for the subject; non-boolean flags no longer serve `true` from an attribute rule without `result`; nested-quantifier `matches` patterns never match; a missing key is not re-fetched for 30 s; `isPlainObject(new Date())` is `false`.
  - **authz/FF-05 (phase 2):** `isPlainObject` is now a re-export of the `@zudojs/types` function (same semantics as the round-10 local copy; the export is kept and marked deprecated in favour of importing from `@zudojs/types`).

### Patch Changes

- Updated dependencies [`d2b01bf`, `d2b01bf`]:
  - @zudojs/errors@1.1.0
  - @zudojs/types@1.1.0

## 1.1.0

### Minor Changes

- Audit round 9 — provider and evaluation fixes.

  - `createCachedProvider` and `createCompositeProvider` forward `subscribe()` from the providers they wrap, so `createFeatureFlags` on the documented cached-over-composite stack now hears a flag flipped at the source instead of serving the stale copy until the TTL expires. The cached provider drops its cache before re-announcing; the composite announces the merged view with the same precedence `getAll()` applies. Neither offers `subscribe` when nothing underneath does.
  - `createEnvironmentProvider` no longer turns an empty or blank value (`FEATURE_X=`) into the number `0`; it stays the string it is.
  - A `provider.get()` that throws is reported as `reason: "error"` (and does not throw `FeatureFlagNotFoundError` under `throwOnMissing`). It used to be reported as `not_found`, telling the caller the flag does not exist when the store could not be asked.
  - `metadata.expiresAt` given as an ISO string or timestamp — what every JSON-backed provider hands over — now expires the flag. Only a real `Date` did before; a string compared as always-not-expired.

### Patch Changes

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
