/**
 * @zudojs/adapters/adapter
 *
 * Core adapter types and registry.
 */

export type { Adapter } from "./adapter.type.js";
export { AdapterRegistry } from "./adapter.registry.js";
export type { AdapterCapabilityName } from "./adapter.registry.js";
export { collectAdapterHealth, configureAdapter } from "./adapter.health.js";
export type { AdapterHealthReport } from "./adapter.health.js";
export { withRetry } from "./adapter.retry.js";
export {
  runAdapterLifecycle,
  toAdapterLifecycleError,
} from "./adapterLifecycle/index.js";
export type { AdapterLifecycleOperation } from "./adapterLifecycle/index.js";
