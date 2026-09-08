/**
 * Runtime Options
 *
 * Configuration types, defaults, and resolution for runtime options.
 */

export { DEFAULT_RUNTIME_OPTIONS } from "./runtimeOptions.defaults.js";

export {
  resolveRuntimeOptions,
  validateRuntimeOptions,
} from "./runtimeOptions.resolver.js";

export {
  isRuntimeMode,
  isRuntimeRole,
  assertRuntimeMode,
  assertRuntimeRole,
} from "./runtimeOptions.validation.js";

export type {
  RuntimeMode,
  RuntimeRole,
  RuntimeStartupOptions,
  RuntimeShutdownOptions,
  RuntimeSignalOptions,
  RuntimeDiagnosticsOptions,
  RuntimeEnvironmentOverrides,
  RuntimeOptions,
  ResolvedRuntimeOptions,
} from "./runtimeOptions.type.js";
