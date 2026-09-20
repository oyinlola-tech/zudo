/**
 * Environment validator for project generation.
 *
 * @module validators/environment
 */

import { execCommand } from "../../utils/utils.exec.js";
import type { PackageManager } from "../../types/index.js";

/**
 * Environment check result.
 */
export interface EnvironmentCheck {
  readonly name: string;
  readonly installed: boolean;
  readonly version?: string;
  readonly required: boolean;
}

/**
 * Environment validation result.
 */
export interface EnvironmentValidationResult {
  readonly checks: readonly EnvironmentCheck[];
  readonly valid: boolean;
  readonly missing: readonly string[];
}

const PACKAGE_MANAGER_CANDIDATES: readonly PackageManager[] = [
  "pnpm",
  "yarn",
  "bun",
  "npm",
];

/**
 * Validates the development environment before project generation.
 */
export class EnvironmentValidator {
  /**
   * Validates the environment for a given project type.
   *
   * `packageManager` is the one the project will actually use. Without it
   * the check probed pnpm, yarn, bun and npm in turn and reported the first
   * one found, so it said "valid" while the chosen manager was missing.
   */
  async validate(
    projectType: "backend" | "frontend" | "fullstack",
    packageManager?: PackageManager,
  ): Promise<EnvironmentValidationResult> {
    const checks: EnvironmentCheck[] = [];

    checks.push(await this.checkNode());
    checks.push(await this.checkGit());
    // A backend project installs dependencies too, so the package manager
    // is checked for every project type, not just frontend and fullstack.
    checks.push(await this.checkPackageManager(packageManager));

    const missing = checks
      .filter((c) => c.required && !c.installed)
      .map((c) => c.name);

    return {
      checks,
      valid: missing.length === 0,
      missing,
    };
  }

  private async checkNode(): Promise<EnvironmentCheck> {
    return this.checkBinary("Node.js", "node");
  }

  private async checkGit(): Promise<EnvironmentCheck> {
    return this.checkBinary("Git", "git");
  }

  /**
   * Checks the selected package manager, or — when none was selected — the
   * first one that is installed.
   */
  private async checkPackageManager(
    packageManager?: PackageManager,
  ): Promise<EnvironmentCheck> {
    if (packageManager !== undefined) {
      return this.checkBinary(packageManager, packageManager);
    }

    for (const candidate of PACKAGE_MANAGER_CANDIDATES) {
      const check = await this.checkBinary(candidate, candidate);
      if (check.installed) {
        return check;
      }
    }

    return {
      name: "Package Manager",
      installed: false,
      required: true,
    };
  }

  private async checkBinary(
    name: string,
    binary: string,
  ): Promise<EnvironmentCheck> {
    try {
      const result = await execCommand(binary, ["--version"], ".");
      return {
        name,
        installed: true,
        version: result.stdout.trim(),
        required: true,
      };
    } catch {
      return {
        name,
        installed: false,
        required: true,
      };
    }
  }
}
