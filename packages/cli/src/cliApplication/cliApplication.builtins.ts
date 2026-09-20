/**
 * zudojs-cli — Built-in Commands
 *
 * Help and version request detection and output.
 */

import type { CLIArguments, CLIWriter } from "../cliType/cliType.type.js";
import {
  CLI_ALIASES,
  CLI_COMMANDS,
  CLI_DEFAULTS,
  CLI_FORMAT,
  CLI_HELP,
  CLI_SYMBOLS,
} from "../cliConstant/cliConstant.value.js";

/** Returns whether a single token is a help flag (`-h` or `--help`). */
export function isHelpFlag(token: string): boolean {
  return (CLI_ALIASES.HELP as readonly string[]).includes(token);
}

/** Returns whether a single token is a version flag (`-v` or `--version`). */
export function isVersionFlag(token: string): boolean {
  return (CLI_ALIASES.VERSION as readonly string[]).includes(token);
}

/**
 * Returns whether the args are a help request.
 *
 * Only the first argument is considered so that command-specific flags
 * (e.g. `zudojs create -h ...`) are not swallowed by the global handler.
 */
export function isHelpRequest(args: CLIArguments): boolean {
  const first = args[0];
  if (first === undefined) return false;
  return first === CLI_COMMANDS.HELP || isHelpFlag(first);
}

/**
 * Returns whether the args are a version request.
 *
 * Only the first argument is considered.
 */
export function isVersionRequest(args: CLIArguments): boolean {
  const first = args[0];
  if (first === undefined) return false;
  return first === CLI_COMMANDS.VERSION || isVersionFlag(first);
}

/** Prints the version string. */
export function printVersion(writer: CLIWriter, version?: string): void {
  writer.writeLine(version ?? CLI_DEFAULTS.VERSION);
}

/** Prints application help. */
export function printHelp(
  writer: CLIWriter,
  name: string,
  version?: string,
  description?: string,
  commands: readonly {
    name: string;
    aliases?: readonly string[];
    description?: string;
  }[] = [],
): void {
  const lines: string[] = [];
  lines.push(`${name} ${version ? `v${version}` : ""}`.trim());

  if (description) lines.push(description);

  lines.push(
    CLI_FORMAT.EMPTY,
    CLI_HELP.USAGE,
    `${CLI_FORMAT.INDENT}${name} <${CLI_SYMBOLS.COMMAND}> [${CLI_SYMBOLS.OPTION}s]`,
    CLI_FORMAT.EMPTY,
    CLI_HELP.COMMANDS,
  );

  const sorted = commands.slice().sort((a, b) => a.name.localeCompare(b.name));

  if (sorted.length === 0) {
    lines.push(`${CLI_FORMAT.INDENT}No commands registered.`);
  } else {
    const width = sorted.reduce(
      (max, cmd) => Math.max(max, formatCommandTerm(cmd).length),
      0,
    );
    for (const cmd of sorted) {
      const term = formatCommandTerm(cmd).padEnd(width);
      lines.push(
        `${CLI_FORMAT.INDENT}${term}${cmd.description ? `${CLI_FORMAT.INDENT}${cmd.description}` : ""}`.trimEnd(),
      );
    }
  }

  lines.push(
    CLI_FORMAT.EMPTY,
    CLI_HELP.OPTIONS,
    `${CLI_FORMAT.INDENT}-h, --help     Show help.`,
    `${CLI_FORMAT.INDENT}-v, --version  Show version.`,
    CLI_FORMAT.EMPTY,
    `Run "${name} ${CLI_COMMANDS.HELP} <${CLI_SYMBOLS.COMMAND}>" for help on one ${CLI_SYMBOLS.COMMAND}.`,
  );

  writer.writeLine(lines.join(CLI_FORMAT.NEWLINE));
}

/** Renders a command's name and aliases for the command list. */
function formatCommandTerm(cmd: {
  name: string;
  aliases?: readonly string[];
}): string {
  return cmd.aliases?.length
    ? `${cmd.name} (${cmd.aliases.join(", ")})`
    : cmd.name;
}
