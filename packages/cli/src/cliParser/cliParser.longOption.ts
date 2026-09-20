/**
 * zudojs-cli — Long Option Parser
 *
 * Parses `--option`, `--option=value`, and `--no-option` style arguments.
 */

import type { CLIOption } from "../cliType/cliType.type.js";
import { CLI_OPTION_PREFIXES } from "../cliConstant/cliConstant.value.js";
import {
  InvalidOptionError,
  MissingOptionValueError,
} from "../cliError/cliError.option.js";
import {
  isOption,
  isOptionValueToken,
  parseBoolean,
  parseOptionValue,
} from "./cliParser.helper.js";

/** Parses a long option token from the token stream. */
export function parseLongOption(
  tokens: readonly string[],
  index: number,
  definitions: readonly CLIOption[],
  values: Record<string, unknown>,
  allowUnknownOptions: boolean,
): number {
  const token = tokens[index]!;
  const raw = token.slice(CLI_OPTION_PREFIXES.LONG.length);

  if (raw === "") {
    throw new InvalidOptionError(token);
  }

  const separatorIndex = raw.indexOf(CLI_OPTION_PREFIXES.VALUE_SEPARATOR);
  let name = separatorIndex >= 0 ? raw.slice(0, separatorIndex) : raw;
  let value: unknown =
    separatorIndex >= 0 ? raw.slice(separatorIndex + 1) : undefined;
  let negated = false;

  if (name.startsWith("no-")) {
    const candidate = name.slice(3);
    const definition = findOption(candidate, definitions);
    if (definition?.type === "boolean") {
      name = candidate;
      negated = true;
    }
  }

  const definition = findOption(name, definitions);

  if (!definition && !allowUnknownOptions) {
    throw new InvalidOptionError(token);
  }

  if (!definition) {
    if (
      value === undefined &&
      tokens[index + 1] &&
      tokens[index + 1] !== "--" &&
      !isOption(tokens[index + 1]!)
    ) {
      value = tokens[index + 1];
      values[name] = value;
      return index + 2;
    }
    values[name] = value ?? true;
    return index + 1;
  }

  if (definition.type === "boolean") {
    values[definition.name] = negated
      ? false
      : value === undefined
        ? true
        : parseBoolean(value as string, definition.name);
    return index + 1;
  }

  if (value === undefined) {
    const next = tokens[index + 1];
    if (!isOptionValueToken(definition, next)) {
      throw new MissingOptionValueError(token);
    }
    assignOptionValue(definition, next, values);
    return index + 2;
  }

  assignOptionValue(definition, value as string, values);
  return index + 1;
}

/** Finds an option by name or short form. */
export function findOption(
  name: string,
  definitions: readonly CLIOption[],
): CLIOption | undefined {
  return definitions.find((d) => d.name === name || d.short === name);
}

/** Assigns a parsed value to the option, handling multiples. */
export function assignOptionValue(
  definition: CLIOption,
  rawValue: string,
  values: Record<string, unknown>,
): void {
  const value = parseOptionValue(definition, rawValue);

  if (definition.multiple) {
    const existing = values[definition.name];
    if (Array.isArray(existing)) {
      existing.push(value);
    } else if (existing !== undefined) {
      values[definition.name] = [existing, value];
    } else {
      values[definition.name] = [value];
    }
  } else {
    values[definition.name] = value;
  }
}
