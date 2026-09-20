/**
 * zudojs-cli — Project Type Prompt
 *
 * Prompts for the project type.
 */

import * as p from "@clack/prompts";
import { cancelled } from "../cancel.prompt.js";
import type { ProjectType } from "../../types/projectConfiguration.type.js";

export async function promptProjectType(
  overrides?: ProjectType,
): Promise<ProjectType> {
  const value =
    overrides ??
    (await p.select({
      message: "What are you building?",
      options: [
        {
          value: "backend",
          label: "Backend",
          hint: "Server-side application",
        },
        {
          value: "frontend",
          label: "Frontend",
          hint: "Web or mobile application",
        },
        {
          value: "fullstack",
          label: "Full Stack",
          hint: "Frontend and backend",
        },
      ],
    }));

  return cancelled(value);
}
