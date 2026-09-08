/**
 * @zudojs/core/errors
 *
 * Core error types and error handling utilities.
 */

export { ErrorCode } from "./errorCode.code.js";

export type { ErrorCode as ErrorCodeType } from "./errorCode.code.js";

export {
  FrameworkError,
  type FrameworkErrorJSON,
} from "./frameworkError.error.js";

export {
  InvalidArgumentError,
  InvalidStateError,
  ProviderNotFoundError,
  ProviderAlreadyRegisteredError,
  InvalidProviderError,
  DependencyResolutionError,
  ConfigurationNotFoundError,
  ExecutionContextNotFoundError,
  ModuleNotFoundError,
  AdapterNotFoundError,
  describeToken,
} from "./exceptions.js";
