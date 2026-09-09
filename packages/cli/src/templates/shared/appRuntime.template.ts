/**
 * zudojs-cli — Shared Runtime App Templates
 *
 * Every architecture template assembles the same four framework pieces:
 * a logger, a container, an event bus and a set of modules, handed to
 * `createRuntime(dependencies, options)`.
 *
 * The emitted source is kept here rather than duplicated per architecture
 * so it can be verified against the real `@zudojs/*` packages in one place.
 * `tests/generatedProject.typecheck.test.ts` type-checks the output of every
 * template against `packages/<name>/src/index.ts`, so any drift between these
 * snippets and the framework API fails the CLI test suite.
 */

import { toPascalCase } from "../../utils/utils.name.js";

/** Packages every generated runtime entry point imports from. */
export const RUNTIME_APP_DEPENDENCIES = [
  "@zudojs/core",
  "@zudojs/runtime",
  "@zudojs/container",
  "@zudojs/events",
  "@zudojs/logger",
  "@zudojs/constants",
] as const;

/** A module registered with the runtime by the generated `createApp`. */
export interface RuntimeModuleSpec {
  /** Slug used for the module id, file name and log messages. */
  readonly name: string;
  /** PascalCase class name. */
  readonly className: string;
  /** Import specifier the module class is imported from, relative to app.ts. */
  readonly importPath: string;
}

/** Builds a module spec from a raw name. */
export function moduleSpec(name: string, importPath: string): RuntimeModuleSpec {
  return {
    name,
    className: `${toPascalCase(name)}Module`,
    importPath,
  };
}

/** Emits a string as a TypeScript string literal that cannot break out. */
function literal(value: string): string {
  return JSON.stringify(value);
}

/**
 * Renders `zudojs.config.ts`.
 *
 * The shape matches what the fullstack composer writes and what
 * `zudojs generate` parses to detect the project architecture.
 */
export function renderZudojsConfig(options: {
  readonly projectName: string;
  readonly projectType: string;
  readonly architecture: string;
}): string {
  return `/**
 * Zudojs project configuration.
 *
 * Read by the \`zudojs\` CLI to detect this project's architecture.
 */

export default {
  name: ${literal(options.projectName)},
  projectType: ${literal(options.projectType)},
  architecture: ${literal(options.architecture)},
};
`;
}

/**
 * Renders `src/app.ts`: assembles the runtime dependencies and returns a
 * started-on-demand `Runtime`.
 */
export function renderAppFile(options: {
  readonly applicationName: string;
  readonly modules: readonly RuntimeModuleSpec[];
  /**
   * Port this app is deployed on. Recorded as runtime metadata so the value
   * in docker-compose.yml and the Dockerfile is also visible from the app.
   */
  readonly port?: number;
}): string {
  const imports = [...options.modules]
    .map((m) => `import { ${m.className} } from ${literal(m.importPath)};`)
    .join("\n");

  // An empty array literal would make the loop variable `never`, so the
  // registration loop is only emitted when there is at least one module.
  const registration =
    options.modules.length > 0
      ? `  for (const module of [
${options.modules.map((m) => `    new ${m.className}(),`).join("\n")}
  ]) {
    modules.set(module.id, module);
  }
`
      : "";

  const metadata =
    options.port === undefined
      ? ""
      : `\n      metadata: { port: ${options.port} },`;

  return `import type { Environment } from "@zudojs/constants";
import { createContainer } from "@zudojs/container";
import type { Module } from "@zudojs/core";
import { createEventBus } from "@zudojs/events";
import { createLogger } from "@zudojs/logger";
import { createRuntime, type Runtime } from "@zudojs/runtime";
${imports}

const ENVIRONMENTS: readonly Environment[] = [
  "development",
  "test",
  "staging",
  "production",
];

/** Narrows NODE_ENV to a framework Environment without an unchecked cast. */
function resolveEnvironment(): Environment {
  const value = process.env["NODE_ENV"];
  return ENVIRONMENTS.find((candidate) => candidate === value) ?? "development";
}

/**
 * Assembles the application runtime.
 *
 * \`createRuntime\` takes two arguments: the dependencies the runtime and its
 * modules share, and the options describing this application.
 */
export function createApp(): Runtime {
  const logger = createLogger({ name: ${literal(options.applicationName)} });
  const container = createContainer();
  const eventBus = createEventBus();

  const modules = new Map<string, Module>();
${registration}
  const runtime = createRuntime(
    { modules, logger, container, eventBus },
    {
      applicationName: ${literal(options.applicationName)},
      applicationVersion: "0.1.0",
      environment: resolveEnvironment(),
      // Signals are handled explicitly in server.ts.
      handleSignals: false,${metadata}
    },
  );

  runtime.registerReadinessCheck("modules", () => runtime.state === "running");

  return runtime;
}
`;
}

/**
 * Renders `src/server.ts`: the process entry point. Starts the runtime and
 * stops it cleanly on SIGINT/SIGTERM.
 */
export function renderServerFile(appImportPath = "./app.js"): string {
  return `import { createApp } from ${literal(appImportPath)};

const runtime = createApp();

await runtime.start();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void runtime
      .stop()
      .then(() => {
        process.exit(0);
      })
      .catch((error: unknown) => {
        console.error(error);
        process.exit(1);
      });
  });
}
`;
}

/**
 * Renders a module class extending `BaseModule`.
 *
 * `BaseModule`'s constructor is protected, so the generated class declares a
 * public constructor — without one the class cannot be instantiated.
 */
export function renderModuleFile(options: {
  readonly module: RuntimeModuleSpec;
  readonly service?: {
    readonly className: string;
    readonly importPath: string;
  };
}): string {
  const { module, service } = options;

  const serviceImport = service
    ? `import { ${service.className} } from ${literal(service.importPath)};\n`
    : "";

  const serviceField = service
    ? `  private readonly service = new ${service.className}();\n\n`
    : "";

  const serviceInit = service ? "    await this.service.initialize();\n" : "";

  return `import { BaseModule, type ModuleContext } from "@zudojs/core";
${serviceImport}
/**
 * ${module.name} module.
 *
 * Registered with the runtime in app.ts. The runtime calls onInitialize
 * during start and onShutdown during stop.
 */
export class ${module.className} extends BaseModule {
  public readonly id = ${literal(module.name)};
  public readonly name = ${literal(module.name)};

${serviceField}  public constructor() {
    super({ version: "0.1.0" });
  }

  public override async onInitialize(context: ModuleContext): Promise<void> {
${serviceInit}    context.logger.info(${literal(`${module.name} module initialized`)});
  }

  public override async onShutdown(context: ModuleContext): Promise<void> {
    context.logger.info(${literal(`${module.name} module stopped`)});
  }
}
`;
}

/** Renders a service class using the real `createLogger` factory. */
export function renderServiceFile(name: string): string {
  const className = `${toPascalCase(name)}Service`;

  return `import { createLogger } from "@zudojs/logger";

export class ${className} {
  private readonly logger = createLogger({ name: ${literal(`${name}-service`)} });

  public async initialize(): Promise<void> {
    this.logger.info(${literal(`${name} service initialized`)});
  }
}
`;
}
