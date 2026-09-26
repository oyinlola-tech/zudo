/**
 * @zudojs/adapters/adapter/adapterLifecycle
 *
 * Bounded, typed execution of adapter lifecycle hooks, singly and across a
 * registry's adapters.
 */

export {
  runAdapterLifecycle,
  toAdapterLifecycleError,
} from "./adapterLifecycle.ops.js";
export type { AdapterLifecycleOperation } from "./adapterLifecycle.ops.js";
export {
  runAdapterLifecycleAll,
  teardownAdapter,
} from "./adapterLifecycle.all.js";
