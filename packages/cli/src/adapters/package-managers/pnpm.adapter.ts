/**
 * pnpm package manager adapter.
 *
 * @module adapters/package-managers/pnpm
 */

import { execCommand, runStreaming } from "../../utils/utils.exec.js";
import type { PackageManager } from "./packageManager.type.js";

/**
 * pnpm adapter implementation.
 */
export class PnpmAdapter implements PackageManager {
  readonly name = "pnpm";

  async isInstalled(): Promise<boolean> {
    try {
      await execCommand("pnpm", ["--version"], ".");
      return true;
    } catch {
      return false;
    }
  }

  async install(projectPath: string): Promise<void> {
    await runStreaming("pnpm", ["install"], projectPath);
  }

  async add(projectPath: string, packages: readonly string[]): Promise<void> {
    if (packages.length === 0) return;
    await runStreaming("pnpm", ["add", ...packages], projectPath);
  }

  async addDev(
    projectPath: string,
    packages: readonly string[],
  ): Promise<void> {
    if (packages.length === 0) return;
    await runStreaming("pnpm", ["add", "-D", ...packages], projectPath);
  }

  async run(projectPath: string, script: string): Promise<void> {
    await runStreaming("pnpm", ["run", script], projectPath);
  }

  getInstallCommand(): string {
    return "pnpm install";
  }
}
