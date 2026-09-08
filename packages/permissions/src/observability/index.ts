/**
 * Authorization observability — events, metrics, and tracing.
 *
 * @module observability
 */

export {
  createPermissionEventEmitter,
  withObservability,
  type PermissionCheckEvent,
  type PermissionEventHandler,
  type PermissionEventEmitter,
  type PermissionEventEmitterOptions,
} from "./observability.core.js";
