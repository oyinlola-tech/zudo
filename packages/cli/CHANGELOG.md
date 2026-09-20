# zudojs-cli

## 1.2.1

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

- Updated dependencies [`c904687`, `c904687`, `c904687`]:
  - @zudojs/errors@1.2.0
  - @zudojs/logger@1.3.0
  - @zudojs/config@1.2.0
  - @zudojs/core@1.2.1

## 1.2.0

### Minor Changes

- Round 10 audit fixes.

  - Generated `src/server.ts` now serves HTTP with `@zudojs/http` on `PORT` (default 3000, per-service ports for microservices), answers `GET /health` (the monolith's `HealthController` is wired to it), and stops the HTTP server and runtime on SIGINT/SIGTERM. It used to exit with 0 after `runtime.start()` (tooling/CLI-01).
  - Fullstack + microservice: the gateway and services are written at `apps/gateway` and `apps/services/*` (inside the root workspace, which now lists `apps/services/*`), the root compose builds them with their own Dockerfiles and includes the gateway, and CORS config goes to the gateway (tooling/CLI-02).
  - `zudojs generate` refuses to overwrite existing files it would change and lists them; new `--force` flag overwrites. Barrel appends are still allowed (tooling/CLI-03).
  - `--database mysql|sqlite` now sets the matching `DATABASE_URL` (via the database adapters, whose `getEnvironmentVariables(dbName?)` takes the project name); `mongodb` is rejected (tooling/CLI-04).
  - The fullstack root Dockerfile builds and runs `apps/api` (`InfrastructureOptions.appDirectory`) instead of copying a non-existent `/app/dist` (tooling/CLI-05).
  - `zudojs generate module` emits a `BaseModule` subclass, exports it from the modules barrel and registers it in `app.ts` (microservice modules go to `<app>/src/modules`) (tooling/CLI-06).
  - An unparsable frontend package.json fails the scaffold instead of being replaced; unpinned frontend dependencies get caret ranges instead of `"latest"` (tooling/CLI-07).
  - `zudojs add constructor`/`__proto__` reports "Unknown feature" instead of crashing (tooling/CLI-08).
  - `--language javascript` is rejected for backend projects and warned about for fullstack (frontend only) (tooling/CLI-09).
  - tooling/CONV-01 (phase 2): `CLIValidationError`, `CLIGenerationError`, `CLINotInProjectError` and `CLITemplateError` now live in `@zudojs/errors`; `zudojs-cli` re-exports the same classes (same constructors and behaviour). Requires the matching `@zudojs/errors` release.
  - LEAF-16 (phase 2, behaviour change in generated apps): the generated `src/app.ts` resolves `NODE_ENV` with `resolveEnvironment()` from `@zudojs/constants` instead of an exact-match list, so `prod`/`Production` run as production and an unknown value warns once.

### Patch Changes

- Updated dependencies [`5d6b957`, `d2b01bf`, `d2b01bf`, `5d6b957`]:
  - @zudojs/config@1.1.0
  - @zudojs/core@1.2.0
  - @zudojs/errors@1.1.0
  - @zudojs/logger@1.2.0

## 1.1.1

### Patch Changes

- Updated dependencies []:
  - @zudojs/config@1.0.1
  - @zudojs/core@1.1.0
  - @zudojs/errors@1.0.1
  - @zudojs/logger@1.1.0

## 1.1.0

### Minor Changes

- Make freshly created projects install and run.

  - Generated projects depend on `@zudojs/*` with the `^1.0.0` range instead of an exact `1.0.0` pin. `@zudojs/openapi` has no 1.0.0 release, so every `pnpm install` in a new project aborted with `ERR_PNPM_NO_MATCHING_VERSION`.
  - Generated projects allow esbuild's build script for pnpm 10+, which otherwise fails `pnpm install` with `ERR_PNPM_IGNORED_BUILDS`.
  - `zudojs dev` runs the project's `dev` script through its package manager instead of spawning `tsx` (a devDependency that is not on PATH) and watching `src/index.ts`, which never starts the server. Sibling servers are stopped when one fails.
  - `zudojs create` no longer writes `zudojs.config.ts`; `.zudojs/manifest.json` and the `zudojs` block in `package.json` already describe the project and are what every command reads. Existing `zudojs.config.ts` files are still honoured.
  - `zudojs add` writes to the backend app (`apps/api` in a fullstack workspace, the gateway and services in a microservice one, `--service <name>` to pick one), never `workspace:*`, and `scheduler` installs `@zudojs/scheduler`.
  - `zudojs doctor` understands workspaces (tsconfig and dependencies are checked per app) and no longer reports the `src/modules/` directory the templates create as a violation.
  - `zudojs generate` places backend schematics under `apps/api` in a fullstack workspace.
  - Command output is plain text; the `@zudojs/logger` default console transport printed every line as a serialised record.
  - `zudojs create --no-install` is honoured for frontend and fullstack projects; the frontend dependencies are recorded in `package.json` instead of being installed.
  - Package managers are spawned through a shell on Windows, where `pnpm`/`npm` are `.cmd` shims.
  - The `postinstall` update check is gone (npm 11 and pnpm 10 skip install scripts by default); `zudojs info` reports a newer version instead.

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
  - @zudojs/config@1.0.0
  - @zudojs/core@1.0.0
  - @zudojs/errors@1.0.0
  - @zudojs/logger@1.0.0

## 0.2.1

### Patch Changes

- - Convert postinstall script to CommonJS for Node.js v24 compatibility
  - Restore postinstall hook pointing to src/scripts/postinstall.cjs
  - Add --provenance flag to npm publish for better CDN cache invalidation
  - Fix Prettier formatting in release.yml and packages/cli/README.md

## 0.2.0

### Minor Changes

- - Replace number-based prompts with @clack/prompts (arrow-key selects, spinners, intro/outro)
  - Restructure prompts into modular folders (project/, backend/, frontend/, workspace/, capabilities/)
  - Add conditional interactive flow for Backend / Frontend / Full Stack project types
  - Wire .zudojs manifest into dev, add, generate, and create commands
  - Expand infrastructure generator with per-service Dockerfiles and migrations placeholder
  - Add microservice support to `zudojs dev` command
  - Expand `zudojs generate` from 6 to 13 schematics (middleware, event, job, route, model, dto, validator)
  - Expand `zudojs add` from 6 to 10 features (cache, storage, scheduler, docs)
  - Add tests for build command, manifest manager, rollback manager, capability resolver, infrastructure generator, and compatibility validator (247 tests total)

## 0.1.5

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
  - @zudojs/core@0.1.3
  - @zudojs/errors@0.1.2
  - @zudojs/config@0.1.2
  - @zudojs/logger@0.1.2

## 0.1.1

### Patch Changes

- [`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Initial publication of all Zudojs packages with namespace migration, new middleware, and fixes.
- Updated dependencies [[`35faf04`](https://github.com/oyinlola-tech/zudo/commit/35faf049b7ff9e300cf2030f48ac108813c912c4)]:
  - @zudojs/core@0.1.2
  - @zudojs/errors@0.1.1
  - @zudojs/config@0.1.1
  - @zudojs/logger@0.1.1
