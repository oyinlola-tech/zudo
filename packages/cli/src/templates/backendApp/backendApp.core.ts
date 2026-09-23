/**
 * zudojs-cli — The source tree of one backend app.
 *
 * Monolith, modular monolith and every microservice app (gateway and
 * services) share this layout, so `generate` and `add` work the same way
 * in all of them:
 *
 * ```
 * src/app.ts                 runtime assembly (modules + integrations)
 * src/server.ts              config → router → registerRoutes → HTTP server
 * src/container.ts           composition root (controllers, services, repositories)
 * src/configs/index.ts       typed configuration from the environment
 * src/routes/index.ts        registerRoutes(router, deps)
 * src/routes/health.routes.ts
 * src/integrations/          lifecycle-managed clients (zudojs add)
 * src/utils/http.ts          response and body helpers, security headers
 * src/{dtos,repositories,services,controllers,routes}/examples.*  example resource
 * tests/examples.test.ts     HTTP test through createHttpTestClient
 * ```
 */

import {
  renderAppFile,
  renderServerFile,
  type RuntimeModuleSpec,
} from "../shared/index.js";
import {
  renderResourceLayers,
  resourceNames,
  resourceWiring,
  RESOURCE_LAYERS,
  type ResourceLayout,
} from "../resource/index.js";
import {
  baseEnvVariables,
  renderConfigFile,
  renderContainer,
  renderEnvVariables,
  renderHealthRoutes,
  renderHttpUtils,
  renderIntegrationContract,
  renderIntegrationsIndex,
  renderModuleRoutesIndex,
  renderRoutesIndex,
} from "./parts/index.js";
import { moduleRoutesWiring } from "./backendApp.modules.js";

/** Options for {@link renderBackendAppSource}. */
export interface BackendAppOptions {
  /** Runtime and logger name. */
  readonly applicationName: string;
  /** OpenAPI document title. */
  readonly title: string;
  readonly defaultPort: number;
  /** Mount /openapi.json and /docs. */
  readonly openapi: boolean;
  /** Runtime modules registered in app.ts. */
  readonly modules: readonly RuntimeModuleSpec[];
  /** Modules whose `routes/index.ts` is generated and registered. */
  readonly routedModules?: readonly string[];
  /** Port recorded as runtime metadata (microservice apps). */
  readonly port?: number;
}

/** The example resource every new app ships with. */
export const EXAMPLE_RESOURCE = "examples";

/**
 * Renders the app's files, keyed by path relative to the app root. The
 * caller adds package.json, tsconfig.json and the empty folder barrels.
 */
export function renderBackendAppSource(options: BackendAppOptions): Record<string, string> {
  const names = resourceNames(EXAMPLE_RESOURCE);
  const layout: ResourceLayout = { base: "src", appSrc: "src", appRoot: "", prisma: false };
  const example = resourceWiring(names, layout);
  const modules = (options.routedModules ?? []).map(moduleRoutesWiring);

  const files: Record<string, string> = {
    "src/index.ts": `export { createApp } from "./app.js";\n`,
    "src/app.ts": renderAppFile({
      applicationName: options.applicationName,
      modules: options.modules,
      ...(options.port === undefined ? {} : { port: options.port }),
    }),
    "src/server.ts": renderServerFile({ title: options.title, openapi: options.openapi }),
    "src/configs/index.ts": renderConfigFile({ defaultPort: options.defaultPort, sections: [] }),
    "src/container.ts": renderContainer({
      imports: example.containerImports,
      entries: [example.containerEntry],
    }),
    "src/routes/index.ts": renderRoutesIndex({
      imports: [example.routeImport, ...modules.map((m) => m.importLine)],
      entries: [example.routeEntry, ...modules.map((m) => m.entryLine)],
    }),
    "src/routes/health.routes.ts": renderHealthRoutes(),
    "src/integrations/index.ts": renderIntegrationsIndex({ imports: [], entries: [] }),
    "src/integrations/integration.ts": renderIntegrationContract(),
    "src/utils/http.ts": renderHttpUtils(),
    "src/utils/index.ts": `export * from "./http.js";\n`,
    ".env.example": `${renderEnvVariables(baseEnvVariables(options.defaultPort))}\n`,
    ...renderResourceLayers(names, layout, RESOURCE_LAYERS),
  };

  for (const module of modules) {
    files[module.indexPath] = renderModuleRoutesIndex(module.functionName, "../../../container.js");
  }

  return files;
}
