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

/**
 * The command that runs a `package.json` script with the given manager.
 *
 * Generated projects declare their dev/build tooling (`tsx`, `vite`, `ng`)
 * as devDependencies, so the binaries live in `node_modules/.bin` and are
 * not on the user's PATH. Running the script through the package manager is
 * what puts them there.
 */
export function getRunScriptCommand(
  packageManager: PackageManager,
  script: string,
): [string, ...string[]] {
  switch (packageManager) {
    case "npm":
      return ["npm", "run", script];
    case "yarn":
      return ["yarn", "run", script];
    case "bun":
      return ["bun", "run", script];
    case "pnpm":
    default:
      return ["pnpm", "run", script];
  }
}

export async function installDependencies(
  packageManager: PackageManager,
  cwd: string,
): Promise<void> {
  const [file, ...args] = getInstallCommand(packageManager);
  await runStreaming(file, args, cwd);
}
