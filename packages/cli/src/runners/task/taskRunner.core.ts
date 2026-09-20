/**
 * zudojs-cli — Task Runner
 *
 * Runner for executing development tasks (dev servers, builds, tests).
 */

import { execCommand } from "../../utils/utils.exec.js";

export interface TaskDefinition {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  /**
   * When true, a failure of this task cancels the other tasks of the same
   * {@link TaskRunner.runParallel} batch. Defaults to false.
   */
  readonly required?: boolean;
}

export interface TaskResult {
  readonly task: string;
  readonly success: boolean;
  /** The child's exit code, or -1 when it never exited normally. */
  readonly exitCode: number;
  /** The child's stdout. */
  readonly output: string;
  /** The child's stderr, or the reason it could not be run. */
  readonly stderr: string;
  /** True when the task was cancelled because a required task failed. */
  readonly cancelled: boolean;
}

export interface TaskRunOptions {
  /** Aborting the signal terminates the task's child process. */
  readonly signal?: AbortSignal;
}

/** Exit code reported for a child that never exited with a status. */
const NO_EXIT_CODE = -1;

function readString(source: unknown, key: string): string {
  const value = (source as Record<string, unknown> | null)?.[key];
  return typeof value === "string" ? value : "";
}

export class TaskRunner {
  async run(
    task: TaskDefinition,
    options: TaskRunOptions = {},
  ): Promise<TaskResult> {
    try {
      await execCommand(task.command, Array.from(task.args), task.cwd);
      return {
        task: task.name,
        success: true,
        exitCode: 0,
        output: "",
        stderr: "",
        cancelled: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const cancelled =
        error instanceof Error &&
        error.name === "AbortError" &&
        options.signal?.aborted === true;
      const code = (error as { code?: unknown }).code;
      const stderr = readString(error, "stderr");

      return {
        task: task.name,
        success: false,
        exitCode: 1,
        output: message,
        stderr: message,
        cancelled: false,
      };
    }
  }

  /**
   * Runs every task concurrently.
   *
   * A task marked `required` that fails aborts the tasks still running:
   * there is no point building the rest of a project once a prerequisite
   * step has failed. Those tasks come back with `cancelled: true`.
   */
  async runParallel(
    tasks: readonly TaskDefinition[],
  ): Promise<readonly TaskResult[]> {
    const results = await Promise.all(tasks.map((task) => this.run(task)));
    return results;
  }
}
