/**
 * zudojs-cli — Build Command
 *
 * The `zudojs build` command for building Zudojs projects.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CLIContext } from "../cliType/cliType.type.js";
import { runStreaming } from "../utils/utils.exec.js";
import { findProjectRoot } from "../resolvers/project.resolver.js";

export async function runBuildCommand(context: CLIContext): Promise<void> {
  const projectRoot = findProjectRoot(context.cwd);

  if (!projectRoot) {
    context.logger.error(
      "No Zudojs project found. Run this command from a Zudojs project directory.",
    );
    return;
  }

  context.logger.info(`Building project at: ${projectRoot}`);

  const packageManager = detectPackageManager(projectRoot);
  const buildArgs = getBuildArgs(packageManager);

  try {
    await runStreaming(packageManager, buildArgs, projectRoot);
    context.logger.info("Build completed successfully.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.logger.error(`Build failed: ${message}`);
  }
}

function detectPackageManager(cwd: string): string {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(join(cwd, "package-lock.json"))) return "npm";
  if (existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb")))
    return "bun";
  return "npm";
}

function getBuildArgs(packageManager: string): string[] {
  switch (packageManager) {
    case "pnpm":
      return ["-r", "run", "build"];
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
