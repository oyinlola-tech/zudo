/**
 * zudojs-cli — Project-level parts of `add`: project recipes (docker),
 * `.gitignore` lines and the pnpm build-script allow-list.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

/** Appends `.gitignore` lines and pnpm allow-list entries; returns the files changed. */
export async function applyProjectSettings(
  root: string,
  gitignore: readonly string[],
  allowBuilds: readonly string[],
): Promise<readonly string[]> {
  const edited: string[] = [];
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
