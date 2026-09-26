# zudojs-cli

## 2.2.0

### Minor Changes

- Round 12: the `generate` command and the generated project, from the academy findings ([#7](https://github.com/oyinlola-tech/zudo/issues/7)–[#19](https://github.com/oyinlola-tech/zudo/issues/19), [#64](https://github.com/oyinlola-tech/zudo/issues/64), [#135](https://github.com/oyinlola-tech/zudo/issues/135), [#141](https://github.com/oyinlola-tech/zudo/issues/141)).

  **Generated project**

  - **Unexpected errors are logged and answered by the app ([#13](https://github.com/oyinlola-tech/zudo/issues/13)).** `src/server.ts` used to rethrow anything that was not an exposed 4xx, so the adapter answered a bare 500 and nothing was logged, in development or in tests. `dispatch` now logs the error (method, path, name, message, code, stack) with the runtime's logger and answers `{ "error": "Internal Server Error" }` from inside the middleware pipeline, so the 500 carries the security headers like every other response. An exposed 5xx error (an exposed `ServiceUnavailableError`, say) is answered with its own status and message and logged too; exposed 4xx errors are answered as before. `errorResponse` in `src/utils/http.ts` now covers 400–599; the new `errorDetails(error)` describes an error for the log.
  - **NODE_ENV is read once ([#14](https://github.com/oyinlola-tech/zudo/issues/14)).** `loadConfig` resolved `nodeEnv` and `createApp` called `resolveEnvironment(process.env)` again, so `loadConfig({ NODE_ENV: "test" })` still ran as `development`. `config.nodeEnv` is now the resolved `Environment` (`resolveEnvironment` is called in `configs/index.ts`) and `app.ts` passes `options.config.nodeEnv` through.
  - **One container ([#18](https://github.com/oyinlola-tech/zudo/issues/18)).** `app.ts` created a `@zudojs/container` that stayed empty next to the hand-written composition root in `src/container.ts`. `container.ts` now exports an `APP_DEPENDENCIES` token and `server.ts` registers the composition root under it in the runtime container, so a module reaches it with `context.application.container.resolve(APP_DEPENDENCIES)`.
  - **List endpoints paginate ([#141](https://github.com/oyinlola-tech/zudo/issues/141)).** `GET /api/v1/<resource>` returned every record (up to 10,000 from the in-memory store, 1,000 from Prisma). It now takes `?limit=` (1–200, default 50) and `?cursor=<id of the last item seen>` and answers `{ items, nextCursor }`, `nextCursor` being `null` on the last page; an unknown cursor answers an empty page and an invalid `limit` a 400. The repository contract is `list(page)` instead of `findAll()`; the in-memory store pages in creation order, the Prisma repository with a keyset cursor (`orderBy createdAt, id`, `cursor`/`skip: 1`, `take: limit + 1`). The DTO gains `List<Name>QuerySchema`, `<Entity>PageSchema`, `<Entity>PageRequest`, `DEFAULT_PAGE_SIZE` and `MAX_PAGE_SIZE`; the routes document the query and the page schema; the generated test walks the pages.
  - **Tests are type-checked ([#135](https://github.com/oyinlola-tech/zudo/issues/135)).** `tsconfig.json` excluded `**/*.test.ts` and nothing else compiled them. Every backend app now ships `tsconfig.test.json` (same options over `src/` and `tests/`, `noEmit`) and `typecheck` runs `tsc --noEmit && tsc -p tsconfig.test.json`. `build` is unchanged.
  - **No `lint` script ([#141](https://github.com/oyinlola-tech/zudo/issues/141)).** It ran `tsc --noEmit`, the same command as `typecheck`, under another name. It is gone from backend apps; add the linter of your choice.
  - **`/docs` is not served in production ([#141](https://github.com/oyinlola-tech/zudo/issues/141)).** `mountOpenAPI` is called with `docsPath: config.nodeEnv === "production" ? false : "/docs"`; `/openapi.json` stays. This is the line `zudojs add openapi` inserts as well.
  - **Rate limit default ([#141](https://github.com/oyinlola-tech/zudo/issues/141)) — a relaxed default, on purpose.** `RATE_LIMIT_MAX` in `.env.example` is 1000 per `RATE_LIMIT_WINDOW_MS` (was 300), and `RATE_LIMIT_MAX=0` turns the limiter off (the middleware is not added to the pipeline), for load tests and local development. The comments in `.env.example` now describe the right variables (the window's comment used to describe the max).
  - **`@zudojs/middleware` is declared ([#64](https://github.com/oyinlola-tech/zudo/issues/64)).** Every backend `package.json` lists it; under pnpm's strict layout an app that imported it (it is what `@zudojs/http`'s middleware is built on) failed to resolve a package that was only transitive.
  - **Prisma in the runtime image ([#141](https://github.com/oyinlola-tech/zudo/issues/141)).** `zudojs add database` installs `prisma` as a dependency, not a devDependency, and a CLI-written Dockerfile for a Prisma app copies `prisma/` and `prisma.config.ts` into the runtime stage with the command to apply migrations (`docker run --rm --env-file .env <image> npx prisma migrate deploy`). The pruned production image could serve but never migrate.
  - **`pnpm audit` is clean after `zudojs add database` ([#141](https://github.com/oyinlola-tech/zudo/issues/141)).** The Prisma CLI pulls in `mysql2` (unused with PostgreSQL) and `deepmerge-ts` at versions with published advisories (GHSA-3f6p-5ww8-9rcr, GHSA-rgwj-5xj2-c3m3, GHSA-ggr8-5vv4-36mx). The recipe now writes open-ended overrides (`mysql2: ">=3.23.1"`, `deepmerge-ts: ">=8.0.0"`) where the package manager reads them: the `overrides:` block of `pnpm-workspace.yaml` for pnpm (pnpm 11 no longer reads `pnpm.overrides` from package.json), `overrides` in the root `package.json` for npm and bun, `resolutions` for yarn. Verified against the registry: three advisories before, none after, and `prisma generate` still runs. Recipes can declare `overrides`.
  - **`prisma generate` after `generate resource` ([#141](https://github.com/oyinlola-tech/zudo/issues/141)).** When a resource appends a model to `prisma/schema.prisma`, the CLI runs `<pm> exec prisma generate` in the app (`prisma migrate dev` no longer regenerates the client), so the Prisma-backed repository type-checks at once. When that fails — nothing installed yet — it prints the command to run.

  **`zudojs generate`**

  - **Unknown schematic ([#7](https://github.com/oyinlola-tech/zudo/issues/7)).** `zudojs generate widget orders` said "Schematic name is required."; it now says `Unknown schematic "widget"` and lists the schematics.
  - **`generate service <name> --module <existing>` in a modular monolith ([#8](https://github.com/oyinlola-tech/zudo/issues/8))** adds a service layer inside that module. The "service → module" mapping used to apply regardless of `--module` and created a new module named after the service; it now applies only to a bare `generate service <name>`.
  - **Module tests live with the module ([#9](https://github.com/oyinlola-tech/zudo/issues/9)).** A resource generated with `--module billing` writes `tests/modules/billing/<name>.test.ts` instead of `tests/<name>.test.ts`, so two modules can each have a resource of the same name as far as tests go. (The composition root is still app-wide, so a second `invoices` is refused for the container key, with a message that says so.)
  - **Dry runs report every file ([#10](https://github.com/oyinlola-tech/zudo/issues/10)).** `generate module --dry-run` listed the files but not `src/app.ts`, which the real run edits; it now lists the same files the real run reports.
  - **Missing markers refuse instead of warning ([#11](https://github.com/oyinlola-tech/zudo/issues/11)).** `generate resource` (and `route`, and a module's routes registration) used to write all the files, warn "Finish by hand" and exit 0 when `routes/index.ts` or `container.ts` had lost its `// zudojs:*` markers, listing the unedited file among the generated ones while the route answered 404. Every registration target is now checked before the first write; when a marker pair is missing the command fails, names the file and the lines, and writes nothing.
  - **`generate validator` ([#12](https://github.com/oyinlola-tech/zudo/issues/12))** writes a `@zudojs/schema` object schema, its inferred type and `validate<Name>(input): SchemaResult<Name>` (`safeParse`), not `validate<Name>(input) { return true; }`.
  - **`--force` never duplicates a registration ([#135](https://github.com/oyinlola-tech/zudo/issues/135)).** A registration line the user had moved out of the marker block was inserted again between the markers, and the file failed with TS1117. A line present anywhere in the file now counts as present.

  **Other commands**

  - **`zudojs dev --frontend-only` in a backend project fails ([#15](https://github.com/oyinlola-tech/zudo/issues/15))** with "This backend project has no frontend app, so --frontend-only has nothing to start", instead of warning and exiting 0 (same for `--backend-only` without a backend, and for a project with nothing to start).
  - **Architecture fallback ([#16](https://github.com/oyinlola-tech/zudo/issues/16)).** For a project with no manifest and no `zudojs` block, `src/modules/` alone made it a "modular monolith", but every generated monolith has that folder. The heuristic now looks for `src/modules/<name>/<name>.module.ts`.
  - **`--language` help ([#17](https://github.com/oyinlola-tech/zudo/issues/17))** says it applies to the frontend app and that backends are always TypeScript.
  - **`zudojs migrate` ([#135](https://github.com/oyinlola-tech/zudo/issues/135))** exits 3 as before, but now says that migrations run through the project's `db:migrate` / `db:deploy` scripts (added by `zudojs add database`); `zudojs test` and `zudojs start` get the same kind of hint.

  Programmatic API: `ResourceSchematicRun` gains optional `packageManager` and `exec`; `ResourceGenerationResult` gains `prismaSchema`; `registerModuleInApp` takes a trailing `dryRun`; `planDevServers` moved to `commands/dev/` and is still exported from `dev.command`; `renderShutdownBlock` is new. Nothing was removed.

### Patch Changes

- Updated dependencies []:
  - @zudojs/core@1.3.0
  - @zudojs/logger@1.5.0
  - @zudojs/errors@1.4.0
  - @zudojs/config@1.3.4

## 2.1.3

### Patch Changes

- Fix graceful shutdown under `tsx watch`, make `generate middleware` produce a middleware the pipeline accepts, and answer an oversized request body with its 413.

  - **zudojs-cli: generated `src/server.ts` survives a second Ctrl+C.** The SIGINT/SIGTERM handlers were registered with `process.once`, so the `if (stopping) return` guard could never run. Under `npm run dev` (`tsx watch`), Ctrl+C delivers SIGINT twice. The second signal found no listener, and Node killed the process mid-shutdown before any graceful-shutdown log appeared. The handlers now use `process.on`. A repeated signal logs `Received SIGINT again: already shutting down.` while integrations drain, HTTP stops and the runtime stops. "Listening on …" is now logged after the handlers are registered. Every generated app uses this template: monolith, modular monolith, and the microservice gateway and services.
  - **zudojs-cli: `generate middleware <name>` writes an `HttpMiddleware` and registers it.** The schematic wrote `(ctx: unknown, next: () => Promise<void>) => Promise<void>`. Adding it to the pipeline failed tsc with TS2322, and it dropped the response `next()` produced. It now writes a function returning `HttpMiddleware` from `@zudojs/http` that returns `next()`'s response, and exports it from the `middlewares/index.ts` barrel. It also adds it to `src/server.ts` between the `zudojs:server-imports` and `zudojs:server-middleware` markers, so it runs after the security headers, CORS and rate limit and before routing. When the markers are missing, `server.ts` is left unchanged and the command prints the two lines to add by hand.
  - **@zudojs/errors: `SerializationPayloadTooLargeError` is an exposed 413 by default.** It was a 413 with `expose: false`, so `serializePublicError` answered an oversized request body with "An unexpected error occurred.". Its message holds only the two sizes, so it is now exposed. Like `SerializationDepthError`, it takes a third `{ statusCode?, expose? }` argument for a payload the server built itself.
  - **@zudojs/serialization: `serialize` keeps oversized output hidden.** `deserialize` bounds untrusted input, so an oversized string gets the exposed 413. The output of `serialize` was built by the server, so it now throws an unexposed 500 (`{ statusCode: 500, expose: false }`). `assertSizeWithinLimit` in `@zudojs/validation` guards untrusted input and now throws the exposed 413 without any change of its own.

  `@zudojs/serialization`: a too-deep payload found while restoring types in `deserialize` (`preserveTypes`) is now an exposed 400 (`UNTRUSTED_DEPTH_ERROR`) instead of a hidden 500, matching the parse-level depth guard.

- Updated dependencies []:
  - @zudojs/errors@1.3.2
  - @zudojs/config@1.3.3
  - @zudojs/core@1.2.4
  - @zudojs/logger@1.4.3

## 2.1.2

### Patch Changes

- - **`generate command` / `generate query` compile against `@zudojs/cqrs` 1.2.** They used to import `BaseCommand` / `BaseQuery`, which cqrs no longer exports, and wrote handlers with no `commandType` / `queryType` or `execute` that returned `{ success }`, so a fresh project failed `tsc` with TS2724/TS2305/TS2720. Each now writes a `CommandOf` / `QueryOf` type with a `create<Name>Command` / `create<Name>Query` factory, a `CommandHandler` / `QueryHandler` subclass, and a `register<Name>Command(bus)` / `register<Name>Query(bus)` helper. The bus discriminator is the PascalCase name (`"CreateUser"`), exported as `CREATE_USER_COMMAND` / `CREATE_USER_QUERY`.
  - **`generate service` uses the same layout as the resource schematics.** It used to write `src/services/<name>/<name>.service.ts` plus empty `commands/` and `queries/` barrels, while `generate controller`, `repository` and `resource` use `src/services/<name>.service.ts`. Running `generate controller <name>` after `generate service <name>` then created a second, unrelated service. `generate service` now writes `src/services/<name>.service.ts`, with its DTO and repository if they are missing, and `generate controller` reuses that service. The empty CQRS barrels are no longer written.
  - **`add docker` Dockerfiles install from the lockfile.** A single-app project's Dockerfile used to copy only `package.json` and run a floating `npm install`. It now copies the package manager's lockfile and runs a frozen install: `npm ci`; `pnpm install --frozen-lockfile` (with `pnpm-workspace.yaml`, after `corepack enable`); `yarn install --frozen-lockfile` on yarn 1 or `--immutable` on yarn 2 and later; or `bun install --frozen-lockfile`. bun is installed in the build stage for this. The lockfile is copied with a wildcard, so an image can still be built before the first install, with a comment in the Dockerfile explaining this. The whole-workspace Dockerfile installs from the lockfile too. A per-app Dockerfile inside a workspace still installs from `package.json` alone, because the workspace lockfile cannot pin one app's install on its own; a comment in that Dockerfile explains why.
  - OpenAPI summaries and generated doc comments use the right article: "Get an example" rather than "Get a example".
- Updated dependencies []:
  - @zudojs/errors@1.3.1
  - @zudojs/config@1.3.2
  - @zudojs/core@1.2.3
  - @zudojs/logger@1.4.2

## 2.1.1

### Patch Changes

- Updated dependencies [`e546629`, [`8db6c3a`](https://github.com/oyinlola-tech/zudo/commit/8db6c3a64667fb3ee18f8a812a4a66057e674099)]:
  - @zudojs/config@1.3.1
  - @zudojs/logger@1.4.1

## 2.1.0

### Minor Changes

- [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a) Thanks [@oyinlola-tech](https://github.com/oyinlola-tech)! - Generated projects now work out of the box, and every generator and `add` feature writes wired, compiling code.

  - **Projects:** `src/server.ts` builds a router (`registerRoutes`), serves `/openapi.json` and `/docs` when the openapi capability is on, applies @zudojs/security headers, closed-by-default CORS and rate limiting, and shuts down integrations → HTTP → runtime. Typed env config in `src/configs`, a composition root in `src/container.ts`, an example `/api/v1/examples` CRUD resource and a `createHttpTestClient` test. Same wiring in modular-monolith modules and every microservice app.
  - **`zudojs generate resource <name>`:** DTO, repository (in-memory, or Prisma when the app has it), service, controller, CRUD routes with OpenAPI metadata and a test, registered between `// zudojs:*` markers. `route`, `controller`, `repository` and `dto` write their layer plus any missing lower ones. Names with `/`, `\` or `..` are refused; running the same name twice fails cleanly; `--force` rewrites.
  - **`zudojs add`** writes real integrations: `database` (alias `postgres`/`prisma`; Prisma 7), `redis`, `websockets`, `email`, `docker` (multi-stage non-root Dockerfile, `.dockerignore`, `compose.yaml` bound to 127.0.0.1), plus `queue`, `scheduler`, `cache`, `messaging`, `observability`, `storage`, `openapi`. `docs` and `security` are refused with an explanation.
  - **Generators add what they import:** `generate command`/`query` (and any schematic) add missing `@zudojs/*` packages to the owning package.json instead of leaving TS2307. camelCase names keep their word boundaries (`createBook` → `create-book`, `CreateBookCommand`). "1 file" instead of "1 files".
  - **Menu and names:** `zudo` is an alias binary; `new` is an alias of `create`; running with no arguments in a terminal opens a numbered menu (never in CI or pipes); help and errors echo the name you typed. The `zudojs` npm package installs the CLI (`npm install -g zudojs`).
  - **Parser fixes:** only the first word selects a command (a typo no longer runs a different one and exits 0); options before the command, extra arguments after `-v`, `--port=` and non-finite numbers are usage errors (exit 2); unknown commands exit 3 with "did you mean"; `--__proto__`-style options are refused; control characters in echoed input are escaped.
  - **Dependencies:** `@zudojs/*` ranges in generated projects match this CLI build (no more `^1.0.0` resolving to releases without the APIs used). Frontend fallbacks updated to current majors (Vite 8, React 19.3, Next 16, Nuxt 4, Astro 7, Angular 22 with `@angular/build`, SvelteKit 2.70); backends get TypeScript 7, Vitest 5, @types/node 26. New pnpm frontend projects no longer end up empty, and Nuxt no longer always falls back.
  - The CLI compiles under TypeScript 7.

### Patch Changes

- Updated dependencies [[`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a), `9f073ae`, `9f073ae`, `9f073ae`, [`88b15a5`](https://github.com/oyinlola-tech/zudo/commit/88b15a57fc944e7a93135e537bfe23a0f5bce1c5), `9f073ae`, [`391cb09`](https://github.com/oyinlola-tech/zudo/commit/391cb09fb7e9b95c8034f35ae2450aba6611683a)]:
  - @zudojs/errors@1.3.0
  - @zudojs/config@1.3.0
  - @zudojs/core@1.2.2
  - @zudojs/logger@1.4.0

## 2.0.1

### Patch Changes

- Fixes the README generated for a microservice project with no services, which
  told the reader to run a command 2.0.0 refuses.

  `zudojs generate service` is refused in a microservice project — a service
  there is a whole workspace app, which the schematic does not produce — but the
  generated README still said "No services yet. Add one with:
  `npx zudojs generate service <name>`". Anyone following it hit a validation
  error on the first thing the project asked them to do.

  The README now points at the two commands that work:
  `zudojs create <project> --architecture microservice --services <name>` to
  create one, and `zudojs generate module <name> --service <existing-service>` to
  add domain logic to an app that already exists. `packages/cli/README.md` gains
  the same note, and a regression test asserts the generated README never names
  `generate service` again.

## 2.0.0

### Major Changes

- A full audit of the CLI: 55 findings, all fixed, each with a regression test that fails against
  the unfixed code.

  **Read this before upgrading.** Several commands now refuse where they previously proceeded. In
  every case the old behaviour was a bug, but a script or CI job written against it will notice.

  ### Breaking
  - **A failed dependency install now exits non-zero.** `zudojs create` used to downgrade an install
    failure to a warning and then print "Project created successfully" and exit 0, so a CI job went
    green with no `node_modules`. The project is still kept and the retry hint is still printed; only
    the exit code and the closing message changed. `zudojs add` already behaved this way — the two
    commands no longer disagree.
  - **`zudojs build` refuses outside a Zudojs project.** `findProjectRoot` accepted any ancestor
    holding a bare `package.json`, so from an unrelated subdirectory the CLI climbed out and executed
    that project's `scripts.build` — content from a file on disk — then reported success. It now
    requires a real Zudojs project and throws `CLINotInProjectError` otherwise.
  - **`zudojs generate` outside a project throws** instead of warning and writing files into the
    current directory, matching `dev`, `build` and `add`. It also walks up to the project root, so
    running it from a subdirectory no longer creates a second `src/` tree.
  - **Cancelling a prompt exits 130**, not 0. `zudojs create my-api && cd my-api` no longer runs the
    `cd` after you pressed Ctrl-C. Ctrl-C mid-scaffold is now honoured at all — `@clack/prompts`
    registers a SIGINT listener per spinner that only prints "Canceled", which suppressed Node's
    default termination, so the run used to continue to completion; it now rolls back and exits 130.
  - **`CLI_ENVIRONMENT` no longer carries `NODE_ENV` or `DEBUG: "DEBUG"`.** Nothing read either, and
    honouring a bare `DEBUG` would have changed behaviour. It now names the four variables the CLI
    really reads: `ZUDOJS_DEBUG`, `CI`, `NO_UPDATE_CHECK`, `NPM_OFFLINE`.
  - **`RollbackManager.rollback()` returns a `RollbackResult`** instead of `void`, and
    `CapabilityResolutionResult.conflicts` is gone — it was structurally incapable of being non-empty.
  - A project name must now start with a letter or digit. `zudojs create -- --weird` used to create a
    directory `cd` could not enter and `rm -rf` could not remove.
  - A schematic name may no longer start with a digit. `zudojs generate module 2fa` used to write
    `import { 2faModule } …` into your existing `src/app.ts` — a syntax error in the entry point — and
    exit 0.
  - The printed app name is now `zudojs` rather than `Zudojs`, so usage lines show the command you type.

  ### New projects no longer arrive with services nobody asked for

  `zudojs create` invented example domains when no service list was given — four for a microservice
  project (`identity`, `enrollment`, `assessment`, `notification`) and three for a modular monolith.
  A modular monolith was never even asked. An empty list now means no services: a microservice project
  gets its gateway, a modular monolith gets an empty module barrel, and both READMEs say how to add
  one. Named services are generated exactly as named.

  ### `generate service` now works in every architecture

  It was broken in all three. In a monolith it wrote to `src/<name>/` while the template's services
  live in `src/services/`; it now nests under the template's directory. In a modular monolith it
  logged `Mapping "service" → "module"` and then did not, producing four inert files the runtime never
  loaded; the mapping is now real and the module is registered in `app.ts`. In a microservice project
  it created an app directory with no `package.json`, so pnpm skipped it and `pnpm -r run build` never
  compiled it; it now refuses and names the two commands that do work.

  ### Fixes worth calling out
  - **Generated projects pinned `latest`.** The frontend install path resolved every dependency to a
    pinned range and then passed only the names to the package manager, so two `zudojs create
--frontend react` runs a month apart produced different majors. The resolved range is now
    installed, and the resolver's "no version range known" warnings are no longer discarded.
  - **Ticking "Security" did nothing.** The capabilities prompt offered eight options and the command
    read six; `events` and `security` were silently dropped — no dependency, no manifest entry, no
    message. Both are now consumed. A new `--capabilities <list>` flag makes the interactive and
    non-interactive branches produce the same project.
  - **Writes could escape the project through a symlink.** Path containment was checked on the literal
    string only, so a symlinked subdirectory sent generated files to the symlink's target. Containment
    is now re-checked after resolving the real path.
  - **`zudojs doctor`'s feature check could never fail** — the templates hardcoded
    `zudojs.features: []`. They now record the real capability list and install the packages backing
    it. The modular-monolith template ignored the `enable*` flags entirely, so `--database` installed
    nothing.
  - **`pnpm run test` failed in a brand-new project.** The sample spec was `tests/index.ts`, which
    matches no vitest include pattern, so the first thing you ran exited 1. It is now `tests/app.test.ts`.
  - **The manifest is now durable.** It is written atomically, serialized by a lock so concurrent
    `zudojs add` runs cannot lose an update, validated on read, and a corrupt manifest is reported
    distinctly from a missing one. `add` reads and validates it before touching any `package.json`,
    so a failure can no longer leave the project half-updated.
  - **A framework scaffolder is no longer killed at 120 s** and silently replaced by the built-in
    fallback template; it gets 15 minutes, the failure says whether it timed out, and the child's real
    stderr is shown.
  - Per-command help works: `zudojs create --help` prints usage, arguments, options, shorts and
    defaults, instead of rejecting `--help` as an invalid option.
  - A flag-shaped token is no longer swallowed as an option value, so `--type --frontend react` names
    the right problem. Surplus positionals are reported by every command. All four registries throw on
    a duplicate registration rather than silently replacing the earlier entry.

  ### Not verified on Windows

  The `cmd.exe` quoting hardening (arguments containing `"`, `%` or `!` are now rejected rather than
  escaped, because a backslash is not a cmd escape) and `NoDefaultCurrentDirectoryInExePath` were
  tested as pure functions on Linux by passing `"win32"` explicitly. They have not been exercised on a
  real Windows host.

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
