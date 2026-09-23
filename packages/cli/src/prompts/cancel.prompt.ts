/**
 * zudojs-cli — Prompt Cancellation
 *
 * The single place where an aborted prompt ends the process.
 */

import * as p from "@clack/prompts";
import { CLI_EXIT_CODES } from "../cliConstant/cliConstant.value.js";

/**
 * Returns a prompt answer, or ends the process when the prompt was cancelled.
 *
 * Every prompt used to exit `0` on Ctrl-C, so `zudojs create my-api && cd
 * my-api` ran the `cd` against a directory that was never created, and in CI
 * an abort was indistinguishable from a success. The exit status is now 130,
 * the conventional "terminated by SIGINT" value.
 *
 * The return type strips `symbol` from the argument's type rather than
 * inferring `T` from `T | symbol`: TypeScript 7 infers the clack cancel
 * symbol into `T` from that pattern, which broke every call site.
 *
 * @param value - The value a `@clack/prompts` call resolved with.
 * @returns The answer, once it is known not to be the cancel symbol.
 */
export function cancelled<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value)) {
    p.cancel("Operation cancelled.");
    process.exit(CLI_EXIT_CODES.INTERRUPTED);
  }

  return value as Exclude<T, symbol>;
}
