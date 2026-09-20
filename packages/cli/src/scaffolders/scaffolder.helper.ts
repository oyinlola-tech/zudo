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
      },
    );
    return true;
  } catch (error) {
    console.warn(
      `Warning: official scaffolder "${options.command} ${options.args.join(" ")}" failed (${(error instanceof Error ? error.message : String(error)).split("\n")[0]}). Using built-in fallback template.`,
    );
    await writeFileTree(options.targetPath, options.fallbackFiles);
    return false;
  }
}
