---
title: "Project Structure"
description: "What the zudo CLI writes for a ZudoJS project: folders, server.ts to repository request flow, .env config, integrations and the zudojs markers."
source: https://zudojs.oyinlola.site/docs/getting-started-project-structure
---

v1.0.0

# Project Structure

The layout the zudo CLI generates, folder by folder, and how a request travels through it.

DIRECTORY LAYOUT STRUCTURE

## WHERE THE LAYOUT COMES FROM

Zudo does not force a folder layout on you. Nothing in `@zudojs/core` reads a directory or looks for a file by name — you can put your code anywhere.

What does have an opinion is the CLI. When you run `zudo create`, it writes one of three layouts, and the rest of the CLI (`generate`, `dev`, `add`) expects that layout afterwards.

| Architecture | Shape | Pick it when |
| --- | --- | --- |
| `monolith` | One `src/` folder, grouped by kind of file | One deployable app, one team. The default. |
| `modular-monolith` | One app, plus `src/modules/<name>/` for each area of the business | One deployable app with clear internal seams. |
| `microservice` | A workspace of separate apps under `apps/` | Several services deployed independently. |

Choose with `--architecture`, or answer the prompt:

```bash
$ zudo create my-api --architecture monolith
```

> Everything on this page is what zudojs-cli 2.1 writes; the trees and outputs were produced by running it. If a file is listed here, it is created; if it is not, it is not.

## MONOLITH LAYOUT

This is what `zudo create my-api -p pnpm` produces. The files with a comment hold working code; every other folder under `src/` contains only an empty `index.ts`, a place ready for your own code.

```ts
my-api/
├── .zudojs/
│   └── manifest.json          # what kind of project this is; the CLI reads it
├── src/
│   ├── server.ts              # entry point: config, router, middleware, HTTP server
│   ├── app.ts                 # assembles the runtime: modules and integrations
│   ├── container.ts           # builds every controller, service and repository
│   ├── index.ts               # re-exports createApp
│   ├── configs/
│   │   └── index.ts           # typed settings read from .env
│   ├── routes/
│   │   ├── index.ts           # registerRoutes: every route of the app
│   │   ├── health.routes.ts   # GET /health
│   │   └── examples.routes.ts # /api/v1/examples CRUD, with OpenAPI metadata
│   ├── controllers/
│   │   └── examples.controller.ts
│   ├── services/
│   │   ├── app.service.ts
│   │   └── examples.service.ts
│   ├── repositories/
│   │   └── examples.repository.ts   # in-memory storage
│   ├── dtos/
│   │   └── examples.dto.ts    # request and response schemas
│   ├── integrations/
│   │   ├── index.ts           # the list zudo add appends to
│   │   └── integration.ts     # start/stop/health contract
│   ├── modules/
│   │   └── app.module.ts      # a runtime module
│   ├── utils/
│   │   └── http.ts            # json(), validation errors, security headers
│   ├── constants/  databases/  enums/  errors/  events/
│   ├── interfaces/  jobs/  loaders/  loggers/  middlewares/
│   └── models/  types/  validators/
├── tests/
│   └── examples.test.ts
├── .env.example
├── .gitignore
├── package.json
├── pnpm-workspace.yaml        # pnpm only: lets esbuild run its install script
├── tsconfig.json
└── README.md
```

There is no `zudojs.config.ts` and no `zudo.config.ts`. See [The Files at the Root](#root-files) for where the project’s settings live.

## HOW A REQUEST FLOWS

Follow one request, `GET /api/v1/examples`, through the files above. Each layer has one job and only talks to the layer below it:

```ts
request
  → src/server.ts           # security headers, CORS, rate limit, then dispatch
  → router                  # createRouter() from @zudojs/http, matches method + path
  → registerRoutes          # src/routes/index.ts, filled by routes/*.routes.ts
  → controller              # reads and validates the request, returns JSON
  → service                 # the rules: "unknown id is a 404"
  → repository              # stores and loads records
```

**`src/server.ts`** is the file `npm run dev` runs. It loads the configuration, builds the router, registers every route, and puts three middlewares in front of it. A *middleware* is a step every request passes through:

```ts
const pipeline = new HttpMiddlewarePipeline({
  middlewares: [
    securityHeaders(),
    createCorsMiddleware({ allowOrigin: config.corsOrigins }),
    createRateLimitMiddleware({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.max }),
    // zudojs:server-middleware:start
    // zudojs:server-middleware:end
    dispatch,
  ],
});
```

**`src/routes/index.ts`** is where every route is registered. `/health` is always first; generated resources go between the markers:

```ts
export function registerRoutes(router: HttpRouter, deps: AppDependencies): void {
  registerHealthRoutes(router, deps.health);
  // zudojs:routes:start
  registerExamplesRoutes(router, deps.examplesController);
  // zudojs:routes:end
}
```

**`src/container.ts`** is the *composition root*: the one place each controller is built with its service, and each service with its repository. To swap the in-memory repository for a database one, you change one line here and nothing else:

```ts
return {
  health,
  // zudojs:container:start
  examplesController: new ExamplesController(new ExamplesService(new InMemoryExamplesRepository())),
  // zudojs:container:end
};
```

**`src/app.ts`** assembles the *runtime*, the part that starts and stops modules in order: the integrations first, then `AppModule` and any module you generate. On Ctrl+C (SIGINT) or SIGTERM, `server.ts` lets integrations close long-lived connections, stops HTTP, then stops the runtime.

The routes the new project answers:

| Route | What it is |
| --- | --- |
| `GET /health` | 200 `{"status":"ok"}` while the runtime is running and every integration is up; 503 otherwise. Hidden from the OpenAPI document |
| `/api/v1/examples` | An example resource: `GET` and `POST` on the collection, `GET`, `PATCH` and `DELETE` on `/:id`. Delete it once you have your own |
| `GET /openapi.json` | The OpenAPI document, built from the routes’ `openapi` metadata (with the `openapi` capability, on by default) |
| `GET /docs` | A browsable documentation page for the same document |

## CONFIGURATION AND .ENV

Settings that differ between your laptop and production (ports, URLs, passwords) are read from *environment variables*, never written into the code. `.env.example` lists every variable the app reads. Copy it to `.env` (which git ignores) and edit the copy:

```ts
NODE_ENV=development
HOST=0.0.0.0
PORT=3000
# Comma-separated origins allowed to call the API from a browser (empty: none)
CORS_ORIGINS=
# Requests allowed per client per window
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=300
DATABASE_URL=postgresql://localhost:5432/my-api
```

`src/configs/index.ts` loads `.env` when it exists (real environment variables win), reads each value through `@zudojs/config`, and returns one frozen, typed object. A bad value stops the app at start-up with a clear error, for example `PORT must be an integer between 0 and 65535`.

| Setting | What it protects |
| --- | --- |
| Security headers | Every response gets the `@zudojs/security` defaults: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and more, unless the route sets its own |
| `CORS_ORIGINS` | Which web pages on other origins may call the API from a browser. Empty means none: CORS is closed until you list an origin, such as `http://localhost:5173` |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` | How many requests one client may make per window before getting 429. Default 300 per 60 000 ms (one minute) |

`zudo add <feature>` adds its own variables to `.env.example` and its settings to `src/configs/index.ts`, for example `REDIS_URL` and `redis: { url }`.

## INTEGRATIONS

An *integration* is a connection to something outside your code, such as Redis, a database, a WebSocket server or an email service, that has to be opened when the app starts and closed when it stops. `src/integrations/` is where they live. A new project has none yet, only the contract each one follows:

```ts
export interface Integration {
  readonly name: string;
  start(context: IntegrationContext): Promise<void>;
  stop(): Promise<void>;
  /** Called when shutdown begins, before HTTP stops: close long-lived connections. */
  drain?(): Promise<void>;
  /** Whether the integration is healthy; reported by /health. */
  health?(): Promise<boolean>;
}
```

`zudo add redis` writes `src/integrations/redis.ts` and appends it to the list in `src/integrations/index.ts`. Integrations start in list order before every other module and stop in reverse after them, and each one’s health shows up in `/health` under `checks`.

## THE ZUDOJS MARKERS

You have seen comments like these in the snippets above:

```ts
// zudojs:routes:start
registerExamplesRoutes(router, deps.examplesController);
// zudojs:routes:end
```

Each pair fences a list that the CLI appends to. `generate` and `add` only ever insert lines between a `:start` and its `:end`, and skip a line that is already there. Everything outside the markers is yours to edit freely, and so are the lines between them.

| Markers | File | Filled by |
| --- | --- | --- |
| `route-imports`, `routes` | `src/routes/index.ts` (and each module’s `routes/index.ts`) | `generate resource`, `route`, `module` |
| `container-imports`, `container` | `src/container.ts` | `generate resource`, `route` |
| `integration-imports`, `integrations` | `src/integrations/index.ts` | `add` |
| `config` | `src/configs/index.ts` | `add` |
| `server-imports`, `server-mounts`, `server-middleware` | `src/server.ts` | `add openapi` and other features |

> DO NOT DELETE THE MARKERS
>
>
>
> If a marker pair is missing, the CLI leaves that file untouched and prints the lines you have to add by hand. Your project still works; you just lose the automatic wiring for that file.

## WHAT EACH FOLDER HOLDS

The folders are a convention, not a rule — but the CLI's `generate` command writes into them by these names, so it pays to keep them.

| Folder | What goes in it |
| --- | --- |
| `configs/` | Typed settings read from the environment. |
| `constants/` | Fixed values shared across the app. |
| `controllers/` | Code that turns an incoming request into a service call and the result into a response. |
| `databases/` | Database helpers of your own. `zudo add database` puts the Prisma schema in `prisma/` and the client in `integrations/database.ts`. |
| `dtos/` | Schemas for data crossing the app's edge, in and out, written with `@zudojs/schema`. |
| `enums/` | Fixed sets of named values. |
| `errors/` | Error helpers. Throw the classes from `@zudojs/errors`, such as `NotFoundError`, to get the matching status code. |
| `events/` | Things that happened, and the code that reacts to them. |
| `integrations/` | Connections with a lifecycle: Redis, the database, WebSockets, email. |
| `interfaces/` | Contracts implemented elsewhere in the app. |
| `jobs/` | Work that runs in the background or on a schedule. |
| `loaders/` | Start-up wiring: what to register before the app serves traffic. |
| `loggers/` | Logger setup and transports. |
| `middlewares/` | Steps that run around every request. |
| `models/` | Your domain objects. |
| `modules/` | Runtime modules: named pieces the runtime starts and stops. |
| `repositories/` | The only place that talks to storage. |
| `routes/` | Which URL reaches which controller, and `registerRoutes`. |
| `services/` | Business rules that are not tied to HTTP. |
| `types/` | Shared TypeScript types. |
| `utils/` | Small helpers; `utils/http.ts` holds the JSON and error-response helpers. |
| `validators/` | Checks on incoming data. |

> TIP
>
>
>
> The direction of travel is `routes → controllers → services → repositories`. Each layer talks to the next one down and never back up, which is why a repository can be swapped in `container.ts` without touching the others.

## THE FILES AT THE ROOT

| File | What it is | Edit it? |
| --- | --- | --- |
| `package.json` | Dependencies plus the `dev`, `build`, `start`, `test`, `typecheck` and `lint` scripts. Also carries a `zudojs` block recording the project type, architecture and enabled features. | Yes |
| `tsconfig.json` | TypeScript settings: ES2024, `Node16` modules, `strict` on, output to `dist/`. Backends use TypeScript 7. | Yes |
| `.env.example` | Every environment variable the app reads, with safe development values. Copy it to `.env`, which is gitignored. | Yes |
| `.gitignore` | Ignores `node_modules/`, `dist/`, `.env` and log files. | Yes |
| `README.md` | A short readme: how to run the project, the routes it serves, the `generate`/`add` commands and the folder list. | Yes |
| `pnpm-workspace.yaml` | pnpm projects only. Lists the packages allowed to run install scripts (esbuild and a few others), which pnpm 10+ blocks otherwise. | Rarely |
| `tests/` | Vitest tests. `examples.test.ts` comes with the project; `generate resource` adds one per resource. | Yes |
| `.zudojs/manifest.json` | Machine-managed. Records the architecture, package manager, database and capabilities so `dev`, `generate` and `add` know what kind of project this is. | No |

The scripts and the `zudojs` block a monolith gets:

```ts
"zudojs": {
  "projectType": "backend",
  "architecture": "monolith",
  "features": ["cqrs", "messaging", "observability", "openapi", "database"]
},
"scripts": {
  "dev": "tsx watch src/server.ts",
  "start": "node dist/server.js",
  "build": "tsc",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "lint": "tsc --noEmit"
}
```

> THERE IS NO ZUDOJS.CONFIG.TS
>
>
>
> The CLI does not generate a `zudojs.config.ts` (or `zudo.config.ts`), and you do not need to write one. The project's type, architecture, package manager and capabilities live in the `zudojs` block of `package.json` and in `.zudojs/manifest.json` (machine-managed); every follow-up command (`dev`, `add`, `generate`, `doctor`) reads them from there. App settings live in `.env` and `src/configs/index.ts`. A `zudojs.config.ts` left over from a much older release is still recognised as marking a project.

## MODULAR MONOLITH LAYOUT

The same single app, with the same files and folders as a monolith — plus one folder per module under `src/modules/`. Each module owns its own `commands/`, `queries/` and `routes/`.

Without `--services` you get no modules, just an empty `src/modules/index.ts`. Name the modules you want:

```bash
$ zudo create shop --architecture modular-monolith --services catalog,orders
```

```ts
shop/
├── .zudojs/manifest.json
├── src/
│   ├── server.ts  app.ts  container.ts  index.ts
│   ├── configs/  routes/  controllers/  services/  repositories/  dtos/
│   ├── integrations/  utils/  …           # the same as a monolith
│   └── modules/
│       ├── index.ts              # re-exports every module
│       ├── catalog/
│       │   ├── index.ts
│       │   ├── catalog.module.ts
│       │   ├── commands/index.ts
│       │   ├── queries/index.ts
│       │   └── routes/index.ts   # registerCatalogRoutes, called from src/routes/index.ts
│       └── orders/
│           └── …                 # identical shape
├── tests/examples.test.ts
├── .env.example
├── .gitignore
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
└── README.md
```

**Commands and queries** are the two halves of a common split: a *command* changes something, a *query* only reads. Keeping them in separate folders makes it obvious at a glance which code can alter data.

Add another module later without touching the rest. It is registered in `app.ts` and its routes in `src/routes/index.ts`:

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

To give a module its own endpoint, add `--module` to `generate resource`. The layers go inside the module and the routes are registered in its `routes/index.ts`:

```bash
$ zudo generate resource products --module catalog --dry-run
Detected architecture: modular-monolith
Dry run: 8 files would be written or updated (nothing written):
  - src/modules/catalog/dtos/products.dto.ts
  - src/modules/catalog/repositories/products.repository.ts
  - src/modules/catalog/services/products.service.ts
  - src/modules/catalog/controllers/products.controller.ts
  - src/modules/catalog/routes/products.routes.ts
  - tests/products.test.ts
  - src/modules/catalog/routes/index.ts
  - src/container.ts
```

## MICROSERVICE LAYOUT

Here the project is a workspace: one repository holding several apps that install and deploy separately. A `gateway` app sits in front on port 3000, and each service gets its own port from 3001 up. Every app is wired exactly like a monolith: its own `server.ts`, router, `container.ts`, configuration, example resource and tests.

```bash
$ zudo create platform --architecture microservice --services identity,billing
```

```ts
platform/
├── .zudojs/manifest.json
├── apps/
│   ├── gateway/                 # PORT=3000
│   │   ├── src/
│   │   │   ├── server.ts  app.ts  container.ts  index.ts
│   │   │   └── configs/  routes/  controllers/ … validators/
│   │   ├── tests/
│   │   ├── .env.example
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   └── services/
│       ├── identity/            # PORT=3001
│       │   ├── src/             # as the gateway, plus commands/ and queries/
│       │   ├── tests/
│       │   ├── .env.example
│       │   ├── package.json
│       │   ├── tsconfig.json
│       │   └── Dockerfile
│       └── billing/             # PORT=3002, identical shape
├── docker-compose.yml
├── pnpm-workspace.yaml          # only when the package manager is pnpm
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

Without `--services` you get the gateway and nothing under `apps/services/`. Each app has its own `package.json` and its own dependencies. The root `package.json` only fans commands out across them — its `dev` script runs every app's `dev` script.

With pnpm the workspace members are listed in `pnpm-workspace.yaml`; with npm, yarn or bun they are a `workspaces` array in the root `package.json`. Either way the globs are the same:

```ts
packages:
  - "apps/gateway"
  - "apps/services/*"
```

A microservice project is created with a `Dockerfile` per app and a `docker-compose.yml` that runs the whole set with `docker compose up`. Other architectures get Docker files from `zudo add docker`.

To work on one app, pass `--service`: `zudo generate resource invoices --service billing` writes into `apps/services/billing/`, and `zudo add redis --service billing` adds Redis to that app only. Without it, `generate` writes into `apps/gateway/` and `add` applies to every app.

## WHERE GENERATE PUTS FILES

`zudo generate <kind> <name>` reads the architecture from your project first, then picks the folders and registers what it wrote. Add `--dry-run` to see the paths without writing anything. A controller needs a service, repository and DTO to compile, so the missing ones come with it:

```bash
$ zudo generate controller invoice --dry-run
Detected architecture: monolith
Dry run: 4 files would be written or updated (nothing written):
  - src/dtos/invoice.dto.ts
  - src/repositories/invoice.repository.ts
  - src/services/invoice.service.ts
  - src/controllers/invoice.controller.ts
```

The fourteen kinds, and where each lands in a monolith:

| Kind | Path | Notes |
| --- | --- | --- |
| `resource` | `src/dtos/`, `repositories/`, `services/`, `controllers/`, `routes/`, and `tests/` | A full CRUD endpoint at `/api/v1/<name>`, registered in `routes/index.ts` and `container.ts`. |
| `module` | `src/modules/<name>/` | Registered in `app.ts`; its routes in `routes/index.ts`. |
| `service` | `src/services/<name>/<name>.service.ts` | With empty `commands/` and `queries/`. Becomes a module in a modular monolith; refused in a microservice project. |
| `route` | `src/routes/` | Registered; brings any missing controller, service, repository and DTO. |
| `controller` | `src/controllers/` | Brings any missing service, repository and DTO. |
| `repository` | `src/repositories/` | Brings the DTO if missing. |
| `dto` | `src/dtos/` |  |
| `model` | `src/models/` |  |
| `validator` | `src/validators/` |  |
| `event` | `src/events/` |  |
| `job` | `src/jobs/` |  |
| `middleware` | `src/middlewares/` |  |
| `command` | `src/commands/<name>/` | With `--service users`: `src/users/commands/<name>/`. Adds `@zudojs/cqrs` to `package.json` if missing. |
| `query` | `src/queries/<name>/` | With `--service users`: `src/users/queries/<name>/`. |

Two flags change the destination:

- `--module <name>` puts the files inside `src/modules/<name>/` instead of the shared folders. It is ignored for `generate module` itself.
- `--service <name>` picks the app in a microservice project (`apps/services/<name>/`; without it, `apps/gateway/`), and names the owner of a command or query elsewhere.

## NAMING CONVENTIONS

Every generated file says what it is in its own name: `<name>.<kind>.ts`, lower-case and hyphenated. The exported class is the PascalCase version with the kind appended. camelCase input keeps its word boundaries.

| You type | File | Export |
| --- | --- | --- |
| `generate resource users` | `src/controllers/users.controller.ts` (and the other layers) | `UsersController`, route prefix `/api/v1/users` |
| `generate command createBook` | `src/commands/create-book/create-book.command.ts` | `CreateBookCommand`, `CreateBookCommandHandler` |
| `generate service payment` | `src/services/payment/payment.service.ts` | `PaymentService` |
| `generate controller user-profile` | `src/controllers/user-profile.controller.ts` | `UserProfileController` |
| `generate module billing` | `src/modules/billing/billing.module.ts` | `BillingModule` |
| `generate repository order` | `src/repositories/order.repository.ts` | `OrderRepository` (interface), `InMemoryOrderRepository` |

A name is a name, not a path: `/`, `\` and `..` are refused, and so is a name starting with a digit (it would not be a valid class name).

Two more conventions worth keeping:

- Every folder has an `index.ts` barrel you can use to re-export its contents. Generated resources do not rely on them: `container.ts` and `routes/index.ts` import each file directly.
- Relative imports end in `.js`, never `.ts`. The generated `tsconfig.json` uses `"module": "Node16"`, which requires the extension of the file that will exist after compiling.

> TIP
>
>
>
> Run `zudo doctor` in a project to check the Node version, package manager, `tsconfig.json` and dependencies in one go.

## NEXT STEPS

- [Architecture](https://zudojs.oyinlola.site/docs/architecture.md) — why the framework is split this way.
- [Module System](https://zudojs.oyinlola.site/docs/architecture-module-system.md) — how modules are registered, ordered and loaded.
- [zudojs-cli](https://zudojs.oyinlola.site/docs/packages-cli.md) — the full command and flag reference.
- [Package Rules](https://zudojs.oyinlola.site/docs/rules.md) — the conventions the framework's own 39 packages follow.
