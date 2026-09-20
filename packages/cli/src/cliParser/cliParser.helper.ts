/**
 * zudojs-cli — Parser Helpers
 *
 * Utility functions for parsing CLI arguments, options, and values.
 */

import type {
  CLIArguments,
  CLICommand,
  CLIOption,
  CLIValue,
  ParsedCLIInput,
} from "../cliType/cliType.type.js";
import { CLI_OPTION_PREFIXES } from "../cliConstant/cliConstant.value.js";
import { InvalidArgumentsError } from "../cliError/cliError.argument.js";
import { CLIParser, type CLIParserOptions } from "./cliParser.core.js";

/* -------------------------------------------------------------------------- */
/* Parsing Helpers                                                            */
/* -------------------------------------------------------------------------- */

/** Convenience function to parse CLI arguments. */
export function parseCLIArguments(
  args: CLIArguments,
  command?: CLICommand,
  options?: CLIParserOptions,
): ParsedCLIInput {
  return new CLIParser(options).parse(args, command);
}

/** Parses a raw string value according to an option definition. */
export function parseOptionValue(
  definition: CLIOption,
  value: string,
): CLIValue {
  switch (definition.type) {
    case "boolean":
      return parseBoolean(value, definition.name);

    case "number": {
      const parsed = Number(value);
      if (Number.isNaN(parsed)) {
        throw new InvalidArgumentsError(
          `Option "${definition.name}" expects a number, received "${value}".`,
        );
      }
      return parsed;
    }

    case "string":
    default:
      return value;
  }
}

/** Parses a string into a boolean. */
export function parseBoolean(value: string, option = "option"): boolean {
  const normalized = value.trim().toLowerCase();

  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;

  throw new InvalidArgumentsError(
    `Option "${option}" expects a boolean value, received "${value}".`,
  );
}

/* -------------------------------------------------------------------------- */
/* Token Classification                                                       */
/* -------------------------------------------------------------------------- */

/** Returns whether a token is any option (short or long). */
export function isOption(token: string): boolean {
  return (
    (token.startsWith(CLI_OPTION_PREFIXES.LONG) && token !== "--") ||
    (token.startsWith(CLI_OPTION_PREFIXES.SHORT) &&
      !token.startsWith(CLI_OPTION_PREFIXES.LONG) &&
      token !== "-")
  );
}

/** Returns whether a token is a long option (e.g. `--verbose`). */
export function isLongOption(token: string): boolean {
  return (
    token.startsWith(CLI_OPTION_PREFIXES.LONG) &&
    token.length > CLI_OPTION_PREFIXES.LONG.length
  );
}

/** Returns whether a token looks like a negative number (e.g. `-1`, `-2.5`). */
export function isNegativeNumber(token: string): boolean {
  return /^-(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(token);
}

/**
 * Returns whether the token following an option can be taken as its value.
 *
 * A flag-looking token is refused so that `--type --frontend react` reports
 * the missing value for `--type` instead of silently setting it to
 * `"--frontend"`. Negative numbers stay usable for numeric options, so both
 * `--port -1` and `--port=-1` keep working.
 */
export function isOptionValueToken(
  definition: CLIOption,
  token: string | undefined,
): token is string {
  if (token === undefined || token === "--") return false;
  if (!isOption(token)) return true;
  return definition.type === "number" && isNegativeNumber(token);
}

/** Returns whether a token is a short option (e.g. `-v`). */
export function isShortOption(token: string): boolean {
  return (
    token.startsWith(CLI_OPTION_PREFIXES.SHORT) &&
    !token.startsWith(CLI_OPTION_PREFIXES.LONG) &&
    token.length > CLI_OPTION_PREFIXES.SHORT.length
  );
}

/* -------------------------------------------------------------------------- */
/* Command Resolution                                                         */
/* -------------------------------------------------------------------------- */

/** Resolves a command name to a CLICommand. */
export function resolveCommand(
  commands: readonly CLICommand[],
  name: string,
): CLICommand | undefined {
  const normalized = name.trim();
  return commands.find(
    (c) => c.name === normalized || c.aliases?.includes(normalized),
  );
}

/* -------------------------------------------------------------------------- */
/* Utility                                                                    */
/* -------------------------------------------------------------------------- */

/** Normalizes an unknown value into a CLIValue. */
export function normalizeCLIValue(value: unknown): CLIValue {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === undefined
  ) {
    return value;
  }
  return String(value);
}
