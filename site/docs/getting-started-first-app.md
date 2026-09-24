---
title: "Your First App"
description: "Build your first ZudoJS API with the zudo CLI: create a project, call /api/v1/examples, generate a users resource and run its tests. Real output throughout."
source: https://zudojs.oyinlola.site/docs/getting-started-first-app
---

v1.0.0

# Your First App

Create an API with the CLI, call it, add a users resource and run its tests. Then build the same ideas by hand.

SCAFFOLD CLI FIRST APP

## WHAT YOU ARE BUILDING

A small web API: a program that waits for HTTP requests and answers them with JSON. You will let the Zudo command-line tool (the **CLI**) write the project, start it, call it with `curl`, add a `/api/v1/users` endpoint with one command, and run its tests. Every output below is what the commands really print, with timestamps left out.

Four words you will meet, each in one sentence:

- An **endpoint** is one URL your API answers, such as `GET /health`.
- A **resource** is one kind of thing the API manages, such as users, with endpoints to list, read, create, update and delete them.
- A **schematic** is a template the CLI fills in to write new files, such as `resource`.
- A **module** is one named piece of your app with hooks that run when it starts and stops. The second half of this page builds two by hand.

> You need Node.js 24 or newer; check with `node --version`. If you have not read it yet, [Getting Started](https://zudojs.oyinlola.site/docs/getting-started.md) explains what Zudo is.

## 1. INSTALL THE CLI

Install the CLI once, globally, so its commands work in any folder:

```bash
$ npm install -g zudojs
$ zudo --version
2.1.0
```

This gives you two names for the same command, `zudojs` and the shorter `zudo`. This page uses `zudo`. (`npm install -g zudojs-cli` installs exactly the same thing.)

> TIP
>
>
>
> Lost? Type `zudo` on its own and press Enter. It shows a numbered menu of everything it can do; press `0` to leave.

## 2. CREATE THE PROJECT

Go to the folder where you keep your code and run:

```bash
$ zudo create my-api -p npm
```

`my-api` is the name of the new folder. `-p npm` picks npm as the package manager, the tool that downloads libraries (the CLI defaults to pnpm). The CLI then asks a few questions, such as the kind of project and which extras to switch on. Press **Enter** at each one to accept the default: a backend API in a single app. When it finishes you see:

```ts
◇  Project structure created
◇  Backend project generated (42 files)
Capabilities build on: messaging, events, logger, http, validation

added 71 packages, and audited 72 packages in 47s

13 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
│
◆  Dependencies installed
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

The CLI wrote 42 files and downloaded the libraries they use. You do not need to read them yet; [Project Structure](https://zudojs.oyinlola.site/docs/getting-started-project-structure.md) explains every one.

> IN PLAIN WORDS
>
>
>
> Recent npm versions may also print `npm warn install-scripts` lines about `esbuild`. That is npm asking before it runs a package’s setup script; the project works without it.

## 3. START THE SERVER

Move into the project and start it in development mode:

```bash
$ cd my-api
$ npm run dev

> my-api@0.1.0 dev
> tsx watch src/server.ts

[INFO] [app-service] app service initialized
[INFO] [my-api] app module initialized
[INFO] [my-api] All modules initialized. modules=["integrations","app"] durationMs=40
[INFO] [my-api] All modules started. modules=["integrations","app"] durationMs=1
[INFO] [my-api] Runtime is ready. runtimeId=rt_79f1bdf67db24277b875048c13628090 environment=development
Listening on http://0.0.0.0:3000
```

The last line is the one that matters: your API is running on port 3000. `tsx watch` restarts it by itself whenever a file changes, so leave this terminal open and use a second one for the next steps. (`zudo dev` does the same thing as `npm run dev`.)

## 4. CALL THE API

`curl` sends an HTTP request from the terminal and prints the answer. First ask whether the server is healthy:

```bash
$ curl http://localhost:3000/health
{"status":"ok","checks":{},"timestamp":"2026-09-23T14:38:36.993Z"}
```

The project comes with one example resource at `/api/v1/examples`, so you can see a full round trip before writing anything. It starts empty. Create an example, then list them:

```bash
$ curl http://localhost:3000/api/v1/examples
[]

$ curl -X POST http://localhost:3000/api/v1/examples \
    -H "content-type: application/json" \
    -d '{"name":"Ada"}'
{"id":"c1b5cc16-73d8-468b-9049-d26d8c1f1902","name":"Ada","createdAt":"2026-09-23T14:38:37.135Z","updatedAt":"2026-09-23T14:38:37.135Z"}

$ curl http://localhost:3000/api/v1/examples
[{"id":"c1b5cc16-73d8-468b-9049-d26d8c1f1902","name":"Ada","createdAt":"2026-09-23T14:38:37.135Z","updatedAt":"2026-09-23T14:38:37.135Z"}]
```

The server gave the new example an `id` and timestamps. Now send something wrong on purpose. The API checks every request against a schema and says exactly what is wrong, with status 400:

```bash
$ curl -X POST http://localhost:3000/api/v1/examples \
    -H "content-type: application/json" \
    -d '{"name":""}'
{"error":"Validation failed","issues":[{"path":"name","message":"String must be at least 1 character"}]}

$ curl http://localhost:3000/api/v1/examples/not-a-uuid
{"error":"Validation failed","issues":[{"path":"id","message":"Invalid uuid format"}]}
```

Open `http://localhost:3000/docs` in a browser to see every endpoint described and try it out. The machine-readable version is at `/openapi.json`.

> IN PLAIN WORDS
>
>
>
> The examples are kept in memory, so restarting the server empties them. That is on purpose for a first project; `zudo add database` switches new resources to a real PostgreSQL database later.

## 5. GENERATE A RESOURCE

Now add your own resource. In the second terminal, inside `my-api`:

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

One command wrote each layer of a users endpoint and connected it:

- `users.dto.ts` describes what a user looks like and what a valid request is.
- `users.repository.ts` stores users (in memory for now).
- `users.service.ts` holds the rules, such as “an unknown id is a 404”.
- `users.controller.ts` turns an HTTP request into a service call, and `users.routes.ts` says which URL reaches which controller method.
- `tests/users.test.ts` checks all of it.
- The last two lines are files that were *updated*: the new routes were registered in `src/routes/index.ts` and the controller was built in `src/container.ts`.

> WATCH OUT
>
>
>
> In those two updated files the CLI writes between comments such as `// zudojs:routes:start` and `// zudojs:routes:end`. Keep those comments. Without them the CLI cannot register the next resource for you.

## 6. CALL YOUR RESOURCE

The server in the first terminal restarted when the files changed, so `/api/v1/users` already works. `-i` makes curl print the status line too:

```bash
$ curl -i -X POST http://localhost:3000/api/v1/users \
    -H "content-type: application/json" \
    -d '{"name":"Grace"}'
HTTP/1.1 201 Created
...
{"id":"9a51c33f-14a4-48de-aec8-c4e488ecd032","name":"Grace","createdAt":"2026-09-23T14:39:47.180Z","updatedAt":"2026-09-23T14:39:47.180Z"}

$ curl http://localhost:3000/api/v1/users
[{"id":"9a51c33f-14a4-48de-aec8-c4e488ecd032","name":"Grace","createdAt":"2026-09-23T14:39:47.180Z","updatedAt":"2026-09-23T14:39:47.180Z"}]

$ curl -i http://localhost:3000/api/v1/users/00000000-0000-4000-8000-000000000000
HTTP/1.1 404 Not Found
...
{"error":"User \"00000000-0000-4000-8000-000000000000\" was not found.","code":"ERR_RESOURCE_NOT_FOUND"}
```

The `...` stands for the response headers. Among them are the security headers every response gets, such as `x-content-type-options: nosniff` and `x-frame-options: DENY`.

> CALLING IT FROM A WEB PAGE?
>
>
>
> Browsers only let a page on another origin call your API if the API allows it (*CORS*). The generated project allows none by default. List your front end in `.env`, for example `CORS_ORIGINS=http://localhost:5173`, after copying `.env.example` to `.env`.

## 7. RUN THE TESTS

Tests are small programs that call your code and check the answers, so you find out when a change breaks something. Stop the server with `Ctrl+C` (or use the second terminal) and run:

```bash
$ npm test

> my-api@0.1.0 test
> vitest run

 RUN  v5.0.1

 Test Files  2 passed (2)
      Tests  6 passed (6)
```

Two test files ran: `tests/examples.test.ts`, which came with the project, and `tests/users.test.ts`, which `generate resource` just wrote. Each sends real requests to the routes, without starting a server, through `createHttpTestClient` from `@zudojs/testing`.

From here, `zudo add redis`, `zudo add database` or `zudo add docker` plug in more. The [CLI reference](https://zudojs.oyinlola.site/docs/packages-cli.md#add) lists what each one writes.

## IF THE CLI COMPLAINS

- **`zudo: command not found`** → the global install did not reach your `PATH`. Run `npx zudojs create my-api` instead, or see the [install notes](https://zudojs.oyinlola.site/docs/packages-cli.md#install).
- **`This command must be run inside a Zudojs project directory.`** → `generate`, `add`, `dev` and `build` must run inside the project folder (any subfolder works). `cd my-api` first.
- **`resource "users" already exists`** → you ran the same command twice. Nothing was changed; pick another name, or add `--force` to rewrite the files.
- **`EADDRINUSE`** → something else is using port 3000, often an earlier `npm run dev`. Stop it, or start on another port with `PORT=4000 npm run dev`.
- **`Command "creat" was not found`** → a typo; the CLI suggests the command it thinks you meant.

## UNDER THE HOOD: BUILD ONE BY HAND

The CLI saves typing, but nothing in Zudo requires it. This second part builds a tiny notes service from plain files, to show the ideas the generated project is made of: two endpoints, one that adds a note and one that lists them.

You will meet three ideas, each in one sentence:

- A **module** is one named piece of your app, with hooks that run when the app starts and stops.
- The **container** is a box you put shared objects in, so one module can hand something to another.
- A **token** is the named key you file something under in that box; you ask the container for the token and it hands back the thing.

The finished app has four files:

```ts
notes-app/
├── package.json
├── tsconfig.json
└── src/
    ├── noteStore.ts     # the data, plus its token
    ├── notes.module.ts  # puts the store in the container
    ├── api.module.ts    # takes it out and serves HTTP
    └── main.ts          # starts the application
```

## BY HAND: SET UP THE PROJECT

Create the folder and install the two packages this app uses.

```bash
$ mkdir notes-app && cd notes-app
$ npm init -y
$ npm pkg set type=module
$ npm install @zudojs/core @zudojs/http
$ npm install -D typescript @types/node tsx
```

Then create `tsconfig.json`. These are the core of the settings the CLI writes into a scaffolded project:

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true,
    "lib": ["ES2024"],
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

> WATCH OUT
>
>
>
> With `module: "Node16"` your own imports need the `.js` extension even though the files are `.ts` — that is why every import below reads `"./noteStore.js"`.

## STEP 1: THE NOTE STORE

Start with plain TypeScript — no framework at all. This class holds notes in memory, and `createToken` gives it the key other modules will look it up by.

Create `src/noteStore.ts`:

```ts
import { createToken } from "@zudojs/core";

export interface Note {
  readonly id: number;
  readonly text: string;
}

export class NoteStore {
  private readonly notes: Note[] = [];
  private nextId = 1;

  add(text: string): Note {
    const note = { id: this.nextId++, text };
    this.notes.push(note);
    return note;
  }

  all(): readonly Note[] {
    return this.notes;
  }
}

export const NOTE_STORE = createToken<NoteStore>("NoteStore");
```

`createToken` returns a unique symbol. Two tokens with the same description are still different keys, so nothing can collide with yours by accident.

## STEP 2: THE NOTES MODULE

Now wrap the store in a module. Its only job is to create one `NoteStore` and file it in the container under `NOTE_STORE`.

Create `src/notes.module.ts`:

```ts
import { defineModule } from "@zudojs/core";
import type { Module } from "@zudojs/core";
import { NoteStore, NOTE_STORE } from "./noteStore.js";

export const notesModule = defineModule({
  id: "notes",
  name: "Notes",
  factory: (): Module => ({
    id: "notes",
    name: "Notes",

    onInitialize: (context) => {
      context.application
        .getContainer()
        .register(NOTE_STORE, { useValue: new NoteStore() });

      context.logger.info("notes: store registered");
    },
  }),
});
```

Three things to notice:

- `context` is the module's own view of the app. It gives you `application`, `logger`, `getConfig` — and nothing else.
- `{ useValue: ... }` registers an object you already made. Use `{ useFactory: (container) => ... }` when it should be built lazily, or `{ useClass: NoteStore }` to let the container construct it.
- `onInitialize` is the "set things up" hook. It runs before any module's `onReady`.

> WATCH OUT
>
>
>
> Registering the same token twice throws `ProviderAlreadyRegisteredError`. Register a token in exactly one module.

## STEP 3: THE API MODULE

The second module serves HTTP. It declares `dependencies: ["notes"]`, which does two things: it makes the runtime start `notes` first, and it is what permits this module to see the other one at all.

It reads the store in `onReady` — the hook that runs after every module has initialized, so the store is guaranteed to be in the container by then.

Create `src/api.module.ts`:

```ts
import { defineModule } from "@zudojs/core";
import type { Module } from "@zudojs/core";
import { createNodeHttpAdapter, createResponseContext } from "@zudojs/http";
import type { NodeHttpAdapter } from "@zudojs/http";
import { NOTE_STORE } from "./noteStore.js";

export const apiModule = defineModule({
  id: "api",
  name: "API",
  dependencies: ["notes"],
  factory: (): Module => {
    let adapter: NodeHttpAdapter | undefined;

    return {
      id: "api",
      name: "API",

      onReady: async (context) => {
        const store = context.application.getContainer().resolve(NOTE_STORE);

        adapter = createNodeHttpAdapter({
          host: "127.0.0.1",
          port: 3000,
          handler: (request) => {
            if (request.method === "GET" && request.path === "/notes") {
              return createResponseContext().setStatus(200).json(store.all());
            }

            if (request.method === "POST" && request.path === "/notes") {
              const text = request.getQuery("text");

              if (typeof text !== "string") {
                return createResponseContext()
                  .setStatus(400)
                  .json({ error: "text query parameter is required" });
              }

              return createResponseContext().setStatus(201).json(store.add(text));
            }

            return createResponseContext()
              .setStatus(404)
              .json({ error: "not found" });
          },
        });

        await adapter.start();
        context.logger.info("api: listening on http://127.0.0.1:3000");
      },

      onShutdown: async (context) => {
        await adapter?.stop();
        context.logger.info("api: stopped");
      },
    };
  },
});
```

The handler is one function. It receives a request and returns a response, and you decide what to do by reading `request.method` and `request.path`. `request.getQuery("text")` reads `?text=...` from the URL.

`createResponseContext()` builds an empty response, and `setStatus` and `json` each return it again, so they chain.

> IN PLAIN WORDS
>
>
>
> The `adapter` variable lives in the factory, outside the returned object. That is how `onShutdown` can stop the same server `onReady` started.

## STEP 4: START THE APP

The entry point hands both modules to `createApplication` and starts it. Ask the runtime to handle `SIGINT` and `SIGTERM` so `Ctrl+C` runs your `onShutdown` hooks instead of killing the process outright.

Create `src/main.ts`:

```ts
import { createApplication } from "@zudojs/core";
import { notesModule } from "./notes.module.js";
import { apiModule } from "./api.module.js";

const app = await createApplication({
  modules: [notesModule, apiModule],
  runtime: {
    name: "notes-app",
    mode: "development",
    signals: { handleSigint: true, handleSigterm: true },
  },
});

await app.start();

console.log(`application is ${app.state}`);
```

Note the order in `modules` does not decide the start order — `dependencies` does. You could list `apiModule` first and `notes` would still start first.

## RUN IT

Start the app with `tsx`, which runs TypeScript directly:

```bash
$ npx tsx src/main.ts
```

**What you should see.** The default logger prints one JSON line per message, mixed in with the runtime's own start-up lines, and then your `console.log`:

```json
{"level":"info","message":"notes: store registered","timestamp":"2026-09-09T10:00:00.000Z","context":{"moduleId":"notes","module":"Notes"}}
{"level":"info","message":"api: listening on http://127.0.0.1:3000","timestamp":"2026-09-09T10:00:00.020Z","context":{"moduleId":"api","module":"API"}}
application is running
```

In a second terminal, add a note and list them back:

```bash
$ curl -X POST "http://127.0.0.1:3000/notes?text=buy%20milk"
{"id":1,"text":"buy milk"}

$ curl http://127.0.0.1:3000/notes
[{"id":1,"text":"buy milk"}]

$ curl -i http://127.0.0.1:3000/nope
HTTP/1.1 404 Not Found
```

Back in the first terminal, press `Ctrl+C`. Because you turned on signal handling, the runtime stops the modules in reverse order and you see the shutdown line before the process exits:

```json
{"level":"info","message":"api: stopped","timestamp":"2026-09-09T10:01:00.000Z","context":{"moduleId":"api","module":"API"}}
```

> TIP
>
>
>
> The notes live in memory, so restarting the app empties them. Swap `NoteStore` for a database-backed class later and nothing else in the app has to change — that is the point of registering it under a token.

## IF THE HAND-BUILT APP BREAKS

- **`MissingModuleDependencyError`** → a module reached for another module it did not declare. Add the id to `dependencies`.
- **The container says the token is not registered** → you resolved it in `onInitialize` instead of `onReady`. Register in `onInitialize`, read in `onReady`.
- **`Cannot find module './noteStore'`** → the import is missing its `.js` extension.
- **The server keeps running after `Ctrl+C`** → you left `signals` out of the runtime options, so nothing called `adapter.stop()`.
- **`EADDRINUSE`** → an earlier run is still holding port 3000. Stop it, or use a different `port`.

## WHAT YOU LEARNED

| Name | What it does | Where it came from |
| --- | --- | --- |
| `zudo create` | Writes a wired project: server, router, example resource, config, security defaults, tests | `zudojs` / `zudojs-cli` |
| `zudo generate resource` | Writes and registers a CRUD endpoint with its test | `zudojs` / `zudojs-cli` |
| `createHttpTestClient` | Sends requests to your routes in a test, without a running server | `@zudojs/testing` |
| `defineModule` | Describes a module: `id`, `name`, `factory`, optional `dependencies` | `@zudojs/core` |
| `createApplication` | Builds the application from modules and runtime options; returns a promise | `@zudojs/core` |
| `createToken` | Makes a unique key for the container | `@zudojs/core` |
| `context.application.getContainer()` | The container, with `register` and `resolve` | `@zudojs/core` |
| `createNodeHttpAdapter` | Runs a Node HTTP server around your `handler` | `@zudojs/http` |
| `createResponseContext` | Builds a response; `setStatus`, `json` and `text` chain | `@zudojs/http` |

And the four hooks a module can implement, in the order they run: `onInitialize`, `onReady`, `onShutdown`, `onDestroy`.

## NEXT STEPS

- [Project Structure](https://zudojs.oyinlola.site/docs/getting-started-project-structure.md) — every file the CLI wrote, and how a request travels through them.
- [zudojs-cli](https://zudojs.oyinlola.site/docs/packages-cli.md) — every command, schematic and `add` feature.
- [Modules](https://zudojs.oyinlola.site/docs/concepts-modules.md) — dependency rules, options and metadata in depth.
- [Dependency Injection](https://zudojs.oyinlola.site/docs/concepts-dependency-injection.md) — scopes, factories and class providers.
- [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md) — a router and middleware, so you stop writing `if` statements in the handler.
- [@zudojs/logger](https://zudojs.oyinlola.site/docs/packages-logger.md) — replace the default console logger with your own transports.
