---
title: "@zudojs/cli — Command-Line Interface Framework"
description: "Complete reference for zudojs-cli v2.0.0. Create, scaffold, generate, and manage Zudo projects with interactive prompts, 11 frontend adapters, 4 package managers, and 13 schematics, plus the 2.0 upgrade notes."
source: https://zudojs.oyinlola.site/docs/packages-cli
---

v2.0.0

# @zudojs/cli

Command-line interface infrastructure for Zudo — command registration, argument parsing, interactive prompts, output formatting, and progress display

CLI COMMANDS INTERACTIVE

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

The CLI supports **11 frontend frameworks** (React, Next, Vue, Nuxt, Angular, Svelte, SvelteKit, Astro, Vanilla, Flutter, React Native), **4 package managers** (pnpm, npm, yarn, bun), **3 database engines** (PostgreSQL, MySQL, SQLite), and **13 code schematics** for generating services, modules, commands, queries, and more.

Upgrading from 1.2.x? Read [Upgrading to 2.0](#upgrading) first — several commands now refuse where they used to proceed.

> KEY FEATURES
>
>
>
> - **Interactive prompts** — Guided project creation with @clack/prompts
> - **Multi-architecture** — Monolith, modular-monolith, microservice
> - **Fullstack support** — Backend + frontend in a single workspace
> - **Code schematics** — Generate services, modules, commands, queries, controllers, and more
> - **Rollback safety** — A failed or interrupted `create` removes the half-written project
> - **Manifest tracking** — Project configuration stored in `.zudojs/manifest.json` and in the `zudojs` block of `package.json`
> - **Per-command help** — `zudojs <command> --help` prints usage, arguments, options, shorts and defaults

## INSTALLATION

```ts
# Install globally
npm install -g zudojs-cli

# Or use npx (no install required)
npx zudojs create my-project

# With pnpm
pnpm dlx zudojs-cli create my-project
```

**Binary:** `zudojs` → `./dist/src/bin/zudojs.js`

## QUICK START

```ts
# Create a new project (interactive)
zudojs create my-app

# Create with explicit flags (non-interactive)
# The project name is a positional argument, not --project-name
zudojs create my-app \
  --type backend \
  --architecture monolith \
  --database postgresql \
  --package-manager pnpm \
  --capabilities cqrs,messaging,observability,database,security

# See a command's arguments, options, shorts and defaults
zudojs create --help

# Generate a service
zudojs generate service UserService

# Generate a module
zudojs generate module auth

# Add a feature
zudojs add database

# Diagnose project issues
zudojs doctor

# Show project info
zudojs info
```

## BUILT-IN COMMANDS

The CLI ships with 7 built-in commands. `create` prompts interactively in a terminal and takes flags otherwise; the rest read the project from `.zudojs/manifest.json` (or the `zudojs` block in `package.json`) and refuse to run outside a Zudojs project.

Every command documents itself: `zudojs <command> --help`, `-h` and `zudojs help <command>` all print the same block. Before 2.0 the first two were handed to the parser, which rejected `--help` as an undeclared option and exited `2`, so no command’s flags could be discovered from the CLI itself.

```ts
zudojs create --help

Usage:
  zudojs create [<project-name>] [options]

Description:
  Create a new Zudojs project

Arguments:
  [<project-name>]  The name of the project to create

Options:
  -t, --type <string>                   Project type (backend, frontend, fullstack) (default: backend)
  ...
  --capabilities <string>               Comma-separated capabilities (cqrs, events, messaging, queue, observability, openapi, database, security)
  -h, --help                            Show help for this command.
```

| Command | Alias | Description |
| --- | --- | --- |
| CREATE | — | Scaffold a new Zudo project |
| GENERATE | g | Generate code from 13 schematics; runs from any directory inside the project and throws `CLINotInProjectError` outside one |
| ADD | — | Add a feature package to the project |
| DOCTOR | — | Run project diagnostics |
| INFO | — | Show project info and dependencies |
| DEV | d | Start the development servers (backend, frontend, or both) through the project’s package manager (`pnpm run dev`, `npm run dev`, …); `--backend-only`, `--frontend-only`, `--port` |
| BUILD | b | Run the `build` script with the detected package manager; exits non-zero on failure, and refuses outside a Zudojs project |

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

An empty service list now means no services. A microservice project gets its gateway at `apps/gateway` and nothing under `apps/services/`; a modular monolith gets an empty module barrel at `src/modules/index.ts`. Both READMEs say how to add one. Named services are generated exactly as named, at `apps/services/<name>`.

Before 2.0 the templates substituted example domains nobody asked for — `identity`, `enrollment`, `assessment` and `notification` for a microservice project, and three modules for a modular monolith, which was never even asked what it wanted.

### What a new project contains

- **A running server.** `src/server.ts` starts the runtime and serves HTTP with `@zudojs/http` on `PORT` (default 3000; each microservice app on its own port), answering `GET /health`. SIGINT and SIGTERM stop the HTTP server, then the runtime.
- **A test that passes.** The sample spec is `tests/app.test.ts`. It used to be `tests/index.ts`, which matches no vitest include pattern, so the first `pnpm run test` in a fresh project exited `1`.
- **Real recorded capabilities.** Templates write the capability list into `zudojs.features` and install the packages backing it, so the `zudojs doctor` feature check has something to verify. It used to be hardcoded to `[]` and could never fail.
- **Pinned frontend dependencies.** The frontend install path passes the resolved `name@range` to the package manager instead of the bare name, so two `create --frontend react` runs a month apart no longer produce different majors. A dependency the resolver cannot pin now prints a warning instead of being recorded as `latest` in silence.
- **Framework packages as `^1.0.0` ranges**, plus, for pnpm, a `pnpm-workspace.yaml` that allows esbuild’s build script — which pnpm 10+ would otherwise refuse to run.

> A FAILED INSTALL FAILS THE COMMAND
>
>
>
> If dependency installation fails, `create` keeps the generated project, prints the exact command to retry with, and exits non-zero. Through 1.2.1 it printed “Project created successfully” and exited `0`, so a CI job went green with no `node_modules`. `zudojs add` already behaved this way; the two commands no longer disagree.

## GENERATE

Generate code from 13 schematics. Reads `.zudojs/manifest.json` (or the `zudojs` block in `package.json`) to determine the architecture and where the backend lives: schematics land in `src/` of a backend project and in `apps/api/src/` of a monolithic fullstack workspace. A fullstack microservice project keeps `apps/gateway` and `apps/services/` at the workspace root, and schematics go there instead.

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
# Generate a service
zudojs generate service UserService

# Generate a module
zudojs generate module auth

# Generate a CQRS command
zudojs generate command CreateUser --service users

# Generate a controller
zudojs generate controller ProductController

# Dry run (preview files without writing)
zudojs generate service OrderService --dry-run

# Overwrite files the schematic would change
zudojs generate service OrderService --force
```

Without `--force`, `generate` refuses to overwrite existing files and lists the ones it would change. Barrels are only ever appended to.

### Options

| Flag | Short | Applies to | Description |
| --- | --- | --- | --- |
| --module <name> | -m | Every schematic but `module` | Generates into `<root>/modules/<name>` instead of the schematic’s default directory. Accepted and documented before 2.0, but never read by any schematic |
| --service <name> | -s | Microservice projects; CQRS `command`/`query` | In a microservice project, selects the app the schematic belongs to (`apps/services/<name>/src`); otherwise names the CQRS group. Without it, a microservice schematic goes to `apps/gateway/src` |
| --dry-run | — | All | Lists the files without writing anything |
| --force | — | All | Overwrites the files that already exist and would change |

Both `<schematic>` and `<name>` are required positional arguments. A name whose normalized form is empty (`"..."`) or starts with a digit (`2fa`) is refused, because it becomes a TypeScript class name: `2faModule` is not an identifier, and through 1.2.1 `generate module 2fa` wrote that import into your existing `src/app.ts` and exited `0`. `--service` and `--module` values must be a single safe path segment.

### Available Schematics

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

`zudojs generate module <name>` writes a runtime module (a `BaseModule` subclass), exports it from the modules barrel and registers it in `app.ts`. If it cannot edit `app.ts` automatically it says so and prints the lines to add by hand.

> WRITES STAY INSIDE THE PROJECT
>
>
>
> Path containment used to be checked on the literal string only, so a symlinked directory inside the project carried generated files to the symlink’s target. Containment is now re-asserted against the resolved real path, and a write that would escape fails with the path that caused it.

## ADD

Add a feature package to your Zudo project. Adds the package (as a `^1.0.0` range) to every backend app — the project root, `apps/api` in a fullstack workspace, or the gateway and each service in a microservice one — records the feature in that `package.json`, updates the manifest, and installs.

Since 2.0 the manifest is read and validated before any `package.json` is touched, so a failure can no longer leave the project half-updated. It is written atomically and serialized by a lock, so two concurrent `zudojs add` runs cannot lose an update, and a corrupt manifest is reported distinctly from a missing one.

```ts
# Add database support
zudojs add database

# Add queue support
zudojs add queue

# Add without installing
zudojs add cache --skip-install

# Microservice project: only the identity service (or "gateway")
zudojs add cache --service identity
```

### Available Features

| Feature | Packages Installed |
| --- | --- |
| database | @zudojs/database |
| queue | @zudojs/queue |
| messaging | @zudojs/messaging |
| openapi | @zudojs/openapi |
| observability | @zudojs/observability |
| security | @zudojs/security |
| cache | @zudojs/cache |
| storage | @zudojs/storage |
| scheduler | @zudojs/scheduler |
| docs | @zudojs/docs |

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

Display the CLI version, the project’s recorded type, architecture and package manager, and the Zudo dependencies of each backend app. Also asks npm whether a newer `zudojs-cli` exists (set `ZUDOJS_NO_UPDATE_CHECK=1` or `CI` to skip that).

```ts
zudojs info

// Output:
// Zudojs CLI
//   Version: 2.0.0
//   Node.js: v24.19.0
//
// Project
//   Name: my-app
//   Version: 0.1.0
//   Type: backend
//   Architecture: monolith
//   Package manager: pnpm
//
// Zudojs dependencies
//   @zudojs/core: ^1.0.0
//   @zudojs/logger: ^1.0.0
//   @zudojs/runtime: ^1.0.0
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
import { CLIParser, parseCLIArguments } from "zudojs-cli";

// Standalone parsing
const result = parseCLIArguments([
  "create", "my-app",
  "--type", "backend",
  "-d", "postgresql"
]);

// result: {
//   command: "create",
//   commands: ["create"],
//   args: ["my-app"],
//   options: { type: "backend", d: "postgresql" }
// }

// Parser with options
const parser = new CLIParser({
  allowUnknownOptions: false,
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

Every name `zudojs-cli` exports from its package root at v2.0.0 — **183** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

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
