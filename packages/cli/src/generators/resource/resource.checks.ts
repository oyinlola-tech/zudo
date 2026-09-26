/**
 * zudojs-cli — What must hold before a resource schematic writes anything.
 *
 * Every check runs before the first file is written, so a refused run
 * leaves the project exactly as it was: the schematic's own files must not
 * exist (unless `--force`), the container key and the routes import must be
 * free, and — when the schematic registers itself — the marker pairs it
 * inserts into must be present. A missing marker used to be a warning
 * printed after the files were written and the run had "succeeded", with
 * the unregistered routes answering 404.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CLIValidationError } from "../../errors/index.js";
import {
  resourceLayerPaths,
  type ResourceLayout,
  type ResourceNames,
  type ResourceWiring,
} from "../../templates/resource/index.js";
import { conflictingImport, planMarkerEdits, type MarkerEdit } from "../../wiring/index.js";
import type { ResourcePlan, ResourceSchematic } from "./resource.plan.js";

/** Inputs of {@link assertResourceWritable}. */
export interface ResourceCheckInput {
  readonly cwd: string;
  readonly schematic: ResourceSchematic;
  readonly names: ResourceNames;
  readonly layout: ResourceLayout;
  readonly plan: ResourcePlan;
  readonly wiring: ResourceWiring;
  readonly edits: readonly MarkerEdit[];
  readonly force: boolean;
}

/**
 * Throws a {@link CLIValidationError} when the schematic cannot be written
 * cleanly; returns the schematic's own files that already exist (empty
 * unless `force`).
 */
export function assertResourceWritable(input: ResourceCheckInput): readonly string[] {
  const { cwd, schematic, names, layout, plan, wiring } = input;
  const exists = (path: string): boolean => existsSync(join(cwd, path));

  const taken = plan.primary
    .flatMap((layer) => resourceLayerPaths(names, layout, layer))
    .filter(exists);
  if (taken.length > 0 && !input.force) {
    throw new CLIValidationError(
      `${schematic} "${names.slug}" already exists:\n${taken
        .map((path) => `  - ${path}`)
        .join("\n")}\nChoose another name, or re-run with --force to regenerate these files.`,
    );
  }

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
      `${wiring.routesIndex} already imports the routes function ${schematic} "${names.slug}" would register (${clash.trim()}). Choose another name.`,
    );
  }

  const { manualSteps } = planMarkerEdits(cwd, input.edits).outcome;
  if (manualSteps.length > 0) {
    throw new CLIValidationError(
      `Cannot register ${schematic} "${names.slug}": the files it registers into are missing their markers, so nothing was written.\n${manualSteps
        .map((step) => `  - ${step}`)
        .join("\n")}\nRestore the marker comments (or add the lines by hand and re-run with --force once the files exist).`,
    );
  }

  return taken;
}
