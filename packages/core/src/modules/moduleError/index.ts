/**
 * Module Errors
 *
 * Error classes and utilities for the module subsystem.
 */

export {
  ModuleErrorCode,
  type ModuleErrorCode as ModuleErrorCodeType,
  type ModuleErrorDetails,
  ModuleError,
} from "./moduleError.base.js";

export {
  InvalidModuleDefinitionError,
  ModuleNotFoundError,
  DuplicateModuleError,
} from "./moduleError.registration.js";

export {
  InvalidModuleDependencyError,
  MissingModuleDependencyError,
  CircularModuleDependencyError,
  ModuleVersionMismatchError,
} from "./moduleError.dependency.js";

export {
  getLifecycleErrorCode,
  ModuleInstantiationError,
  ModuleOperationError,
  InvalidModuleInstanceError,
  InvalidModuleStateError,
  ModuleOperationInProgressError,
} from "./moduleError.lifecycle.js";

export {
  isModuleError,
  hasModuleErrorCode,
  toModuleError,
} from "./moduleError.helpers.js";
