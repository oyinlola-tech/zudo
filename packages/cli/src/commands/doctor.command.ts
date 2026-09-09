/**
 * zudojs-cli — Doctor Command
 *
 * The `zudojs doctor` command for project diagnostics.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CLIContext } from "../cliType/cliType.type.js";
import { CLIValidationError } from "../errors/index.js";

interface DoctorCheck {
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

export async function runDoctorCommand(context: CLIContext): Promise<void> {
  const checks: DoctorCheck[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  checks.push(checkNodeVersion());
  checks.push(checkPackageManager(context.cwd));
  checks.push(checkTypeScriptConfig(context.cwd));
  checks.push(checkZudojsConfig(context.cwd));
  checks.push(checkDependencies(context));
  checks.push(checkArchitectureViolations(context.cwd));

  context.logger.info("Zudojs Doctor - Project Diagnostics");
  context.logger.info("");

  for (const check of checks) {
    const symbol = check.passed ? "✔" : "✖";
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
      ? `Node.js ${version} (✓ meets minimum v24)`
      : `Node.js ${version} (✗ requires >= v24)`,
  };
}

function checkPackageManager(cwd: string): DoctorCheck {
  const hasPnpm = existsSync(join(cwd, "pnpm-lock.yaml"));
  const hasNpm = existsSync(join(cwd, "package-lock.json"));
  const hasYarn = existsSync(join(cwd, "yarn.lock"));

  const passed = hasPnpm || hasNpm || hasYarn;
  const manager = hasPnpm ? "pnpm" : hasNpm ? "npm" : hasYarn ? "yarn" : "none";

  return {
    name: "Package manager",
    severity: "warning",
    passed,
    message: passed ? `Detected: ${manager}` : "No lock file found",
  };
}

function checkTypeScriptConfig(cwd: string): DoctorCheck {
  const passed =
    existsSync(join(cwd, "tsconfig.json")) ||
    existsSync(join(cwd, "tsconfig.base.json"));
  return {
    name: "TypeScript configuration",
    severity: "error",
    passed,
    message: passed ? "tsconfig.json found" : "No tsconfig.json found",
  };
}

function checkZudojsConfig(cwd: string): DoctorCheck {
  const hasPkgConfig = checkZudojsInPackageJson(cwd);
  const hasConfig =
    existsSync(join(cwd, "zudojs.config.ts")) ||
    existsSync(join(cwd, "zudojs.config.js"));
  const passed = hasPkgConfig || hasConfig;

  let message = "No Zudojs configuration found.";
  if (passed) {
    message = hasPkgConfig
      ? "Zudojs config in package.json"
      : hasConfig
        ? "zudojs.config.ts found"
        : "Zudojs config in package.json";
  }

  return {
    name: "Zudojs configuration",
    severity: "error",
    passed,
    message,
  };
}

function checkZudojsInPackageJson(cwd: string): boolean {
  try {
    const pkgPath = join(cwd, "package.json");
    if (!existsSync(pkgPath)) return false;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      zudojs?: unknown;
    };
    return typeof pkg.zudojs === "object" && pkg.zudojs !== null;
  } catch {
    return false;
  }
}

function checkDependencies(context: CLIContext): DoctorCheck {
  const pkgPath = join(context.cwd, "package.json");

  if (!existsSync(pkgPath)) {
    return {
      name: "Dependencies",
      severity: "error",
      passed: false,
      message: "No package.json found",
    };
  }

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      dependencies?: Record<string, string>;
    };

    const zudojsDeps = Object.keys(pkg.dependencies ?? {}).filter((d) =>
      d.startsWith("@zudojs/"),
    );

    const passed = zudojsDeps.length > 0;
    return {
      name: "Zudojs dependencies",
      severity: "warning",
      passed,
      message: passed
        ? `${zudojsDeps.length} Zudojs packages installed`
        : "No Zudojs packages found",
    };
  } catch {
    return {
      name: "Dependencies",
      severity: "error",
      passed: false,
      message: "Failed to read package.json",
    };
  }
}

function checkArchitectureViolations(cwd: string): DoctorCheck {
  const srcDir = join(cwd, "src");
  const violations: string[] = [];

  if (!existsSync(srcDir)) {
    return {
      name: "Architecture",
      severity: "warning",
      passed: true,
      message: "No src/ directory (not a Zudojs project?)",
    };
  }

  const configPath = join(cwd, "zudojs.config.ts");
  let architecture = "monolith";
  if (existsSync(configPath)) {
    const configContent = readFileSync(configPath, "utf-8");
    const archMatch = configContent.match(/architecture:\s*["'](\w[\w-]*)["']/);
    if (archMatch?.[1]) {
      architecture = archMatch[1];
    }
  }

  if (architecture === "modular-monolith" || architecture === "microservice") {
    const servicesDir = join(srcDir, "services");
    if (existsSync(servicesDir)) {
      violations.push(
        "src/services/ should be split into modules/ (modular-monolith) or apps/services/ (microservice)",
      );
    }
  }

  if (architecture === "monolith") {
    const modulesDir = join(srcDir, "modules");
    if (existsSync(modulesDir)) {
      violations.push(
        "src/modules/ found in monolith architecture — consider modular-monolith or microservice architecture",
      );
    }
  }

  const pkgPath = join(cwd, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
        dependencies?: Record<string, string>;
        zudojs?: { features?: string[] };
      };
      const features = pkg.zudojs?.features ?? [];
      const deps = Object.keys(pkg.dependencies ?? {});

      for (const feature of features) {
        const pkgName = `@zudojs/${feature}`;
        if (!deps.includes(pkgName)) {
          violations.push(
            `Feature "${feature}" declared in package.json#zudojs.features but ${pkgName} not in dependencies`,
          );
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  return {
    name: "Architecture",
    severity: "warning",
    passed: violations.length === 0,
    message:
      violations.length === 0
        ? "No violations detected"
        : `${violations.length} potential violation(s): ${violations.join("; ")}`,
  };
}
