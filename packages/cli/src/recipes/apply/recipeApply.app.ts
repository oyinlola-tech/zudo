/**
 * zudojs-cli — Applying an app recipe to one backend app.
 *
 * Writes the integration file and the recipe's extra files when they are
 * missing, registers the integration, config section and server lines
 * between their markers, and merges `.env.example` and `package.json`.
 * Files that exist are kept, never overwritten; a missing marker becomes a
 * manual step instead of an edit.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { writeFile } from "../../utils/utils.fileSystem.js";
import { MARKERS, applyMarkerEdits, type MarkerEdit } from "../../wiring/index.js";
import type { AppRecipe, RecipeContext } from "../recipe.type.js";
import { mergePackageJson, withEnvVariables, type EditablePackageJson } from "./recipeApply.files.js";

/** What applying a recipe to one app did. */
export interface RecipeOutcome {
  readonly written: readonly string[];
  readonly kept: readonly string[];
  readonly edited: readonly string[];
  readonly manualSteps: readonly string[];
}

/** Joins a root-relative app dir and a path inside it. */
function inApp(appRoot: string, path: string): string {
  return appRoot === "" ? path : `${appRoot}/${path}`;
}

/** Applies `recipe` to the app at `context.appRoot` of the project at `root`. */
export async function applyAppRecipe(
  recipe: AppRecipe,
  context: RecipeContext,
  root: string,
): Promise<RecipeOutcome> {
  recipe.validate?.(context);
  const at = (path: string): string => inApp(context.appRoot, path);
  const written: string[] = [];
  const kept: string[] = [];
  const edits: MarkerEdit[] = [];

  const files: Record<string, string> = { ...(recipe.files?.(context) ?? {}) };
  if (recipe.integration !== undefined) {
    const { file, exportName } = recipe.integration;
    files[`src/integrations/${file}`] = recipe.integration.source(context);
    const index = at("src/integrations/index.ts");
    const module = file.replace(/\.ts$/, ".js");
    edits.push(
      { file: index, marker: MARKERS.integrationImports, line: `import { ${exportName} } from "./${module}";` },
      { file: index, marker: MARKERS.integrations, line: `${exportName},` },
    );
  }
  for (const [path, content] of Object.entries(files)) {
    if (existsSync(join(root, at(path)))) {
      kept.push(at(path));
    } else {
      await writeFile(root, at(path), content);
      written.push(at(path));
    }
  }

  if (recipe.configSection !== undefined) {
    edits.push({ file: at("src/configs/index.ts"), marker: MARKERS.config, line: recipe.configSection });
  }
  for (const { marker, line } of recipe.serverLines?.(context) ?? []) {
    edits.push({ file: at("src/server.ts"), marker, line });
  }
  const configFile = join(root, at("src/configs/index.ts"));
  const configKey = recipe.configSection?.split(":")[0];
  const configured =
    configKey !== undefined &&
    existsSync(configFile) &&
    new RegExp(`^\\s*${configKey}:`, "m").test(readFileSync(configFile, "utf-8"));
  const outcome = await applyMarkerEdits(
    root,
    configured ? edits.filter((edit) => edit.marker !== MARKERS.config) : edits,
  );

  const edited = [...outcome.edited];
  const envPath = at(".env.example");
  const env = recipe.env?.(context) ?? [];
  if (env.length > 0) {
    const current = existsSync(join(root, envPath)) ? readFileSync(join(root, envPath), "utf-8") : "";
    const next = withEnvVariables(current, env);
    if (next !== undefined) {
      await writeFile(root, envPath, next);
      edited.push(envPath);
    }
  }

  const pkgPath = at("package.json");
  const pkg = JSON.parse(readFileSync(join(root, pkgPath), "utf-8")) as EditablePackageJson;
  mergePackageJson(pkg, {
    feature: recipe.feature,
    dependencies: recipe.dependencies,
    ...(recipe.devDependencies ? { devDependencies: recipe.devDependencies } : {}),
    ...(recipe.scripts ? { scripts: recipe.scripts } : {}),
    ...(recipe.replaceScripts ? { replaceScripts: recipe.replaceScripts } : {}),
  });
  await writeFile(root, pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  edited.push(pkgPath);

  return { written, kept, edited, manualSteps: outcome.manualSteps };
}
