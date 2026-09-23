/**
 * zudojs-cli — Doctor Command
 *
 * The `zudojs doctor` command for project diagnostics.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { CLIContext } from "../cliType/cliType.type.js";
import { CLIValidationError } from "../errors/index.js";
import { FEATURE_PACKAGES } from "../constants/index.js";
import { parseManifest } from "../manifest/manifestFile.helper.js";
import { findProjectRoot } from "../resolvers/project.resolver.js";
import {
  resolveProjectLayout,
  type ProjectLayout,
} from "../resolvers/layout/projectLayout.core.js";
import {
  EnvironmentValidator,
  type EnvironmentCheck,
} from "../validators/environment/environmentValidator.core.js";

export interface DoctorCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly message: string;
  /**
   * Whether a failed check is fatal. Advisory checks (a missing lock file in
   * a project created with `--no-install`, for example) are reported as
   * warnings and do not fail the command.
   */
  readonly severity: "error" | "warning";
}

/**
 * Runs every diagnostic for the project containing `cwd` (any directory
 * inside it: the root is found by walking up, as `generate` does).
 *
 * Exported so the checks can be run against a scaffolded directory in tests
 * without going through the logger.
 */
export function runDoctorChecks(cwd: string): DoctorCheck[] {
  const layout = resolveProjectLayout(projectRootFor(cwd));
  const checks: DoctorCheck[] = [checkProject(layout)];

  if (!layout) {
    return checks;
  }

  checks.push(
    checkPackageManager(layout),
    checkInstalled(layout),
    checkTypeScriptConfig(layout),
    checkDependencies(layout),
    checkFeatures(layout),
    checkCapabilities(layout),
  );

  return checks;
}

/** The workspace root above `cwd`, or `cwd` itself outside any project. */
function projectRootFor(cwd: string): string {
  return findProjectRoot(cwd, { workspace: true }) ?? cwd;
}

/**
 * Environment checks: Node.js, Git and the project's own package manager.
 *
 * Delegated to the EnvironmentValidator, which existed and was exported
 * but was called from nowhere while `doctor` reimplemented a subset of it
 * inline.
 */
export async function runEnvironmentChecks(
  cwd: string,
): Promise<DoctorCheck[]> {
  const layout = resolveProjectLayout(projectRootFor(cwd));
  const result = await new EnvironmentValidator().validate(
    layout?.projectType ?? "backend",
    layout?.packageManager,
  );

  return result.checks.map((check) =>
    check.name === "Node.js"
      ? checkNodeVersion(check)
      : {
          name: check.name === "Git" ? "Git" : `Package manager (${check.name})`,
          severity: "warning" as const,
          passed: check.installed,
          message: check.installed
            ? `${check.version ?? "installed"}`
            : `${check.name} is not installed or not on PATH`,
        },
  );
}

export async function runDoctorCommand(context: CLIContext): Promise<void> {
  const checks = [
    ...(await runEnvironmentChecks(context.cwd)),
    ...runDoctorChecks(context.cwd),
  ];
  const warnings: string[] = [];
  const errors: string[] = [];

  context.logger.info("Zudojs Doctor - Project Diagnostics");
  context.logger.info("");

  for (const check of checks) {
    const symbol = check.passed ? "✔" : check.severity === "error" ? "✖" : "⚠";
    context.logger.info(`${symbol} ${check.name}: ${check.message}`);

    if (!check.passed) {
      if (check.severity === "warning") {
        warnings.push(`${check.name}: ${check.message}`);
      } else {
        errors.push(`${check.name}: ${check.message}`);
      }
    }
  }

  if (warnings.length > 0) {
    context.logger.info("");
    context.logger.info("Warnings:");
    for (const warning of warnings) {
      context.logger.info(`  ⚠ ${warning}`);
    }
  }

  if (errors.length > 0) {
    context.logger.info("");
    context.logger.info("Errors:");
    for (const error of errors) {
      context.logger.info(`  ✖ ${error}`);
    }
    context.logger.info("");
    context.logger.info("Please fix the errors above before deploying.");
    // Throwing is what gives `zudojs doctor` a non-zero exit code; returning
    // here would report success to CI while diagnostics failed.
    throw new CLIValidationError(
      `Zudojs doctor found ${errors.length} problem(s): ${errors.join("; ")}`,
    );
  }

  context.logger.info("");
  context.logger.info("All checks passed!");
}

function checkNodeVersion(check: EnvironmentCheck): DoctorCheck {
  if (!check.installed) {
    return {
      name: "Node.js version",
      severity: "error",
      passed: false,
      message: "Node.js is not installed or not on PATH",
    };
  }

  const version = check.version ?? process.version;
  const major = Number.parseInt(version.replace("v", "").split(".")[0]!, 10);
  const passed = Number.isFinite(major) && major >= 24;
  return {
    name: "Node.js version",
    severity: "error",
    passed,
    message: passed
      ? `Node.js ${version} (meets minimum v24)`
      : `Node.js ${version} (requires >= v24)`,
  };
}

function checkProject(layout: ProjectLayout | null): DoctorCheck {
  if (!layout) {
    return {
      name: "Zudojs project",
      severity: "error",
      passed: false,
      message:
        "No Zudojs project found (no .zudojs/manifest.json, zudojs.config.ts or zudojs block in package.json)",
    };
  }

  const source =
    layout.source === "manifest"
      ? ".zudojs/manifest.json"
      : layout.source === "config"
        ? "zudojs.config.ts"
        : "package.json#zudojs";

  return {
    name: "Zudojs project",
    severity: "error",
    passed: true,
    message: `${layout.projectType} (${layout.architecture}) from ${source}`,
  };
}

function checkPackageManager(layout: ProjectLayout): DoctorCheck {
  const lockFiles: Record<string, string[]> = {
    pnpm: ["pnpm-lock.yaml"],
    npm: ["package-lock.json"],
    yarn: ["yarn.lock"],
    bun: ["bun.lock", "bun.lockb"],
  };

  const expected = lockFiles[layout.packageManager] ?? [];
  const passed = expected.some((file) => existsSync(join(layout.root, file)));

  return {
    name: "Package manager",
    severity: "warning",
    passed,
    message: passed
      ? `${layout.packageManager} (lock file present)`
      : `${layout.packageManager} configured but no lock file found; run "${layout.packageManager} install"`,
  };
}

function checkInstalled(layout: ProjectLayout): DoctorCheck {
  const passed = existsSync(join(layout.root, "node_modules"));
  return {
    name: "Dependencies installed",
    severity: "warning",
    passed,
    message: passed
      ? "node_modules present"
      : `node_modules missing; run "${layout.packageManager} install"`,
  };
}

/** Directories that must each carry a tsconfig.json. */
function appDirs(layout: ProjectLayout): string[] {
  const dirs = [...layout.backendDirs];
  if (
    layout.frontendDir !== undefined &&
    layout.frontendFramework !== "flutter" &&
    existsSync(join(layout.frontendDir, "package.json"))
  ) {
    dirs.push(layout.frontendDir);
  }
  return dirs;
}

function describe(layout: ProjectLayout, dir: string): string {
  const rel = relative(layout.root, dir);
  return rel === "" ? "." : rel;
}

/**
 * A workspace root has no tsconfig.json of its own — the apps do. This
 * check used to look only at the root, so every fullstack and microservice
 * project failed the doctor the moment it was created.
 */
function checkTypeScriptConfig(layout: ProjectLayout): DoctorCheck {
  const missing = appDirs(layout).filter(
    (dir) =>
      !existsSync(join(dir, "tsconfig.json")) &&
      !existsSync(join(dir, "tsconfig.base.json")),
  );

  const passed = missing.length === 0;

  return {
    name: "TypeScript configuration",
    severity: "error",
    passed,
    message: passed
      ? "tsconfig.json found in every app"
      : `No tsconfig.json in: ${missing.map((d) => describe(layout, d)).join(", ")}`,
  };
}

function readPackageJson(dir: string): {
  dependencies?: Record<string, string>;
  zudojs?: { features?: unknown };
} | null {
  try {
    return JSON.parse(readFileSync(join(dir, "package.json"), "utf-8")) as {
      dependencies?: Record<string, string>;
      zudojs?: { features?: unknown };
    };
  } catch {
    return null;
  }
}

function checkDependencies(layout: ProjectLayout): DoctorCheck {
  if (layout.backendDirs.length === 0) {
    return {
      name: "Zudojs dependencies",
      severity: "warning",
      passed: true,
      message: "Frontend-only project; no framework packages expected",
    };
  }

  const found = new Set<string>();
  const unreadable: string[] = [];

  for (const dir of layout.backendDirs) {
    const pkg = readPackageJson(dir);
    if (!pkg) {
      unreadable.push(describe(layout, dir));
      continue;
    }
    for (const name of Object.keys(pkg.dependencies ?? {})) {
      if (name.startsWith("@zudojs/")) found.add(name);
    }
  }

  if (unreadable.length > 0) {
    return {
      name: "Zudojs dependencies",
      severity: "error",
      passed: false,
      message: `Failed to read package.json in: ${unreadable.join(", ")}`,
    };
  }

  const passed = found.size > 0;

  return {
    name: "Zudojs dependencies",
    severity: "warning",
    passed,
    message: passed
      ? `${found.size} Zudojs package(s) declared`
      : "No @zudojs/* packages declared",
  };
}

/**
 * Every feature recorded in a backend package.json must be backed by the
 * package `zudojs add` installs for it.
 */
function checkFeatures(layout: ProjectLayout): DoctorCheck {
  const violations: string[] = [];

  for (const dir of layout.backendDirs) {
    const pkg = readPackageJson(dir);
    if (!pkg) continue;

    const features = Array.isArray(pkg.zudojs?.features)
      ? pkg.zudojs.features.filter((f): f is string => typeof f === "string")
      : [];
    const deps = Object.keys(pkg.dependencies ?? {});

    for (const feature of features) {
      const required = FEATURE_PACKAGES[feature] ?? [`@zudojs/${feature}`];
      for (const name of required) {
        if (!deps.includes(name)) {
          violations.push(
            `${describe(layout, dir)}: feature "${feature}" declared but ${name} is not a dependency`,
          );
        }
      }
    }
  }

  return {
    name: "Features",
    severity: "warning",
    passed: violations.length === 0,
    message:
      violations.length === 0
        ? "Every declared feature has its package"
        : violations.join("; "),
  };
}

/** The `zudojs.features` an app's package.json declares. */
function declaredFeatures(dir: string): readonly string[] {
  const features = readPackageJson(dir)?.zudojs?.features;
  return Array.isArray(features)
    ? features.filter((f): f is string => typeof f === "string")
    : [];
}

/**
 * The manifest's `capabilities` and the backend apps' `zudojs.features`
 * must name the same set. zudojs-cli 2.0.1 recorded `events` and
 * `security` in the manifest only, so `info` and `add` (which read the
 * manifest) and `doctor` (which reads package.json) disagreed.
 */
function checkCapabilities(layout: ProjectLayout): DoctorCheck {
  const name = "Capabilities";
  const manifestPath = join(layout.root, ".zudojs", "manifest.json");
  const manifest = existsSync(manifestPath)
    ? parseManifest(readFileSync(manifestPath, "utf-8")).manifest
    : null;

  if (manifest === null || layout.backendDirs.length === 0) {
    return { name, severity: "warning", passed: true, message: "Nothing to compare" };
  }

  const declared = new Set(layout.backendDirs.flatMap(declaredFeatures));
  const recorded = new Set(manifest.capabilities);
  const problems = [
    ...[...recorded]
      .filter((c) => !declared.has(c))
      .map((c) => `"${c}" is in .zudojs/manifest.json but in no app's zudojs.features`),
    ...[...declared]
      .filter((c) => !recorded.has(c))
      .map((c) => `"${c}" is in zudojs.features but not in .zudojs/manifest.json`),
  ];

  return {
    name,
    severity: "warning",
    passed: problems.length === 0,
    message:
      problems.length === 0
        ? "The manifest and package.json record the same capabilities"
        : problems.join("; "),
  };
}
