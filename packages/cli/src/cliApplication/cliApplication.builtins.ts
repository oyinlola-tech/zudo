/**
 * zudojs-cli — Built-in Commands
 *
 * Help and version request detection and output.
 */

import type {
  CLIArguments,
  CLIContext,
  CLIWriter,
} from "../cliType/cliType.type.js";
import {
  CLI_COMMANDS,
  CLI_DEFAULTS,
} from "../cliConstant/cliConstant.value.js";

/**
 * Returns whether the args are a help request.
 *
 * Only the first argument is considered so that command-specific flags
 * (e.g. `zudojs create -h ...`) are not swallowed by the global handler.
 */
export function isHelpRequest(args: CLIArguments): boolean {
  const first = args[0];
  return first === CLI_COMMANDS.HELP || first === "-h" || first === "--help";
}

/**
 * Returns whether the args are a version request.
 *
 * Only the first argument is considered.
 */
export function isVersionRequest(args: CLIArguments): boolean {
  const first = args[0];
  return (
    first === CLI_COMMANDS.VERSION || first === "-v" || first === "--version"
  );
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

  lines.push("", "Usage:", `  ${name} <command> [options]`, "", "Commands:");

  const sorted = commands.slice().sort((a, b) => a.name.localeCompare(b.name));

  if (sorted.length === 0) {
    lines.push("  No commands registered.");
  } else {
    for (const cmd of sorted) {
      const aliases = cmd.aliases?.length ? ` (${cmd.aliases.join(", ")})` : "";
      lines.push(
        `  ${cmd.name}${aliases}${cmd.description ? `  ${cmd.description}` : ""}`,
      );
    }
  }

  lines.push(
    "",
    "Options:",
    "  -h, --help     Show help.",
    "  -v, --version  Show version.",
  );

  writer.writeLine(lines.join("\n"));
}
