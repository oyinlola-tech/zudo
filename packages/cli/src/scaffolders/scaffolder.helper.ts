/**
 * zudojs-cli — Framework Scaffolder Utilities
 *
 * Utilities for invoking official framework scaffolders.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { execCommand } from "../utils/utils.exec.js";
import { writeFileTree } from "../utils/utils.fileSystem.js";

export interface ScaffolderOptions {
  readonly command: string;
  readonly args: readonly string[];
  readonly targetPath: string;
  readonly fallbackFiles: Record<string, string>;
}

/**
 * Timeout for an official framework scaffolder, in milliseconds.
 *
 * `npm create vite@latest` and `npx create-next-app@latest` download a
 * package tree from the registry, which routinely takes several minutes on
 * a cold cache or a slow link. The 2-minute default of `execCommand` killed
 * them mid-download and the user silently received the built-in fallback
 * template instead of the real framework scaffold.
 */
export const SCAFFOLD_TIMEOUT_MS = 900000;

/** Describes why a scaffolder failed, including the child's own stderr. */
function describeFailure(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const killed = (error as { killed?: boolean }).killed === true;
  const signal = (error as { signal?: string | null }).signal;
  const stderr = (error as { stderr?: unknown }).stderr;
  const detail = typeof stderr === "string" ? stderr.trim() : "";

  const headline =
    killed && (signal === "SIGTERM" || signal === null || signal === undefined)
      ? `timed out after ${Math.round(SCAFFOLD_TIMEOUT_MS / 1000)}s`
      : `failed: ${error.message.split("\n")[0]}`;

  return detail ? `${headline}; ${detail}` : headline;
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
        timeout: SCAFFOLD_TIMEOUT_MS,
      },
    );
  } catch (error) {
    console.warn(
      `Warning: official scaffolder "${options.command} ${options.args.join(" ")}" ${describeFailure(error)}. Using built-in fallback template.`,
    );
    await writeFileTree(options.targetPath, options.fallbackFiles);
    return false;
  }

  // Some scaffolders exit 0 without writing anything: `create-vite` prints
  // "Operation cancelled" when the directory is not empty. Treat a missing
  // package.json as a failure whenever the fallback would have written one.
  if (
    options.fallbackFiles["package.json"] !== undefined &&
    !existsSync(join(options.targetPath, "package.json"))
  ) {
    console.warn(
      `Warning: official scaffolder "${options.command} ${options.args.join(" ")}" exited without creating package.json. Using built-in fallback template.`,
    );
    await writeFileTree(options.targetPath, options.fallbackFiles);
    return false;
  }

  return true;
}
