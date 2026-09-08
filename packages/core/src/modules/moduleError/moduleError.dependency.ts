import type { ModuleId } from "../module.js";

import { ModuleErrorCode, ModuleError } from "./moduleError.base.js";

/**
 * Error thrown when a required module dependency is missing.
 */
export class MissingModuleDependencyError extends ModuleError {
  public constructor(moduleId: ModuleId, dependencyId: ModuleId) {
    super(`Module "${moduleId}" requires missing module "${dependencyId}".`, {
      code: ModuleErrorCode.MISSING_DEPENDENCY,
      moduleId,
      dependencyId,
    });

    this.name = "MissingModuleDependencyError";
  }
}

/**
 * Error thrown when a circular dependency is detected.
 */
export class CircularModuleDependencyError extends ModuleError {
  public constructor(cycle: readonly ModuleId[]) {
    const cycleText = cycle.join(" -> ");

    super(`Circular module dependency detected: ${cycleText}`, {
      code: ModuleErrorCode.CIRCULAR_DEPENDENCY,
      cycle,
      moduleId: cycle[0],
    });

    this.name = "CircularModuleDependencyError";
  }
}

/**
 * Error thrown when a dependency declaration is malformed:
 * empty ids, self-dependencies, duplicate declarations, or
 * unsupported version constraints.
 */
export class InvalidModuleDependencyError extends ModuleError {
  public constructor(
    message: string,
    options: {
      readonly moduleId?: ModuleId;
      readonly dependencyId?: ModuleId;
    } = {},
  ) {
    super(message, {
      code: ModuleErrorCode.INVALID_DEPENDENCY,
      moduleId: options.moduleId,
      dependencyId: options.dependencyId,
    });

    this.name = "InvalidModuleDependencyError";
  }
}

/**
 * Error thrown when a module dependency version
 * cannot be satisfied.
 */
export class ModuleVersionMismatchError extends ModuleError {
  public readonly requiredVersion: string;

  public readonly actualVersion?: string;

  public constructor(
    moduleId: ModuleId,
    requiredVersion: string,
    actualVersion?: string,
  ) {
    super(
      actualVersion
        ? `Module "${moduleId}" requires version "${requiredVersion}", but version "${actualVersion}" is installed.`
        : `Module "${moduleId}" requires version "${requiredVersion}".`,
      {
        code: ModuleErrorCode.VERSION_MISMATCH,
        moduleId,
      },
    );

    this.name = "ModuleVersionMismatchError";

    this.requiredVersion = requiredVersion;

    this.actualVersion = actualVersion;
  }

  public override toJSON() {
    return {
      ...super.toJSON(),
      requiredVersion: this.requiredVersion,
      actualVersion: this.actualVersion,
    };
  }
}
