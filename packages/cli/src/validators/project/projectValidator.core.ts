/**
 * zudojs-cli — Project Validator
 *
 * Validates a generated project by checking structure, configuration, and buildability.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { execCommand } from "../../utils/utils.exec.js";

export interface ProjectValidationResult {
  readonly checks: readonly ProjectCheck[];
  readonly valid: boolean;
  readonly errors: readonly string[];
}

export interface ProjectCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly message?: string;
}

/** What a validation run should look at. */
export interface ProjectValidationOptions {
  /**
   * Whether dependencies are expected to be installed. A project created
   * with `--no-install` has no node_modules on purpose.
   */
  readonly expectInstalled?: boolean;
  /** Whether to run the project's own TypeScript compiler. */
  readonly typecheck?: boolean;
}

export class ProjectValidator {
  async validate(
    projectPath: string,
    options: ProjectValidationOptions = {},
  ): Promise<ProjectValidationResult> {
    const { expectInstalled = true, typecheck = true } = options;
    const checks: ProjectCheck[] = [];
    const errors: string[] = [];

    checks.push(await this.checkPackageJson(projectPath));
    checks.push(await this.checkTsConfig(projectPath));
    if (expectInstalled) {
      checks.push(await this.checkNodeModules(projectPath));
    }
    checks.push(await this.checkSourceFiles(projectPath));
    if (typecheck) {
      checks.push(await this.checkTypeScript(projectPath));
    }

    for (const check of checks) {
      if (!check.passed && check.message) {
        errors.push(check.message);
      }
    }

    return {
      checks,
      valid: errors.length === 0,
      errors,
    };
  }

  private async checkPackageJson(projectPath: string): Promise<ProjectCheck> {
    try {
      const content = await readFile(
        join(projectPath, "package.json"),
        "utf-8",
      );
      const pkg = JSON.parse(content) as {
        name?: string;
        scripts?: Record<string, string>;
      };

      if (!pkg.name) {
        return {
          name: "package.json",
          passed: false,
          message: "Missing package name",
        };
      }

      return { name: "package.json", passed: true };
    } catch {
      return {
        name: "package.json",
        passed: false,
        message: "package.json not found",
      };
    }
  }

  private async checkTsConfig(projectPath: string): Promise<ProjectCheck> {
    try {
      await readFile(join(projectPath, "tsconfig.json"), "utf-8");
      return { name: "tsconfig.json", passed: true };
    } catch {
      return {
        name: "tsconfig.json",
        passed: false,
        message: "tsconfig.json not found",
      };
    }
  }

  private async checkNodeModules(projectPath: string): Promise<ProjectCheck> {
    try {
      await stat(join(projectPath, "node_modules"));
      return { name: "node_modules", passed: true };
    } catch {
      return {
        name: "node_modules",
        passed: false,
        message: "Dependencies not installed",
      };
    }
  }

  private async checkSourceFiles(projectPath: string): Promise<ProjectCheck> {
    try {
      await stat(join(projectPath, "src"));
      return { name: "source files", passed: true };
    } catch {
      return {
        name: "source files",
        passed: false,
        message: "src directory not found",
      };
    }
  }

  private async checkTypeScript(projectPath: string): Promise<ProjectCheck> {
    if (!existsSync(join(projectPath, "tsconfig.json"))) {
      return {
        name: "typescript",
        passed: true,
        message: "Skipped (no tsconfig)",
      };
    }

    // `npx tsc` downloads TypeScript from the registry when the project has
    // no local copy — a network fetch nobody asked for. Only the project's
    // own compiler is used, and the check is skipped when it is absent.
    const tsc = join(
      projectPath,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "tsc.cmd" : "tsc",
    );

    if (!existsSync(tsc)) {
      return {
        name: "typescript",
        passed: true,
        message: "Skipped (typescript is not installed in this project)",
      };
    }

    try {
      await execCommand(tsc, ["--noEmit"], projectPath);
      return { name: "typescript", passed: true };
    } catch {
      return {
        name: "typescript",
        passed: false,
        message: "TypeScript compilation failed",
      };
    }
  }
}
