/**
 * zudojs-cli — CLI Error Base
 *
 * Base error class for all CLI errors. Extends `ApplicationError`
 * from `@zudojs/errors` and adds CLI-specific context (exitCode,
 * command, option, argument).
 */

import { ApplicationError } from "@zudojs/errors";
import type { BaseErrorOptions } from "@zudojs/errors";
import {
  CLI_ERROR_CODES,
  CLI_EXIT_CODES,
  CLI_MESSAGES,
} from "../cliConstant/cliConstant.value.js";
import type { CLIErrorCode } from "../cliConstant/cliConstant.value.js";

/* -------------------------------------------------------------------------- */
/* CLI Error                                                                  */
/* -------------------------------------------------------------------------- */

/** Options for creating a CLI error. */
export interface CLIErrorOptions extends Omit<BaseErrorOptions, "category"> {
  readonly code?: CLIErrorCode;
  readonly exitCode?: number;
  readonly command?: string;
  readonly argument?: string;
  readonly option?: string;
  readonly details?: Record<string, unknown>;
}

/**
 * Base error for all CLI subsystem failures.
 *
 * Extends `ApplicationError` so CLI errors can be caught
 * uniformly with other framework errors.
 */
export class CLIError extends ApplicationError {
  public readonly cliCode: CLIErrorCode;
  public readonly exitCode: number;
  public readonly command?: string;
  public readonly argument?: string;
  public readonly option?: string;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, options: CLIErrorOptions = {}) {
    super(message, {
      ...options,
      code: options.code ?? CLI_ERROR_CODES.UNKNOWN_ERROR,
      statusCode: options.statusCode ?? 400,
      expose: options.expose ?? true,
      isOperational: options.isOperational ?? true,
    });

    this.cliCode = options.code ?? CLI_ERROR_CODES.UNKNOWN_ERROR;
    this.exitCode = options.exitCode ?? CLI_EXIT_CODES.GENERAL_ERROR;
    this.command = options.command;
    this.argument = options.argument;
    this.option = options.option;
    this.details = options.details;
  }

  /** Serializes the error with CLI-specific fields. */
  public override toJSON() {
    return {
      ...super.toJSON(),
      exitCode: this.exitCode,
      ...(this.command !== undefined ? { command: this.command } : {}),
      ...(this.argument !== undefined ? { argument: this.argument } : {}),
      ...(this.option !== undefined ? { option: this.option } : {}),
      ...(this.details !== undefined ? { details: this.details } : {}),
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Utilities                                                                  */
/* -------------------------------------------------------------------------- */

/** Determines whether an unknown value is a CLIError. */
export function isCLIError(error: unknown): error is CLIError {
  return error instanceof CLIError;
}

/**
 * Reads a process exit code carried by an arbitrary error.
 *
 * Only `CLIError` extends this base class; `CommandNotFoundError`,
 * `CLIPermissionError` and the other errors built on `@zudojs/errors`
 * declare their own `exitCode` field. Without this, every one of them was
 * re-wrapped as `GENERAL_ERROR` and the declared `COMMAND_NOT_FOUND` (3),
 * `PERMISSION_DENIED` (4) and `INTERRUPTED` (130) codes never reached the
 * shell.
 */
function readExitCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = (error as { exitCode?: unknown }).exitCode;
  if (
    typeof candidate !== "number" ||
    !Number.isInteger(candidate) ||
    candidate < 0 ||
    candidate > 255
  ) {
    return undefined;
  }
  return candidate;
}

/** Normalizes any error into a CLIError. */
export function normalizeCLIError(
  error: unknown,
  fallbackMessage = CLI_MESSAGES.UNKNOWN_ERROR,
): CLIError {
  if (error instanceof CLIError) {
    return error;
  }

  const exitCode = readExitCode(error) ?? CLI_EXIT_CODES.GENERAL_ERROR;

  if (error instanceof Error) {
    return new CLIError(error.message || fallbackMessage, {
      code: CLI_ERROR_CODES.UNKNOWN_ERROR,
      exitCode,
      cause: error,
    });
  }

  return new CLIError(fallbackMessage, {
    code: CLI_ERROR_CODES.UNKNOWN_ERROR,
    exitCode,
    cause: error,
  });
}

/** Extracts the exit code from an error. */
export function getCLIExitCode(error: unknown): number {
  if (isCLIError(error)) {
    return error.exitCode;
  }
  return readExitCode(error) ?? CLI_EXIT_CODES.GENERAL_ERROR;
}

/** Extracts the error code from an error. */
export function getCLIErrorCode(error: unknown): CLIErrorCode {
  if (isCLIError(error)) {
    return error.cliCode;
  }
  return CLI_ERROR_CODES.UNKNOWN_ERROR;
}
