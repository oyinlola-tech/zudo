---
title: "Create the Task API project"
description: "Install the ZudoJS command-line tool, create the Task API project with flags or by answering its questions, start it in development, find your way around the files, use every CLI command, and build and run it for production."
source: https://zudojs.oyinlola.site/learn/zudo-create-project
---

LESSON 48 OF 84

Meet ZudoJS Core

# Create the Task API project

Install the ZudoJS command-line tool, create the Task API project with flags or by answering its questions, start it in development, find your way around the files, use every CLI command, and build and run it for production.

- **50 min** to read and try
- **You need:** "Welcome to ZudoJS" and "Your first Zudo code", Node.js 24 and a working internet connection
- **You build:** A ZudoJS Task API that runs in development with npm run dev, publishes its own API docs, and runs in production from compiled JavaScript

  [Test yourself](#test)

## Install the ZudoJS command-line tool

So far you have installed single ZudoJS packages by hand. A real project needs a dozen of them, a server, a folder layout and scripts. The **ZudoJS CLI** (command-line interface) sets all of that up with one command.

It is published on npm as `zudojs`. It gives you two commands that do exactly the same thing: `zudojs`, and the short `zudo`. The `-g` flag installs it **globally**, so the commands work in any folder:

Terminal on your computer

```bash
$ npm install -g zudojs
added 13 packages in 2s
$ zudojs --version
2.1.3
$ zudo --version
2.1.3
```

The install time depends on your connection. Your version can be higher than 2.1.3. This course writes `zudojs`, but you can type `zudo` everywhere instead.

> IF THE INSTALL FAILS WITH EACCES
>
> On macOS and Linux, a global install can fail with a permission error, depending on how Node.js was installed. Don't fix it with `sudo`. Skip the global install and put `npx` in front instead: `npx zudojs@latest --version` prints the same version, and `npx zudojs@latest create …` works for every command in this lesson. The first time, npx asks `Ok to proceed? (y)`; type y.

> NOTE
>
> The `zudojs` package is a thin wrapper around a second package, `zudojs-cli`, which holds the real code. Installing either one gives you the same commands and the same version. Every framework package is named `@zudojs/something`. There is no npm package called `zudo`: that is only a command name.

## Create the project

Go to the folder where you keep your projects, **not** inside `ts-tasks`, and run:

Terminal on your computer

```bash
$ zudojs create task-api --package-manager npm --capabilities ""
│
◇  Project structure created
│
◇  Backend project generated (42 files)

added 66 packages, and audited 67 packages in 47s

13 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
npm warn install-scripts 1 package has install scripts not yet covered by allowScripts:
npm warn install-scripts   esbuild@0.28.2 (postinstall: node install.js)
npm warn install-scripts
npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
│
◆  Dependencies installed
│
◇  Project validated
│
◇  Git repository initialized
│
◇  Next steps ──╮
│               │
│  cd task-api  │
│  npm run dev  │
│               │
├───────────────╯
│
└  Project created successfully.
```

What the options mean:

- `task-api` is the name of the project and of the folder it creates.
- `--package-manager npm` uses npm, which you already have. The CLI's default is `pnpm`, a faster alternative you would have to install first.
- `--capabilities ""` starts with no optional extras. You will add them one at a time as the course needs them, with `zudojs add`.

> ON WINDOWS POWERSHELL
>
> Windows PowerShell 5 does not pass an empty `""` on to programs. Leave `--capabilities ""` out. When the CLI asks which capabilities to add, press Enter without selecting any.

The CLI wrote the files, installed the packages with npm, checked that the result compiles ("Project validated") and made the folder a git repository. `found 0 vulnerabilities` means `npm audit` knows of no security problems in any installed package. The esbuild warning is the same one you met in [Why TypeScript exists](https://zudojs.oyinlola.site/learn/ts-setup). It is harmless.

If you leave the options out, the CLI asks you each question in turn instead. The flags simply answer them in advance. The [next section](#interactive) shows the questions.

## Or answer the questions

If you do not remember a command, run `zudojs` on its own. In a terminal it opens a numbered menu:

Terminal on your computer

```bash
$ zudojs
┌  zudojs v2.1.3
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

Press a digit to pick an entry, or move with the arrow keys and press Enter. 1 runs `zudojs create`, 0 exits.

Run `zudojs create` (or its other name, `zudojs new`) with no project name, and the CLI becomes **interactive**: it asks one question at a time. These are the questions, in order. The first choice in each list is selected when the question appears, so pressing Enter takes it:

| Question | Choices | Flag that answers it |
| --- | --- | --- |
| What is your project name? | Type a name. The grey `my-project` is only a hint: pressing Enter without typing answers "Project name is required." | the name, as in `zudojs create task-api` |
| What are you building? | Backend, Frontend, Full Stack | `--type` |
| Select backend architecture | Monolith, Modular Monolith, Microservices | `--architecture` |
| Select database | PostgreSQL, MySQL, SQLite | `--database` |
| Select API style | REST, GraphQL, RPC | `--api` |
| Select package manager | pnpm, npm, Yarn, Bun | `--package-manager` |
| Select capabilities | CQRS, Events, Messaging, Queue, Observability, OpenAPI, Database, Security. Several allowed; none is fine. | `--capabilities` |
| Create project "…"? | Yes / No | (asked only in interactive mode) |

Keys: ↑ and ↓ move, Enter confirms, and in the capabilities list Space ticks or unticks an item. Each answered question folds into one line. Here it ran with `--no-install` and `--no-git`, so it only writes files. After typing `my-api`, choosing **npm** with ↓, and pressing Enter for everything else, the terminal shows:

Terminal on your computer

```bash
$ zudojs create --no-install --no-git
┌  Zudojs
│
◇  What is your project name?
│  my-api
│
◇  What are you building?
│  Backend
│
◇  Select backend architecture
│  Monolith
│
◇  Select database
│  PostgreSQL
│
◇  Select API style
│  REST
│
◇  Select package manager
│  npm
│
◇  Select capabilities
│  none
│
◇  Create project "my-api"?
│  Yes
│
◇  Project structure created
│
◇  Backend project generated (42 files)
│
◇  Project validated
│
◇  Next steps ──╮
│               │
│  cd my-api    │
│  npm run dev  │
│               │
├───────────────╯
│
└  Project created successfully.
```

Keep this `my-api` folder: it is your practice project, and you will try `zudojs generate resource` in it [below](#generate). If you press Ctrl + C during the questions, the CLI prints `Operation cancelled.` and creates nothing.

## Start the server

Terminal on your computer

```bash
$ cd task-api
$ npm run dev

> task-api@0.1.0 dev
> tsx watch src/server.ts

2026-09-23T22:38:28.326Z [INFO] [app-service] app service initialized
2026-09-23T22:38:28.328Z [INFO] [task-api] app module initialized
2026-09-23T22:38:28.330Z [INFO] [task-api] All modules initialized. modules=["integrations","app"] durationMs=7
2026-09-23T22:38:28.332Z [INFO] [task-api] All modules started. modules=["integrations","app"] durationMs=1
2026-09-23T22:38:28.334Z [INFO] [task-api] Runtime is ready. runtimeId=rt_7a09dde7083c4b85bfeea8d4cc5471b0 environment=development
Listening on http://0.0.0.0:3000
```

`npm run dev` runs the `dev` script from `package.json`: `tsx watch src/server.ts`. That is `tsx` from [Why TypeScript exists](https://zudojs.oyinlola.site/learn/ts-setup), plus `watch`, which restarts the server every time you save a file.

The lines before the last one are **log entries**, one per step as the application starts. Each has a time, a level (`INFO`), which part of the app wrote it in square brackets, and a message. The last line means it is ready: a backend is now listening on your computer, on **port** 3000. A port is a numbered door on your computer. Each program that listens for network requests uses a different one. `0.0.0.0` means "on every network address of this computer".

Leave it running. Open your web browser and go to [http://localhost:3000/health](http://localhost:3000/health). `localhost` means "this computer". You will see:

```json
{"status":"ok","checks":{},"timestamp":"2026-09-23T22:38:28.968Z"}
```

You can do the same from a second terminal window. `curl` sends a request and prints the answer. `-i` also prints the status line and headers:

Terminal on your computer

```bash
$ curl -i http://localhost:3000/health
HTTP/1.1 200 OK
content-type: application/json
x-content-type-options: nosniff
x-frame-options: DENY
x-xss-protection: 0
referrer-policy: strict-origin-when-cross-origin
x-dns-prefetch-control: off
cross-origin-opener-policy: same-origin
cross-origin-resource-policy: same-origin
content-security-policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
strict-transport-security: max-age=63072000; includeSubDomains; preload
permissions-policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()
content-length: 66
Date: Wed, 23 Sep 2026 22:38:28 GMT
Connection: keep-alive
Keep-Alive: timeout=5

{"status":"ok","checks":{},"timestamp":"2026-09-23T22:38:28.987Z"}
$ curl http://localhost:3000/tasks
{"error":"Not Found","method":"GET","path":"/tasks"}
$ curl http://localhost:3000/api/v1/examples
[]
```

This is the pattern from [Your first Zudo code](https://zudojs.oyinlola.site/learn/zudo-first-code), now real: a **status code** (200, 404) and a JSON **body**. The body of `/health` says the app is up; `checks` is empty because nothing like a database is connected yet.

The long list of headers in the middle are **security headers**. Every response gets them, with no work from you. For example, `x-frame-options: DENY` stops other websites from showing your pages inside theirs, and `x-content-type-options: nosniff` stops browsers from guessing a file's type. The [security lesson](https://zudojs.oyinlola.site/learn/zudo-security) explains each one.

`/tasks` does not exist yet, so the server answers 404. Building it is the next part of the course. `/api/v1/examples` is an **example resource** the CLI wrote so you can see a complete endpoint: it answers `[]`, an empty list of examples.

> TIP
>
> On Windows PowerShell, type `curl.exe` instead of `curl`. Plain `curl` there is a different command with different output.

The times, dates and ids you see will be your own. To stop the server, click into its terminal and press Ctrl + C.

## What the CLI generated

Open the `task-api` folder in your editor. To see every file at once, `tree` draws a folder as a tree: `-a` shows hidden files, `--dirsfirst` lists folders first, and `-I` leaves out `node_modules` and `.git`, which npm and git manage. (On Windows, or if `tree` is missing, look in your editor's file list instead.)

Terminal on your computer

```bash
$ tree -a --dirsfirst -I "node_modules|.git"
.
├── src
│   ├── configs
│   │   └── index.ts
│   ├── constants
│   │   └── index.ts
│   ├── controllers
│   │   ├── examples.controller.ts
│   │   └── index.ts
│   ├── databases
│   │   └── index.ts
│   ├── dtos
│   │   ├── examples.dto.ts
│   │   └── index.ts
│   ├── enums
│   │   └── index.ts
│   ├── errors
│   │   └── index.ts
│   ├── events
│   │   └── index.ts
│   ├── integrations
│   │   ├── index.ts
│   │   └── integration.ts
│   ├── interfaces
│   │   └── index.ts
│   ├── jobs
│   │   └── index.ts
│   ├── loaders
│   │   └── index.ts
│   ├── loggers
│   │   └── index.ts
│   ├── middlewares
│   │   └── index.ts
│   ├── models
│   │   └── index.ts
│   ├── modules
│   │   ├── app.module.ts
│   │   └── index.ts
│   ├── repositories
│   │   ├── examples.repository.ts
│   │   └── index.ts
│   ├── routes
│   │   ├── examples.routes.ts
│   │   ├── health.routes.ts
│   │   └── index.ts
│   ├── services
│   │   ├── app.service.ts
│   │   ├── examples.service.ts
│   │   └── index.ts
│   ├── types
│   │   └── index.ts
│   ├── utils
│   │   ├── http.ts
│   │   └── index.ts
│   ├── validators
│   │   └── index.ts
│   ├── app.ts
│   ├── container.ts
│   ├── index.ts
│   └── server.ts
├── tests
│   └── examples.test.ts
├── .zudojs
│   └── manifest.json
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── README.md
└── tsconfig.json

26 directories, 44 files
```

It looks like a lot, but most folders hold only an empty `index.ts`: a place ready for one kind of code. The files that do something are these.

### The project files

| Path | What it is |
| --- | --- |
| `package.json` | The project's name, its 13 `@zudojs` dependencies, and its scripts: `dev`, `build`, `start`, `typecheck`, `test` and `lint`. Its `zudojs` block records the project type, the architecture and the features you add. |
| `package-lock.json` | Written by npm: the exact version of every installed package, so the next install gets the same ones. Commit it; never edit it by hand. |
| `tsconfig.json` | TypeScript settings, like the one you wrote in [Why TypeScript exists](https://zudojs.oyinlola.site/learn/ts-setup), with `strict` on. It compiles `src/` into `dist/`. |
| `.env.example` | Every setting the app reads: `NODE_ENV`, `HOST`, `PORT`, `CORS_ORIGINS`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` and `DATABASE_URL`. Copy it to `.env` to change them. `.env` is in `.gitignore`, so real passwords you put there never reach git. |
| `.gitignore` | Keeps `node_modules/`, `dist/`, `.env` and log files out of git. |
| `.zudojs/manifest.json` | What the CLI knows about the project (monolith, REST, npm, capabilities), so later commands like `zudojs generate` put files in the right place. Don't edit it by hand. |
| `README.md` | How to start the project, and a map of the folders. |

### Starting the app

| Path | What it is |
| --- | --- |
| `src/server.ts` | The starting point, run by `npm run dev` and `npm start`. It loads the settings, builds a **router** (the part that picks which code answers which path), puts the security middleware in front of it, starts the runtime, then the HTTP server. On Ctrl + C or `SIGTERM` it stops them in reverse. |
| `src/app.ts` | `createApp` builds the **runtime**: the part of ZudoJS that starts and stops every piece of your app in the right order. It gives the runtime a logger, a dependency container, an event bus and the list of modules. Later lessons explain each one. |
| `src/configs/index.ts` | `loadConfig` reads the settings from the environment (and `.env`) and checks them. A wrong `PORT` stops the app with a clear error instead of starting badly. |
| `src/container.ts` | The **composition root**: it creates every controller, service and repository once, and hands them to the routes. It is the one place where the parts are connected. |
| `src/modules/app.module.ts` | The first **module**, a self-contained piece of the app that the runtime starts and stops. It uses `src/services/app.service.ts`. Those were the "app service initialized" and "app module initialized" log entries. |
| `src/integrations/` | `integration.ts` defines what an **integration** is: a connection to something outside the app, such as a database or Redis, that starts before your modules, stops after them, and reports its health to `/health`. The list in `index.ts` is empty until you `zudojs add` one. |
| `src/index.ts` | Exports `createApp`, for tests and tools that want the app without the HTTP server. |

### Answering requests

| Path | What it is |
| --- | --- |
| `src/routes/index.ts` | `registerRoutes` adds every route to the router. `zudojs generate` adds new routes here for you. |
| `src/routes/health.routes.ts` | Answers `GET /health`. |
| `src/routes/examples.routes.ts` | The five routes of the example resource at `/api/v1/examples`: list, get one, create, update, delete. |
| `src/controllers/examples.controller.ts` | A **controller** turns a request into a response: it checks the input and calls the service. |
| `src/services/examples.service.ts` | A **service** holds the rules, for example "an unknown id is a 404". |
| `src/repositories/examples.repository.ts` | A **repository** stores the data. This one keeps it in memory, so it is gone after a restart. |
| `src/dtos/examples.dto.ts` | The `@zudojs/schema` schemas that check what comes in (a **DTO**, data transfer object, is the shape of data that crosses the API). |
| `src/utils/http.ts` | Small helpers: `json` builds a response, `readJsonBody` reads a request body, `validationFailed` answers 400, and `securityHeaders` adds the security headers. |
| `tests/examples.test.ts` | Three tests for the example resource, so `npm test` works from day one. |

The controller, service and repository are the layers from [Backend architecture](https://zudojs.oyinlola.site/learn/backend-architecture). The example resource shows them working together; you can copy its shape, and delete it when you no longer need it. The empty folders (`constants/`, `databases/`, `enums/`, `errors/`, `events/`, `interfaces/`, `jobs/`, `loaders/`, `loggers/`, `middlewares/`, `models/`, `types/`, `validators/`) are places for code you write later, so every ZudoJS project keeps each kind of file in the same spot.

Here is the `/health` route. `router.get` says "when a GET request for `/health` arrives, run this function". `json` is a small helper from `src/utils/http.ts` that builds a response with a status code and a JSON body:

src/routes/health.routes.tsNode.js only

```ts
import type { HttpRouter } from "@zudojs/http";

import { json } from "../utils/http.js";

/** What /health reports. */
export interface HealthReport {
  readonly ready: boolean;
  readonly checks: Readonly<Record<string, "up" | "down">>;
}

/** Computes the current {@link HealthReport}. */
export type HealthCheck = () => Promise<HealthReport>;

export function registerHealthRoutes(router: HttpRouter, check: HealthCheck): void {
  router.get(
    "/health",
    async () => {
      const report = await check();
      return json(report.ready ? 200 : 503, {
        status: report.ready ? "ok" : "unavailable",
        checks: report.checks,
        timestamp: new Date().toISOString(),
      });
    },
    { openapi: false },
  );
}
```

It answers **503 Service Unavailable** while the app is starting or stopping, or when a connected service is down. A hosting platform reads that and sends no traffic until the app is ready. `{ openapi: false }` hides this route from the API documentation you will add below.

You can try the same idea on its own, without starting a server. `createHttpTestClient` comes from `@zudojs/testing`, which the project already has for its tests. It sends a request straight to a router and gives you the answer:

health-check.tsNode.js only

```ts
import { createResponseContext, createRouter } from "@zudojs/http";
import { createHttpTestClient } from "@zudojs/testing";

let ready = false;
const router = createRouter();
router.get("/health", async () =>
  createResponseContext({ status: ready ? 200 : 503 }).json({ status: ready ? "ok" : "unavailable" }),
);

const client = createHttpTestClient(router);
const starting = await client.get("/health");
console.log(starting.status, starting.json());

ready = true;
const running = await client.get("/health");
console.log(running.status, running.json());
await client.close();
```

Output of `npx tsx health-check.ts`

```ts
503 { status: 'unavailable' }
200 { status: 'ok' }
```

Same route, two answers: 503 while the app is not ready, 200 once it is.

And here is the part of `src/server.ts` that every request goes through. It is shortened; open the file to see all of it:

server.ts (part)Node.js only

```ts
const router = createRouter();
registerRoutes(router, createDependencies({ health: /* … */ }));

const pipeline = new HttpMiddlewarePipeline({
  middlewares: [
    securityHeaders(),
    createCorsMiddleware({ allowOrigin: config.corsOrigins }),
    createRateLimitMiddleware({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.max }),
    dispatch,
  ],
});
```

A request passes through each **middleware** in the list, in order, before `dispatch` hands it to the router:

- `securityHeaders()` adds the security headers you saw in the `curl` output.
- `createCorsMiddleware` decides which other websites may call your API from a browser. The list comes from `CORS_ORIGINS`, which is empty, so the answer is "none". That is the safe default: you open the door on purpose, one website at a time.
- `createRateLimitMiddleware` allows each client 300 requests per minute (`RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`). One more gets **429 Too Many Requests**, so a single client cannot flood your server.

The [middleware lesson](https://zudojs.oyinlola.site/learn/zudo-middleware) shows how to write your own.

## Check the project

The project comes with the same check-then-run habits you learned in [Why TypeScript exists](https://zudojs.oyinlola.site/learn/ts-setup), as npm scripts:

Terminal on your computer

```bash
$ npm run typecheck

> task-api@0.1.0 typecheck
> tsc --noEmit

$ npm test

> task-api@0.1.0 test
> vitest run


 RUN  v5.0.1 ~/task-api


 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  23:38:38
   Duration  1.97s (import 81%, transform 13%, tests 6%, worker 1%)

$ zudojs doctor
Zudojs Doctor - Project Diagnostics

✔ Node.js version: Node.js v24.19.0 (meets minimum v24)
✔ Git: git version 2.53.0
✔ Package manager (npm): 11.19.0
✔ Zudojs project: backend (monolith) from .zudojs/manifest.json
✔ Package manager: npm (lock file present)
✔ Dependencies installed: node_modules present
✔ TypeScript configuration: tsconfig.json found in every app
✔ Zudojs dependencies: 13 Zudojs package(s) declared
✔ Features: Every declared feature has its package
✔ Capabilities: The manifest and package.json record the same capabilities

All checks passed!
```

- `npm run typecheck` is `tsc --noEmit`. No output means no type errors.
- `npm test` runs the tests with Vitest. The three tests create, read, update and delete an example, and check that bad input gets a 400. You will write your own tests later in the course.
- `zudojs doctor` checks your whole setup: Node.js version, dependencies, configuration. Run it first whenever something seems wrong.

## Every CLI command

You have used `create` and `doctor`. `zudojs --help` lists all seven. Run it inside `task-api`:

Terminal on your computer

```bash
$ zudojs --help
zudojs v2.1.3
Command-line interface for the Zudojs framework.

Usage:
  zudojs <command> [options]

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

Run "zudojs help <command>" for help on one command.
```

The words in brackets are other names: `zudojs g` is `zudojs generate`. Every command has its own help, for example `zudojs help create` or `zudojs generate --help`. Here is what each one is for:

| Command | What it does | Useful options |
| --- | --- | --- |
| `zudojs create [name]` | Creates a project. Asks questions for anything you do not pass as a flag. | `--architecture`, `--package-manager`, `--database`, `--capabilities`, `--no-install`, `--no-git` |
| `zudojs dev` | Starts the development server. For this project it runs `npm run dev`. | `-p 4000` picks the port |
| `zudojs build` | Compiles the project for production. For this project it runs `npm run build`. |  |
| `zudojs generate <schematic> <name>` | Writes new files from a template into the right folders. Schematics: resource, service, module, command, query, controller, repository, middleware, event, job, route, model, dto, validator. | `--dry-run` shows the files without writing them; `--force` overwrites |
| `zudojs add <feature>` | Adds a feature to the project: writes the code, registers it, adds its settings and installs its package. Features: database, redis, websockets, email, docker, queue, messaging, openapi, observability, cache, storage, scheduler. | `--skip-install` |
| `zudojs doctor` | Checks Node.js, the package manager, dependencies and the project files. |  |
| `zudojs info` | Prints the CLI version and the project's type, architecture and ZudoJS packages. |  |

`info` is the quickest way to see what a project is made of:

Terminal on your computer

```bash
$ zudojs info
Zudojs CLI
  Version: 2.1.3
  Node.js: v24.19.0

Project
  Name: task-api
  Version: 0.1.0
  Type: backend
  Architecture: monolith
  Package manager: npm
  Capabilities: (none)

Zudojs dependencies
  @zudojs/config: ^1.3.3
  @zudojs/constants: ^1.1.4
  @zudojs/container: ^1.2.3
  @zudojs/core: ^1.2.4
  @zudojs/errors: ^1.3.2
  @zudojs/events: ^1.3.3
  @zudojs/http: ^1.4.4
  @zudojs/logger: ^1.4.3
  @zudojs/runtime: ^1.3.3
  @zudojs/schema: ^1.2.3
  @zudojs/security: ^1.3.3
  @zudojs/types: ^1.2.0
  @zudojs/validation: ^1.1.2
```

The `^` in front of each version means "this version or any later one without breaking changes" ([npm packages](https://zudojs.oyinlola.site/learn/npm-packages) explained it). Your numbers can be higher.

## Generate code

`generate` with `--dry-run` tells you what it *would* write, and writes nothing. It is a safe way to learn where each kind of file belongs. The most useful schematic is `resource`: a complete endpoint with every layer:

Terminal on your computer

```bash
$ zudojs generate resource tasks --dry-run
Detected architecture: monolith
Dry run: 8 files would be written or updated (nothing written):
  - src/dtos/tasks.dto.ts
  - src/repositories/tasks.repository.ts
  - src/services/tasks.service.ts
  - src/controllers/tasks.controller.ts
  - src/routes/tasks.routes.ts
  - tests/tasks.test.ts
  - src/routes/index.ts
  - src/container.ts
$ zudojs generate middleware audit --dry-run
Detected architecture: monolith
Dry run: 3 files would be generated (nothing written):
  - src/middlewares/audit.middleware.ts
  - src/middlewares/index.ts
  - src/server.ts
```

The CLI read `.zudojs/manifest.json`, saw a monolith, and chose the folders to match. In a modular monolith the same command would place the files inside a module. The last two lines of the first list are files it would *update*: it adds the new routes to `registerRoutes` and the new controller to `src/container.ts`, so the endpoint works with no wiring by hand. The middleware works the same way: besides `audit.middleware.ts`, it would export the new function from `src/middlewares/index.ts` and add `auditMiddleware()` to the list of middleware in `src/server.ts`, between the `// zudojs:server-middleware` markers.

Do not run that one for real in `task-api`: in the next lessons you build `/tasks` yourself, so you understand every line. Try it for real in your practice project instead:

Terminal on your computer

```bash
$ cd my-api
$ npm install
…
$ zudojs generate resource notes
Detected architecture: monolith
Generated 8 files:
  - src/dtos/notes.dto.ts
  - src/repositories/notes.repository.ts
  - src/services/notes.service.ts
  - src/controllers/notes.controller.ts
  - src/routes/notes.routes.ts
  - tests/notes.test.ts
  - src/routes/index.ts
  - src/container.ts
$ npm test

> my-api@0.1.0 test
> vitest run


 RUN  v5.0.1 ~/my-api


 Test Files  2 passed (2)
      Tests  6 passed (6)
   Start at  23:39:26
   Duration  2.12s (import 85%, transform 8%, tests 6%)
```

The new tests pass straight away. Start it with `PORT=3001 npm run dev` (port 3001, so it does not clash with `task-api`), and in a second terminal create a note, list the notes, then send two bad requests:

Terminal on your computer

```bash
$ curl -i -X POST http://localhost:3001/api/v1/notes -H "content-type: application/json" -d '{"name":"Buy milk"}'
HTTP/1.1 201 Created
content-type: application/json
…
{"id":"e4f62fa7-5b17-4064-b267-9febf15dae0c","name":"Buy milk","createdAt":"2026-09-23T22:39:40.302Z","updatedAt":"2026-09-23T22:39:40.302Z"}
$ curl http://localhost:3001/api/v1/notes
[{"id":"e4f62fa7-5b17-4064-b267-9febf15dae0c","name":"Buy milk","createdAt":"2026-09-23T22:39:40.302Z","updatedAt":"2026-09-23T22:39:40.302Z"}]
$ curl -X POST http://localhost:3001/api/v1/notes -H "content-type: application/json" -d '{"name":""}'
{"error":"Validation failed","issues":[{"path":"name","message":"String must be at least 1 character"}]}
$ curl http://localhost:3001/api/v1/notes/123
{"error":"Validation failed","issues":[{"path":"id","message":"Invalid uuid format"}]}
```

One command gave you a working endpoint that checks its input: an empty name and an id that is not a **UUID** (the long random id format) are both refused with a 400. The notes live in memory, so they are gone when the server restarts. On Windows PowerShell, set the port with `$env:PORT = "3001"` first, and put the JSON in a file with `-d "@note.json"`, because PowerShell handles the quotes differently.

Every schematic writes code that compiles as it is. `generate command` and `generate query` are for the [CQRS lesson](https://zudojs.oyinlola.site/learn/zudo-cqrs): they need `@zudojs/cqrs`, which a new project does not have yet. The CLI adds it to `package.json` and tells you to install it:

Terminal on your computer

```bash
$ zudojs generate command create-note
Detected architecture: monolith
Generated 3 files:
  - src/commands/create-note/create-note.command.ts
  - src/commands/create-note/create-note.handler.ts
  - src/commands/create-note/index.ts
Warning: Added @zudojs/cqrs to package.json.
Warning: Run your package manager's install command to fetch them.
$ npm install

added 1 package, and audited 68 packages in 2s
…
$ npm run typecheck

> my-api@0.1.0 typecheck
> tsc --noEmit
```

Until you run `npm install`, `npm run typecheck` fails with "Cannot find module '@zudojs/cqrs'". The three files hold the command, a handler with an `execute` method for your logic, and a `registerCreateNoteCommand` function that puts the handler on a command bus. The CQRS lesson explains commands, handlers and buses.

## Add a feature: API docs

`add` plugs a feature into the project. It writes the code, wires it in and installs the package. Try it with `openapi`, which publishes a description of your API. Stop the server first, then run this inside `task-api`:

Terminal on your computer

```bash
$ zudojs add openapi
Adding feature: openapi — OpenAPI document at /openapi.json and a docs page at /docs
Updated:
  - src/server.ts
  - package.json
Installing dependencies with npm...

up to date, audited 67 packages in 2s

13 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
npm warn install-scripts 1 package has install scripts not yet covered by allowScripts:
npm warn install-scripts   esbuild@0.28.2 (postinstall: node install.js)
npm warn install-scripts
npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
Feature "openapi" added successfully.
Next: Describe routes with the `openapi` route option; hide one with `openapi: false`.
```

`up to date` means npm had nothing new to download: the package it needs came along with `@zudojs/http`. The CLI added one line to `src/server.ts`, `mountOpenAPI(router, …)`, and recorded `"openapi"` in the project's features. Start the server again with `npm run dev`:

Terminal on your computer

```bash
$ curl -s http://localhost:3000/openapi.json | head -4
{
  "openapi": "3.1.0",
  "info": {
    "title": "task-api",
```

**OpenAPI** is a standard format that describes every route of an API: its path, what it accepts and what it answers. Other tools read it to test your API or to write client code for it. Every route with an `openapi` option ends up in this document, so the examples routes are listed and `/health` is not.

Now open [http://localhost:3000/docs](http://localhost:3000/docs) in your browser. It is an interactive page built from that document: click a route, then **Try it out**, and you can send a real request to your running server. The [OpenAPI lesson](https://zudojs.oyinlola.site/learn/zudo-openapi) goes further.

Other features write more. `zudojs add database`, for example, writes a database connection in `src/integrations/`, adds `DATABASE_URL` to `.env.example` and new scripts to `package.json`. You will use it in the data part of the course.

## Build and run for production

`npm run dev` is for your own computer: `tsx` compiles TypeScript on the fly and restarts on every save. A production server should not do that work. There, you compile once to plain JavaScript, and Node.js runs the result. That step is called the **build**:

Terminal on your computer

```bash
$ npm run build

> task-api@0.1.0 build
> tsc
```

No output means no errors. `build` is plain `tsc`: this project's `tsconfig.json` has `"outDir": "dist"` and `"rootDir": "src"`, so every `src/` file now has a JavaScript twin in `dist/`, such as `dist/server.js` for `src/server.ts`. `zudojs build` does the same through the CLI:

Terminal on your computer

```bash
$ zudojs build
Building project at: ~/task-api

> task-api@0.1.0 build
> tsc

Build completed successfully.
```

Now start the compiled app. The `start` script is `node dist/server.js`: no `tsx`, no watching. `NODE_ENV=production` is the usual way to tell a Node.js app it runs in production:

Terminal on your computer

```bash
$ NODE_ENV=production npm start

> task-api@0.1.0 start
> node dist/server.js

2026-09-23T22:41:13.395Z [INFO] [app-service] app service initialized
2026-09-23T22:41:13.398Z [INFO] [task-api] app module initialized
2026-09-23T22:41:13.399Z [INFO] [task-api] All modules initialized. modules=["integrations","app"] durationMs=7
2026-09-23T22:41:13.401Z [INFO] [task-api] All modules started. modules=["integrations","app"] durationMs=1
2026-09-23T22:41:13.403Z [INFO] [task-api] Runtime is ready. runtimeId=rt_fd982c8347c3402288c2a47a8aecce2e environment=production
Listening on http://0.0.0.0:3000
```

The runtime noticed `environment=production`. `curl http://localhost:3000/health` answers exactly as before. Now press Ctrl + C and read what the app prints on its way out:

Terminal on your computer

```ts
^CReceived SIGINT: shutting down.
2026-09-23T22:41:14.343Z [INFO] [task-api] Initiating graceful shutdown. timeoutMs=30000
2026-09-23T22:41:14.345Z [INFO] [task-api] app module stopped
2026-09-23T22:41:14.345Z [INFO] [task-api] All modules stopped. modules=["app","integrations"] durationMs=1
2026-09-23T22:41:14.346Z [INFO] [task-api] All modules destroyed. durationMs=0
2026-09-23T22:41:14.347Z [INFO] [task-api] Graceful shutdown complete.
2026-09-23T22:41:14.347Z [INFO] [task-api] Runtime stopped. runtimeId=rt_fd982c8347c3402288c2a47a8aecce2e
```

This is the **graceful shutdown** the BookStore never had ([the honest review](https://zudojs.oyinlola.site/learn/bookstore-auth) listed it). The first line is `src/server.ts` noticing the signal. The server stopped taking requests, then the runtime stopped every module in reverse order (`app` first, `integrations` last), with a 30-second limit in case something hangs. A hosting platform sends `SIGTERM` instead of Ctrl + C when it replaces your app, and `src/server.ts` handles both the same way.

> TIP
>
> On Windows PowerShell, set the variable first with `$env:NODE_ENV = "production"`, then run `npm start`.

The generated `.gitignore` already lists `dist/`: build output is made from the source, so it never belongs in git. The [deployment lesson](https://zudojs.oyinlola.site/learn/deployment) runs exactly these two steps, `npm run build` and `npm start`, inside a Docker image.

## Practice

TRY IT YOURSELF

### Change the health response

With `npm run dev` running, open `src/routes/health.routes.ts` and add a `service: "task-api"` property to the object it sends. Save the file. Watch the terminal restart the server, then reload [http://localhost:3000/health](http://localhost:3000/health).

**Show a solution**

src/routes/health.routes.ts (part)Node.js only

```ts
return json(report.ready ? 200 : 503, {
  status: report.ready ? "ok" : "unavailable",
  service: "task-api",
  checks: report.checks,
  timestamp: new Date().toISOString(),
});
```

Terminal on your computer

```bash
$ curl http://localhost:3000/health
{"status":"ok","service":"task-api","checks":{},"timestamp":"2026-09-23T22:41:30.302Z"}
```

You changed a running backend without restarting it by hand, because `tsx watch` did it for you. The terminal shows the old runtime shutting down and a new one starting.

TRY IT YOURSELF

### Where does a repository go?

Without writing anything, find out where `zudojs generate` would put a repository called `tasks`.

**Show a solution**

Terminal on your computer

```bash
$ zudojs generate repository tasks --dry-run
Detected architecture: monolith
Dry run: 2 files would be written or updated (nothing written):
  - src/dtos/tasks.dto.ts
  - src/repositories/tasks.repository.ts
```

It would create `src/repositories/tasks.repository.ts`, plus the DTO file with the schemas the repository uses. `--dry-run` wrote nothing.

TRY IT YOURSELF

### Development or production?

You changed `src/routes/health.routes.ts`, then ran `npm start`. The old answer comes back. Why, and what is the fix?

**Show a solution**

`npm start` runs the compiled `dist/server.js`, which was built before your change. Run `npm run build` again, then `npm start`. While you are developing, use `npm run dev` instead: it runs the TypeScript in `src/` directly and restarts on every save.

TRY IT YOURSELF

### Let one website in

Your API gets a web front end at `https://tasks.example.com`. Right now the browser blocks it, because `CORS_ORIGINS` is empty. How do you allow that one website, without allowing every website?

**Show a solution**

Copy `.env.example` to `.env` and set `CORS_ORIGINS=https://tasks.example.com`, then restart the server. Several websites are separated with commas. Never use `*` (every website) for an API that uses logins: any page on the internet could then call it from a visitor's browser.

## Recap

- `npm install -g zudojs` gives you the `zudojs` command and its short name `zudo`. `npx zudojs@latest` works without a global install.
- `zudojs create task-api --package-manager npm` creates a project with a server, a router, a runtime, security defaults, an example resource and tests, installs its packages and sets up git.
- `zudojs` on its own opens a menu; `zudojs create` with no options asks its questions one at a time.
- `npm run dev` starts the server and restarts it when you save. `/health` answers 200 when the app is ready; every response carries security headers, CORS is closed and each client is rate limited.
- `npm run typecheck`, `npm test` and `zudojs doctor` keep the project healthy.
- The CLI has seven commands: `create`, `dev`, `build`, `generate`, `add`, `doctor` and `info`. `generate resource` writes a whole endpoint and registers it; `--dry-run` shows what would be written. `add openapi` serves `/openapi.json` and a docs page at `/docs`.
- For production, `npm run build` compiles `src/` into `dist/`, and `NODE_ENV=production npm start` runs it with plain Node.js. Ctrl + C or `SIGTERM` shuts it down gracefully.

You have a running ZudoJS backend. Next, you will give it real routes: `GET /tasks`, `POST /tasks` and friends, using the `TaskService` and schema you wrote in [Your first Zudo code](https://zudojs.oyinlola.site/learn/zudo-first-code).

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
