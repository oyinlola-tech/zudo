/**
 * zudojs-cli — CLI Parser
 *
 * Parses CLI arguments into structured commands, options, and positional
 * arguments. Delegates option parsing to longOption and shortOption modules.
 */

import type {
  CLIArgument,
  CLIArguments,
  CLICommand,
  CLIValues,
  ParsedCLIInput,
} from "../cliType/cliType.type.js";
import { InvalidArgumentsError } from "../cliError/cliError.argument.js";
import { isOption, isLongOption, isShortOption } from "./cliParser.helper.js";
import { parseLongOption } from "./cliParser.longOption.js";
import { parseShortOption } from "./cliParser.shortOption.js";

/* -------------------------------------------------------------------------- */
/* Parser Options                                                             */
/* -------------------------------------------------------------------------- */

/** Configuration for the CLI parser. */
export interface CLIParserOptions {
  readonly allowUnknownOptions?: boolean;
  readonly allowUnknownCommands?: boolean;
  readonly stopAtFirstArgument?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Parser                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Parses CLI arguments into structured input.
 */
export class CLIParser {
  private readonly allowUnknownOptions: boolean;
  private readonly allowUnknownCommands: boolean;
  private readonly stopAtFirstArgument: boolean;

  constructor(options: CLIParserOptions = {}) {
    this.allowUnknownOptions = options.allowUnknownOptions ?? false;
    this.allowUnknownCommands = options.allowUnknownCommands ?? false;
    this.stopAtFirstArgument = options.stopAtFirstArgument ?? false;
  }

  /** Parses an argument array into structured CLI input. */
  public parse(args: CLIArguments, command?: CLICommand): ParsedCLIInput {
    const tokens = Array.from(args);
    const commands: string[] = [];
    const positional: string[] = [];
    const options: Record<string, unknown> = {};
    const definitions = command?.options ?? [];
    const argumentsDefinitions = command?.arguments ?? [];

    let index = 0;

    while (index < tokens.length) {
      const token = tokens[index]!;

      if (token === "--") {
        positional.push(...tokens.slice(index + 1));
        break;
      }

      if (isLongOption(token)) {
        index = parseLongOption(
          tokens,
          index,
          definitions,
          options,
          this.allowUnknownOptions,
        );
        continue;
      }

      if (isShortOption(token)) {
        index = parseShortOption(
          tokens,
          index,
          definitions,
          options,
          this.allowUnknownOptions,
        );
        continue;
      }

      if (
        !this.stopAtFirstArgument &&
        !command &&
        commands.length === 0 &&
        positional.length === 0
      ) {
        commands.push(token);
        index++;
        continue;
      }
      positional.push(token);
      index++;
    }

    // Apply documented option defaults for options not provided on the CLI.
    for (const definition of definitions) {
      if (
        definition.defaultValue !== undefined &&
        !(definition.name in options)
      ) {
        options[definition.name] = definition.defaultValue;
      }
    }

    const parsedArguments = this.parseArguments(
      positional,
      argumentsDefinitions,
    );

    if (
      !this.allowUnknownCommands &&
      !command &&
      commands.length === 0 &&
      tokens.length > 0
    ) {
      const firstToken = tokens.find((value) => !isOption(value));
      if (firstToken) {
        commands.push(firstToken);
      }
    }

    return {
      command: commands[0],
      commands,
      args: positional,
      options: { ...options, ...parsedArguments } as CLIValues,
    };
  }

  /* ---- Arguments ---- */

  private parseArguments(
    values: readonly string[],
    definitions: readonly CLIArgument[],
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    if (definitions.length === 0) return result;

    let valueIndex = 0;

    for (const definition of definitions) {
      if (definition.variadic) {
        const remaining = values.slice(valueIndex);
        if (definition.required && remaining.length === 0) {
          throw new InvalidArgumentsError(
            `Missing required argument "${definition.name}".`,
          );
        }
        result[definition.name] = remaining;
        valueIndex = values.length;
        continue;
      }

      const value = values[valueIndex];

      if (value === undefined) {
        if (definition.required) {
          throw new InvalidArgumentsError(
            `Missing required argument "${definition.name}".`,
          );
        }
        if (definition.defaultValue !== undefined) {
          result[definition.name] = definition.defaultValue;
        }
        continue;
      }

      result[definition.name] = value;
      valueIndex++;
    }

    if (valueIndex < values.length) {
      throw new InvalidArgumentsError(
        `Unexpected argument "${values[valueIndex]}".`,
      );
    }

    return result;
  }
}
