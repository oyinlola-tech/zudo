/**
 * zudojs-cli — Package Manager Runner
 *
 * Runner for package manager operations (install, add, remove, run).
 */

import { CLIValidationError } from "../../errors/index.js";
import type { PackageManager } from "../../types/index.js";
import { execCommand } from "../../utils/utils.exec.js";

export interface PackageManagerRunOptions {
  readonly cwd: string;
  readonly args: readonly string[];
}

/** The package managers this runner will put in the executable position. */
const SUPPORTED_MANAGERS: readonly PackageManager[] = Object.freeze([
  "pnpm",
  "npm",
  "yarn",
  "bun",
]);

/**
 * Narrows an untrusted value to a supported package manager.
 *
 * The constructor argument ends up as the executable name of a spawned
 * process, so it is checked at runtime as well as at compile time: this is
 * public API and a JavaScript caller gets no type checking at all.
 *
 * @throws {CLIValidationError} If the value is not a known package manager.
 */
export function assertPackageManager(value: string): PackageManager {
  if (!SUPPORTED_MANAGERS.includes(value as PackageManager)) {
    throw new CLIValidationError(
      `Unsupported package manager: "${value}". Expected one of ${SUPPORTED_MANAGERS.join(", ")}.`,
    );
  }
  return value as PackageManager;
}

export class PackageManagerRunner {
  private readonly manager: string;

  constructor(manager: string) {
    this.manager = manager;
  }

  async install(cwd: string): Promise<void> {
    const args =
      this.manager === "pnpm"
        ? ["install"]
        : this.manager === "yarn"
          ? ["install"]
          : this.manager === "bun"
            ? ["install"]
            : ["install"];

    await execCommand(this.manager, args, cwd);
  }

  async add(
    packages: readonly string[],
    options: PackageManagerRunOptions,
  ): Promise<void> {
    const args =
      this.manager === "pnpm"
        ? ["add", ...packages]
        : this.manager === "yarn"
          ? ["add", ...packages]
          : this.manager === "bun"
            ? ["add", ...packages]
            : ["install", ...packages];

    await execCommand(this.manager, args, options.cwd);
  }

  async addDev(
    packages: readonly string[],
    options: PackageManagerRunOptions,
  ): Promise<void> {
    const args =
      this.manager === "pnpm"
        ? ["add", "-D", ...packages]
        : this.manager === "yarn"
          ? ["add", "-D", ...packages]
          : this.manager === "bun"
            ? ["add", "-D", ...packages]
            : ["install", "--save-dev", ...packages];

    await execCommand(this.manager, args, options.cwd);
  }

  async run(script: string, options: PackageManagerRunOptions): Promise<void> {
    const args =
      this.manager === "pnpm"
        ? ["run", script]
        : this.manager === "yarn"
          ? [script]
          : this.manager === "bun"
            ? ["run", script]
            : ["run", script];

    await execCommand(this.manager, args, options.cwd);
  }
}
