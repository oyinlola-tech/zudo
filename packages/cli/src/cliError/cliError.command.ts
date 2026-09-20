/**
 * zudojs-cli — Command Errors
 *
 * Error classes for command registration and lookup failures.
 * Extends base errors from `@zudojs/errors` where possible.
 */

import { NotFoundError, ConflictError } from "@zudojs/errors";
import {
  CLI_ERROR_CODES,
  CLI_EXIT_CODES,
  CLI_MESSAGES,
} from "../cliConstant/cliConstant.value.js";

/* -------------------------------------------------------------------------- */
/* Command Not Found                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Thrown when a requested command does not exist.
 * Extends `NotFoundError` from `@zudojs/errors`.
 */
export class CommandNotFoundError extends NotFoundError {
  public readonly exitCode: number;

  constructor(command: string) {
    const message = command
      ? `Command "${command}" was not found.`
      : CLI_MESSAGES.COMMAND_NOT_FOUND;

    super(message, {
      code: CLI_ERROR_CODES.COMMAND_NOT_FOUND,
      statusCode: 404,
      expose: true,
      metadata: { command },
    });

    this.exitCode = CLI_EXIT_CODES.COMMAND_NOT_FOUND;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      exitCode: this.exitCode,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Duplicate Command                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Thrown when a command name is already registered.
 * Extends `ConflictError` from `@zudojs/errors`.
 */
export class DuplicateCommandError extends ConflictError {
  public readonly exitCode: number;

  constructor(command: string) {
    super(`Command "${command}" is already registered.`, {
      code: CLI_ERROR_CODES.DUPLICATE_COMMAND,
      statusCode: 409,
      expose: true,
      metadata: { command },
    });

    this.exitCode = CLI_EXIT_CODES.INVALID_ARGUMENTS;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      exitCode: this.exitCode,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Invalid Command Name                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Thrown when a command name fails validation.
 */
export class InvalidCommandNameError extends NotFoundError {
  public readonly exitCode: number;

  constructor(command: string) {
    super(`Invalid command name "${command}".`, {
      code: CLI_ERROR_CODES.INVALID_COMMAND_NAME,
      statusCode: 400,
      expose: true,
      metadata: { command },
    });

    this.exitCode = CLI_EXIT_CODES.INVALID_ARGUMENTS;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      exitCode: this.exitCode,
    };
  }
}
