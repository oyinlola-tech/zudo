---
title: "Anatomy of a ZudoJS project — ZudoJS Academy"
description: "Trace a generated ZudoJS project from src/server.ts through config, runtime and composition root to controller, service and repository, with its real files."
source: https://zudojs.oyinlola.site/learn/zudo-project-anatomy
---

LEVEL 12 · LESSON 5 OF 19

Entering ZudoJS Core

# Anatomy of a ZudoJS project

Trace a generated ZudoJS project from src/server.ts through config, runtime and composition root to controller, service and repository, with its real files.

- **55 min** to read and try
- **You need:** "The ZudoJS CLI in depth"
- **You build:** A startup trace, a layer-by-layer request trace and a wiring smoke test that run the real files zudojs create generated

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Find the file that owns any job in a generated project, from settings to storage
- Trace a request from the HTTP server through the middleware pipeline, router, controller, service and repository and back
- Explain how errors from each layer become 400, 404 or 500 responses
- Swap a layer at the composition root without touching the others
- Write a smoke test that proves the wiring, which the generated tests cannot

## The problem: 44 files and a bug report

A customer writes: "I created a note, and when I open it the app says it does not exist." You open the project `zudojs create` generated in [Create the Task API project](https://zudojs.oyinlola.site/learn/zudo-create-project). It has 44 files in 26 folders. Which one do you open first?

Guessing costs time. What you need is a **map**: for every job the application does (read settings, start up, receive a request, check input, apply rules, store data, answer, shut down), which file does it, and which file calls which. With the map, the bug report becomes a route: the request enters in `src/server.ts`, the controller checks the id, the service asks the repository, the repository answers "not found". Somewhere on that route the answer went wrong.

This lesson builds that map from the real files. Every generated file shown here is exactly what `zudojs create task-api` (CLI 2.1.3) wrote, and every trace below runs those files, so what you see is how your project behaves. If you have your `task-api` project open, compare as you go; if you already changed some files in later lessons, a fresh project in a temporary folder shows the originals.

## The map

Here is the whole project as one picture. Arrows mean "imports and calls":

```ts
 npm run dev ──▶ tsx watch src/server.ts            (the entry point)
                     │
                     ├──▶ configs/index.ts   loadConfig()        settings from env and .env
                     │
                     ├──▶ app.ts             createApp()         the runtime:
                     │        ├── integrations/                     outside connections (a module)
                     │        └── modules/app.module.ts             your modules
                     │
                     ├──▶ container.ts       createDependencies()  the composition root:
                     │        └── new Controller(new Service(new Repository()))
                     │
                     ├──▶ routes/index.ts    registerRoutes()      paths → controller methods
                     │
                     └──▶ utils/http.ts      securityHeaders, errorResponse
                              + CORS, rate limit        the middleware pipeline

 a request:  HTTP server → pipeline → router → controller → service → repository
                                                   │            │           │
                                             dtos/ (schemas)  errors    in-memory Map
```

The generated project: what runs once at startup (top) and what runs for every request (bottom line).

The picture has two halves. Everything above "a request" happens once, when the process starts. The bottom line happens for every request. Keep them apart in your head: a bug in the top half stops the app from starting; a bug in the bottom half makes one kind of request fail.

The folders from the tree in the previous lessons fall into three groups:

| Group | Folders and files | Who writes them |
| --- | --- | --- |
| Startup | `server.ts`, `app.ts`, `index.ts`, `configs/`, `integrations/`, `modules/`, `container.ts` | The CLI once; `zudojs add` and `generate` add lines between markers; you change them rarely |
| Request path | `routes/`, `controllers/`, `services/`, `repositories/`, `dtos/`, `utils/http.ts`, `middlewares/` | `generate` starts them; you write most of this code |
| Places for later | `constants/`, `databases/`, `enums/`, `errors/`, `events/`, `interfaces/`, `jobs/`, `loaders/`, `loggers/`, `models/`, `types/`, `validators/` | Empty `index.ts` files until you or a schematic put code there |

Outside `src/` sit `tests/`, `package.json` (scripts and dependencies), `tsconfig.json`, `.env.example`, `.gitignore` and the CLI's record, `.zudojs/manifest.json`.

## The entry point: src/server.ts

`npm run dev` runs `tsx watch src/server.ts`, and `npm start` runs its compiled twin, `dist/server.js`. Every other file is reached from here. This is the whole file:

src/server.tsNode.js only

```ts
import { createServer } from "node:http";

import {
  HttpMiddlewarePipeline,
  createCorsMiddleware,
  createHttpServer,
  createNodeHttpAdapter,
  createRateLimitMiddleware,
  createResponseContext,
  createRouter,
  type HttpMiddleware,
  type HttpRequestContext,
} from "@zudojs/http";
// zudojs:server-imports:start
// zudojs:server-imports:end

import { createApp } from "./app.js";
import { loadConfig } from "./configs/index.js";
import { createDependencies } from "./container.js";
import { checkIntegrations, drainIntegrations, integrations } from "./integrations/index.js";
import { registerRoutes } from "./routes/index.js";
import { errorResponse, securityHeaders } from "./utils/http.js";

const config = await loadConfig();
const httpServer = createServer();
const runtime = createApp({ config, httpServer });

const router = createRouter();
registerRoutes(
  router,
  createDependencies({
    health: async () => {
      const checks = await checkIntegrations(integrations);
      const ready =
        runtime.state === "running" && Object.values(checks).every((check) => check === "up");
      return { ready, checks };
    },
  }),
);
// zudojs:server-mounts:start
// zudojs:server-mounts:end

const dispatch: HttpMiddleware = async (context) => {
  try {
    return (await router.dispatch(context.request, { signal: context.signal })).response;
  } catch (error) {
    const response = errorResponse(error);
    if (response === undefined) throw error;
    return response;
  }
};

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

await runtime.start();

const server = createHttpServer({
  adapter: createNodeHttpAdapter({ server: httpServer, host: config.host, port: config.port }),
  handler: (request: HttpRequestContext) => pipeline.execute(request, createResponseContext()),
});

await server.start();

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) {
      console.log(`Received ${signal} again: already shutting down.`);
      return;
    }
    stopping = true;
    console.log(`Received ${signal}: shutting down.`);
    void drainIntegrations(integrations)
      .then(() => server.stop())
      .then(() => runtime.stop())
      .then(() => {
        process.exit(0);
      })
      .catch((error: unknown) => {
        console.error(error);
        process.exit(1);
      });
  });
}

console.log(`Listening on http://${config.host}:${server.address?.port ?? config.port}`);
```

REASON IT OUT

### Why this order?

Before reading the explanation, look at the order of the top-level statements and think:

- Why is the configuration loaded before anything else? What happens if `PORT` is `"80a"`?
- Why does `runtime.start()` run before `server.start()`? What could a request see if the server started first?
- The routes are registered before the runtime starts. Is that a problem?
- On Ctrl + C, why is the order "drain integrations, stop server, stop runtime" and not the reverse?
- What happens if a second `SIGINT` arrives while shutting down?

**Show the reasoning**

- Configuration first, because everything else depends on it, and because a wrong setting should stop the program *before* it opens anything. `loadConfig` throws a `ConfigurationError` for `"80a"`; the top-level `await` turns that into a crash with a clear message, and nothing is half-started.
- The runtime first, because it connects the integrations (a database, Redis) that request handlers use. Started the other way round, the first requests could reach a handler whose database is not connected yet. It is the same idea as the `dependencies` between modules, which [the runtime lesson](https://zudojs.oyinlola.site/learn/zudo-runtime) covers soon, one level up.
- No. Registering routes only builds a lookup table in memory. Nothing can call them until `server.start()` opens the port, which happens last.
- Shutdown is startup reversed. First let integrations close long-lived connections (WebSockets), then stop taking requests and finish the ones in progress, and only then close what those requests were using. Closing the database first would fail the requests still running.
- The `stopping` flag makes the second signal print a line and do nothing else, so the shutdown in progress is not started twice.

The file has one more job worth noticing: `dispatch`. It is the last middleware, the bridge from the pipeline to the router, and its `catch` is the one place where errors thrown anywhere below it become responses. You will come back to it in [Errors across the layers](#errors).

The `// zudojs:…` comments are the markers from [the CLI lesson](https://zudojs.oyinlola.site/learn/zudo-cli#wiring): `add openapi` writes into `server-mounts`, `generate middleware` into `server-middleware`.

## Settings: src/configs/index.ts

`loadConfig` reads the environment through `@zudojs/config`, checks the values it cares about, and returns one frozen object. The [configuration lesson](https://zudojs.oyinlola.site/learn/zudo-config) covers `@zudojs/config` in depth; here is the generated file:

src/configs/index.ts

```ts
import { ConfigurationError } from "@zudojs/errors";
import {
  createConfigManager,
  createEnvironmentConfigSource,
  type ConfigManager,
} from "@zudojs/config";

const DEFAULT_PORT = 3000;

/** Loads `.env` into process.env when it exists; real variables win. */
function loadDotEnv(): void {
  try {
    process.loadEnvFile(".env");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/** A string setting, or `fallback` when the variable is unset. */
export function text(config: ConfigManager, key: string, fallback: string): string {
  return config.string(key, fallback) ?? fallback;
}

/** A comma-separated list setting. */
export function list(config: ConfigManager, key: string): readonly string[] {
  return (config.string(key, "") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** A non-negative integer setting; anything else is a configuration error. */
export function int(config: ConfigManager, key: string, fallback: number): number {
  const raw = config.string(key);
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ConfigurationError(`${key.toUpperCase()} must be a non-negative integer, got "${raw}".`);
  }
  return value;
}

/** PORT, refusing anything that is not a TCP port. */
function port(config: ConfigManager): number {
  const raw = config.string("port");
  if (raw === undefined || raw.trim() === "") return DEFAULT_PORT;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    throw new ConfigurationError(`PORT must be an integer between 0 and 65535, got "${raw}".`);
  }
  return value;
}

/**
 * Reads the application configuration from the environment (and `.env`).
 * `zudojs add <feature>` adds the feature's settings between the markers.
 */
export async function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env === process.env) loadDotEnv();
  const config = createConfigManager({
    sources: [createEnvironmentConfigSource({ env })],
  });
  await config.load();

  return Object.freeze({
    nodeEnv: text(config, "node_env", "development"),
    host: text(config, "host", "0.0.0.0"),
    port: port(config),
    corsOrigins: list(config, "cors_origins"),
    rateLimit: Object.freeze({
      windowMs: int(config, "rate_limit_window_ms", 60_000),
      max: int(config, "rate_limit_max", 300),
    }),
    // zudojs:config:start
    database: Object.freeze({ url: text(config, "database_url", "") }),
    // zudojs:config:end
  });
}

/** The loaded configuration. */
export type AppConfig = Awaited<ReturnType<typeof loadConfig>>;
```

Three details matter for the map:

- `loadConfig` takes the environment as a parameter, defaulting to `process.env`. Only the real environment triggers reading `.env`. That makes the function easy to test: pass an object, get a config, and nothing on disk is read.
- Keys are written in lowercase (`"port"`, `"cors_origins"`); the environment source matches them to `PORT` and `CORS_ORIGINS`.
- `AppConfig` is not written by hand: `Awaited<ReturnType<typeof loadConfig>>` takes the type from the function. Add a setting to the object and every file that uses `AppConfig` sees it.

Because it takes an environment object, you can run it here:

config-trace.tsNode.js only

```ts
import { loadConfig } from "./src/configs/index.js";

const config = await loadConfig({ PORT: "4000", CORS_ORIGINS: "https://shop.example, https://admin.shop.example" });
console.log(config.port, config.host, config.corsOrigins, config.rateLimit.max);
console.log(Object.isFrozen(config), Object.isFrozen(config.rateLimit));

for (const env of [{ PORT: "80a" }, { PORT: "70000" }, { RATE_LIMIT_MAX: "-1" }]) {
  try {
    await loadConfig(env);
  } catch (error) {
    console.log(`${(error as Error).name}: ${(error as Error).message}`);
  }
}
```

Output of `npx tsx config-trace.ts`

```ts
4000 0.0.0.0 [ 'https://shop.example', 'https://admin.shop.example' ] 300
true true
ConfigurationError: PORT must be an integer between 0 and 65535, got "80a".
ConfigurationError: PORT must be an integer between 0 and 65535, got "70000".
ConfigurationError: RATE_LIMIT_MAX must be a non-negative integer, got "-1".
```

Unset values fall back to defaults (`0.0.0.0`, 300 requests per window), the comma list is split and trimmed, and bad numbers are refused with the variable's name in the message. `Object.freeze` means no code can change a setting while the app runs.

## Startup: src/app.ts, modules and integrations

`createApp` builds the **runtime**, the part of ZudoJS that starts and stops the app's modules in order. [The application runtime and lifecycle](https://zudojs.oyinlola.site/learn/zudo-runtime), two lessons from now, studies it in depth. The file is short:

src/app.ts

```ts
import type { Server } from "node:http";

import { resolveEnvironment } from "@zudojs/constants";
import { createContainer } from "@zudojs/container";
import type { Module } from "@zudojs/core";
import { createEventBus } from "@zudojs/events";
import { createLogger } from "@zudojs/logger";
import { createRuntime, type Runtime } from "@zudojs/runtime";

import type { AppConfig } from "./configs/index.js";
import { IntegrationsModule, integrations } from "./integrations/index.js";
import { AppModule } from "./modules/index.js";

/** What {@link createApp} needs. */
export interface AppOptions {
  readonly config: AppConfig;
  /** The Node HTTP server, for integrations that attach to it. */
  readonly httpServer?: Server;
}

/**
 * Assembles the application runtime.
 *
 * `createRuntime` takes two arguments: the dependencies the runtime and its
 * modules share, and the options describing this application. Integrations
 * (`src/integrations`) are registered first so they start before, and stop
 * after, every other module.
 */
export function createApp(options: AppOptions): Runtime {
  const logger = createLogger({ name: "task-api" });
  const container = createContainer();
  const eventBus = createEventBus();

  const modules = new Map<string, Module>();
  const integrationsModule = new IntegrationsModule(integrations, {
    config: options.config,
    ...(options.httpServer === undefined ? {} : { httpServer: options.httpServer }),
  });
  modules.set(integrationsModule.id, integrationsModule);
  for (const module of [
    new AppModule(),
  ] as Module[]) {
    modules.set(module.id, module);
  }

  const runtime = createRuntime(
    { modules, logger, container, eventBus },
    {
      applicationName: "task-api",
      applicationVersion: "0.1.0",
      // NODE_ENV is read the same way the framework reads it: `prod` and
      // `Production` are production, an unknown value warns once.
      environment: resolveEnvironment(),
      // Signals are handled explicitly in server.ts.
      handleSignals: false,
    },
  );

  runtime.registerReadinessCheck("modules", () => runtime.state === "running");

  return runtime;
}
```

It builds a logger, a dependency container and an event bus, registers two modules, and adds one readiness check. The two modules are:

- `integrations`, always first. It starts every entry of the `integrations` list, which is empty until `zudojs add` puts a database, Redis or a scheduler there.
- `app`, a placeholder that logs one line. You replace it with real modules.

src/integrations/integration.ts

```ts
import type { Server } from "node:http";

import { BaseModule, type ModuleContext } from "@zudojs/core";

import type { AppConfig } from "../configs/index.js";

/** What an integration receives when it starts. */
export interface IntegrationContext {
  readonly config: AppConfig;
  readonly logger: ModuleContext["logger"];
  /** The Node HTTP server, for integrations that attach to it (WebSockets). */
  readonly httpServer?: Server;
}

/** A client or server with a lifecycle, started and stopped with the runtime. */
export interface Integration {
  readonly name: string;
  start(context: IntegrationContext): Promise<void>;
  stop(): Promise<void>;
  /** Called when shutdown begins, before HTTP stops: close long-lived connections. */
  drain?(): Promise<void>;
  /** Whether the integration is healthy; reported by /health. */
  health?(): Promise<boolean>;
}

/** Runs the integrations as one runtime module. */
export class IntegrationsModule extends BaseModule {
  public readonly id = "integrations";
  public readonly name = "integrations";
  private readonly started: Integration[] = [];

  public constructor(
    private readonly entries: readonly Integration[],
    private readonly startContext: Omit<IntegrationContext, "logger">,
  ) {
    super({ version: "0.1.0" });
  }

  public override async onInitialize(context: ModuleContext): Promise<void> {
    for (const integration of this.entries) {
      await integration.start({ ...this.startContext, logger: context.logger });
      this.started.push(integration);
      context.logger.info(`${integration.name} started`);
    }
  }

  public override async onShutdown(context: ModuleContext): Promise<void> {
    for (const integration of [...this.started].reverse()) {
      try {
        await integration.stop();
      } catch (error) {
        context.logger.error(`${integration.name} failed to stop`, { error });
      }
    }
    this.started.length = 0;
  }
}

/** Lets each integration close long-lived connections before HTTP stops. */
export async function drainIntegrations(integrations: readonly Integration[]): Promise<void> {
  for (const integration of integrations) {
    await integration.drain?.().catch(() => undefined);
  }
}

/** Health of every integration that reports one. */
export async function checkIntegrations(
  integrations: readonly Integration[],
): Promise<Record<string, "up" | "down">> {
  const checks: Record<string, "up" | "down"> = {};
  for (const integration of integrations) {
    if (integration.health === undefined) continue;
    const healthy = await integration.health().catch(() => false);
    checks[integration.name] = healthy ? "up" : "down";
  }
  return checks;
}
```

src/integrations/index.ts

```ts
import type { Integration } from "./integration.js";
// zudojs:integration-imports:start
// zudojs:integration-imports:end

export {
  IntegrationsModule,
  checkIntegrations,
  drainIntegrations,
  type Integration,
  type IntegrationContext,
} from "./integration.js";

/**
 * Started with the runtime in this order and stopped in reverse.
 * `zudojs add <feature>` adds entries between the markers.
 */
export const integrations: readonly Integration[] = [
  // zudojs:integrations:start
  // zudojs:integrations:end
];
```

src/modules/app.module.ts

```ts
import { BaseModule, type ModuleContext } from "@zudojs/core";
import { AppService } from "../services/index.js";

/**
 * app module.
 *
 * Registered with the runtime in app.ts. The runtime calls onInitialize
 * during start and onShutdown during stop.
 */
export class AppModule extends BaseModule {
  public readonly id = "app";
  public readonly name = "app";

  private readonly service = new AppService();

  public constructor() {
    super({ version: "0.1.0" });
  }

  public override async onInitialize(context: ModuleContext): Promise<void> {
    await this.service.initialize();
    context.logger.info("app module initialized");
  }

  public override async onShutdown(context: ModuleContext): Promise<void> {
    context.logger.info("app module stopped");
  }
}
```

src/modules/index.ts

```ts
export { AppModule } from "./app.module.js";
```

src/services/app.service.ts

```ts
import { createLogger } from "@zudojs/logger";

export class AppService {
  private readonly logger = createLogger({ name: "app-service" });

  public async initialize(): Promise<void> {
    this.logger.info("app service initialized");
  }
}
```

src/services/index.ts

```ts
export { AppService } from "./app.service.js";
```

An **integration** is the project's own small contract, not a ZudoJS package: `start`, `stop`, and optionally `drain` and `health`. `IntegrationsModule` turns the list into one runtime module, and `checkIntegrations` feeds `/health`. So when you add a database, the path is: `zudojs add database` writes `src/integrations/database.ts`, adds it to the list, and from then on the runtime starts it before your modules and `/health` reports it.

Now run startup for real. This trace calls `createApp` exactly as `server.ts` does, then starts and stops the runtime without any HTTP server:

startup-trace.tsNode.js only

```ts
import { createApp } from "./src/app.js";
import { loadConfig } from "./src/configs/index.js";

const config = await loadConfig({});
const runtime = createApp({ config });
console.log("state:", runtime.state);
await runtime.start();
console.log("state:", runtime.state, "| ready:", runtime.ready);
await runtime.stop();
console.log("state:", runtime.state);
```

Output of `npx tsx startup-trace.ts`

```ts
state: created
2026-09-24T19:55:46.033Z [INFO] [app-service] app service initialized
2026-09-24T19:55:46.035Z [INFO] [task-api] app module initialized
2026-09-24T19:55:46.036Z [INFO] [task-api] All modules initialized. modules=["integrations","app"] durationMs=5
2026-09-24T19:55:46.039Z [INFO] [task-api] All modules started. modules=["integrations","app"] durationMs=1
2026-09-24T19:55:46.041Z [INFO] [task-api] Runtime is ready. runtimeId=rt_d0cb87c3ed7d4eaaae498f44479b6324 environment=development
state: running | ready: true
2026-09-24T19:55:46.042Z [INFO] [task-api] Initiating graceful shutdown. timeoutMs=30000
2026-09-24T19:55:46.043Z [INFO] [task-api] app module stopped
2026-09-24T19:55:46.044Z [INFO] [task-api] All modules stopped. modules=["app","integrations"] durationMs=1
2026-09-24T19:55:46.045Z [INFO] [task-api] All modules destroyed. durationMs=0
2026-09-24T19:55:46.046Z [INFO] [task-api] Graceful shutdown complete.
2026-09-24T19:55:46.046Z [INFO] [task-api] Runtime stopped. runtimeId=rt_d0cb87c3ed7d4eaaae498f44479b6324
state: stopped
```

Read the log lines in order: `integrations` initializes first, then `app`; they stop in reverse. The first line comes from a different logger, `app-service`, which `AppService` creates for itself. Every time, the timestamps and the `runtimeId` are new.

Two things in `createApp` are easy to misread:

- **The container is empty.** `createContainer()` makes a `@zudojs/container` container and hands it to the runtime, but nothing registers anything in it. The objects your requests use are built somewhere else: in `src/container.ts`, next.
- **`NODE_ENV` is read twice.** `loadConfig` puts it in `config.nodeEnv`, but `createApp` ignores that and calls `resolveEnvironment()`, which reads `process.env` directly. Normally both see the same variable. But `loadConfig({ NODE_ENV: "test" })` in a test gives `config.nodeEnv === "test"` while the runtime still logs `environment=development`. If you ever need them to agree, pass `config.nodeEnv` to `resolveEnvironment` yourself.

## The composition root: src/container.ts

The **composition root** is the one place where the application's objects are created and connected. In a generated project it is plain TypeScript, no framework:

src/container.ts

```ts
import type { HealthCheck } from "./routes/health.routes.js";
// zudojs:container-imports:start
import { ExamplesController } from "./controllers/examples.controller.js";
import { InMemoryExamplesRepository } from "./repositories/examples.repository.js";
import { ExamplesService } from "./services/examples.service.js";
// zudojs:container-imports:end

/** Options for {@link createDependencies}. */
export interface DependencyOptions {
  /** Readiness for /health; server.ts passes the runtime's. */
  readonly health?: HealthCheck;
}

/**
 * The composition root: every controller, service and repository is
 * constructed here, once. `zudojs generate resource` adds entries between
 * the markers; swap an implementation (e.g. a database repository) here.
 */
export function createDependencies(options: DependencyOptions = {}) {
  const health: HealthCheck =
    options.health ?? (async () => ({ ready: true, checks: {} }));

  return {
    health,
    // zudojs:container:start
    examplesController: new ExamplesController(new ExamplesService(new InMemoryExamplesRepository())),
    // zudojs:container:end
  };
}

/** Everything route registration receives. */
export type AppDependencies = ReturnType<typeof createDependencies>;
```

Read the long line from the inside out: a repository is created, handed to a new service, which is handed to a new controller. Each object receives what it needs through its constructor, which is **dependency injection** done by hand. `AppDependencies`, like `AppConfig`, is derived from the function, so the routes know exactly which controllers exist.

This is the file to change when you swap an implementation. Replacing `new InMemoryExamplesRepository()` with a database repository here changes storage for the whole app, and the service and controller never notice. The [dependency injection lesson](https://zudojs.oyinlola.site/learn/zudo-container) moves this wiring into `@zudojs/container` when it grows.

The routes receive that object:

src/routes/index.ts

```ts
import type { HttpRouter } from "@zudojs/http";

import type { AppDependencies } from "../container.js";
import { registerHealthRoutes } from "./health.routes.js";
// zudojs:route-imports:start
import { registerExamplesRoutes } from "./examples.routes.js";
// zudojs:route-imports:end

/**
 * Registers every route of the application. `zudojs generate resource`
 * and `zudojs generate module` add their registrations between the markers.
 */
export function registerRoutes(router: HttpRouter, deps: AppDependencies): void {
  registerHealthRoutes(router, deps.health);
  // zudojs:routes:start
  registerExamplesRoutes(router, deps.examplesController);
  // zudojs:routes:end
}
```

src/routes/health.routes.ts

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

/**
 * GET /health: 200 when the runtime is running and every integration is
 * up, 503 otherwise. Hidden from the OpenAPI document.
 */
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

`server.ts` passes a `health` function that looks at the runtime and the integrations. Without one, `createDependencies` uses a function that always says "ready", which is what tests want.

## The request path, layer by layer

Now the bottom half of the map. Here are the five files of the example resource, from the outside in.

### Routes: paths to controller methods

src/routes/examples.routes.ts

```ts
import type { HttpRouter } from "@zudojs/http";
import { schema } from "@zudojs/schema";

import type { ExamplesController } from "../controllers/examples.controller.js";
import { CreateExampleSchema, ExampleParamsSchema, ExampleSchema, UpdateExampleSchema } from "../dtos/examples.dto.js";

const BASE_PATH = "/api/v1/examples";
const TAGS = ["examples"];
const invalid = { description: "The request failed validation" };
const missing = { description: "No example has this id" };

/** Registers the examples CRUD routes. */
export function registerExamplesRoutes(
  router: HttpRouter,
  controller: ExamplesController,
): void {
  router.get(BASE_PATH, controller.list, {
    openapi: {
      summary: "List examples",
      tags: TAGS,
      responses: { "200": { description: "Every example", schema: schema.array(ExampleSchema) } },
    },
  });

  router.get(`${BASE_PATH}/:id`, controller.get, {
    openapi: {
      summary: "Get an example",
      tags: TAGS,
      params: ExampleParamsSchema,
      responses: { "200": { description: "The example", schema: ExampleSchema }, "400": invalid, "404": missing },
    },
  });

  router.post(BASE_PATH, controller.create, {
    openapi: {
      summary: "Create an example",
      tags: TAGS,
      body: CreateExampleSchema,
      responses: { "201": { description: "Created", schema: ExampleSchema }, "400": invalid },
    },
  });

  router.patch(`${BASE_PATH}/:id`, controller.update, {
    openapi: {
      summary: "Update an example",
      tags: TAGS,
      params: ExampleParamsSchema,
      body: UpdateExampleSchema,
      responses: { "200": { description: "Updated", schema: ExampleSchema }, "400": invalid, "404": missing },
    },
  });

  router.delete(`${BASE_PATH}/:id`, controller.remove, {
    openapi: {
      summary: "Delete an example",
      tags: TAGS,
      params: ExampleParamsSchema,
      responses: { "204": { description: "Deleted" }, "400": invalid, "404": missing },
    },
  });
}
```

A routes file only maps a method and a path to a controller method. The `openapi` option describes the route for the API documentation; it does not validate anything.

### Controller: HTTP in, HTTP out

src/controllers/examples.controller.ts

```ts
import type { HttpResponseContext, HttpRouterContext } from "@zudojs/http";

import { CreateExampleSchema, ExampleParamsSchema, UpdateExampleSchema } from "../dtos/examples.dto.js";
import type { ExamplesService } from "../services/examples.service.js";
import { empty, json, readJsonBody, validationFailed } from "../utils/http.js";

/** HTTP handlers for /api/v1/examples. */
export class ExamplesController {
  public constructor(private readonly service: ExamplesService) {}

  public readonly list = async (): Promise<HttpResponseContext> =>
    json(200, await this.service.list());

  public readonly get = async (ctx: HttpRouterContext): Promise<HttpResponseContext> => {
    const params = ExampleParamsSchema.safeParse(ctx.params);
    if (!params.success) return validationFailed(params.issues);
    return json(200, await this.service.get(params.data.id));
  };

  public readonly create = async (ctx: HttpRouterContext): Promise<HttpResponseContext> => {
    const body = CreateExampleSchema.safeParse(readJsonBody(ctx));
    if (!body.success) return validationFailed(body.issues);
    return json(201, await this.service.create(body.data));
  };

  public readonly update = async (ctx: HttpRouterContext): Promise<HttpResponseContext> => {
    const params = ExampleParamsSchema.safeParse(ctx.params);
    if (!params.success) return validationFailed(params.issues);
    const body = UpdateExampleSchema.safeParse(readJsonBody(ctx));
    if (!body.success) return validationFailed(body.issues);
    return json(200, await this.service.update(params.data.id, body.data));
  };

  public readonly remove = async (ctx: HttpRouterContext): Promise<HttpResponseContext> => {
    const params = ExampleParamsSchema.safeParse(ctx.params);
    if (!params.success) return validationFailed(params.issues);
    await this.service.remove(params.data.id);
    return empty(204);
  };
}
```

The controller is the only layer that knows about HTTP. It reads the path parameters and the body, checks them with the DTO schemas, calls the service with clean, typed data, and turns the result into a status code and JSON. Its methods are arrow functions stored in properties, so `this` still works when the router calls `controller.list` on its own (the `this` trap from [Classes](https://zudojs.oyinlola.site/learn/js-classes)).

### DTOs: the shapes that cross the boundary

src/dtos/examples.dto.ts

```ts
import { schema, type Infer } from "@zudojs/schema";

/** An example as the API returns it. */
export const ExampleSchema = schema.object({
  id: schema.string().uuid(),
  name: schema.string(),
  createdAt: schema.string(),
  updatedAt: schema.string(),
});

/** Body of `POST /api/v1/examples`. Unknown fields are dropped. */
export const CreateExampleSchema = schema.object({
  name: schema.string().min(1).max(200),
});

/** Body of `PATCH /api/v1/examples/:id`. Every field is optional. */
export const UpdateExampleSchema = schema.object({
  name: schema.string().min(1).max(200).optional(),
});

/** Path parameters of the `/api/v1/examples/:id` routes. */
export const ExampleParamsSchema = schema.object({
  id: schema.string().uuid(),
});

export type Example = Infer<typeof ExampleSchema>;
export type CreateExampleInput = Infer<typeof CreateExampleSchema>;
export type UpdateExampleInput = Infer<typeof UpdateExampleSchema>;
```

Each schema is written once and gives two things: a runtime check (`safeParse`) and a TypeScript type (`Infer`). That is the pattern from [Your first Zudo code](https://zudojs.oyinlola.site/learn/zudo-first-code).

### Service: the rules

src/services/examples.service.ts

```ts
import { NotFoundError } from "@zudojs/errors";

import type { CreateExampleInput, Example, UpdateExampleInput } from "../dtos/examples.dto.js";
import type { ExamplesRepository } from "../repositories/examples.repository.js";

/** Example use cases. Throws NotFoundError (404) for an unknown id. */
export class ExamplesService {
  public constructor(private readonly repository: ExamplesRepository) {}

  public list(): Promise<readonly Example[]> {
    return this.repository.findAll();
  }

  public async get(id: string): Promise<Example> {
    const record = await this.repository.findById(id);
    if (record === undefined) throw notFound(id);
    return record;
  }

  public create(input: CreateExampleInput): Promise<Example> {
    return this.repository.create(input);
  }

  public async update(id: string, input: UpdateExampleInput): Promise<Example> {
    const record = await this.repository.update(id, input);
    if (record === undefined) throw notFound(id);
    return record;
  }

  public async remove(id: string): Promise<void> {
    if (!(await this.repository.delete(id))) throw notFound(id);
  }
}

function notFound(id: string): NotFoundError {
  return new NotFoundError(`Example "${id}" was not found.`);
}
```

The service knows the rules ("an unknown id is not found") and nothing about HTTP. It never builds a response; it *throws* a `NotFoundError` from `@zudojs/errors`, an error that already carries status 404. That keeps it usable from a job or a command-line tool, where there is no request at all.

### Repository: storage behind an interface

src/repositories/examples.repository.ts

```ts
import { randomUUID } from "node:crypto";

import { ConflictError } from "@zudojs/errors";

import type { CreateExampleInput, Example, UpdateExampleInput } from "../dtos/examples.dto.js";

/** Storage contract for example records; the service depends on this only. */
export interface ExamplesRepository {
  findAll(): Promise<readonly Example[]>;
  findById(id: string): Promise<Example | undefined>;
  create(input: CreateExampleInput): Promise<Example>;
  update(id: string, input: UpdateExampleInput): Promise<Example | undefined>;
  delete(id: string): Promise<boolean>;
}

/** Most records the in-memory store keeps, so it cannot exhaust memory. */
const MAX_RECORDS = 10_000;

/**
 * Keeps example records in process memory: for development and tests.
 * Data is lost on restart. Swap the implementation in container.ts.
 */
export class InMemoryExamplesRepository implements ExamplesRepository {
  private readonly records = new Map<string, Example>();

  public async findAll(): Promise<readonly Example[]> {
    return [...this.records.values()];
  }

  public async findById(id: string): Promise<Example | undefined> {
    return this.records.get(id);
  }

  public async create(input: CreateExampleInput): Promise<Example> {
    if (this.records.size >= MAX_RECORDS) {
      throw new ConflictError("The in-memory example store is full.");
    }
    const now = new Date().toISOString();
    const record: Example = {
      id: randomUUID(),
      name: input.name,
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(record.id, record);
    return record;
  }

  public async update(
    id: string,
    input: UpdateExampleInput,
  ): Promise<Example | undefined> {
    const existing = this.records.get(id);
    if (existing === undefined) return undefined;
    const updated: Example = {
      ...existing,
      name: input.name ?? existing.name,
      updatedAt: new Date().toISOString(),
    };
    this.records.set(id, updated);
    return updated;
  }

  public async delete(id: string): Promise<boolean> {
    return this.records.delete(id);
  }
}
```

The `ExamplesRepository` interface is what the service depends on. `InMemoryExamplesRepository` is one implementation, a `Map` with a size limit so a flood of requests cannot eat all the memory. It also decides the id (`randomUUID()`) and the timestamps, because those belong to storage.

### The HTTP helpers

src/utils/http.ts

```ts
import {
  badRequest,
  createResponseContext,
  type HttpMiddleware,
  type HttpResponseContext,
  type HttpRouterContext,
} from "@zudojs/http";
import type { SchemaIssue } from "@zudojs/schema";
import { generateSecurityHeaders } from "@zudojs/security";

/** A JSON response with `status`. */
export function json(status: number, data: unknown): HttpResponseContext {
  return createResponseContext({ status }).json(data);
}

/** A response with no body (for example 204). */
export function empty(status: number): HttpResponseContext {
  return createResponseContext({ status });
}

/** 400 listing where the input failed validation, without echoing it back. */
export function validationFailed(issues: readonly SchemaIssue[]): HttpResponseContext {
  return json(400, {
    error: "Validation failed",
    issues: issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    })),
  });
}

/**
 * The request body parsed as JSON; `undefined` when there is none.
 * Malformed JSON is answered with 400.
 */
export function readJsonBody(ctx: HttpRouterContext): unknown {
  const body: unknown = ctx.request.body;
  if (body === undefined || body === null) return undefined;
  const text =
    body instanceof Uint8Array
      ? new TextDecoder().decode(body)
      : typeof body === "string"
        ? body
        : undefined;
  if (text === undefined) return body;
  if (text.trim() === "") return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw badRequest("The request body is not valid JSON.");
  }
}

/**
 * The response for an error that carries an exposed 4xx status
 * (NotFoundError, badRequest(), ...). Anything else is left to the server,
 * which answers a generic 500 and never leaks the message.
 */
export function errorResponse(error: unknown): HttpResponseContext | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as {
    readonly statusCode?: unknown;
    readonly expose?: unknown;
    readonly message?: unknown;
    readonly code?: unknown;
  };
  const status = candidate.statusCode;
  if (typeof status !== "number" || status < 400 || status > 499) return undefined;
  if (candidate.expose !== true || typeof candidate.message !== "string") return undefined;
  return json(status, {
    error: candidate.message,
    ...(typeof candidate.code === "string" ? { code: candidate.code } : {}),
  });
}

/**
 * Adds the @zudojs/security default headers (CSP, HSTS, nosniff,
 * X-Frame-Options DENY, ...) to every response that does not set its own:
 * the /docs page, for instance, sends a CSP that allows its assets.
 */
export function securityHeaders(): HttpMiddleware {
  const defaults = Object.entries(generateSecurityHeaders());
  return async (_context, next) => {
    const response = (await next()).clone();
    const present = new Set(Object.keys(response.headers).map((name) => name.toLowerCase()));
    for (const [name, value] of defaults) {
      if (!present.has(name.toLowerCase())) response.setHeader(name, value);
    }
    return response;
  };
}
```

`securityHeaders` adds the default headers from `@zudojs/security`, but only the ones a response does not set itself. That is how a page such as `/docs` can send its own, looser content security policy:

headers-trace.tsNode.js only

```ts
import { HttpMiddlewarePipeline, createResponseContext } from "@zudojs/http";
import type { HttpMiddleware } from "@zudojs/http";
import { createHttpTestClient } from "@zudojs/testing";

import { securityHeaders } from "./src/utils/http.js";

const handler: HttpMiddleware = async (context) =>
  context.request.path === "/docs"
    ? createResponseContext({ status: 200, headers: { "content-security-policy": "default-src 'self' https://cdn.example" } }).json({ page: "docs" })
    : createResponseContext({ status: 200 }).json({ ok: true });

const client = createHttpTestClient(new HttpMiddlewarePipeline({ middlewares: [securityHeaders(), handler] }));
for (const path of ["/api/v1/examples", "/docs"]) {
  const response = await client.get(path);
  console.log(path, "|", response.headers.get("x-frame-options"), "|", response.headers.get("content-security-policy")?.slice(0, 40));
}
await client.close();
```

Output of `npx tsx headers-trace.ts`

```ts
/api/v1/examples | DENY | default-src 'self'; script-src 'self'; s
/docs | DENY | default-src 'self' https://cdn.example
```

It calls `next()` first and then changes a `clone()` of the response, because the response a handler returns may be shared and must not be changed in place.

Back to the `health` function that `server.ts` passes to the composition root. Here it is at work, with the real `registerHealthRoutes` and `checkIntegrations`. Two integrations: `redis` reports its health, `mailer` has no `health` method:

health-trace.tsNode.js only

```ts
import { createRouter } from "@zudojs/http";
import { createHttpTestClient } from "@zudojs/testing";

import { checkIntegrations } from "./src/integrations/index.js";
import type { Integration } from "./src/integrations/index.js";
import { registerHealthRoutes } from "./src/routes/health.routes.js";

let redisUp = true;
const redis: Integration = {
  name: "redis",
  start: async () => {},
  stop: async () => {},
  health: async () => redisUp,
};
const mailer: Integration = { name: "mailer", start: async () => {}, stop: async () => {} };
let runtimeState = "running";

const router = createRouter();
registerHealthRoutes(router, async () => {
  const checks = await checkIntegrations([redis, mailer]);
  const ready = runtimeState === "running" && Object.values(checks).every((check) => check === "up");
  return { ready, checks };
});
const client = createHttpTestClient(router);

for (const [label, change] of [["all up", () => {}], ["redis down", () => { redisUp = false; }], ["stopping", () => { redisUp = true; runtimeState = "stopping"; }]] as const) {
  change();
  const response = await client.get("/health");
  const body = response.json<{ status: string; checks: Record<string, string> }>();
  console.log(label.padEnd(10), response.status, body.status, JSON.stringify(body.checks));
}
await client.close();
```

Output of `npx tsx health-trace.ts`

```ts
all up     200 ok {"redis":"up"}
redis down 503 unavailable {"redis":"down"}
stopping   503 unavailable {"redis":"up"}
```

An integration without a `health` method is simply not listed, so it can never make the app unready. And while the runtime is stopping, `/health` says 503 even though every check is up: the load balancer stops sending new requests before the app closes its connections.

### Run it: one request through every layer

To see the path, this trace builds the composition root by hand, the same shape as `createDependencies()`, but with a service and a repository that print when they are called. It uses the real `registerRoutes`, controller and `errorResponse`, and a middleware that prints each request and its status:

layers-trace.tsNode.js only

```ts
import { HttpMiddlewarePipeline, createRouter } from "@zudojs/http";
import type { HttpMiddleware } from "@zudojs/http";
import { createHttpTestClient } from "@zudojs/testing";

import { ExamplesController } from "./src/controllers/examples.controller.js";
import type { CreateExampleInput, Example } from "./src/dtos/examples.dto.js";
import { InMemoryExamplesRepository } from "./src/repositories/examples.repository.js";
import { registerRoutes } from "./src/routes/index.js";
import { ExamplesService } from "./src/services/examples.service.js";
import { errorResponse } from "./src/utils/http.js";

class TracedRepository extends InMemoryExamplesRepository {
  public override async create(input: CreateExampleInput): Promise<Example> {
    console.log("      repository.create", input);
    return super.create(input);
  }
  public override async findById(id: string): Promise<Example | undefined> {
    const found = await super.findById(id);
    console.log("      repository.findById ->", found === undefined ? "undefined" : found.name);
    return found;
  }
}

class TracedService extends ExamplesService {
  public override async create(input: CreateExampleInput): Promise<Example> {
    console.log("    service.create");
    return super.create(input);
  }
  public override async get(id: string): Promise<Example> {
    console.log("    service.get");
    return super.get(id);
  }
}

// The composition root, by hand: the same shape as createDependencies().
const deps = {
  health: async () => ({ ready: true, checks: {} }),
  examplesController: new ExamplesController(new TracedService(new TracedRepository())),
};
const router = createRouter();
registerRoutes(router, deps);

const trace: HttpMiddleware = async (context, next) => {
  console.log(`→ ${context.request.method} ${context.request.path}`);
  const response = await next();
  console.log(`← ${response.status}`);
  return response;
};
const dispatch: HttpMiddleware = async (context) => {
  try {
    return (await router.dispatch(context.request, { signal: context.signal })).response;
  } catch (error) {
    console.log("  dispatch caught", (error as Error).name);
    const response = errorResponse(error);
    if (response === undefined) throw error;
    return response;
  }
};

const client = createHttpTestClient(new HttpMiddlewarePipeline({ middlewares: [trace, dispatch] }));
const created = await client.post("/api/v1/examples").send({ name: "Buy milk" });
const { id } = created.json<{ id: string }>();
await client.get(`/api/v1/examples/${id}`);
await client.get("/api/v1/examples/7a1c7a0e-5d7e-4f5b-9c1d-2b3e4f5a6b7c");
await client.post("/api/v1/examples").send({ name: "" });
await client.close();
```

Output of `npx tsx layers-trace.ts`

```ts
→ POST /api/v1/examples
    service.create
      repository.create { name: 'Buy milk' }
← 201
→ GET /api/v1/examples/e72bbff3-326c-4593-8d8b-f5d81b373ce3
    service.get
      repository.findById -> Buy milk
← 200
→ GET /api/v1/examples/7a1c7a0e-5d7e-4f5b-9c1d-2b3e4f5a6b7c
    service.get
      repository.findById -> undefined
  dispatch caught NotFoundError
← 404
→ POST /api/v1/examples
← 400
```

Four requests, four different depths:

- **Create** goes all the way down to the repository and back: 201.
- **Get an existing id** goes down and finds it: 200.
- **Get an unknown id** reaches the repository, which answers `undefined`. The service turns that into a `NotFoundError`, which travels back up *as an exception* past the controller, and `dispatch` catches it: 404.
- **An empty name** never reaches the service. The controller's `safeParse` fails and it answers 400 itself.

That is also the answer to the bug report at the top of the lesson. A note "that does not exist" is a 404, so start at the repository: is `findById` being asked for the id you expect, and does the store still hold it? With the in-memory repository, a restart of the server (every save in `npm run dev`) is enough to lose every note.

> TIP
>
> The trace swaps two layers for printing versions without editing a single generated file. That is the composition root at work: whoever builds the objects decides which implementation each layer gets.

## Errors across the layers

Every failure in a request ends up in one of three places:

| What went wrong | Where it is handled | Answer |
| --- | --- | --- |
| The body or the id does not match the schema | The controller, `validationFailed(issues)` | 400 with the list of issues |
| The body is not JSON | `readJsonBody` throws `badRequest(…)`; `dispatch` catches it | 400 |
| A rule is broken (unknown id, store full) | The service or repository throws a `@zudojs/errors` error; `dispatch` catches it | Its own status: 404, 409 |
| Anything else (a bug, a lost connection) | `errorResponse` returns `undefined`, `dispatch` rethrows, the HTTP server answers | 500, with no details |

`errorResponse` only turns an error into a response when it has a 4xx `statusCode` *and* `expose: true`. Errors from `@zudojs/errors` such as `NotFoundError` set both; a plain `new Error(…)` sets neither. So an unexpected error can never leak its message to a client. Here the last row happens for real, with a repository whose disk is "full":

errors-trace.tsNode.js only

```ts
import { HttpMiddlewarePipeline, createRouter } from "@zudojs/http";
import type { HttpMiddleware } from "@zudojs/http";
import { createHttpTestClient } from "@zudojs/testing";

import { ExamplesController } from "./src/controllers/examples.controller.js";
import type { CreateExampleInput, Example } from "./src/dtos/examples.dto.js";
import { InMemoryExamplesRepository } from "./src/repositories/examples.repository.js";
import { registerExamplesRoutes } from "./src/routes/examples.routes.js";
import { ExamplesService } from "./src/services/examples.service.js";
import { errorResponse } from "./src/utils/http.js";

class BrokenRepository extends InMemoryExamplesRepository {
  public override async create(_input: CreateExampleInput): Promise<Example> {
    throw new Error("disk full at /var/lib/shop/data.db");
  }
}

const router = createRouter();
registerExamplesRoutes(router, new ExamplesController(new ExamplesService(new BrokenRepository())));
const dispatch: HttpMiddleware = async (context) => {
  try {
    return (await router.dispatch(context.request, { signal: context.signal })).response;
  } catch (error) {
    const response = errorResponse(error);
    if (response === undefined) throw error;
    return response;
  }
};
const client = createHttpTestClient(new HttpMiddlewarePipeline({ middlewares: [dispatch] }));
const broken = await client.post("/api/v1/examples").send({ name: "Buy milk" });
console.log(broken.status, broken.text);
const badJson = await client.post("/api/v1/examples").set("content-type", "application/json").send("{name:");
console.log(badJson.status, badJson.text);
const noBody = await client.post("/api/v1/examples");
console.log(noBody.status, noBody.text);
await client.close();
```

Output of `npx tsx errors-trace.ts`

```ts
500 {"error":"Internal Server Error"}
400 {"error":"The request body is not valid JSON.","code":"BAD_REQUEST"}
400 {"error":"Validation failed","issues":[{"path":"","message":"Expected object, received undefined"}]}
```

The client learns nothing about the disk or the file path: good. But look at what is missing. Nothing printed the `disk full` error either. The generated `dispatch` rethrows it, the HTTP server answers 500, and **no log line is written anywhere**. The same happens in the real server: a crashing handler in `npm run dev` leaves the terminal silent while the client gets 500. In production that means errors nobody can see. The first exercise below fixes it.

## Tests and the wiring they miss

The generated test builds its own router with only the example routes:

tests/examples.test.ts

```ts
import { afterAll, describe, it } from "vitest";
import { createRouter } from "@zudojs/http";
import { createHttpTestClient } from "@zudojs/testing";

import { ExamplesController } from "../src/controllers/examples.controller.js";
import { InMemoryExamplesRepository } from "../src/repositories/examples.repository.js";
import { registerExamplesRoutes } from "../src/routes/examples.routes.js";
import { ExamplesService } from "../src/services/examples.service.js";

const router = createRouter();
registerExamplesRoutes(
  router,
  new ExamplesController(new ExamplesService(new InMemoryExamplesRepository())),
);
const client = createHttpTestClient(router);
afterAll(() => client.close());

describe("/api/v1/examples", () => {
  it("creates, reads, updates and deletes an example", async () => {
    const created = await client
      .post("/api/v1/examples")
      .send({ name: "Ada" })
      .expect(201)
      .expectJson({ name: "Ada" });
    const { id } = created.json<{ id: string }>();

    await client.get(`/api/v1/examples/${id}`).expect(200).expectJson({ id, name: "Ada" });
    await client.get("/api/v1/examples").expect(200);
    await client
      .patch(`/api/v1/examples/${id}`)
      .send({ name: "Grace" })
      .expect(200)
      .expectJson({ name: "Grace" });
    await client.delete(`/api/v1/examples/${id}`).expect(204);
    await client.get(`/api/v1/examples/${id}`).expect(404);
  });

  it("rejects an invalid body with 400", async () => {
    await client
      .post("/api/v1/examples")
      .send({ name: "" })
      .expect(400)
      .expectJson({ error: "Validation failed" });
  });

  it("rejects an id that is not a UUID with 400", async () => {
    await client.get("/api/v1/examples/not-a-uuid").expect(400);
  });
});
```

That is a good **unit** test of the resource, but it never calls `registerRoutes` or `createDependencies`. As the [CLI lesson](https://zudojs.oyinlola.site/learn/zudo-cli#wiring) showed, a lost marker leaves those two files without the new resource while this test still passes. A **smoke test** is a quick check that the assembled application answers at all. This one builds the router exactly the way `server.ts` does and requests one path per resource:

smoke.tsNode.js only

```ts
import { createRouter } from "@zudojs/http";
import type { HttpRouter } from "@zudojs/http";
import { createHttpTestClient } from "@zudojs/testing";

import { createDependencies } from "./src/container.js";
import type { AppDependencies } from "./src/container.js";
import { registerRoutes } from "./src/routes/index.js";
import { registerHealthRoutes } from "./src/routes/health.routes.js";

const expected = ["/health", "/api/v1/examples"];

async function smoke(label: string, register: (router: HttpRouter, deps: AppDependencies) => void) {
  const router = createRouter();
  register(router, createDependencies());
  const client = createHttpTestClient(router);
  const results: string[] = [];
  for (const path of expected) results.push(`${path} ${(await client.get(path)).status}`);
  await client.close();
  console.log(label.padEnd(20), results.join(" | "));
}

await smoke("generated wiring", registerRoutes);
await smoke("lost routes marker", (router, deps) => registerHealthRoutes(router, deps.health));
```

Output of `npx tsx smoke.ts`

```ts
generated wiring     /health 200 | /api/v1/examples 200
lost routes marker   /health 200 | /api/v1/examples 404
```

The second line plays the broken case: a `registerRoutes` that lost its example registration. In your project the smoke test lives in `tests/` as a Vitest test, and you add each new resource's path to `expected`. It costs a few milliseconds and catches the one failure the generated tests cannot.

> NOTE
>
> The smoke test calls `createDependencies()` with no arguments, which the generated file allows. In [Routes, requests and responses](https://zudojs.oyinlola.site/learn/zudo-http#task-api), `createDependencies` starts to require the runtime's container, and that lesson shows the one-line change to this test.

## What you own, what the CLI owns

| You may freely change | Change with care | Leave alone |
| --- | --- | --- |
| Controllers, services, repositories, DTOs, your modules, tests, the `health` function in `server.ts` | `server.ts`, `app.ts`, `container.ts`, `routes/index.ts`, `configs/index.ts`: keep your lines outside the markers | The `// zudojs:…` markers, `.zudojs/manifest.json`, the `zudojs` block in `package.json` |

The example resource exists to be copied and then deleted. Removing it means deleting its five source files and its test, and the three lines that mention it between the markers: two imports and the `examplesController` entry in `container.ts`, and the import and the call in `routes/index.ts`. `npm run typecheck` then tells you if anything still refers to it.

## Production concerns

- **Storage.** Every generated repository is in memory. Data disappears on restart, and two copies of the app behind a load balancer each have their own data. Swap in a database repository at the composition root before real users arrive ([the database lesson](https://zudojs.oyinlola.site/learn/zudo-database)).
- **Unlogged 500s.** As shown above, unexpected errors are answered but not logged. Add logging in `dispatch` before going live.
- **Rate limiting is per process.** `createRateLimitMiddleware` counts in memory, so with three copies of the app a client gets three times the limit. A shared store fixes that; the [security lesson](https://zudojs.oyinlola.site/learn/zudo-security) covers it.
- **Health means ready.** `/health` answers 503 while the runtime is not running or an integration is down, which is what a load balancer needs to stop sending traffic.
- **One owner for signals.** `server.ts` handles `SIGINT` and `SIGTERM`, and `app.ts` passes `handleSignals: false` so the runtime does not race it.

## Practice

TRY IT YOURSELF

### Log the errors you answer with 500

Change `dispatch` so an unexpected error is logged with its message before it is rethrown, but a 4xx error is not logged. Try it with the broken repository.

**Show a solution**

log-500.tsNode.js only

```ts
import { HttpMiddlewarePipeline, createRouter } from "@zudojs/http";
import type { HttpMiddleware } from "@zudojs/http";
import { createLogger } from "@zudojs/logger";
import { createHttpTestClient } from "@zudojs/testing";

import { ExamplesController } from "./src/controllers/examples.controller.js";
import type { CreateExampleInput, Example } from "./src/dtos/examples.dto.js";
import { InMemoryExamplesRepository } from "./src/repositories/examples.repository.js";
import { registerExamplesRoutes } from "./src/routes/examples.routes.js";
import { ExamplesService } from "./src/services/examples.service.js";
import { errorResponse } from "./src/utils/http.js";

class BrokenRepository extends InMemoryExamplesRepository {
  public override async create(_input: CreateExampleInput): Promise<Example> {
    throw new Error("disk full at /var/lib/shop/data.db");
  }
}

const logger = createLogger({ name: "task-api" });
const router = createRouter();
registerExamplesRoutes(router, new ExamplesController(new ExamplesService(new BrokenRepository())));

const dispatch: HttpMiddleware = async (context) => {
  try {
    return (await router.dispatch(context.request, { signal: context.signal })).response;
  } catch (error) {
    const response = errorResponse(error);
    if (response !== undefined) return response;
    logger.error(`unhandled error on ${context.request.method} ${context.request.path}: ${(error as Error).message}`);
    throw error;
  }
};

const client = createHttpTestClient(new HttpMiddlewarePipeline({ middlewares: [dispatch] }));
console.log((await client.get("/api/v1/examples/not-a-uuid")).status);
console.log((await client.post("/api/v1/examples").send({ name: "Buy milk" })).status);
await client.close();
```

Output of `npx tsx log-500.ts`

```ts
400
2026-09-24T19:55:52.443Z [ERROR] [task-api] unhandled error on POST /api/v1/examples: disk full at /var/lib/shop/data.db
500
```

The 400 is expected behaviour and stays quiet; the 500 now leaves a line in the log with the method, the path and the real message, which only the operator sees. In `server.ts`, create the logger once at the top, or pass in the runtime's logger.

TRY IT YOURSELF

### Swap a layer at the composition root

Write a repository that refuses to store more than two examples (throwing `ConflictError` from `@zudojs/errors`) and plug it in with the generated controller and service. What does the third `POST` answer, and why did no other layer need to change?

**Show a solution**

small-store.tsNode.js only

```ts
import { ConflictError } from "@zudojs/errors";
import { HttpMiddlewarePipeline, createRouter } from "@zudojs/http";
import type { HttpMiddleware } from "@zudojs/http";
import { createHttpTestClient } from "@zudojs/testing";

import { ExamplesController } from "./src/controllers/examples.controller.js";
import type { CreateExampleInput, Example } from "./src/dtos/examples.dto.js";
import { InMemoryExamplesRepository } from "./src/repositories/examples.repository.js";
import { registerRoutes } from "./src/routes/index.js";
import { ExamplesService } from "./src/services/examples.service.js";
import { errorResponse } from "./src/utils/http.js";

class TwoSlotRepository extends InMemoryExamplesRepository {
  public override async create(input: CreateExampleInput): Promise<Example> {
    if ((await this.findAll()).length >= 2) throw new ConflictError("Only two examples fit in this store.");
    return super.create(input);
  }
}

const router = createRouter();
registerRoutes(router, {
  health: async () => ({ ready: true, checks: {} }),
  examplesController: new ExamplesController(new ExamplesService(new TwoSlotRepository())),
});
const dispatch: HttpMiddleware = async (context) => {
  try {
    return (await router.dispatch(context.request, { signal: context.signal })).response;
  } catch (error) {
    const response = errorResponse(error);
    if (response === undefined) throw error;
    return response;
  }
};
const client = createHttpTestClient(new HttpMiddlewarePipeline({ middlewares: [dispatch] }));
for (const name of ["Buy milk", "Pay rent", "Call Ada"]) {
  const response = await client.post("/api/v1/examples").send({ name });
  console.log(response.status, response.status === 201 ? name : response.text);
}
await client.close();
```

Output of `npx tsx small-store.ts`

```ts
201 Buy milk
201 Pay rent
409 {"error":"Only two examples fit in this store.","code":"ERR_CONFLICT"}
```

The third request gets 409 Conflict. The service calls `repository.create` through the `ExamplesRepository` interface, the error already carries its status, and `errorResponse` turns any exposed 4xx error into a response. Only the composition root changed.

TRY IT YOURSELF

### Where would you look?

For each report, name the first file you would open: (a) the app does not start and says `PORT must be an integer between 0 and 65535`; (b) every response lacks the `x-frame-options` header; (c) `POST /api/v1/examples` accepts a 300-character name; (d) after a restart, all examples are gone.

**Show a solution**

- (a) `src/configs/index.ts`, the `port` function, then your `.env` or environment.
- (b) `src/server.ts`: is `securityHeaders()` still first in the pipeline? Then `src/utils/http.ts`.
- (c) `src/dtos/examples.dto.ts`: the `max(200)` on `CreateExampleSchema`, and whether the controller parses the body with it.
- (d) `src/container.ts`: it builds `InMemoryExamplesRepository`, which keeps data in memory only. That is expected until you swap in a database repository.

## Recap

- `src/server.ts` is the entry point. In order: load settings, create the runtime, build the router from the composition root, assemble the middleware pipeline, start the runtime, start the HTTP server, and handle signals in reverse.
- `src/configs/index.ts` validates the environment into one frozen `AppConfig`; `src/app.ts` builds the runtime with the `integrations` module first.
- `src/container.ts` is the composition root: it creates repository, service and controller once. Swap implementations there.
- A request goes pipeline → router → controller (HTTP and validation) → service (rules) → repository (storage). Validation fails in the controller with 400; rule errors travel up as exceptions and `dispatch` turns exposed 4xx errors into responses; anything else becomes a silent 500 unless you log it.
- The generated tests check a resource on its own router. A smoke test through `registerRoutes` and `createDependencies` checks the wiring.

Next, [The core: applications, modules and context](https://zudojs.oyinlola.site/learn/zudo-core) looks under the runtime with `@zudojs/core`: the module contract `BaseModule` comes from there, and so does the execution context that lets every log line of a request share one id.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
