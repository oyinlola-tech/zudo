/**
 * zudojs-cli — API Style Prompt
 *
 * Prompts for API style selection.
 */

import * as p from "@clack/prompts";
import { cancelled } from "../cancel.prompt.js";
import type { ApiStyle } from "../../types/projectConfiguration.type.js";

export async function promptApiStyle(overrides?: ApiStyle): Promise<ApiStyle> {
  const value =
    overrides ??
    (await p.select({
      message: "Select API style",
      options: [
        {
          value: "rest",
          label: "REST",
          hint: "Recommended",
        },
        {
          value: "graphql",
          label: "GraphQL",
          hint: "Flexible query language",
        },
        {
          value: "rpc",
          label: "RPC",
          hint: "Remote procedure calls",
        },
      ],
      initialValue: "rest",
    }));

  return cancelled(value);
}
