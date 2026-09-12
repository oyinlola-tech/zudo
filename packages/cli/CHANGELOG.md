# zudojs-cli

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
