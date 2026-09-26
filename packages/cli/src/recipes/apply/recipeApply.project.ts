/**
 * zudojs-cli — Project-level parts of `add`: project recipes (docker),
 * `.gitignore` lines and the pnpm build-script allow-list.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { detectPackageManager } from "../../resolvers/layout/projectLayout.core.js";
import { writeFile } from "../../utils/utils.fileSystem.js";
import type { ProjectRecipe, ProjectRecipeContext } from "../recipe.type.js";
import type { RecipeOutcome } from "./recipeApply.app.js";
import { withAllowedBuilds, withEnvVariables, withGitignoreLines } from "./recipeApply.files.js";

/** Writes a project recipe's files (keeping existing ones) and env. */
export async function applyProjectRecipe(
  recipe: ProjectRecipe,
  context: ProjectRecipeContext,
): Promise<RecipeOutcome> {
  const written: string[] = [];
  const kept: string[] = [];
  const edited: string[] = [];

  for (const [path, content] of Object.entries(recipe.files(context))) {
    if (existsSync(join(context.root, path))) {
      kept.push(path);
    } else {
      await writeFile(context.root, path, content);
      written.push(path);
    }
  }

  const env = recipe.env?.(context) ?? [];
  if (env.length > 0) {
    const path = join(context.root, ".env.example");
    const next = withEnvVariables(existsSync(path) ? readFileSync(path, "utf-8") : "", env);
    if (next !== undefined) {
      await writeFile(context.root, ".env.example", next);
      edited.push(".env.example");
    }
  }

  return { written, kept, edited, manualSteps: [] };
}

/**
 * Appends `.gitignore` lines, pnpm allow-list entries and dependency
 * overrides; returns the files changed.
 */
export async function applyProjectSettings(
  root: string,
  gitignore: readonly string[],
  allowBuilds: readonly string[],
  overrides: Readonly<Record<string, string>> = {},
): Promise<readonly string[]> {
  const edited: string[] = [];
  const overridden = await withDependencyOverrides(root, overrides);
  if (overridden !== undefined) edited.push(overridden);
  const ignorePath = join(root, ".gitignore");
  const ignore = withGitignoreLines(existsSync(ignorePath) ? readFileSync(ignorePath, "utf-8") : "", gitignore);
  if (ignore !== undefined) {
    await writeFile(root, ".gitignore", ignore);
    edited.push(".gitignore");
  }
  const workspace = withAllowedBuilds(root, allowBuilds);
  if (workspace !== undefined) {
    await writeFile(root, "pnpm-workspace.yaml", workspace);
    edited.push("pnpm-workspace.yaml");
  }
  return edited;
}

/**
 * Writes `overrides` where the project's package manager reads them: the
 * `overrides:` block of `pnpm-workspace.yaml` (pnpm 11 no longer reads
 * `pnpm.overrides` from package.json), `overrides` in the root package.json
 * for npm and bun, `resolutions` for yarn. An entry the project already has
 * is left alone. Returns the file edited, if any.
 */
export async function withDependencyOverrides(
  root: string,
  overrides: Readonly<Record<string, string>>,
): Promise<string | undefined> {
  const entries = Object.entries(overrides);
  if (entries.length === 0) return undefined;
  const packageManager = detectPackageManager(root);

  if (packageManager === "pnpm") {
    const path = join(root, "pnpm-workspace.yaml");
    let source = existsSync(path) ? readFileSync(path, "utf-8") : "";
    const original = source;
    const missing = entries.filter(([name]) => !new RegExp(`^  ${JSON.stringify(name)}:`, "m").test(source));
    if (missing.length > 0 && !/^overrides:\s*$/m.test(source)) {
      source = `${source}${source === "" || source.endsWith("\n") ? "" : "\n"}\n# Transitive dependencies raised to versions without published advisories.\noverrides:\n`;
    }
    for (const [name, range] of missing) {
      source = source.replace(/^overrides:\s*$/m, `overrides:\n  ${JSON.stringify(name)}: ${JSON.stringify(range)}`);
    }
    if (source === original) return undefined;
    await writeFile(root, "pnpm-workspace.yaml", source);
    return "pnpm-workspace.yaml";
  }

  const key = packageManager === "yarn" ? "resolutions" : "overrides";
  const path = join(root, "package.json");
  if (!existsSync(path)) return undefined;
  const pkg = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  const current = { ...((pkg[key] as Record<string, string> | undefined) ?? {}) };
  let changed = false;
  for (const [name, range] of entries) {
    if (name in current) continue;
    current[name] = range;
    changed = true;
  }
  if (!changed) return undefined;
  pkg[key] = current;
  await writeFile(root, "package.json", `${JSON.stringify(pkg, null, 2)}\n`);
  return "package.json";
}
