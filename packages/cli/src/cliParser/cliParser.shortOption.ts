/**
 * zudojs-cli — Short Option Parser
 *
 * Parses `-v`, `-p 3000`, `-p3000`, and grouped `-abc` style arguments.
 */

import type { CLIOption } from "../cliType/cliType.type.js";
import { CLI_OPTION_PREFIXES } from "../cliConstant/cliConstant.value.js";
import {
  InvalidOptionError,
  MissingOptionValueError,
} from "../cliError/cliError.option.js";
import { assignOptionValue } from "./cliParser.longOption.js";

/** Parses a short option token from the token stream. */
export function parseShortOption(
  tokens: readonly string[],
  index: number,
  definitions: readonly CLIOption[],
  values: Record<string, unknown>,
  allowUnknownOptions: boolean,
): number {
  const token = tokens[index]!;
  const raw = token.slice(CLI_OPTION_PREFIXES.SHORT.length);

  if (raw === "") {
    throw new InvalidOptionError(token);
  }

  if (raw.length > 1) {
    const firstChar = raw[0]!;
    const firstDefinition = findShortOption(firstChar, definitions);

    if (firstDefinition?.type !== "boolean") {
      const attachedValue = raw.slice(1);
      if (firstDefinition) {
        assignOptionValue(firstDefinition, attachedValue, values);
        return index + 1;
      }
      if (allowUnknownOptions) {
        values[firstChar] = attachedValue;
        return index + 1;
      }
      throw new InvalidOptionError(token);
    }

    for (let offset = 0; offset < raw.length; offset++) {
      const short = raw[offset]!;
      const definition = findShortOption(short, definitions);

      if (!definition) {
        if (!allowUnknownOptions) {
          throw new InvalidOptionError(`-${short}`);
        }
        values[short] = true;
        continue;
      }

      if (definition.type !== "boolean") {
        const attachedValue = raw.slice(offset + 1);
        if (attachedValue) {
          assignOptionValue(definition, attachedValue, values);
          return index + 1;
        }
        if (tokens[index + 1] === undefined) {
          throw new MissingOptionValueError(`-${short}`);
        }
        assignOptionValue(definition, tokens[index + 1]!, values);
        return index + 2;
      }

      values[definition.name] = true;
    }

    return index + 1;
  }

  const definition = findShortOption(raw, definitions);

  if (!definition) {
    if (!allowUnknownOptions) {
      throw new InvalidOptionError(token);
    }
    values[raw] = true;
    return index + 1;
  }

  if (definition.type === "boolean") {
    values[definition.name] = true;
    return index + 1;
  }

  if (tokens[index + 1] === undefined) {
    throw new MissingOptionValueError(token);
  }

  assignOptionValue(definition, tokens[index + 1]!, values);
  return index + 2;
}

/** Finds an option by its short flag. */
function findShortOption(
  short: string,
  definitions: readonly CLIOption[],
): CLIOption | undefined {
  return definitions.find((d) => d.short === short);
}
