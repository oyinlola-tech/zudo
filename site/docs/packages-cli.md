---
title: "zudojs-cli — Command-Line Interface Framework"
description: "zudojs-cli 2.1 reference for ZudoJS: install as zudojs or zudo, create wired APIs, generate CRUD resources, add Prisma, Redis or Docker, exit codes."
source: https://zudojs.oyinlola.site/docs/packages-cli
---

v2.1.0

# zudojs-cli

Command-line interface infrastructure for Zudo — command registration, argument parsing, interactive prompts, output formatting, and progress display

CLI COMMANDS INTERACTIVE

## NEW IN 2.1

2.1 is about what the CLI *writes*. A project fresh out of `create` now runs, answers real requests and passes its tests, and every `generate` and `add` writes code that is already wired in and compiles. Nothing you typed against 2.0 stops working.

- **Two install names, two command names.** `npm install -g zudojs` works as well as `zudojs-cli`, and both give you `zudojs` and the short alias `zudo`. See [Installation](#install).
- **`new`** is an alias of `create`, and running `zudo` with no arguments in a terminal opens a [numbered menu](#menu).
- **Wired projects.** `src/server.ts` builds a router, applies security headers, closed-by-default CORS and rate limiting, and serves an example `/api/v1/examples` resource, `/health`, `/openapi.json` and `/docs`. See [What a new project contains](#create-contents).
- **`generate resource <name>`** writes a complete CRUD endpoint (DTO, repository, service, controller, routes, test) and registers it. See [generate resource](#generate-resource).
- **`add` writes real integrations** for `database` (Prisma 7), `redis`, `websockets`, `email`, `docker` and seven more, instead of only installing a package. See [Add](#add).
- **Clear exit codes.** Usage errors exit `2`, unknown commands exit `3` with a “Did you mean” hint. See [Exit codes](#exit-codes).
- **A stricter parser.** Only the first word selects the command, so a typo no longer runs a different command and exits `0`. Extra words after `-v`, an empty `--port=`, a non-finite number such as `Infinity`, and `--__proto__`-style option names are all usage errors, and control characters in anything the CLI echoes back are escaped.
- **Current toolchains.** Backends get TypeScript 7, Vitest 5 and `@types/node` 26; frontend templates were moved to Vite 8, React 19.3, Next 16, Nuxt 4, Astro 7, Angular 22 and SvelteKit 2.70. See [Frontend and fullstack](#frontend-fullstack).

## UPGRADING TO 2.0

> THIS IS A MAJOR
>
>
>
> Several commands now **refuse** where 1.2.1 proceeded, and one command that used to exit `0` on failure now exits non-zero. In each case the old behaviour was a bug, but a script or CI job written against it will notice. Two changes also affect what a correct command line produces: `create` no longer invents example services, and `generate service` now lands where the template expects it.

| Area | 1.2.1 | 2.0.0 |
| --- | --- | --- |
| create — failed install | Warned, printed “Project created successfully” and exited `0` | Keeps the project and prints the retry command, then exits non-zero. The closing line is “Project created, but dependencies were NOT installed.” |
| build — outside a project | Climbed to any ancestor holding a bare `package.json` and ran that project’s `scripts.build` | Requires a real Zudojs project (a `.zudojs/manifest.json`, a legacy `zudojs.config.ts`, or a `zudojs` block in `package.json`) and throws `CLINotInProjectError` otherwise |
| generate — outside a project | Warned and wrote files into the current directory; from a subdirectory it created a second `src/` tree | Throws `CLINotInProjectError`, and inside a project walks up to the root so every path is relative to it |
| Ctrl-C | A cancelled prompt exited `0`; Ctrl-C mid-scaffold was swallowed entirely and the run continued | Exits `130`. Ctrl-C during `create` removes the half-written project first, and names anything it could not remove |
| CLI_ENVIRONMENT | Carried `NODE_ENV` and `DEBUG: "DEBUG"`, neither of which anything read | Names the four variables the CLI really reads — see [Constants](#constants) |
| RollbackManager.rollback() | Promise<void> | Promise<RollbackResult> — { removed, failures } |
| CapabilityResolutionResult | Had a `conflicts` field | Removed — it was structurally incapable of being non-empty. `{ capabilities, dependencies }` remain |
| Project names | A leading `-` was accepted, so `zudojs create -- --weird` made a directory `cd` could not enter | Must start with a letter or digit, then letters, digits, `-` or `_` |
| Schematic names | `generate module 2fa` wrote `import { 2faModule }` into `src/app.ts` and exited `0` | A name whose normalized form starts with a digit is refused, because it becomes a TypeScript class name |
| Printed app name | Zudojs | zudojs — the command you actually type |
| create — example services | With no `--services`, invented four domains for a microservice project and three modules for a modular monolith | An empty list means none — see [Create](#create) |

### What to change in a CI job

- A job that ran `zudojs create` and relied on exit `0` to mean “scaffolded” now also gets “and installed”. If you do not want the install, pass `--no-install` rather than ignoring the failure.
- A job that ran `zudojs build` from a directory that is not inside a Zudojs project was building something else. Run it from the project, or from any directory inside it.
- Pin the capability set explicitly with `--capabilities` instead of relying on the non-interactive default, which is now also reachable from the interactive prompt.

> NOT VERIFIED ON WINDOWS
>
>
>
> The `cmd.exe` quoting hardening (an argument containing `"`, `%` or `!` is rejected rather than escaped, because a backslash is not a `cmd` escape) and `NoDefaultCurrentDirectoryInExePath` were tested as pure functions on Linux by passing `"win32"` explicitly. They have not been exercised on a real Windows host.

## OVERVIEW

`zudojs-cli` is the command-line interface for the Zudo framework. It provides project scaffolding, code generation, dependency management, and project diagnostics — all with interactive prompts powered by `@clack/prompts`.

The CLI supports **11 frontend frameworks** (React, Next, Vue, Nuxt, Angular, Svelte, SvelteKit, Astro, Vanilla, Flutter, React Native), **4 package managers** (pnpm, npm, yarn, bun), **3 database engines** (PostgreSQL, MySQL, SQLite), **14 code schematics** (from a whole CRUD `resource` down to a single validator) and **12 features** for `add`, from a Prisma database to a Dockerfile.

Upgrading from 1.2.x? Read [Upgrading to 2.0](#upgrading) first — several commands now refuse where they used to proceed.

> KEY FEATURES
>
>
>
> - **Interactive prompts** — Guided project creation with @clack/prompts
> - **Multi-architecture** — Monolith, modular-monolith, microservice
> - **Fullstack support** — Backend + frontend in a single workspace
> - **Wired projects** — A new backend runs, serves an example resource, `/health` and OpenAPI docs, and passes its tests
> - **Code schematics** — Generate CRUD resources, services, modules, commands, queries, controllers, and more, registered for you
> - **Real integrations** — `add` writes working code for a database, Redis, WebSockets, email, Docker and more
> - **Numbered menu** — Run `zudo` with no arguments in a terminal to pick a command
> - **Rollback safety** — A failed or interrupted `create` removes the half-written project
> - **Manifest tracking** — Project configuration stored in `.zudojs/manifest.json` and in the `zudojs` block of `package.json`
> - **Per-command help** — `zudo <command> --help` prints usage, arguments, options, shorts and defaults

## INSTALLATION

The CLI is a program you run in a terminal. It writes new projects and new files for you, so you do not have to set up folders, wiring and configuration by hand. You need Node.js 24 or newer.

```ts
# Install globally. Either package name works:
npm install -g zudojs
# or
npm install -g zudojs-cli

# Or run it once without installing
npx zudojs create my-api
```

Both packages install the same CLI under two command names: `zudojs` and the short alias `zudo`. Use whichever you like; this page mostly writes `zudo`. The `zudojs` package is a thin wrapper that runs `zudojs-cli`, so the two can never disagree about behaviour or version.

Help text, usage lines and error messages repeat the name you typed. Type `zudo` and the hints say `zudo`:

```bash
$ zudo creat my-api
Command "creat" was not found.
Did you mean "zudo create"?
Run "zudo --help" to see all commands.
```

> OLD VERSION STILL SHOWING?
>
>
>
> If `zudojs -v` does not print the latest version (`2.1.0` at the time of writing), clear npm’s cache and reinstall: `npm cache clean --force`, then `npm install -g zudojs@latest` (or `zudojs-cli@latest`, whichever you installed). On a permission error, do not use `sudo`; point npm at a folder you own with `npm config set prefix '~/.npm-global'` and add `~/.npm-global/bin` to your `PATH`.

**Binaries:** `zudojs-cli` installs `zudojs`, `zudo` and `zudojs-cli`, all pointing at `./dist/src/bin/zudojs.js`. The `zudojs` package (currently 1.0.1, which depends on `zudojs-cli` 2.1.0) installs `zudojs` and `zudo`, and its `bin/zudojs.js` only imports `zudojs-cli/bin`.

## INTERACTIVE MENU

If you do not remember a command, run `zudo` (or `zudojs`) on its own. In a terminal it opens a numbered menu:

```bash
$ zudo
┌  zudo v2.1.0
│
◆  What would you like to do?
│  ● 1. Create a new project
│  ○ 2. Start dev server
│  ○ 3. Generate code
│  ○ 4. Add a feature
│  ○ 5. Build
│  ○ 6. Doctor
│  ○ 7. Info
│  ○ 8. Help
│  ○ 0. Exit
└  ↑/↓ move · 0-8 pick · Enter select · Esc exit
```

Press a digit to pick an entry at once, or move with the arrow keys and press Enter. Each entry runs the ordinary command and asks for whatever it needs: “Create” runs the usual `create` questions, “Generate code” asks for the schematic and the name, “Add a feature” asks which feature. “Start dev server”, “Generate code”, “Add a feature” and “Build” need a Zudojs project; outside one the menu says so and shows itself again.

`0` exits with status `0`. Esc or Ctrl+C prints “Operation cancelled.” and exits with `130`, like every other prompt.

> NEVER IN CI OR PIPES
>
>
>
> The menu only opens when both stdin and stdout are terminals and `CI` is not set. A piped, redirected or CI run (`zudo | cat`) prints the help text and exits `0` instead of waiting for a key press, and `--help` / `--version` never open it.

## EXIT CODES

Every program ends with a number called its *exit code*. `0` means it worked; anything else means it did not. Scripts and CI jobs read this number to decide whether to continue, so the CLI keeps it precise:

| Status | Meaning |
| --- | --- |
| 0 | Success. Also `--help`, `--version`, and “Exit” in the menu |
| 1 | The command ran and failed: a build error, not inside a project, a name that is refused, a file that already exists |
| 2 | Usage error: a missing argument, an unknown or malformed option, or an option placed before the command |
| 3 | Unknown command, with a “Did you mean …?” hint when one is close |
| 130 | Cancelled with Ctrl+C or Esc |

Options go *after* the command name (`zudo dev --port 4000`). An option placed before it is reported rather than silently dropped, and only the first word can be the command, so a typo is an error instead of a different command:

```bash
$ zudo --port 4000 dev
Unexpected option "--port" before the command. Options go after the command name: "zudo dev --port".
Run "zudo --help" for usage.
# exit code 2

$ zudo generate
Missing required argument "schematic".
Run "zudo generate --help" for usage.
# exit code 2

$ zudo dev --port Infinity
Option "port" expects a number, received "Infinity".
Run "zudo dev --help" for usage.
# exit code 2

$ zudo -v extra
Unexpected argument "extra" after "-v".
Run "zudo --help" for usage.
# exit code 2
```

`zudojs build` and `zudojs doctor` exit non-zero when they fail, so both work as CI gates.

## QUICK START

The whole loop in eight commands. [Your First App](https://zudojs.oyinlola.site/docs/getting-started-first-app.md) walks through the same steps slowly, with the output of each one.

```ts
# Create a backend API (new is an alias of create)
zudo new my-api
cd my-api

# Start it; the server answers on http://localhost:3000
zudo dev

# Generate a CRUD endpoint at /api/v1/users, already registered
zudo generate resource users

# Add a feature: a Redis client with a health check
zudo add redis

# Build, diagnose, and show project info
zudo build
zudo doctor
zudo info
```

The same `create` without any questions, for scripts and CI. The project name is a positional argument, not `--project-name`:

```ts
zudojs create my-app \
  --type backend \
  --architecture monolith \
  --database postgresql \
  --package-manager pnpm \
  --capabilities cqrs,messaging,observability,openapi,database
```

## BUILT-IN COMMANDS

The CLI ships with 7 built-in commands. `create` prompts interactively in a terminal and takes flags otherwise; the rest read the project from `.zudojs/manifest.json` (or the `zudojs` block in `package.json`) and refuse to run outside a Zudojs project. You can run them from any folder inside the project: the CLI walks up to find its root.

Every command documents itself: `zudo <command> --help`, `-h` and `zudo help <command>` all print the same block. Before 2.0 the first two were handed to the parser, which rejected `--help` as an undeclared option and exited `2`, so no command’s flags could be discovered from the CLI itself.

```bash
$ zudo --help
zudo v2.1.0
Command-line interface for the Zudojs framework.

Usage:
  zudo <command> [options]

Commands:
  add           Add a feature package to a Zudojs project
  build (b)     Build a Zudojs project
  create (new)  Create a new Zudojs project
  dev (d)       Start development servers
  doctor        Run diagnostics on a Zudojs project
  generate (g)  Generate files within a Zudojs project
  info          Show information about the Zudojs CLI and project

Options:
  -h, --help     Show help.
  -v, --version  Show version.

Run "zudo help <command>" for help on one command.
```

| Command | Alias | Description |
| --- | --- | --- |
| CREATE | new | Scaffold a new, wired Zudo project (backend, frontend or fullstack) |
| GENERATE | g | Generate code from 14 schematics, including a full CRUD `resource`; runs from any directory inside the project and throws `CLINotInProjectError` outside one |
| ADD | — | Add a feature (database, Redis, WebSockets, email, Docker, …) with working code, config and environment variables; `--service` targets one microservice app |
| DOCTOR | — | Run project diagnostics |
| INFO | — | Show project info and dependencies |
| DEV | d | Start the development servers (backend, frontend, or both) through the project’s package manager (`pnpm run dev`, `npm run dev`, …); `--backend-only`, `--frontend-only`, `--port` |
| BUILD | b | Run the `build` script with the detected package manager; exits non-zero on failure, and refuses outside a Zudojs project |

One command’s help, in full:

```bash
$ zudo create --help
Usage:
  zudo create [<project-name>] [options]

Description:
  Create a new Zudojs project

Aliases:
  new

Arguments:
  [<project-name>]  The name of the project to create

Options:
  -t, --type <string>                   Project type (backend, frontend, fullstack) (default: backend)
  -a, --architecture <string>           Backend architecture (monolith, modular-monolith, microservice) (default: monolith)
  -p, --package-manager <string>        Package manager (npm, pnpm, yarn, bun) (default: pnpm)
  -d, --database <string>               Database engine (postgresql, mysql, sqlite) (default: postgresql)
  --api <string>                        API style (rest, graphql, rpc) (default: rest)
  -f, --frontend <string>               Frontend framework (react, next, vue, nuxt, angular, svelte, sveltekit, astro, vanilla, flutter, react-native) (default: none)
  -F, --frontend-architecture <string>  Frontend architecture (zudojs-standard, feature-based, minimal, framework-default) (default: zudojs-standard)
  -l, --language <string>               Language (typescript, javascript) (default: typescript)
  --no-install                          Skip dependency installation (default: false)
  --no-git                              Skip git initialization (default: false)
  --services <string>                   Comma-separated service names (microservice architecture only)
  --capabilities <string>               Comma-separated capabilities (cqrs, events, messaging, queue, observability, openapi, database, security)
  -h, --help                            Show help for this command.
```

## CREATE

Scaffold a new Zudo project with interactive prompts or explicit flags. Supports backend, frontend, and fullstack project types.

> THE PROJECT NAME IS A POSITIONAL ARGUMENT
>
>
>
> It is `zudojs create my-app`, not `zudojs create --project-name my-app`. There is no `--project-name` option, and passing one fails as an unknown option. The name is optional only in a terminal, where the prompt asks for it; a non-interactive run without it fails with “Project name is required.”
>
>
>
> A name must start with a letter or digit and then contain only letters, digits, `-` and `_`. It may not contain `/`, `\` or `..`.

### Interactive Mode

```ts
zudojs create my-project

// Prompts for:
// 1. Project name
// 2. Project type (backend / frontend / fullstack)
// 3. Backend architecture (monolith / modular-monolith / microservice)
// 4. Database (postgresql / mysql / sqlite)
// 5. API style (rest / graphql / rpc)
// 6. Frontend framework (if applicable)
// 7. Frontend architecture
// 8. Package manager (pnpm / npm / yarn / bun)
// 9. Capabilities (cqrs, events, messaging, queue, observability, openapi, database, security)
// 10. Confirmation
```

The services prompt appears only for a microservice architecture, and the database, API-style and frontend prompts only for the project types that have them. Flags you pass on the command line seed the matching prompt, so `zudojs create my-app --architecture microservice --capabilities cqrs,security` opens with those already selected.

Cancelling any prompt with Ctrl-C ends the run with status `130`; answering “no” at the confirmation ends it with `0` and writes nothing. Ctrl-C after the scaffold has started removes the partially written directory before exiting.

### Non-Interactive Mode

```ts
zudojs create my-project \
  --type backend \
  --architecture modular-monolith \
  --database postgresql \
  --api rest \
  --package-manager pnpm \
  --language typescript \
  --capabilities cqrs,messaging,observability,openapi,database \
  --no-install \
  --no-git
```

A run is non-interactive whenever stdin is not a TTY. Without `--capabilities` such a run enables the set it has always hard-coded — `cqrs`, `messaging`, `observability`, `openapi` and `database` — so adding the flag in 2.0 does not change what an existing command line produces.

### Argument

| Argument | Required | Description |
| --- | --- | --- |
| <project-name> | Optional in a terminal; required otherwise | The directory to create, under the current working directory. Positional — there is no `--project-name` flag |

### Options

| Flag | Short | Default | Description |
| --- | --- | --- | --- |
| --type | -t | backend | Project type |
| --architecture | -a | monolith | Backend architecture |
| --database | -d | postgresql | Database provider |
| --api | — | rest | API style |
| --package-manager | -p | pnpm | Package manager |
| --frontend | -f | none | Frontend framework |
| --frontend-architecture | -F | zudojs-standard | Frontend architecture |
| --language | -l | typescript | Language (frontend only; backend projects are TypeScript, and `javascript` is rejected for `--type backend`) |
| --services | — | — | Comma-separated service names (microservice architecture only). Omitted means no services — the project gets its gateway and nothing else. `gateway` is reserved and duplicates are dropped |
| --capabilities | — | — | **New in 2.0.** Comma-separated capability ids: `cqrs`, `events`, `messaging`, `queue`, `observability`, `openapi`, `database`, `security`. An unknown id fails the command |
| --no-install | — | false | Skip dependency installation |
| --no-git | — | false | Skip git initialization |

### Capabilities

`--capabilities` is honoured by both branches: it seeds the interactive multiselect and it replaces the hard-coded set in a non-interactive run, so the two ways of running `create` can produce the same project. Selected capabilities are recorded as `capabilities` in `.zudojs/manifest.json` and as `zudojs.features` in each backend `package.json`, and the packages that back them are added as dependencies.

Before 2.0 the prompt offered eight options and the command read six: ticking **Events** or **Security** produced no dependency, no manifest entry and no message. Both are consumed now — ticking Security installs `@zudojs/security`.

| Capability | Package it adds | In the default non-interactive set |
| --- | --- | --- |
| cqrs | `@zudojs/cqrs`, plus `@zudojs/events` | Yes |
| events | `@zudojs/events` (already a base dependency of every generated app) | No |
| messaging | @zudojs/messaging | Yes |
| queue | @zudojs/queue | No |
| observability | @zudojs/observability | Yes |
| openapi | @zudojs/openapi | Yes |
| database | @zudojs/database | Yes |
| security | @zudojs/security | No |

### No example services

An empty service list now means no services. A microservice project gets its gateway at `apps/gateway` and nothing under `apps/services/`; a modular monolith gets an empty module barrel at `src/modules/index.ts`. Both READMEs say how to add one. Named services are generated exactly as named, at `apps/services/<name>`. Every backend app does get one example HTTP resource, `/api/v1/examples`, to show how the layers connect; delete it once you have your own.

Before 2.0 the templates substituted example domains nobody asked for — `identity`, `enrollment`, `assessment` and `notification` for a microservice project, and three modules for a modular monolith, which was never even asked what it wanted.

### What a new project contains

A backend project is ready to run the moment `create` finishes. Here is what `zudo create my-api -p pnpm --no-git --no-install` prints:

```ts
◇  Project structure created
◇  Backend project generated (43 files)
Capabilities build on: messaging, events, logger, http, validation
◇  Project validated
│
◇  Next steps ───╮
│                │
│  cd my-api     │
│  pnpm run dev  │
│                │
├────────────────╯
│
└  Project created successfully.
```

- **A wired HTTP server.** A request travels `src/server.ts` → router → `registerRoutes` (`src/routes/index.ts`) → controller → service → repository. `src/container.ts` is the one place every controller, service and repository is built; `src/app.ts` assembles the runtime; `src/configs/index.ts` reads typed settings from `.env`. The [Project Structure](https://zudojs.oyinlola.site/docs/getting-started-project-structure.md) page walks through each file.
- **Routes that answer.** An example CRUD resource at `/api/v1/examples`, `GET /health` (200 when the runtime and every integration are up, 503 otherwise), and, with the `openapi` capability (on by default), the OpenAPI document at `/openapi.json` and a docs page at `/docs`.
- **Safe defaults.** Every response gets the `@zudojs/security` headers (CSP, HSTS, `nosniff`, `X-Frame-Options: DENY`, …). CORS is closed until you list origins in `CORS_ORIGINS`, and each client is rate limited by `RATE_LIMIT_MAX` requests per `RATE_LIMIT_WINDOW_MS` (300 per 60 000 ms by default).
- **A place for integrations.** `src/integrations/` holds clients with a lifecycle (Redis, the database, WebSockets, email). They start before the rest of the app and stop after it; on SIGINT/SIGTERM the server drains integrations, then stops HTTP, then the runtime.
- **A test that passes.** `tests/examples.test.ts` drives the example routes through `createHttpTestClient` from `@zudojs/testing`, so `pnpm test` is green on a fresh project.
- **Markers the CLI writes between.** Lists the CLI appends to are fenced by comments such as `// zudojs:routes:start` and `// zudojs:routes:end`. `generate` and `add` only insert between them. Do not delete them: a file without its markers is left alone, and you are told what to add by hand.
- **No `zudojs.config.ts`.** The project’s type, architecture, package manager and capabilities live in the `zudojs` block of `package.json` and in `.zudojs/manifest.json` (machine-managed). Every follow-up command reads them from there.
- **Real recorded capabilities.** Templates write the capability list into `zudojs.features` and install the packages backing it, so the `zudojs doctor` feature check has something to verify.
- **Framework versions that match the CLI.** `@zudojs/*` packages are added as caret ranges of the versions this CLI build targets (for example `"@zudojs/http": "^1.4.0"`), so a new project never resolves an older release that lacks an API the templates use. Projects created for pnpm also get a `pnpm-workspace.yaml` that allows esbuild’s build script, which pnpm 10+ would otherwise refuse to run.
- **Pinned frontend dependencies.** The frontend install path passes the resolved `name@range` to the package manager instead of the bare name, so two `create --frontend react` runs a month apart do not produce different majors.

> A FAILED INSTALL FAILS THE COMMAND
>
>
>
> If dependency installation fails, `create` keeps the generated project, prints the exact command to retry with, and exits non-zero. Through 1.2.1 it printed “Project created successfully” and exited `0`, so a CI job went green with no `node_modules`. `zudojs add` already behaved this way; the two commands no longer disagree.

### Frontend and fullstack

`--type frontend` creates only a web or mobile app; `--type fullstack` creates a workspace with the backend at `apps/api`, the frontend at `apps/web`, and shared `packages/contracts` and `packages/shared-types`. The root `package.json` runs `dev`, `build`, `test`, `lint` and `typecheck` across every app. In a fullstack microservice project the gateway and services sit at `apps/gateway` and `apps/services/<name>`, next to `apps/web`.

```ts
zudo create my-web --type frontend --frontend react
zudo create my-system --type fullstack --frontend next --architecture monolith
```

For each framework the CLI first runs its official starter (`create-vite`, `create-next-app`, `nuxi init`, the Angular CLI, `create-astro`, `npm create svelte`, …). When that is not available it writes a built-in template instead, pinned to these current majors:

| Framework | Version range |
| --- | --- |
| Vite (React, Vue, Svelte, Vanilla) | vite ^8.3.0 |
| React | react ^19.3.0 |
| Next.js | next ^16.3.6 |
| Nuxt | nuxt ^4.5.2 |
| Astro | astro ^7.3.4 |
| Angular | @angular/core ^22.1.7, built with @angular/build |
| SvelteKit | @sveltejs/kit ^2.70.3 |

> WHY FRONTENDS USE TYPESCRIPT 6 AND BACKENDS TYPESCRIPT 7
>
>
>
> A backend only runs `tsc` and `tsx`, so it gets TypeScript 7 (with Vitest 5 and `@types/node` 26). Frontend toolchains call the TypeScript 6 JavaScript API and say so in their peer ranges: `@angular/compiler-cli` and `@angular/build` need `>=6.0 <6.1`, `typescript-eslint` needs `<6.1.0`, and `@sveltejs/kit`, `svelte-check` and `@astrojs/check` need `^5 || ^6`. Frontends therefore get `~6.0.3` until those ranges admit 7. Angular projects also keep Vitest 4, which `@angular/build` requires.

## GENERATE

`generate` (alias `g`) writes new source files into an existing project, following the project’s layout, and registers them where they need to be registered. A *schematic* is the kind of thing to generate: `resource`, `module`, `command`, and so on. There are 14.

It reads `.zudojs/manifest.json` (or the `zudojs` block in `package.json`) to find the architecture and where the backend lives: `src/` of a backend project, `apps/api/src/` of a monolithic fullstack workspace, and `apps/gateway` or `apps/services/<name>` in a microservice project.

> CHANGED IN 2.0
>
>
>
> `generate` finds the project root by walking up from the current directory, so it can be run from anywhere inside the project and every path is resolved against that root. It used to resolve the layout from the current directory only: from a subdirectory it found nothing, warned, fell back to `src` and wrote a second tree (`proj/src/src/foo/…`) while exiting `0`.
>
>
>
> Outside a Zudojs project it now throws `CLINotInProjectError` rather than scattering files into the current directory, matching `dev`, `build` and `add`.

```ts
# A whole CRUD endpoint at /api/v1/users
zudo generate resource users

# A runtime module, registered in app.ts
zudo generate module billing

# A CQRS command and its handler
zudo generate command createBook

# Preview the files without writing anything
zudo generate resource books --dry-run

# Rewrite files that already exist
zudo generate resource users --force
```

### generate resource

A *resource* is one kind of thing your API manages, such as users or books, with the five standard operations: list, get one, create, update and delete (“CRUD”). `generate resource` writes every layer for it and wires them in, so the endpoint works as soon as the server restarts:

```bash
$ zudo generate resource users
Detected architecture: monolith
Generated 8 files:
  - src/dtos/users.dto.ts
  - src/repositories/users.repository.ts
  - src/services/users.service.ts
  - src/controllers/users.controller.ts
  - src/routes/users.routes.ts
  - tests/users.test.ts
  - src/routes/index.ts
  - src/container.ts
```

| File | What it is for |
| --- | --- |
| dtos/users.dto.ts | The data shapes, as `@zudojs/schema` schemas: a user as returned, the create and update bodies, and the `:id` path parameter (a UUID). Bad input gets a 400 listing each problem |
| repositories/users.repository.ts | Where records are stored. A `UsersRepository` interface plus `InMemoryUsersRepository` (lost on restart, capped at 10 000 records); after `zudo add database` it is a Prisma repository and a `User` model is added to `prisma/schema.prisma` |
| services/users.service.ts | The rules. Throws `NotFoundError` (a 404) for an unknown id |
| controllers/users.controller.ts | Turns an HTTP request into a service call and the result into a JSON response |
| routes/users.routes.ts | `GET`, `POST` `/api/v1/users` and `GET`, `PATCH`, `DELETE` `/api/v1/users/:id`, each with OpenAPI metadata |
| tests/users.test.ts | A test that creates, reads, updates and deletes a user through `createHttpTestClient` |
| routes/index.ts, container.ts | Updated, not replaced: the routes are registered and the controller is built, each between its `// zudojs:*` markers |

`--module <name>` puts the layers inside a module (`src/modules/catalog/dtos/products.dto.ts`, …) and registers the routes in that module’s `routes/index.ts`. In a microservice project, `--service <name>` puts them in that service’s app (`apps/services/billing/src/…`); without it they go to `apps/gateway`.

Once the app has a database, a dry run shows the Prisma files and the step left to you:

```bash
$ zudo generate resource books --dry-run
Detected architecture: monolith
Dry run: 10 files would be written or updated (nothing written):
  - src/dtos/books.dto.ts
  - src/repositories/books.repository.ts
  - src/repositories/books.prisma.repository.ts
  - src/services/books.service.ts
  - src/controllers/books.controller.ts
  - src/routes/books.routes.ts
  - tests/books.test.ts
  - prisma/schema.prisma
  - src/routes/index.ts
  - src/container.ts
Warning: Finish by hand:
  - Run "prisma migrate dev --name add-books" (the Book model was added to prisma/schema.prisma).
```

### What each schematic writes

Paths are for a monolith. `route`, `controller`, `repository` and `dto` write their own layer plus any lower layer that is missing, so the result always compiles.

| Schematic | Writes |
| --- | --- |
| resource | DTO, repository, service, controller, routes and a test, registered (above) |
| route | `src/routes/<name>.routes.ts`, registered in `src/routes/index.ts` and `src/container.ts`, plus any missing controller, service, repository and DTO |
| controller | `src/controllers/<name>.controller.ts`, plus any missing service, repository and DTO |
| repository | `src/repositories/<name>.repository.ts`, plus the DTO if missing |
| dto | `src/dtos/<name>.dto.ts` |
| module | `src/modules/<name>/`: a `BaseModule` subclass, a `features/` folder and a `routes/index.ts`; exported from the modules barrel and registered in `app.ts` and `src/routes/index.ts` |
| service | `src/services/<name>/` with a service class and empty `commands/` and `queries/` barrels (see per-architecture rules below) |
| command | `src/commands/<name>/`: a `@zudojs/cqrs` command and its handler; with `--service users`, `src/users/commands/<name>/` |
| query | `src/queries/<name>/`: a query and its handler; `--service` works as for `command` |
| middleware | `src/middlewares/<name>.middleware.ts`, a starting point to fill in |
| event | `src/events/<name>.event.ts`, an event interface |
| job | `src/jobs/<name>.job.ts`, a job function |
| model | `src/models/<name>.model.ts`, a model interface |
| validator | `src/validators/<name>.validator.ts`, a validation function |

### Missing dependencies are added for you

If a generated file imports a `@zudojs/*` package the app does not depend on yet, `generate` adds it to the owning `package.json` (at the version this CLI targets) and tells you to install, instead of leaving a `Cannot find module` error behind. In a project created without the `cqrs` capability:

```bash
$ zudo generate command billing
Detected architecture: monolith
Generated 3 files:
  - src/commands/billing/billing.command.ts
  - src/commands/billing/billing.handler.ts
  - src/commands/billing/index.ts
Warning: Added @zudojs/cqrs to package.json.
Warning: Run your package manager's install command to fetch them.
```

### Names

Type the name however you like; files use lower-case words joined by hyphens and classes use PascalCase. camelCase keeps its word boundaries, so `createBook` becomes `create-book` and `CreateBookCommand`:

```bash
$ zudo generate command createBook
Detected architecture: monolith
Generated 3 files:
  - src/commands/create-book/create-book.command.ts
  - src/commands/create-book/create-book.handler.ts
  - src/commands/create-book/index.ts
```

A name is a name, not a path: anything containing `/`, `\` or `..` is refused, so a generator can never write outside its folder. A name that would start with a digit is refused too, because it becomes a TypeScript class name. Both exit `1` and write nothing:

```bash
$ zudo generate resource ../evil
Invalid resource name: "../evil". Use a plain name such as "users"; paths are not allowed.

$ zudo generate resource 2fa
Invalid resource name: "2fa". It must start with a letter: the name becomes a TypeScript class name, and "2fa" is not a valid identifier. Try "two-factor-auth" instead of "2fa".
```

`--service` and `--module` values must also be a single safe path segment.

### Running it twice, --force and --dry-run

`generate` never overwrites a file that already exists and would change. Running the same name twice fails cleanly, lists the files and exits `1`:

```bash
$ zudo generate resource users
Detected architecture: monolith
resource "users" already exists:
  - src/dtos/users.dto.ts
  - src/repositories/users.repository.ts
  - src/services/users.service.ts
  - src/controllers/users.controller.ts
  - src/routes/users.routes.ts
  - tests/users.test.ts
Choose another name, or re-run with --force to regenerate these files.
```

`--force` rewrites those files (your edits in them are lost). Registrations between markers are only ever added, never duplicated. `--dry-run` prints the file list and writes nothing.

### Options

| Flag | Short | Applies to | Description |
| --- | --- | --- | --- |
| --module <name> | -m | Every schematic but `module` | Generates into `<root>/modules/<name>` instead of the schematic’s default directory |
| --service <name> | -s | Microservice projects; CQRS `command`/`query` | In a microservice project, selects the app the schematic belongs to (`apps/services/<name>/src`); otherwise names the CQRS group. Without it, a microservice schematic goes to `apps/gateway/src` |
| --dry-run | — | All | Lists the files without writing anything |
| --force | — | All | Overwrites the files that already exist and would change |

### Available Schematics

resource

service

module

command

query

controller

repository

middleware

event

job

route

model

dto

validator

### Architecture-Aware Placement

| Architecture | Services Go To | Modules Go To |
| --- | --- | --- |
| monolith | src/services/ | src/modules/ |
| modular-monolith | src/modules/ (service maps to module) | src/modules/ |
| microservice | refused — use --services at create | apps/gateway/src/modules/ or apps/services/<name>/src/modules/ |

Every other schematic follows the same root: `src/` in a monolith or modular monolith, and `apps/gateway/src` — or `apps/services/<name>/src` with `--service <name>` — in a microservice project. Adding `--module <name>` nests the result in `<root>/modules/<name>`.

### generate service, per architecture

`generate service` was broken in all three architectures before 2.0. What it does now:

- **monolith** — writes to `src/services/<name>/`, under the directory the template already owns. It used to write `src/<name>/`, leaving two conventions in one project and a service that the `src/services/index.ts` barrel never exported.
- **modular monolith** — the schematic is rewritten to `module`, generated at `src/modules/<name>/` and registered in `app.ts`. It used to log `Mapping "service" → "module"` and then run the service schematic anyway, producing four inert files the runtime never loaded.
- **microservice** — **refused.** A service there is a whole workspace app (`package.json`, `tsconfig.json`, `Dockerfile`, `src/app.ts`, `src/server.ts` and a port), which this schematic does not produce. It used to write a bare service class into `apps/services/<name>/`; that directory matches the workspace glob but has no manifest, so pnpm skipped it, `pnpm -r run build` never compiled it, and `zudojs add --service <name>` reported it as unknown — all while exiting `0`. The error names the two commands that do work:

```ts
# Add the service at creation time
zudojs create my-system --architecture microservice --services billing

# Or add a module to an app that already exists
zudojs generate module billing --service identity
```

### generate module

`zudo generate module <name>` writes a runtime module (a `BaseModule` subclass that the runtime starts and stops), a `features/` folder and a `routes/index.ts` for the module’s own endpoints. It exports the module from the modules barrel, registers it in `app.ts`, and registers its routes in `src/routes/index.ts`. If it cannot edit one of those files automatically it says so and prints the lines to add by hand.

```bash
$ zudo generate module billing
Detected architecture: modular-monolith
Generated 8 files:
  - src/modules/billing/billing.module.ts
  - src/modules/billing/index.ts
  - src/modules/index.ts
  - src/modules/billing/features/billing.feature.ts
  - src/modules/billing/features/index.ts
  - src/modules/billing/routes/index.ts
  - src/app.ts
  - src/routes/index.ts
```

> WRITES STAY INSIDE THE PROJECT
>
>
>
> Path containment used to be checked on the literal string only, so a symlinked directory inside the project carried generated files to the symlink’s target. Containment is now re-asserted against the resolved real path, and a write that would escape fails with the path that caused it.

## ADD

`add` plugs a feature into an existing project: a database, a Redis connection, a WebSocket server, email, Docker files, and more. It does not just install a package. It writes working code, registers it, adds its settings to `src/configs/index.ts` and its variables to `.env.example`, adds the dependencies, records the feature in `package.json` and the manifest, and installs (skip that with `--skip-install`).

Most features become an *integration*: a file in `src/integrations/` that starts with the app, stops after it, and reports its health on `/health`. Files that already exist are kept, so running `add` twice is safe.

The examples below pass `--skip-install` so the output fits on the page. Without it, `add` prints `Installing dependencies with pnpm...` (or your package manager) and the installer’s own output just before the “added successfully” line.

```bash
$ zudo add redis --skip-install
Adding feature: redis — Redis client (src/integrations/redis.ts) with a health check
Created:
  - src/integrations/redis.ts
Updated:
  - src/integrations/index.ts
  - src/configs/index.ts
  - .env.example
  - package.json
Feature "redis" added successfully.
Next: Use it anywhere after start: import { redis } from "./integrations/redis.js"; await redis().set("key", "value");
```

### Available features

| Feature | What it writes | Adds to .env.example |
| --- | --- | --- |
| database | PostgreSQL through Prisma 7: `prisma/schema.prisma`, `prisma.config.ts`, `src/integrations/database.ts` (exports `prisma()`), `@zudojs/database`, and the `db:generate`, `db:migrate` and `db:deploy` scripts. `build` becomes `prisma generate && tsc`. Resources generated afterwards use Prisma | DATABASE_URL |
| redis | `src/integrations/redis.ts`: a client (exports `redis()`) that fails fast at start-up and reconnects afterwards, with a health check | REDIS_URL |
| websockets | `src/integrations/websockets.ts`: a `ws` server on the same port as HTTP; browsers must come from an origin in `CORS_ORIGINS` | WEBSOCKET_PATH |
| email | `src/integrations/email.ts`: logs messages to the console in development, sends over SMTP with nodemailer when `EMAIL_TRANSPORT=smtp` | EMAIL_TRANSPORT, EMAIL_FROM, SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD |
| docker | A `Dockerfile` per backend app, `.dockerignore`, and `compose.yaml` with a service per app and per enabled integration (postgres, redis, mailpit). See below | POSTGRES_PASSWORD (when the database feature is on) |
| queue | `src/integrations/queue.ts`: an in-process job queue (`@zudojs/queue`) | QUEUE_CONCURRENCY |
| scheduler | `src/integrations/scheduler.ts`: a cron scheduler (`@zudojs/scheduler`) with an example job to replace | — |
| cache | `src/integrations/cache.ts`: an in-memory cache (`@zudojs/cache`) | CACHE_MAX_ENTRIES, CACHE_DEFAULT_TTL_MS |
| messaging | `src/integrations/messaging.ts`: an in-process message bus (`@zudojs/messaging`) | — |
| observability | `src/integrations/observability.ts`: metrics, tracing and structured logs (`@zudojs/observability`) | SERVICE_NAME |
| storage | `src/integrations/storage.ts`: local object storage (`@zudojs/storage`) | STORAGE_DIRECTORY |
| openapi | Adds `mountOpenAPI` to `src/server.ts`, serving `/openapi.json` and `/docs` (already there when the project was created with the `openapi` capability) | — |

### Aliases

`postgres`, `postgresql` and `prisma` mean `database`; `ws` and `websocket` mean `websockets`; `mail` means `email`. A second run keeps what is there:

```bash
$ zudo add postgres --skip-install
Adding feature: database — PostgreSQL via Prisma 7 (prisma/schema.prisma, src/integrations/database.ts, db:* scripts)
Updated:
  - package.json
Kept (already present):
  - prisma/schema.prisma
  - prisma.config.ts
  - src/integrations/database.ts
Feature "database" added successfully.
Next: Set DATABASE_URL in .env, then run the db:migrate script after adding models.
Next: Resources generated from now on use Prisma; existing ones keep their in-memory repository until you swap it in src/container.ts.
```

The database recipe supports PostgreSQL only, because `@zudojs/database` is a PostgreSQL layer. A project created with `--database mysql` or `sqlite` is told so and nothing is written.

### Refused: docs and security

Two names people try are refused with an explanation, exit `1`, and change nothing:

```bash
$ zudo add security
"security" cannot be added: it is built in. Every generated server applies the @zudojs/security default headers, a CORS policy (CORS_ORIGINS) and per-client rate limiting (RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS), and depends on @zudojs/security already.

$ zudo add docs
"docs" cannot be added: @zudojs/docs builds documentation sites; it has nothing to wire into an application. Install it directly with your package manager if you need it.
```

### Docker

`zudo add docker` packages the app as a container image. The `Dockerfile` is multi-stage (build with dev dependencies, ship only production ones) on Node 24, runs as the unprivileged `node` user rather than root, and has a `HEALTHCHECK` that calls `/health`. In `compose.yaml` the app is published on its port, while databases and other backing services bind to `127.0.0.1` only, so they are not reachable from other machines. With the database feature on, `docker compose` refuses to start until you set `POSTGRES_PASSWORD` in `.env`, so no database runs with a default password.

```bash
$ zudo add docker --skip-install
Adding feature: docker — Dockerfile (multi-stage, non-root, Node 24), .dockerignore and compose.yaml
Created:
  - .dockerignore
  - Dockerfile
  - compose.yaml
Updated:
  - .env.example
Feature "docker" added successfully.
Next: cp .env.example .env, then: docker compose up --build
```

A project that already has a compose file (microservice projects are created with `docker-compose.yml`) keeps it.

### Microservice projects

Without `--service`, `add` applies the feature to every backend app. `--service <name>` (or `--service gateway`) applies it to one. The root `package.json` is updated too, because it records the project’s features:

```bash
$ zudo add redis --service billing --skip-install
Adding feature: redis — Redis client (src/integrations/redis.ts) with a health check
Created:
  - apps/services/billing/src/integrations/redis.ts
Updated:
  - apps/services/billing/src/integrations/index.ts
  - apps/services/billing/src/configs/index.ts
  - apps/services/billing/.env.example
  - apps/services/billing/package.json
  - package.json
Feature "redis" added successfully.
Next: Use it anywhere after start: import { redis } from "./integrations/redis.js"; await redis().set("key", "value");
```

Since 2.0 the manifest is read and validated before any `package.json` is touched, so a failure can no longer leave the project half-updated. It is written atomically and serialized by a lock, so two concurrent `zudojs add` runs cannot lose an update, and a corrupt manifest is reported distinctly from a missing one.

## DOCTOR

Run project diagnostics to check for common issues. Each check is either an error or a warning; `doctor` exits non-zero when any error-severity check fails, so it can be used as a CI gate. Warnings are printed and do not change the exit code.

The **Features** check could never report anything before 2.0: every template stamped `zudojs.features: []` into the `package.json` it wrote, although it had already used the capability flags to choose the project’s dependencies, so the check passed vacuously in every project the CLI created. Templates now record the real capability list and install the packages backing it, so the check has something to verify.

```ts
zudojs doctor
```

### Checks Performed

| Check | What It Verifies |
| --- | --- |
| Node.js version | Node.js >= v24 |
| Git | git is installed and on PATH (warning) |
| Zudojs project | .zudojs/manifest.json, a legacy zudojs.config.ts, or package.json#zudojs describes the project |
| Package manager | Lock file of the recorded package manager exists (pnpm/npm/yarn/bun) |
| Dependencies installed | node_modules exists |
| TypeScript configuration | tsconfig.json exists in every app (root, apps/api, apps/web, gateway and services) |
| Zudojs dependencies | @zudojs/* packages declared by the backend apps |
| Features | Every feature in package.json#zudojs.features has the package `zudojs add` installs for it |

## INFO

Display the CLI version, the project’s recorded type, architecture, package manager and capabilities, and the Zudo dependencies of each backend app. Also asks npm whether a newer `zudojs-cli` exists (set `ZUDOJS_NO_UPDATE_CHECK=1` or `CI` to skip that).

```ts
zudojs info

// Output (a new monolith created with -p npm):
// Zudojs CLI
//   Version: 2.1.0
//   Node.js: v24.19.0
//
// Project
//   Name: my-api
//   Version: 0.1.0
//   Type: backend
//   Architecture: monolith
//   Package manager: npm
//   Capabilities: cqrs, messaging, observability, openapi, database
//
// Zudojs dependencies
//   @zudojs/config: ^1.3.0
//   @zudojs/constants: ^1.1.2
//   @zudojs/container: ^1.2.0
//   @zudojs/core: ^1.2.2
//   @zudojs/cqrs: ^1.2.0
//   @zudojs/database: ^1.3.0
//   @zudojs/errors: ^1.3.0
//   @zudojs/events: ^1.3.0
//   @zudojs/http: ^1.4.0
//   @zudojs/logger: ^1.4.0
//   @zudojs/messaging: ^1.2.0
//   @zudojs/observability: ^1.2.0
//   @zudojs/openapi: ^1.5.0
//   @zudojs/runtime: ^1.3.0
//   @zudojs/schema: ^1.2.0
//   @zudojs/security: ^1.3.0
//   @zudojs/types: ^1.2.0
//   @zudojs/validation: ^1.1.0
```

## ADAPTERS

The CLI uses adapter patterns for frontend frameworks, package managers, and databases.

### Frontend Adapters (11)

ReactAdapter

NextAdapter

VueAdapter

NuxtAdapter

AngularAdapter

SvelteAdapter

SvelteKitAdapter

AstroAdapter

VanillaAdapter

FlutterAdapter

ReactNativeAdapter

### Package Manager Adapters (4)

PnpmAdapter

NpmAdapter

YarnAdapter

BunAdapter

### Database Adapters (3)

PostgresAdapter

MySqlAdapter

SqliteAdapter

## GENERATORS

Code generators for different project aspects.

| Generator | Purpose |
| --- | --- |
| generateProject() | Generate full project from ScaffoldOptions |
| BackendGenerator | Generate backend structure |
| FrontendGenerator | Generate frontend with framework adapter |
| FullstackComposer | Compose backend + frontend workspace |
| IntegrationGenerator | Generate API integration configs |
| InfrastructureGenerator | Dockerfiles, docker-compose.yml and .dockerignore |

## APPLICATION API

Create custom CLI applications using the `ZudojsCLI` class.

```ts
import { createCLI, command } from "zudojs-cli";

const app = createCLI({
  name: "my-tool",
  version: "1.0.0",
  description: "My custom CLI tool",
});

app.register(
  command("greet", (ctx) => {
    const name = ctx.values["name"] ?? "World";
    console.log(`Hello, ${name}!`);
  })
);

app.register(
  command("build", async (ctx) => {
    await buildProject(ctx.values);
  })
);

// Lifecycle hooks
app.use({
  beforeRun: (ctx) => console.log(`Running ${ctx.command}...`),
  afterRun: (ctx, code) => console.log(`Done (exit ${code})`),
  onError: (err) => console.error(`Error: ${err.message}`),
});

const exitCode = await app.run();
process.exit(exitCode);
```

### ZudojsCLI Methods

| Method | Returns | Description |
| --- | --- | --- |
| register(cmd) | this | Register a single command |
| registerMany(cmds) | this | Register multiple commands |
| use(hooks) | this | Set lifecycle hooks |
| run(args?) | Promise<number> | Execute the CLI, returns exit code |
| isRunning | boolean | Whether app is currently running |
| commandCount | number | Number of registered commands |

## PARSER

Parses CLI arguments into structured commands, options, and positional arguments.

```ts
import { CLIParser, createCommand, parseCLIArguments } from "zudojs-cli";

// Without a command definition only the command and positionals are known;
// an undeclared option such as --type is refused (exit code 2)
parseCLIArguments(["create", "my-app"]);
// { command: "create", commands: ["create"], args: ["my-app"], options: {} }

// With a definition, pass the arguments that follow the command name
const create = createCommand({
  name: "create",
  arguments: [{ name: "project-name" }],
  options: [
    { name: "type", short: "t", type: "string" },
    { name: "database", short: "d", type: "string" },
  ],
  execute() {},
});
parseCLIArguments(["my-app", "--type", "backend", "-d", "postgresql"], create);
// { commands: [], args: ["my-app"],
//   options: { type: "backend", database: "postgresql", "project-name": "my-app" } }

// Parser with options
const parser = new CLIParser({
  allowUnknownOptions: false,
  allowUnknownCommands: false,
  stopAtFirstArgument: false
});
```

### Helper Functions

| Function | Returns | Description |
| --- | --- | --- |
| parseCLIArguments(args) | ParsedCLIInput | Parse raw argument array |
| parseOptionValue(val) | CLIValue | Parse a single option value |
| parseBoolean(val) | boolean | Parse string to boolean |
| isOption(token) | boolean | Check if token is an option |
| isLongOption(token) | boolean | Check if --flag style |
| isShortOption(token) | boolean | Check if -f style |
| resolveCommand(cmds, name) | CLICommand \| undefined | Resolve command by name or alias |

## TYPES REFERENCE

### ProjectConfiguration

```ts
interface ProjectConfiguration {
  name: string;
  type: "backend" | "frontend" | "fullstack";
  backend?: {
    architecture: "monolith" | "modular-monolith" | "microservice";
    api?: "rest" | "graphql" | "rpc";
    database?: "postgresql" | "mysql" | "sqlite";
  };
  frontend?: {
    framework: FrontendFramework;
    architecture: FrontendArchitecture;
    language?: "typescript" | "javascript";
  };
  workspace?: {
    packageManager: "pnpm" | "npm" | "yarn" | "bun";
  };
  features?: readonly string[];
}
```

### ScaffoldOptions

```ts
interface ScaffoldOptions {
  readonly projectName: string;
  readonly projectType?: ProjectType;
  readonly architecture: ArchitectureType;
  readonly language?: "typescript" | "javascript";
  readonly packageManager: PackageManager;
  readonly database?: DatabaseEngine;
  readonly api?: ApiStyle;
  readonly frontend?: FrontendFramework | "none";
  readonly frontendArchitecture?: FrontendArchitecture;
  readonly frontendPath?: string;
  readonly services: readonly string[];
  readonly enableCQRS: boolean;
  readonly enableMessaging: boolean;
  readonly enableObservability: boolean;
  readonly enableOpenAPI: boolean;
  readonly enableDatabase: boolean;
  readonly enableQueue: boolean;
  readonly enableDocker: boolean;
  readonly installDeps: boolean;
  readonly initGit: boolean;
}
```

### CLICommand

```ts
interface CLICommand {
  readonly name: string;
  readonly description?: string;
  readonly aliases?: readonly string[];
  readonly options?: readonly CLIOption[];
  readonly arguments?: readonly CLIArgument[];
  readonly commands?: readonly CLICommand[];
  execute(context: CLIContext): void | Promise<void>;
}
```

### CLIContext

```ts
interface CLIContext {
  readonly args: CLIArguments;
  readonly values: CLIValues;
  readonly command?: string;
  readonly cwd: string;
  readonly env: CLIEnvironment;
  readonly logger: Logger;
}
```

### RollbackResult

**Changed in 2.0.** `RollbackManager.rollback()` returned `Promise<void>` and swallowed whatever it could not remove. It now reports both halves, so a caller can tell the user what was left behind.

```ts
interface RollbackResult {
  readonly removed: readonly string[];
  readonly failures: readonly RollbackFailure[];
}
```

### CapabilityResolutionResult

**Changed in 2.0.** The `conflicts` field is gone — it was structurally incapable of being non-empty.

```ts
interface CapabilityResolutionResult {
  readonly capabilities: readonly string[];
  /** Framework packages the selected capabilities build on. */
  readonly dependencies: readonly string[];
}
```

## CONSTANTS

| Constant | Value |
| --- | --- |
| CLI_NAME | "zudojs" |
| CLI_DEFAULTS.VERSION | read from package.json at runtime |
| CLI_COMMANDS.HELP | "help" |
| CLI_COMMANDS.VERSION | "version" |
| CLI_ALIASES.HELP | ["-h", "--help"] |
| CLI_ALIASES.VERSION | ["-v", "--version"] |
| CLI_EXIT_CODES.SUCCESS | 0 |
| CLI_EXIT_CODES.GENERAL_ERROR | 1 |
| CLI_EXIT_CODES.INVALID_ARGUMENTS | 2 |
| CLI_EXIT_CODES.COMMAND_NOT_FOUND | 3 |
| CLI_EXIT_CODES.PERMISSION_DENIED | 4 |
| CLI_EXIT_CODES.INTERRUPTED | 130 |
| CLI_LIMITS.MAX_COMMAND_NAME_LENGTH | 100 |
| CLI_LIMITS.MAX_DESCRIPTION_LENGTH | 500 |

### CLI_ENVIRONMENT

The environment variables the CLI reads. Every entry has a single reader. Through 1.2.1 this object also carried `NODE_ENV` and `DEBUG: "DEBUG"`; nothing read either, and honouring a bare `DEBUG` would have changed behaviour for anyone who already sets it.

| Key | Variable | Effect |
| --- | --- | --- |
| DEBUG | ZUDOJS_DEBUG | Turns on verbose logging |
| CI | CI | Suppresses the update check |
| NO_UPDATE_CHECK | ZUDOJS_NO_UPDATE_CHECK | Suppresses the update check |
| NPM_OFFLINE | npm_config_offline | Suppresses the update check when set to `true` |

## ERRORS

The CLI provides a comprehensive error hierarchy for different failure modes.

The classes below are the ones `zudojs-cli` exports from its package root. The scaffolding errors the commands themselves throw — `CLIValidationError`, `CLIGenerationError`, `CLINotInProjectError` and `CLITemplateError` — are owned by [@zudojs/errors](https://zudojs.oyinlola.site/docs/packages-errors.md) and are imported from there. `CLINotInProjectError` is what `build`, `dev`, `add` and, since 2.0, `generate` throw outside a Zudojs project.

### Error Classes

| Error | Usage |
| --- | --- |
| CLIError | Base CLI error class |
| CommandNotFoundError | Unknown command entered |
| DuplicateCommandError | Command name already registered |
| InvalidCommandNameError | Command name fails validation |
| InvalidArgumentsError | Wrong argument count or type |
| MissingArgumentError | Required argument not provided |
| InvalidOptionError | Unknown option provided |
| MissingOptionValueError | Option requires a value |
| DuplicateOptionError | Option specified twice |
| CLIExecutionError | Command execution failed |
| CLIPermissionError | Insufficient permissions |
| CLIInterruptedError | Process interrupted (Ctrl+C) |
| CLIConfigurationError | Invalid CLI configuration |

### Error Helpers

```ts
import {
  isCLIError,
  normalizeCLIError,
  getCLIExitCode,
  getCLIErrorCode
} from "zudojs-cli";

try {
  await app.run();
} catch (err) {
  if (isCLIError(err)) {
    console.error(`[${err.code}] ${err.message}`);
    process.exit(getCLIExitCode(err));
  }
}
```

## PACKAGE CONNECTIONS

[@zudojs/errors

CLIError base class, error normalization](https://zudojs.oyinlola.site/docs/packages-errors.md) [@zudojs/logger

CLIContext.logger for output](https://zudojs.oyinlola.site/docs/packages-logger.md) [@zudojs/config

Configuration source integration](https://zudojs.oyinlola.site/docs/packages-config.md) [@zudojs/core

Runtime, lifecycle, module system](https://zudojs.oyinlola.site/docs/packages-core.md) [@zudojs/schema

Configuration validation](https://zudojs.oyinlola.site/docs/packages-schema.md) [@zudojs/serialization

Manifest serialization](https://zudojs.oyinlola.site/docs/packages-serialization.md)

## SUGGESTED IMPROVEMENTS

1. Plugin System

Allow third-party plugins to register custom schematics, adapters, and commands via a plugin API.

2. Watch Mode for Generators

Add `--watch` flag to `GENERATE` that re-runs schematics when files change.

3. Custom Schematics

Support user-defined schematics in `.zudojs/schematics/` directory.

4. Telemetry Opt-In

Anonymous usage analytics to improve CLI UX (with clear opt-out).

5. Interactive Add Command

Prompt for feature selection when `zudojs add` is run without arguments.

6. Migration Command

`zudojs migrate` to upgrade project scaffolding between Zudo versions.

7. Diff Preview for Generate

`--diff` flag to show what files will be created/modified before writing.

8. Shell Completions

`zudojs completion bash/zsh/fish` for auto-completion in terminals.

## API SUMMARY

| Export | Kind | Description |
| --- | --- | --- |
| createCLI() | Factory | Create CLI application |
| createCommand() | Factory | Create a CLI command |
| command() | Factory | Shorthand command creator |
| createCLIWriter() | Factory | Output writer |
| ZudojsCLI | Class | Main CLI application |
| CLICommandRegistry | Class | Command registry |
| CLIParser | Class | Argument parser |
| CLICommandBuilder | Class | Command builder |
| FrontendAdapterRegistry | Class | Frontend adapter registry |
| PackageManagerRegistry | Class | Package manager registry |
| GeneratorRegistry | Class | Generator registry |
| DependencyRegistry | Class | Dependency registry |
| RollbackManager | Class | Rollback on failure or interrupt; `rollback()` resolves to a `RollbackResult` |
| ManifestManager | Class | Project manifest I/O |
| ProcessRunner | Class | Process execution |
| TaskRunner | Class | Task orchestration |

### Frontend Adapter Exports

ReactAdapter

NextAdapter

VueAdapter

NuxtAdapter

AngularAdapter

SvelteAdapter

SvelteKitAdapter

AstroAdapter

VanillaAdapter

FlutterAdapter

ReactNativeAdapter

## COMPLETE EXPORT INDEX

Every name `zudojs-cli` exports from its package root at v2.2.0 — **183** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 183 exports**

Classes (56)

`AngularAdapter` `AstroAdapter` `BackendGenerator` `BunAdapter` `CapabilityResolver` `CLICommandBuilder` `CLICommandRegistry` `CLIConfigurationError` `CLIError` `CLIExecutionError` `CLIInterruptedError` `CLIParser` `CLIPermissionError` `CommandNotFoundError` `CompatibilityValidator` `ConfigurationResolver` `DependencyRegistry` `DependencyResolver` `DuplicateCommandError` `DuplicateOptionError` `EnvironmentValidator` `FlutterAdapter` `FrontendAdapterRegistry` `FrontendGenerator` `FullstackComposer` `GeneratorRegistry` `InfrastructureGenerator` `IntegrationGenerator` `InvalidArgumentsError` `InvalidCommandNameError` `InvalidOptionError` `InvalidOptionNameError` `ManifestManager` `MissingArgumentError` `MissingOptionValueError` `MySqlAdapter` `NextAdapter` `NpmAdapter` `NuxtAdapter` `PackageManagerRegistry` `PackageManagerRunner` `PnpmAdapter` `PostgresAdapter` `ProcessRunner` `ProjectValidator` `ReactAdapter` `ReactNativeAdapter` `RollbackManager` `SqliteAdapter` `SvelteAdapter` `SvelteKitAdapter` `TaskRunner` `VanillaAdapter` `VueAdapter` `YarnAdapter` `ZudojsCLI`

Functions (40)

`assertPackageManager` `checkForNewerVersion` `command` `compareVersions` `createCLI` `createCLILogger` `createCLIWriter` `createCommand` `detectArchitecture` `detectPackageManager` `executeCommand` `findProjectRoot` `formatCLILogLine` `formatCLIVersion` `generateProject` `getCLIErrorCode` `getCLIExitCode` `getCLIVersion` `getVersionString` `isCLICommand` `isCLIError` `isCompatibleVersion` `isLongOption` `isOption` `isShortOption` `isUpdateCheckDisabled` `isValidVersion` `normalizeCLIError` `normalizeCLIValue` `parseBoolean` `parseCLIArguments` `parseManifest` `parseOptionValue` `parseVersion` `registerCLIInterruptHandler` `resolveCommand` `resolveProjectLayout` `resolveProjectPath` `sortCommands` `validateCommand`

Interfaces (56)

`CapabilityDependency` `CapabilityResolutionResult` `CLIApplication` `CLIApplicationOptions` `CLIArgument` `CLIChoice` `CLICommand` `CLICommandDefinition` `CLIContext` `CLIErrorOptions` `CLIHooks` `CLILoggerOptions` `CLIOption` `CLIOutput` `CLIParserOptions` `CLIPrompt` `CLIPromptOptions` `CLIVersionInfo` `CLIWriter` `CompatibilityCheck` `CompatibilityResult` `DependencyConflict` `DependencyRecord` `DependencyRequirement` `DependencyResolutionResult` `EnvironmentCheck` `EnvironmentValidationResult` `FrontendAdapter` `FrontendFeatures` `FrontendGenerationContext` `GenerateOptions` `GeneratorRegistryEntry` `InfrastructureOptions` `ManifestReadResult` `PackageManager` `PackageManagerRunOptions` `ParsedCLIInput` `ProcessOptions` `ProjectCheck` `ProjectConfiguration` `ProjectLayout` `ProjectTemplate` `ProjectValidationResult` `ResolvedConfiguration` `ResolvedDependency` `RollbackEntry` `RollbackFailure` `RollbackResult` `ScaffoldOptions` `TaskDefinition` `TaskResult` `TaskRunOptions` `UpdateCheckOptions` `UpdateCheckResult` `ValidationResult` `ZudojsManifest`

Type aliases (19)

`ApiStyle` `ArchitectureType` `BackendArchitecture` `CLIArguments` `CLICommandName` `CLIEnvironment` `CLIErrorCode` `CLIOptionType` `CLIValue` `CLIValues` `DatabaseEngine` `DatabaseProvider` `FrontendArchitecture` `FrontendFramework` `ManifestReadStatus` `PackageManagerType` `ProjectLayoutSource` `ProjectLayoutType` `ProjectType`

Constants (12)

`CLI_ALIASES` `CLI_COMMANDS` `CLI_DEFAULTS` `CLI_ENVIRONMENT` `CLI_ERROR_CODES` `CLI_FORMAT` `CLI_HELP` `CLI_LIMITS` `CLI_MESSAGES` `CLI_NAME` `CLI_OPTION_PREFIXES` `CLI_SYMBOLS`
