/**
 * CLI binding: parses command-line arguments into operation input, runs
 * the operation, prints the result as JSON, and returns an exit code. No
 * dependency on any CLI framework.
 */

export type { APICliInvocation, APICliIO, APICliOptions } from "./apiCli.binding.js";

export { runApiCli } from "./apiCli.binding.js";

export type { APICliParseResult } from "./apiCli.argv.js";

export { parseApiCliArgs } from "./apiCli.argv.js";

export type { APICliExitCodeValue } from "./apiCli.exitCode.js";

export { APICliExitCode, apiCliExitCodeForStatus } from "./apiCli.exitCode.js";
