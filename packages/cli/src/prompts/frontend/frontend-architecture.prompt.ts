/**
 * zudojs-cli — Frontend Architecture Prompt
 *
 * Prompts for frontend project structure.
 */

import * as p from "@clack/prompts";
import { cancelled } from "../cancel.prompt.js";
import type { FrontendArchitecture } from "../../types/projectConfiguration.type.js";

export async function promptFrontendArchitecture(
  overrides?: FrontendArchitecture,
): Promise<FrontendArchitecture> {
  const value =
    overrides ??
    (await p.select({
      message: "Select frontend architecture",
      options: [
        {
          value: "zudojs-standard",
          label: "Zudojs Standard",
          hint: "Global folders for shared concerns",
        },
        {
          value: "feature-based",
          label: "Feature Based",
          hint: "Organized by feature",
        },
        {
          value: "minimal",
          label: "Minimal",
          hint: "Minimal folder structure",
        },
        {
          value: "framework-default",
          label: "Framework Default",
          hint: "Use framework defaults",
        },
      ],
      initialValue: "zudojs-standard",
    }));

  return cancelled(value);
}
