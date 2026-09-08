import { ErrorCode } from "../../base/types/errorCode.type.js";
import { ModuleError } from "./moduleError.base.js";

/**
 * Error thrown when a module is not found.
 *
 * Module registration is a server-side concern, so this is reported as an
 * internal (500, non-exposed, non-operational) failure.
 */
export class ModuleNotFoundError extends ModuleError {
  constructor(moduleId: string, message?: string) {
    super(message ?? `Module "${moduleId}" was not found.`, {
      code: ErrorCode.MODULE_NOT_FOUND,
      statusCode: 500,
      expose: false,
      isOperational: false,
      moduleId,
    });
  }
}

/**
 * Error thrown when a module fails to load.
 */
export class ModuleLoadError extends ModuleError {
  constructor(moduleId: string, message?: string, cause?: unknown) {
    super(message ?? `Failed to load module "${moduleId}".`, {
      code: ErrorCode.MODULE_LOAD_FAILED,
      cause,
      moduleId,
      isOperational: false,
    });
  }
}

/**
 * Error thrown when a module lifecycle operation fails.
 */
export class ModuleLifecycleError extends ModuleError {
  public readonly phase: string;

  constructor(
    moduleId: string,
    phase: string,
    message?: string,
    cause?: unknown,
  ) {
    super(message ?? `Module "${moduleId}" failed during ${phase}.`, {
      code: ErrorCode.MODULE_LIFECYCLE,
      cause,
      moduleId,
      metadata: { phase },
      isOperational: false,
    });

    this.phase = phase;
  }
}

/**
 * Error thrown when a module dependency is missing.
 */
export class ModuleDependencyError extends ModuleError {
  constructor(moduleId: string, dependencyId: string, message?: string) {
    super(
      message ??
        `Module "${moduleId}" depends on "${dependencyId}" which is not available.`,
      {
        code: ErrorCode.MODULE_DEPENDENCY_MISSING,
        moduleId,
        dependencyId,
        statusCode: 500,
        expose: false,
      },
    );
  }
}
