/**
 * zudojs-cli — Build Command
 *
 * The `zudojs build` command for building Zudojs projects.
 */

import type { CLIContext } from "../cliType/cliType.type.js";
import { runStreaming } from "../utils/utils.exec.js";
import { findProjectRoot } from "../resolvers/project.resolver.js";
import {
  detectPackageManager,
  resolveProjectLayout,
} from "../resolvers/layout/projectLayout.core.js";
import type { PackageManager } from "../types/index.js";
import { CLIGenerationError, CLINotInProjectError } from "../errors/index.js";

export async function runBuildCommand(context: CLIContext): Promise<void> {
  const projectRoot = findProjectRoot(context.cwd);

  if (!projectRoot) {
    // Throwing (rather than returning) is what gives the process a non-zero
    // exit code; CI must not see a green build for a missing project.
    throw new CLINotInProjectError();
  }

  context.logger.info(`Building project at: ${projectRoot}`);

  const layout = resolveProjectLayout(projectRoot);
  const packageManager =
    layout?.packageManager ?? detectPackageManager(projectRoot);
  const buildArgs = getBuildArgs(
    packageManager,
    layout?.isWorkspace ?? false,
  );

  try {
    await runStreaming(packageManager, buildArgs, projectRoot);
    context.logger.info("Build completed successfully.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A failed build must fail the command so CI does not report success.
    throw new CLIGenerationError(`Build failed: ${message}`, error);
  }
}

/**
 * Arguments that run the `build` script.
 *
 * pnpm's `-r` is only meaningful in a workspace; a single-package project's
 * root `build` script is the whole build.
 */
export function getBuildArgs(
  packageManager: PackageManager,
  isWorkspace: boolean,
): string[] {
  switch (packageManager) {
    case "pnpm":
      return isWorkspace ? ["-r", "run", "build"] : ["run", "build"];
    case "yarn":
      // Plain `yarn run build` works on both Yarn classic and Berry without
      // requiring the workspace-tools plugin.
      return ["run", "build"];
    case "bun":
      return ["run", "build"];
    default:
      return ["run", "build"];
  }
}
