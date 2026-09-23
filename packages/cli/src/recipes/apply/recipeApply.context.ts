/**
 * zudojs-cli — What recipes need to know about a project on disk.
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

import type { ProjectLayout } from "../../resolvers/layout/projectLayout.core.js";
import type { ProjectRecipeContext, RecipeContext } from "../recipe.type.js";

function readJson(path: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The project name as a slug (from the root package.json). */
export function projectSlug(root: string): string {
  const name = readJson(join(root, "package.json"))["name"];
  const raw = typeof name === "string" && name !== "" ? name : basename(root);
  return raw.replace(/^@[^/]+\//, "").replace(/[^a-z0-9-]+/gi, "-").toLowerCase() || "app";
}

/** The database engine recorded in `.zudojs/manifest.json` (default postgresql). */
export function recordedDatabase(root: string): string {
  const database = readJson(join(root, ".zudojs", "manifest.json"))["database"] as
    | { provider?: unknown }
    | undefined;
  return typeof database?.provider === "string" ? database.provider : "postgresql";
}

/** The app's name: `app` for the project root, else its directory name. */
function appName(root: string, dir: string): string {
  return dir === root ? "app" : basename(dir);
}

/** The recipe context of one backend app. */
export function recipeContextFor(root: string, dir: string): RecipeContext {
  return {
    projectSlug: projectSlug(root),
    appName: appName(root, dir),
    database: recordedDatabase(root),
    appRoot: relative(root, dir).split("\\").join("/"),
  };
}

/** PORT from an app's `.env.example`, else `fallback`. */
function recordedPort(dir: string, fallback: number): number {
  const path = join(dir, ".env.example");
  const match = existsSync(path) ? /^PORT=(\d+)\s*$/m.exec(readFileSync(path, "utf-8")) : null;
  const port = Number(match?.[1]);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback;
}

/** Features declared in an app's package.json. */
function declaredFeatures(dir: string): readonly string[] {
  const block = readJson(join(dir, "package.json"))["zudojs"] as { features?: unknown } | undefined;
  return Array.isArray(block?.features)
    ? block.features.filter((f): f is string => typeof f === "string")
    : [];
}

/** The context of a project recipe (docker) for `layout`. */
export function projectRecipeContext(
  layout: ProjectLayout,
  feature: string,
  capabilities: readonly string[],
): ProjectRecipeContext {
  const apps = layout.backendDirs.map((dir, index) => ({
    dir: relative(layout.root, dir).split("\\").join("/"),
    name: appName(layout.root, dir),
    port: recordedPort(dir, 3000 + index),
    prisma: existsSync(join(dir, "prisma", "schema.prisma")),
  }));
  const features = new Set<string>([feature, ...capabilities]);
  for (const dir of layout.backendDirs) {
    for (const declared of declaredFeatures(dir)) features.add(declared);
  }
  return {
    root: layout.root,
    projectSlug: projectSlug(layout.root),
    architecture: layout.architecture,
    packageManager: layout.packageManager,
    database: recordedDatabase(layout.root),
    features,
    apps,
  };
}
