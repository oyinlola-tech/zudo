/**
 * zudojs-cli — Recording a feature and reporting what `add` did.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import type { CLIContext } from "../../cliType/cliType.type.js";
import type { RecipeOutcome } from "./recipeApply.app.js";
import { mergePackageJson, type EditablePackageJson } from "./recipeApply.files.js";

/** Adds `feature` to an app's `zudojs.features`. */
export function recordFeature(pkgPath: string, feature: string): void {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as EditablePackageJson;
  mergePackageJson(pkg, { feature, dependencies: {} });
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

/**
 * Adds `feature` to the workspace root's `zudojs.features` when the root is
 * not itself an app that received it.
 *
 * A microservice root records the project's capabilities next to the
 * manifest, but `add` only wrote the apps, so the root list went stale
 * after the first `zudojs add`. Roots without a features list (fullstack)
 * are left alone. Returns whether the root was updated.
 */
export function recordProjectFeature(
  root: string,
  feature: string,
  targets: readonly string[],
): boolean {
  const pkgPath = join(root, "package.json");
  if (!existsSync(pkgPath) || targets.includes(pkgPath)) return false;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as EditablePackageJson;
  const block = pkg.zudojs as { features?: unknown } | undefined;
  if (!Array.isArray(block?.features) || block.features.includes(feature)) return false;
  block.features = [...block.features, feature];
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  return true;
}

/** Logs what was written, kept, edited and what is left to do by hand. */
export function reportOutcomes(
  logger: CLIContext["logger"],
  cwd: string,
  root: string,
  outcomes: readonly RecipeOutcome[],
): void {
  const rel = (path: string): string => relative(cwd, join(root, path)) || path;
  const list = (label: string, paths: readonly string[]): void => {
    const unique = [...new Set(paths)];
    if (unique.length === 0) return;
    logger.info(`${label}:\n${unique.map((p) => `  - ${rel(p)}`).join("\n")}`);
  };
  list("Created", outcomes.flatMap((o) => o.written));
  list("Updated", outcomes.flatMap((o) => o.edited));
  list("Kept (already present)", outcomes.flatMap((o) => o.kept));
  const manual = outcomes.flatMap((o) => o.manualSteps);
  if (manual.length > 0) {
    logger.warn(`Finish by hand:\n${manual.map((step) => `  - ${step}`).join("\n")}`);
  }
}
