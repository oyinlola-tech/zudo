/**
 * zudojs-cli — Binary Menu
 *
 * Opens the interactive menu with the real terminal, project detection
 * and the schematic and feature lists `generate` and `add` accept.
 */

import * as p from "@clack/prompts";
import {
  CLI_VERSION,
  FEATURE_CHOICES,
  SCHEMA_CHOICES,
} from "../constants/index.js";
import {
  createTerminalMenuPrompter,
  runMenuFlow,
  type MenuOutcome,
  type MenuProjectScope,
} from "../prompts/menu/index.js";
import { findProjectRoot } from "../resolvers/project.resolver.js";
import { resolveProjectLayout } from "../resolvers/layout/projectLayout.core.js";

/**
 * Detects a project the way the entry's command will.
 *
 * `dev` and `add` read only the current directory; `build` and `generate`
 * walk up to the nearest project root.
 */
export function isZudojsProject(cwd: string, scope: MenuProjectScope): boolean {
  return scope === "cwd"
    ? resolveProjectLayout(cwd) !== null
    : findProjectRoot(cwd) !== null;
}

/**
 * Shows the menu on the process's terminal.
 *
 * @param name - The executable name the user typed.
 * @param cwd - The directory commands will run in.
 */
export async function openMainMenu(
  name: string,
  cwd: string,
): Promise<MenuOutcome> {
  p.intro(`${name} v${CLI_VERSION}`);
  return runMenuFlow({
    prompter: createTerminalMenuPrompter(),
    cwd,
    name,
    isProject: isZudojsProject,
    schematics: SCHEMA_CHOICES,
    features: FEATURE_CHOICES,
  });
}
