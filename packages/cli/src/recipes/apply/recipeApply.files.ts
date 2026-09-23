/**
 * zudojs-cli — Edits `add` makes to plain project files: `.env.example`,
 * `.gitignore`, `package.json` and `pnpm-workspace.yaml`. Every edit is
 * additive and idempotent; existing values are never replaced (except the
 * scripts a recipe names explicitly, and only from their generated value).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { EnvVariable } from "../../templates/backendApp/index.js";
import { renderEnvVariables } from "../../templates/backendApp/index.js";

/** `.env.example` with the variables it does not declare yet appended. */
export function withEnvVariables(
  current: string,
  variables: readonly EnvVariable[],
): string | undefined {
  const declared = new Set(
    current.split("\n").map((line) => line.split("=")[0]?.trim() ?? ""),
  );
  const missing = variables.filter((v) => !declared.has(v.name));
  if (missing.length === 0) return undefined;
  const separator = current === "" || current.endsWith("\n") ? "" : "\n";
  return `${current}${separator}${renderEnvVariables(missing)}\n`;
}

/** `.gitignore` with the lines it lacks appended. */
export function withGitignoreLines(current: string, lines: readonly string[]): string | undefined {
  const present = new Set(current.split("\n").map((line) => line.trim()));
  const missing = lines.filter((line) => !present.has(line));
  if (missing.length === 0) return undefined;
  const separator = current === "" || current.endsWith("\n") ? "" : "\n";
  return `${current}${separator}${missing.join("\n")}\n`;
}

/** A package.json shape `add` edits. */
export interface EditablePackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  zudojs?: Record<string, unknown>;
  [key: string]: unknown;
}

/** What to merge into a package.json. */
export interface PackageJsonChanges {
  readonly feature: string;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly scripts?: Readonly<Record<string, string>>;
  readonly replaceScripts?: Readonly<Record<string, { from: string; to: string }>>;
}

/** Merges `changes` into `pkg` in place. */
export function mergePackageJson(pkg: EditablePackageJson, changes: PackageJsonChanges): void {
  pkg.dependencies ??= {};
  for (const [name, range] of Object.entries(changes.dependencies)) {
    if (!(name in pkg.dependencies)) pkg.dependencies[name] = range;
  }
  if (changes.devDependencies !== undefined) {
    pkg.devDependencies ??= {};
    for (const [name, range] of Object.entries(changes.devDependencies)) {
      if (!(name in pkg.devDependencies) && !(name in pkg.dependencies)) {
        pkg.devDependencies[name] = range;
      }
    }
  }
  if (changes.scripts !== undefined || changes.replaceScripts !== undefined) {
    pkg.scripts ??= {};
    for (const [name, command] of Object.entries(changes.scripts ?? {})) {
      if (!(name in pkg.scripts)) pkg.scripts[name] = command;
    }
    for (const [name, { from, to }] of Object.entries(changes.replaceScripts ?? {})) {
      if (pkg.scripts[name] === from) pkg.scripts[name] = to;
    }
  }
  pkg.zudojs ??= {};
  const block = pkg.zudojs as { features?: unknown };
  const features = new Set(
    Array.isArray(block.features)
      ? block.features.filter((f): f is string => typeof f === "string")
      : [],
  );
  features.add(changes.feature);
  block.features = [...features];
}

/**
 * `pnpm-workspace.yaml` with `names` added to both build-script allow-lists
 * (pnpm 10 `onlyBuiltDependencies`, pnpm 11 `allowBuilds`). Returns
 * `undefined` when there is no such file or nothing to add.
 */
export function withAllowedBuilds(root: string, names: readonly string[]): string | undefined {
  const path = join(root, "pnpm-workspace.yaml");
  if (names.length === 0 || !existsSync(path)) return undefined;
  let source = readFileSync(path, "utf-8");
  const original = source;
  for (const name of names) {
    const quoted = JSON.stringify(name);
    if (/^onlyBuiltDependencies:\s*$/m.test(source) && !source.includes(`  - ${quoted}`)) {
      source = source.replace(/^onlyBuiltDependencies:\s*$/m, `onlyBuiltDependencies:\n  - ${quoted}`);
    }
    if (/^allowBuilds:\s*$/m.test(source) && !source.includes(`  ${quoted}: true`)) {
      source = source.replace(/^allowBuilds:\s*$/m, `allowBuilds:\n  ${quoted}: true`);
    }
  }
  return source === original ? undefined : source;
}
