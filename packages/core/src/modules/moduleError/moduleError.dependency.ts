import type { ModuleId } from "../module.js";
import type { ModuleRegistrationState } from "../moduleRegistry/moduleRegistry.type.js";

import { ModuleErrorCode, ModuleError } from "./moduleError.base.js";

/**
 * What is known about the dependency that could not be resolved.
 */
export interface MissingModuleDependencyContext {
  /**
   * Registration state of the dependency when it IS registered but did
   * not take part in the lifecycle run (not loaded). Omitted when the
   * dependency is not registered at all.
   */
  readonly dependencyState?: ModuleRegistrationState;
}

function describeMissingDependency(
  moduleId: ModuleId,
  dependencyId: ModuleId,
  dependencyState: ModuleRegistrationState | undefined,
): string {
  if (dependencyState === undefined) {
    return `Module "${moduleId}" requires missing module "${dependencyId}".`;
  }

  return (
    `Module "${moduleId}" depends on "${dependencyId}", which is registered but not loaded ` +
    `(state: "${dependencyState}"). Load it before starting the lifecycle, or enable autoLoad on its definition.`
  );
}

/**
 * Error thrown when a required module dependency cannot be resolved.
 *
 * The message distinguishes a dependency that is not registered from
 * one that is registered but was not loaded; the latter used to be
 * reported as "missing module", which was misleading.
 */
export class MissingModuleDependencyError extends ModuleError {
  public readonly dependencyState?: ModuleRegistrationState;

  public constructor(
    moduleId: ModuleId,
    dependencyId: ModuleId,
    context: MissingModuleDependencyContext = {},
  ) {
    super(describeMissingDependency(moduleId, dependencyId, context.dependencyState), {
      code: ModuleErrorCode.MISSING_DEPENDENCY,
      moduleId,
      dependencyId,
    });

    this.name = "MissingModuleDependencyError";
    this.dependencyState = context.dependencyState;
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
