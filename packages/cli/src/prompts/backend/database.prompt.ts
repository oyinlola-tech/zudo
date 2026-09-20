/**
 * zudojs-cli — Database Prompt
 *
 * Prompts for database selection.
 */

import * as p from "@clack/prompts";
import { cancelled } from "../cancel.prompt.js";
import { DATABASE_CHOICES, DEFAULT_DATABASE } from "../../constants/index.js";
import type { DatabaseProvider } from "../../types/projectConfiguration.type.js";

export async function promptDatabase(
  overrides?: DatabaseProvider,
): Promise<DatabaseProvider> {
  const value =
    overrides ??
    (await p.select({
      message: "Select database",
      options: DATABASE_CHOICES.map((choice) => ({ ...choice })),
      initialValue: DEFAULT_DATABASE,
    }));

  return cancelled(value);
}
