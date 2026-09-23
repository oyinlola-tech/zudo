# @zudojs/adapters

## 1.2.1

### Patch Changes

- [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - The npm `homepage` now links to this package's documentation page on https://zudojs.oyinlola.site instead of the GitHub README. Development toolchain updated to Vitest 5.0.1 and @types/node 26.6.2; no runtime changes.
- Updated dependencies [[`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), `9f073ae`, `9f073ae`, `9f073ae`, [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5), `9f073ae`, [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a)]:
  - @zudojs/errors@1.3.0

## 1.2.0

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

## 1.1.0

### Minor Changes

- Round 10 audit fixes (tooling/ADP-01).

  - New `AdapterRegistry.healthAll(options?)`: runs `health()` on every adapter that implements it and returns an `AdapterHealthReport` (`status` is the worst per-adapter status). Checks that throw, reject, exceed `options.timeout` or are aborted via `options.signal` are reported as `"unhealthy"` instead of thrown.
  - New `AdapterRegistry.configure(name, options)`: forwards to the adapter's `configure()` hook; throws `AdapterConfigurationError` if it has none.
  - `createMockAdapter` accepts `Partial<LifecycleAdapter>` and keeps `health` and `configure`.

### Patch Changes

- Updated dependencies [`d2b01bf`]:
  - @zudojs/errors@1.1.0

## 1.0.1

### Patch Changes

- - `AdapterRegistry.disposeAll()` and `removeAndDispose()` now always call `dispose()`, even when `stop()` throws. Previously a failing `stop()` skipped disposal and the adapter, already unregistered, kept its connections and timers open. The `stop()` error is still reported; when both fail an `AggregateError` carries both.
- Updated dependencies []:
  - @zudojs/errors@1.0.1
  - @zudojs/lifecycle@1.1.0
  - @zudojs/constants@1.0.1

## 0.1.2

### Patch Changes

- Updated dependencies [[`262a376`](https://github.com/oyinlola-tech/zudo/commit/262a3769459162696c5d914f0b6fc9fb4a6bbbf5), [`3bb30e4`](https://github.com/oyinlola-tech/zudo/commit/3bb30e4a278fe969c64a0c2cf31097f309ff427d)]:
  - @zudojs/errors@0.2.0
  - @zudojs/types@0.2.0

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
  - @zudojs/constants@1.0.0
  - @zudojs/errors@1.0.0
  - @zudojs/lifecycle@1.0.0
  - @zudojs/types@1.0.0

## 0.1.4

### Patch Changes

- [`5af5beb`](https://github.com/oyinlola-tech/zudo/commit/5af5bebfbf89d48424d8658a670598d348589fad) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Add fullstack project generation, 11 frontend adapters, and security hardening

  - Add `--type`, `--frontend`, `--api`, `--language` options to `zudojs create`
  - Add frontend adapters: React, Next, Vue, Nuxt, Angular, Svelte, SvelteKit, Astro, Vanilla, Flutter, React Native
  - Add `FullstackComposer` and `FrontendGenerator` for project composition
  - Fix shell injection: switch `exec()` to `execFile()` across CLI package
  - Fix `environmentValidator` `ExecResult` type errors
  - Add missing `module` field to 6 package.json files
  - Unify type system with `ProjectConfiguration` and `ScaffoldOptions`
  - Update prompts for frontend/fullstack project types
  - Add barrel exports for new directories

## 0.1.2

### Patch Changes

- [`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Fix changeset validation workflow and publish all packages to npm.
- Updated dependencies [[`8b4c2fe`](https://github.com/oyinlola-tech/zudo/commit/8b4c2febb0d91668bc23fd69f06fc94647abb908)]:
  - @zudojs/errors@0.1.2
  - @zudojs/types@0.1.2
  - @zudojs/constants@0.1.2
  - @zudojs/lifecycle@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/errors@0.1.1
  - @zudojs/types@0.1.1
  - @zudojs/constants@0.1.1
  - @zudojs/lifecycle@0.1.1
