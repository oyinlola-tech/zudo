/**
 * zudojs-cli — Process Runner
 *
 * Runner for executing system processes.
 */

import { execCommand } from "../../utils/utils.exec.js";

export interface ProcessOptions {
  readonly cwd: string;
  readonly env?: Record<string, string>;
  /**
   * Child stdio mode. Only meaningful for {@link ProcessRunner.runBackground};
   * {@link ProcessRunner.run} always buffers output so it can return it.
   */
  readonly stdio?: "inherit" | "pipe" | "ignore";
}

export class ProcessRunner {
  async run(
    command: string,
    args: readonly string[],
    options: ProcessOptions,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      // The buffered output used to be thrown away and every caller got
      // empty strings, making the documented `stdout`/`stderr` fields
      // useless. `options.env` was ignored here too.
      const result = await execCommand(command, Array.from(args), options.cwd, {
        ...(options.env ? { env: { ...process.env, ...options.env } } : {}),
      });
      return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stdout =
        typeof (error as { stdout?: unknown }).stdout === "string"
          ? (error as { stdout: string }).stdout
          : "";
      const stderr =
        typeof (error as { stderr?: unknown }).stderr === "string"
          ? (error as { stderr: string }).stderr
          : message;
      const exitCode =
        typeof (error as { code?: unknown }).code === "number"
          ? (error as { code: number }).code
          : 1;
      return { stdout, stderr, exitCode };
    }
  }

  async runBackground(
    command: string,
    args: readonly string[],
    options: ProcessOptions,
  ): Promise<{ pid: number }> {
    const { spawn } = await import("node:child_process");

    const child = spawn(command, Array.from(args), {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: options.stdio ?? "ignore",
    });

    return { pid: child.pid ?? 0 };
  }
}
