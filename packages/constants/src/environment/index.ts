/**
 * Environment constants and detection utilities.
 *
 * @module environment
 */

export {
  type Environment,
  Environments,
  ENVIRONMENTS,
  isValidEnvironment,
} from "./environment.type.js";
export {
  NODE_ENV_KEY,
  type ResolveEnvironmentOptions,
  resolveEnvironment,
  isProduction,
  isDevelopment,
  isTest,
} from "./environment.constant.js";
