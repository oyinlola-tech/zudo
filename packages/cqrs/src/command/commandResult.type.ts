import { CommandFailedError } from "@zudojs/errors";

import type { Command } from "../cqrsTypes/cqrsTypes.type.js";

/**
 * Status of a command execution.
 */
export type CommandResultStatus = "success" | "failure";

/**
 * Result returned after command execution.
 *
 * Command handlers may return any domain-specific value, while this
 * wrapper provides consistent execution metadata for infrastructure
 * consumers.
 */
export interface CommandResult<
  TResult = void,
  TCommand extends Command = Command,
> {
  readonly status: CommandResultStatus;
  readonly result: TResult;
  readonly commandType: TCommand["type"];
  readonly executedAt: Date;
  readonly durationMs?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Options for creating a command result.
 */
export interface CreateCommandResultOptions<
  TCommand extends Command = Command,
> {
  readonly command: TCommand;
  readonly executedAt?: Date;
  readonly durationMs?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Creates a successful command result.
 */
export function createCommandResult<TResult, TCommand extends Command>(
  result: TResult,
  options: CreateCommandResultOptions<TCommand>,
): CommandResult<TResult, TCommand> {
  const command = options.command;

  validateCommand(command);

  const commandResult: CommandResult<TResult, TCommand> = {
    status: "success",
    result,
    commandType: command.type,
    executedAt: options.executedAt ?? new Date(),
    durationMs: options.durationMs,
    metadata: options.metadata
      ? Object.freeze({
          ...options.metadata,
        })
      : undefined,
  };

  return Object.freeze(commandResult);
}

/**
 * Creates a failed command result.
 *
 * This helper is intended for infrastructure that represents failures
 * as values. Command buses normally throw errors instead.
 */
export function createFailedCommandResult<
  TResult = void,
  TCommand extends Command = Command,
>(
  result: TResult,
  options: CreateCommandResultOptions<TCommand>,
): CommandResult<TResult, TCommand> {
  const command = options.command;

  validateCommand(command);

  const commandResult: CommandResult<TResult, TCommand> = {
    status: "failure",
    result,
    commandType: command.type,
    executedAt: options.executedAt ?? new Date(),
    durationMs: options.durationMs,
    metadata: options.metadata
      ? Object.freeze({
          ...options.metadata,
        })
      : undefined,
  };

  return Object.freeze(commandResult);
}

/**
 * Determines whether a command result represents success.
 */
export function isSuccessfulCommandResult<
  TResult,
  TCommand extends Command = Command,
>(result: CommandResult<TResult, TCommand>): boolean {
  return result.status === "success";
}

/**
 * Determines whether a command result represents failure.
 */
export function isFailedCommandResult<
  TResult,
  TCommand extends Command = Command,
>(result: CommandResult<TResult, TCommand>): boolean {
  return result.status === "failure";
}

/**
 * Returns the value of a successful command result.
 *
 * @throws {CommandFailedError} when the result's status is `"failure"`.
 *   The failure payload is on `error.failure` (and `error.cause`). Before
 *   1.2 the payload was returned as if it were the command's value.
 */
export function unwrapCommandResult<
  TResult,
  TCommand extends Command = Command,
>(result: CommandResult<TResult, TCommand>): TResult {
  if (result.status === "failure") {
    throw new CommandFailedError(String(result.commandType), result.result);
  }

  return result.result;
}

/**
 * Adds execution metadata to an existing command result.
 */
export function withCommandResultMetadata<
  TResult,
  TCommand extends Command = Command,
>(
  result: CommandResult<TResult, TCommand>,
  metadata: Readonly<Record<string, unknown>>,
): CommandResult<TResult, TCommand> {
  const merged: CommandResult<TResult, TCommand> = {
    ...result,
    metadata: Object.freeze({
      ...(result.metadata ?? {}),
      ...metadata,
    }),
  };

  return Object.freeze(merged);
}

/**
 * Validates the command portion of a command result.
 */
function validateCommand(command: Command): void {
  if (!command || typeof command !== "object") {
    throw new TypeError(
      "A valid command is required to create a command result.",
    );
  }

  if (typeof command.type !== "string" || command.type.trim().length === 0) {
    throw new TypeError("Command type is required to create a command result.");
  }
}
