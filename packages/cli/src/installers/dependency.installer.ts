import type { PackageManager } from "../types/index.js";
import { runStreaming } from "../utils/utils.exec.js";

export function getInstallCommand(
  packageManager: PackageManager,
): [string, ...string[]] {
  switch (packageManager) {
    case "pnpm":
      return ["pnpm", "install"];
    case "npm":
      return ["npm", "install"];
    case "yarn":
      return ["yarn", "install"];
    case "bun":
      return ["bun", "install"];
    default:
      return ["pnpm", "install"];
  }
}

export function getAddCommand(
  packageManager: PackageManager,
  pkg: string,
): [string, ...string[]] {
  switch (packageManager) {
    case "pnpm":
      return ["pnpm", "add", pkg];
    case "npm":
      return ["npm", "install", pkg];
    case "yarn":
      return ["yarn", "add", pkg];
    case "bun":
      return ["bun", "add", pkg];
    default:
      return ["pnpm", "add", pkg];
  }
}

export async function installDependencies(
  packageManager: PackageManager,
  cwd: string,
): Promise<void> {
  const [file, ...args] = getInstallCommand(packageManager);
  await runStreaming(file, args, cwd);
}
