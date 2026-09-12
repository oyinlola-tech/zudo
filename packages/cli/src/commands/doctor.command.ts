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
import {
  resolveProjectLayout,
  type ProjectLayout,
} from "../resolvers/layout/projectLayout.core.js";

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
 * Runs every diagnostic for the project at `cwd`.
 *
 * Exported so the checks can be run against a scaffolded directory in tests
 * without going through the logger.
 */
export function runDoctorChecks(cwd: string): DoctorCheck[] {
  const layout = resolveProjectLayout(cwd);
  const checks: DoctorCheck[] = [checkNodeVersion(), checkProject(layout)];

  if (!layout) {
    return checks;
  }

  checks.push(
    checkPackageManager(layout),
    checkInstalled(layout),
    checkTypeScriptConfig(layout),
    checkDependencies(layout),
    checkFeatures(layout),
  );

  return checks;
}

export async function runDoctorCommand(context: CLIContext): Promise<void> {
  const checks = runDoctorChecks(context.cwd);
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

function checkNodeVersion(): DoctorCheck {
  const version = process.version;
  const major = Number.parseInt(version.replace("v", "").split(".")[0]!, 10);
  const passed = major >= 24;
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
