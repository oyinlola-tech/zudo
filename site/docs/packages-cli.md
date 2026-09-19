---
title: "@zudojs/cli — Command-Line Interface Framework"
description: "Complete reference for zudojs-cli v1.2.0. Create, scaffold, generate, and manage Zudo projects with interactive prompts, 11 frontend adapters, 4 package managers, and 13 schematics."
source: https://zudojs.oyinlola.site/docs/packages-cli
---

v1.2.0

# @zudojs/cli

Command-line interface infrastructure for Zudo — command registration, argument parsing, interactive prompts, output formatting, and progress display

CLI COMMANDS INTERACTIVE

## OVERVIEW

`zudojs-cli` is the command-line interface for the Zudo framework. It provides project scaffolding, code generation, dependency management, and project diagnostics — all with interactive prompts powered by `@clack/prompts`.

The CLI supports **11 frontend frameworks** (React, Next, Vue, Nuxt, Angular, Svelte, SvelteKit, Astro, Vanilla, Flutter, React Native), **4 package managers** (pnpm, npm, yarn, bun), **3 database engines** (PostgreSQL, MySQL, SQLite), and **13 code schematics** for generating services, modules, commands, queries, and more.

> KEY FEATURES
>
>
>
> - **Interactive prompts** — Guided project creation with @clack/prompts
> - **Multi-architecture** — Monolith, modular-monolith, microservice
> - **Fullstack support** — Backend + frontend in a single workspace
> - **Code schematics** — Generate services, modules, commands, queries, controllers, and more
> - **Rollback safety** — Automatic cleanup on generation failures
> - **Manifest tracking** — Project configuration stored in zudojs.json

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
zudojs create my-app \
  --type backend \
  --architecture monolith \
  --database postgresql \
  --package-manager pnpm

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

The CLI ships with 7 built-in commands. `create` prompts interactively in a terminal and takes flags otherwise; the rest read the project from `.zudojs/manifest.json`.

| Command | Alias | Description |
| --- | --- | --- |
| CREATE | — | Scaffold a new Zudo project |
| GENERATE | g | Generate code from schematics |
| ADD | — | Add a feature package to the project |
| DOCTOR | — | Run project diagnostics |
| INFO | — | Show project info and dependencies |
| DEV | d | Start the development servers (backend, frontend, or both) through the project’s package manager (`pnpm run dev`, `npm run dev`, …); `--backend-only`, `--frontend-only`, `--port` |
| BUILD | b | Run the `build` script with the detected package manager; exits non-zero on failure |

## CREATE

Scaffold a new Zudo project with interactive prompts or explicit flags. Supports backend, frontend, and fullstack project types.

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
// 9. Capabilities (cqrs, messaging, observability, openapi, database, queue)
// 10. Confirmation
```

### Non-Interactive Mode

```ts
zudojs create my-project \
  --type backend \
  --architecture modular-monolith \
  --database postgresql \
  --api rest \
  --package-manager pnpm \
  --language typescript \
  --no-install \
  --no-git
```

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
| --services | — | — | Comma-separated service names (microservice architecture only) |
| --no-install | — | false | Skip dependency installation |
| --no-git | — | false | Skip git initialization |

## GENERATE

Generate code from 13 schematics. Reads `.zudojs/manifest.json` (or the `zudojs` block in `package.json`) to determine the architecture and where the backend lives: schematics land in `src/` of a backend project and in `apps/api/src/` of a fullstack workspace.

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

Without `--force`, `generate` refuses to overwrite existing files and lists the ones it would change.

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
| monolith | src/ | src/modules/ |
| modular-monolith | src/ | src/modules/ |
| microservice | apps/ | apps/default/ |

## ADD

Add a feature package to your Zudo project. Adds the package (as a `^1.0.0` range) to every backend app — the project root, `apps/api` in a fullstack workspace, or the gateway and each service in a microservice one — records the feature in that `package.json`, updates the manifest, and installs.

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

Run project diagnostics to check for common issues.

```ts
zudojs doctor
```

### Checks Performed

| Check | What It Verifies |
| --- | --- |
| Node.js version | Node.js >= v24 |
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
//   Version: 1.2.0
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
  projectName: string;
  projectType?: ProjectType;
  architecture: ArchitectureType;
  packageManager: PackageManager;
  database?: DatabaseEngine;
  api?: ApiStyle;
  frontend?: FrontendFramework | "none";
  services: readonly string[];
  enableCQRS: boolean;
  enableMessaging: boolean;
  enableObservability: boolean;
  enableOpenAPI: boolean;
  enableDatabase: boolean;
  enableQueue: boolean;
  installDeps: boolean;
  initGit: boolean;
}
```

### CLICommand

```ts
interface CLICommand {
  name: string;
  description?: string;
  aliases?: readonly string[];
  options?: readonly CLIOption[];
  arguments?: readonly CLIArgument[];
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

## ERRORS

The CLI provides a comprehensive error hierarchy for different failure modes.

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
| RollbackManager | Class | Rollback on failure |
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

Every name `zudojs-cli` exports from its package root at v1.2.0 — **176** in total, generated from the package’s own entry point rather than written by hand. The sections above explain the ones you reach for most; this is the exhaustive list, so nothing shipped is undocumented. Names not covered above are typically internal helpers and supporting types.

**Show all 176 exports**

Classes (56)

`AngularAdapter` `AstroAdapter` `BackendGenerator` `BunAdapter` `CapabilityResolver` `CLICommandBuilder` `CLICommandRegistry` `CLIConfigurationError` `CLIError` `CLIExecutionError` `CLIInterruptedError` `CLIParser` `CLIPermissionError` `CommandNotFoundError` `CompatibilityValidator` `ConfigurationResolver` `DependencyRegistry` `DependencyResolver` `DuplicateCommandError` `DuplicateOptionError` `EnvironmentValidator` `FlutterAdapter` `FrontendAdapterRegistry` `FrontendGenerator` `FullstackComposer` `GeneratorRegistry` `InfrastructureGenerator` `IntegrationGenerator` `InvalidArgumentsError` `InvalidCommandNameError` `InvalidOptionError` `InvalidOptionNameError` `ManifestManager` `MissingArgumentError` `MissingOptionValueError` `MySqlAdapter` `NextAdapter` `NpmAdapter` `NuxtAdapter` `PackageManagerRegistry` `PackageManagerRunner` `PnpmAdapter` `PostgresAdapter` `ProcessRunner` `ProjectValidator` `ReactAdapter` `ReactNativeAdapter` `RollbackManager` `SqliteAdapter` `SvelteAdapter` `SvelteKitAdapter` `TaskRunner` `VanillaAdapter` `VueAdapter` `YarnAdapter` `ZudojsCLI`

Functions (38)

`checkForNewerVersion` `command` `compareVersions` `createCLI` `createCLILogger` `createCLIWriter` `createCommand` `detectArchitecture` `detectPackageManager` `executeCommand` `findProjectRoot` `formatCLILogLine` `formatCLIVersion` `generateProject` `getCLIErrorCode` `getCLIExitCode` `getCLIVersion` `getVersionString` `isCLICommand` `isCLIError` `isCompatibleVersion` `isLongOption` `isOption` `isShortOption` `isUpdateCheckDisabled` `isValidVersion` `normalizeCLIError` `normalizeCLIValue` `parseBoolean` `parseCLIArguments` `parseOptionValue` `parseVersion` `registerCLIInterruptHandler` `resolveCommand` `resolveProjectLayout` `resolveProjectPath` `sortCommands` `validateCommand`

Interfaces (51)

`CapabilityDependency` `CapabilityResolutionResult` `CLIApplication` `CLIApplicationOptions` `CLIArgument` `CLIChoice` `CLICommand` `CLICommandDefinition` `CLIContext` `CLIErrorOptions` `CLIHooks` `CLILoggerOptions` `CLIOption` `CLIOutput` `CLIParserOptions` `CLIPrompt` `CLIPromptOptions` `CLIVersionInfo` `CLIWriter` `CompatibilityCheck` `CompatibilityResult` `DependencyConflict` `DependencyRecord` `DependencyRequirement` `DependencyResolutionResult` `EnvironmentCheck` `EnvironmentValidationResult` `FrontendAdapter` `FrontendFeatures` `FrontendGenerationContext` `GenerateOptions` `GeneratorRegistryEntry` `InfrastructureOptions` `PackageManagerRunOptions` `ParsedCLIInput` `ProcessOptions` `ProjectCheck` `ProjectConfiguration` `ProjectLayout` `ProjectTemplate` `ProjectValidationResult` `ResolvedConfiguration` `ResolvedDependency` `RollbackEntry` `ScaffoldOptions` `TaskDefinition` `TaskResult` `UpdateCheckOptions` `UpdateCheckResult` `ValidationResult` `ZudojsManifest`

Type aliases (19)

`ApiStyle` `ArchitectureType` `BackendArchitecture` `CLIArguments` `CLICommandName` `CLIEnvironment` `CLIErrorCode` `CLIOptionType` `CLIValue` `CLIValues` `DatabaseEngine` `DatabaseProvider` `FrontendArchitecture` `FrontendFramework` `PackageManager` `PackageManagerType` `ProjectLayoutSource` `ProjectLayoutType` `ProjectType`

Constants (12)

`CLI_ALIASES` `CLI_COMMANDS` `CLI_DEFAULTS` `CLI_ENVIRONMENT` `CLI_ERROR_CODES` `CLI_FORMAT` `CLI_HELP` `CLI_LIMITS` `CLI_MESSAGES` `CLI_NAME` `CLI_OPTION_PREFIXES` `CLI_SYMBOLS`
