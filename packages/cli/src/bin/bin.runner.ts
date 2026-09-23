/**
 * zudojs-cli — Binary Runner
 *
 * What the `zudojs` / `zudo` executable does with its arguments: open the
 * interactive menu for a bare invocation on a terminal, otherwise hand the
 * arguments straight to the application.
 */

import type { CLIApplication } from "../cliType/cliType.type.js";
import {
  CLI_ENVIRONMENT,
  CLI_EXIT_CODES,
} from "../cliConstant/cliConstant.value.js";
import type { MenuOutcome } from "../prompts/menu/index.js";

/** The parts of the process the runner looks at, injectable for tests. */
export interface BinaryEnvironment {
  /** Arguments after the script path (`process.argv.slice(2)`). */
  readonly argv: readonly string[];
  readonly stdin: { readonly isTTY?: boolean };
  readonly stdout: { readonly isTTY?: boolean };
  readonly env: Readonly<Record<string, string | undefined>>;
}

/** Whether an environment variable is set to a truthy value. */
function isTruthy(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "0" && normalized !== "false";
}

/**
 * Whether a bare invocation should open the interactive menu.
 *
 * Only with no arguments at all, both stdin and stdout attached to a
 * terminal, and not under CI. Piped, redirected and CI runs keep printing
 * the help text and exiting 0, so scripts that call `zudojs` are unchanged.
 */
export function shouldShowMenu(environment: BinaryEnvironment): boolean {
  return (
    environment.argv.length === 0 &&
    environment.stdin.isTTY === true &&
    environment.stdout.isTTY === true &&
    !isTruthy(environment.env[CLI_ENVIRONMENT.CI])
  );
}

/**
 * Runs the binary and resolves with the process exit code.
 *
 * @param app - The application with every command registered.
 * @param environment - The process's arguments, streams and variables.
 * @param openMenu - Shows the menu; only called when `shouldShowMenu`.
 */
export async function runBinary(
  app: Pick<CLIApplication, "run">,
  environment: BinaryEnvironment,
  openMenu: () => Promise<MenuOutcome>,
): Promise<number> {
  if (!shouldShowMenu(environment)) {
    return app.run([...environment.argv]);
  }

  const outcome = await openMenu();

  switch (outcome.kind) {
    case "exit":
      return CLI_EXIT_CODES.SUCCESS;
    case "cancel":
      // Same status as every other aborted prompt (see `cancelled`).
      return CLI_EXIT_CODES.INTERRUPTED;
    default:
      return app.run([...outcome.args]);
  }
}
