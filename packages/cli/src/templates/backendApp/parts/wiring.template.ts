/**
 * zudojs-cli — Generated route registration and composition root.
 *
 * - `src/routes/index.ts` exports `registerRoutes(router, deps)`: /health
 *   plus every resource (and module) between the `routes` markers.
 * - `src/modules/<name>/routes/index.ts` does the same for one module.
 * - `src/container.ts` constructs every controller, service and repository
 *   in one place, between the `container` markers.
 */

import { MARKERS, renderMarkerBlock } from "../../../wiring/index.js";

/** Lines a template pre-fills between a pair of markers. */
export interface MarkerLines {
  readonly imports: readonly string[];
  readonly entries: readonly string[];
}

/** Renders `src/routes/index.ts`. */
export function renderRoutesIndex(lines: MarkerLines): string {
  return `import type { HttpRouter } from "@zudojs/http";

import type { AppDependencies } from "../container.js";
import { registerHealthRoutes } from "./health.routes.js";
${renderMarkerBlock(MARKERS.routeImports, lines.imports)}

/**
 * Registers every route of the application. \`zudojs generate resource\`
 * and \`zudojs generate module\` add their registrations between the markers.
 */
export function registerRoutes(router: HttpRouter, deps: AppDependencies): void {
  registerHealthRoutes(router, deps.health);
${renderMarkerBlock(MARKERS.routes, lines.entries, "  ")}
}
`;
}

/**
 * Renders `routes/index.ts` of a module: `register<Module>ModuleRoutes`.
 * `containerFromHere` is the import path of `container.js`.
 */
export function renderModuleRoutesIndex(
  functionName: string,
  containerFromHere: string,
  lines: MarkerLines = { imports: [], entries: [] },
): string {
  return `import type { HttpRouter } from "@zudojs/http";

import type { AppDependencies } from "${containerFromHere}";
${renderMarkerBlock(MARKERS.routeImports, lines.imports)}

/** Registers this module's routes; called from the app's routes/index.ts. */
export function ${functionName}(router: HttpRouter, deps: AppDependencies): void {
  void deps;
${renderMarkerBlock(MARKERS.routes, lines.entries, "  ")}
}
`;
}

/** Renders `src/routes/health.routes.ts`. */
export function renderHealthRoutes(): string {
  return `import type { HttpRouter } from "@zudojs/http";

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
`;
}

/** Renders `src/container.ts`. */
export function renderContainer(lines: MarkerLines): string {
  return `import type { HealthCheck } from "./routes/health.routes.js";
${renderMarkerBlock(MARKERS.containerImports, lines.imports)}

/** Options for {@link createDependencies}. */
export interface DependencyOptions {
  /** Readiness for /health; server.ts passes the runtime's. */
  readonly health?: HealthCheck;
}

/**
 * The composition root: every controller, service and repository is
 * constructed here, once. \`zudojs generate resource\` adds entries between
 * the markers; swap an implementation (e.g. a database repository) here.
 */
export function createDependencies(options: DependencyOptions = {}) {
  const health: HealthCheck =
    options.health ?? (async () => ({ ready: true, checks: {} }));

  return {
    health,
${renderMarkerBlock(MARKERS.container, lines.entries, "    ")}
  };
}

/** Everything route registration receives. */
export type AppDependencies = ReturnType<typeof createDependencies>;
`;
}
