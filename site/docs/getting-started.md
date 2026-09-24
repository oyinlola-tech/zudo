---
title: "Getting Started"
description: "Install ZudoJS on Node.js 24, run a first module by hand, then scaffold a working API with the zudo CLI. Prerequisites, quick start and troubleshooting."
source: https://zudojs.oyinlola.site/docs/getting-started
---

v1.0.0

# Getting Started

Install Zudo and build your first application.

QUICKSTART INSTALLATION

## PREREQUISITES

Zudo is a set of TypeScript packages for Node.js. You need two things before you start.

Node.js 24 or newer

Every package sets `"engines": { "node": ">=24.0.0" }`. Check yours with `node --version`.

A package manager

`npm` ships with Node. `pnpm`, `yarn` and `bun` also work.

TypeScript is optional but expected. The examples below run through `tsx`, which executes a TypeScript file directly with no build step.

> TIP
>
>
>
> You do not need to install `tsx` globally. `npx tsx app.ts` downloads and runs it on demand.

## INSTALLATION

Zudo is not one package. It is 39 packages, each published on its own, and you install only the ones you use. Start with `@zudojs/core`.

```bash
$ mkdir hello-zudo && cd hello-zudo
$ npm init -y
$ npm pkg set type=module
$ npm install @zudojs/core
$ npm install -D typescript @types/node tsx
```

`npm pkg set type=module` matters: every Zudo package is ESM-only, so your project has to be an ES module too.

The other packages follow the same pattern. Add them when you need them:

```bash
$ npm install @zudojs/http        # HTTP server and request/response contexts
$ npm install @zudojs/logger      # structured logging
$ npm install @zudojs/config      # layered configuration
$ npm install @zudojs/container   # standalone dependency container
```

There is also a command-line tool, the **CLI**, that writes whole projects for you. Install it under either name, `zudojs` or `zudojs-cli`; both give you the command `zudojs` and its short alias `zudo`:

```bash
$ npm install -g zudojs
$ zudo --version
2.1.0
```

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

> WATCH OUT
>
>
>
> There is no package called `zudo` on npm; `zudo` is only a command name the CLI installs. Every framework package is scoped as `@zudojs/<name>`; the CLI is the one exception, published unscoped as `zudojs` and `zudojs-cli`.

## QUICK START

A Zudo application is a list of *modules* plus a *runtime* that starts and stops them in order. A **module** is one named piece of your app — users, billing, email — that can be initialized and shut down. The **runtime** is the thing that walks that list.

This file defines one module, builds an application around it, starts it, then shuts it down. Save it as `app.ts`.

```ts
import { createApplication, defineModule } from "@zudojs/core";
import type { Module } from "@zudojs/core";

const greeter = defineModule({
  id: "greeter",
  name: "Greeter",
  factory: (): Module => ({
    id: "greeter",
    name: "Greeter",
    onInitialize: (context) => { context.logger.info("greeter: ready"); },
    onShutdown: (context) => { context.logger.info("greeter: stopping"); },
  }),
});

const app = await createApplication({
  modules: [greeter],
  runtime: { name: "hello-zudo", mode: "development" },
});

await app.start();
console.log(app.state);      // "running"

await app.shutdown();
console.log(app.state);      // "stopped"
```

Run it:

```bash
$ npx tsx app.ts
```

**What you should see.** The default logger prints one JSON line per call, so your two module messages appear among the runtime's own progress lines, with `running` and `stopped` printed in between:

```json
{"level":"info","message":"greeter: ready","timestamp":"2026-09-09T10:00:00.000Z","context":{"moduleId":"greeter","module":"Greeter"}}
running
{"level":"info","message":"greeter: stopping","timestamp":"2026-09-09T10:00:00.010Z","context":{"moduleId":"greeter","module":"Greeter"}}
stopped
```

Three names did all the work:

- `defineModule` — describes a module. `id`, `name` and `factory` are required; `dependencies` is optional.
- `factory` — a plain function that returns the module object. It runs when the application starts, not when you call `defineModule`.
- `createApplication` — wires the container, configuration, logger and runtime together and returns an `Application`. It is `async`, so it needs `await`.

> IN PLAIN WORDS
>
>
>
> A module's hooks are named for when they run: `onInitialize` on the way up, `onReady` once every module is initialized, `onShutdown` on the way down, and `onDestroy` last. Implement only the ones you need.

## SERVE AN HTTP REQUEST

The core package knows nothing about HTTP. To answer web requests, add `@zudojs/http`:

```bash
$ npm install @zudojs/http
```

An **adapter** is the piece that bridges a real server — here Node's built-in `http` module — to Zudo's own request and response objects. You give it a `handler`: one function that receives a request and returns a response.

Save this as `server.ts`:

```ts
import { createNodeHttpAdapter, createResponseContext } from "@zudojs/http";

const adapter = createNodeHttpAdapter({
  host: "127.0.0.1",
  port: 3000,
  handler: (request) =>
    createResponseContext()
      .setStatus(200)
      .json({ method: request.method, path: request.path }),
});

await adapter.start();

console.log(`listening on http://127.0.0.1:${adapter.address?.port}`);
```

Run it in one terminal and call it from another:

```bash
$ npx tsx server.ts
listening on http://127.0.0.1:3000

$ curl http://127.0.0.1:3000/hello
{"method":"GET","path":"/hello"}
```

Stop the server with `await adapter.stop()`, or press `Ctrl+C`. Passing `port: 0` instead of `3000` asks the operating system for any free port, which is what tests do — read the real one back from `adapter.address`.

> WATCH OUT
>
>
>
> The factory is `createNodeHttpAdapter`, lower-case `http`. Older notes mention `createHTTPServer`; no such export exists.

## SCAFFOLD WITH THE CLI

Writing the files by hand is the best way to see what Zudo does. Once you know, the CLI writes a whole project for you: an HTTP server that is already wired up, an example endpoint, configuration, security defaults and a passing test.

```bash
$ npx zudojs create my-api
```

`npx` downloads the CLI and runs it once; with the CLI installed globally, `zudo create my-api` (or `zudo new my-api`) does the same. In a terminal, `create` asks a short series of questions: project type (backend, frontend or fullstack), backend architecture (monolith, modular-monolith or microservice), database, API style, package manager, and which optional capabilities to switch on. Every answer also has a flag, so you can skip the questions entirely:

```bash
$ npx zudojs create my-api --type backend --architecture monolith --package-manager npm
```

Then start it. The project’s `dev` script runs `tsx watch src/server.ts`, which restarts the server whenever you save a file:

```bash
$ cd my-api
$ npm run dev
```

The server listens on `http://localhost:3000` and already answers `/health`, an example resource at `/api/v1/examples`, its OpenAPI document at `/openapi.json` and a docs page at `/docs`. [Your First App](https://zudojs.oyinlola.site/docs/getting-started-first-app.md) takes it from there, one command at a time.

The most useful `create` flags:

| Flag | What it does | Default |
| --- | --- | --- |
| `--type`, `-t` | backend, frontend or fullstack | `backend` |
| `--architecture`, `-a` | monolith, modular-monolith or microservice | `monolith` |
| `--package-manager`, `-p` | npm, pnpm, yarn or bun | `pnpm` |
| `--database`, `-d` | postgresql, mysql or sqlite | `postgresql` |
| `--api` | rest, graphql or rpc | `rest` |
| `--frontend`, `-f` | react, next, vue, nuxt, angular, svelte, sveltekit, astro, vanilla, flutter, react-native | `none` |
| `--services` | comma-separated service names (microservice only) | none: just the gateway |
| `--capabilities` | comma-separated: cqrs, events, messaging, queue, observability, openapi, database, security | `cqrs,messaging,observability,openapi,database` when run without prompts |
| `--no-install` | skip installing dependencies | off |
| `--no-git` | skip `git init` | off |

The other commands the CLI provides. Run `zudo` on its own in a terminal to pick one from a numbered menu instead:

| Command | What it does | Notes |
| --- | --- | --- |
| `zudo create [name]` (`new`) | Scaffolds a new project | Asks questions in a terminal; flags skip them |
| `zudo dev` (`d`) | Starts the dev servers for the current project by running each app’s `dev` script through the package manager | `--frontend-only`, `--backend-only`, `--port <n>` |
| `zudo generate <kind> <name>` (`g`) | Writes new files and registers them. `generate resource users` writes a whole `/api/v1/users` endpoint | `--dry-run` shows the files without writing them |
| `zudo add <feature>` | Adds working code for a feature, with its config and environment variables | database, redis, websockets, email, docker, queue, messaging, openapi, observability, cache, storage, scheduler |
| `zudo doctor` | Checks Node version, the project manifest, package manager, installed dependencies, tsconfig in every app, and declared features | Exits non-zero when an error-level check fails |
| `zudo build` (`b`) | Runs the project's own build script | Detects the package manager from the lock file |
| `zudo info` | Prints the CLI version, the project’s type, architecture and package manager, and its `@zudojs/*` dependencies | Works outside a project too; mentions a newer CLI release when one exists |

> IN PLAIN WORDS
>
>
>
> `zudo create` records what kind of project it made in two places: the `zudojs` block of `package.json` and a hidden `.zudojs/manifest.json`. That is how `dev`, `generate` and `add` know which architecture your project uses. There is no `zudojs.config.ts`. Do not delete the manifest.

## TROUBLESHOOTING

- **`Cannot use import statement outside a module`** → your `package.json` is missing `"type": "module"`. Run `npm pkg set type=module`.
- **Node is older than 24** → installs succeed and then the app fails at runtime on syntax it does not know. Check with `node --version` and upgrade.
- **`npm install zudo` fails** → that package does not exist. Install `@zudojs/core` and add the scoped packages you need.
- **Nothing prints after `createApplication`** → `createApplication` only builds the application. Module hooks run when you `await app.start()`, or if you pass `autoStart: true`.
- **`EADDRINUSE` from the adapter** → port 3000 is taken. Pass a different `port`, or `port: 0` and read `adapter.address`.

## NEXT STEPS

- [Your First App](https://zudojs.oyinlola.site/docs/getting-started-first-app.md) — create a project with the CLI, call its API, generate a resource and run its tests.
- [Project Structure](https://zudojs.oyinlola.site/docs/getting-started-project-structure.md) — what `zudo create` writes to disk, and how a request travels through it.
- [@zudojs/core](https://zudojs.oyinlola.site/docs/packages-core.md) — the full reference for modules, the application and the runtime.
- [zudojs-cli](https://zudojs.oyinlola.site/docs/packages-cli.md) — every command, flag, schematic and feature.
- [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md) — routing, middleware, cookies and the other adapters.
- [All 39 packages](https://zudojs.oyinlola.site/docs/packages.md) — the rest of the ecosystem.
