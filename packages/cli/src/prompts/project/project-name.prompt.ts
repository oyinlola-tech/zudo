/**
 * zudojs-cli — Project Name Prompt
 *
 * Prompts for the project name.
 */

import * as p from "@clack/prompts";
import { cancelled } from "../cancel.prompt.js";

export async function promptProjectName(overrides?: string): Promise<string> {
  const value =
    overrides ??
    (await p.text({
      message: "What is your project name?",
      placeholder: "my-project",
      validate(value) {
        if (!value || value.trim().length === 0) {
          return "Project name is required.";
        }
        // A leading "-" made a directory that `cd -dash` cannot enter and
        // `rm -rf -dash` cannot remove, so the first character is alphanumeric.
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(value)) {
          return "Must start with a letter or digit; only alphanumeric characters, hyphens, and underscores are allowed.";
        }
      },
    }));

  return cancelled(value);
}
