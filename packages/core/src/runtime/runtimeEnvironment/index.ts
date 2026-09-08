/**
 * Runtime Environment
 *
 * Detects and provides access to the runtime environment
 * including engine, platform, process info, and variables.
 */

export {
  DefaultRuntimeEnvironment,
  MissingEnvironmentVariableError,
  createRuntimeEnvironment,
} from "./runtimeEnvironment.core.js";

export {
  detectRuntimeEngine,
  detectPlatform,
  detectProcessInfo,
  detectHostInfo,
  getNodeOsObject,
  safeCall,
  detectCI,
  detectContainer,
} from "./detection/index.js";

export type {
  RuntimePlatform,
  RuntimeEngine,
  RuntimeEnvironmentVariables,
  RuntimeProcessInfo,
  RuntimeHostInfo,
  RuntimeEngineInfo,
  RuntimeEnvironmentInfo,
  RuntimeEnvironmentSummary,
  RuntimeEnvironment,
  RuntimeEnvironmentOptions,
} from "./runtimeEnvironment.type.js";
