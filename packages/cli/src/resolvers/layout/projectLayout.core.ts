/**
 * zudojs-cli — Project Layout Resolver
 *
 * One place that answers "what kind of project is this directory, and where
 * do its apps live?". Every follow-up command (`dev`, `add`, `generate`,
 * `doctor`, `info`, `build`) used to answer that question on its own, and
 * each answer was different: `dev` read `zudojs.config.ts` first and only
 * fell back to the manifest, `generate` never looked past the workspace
 * root for a fullstack project, `doctor` required a `tsconfig.json` at the
 * root of a workspace that has none, and `add` wrote into the workspace root
 * `package.json` where no app can import from.
 *
 * Resolution order:
 *
 *   1. `.zudojs/manifest.json` — written by `zudojs create`, machine-managed.
 *   2. `zudojs.config.ts` / `.js` — older projects; read with a regex, never
 *      executed.
 *   3. the `zudojs` block in `package.json`.
 *
 * @module resolvers/layout
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { PackageManager } from "../../types/index.js";
import { SAFE_PATH_SEGMENT } from "../../utils/utils.name.js";

/** Project type recorded by `zudojs create`. */
export type ProjectLayoutType = "backend" | "frontend" | "fullstack";

/** Where the description of the project came from. */
export type ProjectLayoutSource = "manifest" | "config" | "package.json";

/** The resolved shape of a Zudojs project on disk. */
export interface ProjectLayout {
  /** Absolute project root: the directory holding the manifest or config. */
  readonly root: string;
  readonly projectType: ProjectLayoutType;
  /** Backend architecture (`monolith`, `modular-monolith`, `microservice`). */
  readonly architecture: string;
  readonly packageManager: PackageManager;
  /** Whether the root is a workspace (pnpm-workspace.yaml or `workspaces`). */
  readonly isWorkspace: boolean;
  /**
   * Absolute directories that hold a backend app, each with its own
   * `package.json`. Empty for a frontend-only project. A monolith has one
   * (the root, or `apps/api` in a fullstack workspace); a microservice
   * project has the gateway plus one per service.
   */
  readonly backendDirs: readonly string[];
  /** Absolute directory of the frontend app, when the project has one. */
  readonly frontendDir?: string;
  readonly frontendFramework?: string;
  /** Service names of a microservice project. */
  readonly services: readonly string[];
  readonly source: ProjectLayoutSource;
}

interface RawProjectDescription {
  readonly projectType?: string;
  readonly architecture?: string;
  readonly packageManager?: string;
  readonly frontendFramework?: string;
  readonly services?: readonly string[];
  readonly source: ProjectLayoutSource;
}

const PROJECT_TYPES: readonly ProjectLayoutType[] = [
  "backend",
  "frontend",
  "fullstack",
];

const PACKAGE_MANAGERS: readonly PackageManager[] = [
  "pnpm",
  "npm",
  "yarn",
  "bun",
];

function readJson(path: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readManifest(root: string): RawProjectDescription | null {
  const manifest = readJson(join(root, ".zudojs", "manifest.json"));
  if (!manifest) return null;

  const backend = manifest.backend as { architecture?: unknown } | undefined;
  const frontend = manifest.frontend as { framework?: unknown } | undefined;
  const workspace = manifest.workspace as
    | { packageManager?: unknown }
    | undefined;
  const services = Array.isArray(manifest.services)
    ? manifest.services.filter(
        (service): service is string => typeof service === "string",
      )
    : undefined;

  return {
    projectType: asString(manifest.projectType),
    architecture:
      asString(backend?.architecture) ?? asString(manifest.architecture),
    packageManager: asString(workspace?.packageManager),
    frontendFramework: asString(frontend?.framework),
    services,
    source: "manifest",
  };
}

/**
 * Reads the legacy `zudojs.config.ts` with a regex. The file is user-owned
 * TypeScript and is never executed.
 */
function readLegacyConfig(root: string): RawProjectDescription | null {
  for (const name of ["zudojs.config.ts", "zudojs.config.js"]) {
    const path = join(root, name);
    if (!existsSync(path)) continue;

    let content: string;
    try {
      content = readFileSync(path, "utf-8");
    } catch {
      continue;
    }

    const projectType = content.match(/projectType:\s*["'](\w+)["']/)?.[1];
    const architecture = content.match(
      /architecture:\s*["'](\w[\w-]*)["']/,
    )?.[1];
    const frontendFramework = content.match(
      /frontend:\s*\{[\s\S]*?framework:\s*["']([^"']+)["']/,
    )?.[1];

    return {
      projectType,
      architecture,
      frontendFramework,
      source: "config",
    };
  }

  return null;
}

function readPackageJsonBlock(root: string): RawProjectDescription | null {
  const pkg = readJson(join(root, "package.json"));
  const block = pkg?.zudojs;
  if (typeof block !== "object" || block === null) return null;

  const zudojs = block as Record<string, unknown>;

  return {
    projectType: asString(zudojs.projectType),
    architecture: asString(zudojs.architecture),
    frontendFramework: asString(zudojs.frontend),
    source: "package.json",
  };
}

/** Detects the package manager from lock files and workspace markers. */
export function detectPackageManager(root: string): PackageManager {
  if (
    existsSync(join(root, "pnpm-lock.yaml")) ||
    existsSync(join(root, "pnpm-workspace.yaml"))
  ) {
    return "pnpm";
  }
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  if (existsSync(join(root, "bun.lock")) || existsSync(join(root, "bun.lockb")))
    return "bun";
  return "npm";
}

/**
 * Whether `root` is a multi-package workspace.
 *
 * A `pnpm-workspace.yaml` alone is not enough: pnpm 10+ also uses that file
 * for settings (the build-script allow-list every generated project
 * carries), so only one that declares `packages:` makes a workspace.
 */
function isWorkspaceRoot(root: string): boolean {
  const workspaceFile = join(root, "pnpm-workspace.yaml");
  if (existsSync(workspaceFile)) {
    try {
      if (/^packages:/m.test(readFileSync(workspaceFile, "utf-8"))) return true;
    } catch {
      // unreadable: fall through to package.json
    }
  }
  const pkg = readJson(join(root, "package.json"));
  return pkg?.workspaces !== undefined;
}

/**
 * Lists the service apps under `<backendRoot>/apps/services`, preferring the
 * names recorded in the manifest and falling back to the directory listing.
 */
function listServiceDirs(
  backendRoot: string,
  recorded: readonly string[] | undefined,
): { readonly names: string[]; readonly dirs: string[] } {
  const servicesRoot = join(backendRoot, "apps", "services");
  let names: string[];

  if (recorded && recorded.length > 0) {
    // Names come from a file on disk and become path segments.
    names = recorded.filter((name) => SAFE_PATH_SEGMENT.test(name));
  } else if (existsSync(servicesRoot)) {
    names = readdirSync(servicesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => SAFE_PATH_SEGMENT.test(name));
  } else {
    names = [];
  }

  const dirs = names
    .map((name) => join(servicesRoot, name))
    .filter((dir) => existsSync(join(dir, "package.json")));

  return { names, dirs };
}

/**
 * Resolves the layout of the Zudojs project rooted at `cwd`.
 *
 * Returns `null` when the directory is not a Zudojs project: no manifest,
 * no legacy config and no `zudojs` block in `package.json`.
 */
export function resolveProjectLayout(cwd: string): ProjectLayout | null {
  const raw =
    readManifest(cwd) ?? readLegacyConfig(cwd) ?? readPackageJsonBlock(cwd);

  if (!raw) return null;

  const projectType: ProjectLayoutType = PROJECT_TYPES.includes(
    raw.projectType as ProjectLayoutType,
  )
    ? (raw.projectType as ProjectLayoutType)
    : "backend";

  const architecture = raw.architecture ?? "monolith";

  const packageManager: PackageManager = PACKAGE_MANAGERS.includes(
    raw.packageManager as PackageManager,
  )
    ? (raw.packageManager as PackageManager)
    : detectPackageManager(cwd);

  // In a fullstack workspace the backend is generated into apps/api; a
  // backend-only project is its own backend root.
  const fullstackApi = join(cwd, "apps", "api");
  const backendRoot =
    projectType === "fullstack" && existsSync(join(fullstackApi, "package.json"))
      ? fullstackApi
      : cwd;

  let backendDirs: string[] = [];
  let services: readonly string[] = [];

  if (projectType !== "frontend") {
    if (architecture === "microservice") {
      const gateway = join(backendRoot, "apps", "gateway");
      const listed = listServiceDirs(backendRoot, raw.services);
      services = listed.names;
      backendDirs = [
        ...(existsSync(join(gateway, "package.json")) ? [gateway] : []),
        ...listed.dirs,
      ];
    } else {
      backendDirs = [backendRoot];
    }
  }

  let frontendDir: string | undefined;
  let frontendFramework: string | undefined;

  if (projectType === "frontend") {
    const nested = join(cwd, "apps", "web");
    frontendDir = existsSync(join(nested, "package.json")) ? nested : cwd;
    frontendFramework = raw.frontendFramework ?? "react";
  } else if (projectType === "fullstack") {
    frontendDir = join(cwd, "apps", "web");
    frontendFramework = raw.frontendFramework ?? "react";
  } else if (raw.frontendFramework && raw.frontendFramework !== "none") {
    frontendDir = join(cwd, "apps", "web");
    frontendFramework = raw.frontendFramework;
  }

  return {
    root: cwd,
    projectType,
    architecture,
    packageManager,
    isWorkspace: isWorkspaceRoot(cwd),
    backendDirs,
    ...(frontendDir !== undefined ? { frontendDir } : {}),
    ...(frontendFramework !== undefined ? { frontendFramework } : {}),
    services,
    source: raw.source,
  };
}
