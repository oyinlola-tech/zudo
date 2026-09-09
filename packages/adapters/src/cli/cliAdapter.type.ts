/**
 * @zudojs/adapters/cli
 *
 * CLI adapter contracts — bridges Zudojs to command-line interfaces.
 */

import type { Adapter } from "../index.js";

/**
 * CLI adapter — manages command-line interface interactions.
 */
export interface CLIAdapter extends Adapter {
  /** Runs a CLI command. */
  run(
    command: string,
    args?: readonly string[],
    options?: CLIOptions,
  ): Promise<CLIResult>;
}

/**
 * CLI execution options.
 */
export interface CLIOptions {
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly stdin?: string;
  readonly timeout?: number;
}

/**
 * CLI execution result.
 */
export interface CLIResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}
