/**
 * zudojs-cli — Execution Errors
 *
 * Error classes for runtime execution, permissions, and interrupts.
 */

import { AuthorizationError, ConfigurationError } from "@zudojs/errors";
import { CLIError } from "./cliError.base.js";
import {
  CLI_ERROR_CODES,
  CLI_EXIT_CODES,
  CLI_MESSAGES,
} from "../cliConstant/cliConstant.value.js";
import type { CLIErrorOptions } from "./cliError.base.js";

/* -------------------------------------------------------------------------- */
/* Execution Error                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Thrown when a CLI command fails during execution.
 */
export class CLIExecutionError extends CLIError {
  constructor(
    message = "CLI command execution failed.",
    options: CLIErrorOptions = {},
  ) {
    super(message, {
      ...options,
      code: CLI_ERROR_CODES.EXECUTION_FAILED,
      exitCode: options.exitCode ?? CLI_EXIT_CODES.GENERAL_ERROR,
      statusCode: 500,
      expose: false,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Permission Error                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Thrown when a CLI operation is not permitted.
 * Extends `AuthorizationError` from `@zudojs/errors`.
 */
export class CLIPermissionError extends AuthorizationError {
  public readonly exitCode: number;

  constructor(
    message = CLI_MESSAGES.PERMISSION_DENIED,
    options: CLIErrorOptions = {},
  ) {
    super(message, {
      ...options,
      code: CLI_ERROR_CODES.PERMISSION_DENIED,
      statusCode: 403,
      expose: true,
      isOperational: true,
    });

    this.exitCode = CLI_EXIT_CODES.PERMISSION_DENIED;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      exitCode: this.exitCode,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Interrupted Error                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Thrown when the CLI process is interrupted (e.g. SIGINT).
 */
export class CLIInterruptedError extends CLIError {
  constructor(
    message = CLI_MESSAGES.INTERRUPTED,
    options: CLIErrorOptions = {},
  ) {
    super(message, {
      ...options,
      code: CLI_ERROR_CODES.INTERRUPTED,
      exitCode: CLI_EXIT_CODES.INTERRUPTED,
      statusCode: 499,
      expose: false,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Configuration Error                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Thrown when CLI configuration is invalid.
 * Extends `ConfigurationError` from `@zudojs/errors`.
 */
export class CLIConfigurationError extends ConfigurationError {
  public readonly exitCode: number;

  constructor(
    message = "CLI configuration is invalid.",
    options: CLIErrorOptions = {},
  ) {
    super(message, {
      ...options,
      code: CLI_ERROR_CODES.CONFIGURATION_ERROR,
      statusCode: 500,
      expose: false,
      isOperational: true,
    });

    this.exitCode = CLI_EXIT_CODES.GENERAL_ERROR;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      exitCode: this.exitCode,
    };
  }
}
