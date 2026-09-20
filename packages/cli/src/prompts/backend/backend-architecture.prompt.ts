/**
 * zudojs-cli — Backend Architecture Prompt
 *
 * Prompts for backend architecture selection.
 */

import * as p from "@clack/prompts";
import { cancelled } from "../cancel.prompt.js";
import {
  ARCHITECTURE_CHOICES,
  DEFAULT_ARCHITECTURE,
} from "../../constants/index.js";
import type { BackendArchitecture } from "../../types/projectConfiguration.type.js";

export async function promptBackendArchitecture(
  overrides?: BackendArchitecture,
): Promise<BackendArchitecture> {
  const value =
    overrides ??
    (await p.select({
      message: "Select backend architecture",
      options: ARCHITECTURE_CHOICES.map((choice) => ({ ...choice })),
      initialValue: DEFAULT_ARCHITECTURE,
    }));

  return cancelled(value);
}
