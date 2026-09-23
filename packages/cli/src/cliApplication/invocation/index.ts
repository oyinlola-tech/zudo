/**
 * zudojs-cli — Invocation
 *
 * How the CLI was invoked: the executable name the user typed, where the
 * command sits in the argument list, and the hints printed under a usage
 * error.
 */

export {
  CLI_BIN_NAMES,
  resolveInvokedName,
  localizeCommandName,
} from "./invocation.name.js";
export {
  locateCommand,
  requireCommand,
  type CommandLocation,
} from "./invocation.locate.js";
export { escapeControlCharacters } from "./invocation.sanitize.js";
export {
  suggestCommand,
  failureHints,
  type FailureHintInput,
} from "./invocation.hint.js";
