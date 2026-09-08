/**
 * zudojs-cli — CLI Constants
 *
 * Default values, limits, and magic strings used across the CLI package.
 */

/* -------------------------------------------------------------------------- */
/* Application Defaults                                                       */
/* -------------------------------------------------------------------------- */

/** CLI application name. */
export const CLI_NAME = "zudojs";

/** Default application configuration. */
export const CLI_DEFAULTS = {
  NAME: "zudojs",
  VERSION: "0.1.2",
  DESCRIPTION: "Command-line interface for the Zudojs framework.",
  COMMAND_PREFIX: "zudojs",
  DEFAULT_CWD: process.cwd(),
  EXIT_CODE: 0,
} as const;

/* -------------------------------------------------------------------------- */
/* Built-in Commands                                                          */
/* -------------------------------------------------------------------------- */

/** Built-in command names. */
export const CLI_COMMANDS = {
  HELP: "help",
  VERSION: "version",
} as const;

/** Built-in command aliases. */
export const CLI_ALIASES = {
  HELP: ["-h", "--help"],
  VERSION: ["-v", "--version"],
} as const;

/* -------------------------------------------------------------------------- */
/* Option Prefixes                                                            */
/* -------------------------------------------------------------------------- */

/** Characters used to prefix options. */
export const CLI_OPTION_PREFIXES = {
  SHORT: "-",
  LONG: "--",
  VALUE_SEPARATOR: "=",
} as const;

/* -------------------------------------------------------------------------- */
/* Symbolic Names                                                             */
/* -------------------------------------------------------------------------- */

/** Internal symbolic names for CLI elements. */
export const CLI_SYMBOLS = {
  COMMAND: "command",
  OPTION: "option",
  ARGUMENT: "argument",
  HELP: "help",
  VERSION: "version",
} as const;

/* -------------------------------------------------------------------------- */
/* User-Facing Messages                                                       */
/* -------------------------------------------------------------------------- */

/** Standard CLI messages. */
export const CLI_MESSAGES = {
  COMMAND_NOT_FOUND: "Command not found.",
  INVALID_ARGUMENTS: "Invalid command arguments.",
  PERMISSION_DENIED: "Permission denied.",
  INTERRUPTED: "Process interrupted.",
  UNKNOWN_ERROR: "An unexpected error occurred.",
  MISSING_COMMAND: "A command is required.",
} as const;

/* -------------------------------------------------------------------------- */
/* Help Labels                                                                */
/* -------------------------------------------------------------------------- */

/** Labels used in help output. */
export const CLI_HELP = {
  USAGE: "Usage:",
  COMMANDS: "Commands:",
  OPTIONS: "Options:",
  ARGUMENTS: "Arguments:",
  ALIASES: "Aliases:",
  DESCRIPTION: "Description:",
  EXAMPLES: "Examples:",
} as const;

/* -------------------------------------------------------------------------- */
/* Environment                                                                */
/* -------------------------------------------------------------------------- */

/** Environment variable names. */
export const CLI_ENVIRONMENT = {
  NODE_ENV: "NODE_ENV",
  DEBUG: "DEBUG",
  CI: "CI",
} as const;

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/** Formatting constants. */
export const CLI_FORMAT = {
  INDENT: "  ",
  COMMAND_INDENT: "    ",
  OPTION_INDENT: "    ",
  NEWLINE: "\n",
  EMPTY: "",
} as const;

/* -------------------------------------------------------------------------- */
/* Limits                                                                     */
/* -------------------------------------------------------------------------- */

/** Validation limits. */
export const CLI_LIMITS = {
  MAX_COMMAND_NAME_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 500,
  MAX_ALIAS_LENGTH: 50,
  MAX_OPTION_NAME_LENGTH: 100,
  MAX_ARGUMENT_NAME_LENGTH: 100,
} as const;

/* -------------------------------------------------------------------------- */
/* Error Codes                                                                */
/* -------------------------------------------------------------------------- */

/** CLI-specific error code constants. */
export const CLI_ERROR_CODES = {
  COMMAND_NOT_FOUND: "CLI_COMMAND_NOT_FOUND",
  INVALID_ARGUMENTS: "CLI_INVALID_ARGUMENTS",
  INVALID_OPTION: "CLI_INVALID_OPTION",
  MISSING_ARGUMENT: "CLI_MISSING_ARGUMENT",
  MISSING_OPTION_VALUE: "CLI_MISSING_OPTION_VALUE",
  DUPLICATE_COMMAND: "CLI_DUPLICATE_COMMAND",
  DUPLICATE_OPTION: "CLI_DUPLICATE_OPTION",
  INVALID_COMMAND_NAME: "CLI_INVALID_COMMAND_NAME",
  INVALID_OPTION_NAME: "CLI_INVALID_OPTION_NAME",
  EXECUTION_FAILED: "CLI_EXECUTION_FAILED",
  INTERRUPTED: "CLI_INTERRUPTED",
  PERMISSION_DENIED: "CLI_PERMISSION_DENIED",
  CONFIGURATION_ERROR: "CLI_CONFIGURATION_ERROR",
  UNKNOWN_ERROR: "CLI_UNKNOWN_ERROR",
} as const;

/** CLI exit codes. */
export const CLI_EXIT_CODES = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  INVALID_ARGUMENTS: 2,
  COMMAND_NOT_FOUND: 3,
  PERMISSION_DENIED: 4,
  INTERRUPTED: 130,
} as const;

/** CLI exit code type. */
export type CLIExitCode = (typeof CLI_EXIT_CODES)[keyof typeof CLI_EXIT_CODES];

/** CLI error code type. */
export type CLIErrorCode =
  (typeof CLI_ERROR_CODES)[keyof typeof CLI_ERROR_CODES];

/** CLI command name type. */
export type CLICommandName = (typeof CLI_COMMANDS)[keyof typeof CLI_COMMANDS];
