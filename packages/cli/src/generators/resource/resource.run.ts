/**
 * zudojs-cli — Running a resource-family schematic for `zudojs generate`.
 */

import type { CLIContext } from "../../cliType/cliType.type.js";
import { describeError } from "../../commands/commandError.helper.js";
import { CLIGenerationError, CLIValidationError } from "../../errors/index.js";
import { generateResource } from "./resource.generator.js";
import { resolveResourceLayout } from "./resource.layout.js";
import type { ResourceSchematic } from "./resource.plan.js";
import {
  describeAddedDependencies,
  ensureZudojsDependencies,
  fileCount,
} from "../../wiring/index.js";

/** Inputs of {@link runResourceSchematic}. */
export interface ResourceSchematicRun {
  readonly schematic: ResourceSchematic;
  readonly name: string;
  readonly cwd: string;
  /** `""` or `"apps/api"` (fullstack). */
  readonly backendRoot: string;
  readonly architecture: string | undefined;
  readonly service?: string;
  readonly moduleName?: string;
  readonly dryRun: boolean;
  readonly force: boolean;
}

/**
 * Runs a resource-family schematic: writes the DTO → repository → service
 * → controller → routes chain it needs and registers the routes and the
 * controller between the project's markers.
 */
export async function runResourceSchematic(
  context: CLIContext,
  run: ResourceSchematicRun,
): Promise<void> {
  const layout = resolveResourceLayout({
    cwd: run.cwd,
    architecture: run.architecture,
    backendRoot: run.backendRoot,
    ...(run.service !== undefined ? { service: run.service } : {}),
    ...(run.moduleName !== undefined ? { module: run.moduleName } : {}),
  });

  let result;
  try {
    result = await generateResource(
      {
        name: run.name,
        schematic: run.schematic,
        layout,
        dryRun: run.dryRun,
        force: run.force,
      },
      run.cwd,
    );
  } catch (error) {
    if (error instanceof CLIValidationError) throw error;
    throw new CLIGenerationError(
      `Failed to generate ${run.schematic} "${run.name}": ${describeError(error)}`,
      error,
    );
  }

  context.logger.info(
    run.dryRun
      ? `Dry run: ${fileCount(result.files.length)} would be written or updated (nothing written):`
      : `Generated ${fileCount(result.files.length)}:`,
  );
  for (const file of result.files) {
    context.logger.info(`  - ${file}`);
  }
  if (!run.dryRun) {
    for (const line of describeAddedDependencies(ensureZudojsDependencies(run.cwd, result.files))) {
      context.logger.warn(line);
    }
  }
  if (result.manualSteps.length > 0) {
    context.logger.warn(
      `Finish by hand:\n${result.manualSteps.map((step) => `  - ${step}`).join("\n")}`,
    );
  }
}
