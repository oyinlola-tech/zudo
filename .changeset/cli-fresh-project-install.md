---
"zudojs-cli": minor
---

Make freshly created projects install and run.

- Generated projects depend on `@zudojs/*` with the `^1.0.0` range instead of an exact `1.0.0` pin. `@zudojs/openapi` has no 1.0.0 release, so every `pnpm install` in a new project aborted with `ERR_PNPM_NO_MATCHING_VERSION`.
- Generated projects allow esbuild's build script for pnpm 10+, which otherwise fails `pnpm install` with `ERR_PNPM_IGNORED_BUILDS`.
- `zudojs dev` runs the project's `dev` script through its package manager instead of spawning `tsx` (a devDependency that is not on PATH) and watching `src/index.ts`, which never starts the server. Sibling servers are stopped when one fails.
- `zudojs create` no longer writes `zudojs.config.ts`; `.zudojs/manifest.json` and the `zudojs` block in `package.json` already describe the project and are what every command reads. Existing `zudojs.config.ts` files are still honoured.
- `zudojs add` writes to the backend app (`apps/api` in a fullstack workspace, the gateway and services in a microservice one, `--service <name>` to pick one), never `workspace:*`, and `scheduler` installs `@zudojs/scheduler`.
- `zudojs doctor` understands workspaces (tsconfig and dependencies are checked per app) and no longer reports the `src/modules/` directory the templates create as a violation.
- `zudojs generate` places backend schematics under `apps/api` in a fullstack workspace.
- Command output is plain text; the `@zudojs/logger` default console transport printed every line as a serialised record.
- Package managers are spawned through a shell on Windows, where `pnpm`/`npm` are `.cmd` shims.
- The `postinstall` update check is gone (npm 11 and pnpm 10 skip install scripts by default); `zudojs info` reports a newer version instead.
