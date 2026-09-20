/**
 * zudojs-cli — Confirmation Prompt
 *
 * Prompts for confirmation before generation.
 */

import * as p from "@clack/prompts";
import { cancelled } from "../cancel.prompt.js";

export async function promptConfirmation(
  message: string,
  initialValue = true,
): Promise<boolean> {
  const value = await p.confirm({
    message,
    initialValue,
  });

  return cancelled(value);
}
