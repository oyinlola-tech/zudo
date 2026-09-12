/**
 * Module Lifecycle
 *
 * Manages the lifecycle phases of loaded modules:
 * initialize → start → stop → destroy.
 *
 * The state-machine plumbing (hook invocation, phase execution,
 * state maps) is internal to this subsystem and intentionally
 * not exported from this barrel.
 */

export {
  type ModuleLifecyclePhase,
  type ModuleLifecycleState,
  type ModuleLifecycleHookName,
  type ModuleLifecycleStep,
  type ModuleLifecycleHooks,
  type ModuleLifecycleOptions,
  type ModuleLifecyclePhaseOptions,
  ModuleLifecycleError,
  type ModuleLifecycleResult,
  type ModuleLifecycleSkip,
} from "./moduleLifecycle.type.js";

export {
  ModuleLifecycleManager,
  createModuleLifecycleManager,
} from "./moduleLifecycle.lifecycle.js";
