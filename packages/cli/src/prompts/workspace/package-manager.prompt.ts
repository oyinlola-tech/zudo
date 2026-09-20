/**
 * zudojs-cli — Package Manager Prompt
 *
 * Prompts for package manager selection.
 */

import * as p from "@clack/prompts";
import { cancelled } from "../cancel.prompt.js";
import {
  DEFAULT_PACKAGE_MANAGER,
  PACKAGE_MANAGER_CHOICES,
} from "../../constants/index.js";
import type { PackageManagerType } from "../../types/projectConfiguration.type.js";

export async function promptPackageManager(
  overrides?: PackageManagerType,
): Promise<PackageManagerType> {
  const value =
    overrides ??
    (await p.select({
      message: "Select package manager",
      options: PACKAGE_MANAGER_CHOICES.map((choice) => ({ ...choice })),
      initialValue: DEFAULT_PACKAGE_MANAGER,
    }));

  return cancelled(value);
}
