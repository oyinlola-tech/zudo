/**
 * zudojs-cli — Failure Hints
 *
 * The follow-up lines printed under an error: a "did you mean" for a
 * mistyped command and a pointer to the right help page.
 */

import type { CLICommand } from "../../cliType/cliType.type.js";
import { CLI_EXIT_CODES } from "../../cliConstant/cliConstant.value.js";

/** The largest edit distance still offered as a suggestion. */
const MAX_SUGGESTION_DISTANCE = 2;

/** Levenshtein distance between two short strings. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + cost,
      );
    }
    previous = current;
  }
  return previous[b.length]!;
}

/**
 * Returns the registered command a mistyped name most likely meant.
 *
 * @param input - What the user typed.
 * @param commands - Registered commands.
 */
export function suggestCommand(
  input: string,
  commands: readonly CLICommand[],
): string | undefined {
  const typed = input.trim().toLowerCase();
  if (typed.length < 2) return undefined;

  let best: { readonly name: string; readonly distance: number } | undefined;
  for (const command of commands) {
    for (const word of [command.name, ...(command.aliases ?? [])]) {
      // One-letter aliases (`b`, `d`, `g`) are one edit from everything.
      if (word.length < 2) continue;
      const distance = word.startsWith(typed) ? 1 : editDistance(typed, word);
      if (distance > MAX_SUGGESTION_DISTANCE) continue;
      if (best === undefined || distance < best.distance) {
        best = { name: word, distance };
      }
    }
  }
  return best?.name;
}

/** What a failure hint is built from. */
export interface FailureHintInput {
  readonly name: string;
  readonly exitCode: number;
  readonly command?: CLICommand;
  readonly unknownCommand?: string;
  readonly commands: readonly CLICommand[];
}

/**
 * Returns the hint lines printed after an error message.
 *
 * Only usage errors get hints: a failure inside a command already says
 * what went wrong, and a help pointer would be noise there.
 */
/**
 * Commands people expect from a framework CLI that are the project's own
 * scripts instead. `zudojs migrate` used to exit 3 with nothing but "not
 * found", while the migration scripts had been added by `zudojs add
 * database` all along.
 */
const SCRIPT_HINTS: Readonly<Record<string, string>> = Object.freeze({
  migrate:
    'Migrations run through the project\'s scripts, added by "zudojs add database": ' +
    '"<pm> run db:migrate" in development, "<pm> run db:deploy" in production (pm: pnpm, npm, yarn or bun).',
  test: 'Tests run through the project\'s own script: "<pm> run test" (pm: pnpm, npm, yarn or bun).',
  start: 'A built project starts with its own script: "<pm> run build", then "<pm> run start".',
});

export function failureHints(input: FailureHintInput): readonly string[] {
  if (input.exitCode === CLI_EXIT_CODES.COMMAND_NOT_FOUND) {
    const suggestion =
      input.unknownCommand === undefined
        ? undefined
        : suggestCommand(input.unknownCommand, input.commands);
    const script =
      input.unknownCommand === undefined ? undefined : SCRIPT_HINTS[input.unknownCommand];
    return [
      ...(script ? [script] : []),
      ...(suggestion ? [`Did you mean "${input.name} ${suggestion}"?`] : []),
      `Run "${input.name} --help" to see all commands.`,
    ];
  }

  if (input.exitCode === CLI_EXIT_CODES.INVALID_ARGUMENTS) {
    return [
      input.command
        ? `Run "${input.name} ${input.command.name} --help" for usage.`
        : `Run "${input.name} --help" for usage.`,
    ];
  }

  return [];
}
