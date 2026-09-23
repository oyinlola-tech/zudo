/**
 * zudojs-cli — Add Command
 *
 * `zudojs add <feature>` writes a working recipe for the feature (see
 * `src/recipes/`): the integration code, its registration, config, env
 * variables and dependencies — or, for `docker`, the project's container
 * files — then records the feature and installs.
 */

import { join } from "node:path";
import type { CLIContext } from "../cliType/cliType.type.js";
import { runStreaming } from "../utils/utils.exec.js";
import { assertSafePathSegment } from "../utils/utils.name.js";
import { CLIValidationError, CLIGenerationError } from "../errors/index.js";
import { ManifestManager } from "../manifest/manifestManager.core.js";
import { getInstallCommand } from "../installers/dependency.installer.js";
import { FEATURE_NAMES, zudojsVersionRange } from "../constants/index.js";
import {
  resolveProjectLayout,
  type ProjectLayout,
} from "../resolvers/layout/projectLayout.core.js";
import {
  applyAppRecipe,
  applyProjectRecipe,
  applyProjectSettings,
  projectRecipeContext,
  recipeContextFor,
  recordFeature,
  recordProjectFeature,
  refreshGeneratedDockerfiles,
  reportOutcomes,
  resolveFeatureRecipe,
  type AppRecipe,
  type RecipeOutcome,
} from "../recipes/index.js";
import { existsSync, readFileSync } from "node:fs";
import { findProjectRoot } from "../resolvers/project.resolver.js";

interface PackageJsonShape {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  zudojs?: Record<string, unknown>;
}

/**
 * Picks the `package.json` files a feature is added to.
 *
 * The workspace root used to be the only target. In a fullstack project
 * that root holds no application code, so `@zudojs/database` landed where
 * nothing could import it while `apps/api` stayed without it. Features now
 * go to every backend app (`apps/api`, or the gateway and each service of a
 * microservice project); `--service <name>` narrows a microservice project
 * to one app.
 */
export function selectAddTargets(
  layout: ProjectLayout,
  service: string | undefined,
): string[] {
  if (service !== undefined) {
    if (layout.architecture !== "microservice") {
      throw new CLIValidationError(
        "--service only applies to microservice projects.",
      );
    }

    const match = layout.backendDirs.find((dir) =>
      dir.endsWith(`${join("apps", "services", service)}`),
    );
    const gateway = layout.backendDirs.find((dir) =>
      dir.endsWith(join("apps", "gateway")),
    );

    const target = service === "gateway" ? gateway : match;

    if (!target) {
      throw new CLIValidationError(
        `Unknown service "${service}". Known: ${[
          ...(gateway ? ["gateway"] : []),
          ...layout.services,
        ].join(", ")}`,
      );
    }

    return [join(target, "package.json")];
  }

  return layout.backendDirs.map((dir) => join(dir, "package.json"));
}

/**
 * The version written for a new `@zudojs/*` dependency.
 *
 * `workspace:*` was written whenever the project was a workspace. Every
 * generated fullstack and microservice project is a workspace, and none of
 * them contains the framework packages, so the next install failed with
 * "not found in workspace". The protocol is now used only when the target
 * already links a framework package that way — i.e. inside the Zudojs
 * monorepo itself. Otherwise the package gets a caret range on the version
 * this CLI build targets.
 */
export function versionForNewDependency(
  pkg: PackageJsonShape,
  name = "@zudojs/core",
): string {
  const linksFramework = Object.entries({
    ...pkg.dependencies,
    ...pkg.devDependencies,
  }).some(
    ([dep, version]) =>
      dep.startsWith("@zudojs/") && version.startsWith("workspace:"),
  );

  return linksFramework ? "workspace:*" : zudojsVersionRange(name);
}

/** A recipe with its `@zudojs/*` ranges swapped for `workspace:*` when the app links the framework. */
function forApp(recipe: AppRecipe, pkg: PackageJsonShape): AppRecipe {
  const dependencies = Object.fromEntries(
    Object.entries(recipe.dependencies).map(([name, range]) => [
      name,
      name.startsWith("@zudojs/") ? versionForNewDependency(pkg, name) : range,
    ]),
  );
  return { ...recipe, dependencies };
}

export async function runAddCommand(context: CLIContext): Promise<void> {
  const requested = context.values.feature as string | undefined;
  const service = context.values.service as string | undefined;

  if (!requested) {
    throw new CLIValidationError(
      `Feature name is required. Available: ${FEATURE_NAMES.join(", ")}`,
    );
  }

  const recipe = resolveFeatureRecipe(requested);
  const feature = recipe.feature;

  if (service !== undefined) {
    assertSafePathSegment(service, "--service");
  }

  // Walks up, so `add` works from any directory inside the project; an app
  // of a workspace resolves to the workspace, whose manifest is updated.
  const root = findProjectRoot(context.cwd, { workspace: true });
  const layout = root === null ? null : resolveProjectLayout(root);

  if (!layout) {
    throw new CLIValidationError(
      "No Zudojs project found in this directory. Run `zudojs create` first.",
    );
  }

  if (layout.projectType === "frontend") {
    throw new CLIValidationError(
      "Features are backend packages; this is a frontend-only project.",
    );
  }

  const targets = selectAddTargets(layout, service);

  if (targets.length === 0) {
    throw new CLIValidationError(
      "No backend app with a package.json was found in this project.",
    );
  }

  // The manifest is read and validated before anything is written: an
  // unusable manifest used to be discovered after every package.json had
  // already been rewritten, leaving the project half-updated.
  const manifest = new ManifestManager(layout.root);
  const manifestState = await manifest.readResult();

  if (manifestState.status === "invalid") {
    throw new CLIGenerationError(
      `The project manifest at ${manifest.path} is unusable: ${manifestState.reason ?? "unknown reason"}. Fix or delete it, then re-run; nothing has been changed.`,
    );
  }

  for (const pkgPath of targets) {
    if (!existsSync(pkgPath)) {
      throw new CLIGenerationError(`Could not find ${pkgPath}`);
    }
  }

  context.logger.info(`Adding feature: ${feature} — ${recipe.summary}`);

  const outcomes: RecipeOutcome[] = [];
  const nextSteps: string[] = [];

  try {
    if (recipe.scope === "app") {
      const apps = targets.map((pkgPath) => join(pkgPath, ".."));
      // Validate every app before touching any of them.
      for (const dir of apps) recipe.validate?.(recipeContextFor(layout.root, dir));
      const gitignore = new Set<string>();
      for (const dir of apps) {
        const recipeContext = recipeContextFor(layout.root, dir);
        const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8")) as PackageJsonShape;
        outcomes.push(await applyAppRecipe(forApp(recipe, pkg), recipeContext, layout.root));
        for (const line of recipe.gitignore?.(recipeContext) ?? []) gitignore.add(line);
        nextSteps.push(...(recipe.nextSteps?.(recipeContext) ?? []));
      }
      const settings = await applyProjectSettings(layout.root, [...gitignore], recipe.allowBuilds ?? []);
      // A Dockerfile written before Prisma was added cannot build the app.
      const dockerfiles = await refreshGeneratedDockerfiles(
        projectRecipeContext(layout, feature, []),
      );
      outcomes.push({ written: [], kept: [], edited: [...settings, ...dockerfiles], manualSteps: [] });
    } else {
      const capabilities = manifestState.manifest?.capabilities ?? [];
      const projectContext = projectRecipeContext(layout, feature, capabilities);
      const refreshed = await refreshGeneratedDockerfiles(projectContext);
      const outcome = await applyProjectRecipe(recipe, projectContext);
      outcomes.push({
        ...outcome,
        edited: [...outcome.edited, ...refreshed],
        kept: outcome.kept.filter((path) => !refreshed.includes(path)),
      });
      for (const pkgPath of targets) recordFeature(pkgPath, feature);
      nextSteps.push(...(recipe.nextSteps?.(projectContext) ?? []));
    }
  } catch (error) {
    if (error instanceof CLIValidationError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new CLIGenerationError(
      `Failed to add feature "${feature}": ${message}`,
      error,
    );
  }

  // The manifest (and a microservice root's package.json) record
  // capabilities for the whole project, under the same name the apps got.
  // A project described by a legacy zudojs.config.ts or a package.json
  // block has no manifest; that is said out loud rather than passed over.
  if (recordProjectFeature(layout.root, feature, targets)) {
    outcomes.push({ written: [], kept: [], edited: ["package.json"], manualSteps: [] });
  }
  if (manifestState.status === "ok") {
    await manifest.addCapability(feature);
  } else {
    context.logger.warn(
      `No .zudojs/manifest.json in ${layout.root}; "${feature}" was recorded in package.json only.`,
    );
  }

  reportOutcomes(context.logger, context.cwd, layout.root, outcomes);

  if (context.values["skip-install"] !== true) {
    const [file, ...args] = getInstallCommand(layout.packageManager);
    context.logger.info(`Installing dependencies with ${file}...`);
    try {
      await runStreaming(file, args, layout.root);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new CLIGenerationError(
        `Feature "${feature}" was added, but installing dependencies failed: ${message}. Run "${file} ${args.join(" ")}" to retry.`,
        error,
      );
    }
  }

  context.logger.info(`Feature "${feature}" added successfully.`);
  for (const step of new Set(nextSteps)) context.logger.info(`Next: ${step}`);
}
