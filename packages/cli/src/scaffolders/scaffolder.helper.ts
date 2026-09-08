/**
 * zudojs-cli — Framework Scaffolder Utilities
 *
 * Utilities for invoking official framework scaffolders.
 */

import { execCommand } from "../utils/utils.exec.js";
import { writeFileTree } from "../utils/utils.fileSystem.js";

export interface ScaffolderOptions {
  readonly command: string;
  readonly args: readonly string[];
  readonly targetPath: string;
  readonly fallbackFiles: Record<string, string>;
}

export async function scaffoldWithFallback(
  options: ScaffolderOptions,
): Promise<boolean> {
  try {
    await execCommand(
      options.command,
      Array.from(options.args),
      options.targetPath,
      {
        // Suppress interactive prompts from create-* tools.
        env: { ...process.env, CI: "1" },
      },
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `Warning: official scaffolder "${options.command} ${options.args.join(" ")}" failed (${message.split("\n")[0]}). Using built-in fallback template.`,
    );
    await writeFileTree(options.targetPath, options.fallbackFiles);
    return false;
  }
}
