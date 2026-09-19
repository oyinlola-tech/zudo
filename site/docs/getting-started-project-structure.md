---
title: "Project Structure"
description: "Understand the standard Zudo project layout and conventions. Directory structure, configuration files, package organization, and monorepo patterns."
source: https://zudojs.oyinlola.site/docs/getting-started-project-structure
---

v1.0.0

# Project Structure

The layout the zudojs CLI actually generates, folder by folder.

DIRECTORY LAYOUT STRUCTURE

## WHERE THE LAYOUT COMES FROM

Zudo does not force a folder layout on you. Nothing in `@zudojs/core` reads a directory or looks for a file by name — you can put your code anywhere.

What does have an opinion is the CLI. When you run `zudojs create`, it writes one of three layouts, and the rest of the CLI (`generate`, `dev`, `add`) expects that layout afterwards.

| Architecture | Shape | Pick it when |
| --- | --- | --- |
| `monolith` | One `src/` folder, grouped by kind of file | One deployable app, one team. The default. |
| `modular-monolith` | One app, but code split into `src/modules/<name>/` | One deployable app with clear internal seams. |
| `microservice` | A workspace of separate apps under `apps/` | Several services deployed independently. |

Choose with `--architecture`, or answer the prompt:

```bash
$ npx zudojs-cli create my-app --architecture monolith
```

> Everything on this page is the layout the CLI at version 0.1.2 actually writes. If a folder is listed here, it is created; if it is not, it is not.

## MONOLITH LAYOUT

This is what `zudojs create my-app --architecture monolith` produces. Every folder under `src/` gets an `index.ts`, empty at first, ready to re-export what you put there.

```ts
my-app/
├── .zudojs/
│   └── manifest.json        # written by create; the CLI reads it later
├── src/
│   ├── index.ts             # re-exports createApp
│   ├── app.ts               # builds the application
│   ├── server.ts            # entry point — what `npm run dev` runs
│   ├── configs/
│   ├── constants/
│   ├── controllers/
│   │   ├── index.ts
│   │   └── health.controller.ts
│   ├── databases/
│   ├── dtos/
│   ├── enums/
│   ├── errors/
│   ├── events/
│   ├── interfaces/
│   ├── jobs/
│   ├── loaders/
│   ├── loggers/
│   ├── middlewares/
│   ├── models/
│   ├── repositories/
│   ├── routes/
│   ├── services/
│   │   ├── index.ts
│   │   └── app.service.ts
│   ├── types/
│   ├── utils/
│   └── validators/
├── tests/
│   └── index.ts
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

Three files carry the app; the rest are empty folders waiting for your code.

- `src/server.ts` — the entry point. This is the file `npm run dev` watches.
- `src/app.ts` — assembles the application and returns it. Keep wiring here.
- `src/index.ts` — a barrel that re-exports `createApp`, so other code can import the app without knowing the file names.

> WATCH OUT
>
>
>
> At CLI 0.1.2 the generated `src/app.ts` and `src/server.ts` import a `logger` value from `@zudojs/logger` and call `createRuntime` with one argument. Neither matches the packages: `@zudojs/logger` exports `createLogger`, not `logger`, and `createRuntime` takes dependencies *and* options. Replace both files with the version below before `npm run dev`.

A working `src/app.ts`, using only exports that exist today:

```ts
import { createApplication } from "@zudojs/core";
import type { Application } from "@zudojs/core";

export async function createApp(): Promise<Application> {
  return await createApplication({
    modules: [],
    runtime: {
      name: "my-app",
      mode: "development",
      signals: { handleSigint: true, handleSigterm: true },
    },
  });
}
```

And the matching `src/server.ts`:

```ts
import { createApp } from "./app.js";

const app = await createApp();

await app.start();

console.log(`my-app is ${app.state}`);
```

**What you should see.** `npm run dev` prints the runtime's JSON start-up lines followed by `my-app is running`, and stays up until you press `Ctrl+C`.

## WHAT EACH FOLDER HOLDS

The folders are a convention, not a rule — but the CLI's `generate` command writes into them by these names, so it pays to keep them.

| Folder | What goes in it |
| --- | --- |
| `configs/` | Settings objects and config loading. |
| `constants/` | Fixed values shared across the app. |
| `controllers/` | Code that turns an incoming request into a response. |
| `databases/` | Connections and migrations. |
| `dtos/` | Shapes of data crossing the app's edge, in and out. |
| `enums/` | Fixed sets of named values. |
| `errors/` | Your own error classes. |
| `events/` | Things that happened, and the code that reacts to them. |
| `interfaces/` | Contracts implemented elsewhere in the app. |
| `jobs/` | Work that runs in the background or on a schedule. |
| `loaders/` | Start-up wiring: what to register before the app serves traffic. |
| `loggers/` | Logger setup and transports. |
| `middlewares/` | Steps that run around every request. |
| `models/` | Your domain objects. |
| `repositories/` | The only place that talks to storage. |
| `routes/` | Which URL reaches which controller. |
| `services/` | Business rules that are not tied to HTTP. |
| `types/` | Shared TypeScript types. |
| `utils/` | Small helpers with no dependencies of their own. |
| `validators/` | Checks on incoming data. |

> TIP
>
>
>
> A useful direction of travel: `routes → controllers → services → repositories → databases`. Each layer talks to the next one down and never back up.

## THE FILES AT THE ROOT

| File | What it is | Edit it? |
| --- | --- | --- |
| `package.json` | Dependencies plus the `dev`, `build`, `start`, `test`, `typecheck` and `lint` scripts. Also carries a `zudojs` block recording the project type, architecture and enabled features. | Yes |
| `tsconfig.json` | TypeScript settings: ES2024, `Node16` modules, `strict` on, output to `dist/`. | Yes |
| `.env.example` | A template of the environment variables the app expects. Copy it to `.env`, which is gitignored. | Yes |
| `.gitignore` | Ignores `node_modules/`, `dist/`, `.env` and log files. | Yes |
| `README.md` | A short project readme with the run command and the folder list. | Yes |
| `.zudojs/manifest.json` | Machine-managed. Records the architecture, package manager, database and capabilities so `dev`, `generate` and `add` know what kind of project this is. | No |

The scripts a monolith gets:

```ts
"scripts": {
  "dev": "tsx watch src/server.ts",
  "start": "node dist/server.js",
  "build": "tsc",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "lint": "tsc --noEmit"
}
```

> WHERE THE PROJECT IS DESCRIBED
>
>
>
> No `zudojs.config.ts` is generated. The project's type, architecture, package manager and capabilities live in `.zudojs/manifest.json` (machine-managed) and in the `zudojs` block of `package.json`; every follow-up command (`dev`, `add`, `generate`, `doctor`) reads them from there. A `zudojs.config.ts` from an older release is still honoured.

## MODULAR MONOLITH LAYOUT

Same single app, same shared folders — plus `src/modules/`, where each module owns its own `commands/` and `queries/`.

Without `--services` you get three example modules: `identity`, `enrollment` and `assessment`. Pass your own names to replace them:

```bash
$ npx zudojs-cli create shop --architecture modular-monolith --services catalog,orders
```

```ts
shop/
├── .zudojs/manifest.json
├── src/
│   ├── index.ts
│   ├── app.ts
│   ├── server.ts
│   ├── configs/  constants/  controllers/  databases/  dtos/
│   ├── enums/  errors/  events/  interfaces/  jobs/  loaders/
│   ├── loggers/  middlewares/  models/  repositories/  routes/
│   ├── services/  types/  utils/  validators/
│   └── modules/
│       ├── index.ts              # re-exports every module
│       ├── catalog/
│       │   ├── index.ts
│       │   ├── catalog.module.ts
│       │   ├── commands/index.ts
│       │   └── queries/index.ts
│       └── orders/
│           ├── index.ts
│           ├── orders.module.ts
│           ├── commands/index.ts
│           └── queries/index.ts
├── tests/index.ts
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

**Commands and queries** are the two halves of a common split: a *command* changes something, a *query* only reads. Keeping them in separate folders makes it obvious at a glance which code can alter data.

Add another module later without touching the rest:

```bash
$ npx zudojs-cli generate module billing
Generated 2 files:
  - src/modules/billing/billing.module.ts
  - src/modules/billing/index.ts
```

## MICROSERVICE LAYOUT

Here the project is a workspace: one repository holding several apps that install and deploy separately. A `gateway` app sits in front on port 3000, and each service gets its own port from 3001 up.

```bash
$ npx zudojs-cli create platform --architecture microservice --services identity,billing
```

```ts
platform/
├── .zudojs/manifest.json
├── apps/
│   ├── gateway/
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── app.ts
│   │   │   └── server.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── Dockerfile
│   └── services/
│       ├── identity/
│       │   ├── src/
│       │   │   ├── index.ts  app.ts  server.ts
│       │   │   ├── commands/  queries/
│       │   │   └── configs/ … validators/   # same 20 folders as a monolith
│       │   ├── package.json
│       │   ├── tsconfig.json
│       │   └── Dockerfile
│       └── billing/
│           └── …                            # identical shape
├── src/
│   └── types/index.ts       # types shared by every app
├── docker-compose.yml
├── pnpm-workspace.yaml      # only when the package manager is pnpm
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

Each app has its own `package.json` and its own dependencies. The root `package.json` only fans commands out across them — its `dev` script runs every app's `dev` script at once.

With pnpm the workspace members are listed in `pnpm-workspace.yaml`; with npm, yarn or bun they are a `workspaces` array in the root `package.json`. Either way the globs are the same:

```ts
packages:
  - "apps/gateway"
  - "apps/services/*"
```

`docker-compose.yml` and a `Dockerfile` per app are written only for this architecture. `docker compose up` builds and runs the whole set.

> WATCH OUT
>
>
>
> If you do not pass `--services`, a non-interactive `create` uses the flag's own default and generates `apps/services/gateway` and `apps/services/api` alongside the top-level `apps/gateway`. Name your services explicitly to avoid the duplicate.

## WHERE GENERATE PUTS FILES

`zudojs generate <kind> <name>` writes one small set of files. It reads the architecture from your project first, then picks the folder. Add `--dry-run` to see the paths without writing anything.

```bash
$ npx zudojs-cli generate controller invoice --dry-run
Detected architecture: monolith
Dry run: 2 files would be generated (nothing written):
  - src/controllers/invoice.controller.ts
  - src/controllers/index.ts
```

The thirteen kinds, and where each lands in a monolith:

| Kind | Path | Notes |
| --- | --- | --- |
| `module` | `src/modules/<name>/` | The one kind that always gets its own folder. |
| `service` | `src/<name>/<name>.service.ts` | Note: its own folder, not `src/services/`. |
| `controller` | `src/controllers/` | Also updates the folder's `index.ts`. |
| `repository` | `src/repositories/` |  |
| `route` | `src/routes/` |  |
| `model` | `src/models/` |  |
| `dto` | `src/dtos/` |  |
| `validator` | `src/validators/` |  |
| `event` | `src/events/` |  |
| `job` | `src/jobs/` |  |
| `middleware` | `src/middlewares/` |  |
| `command` | `src/<service>/commands/<name>/` | Uses `--service`; falls back to `default`. |
| `query` | `src/<service>/queries/<name>/` | Uses `--service`; falls back to `default`. |

Two flags change the destination:

- `--module <name>` puts the file inside `src/modules/<name>/` instead of the shared folder. It is ignored for `generate module` itself.
- `--service <name>` names the owner of a command or query.

> WATCH OUT
>
>
>
> In a microservice project, `generate` writes into `apps/default/` unless the kind is `service` (which goes to `apps/`). That does not match the `apps/services/<name>/` layout `create` writes, so check with `--dry-run` and move the files if needed.

## NAMING CONVENTIONS

Every generated file says what it is in its own name: `<name>.<kind>.ts`, lower-case and hyphenated. The exported class is the PascalCase version with the kind appended.

| You type | File | Export |
| --- | --- | --- |
| `generate service payment` | `src/payment/payment.service.ts` | `PaymentService` |
| `generate controller user-profile` | `src/controllers/user-profile.controller.ts` | `UserProfileController` |
| `generate module billing` | `src/modules/billing/billing.module.ts` | `BillingModule` |
| `generate repository order` | `src/repositories/order.repository.ts` | `OrderRepository` |

Two more conventions worth keeping:

- Every folder has an `index.ts` that re-exports its contents, so imports read `from "./controllers/index.js"` rather than reaching at individual files.
- Relative imports end in `.js`, never `.ts`. The generated `tsconfig.json` uses `"module": "Node16"`, which requires the extension of the file that will exist after compiling.

> TIP
>
>
>
> Run `npx zudojs-cli doctor` in a project to check the Node version, package manager, `tsconfig.json` and dependencies in one go.

## NEXT STEPS

- [Architecture](https://zudojs.oyinlola.site/docs/architecture.md) — why the framework is split this way.
- [Module System](https://zudojs.oyinlola.site/docs/architecture-module-system.md) — how modules are registered, ordered and loaded.
- [zudojs-cli](https://zudojs.oyinlola.site/docs/packages-cli.md) — the full command and flag reference.
- [Package Rules](https://zudojs.oyinlola.site/docs/rules.md) — the conventions the framework's own 39 packages follow.
