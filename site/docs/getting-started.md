---
title: "Getting Started"
description: "Everything you need to install, configure, and launch your first Zudo application. Prerequisites, installation, and a quick-start guide."
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

There is also a command-line tool that scaffolds whole projects. It is published as `zudojs-cli` and its binary is called `zudojs`:

```bash
$ npm install -g zudojs-cli
$ zudojs --version
1.1.0
```

> These docs follow the framework source. If an export shown here is missing from the version you installed, update to the latest @zudojs release.

> WATCH OUT
>
>
>
> There is no package called `zudo` on npm. Every framework package is scoped as `@zudojs/<name>`; the CLI is the one exception, published as `zudojs-cli`.

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

Writing the files by hand is the best way to see what Zudo does. Once you know, the CLI writes a whole project for you.

```bash
$ npx zudojs-cli create my-app
```

In a terminal, `create` asks a short series of questions: project name, project type (backend, frontend or fullstack), backend architecture (monolith, modular-monolith or microservice), database, API style, package manager, and which optional capabilities to switch on. Every answer also has a flag, so you can skip the questions entirely:

```bash
$ npx zudojs-cli create my-app --type backend --architecture monolith --package-manager npm
```

Then start it. A scaffolded monolith gets a `dev` script that runs `tsx watch src/server.ts`, so:

```bash
$ cd my-app
$ npm run dev
```

The most useful `create` flags:

| Flag | What it does | Default |
| --- | --- | --- |
| `--type`, `-t` | backend, frontend or fullstack | `backend` |
| `--architecture`, `-a` | monolith, modular-monolith or microservice | `monolith` |
| `--package-manager`, `-p` | npm, pnpm, yarn or bun | `pnpm` |
| `--database`, `-d` | postgresql, mysql, sqlite or mongodb | `postgresql` |
| `--api` | rest, graphql or rpc | `rest` |
| `--frontend`, `-f` | react, next, vue, nuxt, angular, svelte, sveltekit, astro, vanilla, flutter, react-native | `none` |
| `--services` | comma-separated service names (microservice only) | `gateway,api` |
| `--no-install` | skip installing dependencies | off |
| `--no-git` | skip `git init` | off |

The other commands the `zudojs` binary provides:

| Command | What it does | Notes |
| --- | --- | --- |
| `zudojs create [name]` | Scaffolds a new project | Asks questions in a terminal; flags skip them |
| `zudojs dev` (`d`) | Starts the dev servers for the current project by running each app&rsquo;s `dev` script through the package manager | `--frontend-only`, `--backend-only`, `--port <n>` |
| `zudojs generate <kind> <name>` (`g`) | Writes new files from a template, into `src/` or `apps/api/src/` in a fullstack workspace | `--dry-run` shows the files without writing them |
| `zudojs add <feature>` | Adds a feature package to the backend app(s) and records it | database, queue, messaging, openapi, observability, security, cache, storage, scheduler, docs |
| `zudojs doctor` | Checks Node version, the project manifest, package manager, installed dependencies, tsconfig in every app, and declared features | Exits non-zero when an error-level check fails |
| `zudojs build` (`b`) | Runs the project's own build script | Detects the package manager from the lock file |
| `zudojs info` | Prints the CLI version, the project&rsquo;s type, architecture and package manager, and its `@zudojs/*` dependencies | Works outside a project too; mentions a newer CLI release when one exists |

> IN PLAIN WORDS
>
>
>
> `zudojs create` writes a hidden `.zudojs/manifest.json`. That file is how `dev`, `generate` and `add` know which architecture your project uses. Do not delete it.

## TROUBLESHOOTING

- **`Cannot use import statement outside a module`** → your `package.json` is missing `"type": "module"`. Run `npm pkg set type=module`.
- **Node is older than 24** → installs succeed and then the app fails at runtime on syntax it does not know. Check with `node --version` and upgrade.
- **`npm install zudo` fails** → that package does not exist. Install `@zudojs/core` and add the scoped packages you need.
- **Nothing prints after `createApplication`** → `createApplication` only builds the application. Module hooks run when you `await app.start()`, or if you pass `autoStart: true`.
- **`EADDRINUSE` from the adapter** → port 3000 is taken. Pass a different `port`, or `port: 0` and read `adapter.address`.

## NEXT STEPS

- [Your First App](https://zudojs.oyinlola.site/docs/getting-started-first-app.md) — grow the quick start into a two-module application with a dependency and an HTTP endpoint.
- [Project Structure](https://zudojs.oyinlola.site/docs/getting-started-project-structure.md) — what `zudojs create` actually writes to disk, folder by folder.
- [@zudojs/core](https://zudojs.oyinlola.site/docs/packages-core.md) — the full reference for modules, the application and the runtime.
- [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md) — routing, middleware, cookies and the other adapters.
- [All 39 packages](https://zudojs.oyinlola.site/docs/packages.md) — the rest of the ecosystem.
