/**
 * zudojs-cli — Command Help
 *
 * Renders the help block for one command: its usage line, aliases,
 * positional arguments and options, with shorts and defaults.
 */

import type {
  CLIArgument,
  CLICommand,
  CLIOption,
  CLIWriter,
} from "../cliType/cliType.type.js";
import {
  CLI_FORMAT,
  CLI_HELP,
  CLI_OPTION_PREFIXES,
  CLI_SYMBOLS,
} from "../cliConstant/cliConstant.value.js";

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/** Renders one positional as it appears in the usage line. */
function formatArgumentToken(argument: CLIArgument): string {
  const name = argument.variadic ? `${argument.name}...` : argument.name;
  return argument.required ? `<${name}>` : `[<${name}>]`;
}

/** Renders the flag column of one option, e.g. `-t, --type <string>`. */
function formatOptionFlags(option: CLIOption): string {
  const short = option.short
    ? `${CLI_OPTION_PREFIXES.SHORT}${option.short}, `
    : "";
  const long = `${CLI_OPTION_PREFIXES.LONG}${option.name}`;
  const placeholder =
    option.type === "boolean" ? "" : ` <${option.type ?? "string"}>`;
  return `${short}${long}${placeholder}`;
}

/** Renders the description column of one option. */
function formatOptionDescription(option: CLIOption): string {
  const parts: string[] = [];
  if (option.description) parts.push(option.description);
  if (option.defaultValue !== undefined) {
    parts.push(`(default: ${String(option.defaultValue)})`);
  }
  return parts.join(" ");
}

/** Renders `<term>  <description>` rows on a common column. */
function formatRows(
  rows: readonly (readonly [string, string])[],
): readonly string[] {
  const width = rows.reduce((max, [term]) => Math.max(max, term.length), 0);
  return rows.map(([term, description]) =>
    description
      ? `${CLI_FORMAT.INDENT}${term.padEnd(width)}${CLI_FORMAT.INDENT}${description}`
      : `${CLI_FORMAT.INDENT}${term}`,
  );
}

/* -------------------------------------------------------------------------- */
/* Command Help                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Prints the help block for a single command.
 *
 * Reached by `zudojs <command> --help`, `zudojs <command> -h` and
 * `zudojs help <command>`. The first two used to be handed to the parser,
 * which rejected `--help` as an undeclared option and exited 2, so no
 * command's flags could be discovered from the CLI.
 */
export function printCommandHelp(
  writer: CLIWriter,
  applicationName: string,
  command: CLICommand,
): void {
  const args = command.arguments ?? [];
  const options = command.options ?? [];
  const lines: string[] = [];

  const usage = [
    applicationName,
    command.name,
    ...args.map(formatArgumentToken),
    `[${CLI_SYMBOLS.OPTION}s]`,
  ].join(" ");

  lines.push(CLI_HELP.USAGE, `${CLI_FORMAT.INDENT}${usage}`);

  if (command.description) {
    lines.push(
      CLI_FORMAT.EMPTY,
      CLI_HELP.DESCRIPTION,
      `${CLI_FORMAT.INDENT}${command.description}`,
    );
  }

  if (command.aliases?.length) {
    lines.push(
      CLI_FORMAT.EMPTY,
      CLI_HELP.ALIASES,
      `${CLI_FORMAT.INDENT}${command.aliases.join(", ")}`,
    );
  }

  lines.push(CLI_FORMAT.EMPTY, CLI_HELP.ARGUMENTS);

  if (args.length === 0) {
    lines.push(
      `${CLI_FORMAT.INDENT}None — this ${CLI_SYMBOLS.COMMAND} takes no positional ${CLI_SYMBOLS.ARGUMENT}s.`,
    );
  } else {
    lines.push(
      ...formatRows(
        args.map(
          (argument) =>
            [
              formatArgumentToken(argument),
              [
                argument.description ?? "",
                argument.defaultValue !== undefined
                  ? `(default: ${String(argument.defaultValue)})`
                  : "",
              ]
                .filter(Boolean)
                .join(" "),
            ] as const,
        ),
      ),
    );
  }

  lines.push(CLI_FORMAT.EMPTY, CLI_HELP.OPTIONS);
  lines.push(
    ...formatRows([
      ...options.map(
        (option) =>
          [formatOptionFlags(option), formatOptionDescription(option)] as const,
      ),
      ["-h, --help", `Show help for this ${CLI_SYMBOLS.COMMAND}.`] as const,
    ]),
  );

  writer.writeLine(lines.join(CLI_FORMAT.NEWLINE));
}
