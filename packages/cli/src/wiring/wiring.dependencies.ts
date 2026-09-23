/**
 * zudojs-cli — Dependencies of generated code
 *
 * `generate command` and `generate query` wrote files importing
 * `@zudojs/cqrs` into projects created without the cqrs capability, so the
 * project stopped compiling (TS2307) and nothing said why. After a schematic
 * writes its files, every `@zudojs/*` package they import is added to the
 * nearest package.json that lacks it.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { zudojsVersionRange } from "../constants/zudojsVersions.helper.js";

const ZUDOJS_IMPORT = /\bfrom\s+["'](@zudojs\/[a-z0-9-]+)(?:\/[^"']*)?["']/g;

/** One package.json edited by {@link ensureZudojsDependencies}. */
export interface AddedDependencies {
  /** package.json path, relative to the project root. */
  readonly packageJson: string;
  /** `@zudojs/*` names added to its dependencies. */
  readonly added: readonly string[];
}

/** `@zudojs/*` package names imported by `source`. */
export function importedZudojsPackages(source: string): string[] {
  return [...new Set([...source.matchAll(ZUDOJS_IMPORT)].map((m) => m[1] as string))];
}

/** Nearest package.json at or above `fromDir`, never above `root`. */
function nearestPackageJson(fromDir: string, root: string): string | undefined {
  let dir = fromDir;
  for (;;) {
    const candidate = join(dir, "package.json");
    if (existsSync(candidate)) return candidate;
    if (dir === root) return undefined;
    const parent = dirname(dir);
    if (parent === dir || relative(root, parent).startsWith("..")) return undefined;
    dir = parent;
  }
}

/**
 * Adds every `@zudojs/*` package imported by `files` (paths relative to
 * `root`, or absolute) to the dependencies of the package.json that owns
 * each file, when it is missing. Existing entries are never changed.
 */
export function ensureZudojsDependencies(
  root: string,
  files: readonly string[],
): AddedDependencies[] {
  const projectRoot = resolve(root);
  const needed = new Map<string, Set<string>>();

  for (const file of files) {
    const path = isAbsolute(file) ? file : join(projectRoot, file);
    if (!/\.[cm]?tsx?$/.test(path) || !existsSync(path)) continue;
    const pkgPath = nearestPackageJson(dirname(path), projectRoot);
    if (pkgPath === undefined) continue;
    const names = needed.get(pkgPath) ?? new Set<string>();
    for (const name of importedZudojsPackages(readFileSync(path, "utf8"))) names.add(name);
    needed.set(pkgPath, names);
  }

  const edits: AddedDependencies[] = [];
  for (const [pkgPath, names] of needed) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const missing = [...names]
      .filter((name) => name !== pkg.name)
      .filter((name) => !(name in (pkg.dependencies ?? {})) && !(name in (pkg.devDependencies ?? {})))
      .sort();
    if (missing.length === 0) continue;
    pkg.dependencies ??= {};
    for (const name of missing) pkg.dependencies[name] = zudojsVersionRange(name);
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    edits.push({ packageJson: relative(projectRoot, pkgPath), added: missing });
  }
  return edits;
}

/** Human-readable lines describing {@link ensureZudojsDependencies} edits. */
export function describeAddedDependencies(edits: readonly AddedDependencies[]): string[] {
  if (edits.length === 0) return [];
  return [
    ...edits.map((edit) => `Added ${edit.added.join(", ")} to ${edit.packageJson}.`),
    "Run your package manager's install command to fetch them.",
  ];
}

/** "1 file" / "3 files". */
export function fileCount(count: number): string {
  return `${count} ${count === 1 ? "file" : "files"}`;
}
