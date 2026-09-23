/**
 * zudojs-cli — Invoked Name
 *
 * Works out which executable name the user typed (`zudojs` or `zudo`) so
 * help, usage and error output can repeat it back.
 */

import { basename } from "node:path";
import { CLI_NAME } from "../../cliConstant/cliConstant.value.js";

/**
 * Executable names the CLI is installed under.
 *
 * `zudojs` is the canonical name; `zudo` is the short alias both the
 * `zudojs-cli` and `zudojs` packages put on the PATH.
 */
export const CLI_BIN_NAMES: readonly string[] = Object.freeze([
  CLI_NAME,
  "zudo",
]);

/** Script extensions stripped before the name is compared. */
const SCRIPT_EXTENSION = /\.(?:[cm]?[jt]s|cmd|ps1|exe)$/i;

/** Tokens that may follow the CLI name in a command example. */
const BUILTIN_WORDS: readonly string[] = Object.freeze([
  "help",
  "version",
  "--help",
  "-h",
  "--version",
  "-v",
  "<command>",
]);

/**
 * Returns the executable name the CLI was started as.
 *
 * Reads the basename of the script path (`process.argv[1]`). Anything that
 * is not a known executable name — `node dist/src/bin/zudojs.js`, a Windows
 * npm shim, a bundler's `index.js` — falls back to the canonical `zudojs`.
 *
 * @param scriptPath - Usually `process.argv[1]`.
 * @param known - Accepted executable names.
 */
export function resolveInvokedName(
  scriptPath: string | undefined,
  known: readonly string[] = CLI_BIN_NAMES,
): string {
  if (!scriptPath) return CLI_NAME;
  const name = basename(scriptPath.replace(/\\/g, "/")).replace(
    SCRIPT_EXTENSION,
    "",
  );
  return known.includes(name) ? name : CLI_NAME;
}

/** Escapes a string for literal use inside a regular expression. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rewrites command examples in a message to use the name the user typed.
 *
 * Only `zudojs` directly followed by a command word is rewritten, so
 * `zudojs-cli`, `@zudojs/core` and prose such as "the zudojs block in
 * package.json" are left alone.
 *
 * @param text - The message to rewrite.
 * @param displayName - The invoked executable name.
 * @param commandWords - Registered command names and aliases.
 */
export function localizeCommandName(
  text: string,
  displayName: string,
  commandWords: readonly string[],
): string {
  if (displayName === CLI_NAME || !text.includes(CLI_NAME)) return text;
  const words = [...commandWords, ...BUILTIN_WORDS].map(escapeRegExp);
  const pattern = new RegExp(
    `(?<![\\w@/.-])${CLI_NAME}(?=\\s+(?:${words.join("|")})(?![\\w-]))`,
    "g",
  );
  return text.replace(pattern, displayName);
}
