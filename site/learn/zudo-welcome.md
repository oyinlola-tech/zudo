---
title: "Welcome to ZudoJS — ZudoJS Academy"
description: "Meet ZudoJS: its 38 packages and how they are layered, the zudojs CLI and three application shapes. Then run three of its packages together in your browser."
source: https://zudojs.oyinlola.site/learn/zudo-welcome
---

LEVEL 12 · LESSON 1 OF 19

Entering ZudoJS Core

# Welcome to ZudoJS

Meet ZudoJS: its 38 packages and how they are layered, the zudojs CLI and three application shapes. Then run three of its packages together in your browser.

- **25 min** to read and try
- **You need:** "What a framework does" and "Backend architecture" from the Software design and architecture course
- **You build:** A book service that uses three ZudoJS packages together

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Explain what ZudoJS is and why it is split into small packages
- Use the shelf rule to say which packages may depend on which
- Name the package that owns a given job, such as background jobs, permissions or settings
- Follow one request through the packages that handle it
- Choose between a monolith, a modular monolith and microservices for a given team and app

## What ZudoJS is

**ZudoJS** is a backend framework for TypeScript on Node.js. It takes over the jobs you listed in [What a framework does](https://zudojs.oyinlola.site/learn/frameworks): lifecycle, dependency injection, routing, configuration, validation, errors, data access, security, testing and project structure.

It is not one big package. It is **38 small npm packages**, each named `@zudojs/something`, plus a command-line tool published as `zudojs`. Each package owns one job. You install only the ones you use, and you can use most of them on their own, even in a project that is not a ZudoJS app.

That design follows the ideas from [Backend architecture](https://zudojs.oyinlola.site/learn/backend-architecture): separation of concerns, interfaces between parts, dependency injection, and dependencies that point in one direction only.

## Packages on shelves

Think of the packages as sitting on shelves. A package may use packages on lower shelves, never higher ones. So there are no cycles, and each package can be built, tested and understood on its own.

```ts
  top      testing                   fakes and helpers for all the others
           http, cli                 talk to the outside world
           runtime, auth, cqrs, …    put the parts together into an application
           core, events, schema, …   framework machinery
           config, logger, …         single-purpose building blocks
  bottom   errors, types             depend on no other ZudoJS package
```

- **At the bottom** is `@zudojs/errors`. Almost every other package uses it, so an error from any package is a `BaseError` with a status code and a stable `code`. `@zudojs/types` sits beside it with shared type guards.
- **In the middle** are building blocks such as `@zudojs/config`, `@zudojs/logger`, `@zudojs/container` and `@zudojs/schema`. For example, `@zudojs/schema` uses only `errors`, `constants` and `types`.
- **Higher up** are the packages that combine others: `@zudojs/runtime` starts and stops an application, and `@zudojs/http` serves it on the network.

The [Architecture](https://zudojs.oyinlola.site/docs/architecture.md) and [Dependency direction](https://zudojs.oyinlola.site/docs/architecture-dependency-direction.md) pages list every package's exact dependencies.

## The packages, grouped by job

You do not need to remember this table. Come back to it when a lesson mentions a package. Each name links to its documentation.

| Job | Packages |
| --- | --- |
| **Foundations**: errors, shared types and constants, checking data | [errors](https://zudojs.oyinlola.site/docs/packages-errors.md), [types](https://zudojs.oyinlola.site/docs/packages-types.md), [constants](https://zudojs.oyinlola.site/docs/packages-constants.md), [schema](https://zudojs.oyinlola.site/docs/packages-schema.md), [validation](https://zudojs.oyinlola.site/docs/packages-validation.md), [serialization](https://zudojs.oyinlola.site/docs/packages-serialization.md) |
| **Application core**: modules, start and stop, dependency injection, settings, logs | [core](https://zudojs.oyinlola.site/docs/packages-core.md), [runtime](https://zudojs.oyinlola.site/docs/packages-runtime.md), [lifecycle](https://zudojs.oyinlola.site/docs/packages-lifecycle.md), [container](https://zudojs.oyinlola.site/docs/packages-container.md), [config](https://zudojs.oyinlola.site/docs/packages-config.md), [logger](https://zudojs.oyinlola.site/docs/packages-logger.md), [plugins](https://zudojs.oyinlola.site/docs/packages-plugins.md) |
| **HTTP and APIs**: serving requests, and describing and calling APIs | [http](https://zudojs.oyinlola.site/docs/packages-http.md), [middleware](https://zudojs.oyinlola.site/docs/packages-middleware.md), [api](https://zudojs.oyinlola.site/docs/packages-api.md), [rpc](https://zudojs.oyinlola.site/docs/packages-rpc.md), [openapi](https://zudojs.oyinlola.site/docs/packages-openapi.md), [adapters](https://zudojs.oyinlola.site/docs/packages-adapters.md) |
| **Data**: databases, storage, transactions, caching | [database](https://zudojs.oyinlola.site/docs/packages-database.md), [storage](https://zudojs.oyinlola.site/docs/packages-storage.md), [transactions](https://zudojs.oyinlola.site/docs/packages-transactions.md), [cache](https://zudojs.oyinlola.site/docs/packages-cache.md) |
| **Users and security**: log-in, permissions, protection, cryptography | [auth](https://zudojs.oyinlola.site/docs/packages-auth.md), [auth-oauth](https://zudojs.oyinlola.site/docs/packages-auth-oauth.md), [permissions](https://zudojs.oyinlola.site/docs/packages-permissions.md), [security](https://zudojs.oyinlola.site/docs/packages-security.md), [crypto](https://zudojs.oyinlola.site/docs/packages-crypto.md), [tenancy](https://zudojs.oyinlola.site/docs/packages-tenancy.md) |
| **Events and background work** | [events](https://zudojs.oyinlola.site/docs/packages-events.md), [messaging](https://zudojs.oyinlola.site/docs/packages-messaging.md), [cqrs](https://zudojs.oyinlola.site/docs/packages-cqrs.md), [queue](https://zudojs.oyinlola.site/docs/packages-queue.md), [scheduler](https://zudojs.oyinlola.site/docs/packages-scheduler.md) |
| **Running in production**: seeing inside, switching features, testing | [observability](https://zudojs.oyinlola.site/docs/packages-observability.md), [feature-flags](https://zudojs.oyinlola.site/docs/packages-feature-flags.md), [testing](https://zudojs.oyinlola.site/docs/packages-testing.md) |
| **Tools**: creating projects and documentation | [zudojs](https://zudojs.oyinlola.site/docs/packages-cli.md) (the CLI), [docs](https://zudojs.oyinlola.site/docs/packages-docs.md) |

A normal application starts with about a dozen of them. The rest arrive when you need them: `queue` when you have background jobs, `tenancy` when you serve several customers from one app, and so on. The [package list](https://zudojs.oyinlola.site/docs/packages.md) has a search box.

## How the packages fit together

Here is the path one request takes through a ZudoJS application, with the package that handles each step. Compare it with the BookStore, where you wrote every step yourself:

| Step | Package | BookStore equivalent |
| --- | --- | --- |
| Start every part in order, stop in reverse on `SIGTERM` | `runtime`, `core` | (missing) |
| Read and check the settings | `config` | `config.ts` |
| Accept the request, run middleware | `http`, `security` | `app.ts`, `router.ts`, `json.ts` |
| Find out who is asking, and whether they may | `auth`, `permissions` | `requireUserId` |
| Check the body | `schema` | `validation/` |
| Hand the controller its service | `container` | `createRouter` |
| Load and save data | `database`, `transactions` | `repositories/`, `db.ts` |
| Turn a failure into a status code | `errors` | `errors.ts`, `toErrorResponse` |
| Write what happened | `logger`, `observability` | `console.log` |

The packages that do not need Node.js also run in this page's browser terminal. Here are three of them working together: `@zudojs/schema` checks the input, `@zudojs/errors` reports failures, and `@zudojs/container` hands out the one shared service:

books.ts

```ts
import { ContainerScope, createContainer, createToken } from "@zudojs/container";
import { BaseError, NotFoundError } from "@zudojs/errors";
import { schema } from "@zudojs/schema";
import type { Infer } from "@zudojs/schema";

const NewBookSchema = schema.object({
  title: schema.string().trim().min(1).max(200),
  priceCents: schema.number().int().min(0),
});
type Book = Infer<typeof NewBookSchema> & { readonly id: number };

class BookService {
  private readonly books: Book[] = [];

  add(input: unknown): Book {
    const book = { id: this.books.length + 1, ...NewBookSchema.parse(input) };
    this.books.push(book);
    return book;
  }

  get(id: number): Book {
    const book = this.books.find((b) => b.id === id);
    if (book === undefined) throw new NotFoundError(`Book ${id} not found`);
    return book;
  }
}

const BOOKS = createToken<BookService>("books");
const container = createContainer();
container.register(BOOKS, { useFactory: () => new BookService() }, { scope: ContainerScope.SINGLETON });

const books = container.resolve(BOOKS);
console.log(books.add({ title: "  Kindred ", priceCents: 1099 }));
console.log("same service everywhere:", container.resolve(BOOKS) === books);

for (const attempt of [() => books.add({ title: "", priceCents: -1 }), () => books.get(9)]) {
  try {
    attempt();
  } catch (error) {
    if (error instanceof BaseError) console.log(error.name, error.statusCode, error.code, error.message);
  }
}
```

Output of `npx tsx books.ts` and of the browser terminal

```json
{ id: 1, title: 'Kindred', priceCents: 1099 }
same service everywhere: true
SchemaError 400 ERR_SCHEMA_VALIDATION Validation failed
NotFoundError 404 ERR_RESOURCE_NOT_FOUND Book 9 not found
```

Press **Run in browser** and change things. What to notice:

- **One description, two uses.** `NewBookSchema` checks the data at runtime, and `Infer` turns it into the `Book` type. In the BookStore you wrote the interface and the parser separately.
- **The container** creates `BookService` the first time someone asks for the `BOOKS` token, and gives everyone that same instance (`SINGLETON`). No `createRouter` threading objects through by hand.
- **One error family.** The `SchemaError` thrown by `@zudojs/schema` and the `NotFoundError` you threw both extend `BaseError` from `@zudojs/errors`, so one `instanceof` check reads the status code of either.

The next lesson installs `@zudojs/schema` and `@zudojs/errors` on your computer and explains them in detail. The container gets its own lesson later in this course, [Dependency injection with @zudojs/container](https://zudojs.oyinlola.site/learn/zudo-container).

## The command-line tool

Choosing a dozen packages and wiring them into a project by hand would bring back the problem you just left behind. So ZudoJS has a **CLI** (command-line interface), published on npm as `zudojs`. It gives you a command called `zudojs`, and a short name for it, `zudo`. Run on its own, it shows a menu of these commands:

| Command | What it does |
| --- | --- |
| `zudojs create` | Creates a new project: folders, packages, scripts, a server with security defaults, an example endpoint and tests. |
| `zudojs dev` | Starts the development server, restarting when you save. |
| `zudojs build` | Compiles the project to JavaScript for production. |
| `zudojs generate` | Adds a complete endpoint (`generate resource`), or a single service, controller, module and more, in the right folder, and wires it in. |
| `zudojs add` | Adds a feature such as `database`, `redis` or `docker` to an existing project: the code, the settings and the package. |
| `zudojs doctor` | Checks your Node.js, packages and project for problems. |
| `zudojs info` | Shows the CLI version and the project's ZudoJS packages. |

You will install it and try every one of these in [Create the Task API project](https://zudojs.oyinlola.site/learn/zudo-create-project), and study each command's options and rules in [The ZudoJS CLI in depth](https://zudojs.oyinlola.site/learn/zudo-cli).

## Three shapes of application

`zudojs create` asks which **architecture** you want. There are three, and they differ in how many deployable programs you end up with:

| Architecture | What it is | Choose it when |
| --- | --- | --- |
| **Monolith** | One application, one codebase, one process. Like the BookStore. | You are starting out, or the team is small. This is the default and what this course uses. |
| **Modular monolith** | Still one deployable application, but split into strict **modules** (say, catalog, orders, users) that talk through clear interfaces instead of reaching into each other's code. | The app has grown and you want clear boundaries, without the cost of running many services. |
| **Microservices** | Several separate applications, each with its own data, talking over the network, usually behind a **gateway**. | Different parts must scale or be deployed independently, by different teams. It adds a lot of operational work. |

A common and healthy path is monolith → modular monolith → microservices only where needed. The same ZudoJS packages work in all three, and the ZudoJS architecture course walks that path, from [A well-structured monolith](https://zudojs.oyinlola.site/learn/zudo-monolith) to [From monolith to modular monolith](https://zudojs.oyinlola.site/learn/zudo-modular-monolith) and beyond.

REASON IT OUT

### Which shape for this team?

Before reading the answer, pick a shape for each case, and say what would go wrong with the other two:

- Two developers start a booking app for a chain of three hotels.
- Four years later, twenty developers in four teams work on bookings, payments, housekeeping and reporting in one codebase. Every release needs all four teams to agree.
- The reporting part runs heavy queries every night that slow bookings down, and it must scale on its own.

**Show the reasoning**

- **Two developers**: a monolith. One process is the easiest to run, debug and deploy. Microservices would give two people the network failures, separate deployments and data copying of a large company, with none of the benefits.
- **Four teams in one codebase**: a modular monolith. The pain is unclear boundaries, not scaling. Strict modules with clear interfaces let each team own its part while the app stays one deployment. Jumping straight to microservices would turn every function call between teams into a network call.
- **Reporting that must scale alone**: now one piece has a real reason to be separate. Split *that* module out as a service, and keep the rest together. Microservices where they pay off, not everywhere.

## Practice

TRY IT YOURSELF

### Which package?

For each need, name the ZudoJS package: (a) send a welcome e-mail in the background after sign-up; (b) let only admins delete books; (c) read `DATABASE_URL` and fail if it is missing; (d) count requests per second on a dashboard.

**Show a solution**

(a) `@zudojs/queue`, for background jobs. (b) `@zudojs/permissions`, for who may do what. (c) `@zudojs/config`. (d) `@zudojs/observability`, for metrics.

TRY IT YOURSELF

### Look up a missing book

Change the example so that `BookService` also has `findByTitle(title)`, which throws `NotFoundError` when no book has that exact title. Try it with a title that exists and one that does not.

**Show a solution**

find-by-title.ts

```ts
import { NotFoundError } from "@zudojs/errors";

interface Book {
  readonly id: number;
  readonly title: string;
}

const books: Book[] = [{ id: 1, title: "Kindred" }];

function findByTitle(title: string): Book {
  const book = books.find((b) => b.title === title);
  if (book === undefined) throw new NotFoundError(`No book called "${title}"`);
  return book;
}

console.log(findByTitle("Kindred"));
try {
  findByTitle("Dune");
} catch (error) {
  if (error instanceof NotFoundError) console.log(error.statusCode, error.message);
}
```

Output of `npx tsx find-by-title.ts` and of the browser terminal

```json
{ id: 1, title: 'Kindred' }
404 No book called "Dune"
```

## Recap

- ZudoJS is 38 small `@zudojs/*` packages plus the `zudojs` CLI. Each owns one job, and you install only what you use.
- Packages sit on shelves and only use packages below them. `@zudojs/errors` is at the bottom, so every error shares one base class.
- A request passes through `http`, `security`, `auth`, `schema`, `container`, `database` and `errors`, and `runtime` starts and stops it all.
- The `zudojs` CLI (short name `zudo`) creates, runs, builds, extends and checks projects.
- Applications can be a monolith, a modular monolith or microservices. Start with a monolith.

Next, [Your first Zudo code](https://zudojs.oyinlola.site/learn/zudo-first-code) installs your first two ZudoJS packages and uses them in a Task API service.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
