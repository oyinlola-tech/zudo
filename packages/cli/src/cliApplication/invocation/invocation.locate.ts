/**
 * zudojs-cli — Command Location
 *
 * Finds the command token in an argument list and rejects the shapes that
 * used to be silently misread.
 */

import type { CLIArguments, CLICommand } from "../../cliType/cliType.type.js";
import {
  CLI_MESSAGES,
  CLI_OPTION_PREFIXES,
} from "../../cliConstant/cliConstant.value.js";
import { CommandNotFoundError } from "../../cliError/cliError.command.js";
import { InvalidArgumentsError } from "../../cliError/cliError.argument.js";
import { resolveCommand } from "../../cliParser/cliParser.helper.js";

/** Where the command sits in an argument list. */
export interface CommandLocation {
  /** Index of the first non-flag token, or -1 when there is none. */
  readonly index: number;
  /** The command that token names, when it names one. */
  readonly command?: CLICommand;
}

/**
 * Locates the command without throwing.
 *
 * Only the first non-flag token can be the command. Scanning every token
 * used to run `zudojs creat dev` as `dev` and `zudojs bogus info` as `info`,
 * exiting 0 for a command line that contained a typo.
 */
export function locateCommand(
  args: CLIArguments,
  commands: readonly CLICommand[],
): CommandLocation {
  const index = args.findIndex(
    (arg) => !arg.startsWith(CLI_OPTION_PREFIXES.SHORT),
  );
  if (index < 0) return { index };
  const command = resolveCommand(commands, args[index]!);
  return command ? { index, command } : { index };
}

/**
 * Locates the command and throws a usage error when the line is malformed.
 *
 * @param name - The invoked executable name, used in the message.
 * @throws {InvalidArgumentsError} No command, or options before the command.
 * @throws {CommandNotFoundError} The command token is not registered.
 */
export function requireCommand(
  args: CLIArguments,
  commands: readonly CLICommand[],
  name: string,
): { readonly index: number; readonly command: CLICommand } {
  const location = locateCommand(args, commands);

  if (location.index < 0) {
    // Only flags: a lone `-vh` must not be reported as a command named "-vh".
    throw new InvalidArgumentsError(CLI_MESSAGES.MISSING_COMMAND);
  }

  if (location.index > 0) {
    // `zudojs --verbose info` used to drop `--verbose` without a word, and
    // `zudojs -p 3000 dev` reported a command named "3000".
    const leading = args[0]!;
    const later = args
      .slice(location.index)
      .map((arg) => resolveCommand(commands, arg))
      .find((command) => command !== undefined);
    throw new InvalidArgumentsError(
      `Unexpected option "${leading}" before the command. Options go after the command name: "${name} ${later?.name ?? "<command>"} ${leading}".`,
    );
  }

  if (!location.command) {
    throw new CommandNotFoundError(args[location.index]!);
  }

  return { index: location.index, command: location.command };
}
