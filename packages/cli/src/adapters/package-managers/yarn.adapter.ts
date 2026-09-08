/**
 * yarn package manager adapter.
 *
 * @module adapters/package-managers/yarn
 */

import { execCommand, runStreaming } from "../../utils/utils.exec.js";
import type { PackageManager } from "./packageManager.type.js";

/**
 * yarn adapter implementation.
 */
export class YarnAdapter implements PackageManager {
  readonly name = "yarn";

  async isInstalled(): Promise<boolean> {
    try {
      await execCommand("yarn", ["--version"], ".");
      return true;
    } catch {
      return false;
    }
  }

  async install(projectPath: string): Promise<void> {
    await runStreaming("yarn", ["install"], projectPath);
  }

  async add(projectPath: string, packages: readonly string[]): Promise<void> {
    if (packages.length === 0) return;
    await runStreaming("yarn", ["add", ...packages], projectPath);
  }

  async addDev(
    projectPath: string,
    packages: readonly string[],
  ): Promise<void> {
    if (packages.length === 0) return;
    await runStreaming("yarn", ["add", "-D", ...packages], projectPath);
  }

  async run(projectPath: string, script: string): Promise<void> {
    await runStreaming("yarn", [script], projectPath);
  }

  getInstallCommand(): string {
    return "yarn install";
  }
}
