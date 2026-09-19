---
title: "Your First App"
description: "Build a complete Zudo application from scratch in 5 minutes. Step-by-step tutorial with code examples for project setup, configuration, and running your first app."
source: https://zudojs.oyinlola.site/docs/getting-started-first-app
---

v1.0.0

# Your First App

Build a small notes service from scratch: two modules, a shared store, and an HTTP endpoint.

SCAFFOLD CLI FIRST APP

## WHAT YOU ARE BUILDING

A tiny notes service with two endpoints: one that adds a note, one that lists them. It is small on purpose — the point is to see how the pieces of a Zudo application fit together.

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

> If you have not installed anything yet, do the [Getting Started](https://zudojs.oyinlola.site/docs/getting-started.md) page first. This guide assumes Node.js 24 or newer.

## SET UP THE PROJECT

Create the folder and install the two packages this app uses.

```bash
$ mkdir notes-app && cd notes-app
$ npm init -y
$ npm pkg set type=module
$ npm install @zudojs/core @zudojs/http
$ npm install -D typescript @types/node tsx
```

Then create `tsconfig.json`. These are the same settings the CLI writes into a scaffolded project:

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

## IF SOMETHING BREAKS

- **`MissingModuleDependencyError`** → a module reached for another module it did not declare. Add the id to `dependencies`.
- **The container says the token is not registered** → you resolved it in `onInitialize` instead of `onReady`. Register in `onInitialize`, read in `onReady`.
- **`Cannot find module './noteStore'`** → the import is missing its `.js` extension.
- **The server keeps running after `Ctrl+C`** → you left `signals` out of the runtime options, so nothing called `adapter.stop()`.
- **`EADDRINUSE`** → an earlier run is still holding port 3000. Stop it, or use a different `port`.

## WHAT YOU LEARNED

| Name | What it does | Where it came from |
| --- | --- | --- |
| `defineModule` | Describes a module: `id`, `name`, `factory`, optional `dependencies` | `@zudojs/core` |
| `createApplication` | Builds the application from modules and runtime options; returns a promise | `@zudojs/core` |
| `createToken` | Makes a unique key for the container | `@zudojs/core` |
| `context.application.getContainer()` | The container, with `register` and `resolve` | `@zudojs/core` |
| `createNodeHttpAdapter` | Runs a Node HTTP server around your `handler` | `@zudojs/http` |
| `createResponseContext` | Builds a response; `setStatus`, `json` and `text` chain | `@zudojs/http` |

And the four hooks a module can implement, in the order they run: `onInitialize`, `onReady`, `onShutdown`, `onDestroy`.

## NEXT STEPS

- [Project Structure](https://zudojs.oyinlola.site/docs/getting-started-project-structure.md) — where these files go once the CLI generates the project for you.
- [Modules](https://zudojs.oyinlola.site/docs/concepts-modules.md) — dependency rules, options and metadata in depth.
- [Dependency Injection](https://zudojs.oyinlola.site/docs/concepts-dependency-injection.md) — scopes, factories and class providers.
- [@zudojs/http](https://zudojs.oyinlola.site/docs/packages-http.md) — a router and middleware, so you stop writing `if` statements in the handler.
- [@zudojs/logger](https://zudojs.oyinlola.site/docs/packages-logger.md) — replace the default console logger with your own transports.
