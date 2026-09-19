---
"zudojs-cli": minor
---

Round 10 audit fixes.

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
