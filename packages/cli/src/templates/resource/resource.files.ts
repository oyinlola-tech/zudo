/**
 * zudojs-cli — The files and registrations of one resource.
 *
 * Shared by `zudojs create` (the example resource every new app ships
 * with) and `zudojs generate resource|route|controller|repository|dto`, so
 * a generated resource and the scaffolded one are identical.
 */

import { posix } from "node:path";

import {
  renderPrismaRepository,
  renderResourceController,
  renderResourceDto,
  renderResourceRepository,
  renderResourceRoutes,
  renderResourceService,
  renderResourceTest,
} from "./layers/index.js";
import type { ResourceNames } from "./resource.names.js";
import { joinPath, toAppSrc, type ResourceLayout } from "./resource.type.js";

/** A resource layer; each is one file (the repository may add a second). */
export type ResourceLayer =
  | "dto"
  | "repository"
  | "service"
  | "controller"
  | "routes"
  | "test";

/** Layers in dependency order: each needs the ones before it. */
export const RESOURCE_LAYERS: readonly ResourceLayer[] = [
  "dto",
  "repository",
  "service",
  "controller",
  "routes",
  "test",
];

/** Path of each layer's file(s), relative to the project root. */
export function resourceLayerPaths(
  n: ResourceNames,
  layout: ResourceLayout,
  layer: ResourceLayer,
): readonly string[] {
  switch (layer) {
    case "dto":
      return [joinPath(layout.base, "dtos", `${n.slug}.dto.ts`)];
    case "repository":
      return [
        joinPath(layout.base, "repositories", `${n.slug}.repository.ts`),
        ...(layout.prisma
          ? [joinPath(layout.base, "repositories", `${n.slug}.prisma.repository.ts`)]
          : []),
      ];
    case "service":
      return [joinPath(layout.base, "services", `${n.slug}.service.ts`)];
    case "controller":
      return [joinPath(layout.base, "controllers", `${n.slug}.controller.ts`)];
    case "routes":
      return [joinPath(layout.base, "routes", `${n.slug}.routes.ts`)];
    case "test":
      // A module resource's test sits under tests/modules/<module>/, so two
      // modules can each have a resource of the same name.
      return [
        joinPath(layout.appRoot, "tests", posix.relative(layout.appSrc, layout.base), `${n.slug}.test.ts`),
      ];
  }
}

/** Renders `layers` of a resource as `{ path: content }`. */
export function renderResourceLayers(
  n: ResourceNames,
  layout: ResourceLayout,
  layers: readonly ResourceLayer[],
): Record<string, string> {
  const files: Record<string, string> = {};
  for (const layer of layers) {
    const [path, second] = resourceLayerPaths(n, layout, layer);
    if (path === undefined) continue;
    switch (layer) {
      case "dto":
        files[path] = renderResourceDto(n);
        break;
      case "repository":
        files[path] = renderResourceRepository(n);
        if (second !== undefined) {
          files[second] = renderPrismaRepository(n, toAppSrc(layout, "repositories"));
        }
        break;
      case "service":
        files[path] = renderResourceService(n);
        break;
      case "controller":
        files[path] = renderResourceController(n, toAppSrc(layout, "controllers"));
        break;
      case "routes":
        files[path] = renderResourceRoutes(n);
        break;
      case "test":
        files[path] = renderResourceTest(n, posix.relative(posix.dirname(path), layout.base));
        break;
    }
  }
  return files;
}

/** The lines that register a resource in routes and the container. */
export interface ResourceWiring {
  /** routes/index.ts next to the resource's routes file. */
  readonly routesIndex: string;
  readonly routeImport: string;
  readonly routeEntry: string;
  /** The app's src/container.ts. */
  readonly container: string;
  readonly containerImports: readonly string[];
  readonly containerEntry: string;
  /** The key the controller is stored under in the container. */
  readonly containerKey: string;
}

/** Describes how a resource is registered (see {@link ResourceWiring}). */
export function resourceWiring(n: ResourceNames, layout: ResourceLayout): ResourceWiring {
  const fromSrc = posix.relative(layout.appSrc, layout.base);
  const prefix = fromSrc === "" ? "." : `./${fromSrc}`;
  const repository = layout.prisma
    ? { name: `Prisma${n.pascal}Repository`, file: `${n.slug}.prisma.repository.js` }
    : { name: `InMemory${n.pascal}Repository`, file: `${n.slug}.repository.js` };
  const key = `${n.camel}Controller`;

  return {
    routesIndex: joinPath(layout.base, "routes", "index.ts"),
    routeImport: `import { register${n.pascal}Routes } from "./${n.slug}.routes.js";`,
    routeEntry: `register${n.pascal}Routes(router, deps.${key});`,
    container: joinPath(layout.appSrc, "container.ts"),
    containerImports: [
      `import { ${n.pascal}Controller } from "${prefix}/controllers/${n.slug}.controller.js";`,
      `import { ${repository.name} } from "${prefix}/repositories/${repository.file}";`,
      `import { ${n.pascal}Service } from "${prefix}/services/${n.slug}.service.js";`,
    ],
    containerEntry: `${key}: new ${n.pascal}Controller(new ${n.pascal}Service(new ${repository.name}())),`,
    containerKey: key,
  };
}
