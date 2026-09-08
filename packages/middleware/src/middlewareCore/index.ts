/**
 * Middleware composition and chaining utilities.
 *
 * @module middlewareCore
 */

export {
  compose,
  resolveMiddleware,
  resolveNamedMiddleware,
  withTiming,
  MAX_DEPTH,
  type ComposeOptions,
  type TimingOptions,
} from "./middlewareCore.compose.js";
