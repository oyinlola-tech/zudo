/**
 * zudojs-cli — Running a resource-family schematic for `zudojs generate`.
 */

import { join } from "node:path";

import type { CLIContext } from "../../cliType/cliType.type.js";
import { describeError } from "../../commands/commandError.helper.js";
import { CLIGenerationError, CLIValidationError } from "../../errors/index.js";
import { detectPackageManager } from "../../resolvers/layout/projectLayout.core.js";
import type { PackageManager } from "../../types/index.js";
import { execCommand } from "../../utils/utils.exec.js";
import { generateResource } from "./resource.generator.js";
import { resolveResourceLayout } from "./resource.layout.js";
import type { ResourceSchematic } from "./resource.plan.js";
import {
  describeAddedDependencies,
  ensureZudojsDependencies,
  fileCount,
} from "../../wiring/index.js";

/** Runs `file args` in `cwd`; `execCommand` unless a test injects one. */
export type ResourceExec = (file: string, args: readonly string[], cwd: string) => Promise<unknown>;

/** Inputs of {@link runResourceSchematic}. */
export interface ResourceSchematicRun {
  readonly schematic: ResourceSchematic;
  readonly name: string;
  readonly cwd: string;
  /** `""` or `"apps/api"` (fullstack). */
  readonly backendRoot: string;
  readonly architecture: string | undefined;
  /** Runs `prisma generate` after a model is added; detected from lock files when omitted. */
  readonly packageManager?: PackageManager;
  readonly service?: string;
  readonly moduleName?: string;
  readonly dryRun: boolean;
  readonly force: boolean;
  readonly exec?: ResourceExec;
}

/** `<pm> exec prisma generate`, spelled the way each package manager wants it. */
export function prismaGenerateCommand(packageManager: PackageManager): readonly [string, ...string[]] {
  switch (packageManager) {
    case "npm":
      return ["npx", "prisma", "generate"];
    case "yarn":
      return ["yarn", "prisma", "generate"];
    case "bun":
      return ["bun", "run", "prisma", "generate"];
    case "pnpm":
    default:
      return ["pnpm", "exec", "prisma", "generate"];
  }
}

/**
 * Runs a resource-family schematic: writes the DTO → repository → service
 * → controller → routes chain it needs and registers the routes and the
 * controller between the project's markers. When a model was appended to
 * `prisma/schema.prisma`, runs `prisma generate` so the new Prisma-backed
 * repository compiles at once (`prisma migrate dev` no longer regenerates
 * the client); when that fails — nothing installed yet — it says what to run.
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
      { name: run.name, schematic: run.schematic, layout, dryRun: run.dryRun, force: run.force },
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

  if (!run.dryRun && result.prismaSchema !== undefined) {
    const [file, ...args] = prismaGenerateCommand(run.packageManager ?? detectPackageManager(run.cwd));
    const command = [file, ...args].join(" ");
    try {
      await (run.exec ?? execCommand)(file, args, join(run.cwd, layout.appRoot));
      context.logger.info(`Ran "${command}" for the model added to ${result.prismaSchema}.`);
    } catch (error) {
      context.logger.warn(
        `Could not run "${command}" (${describeError(error)}). Run it after installing dependencies; until then the Prisma repository does not type-check.`,
      );
    }
  }

  if (result.manualSteps.length > 0) {
    context.logger.warn(
      `Finish by hand:\n${result.manualSteps.map((step) => `  - ${step}`).join("\n")}`,
    );
  }
}
