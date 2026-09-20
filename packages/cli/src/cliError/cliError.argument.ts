/**
 * zudojs-cli — Argument Errors
 *
 * Error classes for argument validation failures.
 */

import { CLIError } from "./cliError.base.js";
import {
  CLI_ERROR_CODES,
  CLI_EXIT_CODES,
  CLI_MESSAGES,
} from "../cliConstant/cliConstant.value.js";
import type { CLIErrorOptions } from "./cliError.base.js";

/* -------------------------------------------------------------------------- */
/* Invalid Arguments                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Thrown when command arguments fail validation.
 */
export class InvalidArgumentsError extends CLIError {
  constructor(
    message: string = CLI_MESSAGES.INVALID_ARGUMENTS,
    options: CLIErrorOptions = {},
  ) {
    super(message, {
      ...options,
      code: CLI_ERROR_CODES.INVALID_ARGUMENTS,
      exitCode: CLI_EXIT_CODES.INVALID_ARGUMENTS,
      statusCode: 400,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Missing Argument                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Thrown when a required argument is missing.
 */
export class MissingArgumentError extends CLIError {
  constructor(argument: string, command?: string) {
    super(`Missing required argument "${argument}".`, {
      code: CLI_ERROR_CODES.MISSING_ARGUMENT,
      exitCode: CLI_EXIT_CODES.INVALID_ARGUMENTS,
      command,
      argument,
      statusCode: 400,
    });
  }
}
