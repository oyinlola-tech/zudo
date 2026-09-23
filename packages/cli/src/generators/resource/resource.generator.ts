/**
 * zudojs-cli — Resource generator.
 *
 * Writes the files of a resource-family schematic (see `resource.plan.ts`)
 * and wires them: the routes are registered between the markers of the
 * nearest `routes/index.ts`, and the controller is constructed once, in the
 * app's `src/container.ts`. Running it twice for the same name fails with
 * the files that already exist; it never duplicates a registration.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CLIValidationError } from "../../errors/index.js";
import { renderHttpUtils } from "../../templates/backendApp/index.js";
import {
  hasPrismaModel,
  joinPath,
  renderPrismaModel,
  renderResourceLayers,
  resourceLayerPaths,
  resourceNames,
  resourceWiring,
  type ResourceLayout,
} from "../../templates/resource/index.js";
import { writeFileTree } from "../../utils/utils.fileSystem.js";
import {
  MARKERS,
  applyMarkerEdits,
  conflictingImport,
  type MarkerEdit,
} from "../../wiring/index.js";
import { planResource, type ResourceSchematic } from "./resource.plan.js";

/** Options for {@link generateResource}. */
export interface GenerateResourceOptions {
  readonly name: string;
  readonly schematic: ResourceSchematic;
  readonly layout: ResourceLayout;
  readonly dryRun?: boolean;
  /** Overwrite the schematic's own files when they exist. */
  readonly force?: boolean;
}

/** What {@link generateResource} wrote and what is left to do by hand. */
export interface ResourceGenerationResult {
  readonly files: readonly string[];
  readonly manualSteps: readonly string[];
}

export async function generateResource(
  options: GenerateResourceOptions,
  cwd: string,
): Promise<ResourceGenerationResult> {
  const names = resourceNames(options.name);
  const { layout } = options;
  const plan = planResource(options.schematic);
  const exists = (path: string): boolean => existsSync(join(cwd, path));

  const primaryPaths = plan.primary.flatMap((layer) => resourceLayerPaths(names, layout, layer));
  const taken = primaryPaths.filter(exists);
  if (taken.length > 0 && options.force !== true) {
    throw new CLIValidationError(
      `${options.schematic} "${names.slug}" already exists:\n${taken
        .map((path) => `  - ${path}`)
        .join("\n")}\nChoose another name, or re-run with --force to regenerate these files.`,
    );
  }

  const wiring = resourceWiring(names, layout);
  if (plan.register && exists(wiring.container)) {
    const container = readFileSync(join(cwd, wiring.container), "utf-8");
    if (container.includes(`${wiring.containerKey}:`) && taken.length === 0) {
      throw new CLIValidationError(
        `${wiring.container} already constructs "${wiring.containerKey}" (a resource named "${names.slug}" exists elsewhere in this app). Choose another name.`,
      );
    }
  }

  const clash = plan.register
    ? conflictingImport(cwd, wiring.routesIndex, wiring.routeImport)
    : undefined;
  if (clash !== undefined) {
    throw new CLIValidationError(
      `${wiring.routesIndex} already imports the routes function ${options.schematic} "${names.slug}" would register (${clash.trim()}). Choose another name.`,
    );
  }

  const missingRequired = plan.required.filter((layer) =>
    resourceLayerPaths(names, layout, layer).some((path) => !exists(path)),
  );
  const files: Record<string, string> = renderResourceLayers(names, layout, [
    ...missingRequired,
    ...plan.primary,
  ]);

  // Older projects have no src/utils/http.ts, which controllers import.
  const httpUtils = joinPath(layout.appSrc, "utils", "http.ts");
  if (
    (plan.primary.includes("controller") || missingRequired.includes("controller")) &&
    !exists(httpUtils)
  ) {
    files[httpUtils] = renderHttpUtils();
  }

  const writesRepository =
    plan.primary.includes("repository") || missingRequired.includes("repository");
  const schemaPath = joinPath(layout.appRoot, "prisma", "schema.prisma");
  if (layout.prisma && writesRepository && exists(schemaPath)) {
    const schema = readFileSync(join(cwd, schemaPath), "utf-8");
    if (!hasPrismaModel(schema, names.entity)) {
      files[schemaPath] = `${schema.replace(/\n*$/, "\n")}${renderPrismaModel(names)}`;
    }
  }

  const edits: MarkerEdit[] = plan.register
    ? [
        { file: wiring.routesIndex, marker: MARKERS.routeImports, line: wiring.routeImport },
        { file: wiring.routesIndex, marker: MARKERS.routes, line: wiring.routeEntry },
        ...wiring.containerImports.map((line) => ({
          file: wiring.container,
          marker: MARKERS.containerImports,
          line,
        })),
        { file: wiring.container, marker: MARKERS.container, line: wiring.containerEntry },
      ]
    : [];

  if (!options.dryRun) {
    await writeFileTree(cwd, files);
  }
  const outcome = await applyMarkerEdits(cwd, edits, options.dryRun === true);

  const manualSteps = [...outcome.manualSteps];
  if (layout.prisma && writesRepository) {
    manualSteps.push(
      `Run "prisma migrate dev --name add-${names.slug}" (the ${names.entity} model was added to ${schemaPath}).`,
    );
  }

  return {
    files: [...Object.keys(files), ...outcome.edited],
    manualSteps,
  };
}
