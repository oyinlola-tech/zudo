/**
 * zudojs-cli — Menu Prompter
 *
 * The terminal implementation of `MenuPrompter`: the numbered select for
 * the menu itself and `@clack/prompts` for the follow-up questions.
 */

import * as p from "@clack/prompts";
import type { CLIChoiceOption } from "../../constants/index.js";
import { numberedSelect, type NumberedSelectIO } from "./menu.select.js";
import {
  MENU_CANCEL,
  type MenuCancel,
  type MenuPrompter,
} from "./menu.type.js";

/**
 * Maps clack's cancel symbol onto the menu's own sentinel.
 *
 * Both follow-up prompts answer with a string, so anything else is the
 * cancel symbol; narrowing on `string` avoids TypeScript 7 inferring the
 * clack symbol into a generic parameter (see `cancelled`).
 */
function orCancel(value: string | symbol): string | MenuCancel {
  return typeof value === "string" && !p.isCancel(value) ? value : MENU_CANCEL;
}

/**
 * Creates the prompter the binary uses.
 *
 * @param io - Streams to read keys from and draw on; defaults to the
 *   process's stdin and stdout.
 */
export function createTerminalMenuPrompter(
  io: NumberedSelectIO = { input: process.stdin, output: process.stdout },
): MenuPrompter {
  return {
    choose: (items) => numberedSelect(items, io),

    async select(message: string, choices: readonly CLIChoiceOption[]) {
      const value = await p.select<string>({
        message,
        options: choices.map((choice) => ({
          value: choice.value,
          label: choice.label,
          ...(choice.hint ? { hint: choice.hint } : {}),
        })),
      });
      return orCancel(value);
    },

    async text(message, placeholder, validate) {
      const value = await p.text({
        message,
        placeholder,
        validate: (input) => validate(input ?? ""),
      });
      return orCancel(value);
    },

    warn(message: string): void {
      p.log.warn(message);
    },

    cancel(message: string): void {
      p.cancel(message);
    },
  };
}
