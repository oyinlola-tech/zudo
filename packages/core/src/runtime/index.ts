/**
 * Runtime
 *
 * Public API for the core runtime subsystem.
 */

/*
 * Runtime
 */
export { DefaultRuntime, createRuntime } from "./runtime.js";

export type {
  RuntimeLifecycleState,
  RuntimeDependencies,
  RuntimeStatus,
  Runtime,
} from "./runtime.js";

/*
 * Runtime options
 */
export {
  DEFAULT_RUNTIME_OPTIONS,
  resolveRuntimeOptions,
  validateRuntimeOptions,
  isRuntimeMode,
  isRuntimeRole,
  assertRuntimeMode,
  assertRuntimeRole,
} from "./runtimeOptions/index.js";

export type {
  RuntimeMode,
  RuntimeRole,
  RuntimeOptions,
  RuntimeStartupOptions,
  RuntimeShutdownOptions,
  RuntimeSignalOptions,
  RuntimeDiagnosticsOptions,
  RuntimeEnvironmentOverrides,
  ResolvedRuntimeOptions,
} from "./runtimeOptions/index.js";

/*
 * Runtime state
 */
export {
  RuntimeState,
  TERMINAL_RUNTIME_STATES,
  STARTABLE_RUNTIME_STATES,
  STOPPABLE_RUNTIME_STATES,
  TRANSITIONAL_RUNTIME_STATES,
  isRuntimeState,
  isRuntimeReady,
  isRuntimeFailed,
  isRuntimeTransitioning,
  isRuntimeTerminal,
  canStartRuntime,
  canStopRuntime,
  canTransitionRuntime,
  assertRuntimeState,
  assertRuntimeTransition,
  createRuntimeStateSnapshot,
  createRuntimeStateTransition,
  getRuntimeStateLabel,
  getRuntimeStates,
  getNextRuntimeStates,
} from "./runtimeState.state.js";

export type {
  RuntimeStateSnapshot,
  RuntimeStateTransition,
  RuntimeTiming,
} from "./runtimeState.state.js";

/*
 * Runtime context
 */
export {
  createRuntimeId,
  createRuntimeIdentity,
  createRuntimeExecutionContext,
  createRuntimeContext,
} from "./runtimeContext/index.js";

export type {
  RuntimeIdentity,
  RuntimeExecutionMetadata,
  RuntimeExecutionContext,
  RuntimeContext,
} from "./runtimeContext/index.js";

/*
 * Runtime environment
 */
export {
  DefaultRuntimeEnvironment,
  createRuntimeEnvironment,
  detectRuntimeEngine,
  detectPlatform,
  detectProcessInfo,
  detectHostInfo,
  detectCI,
  detectContainer,
  MissingEnvironmentVariableError,
} from "./runtimeEnvironment/index.js";

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
} from "./runtimeEnvironment/index.js";

/*
 * Runtime bootstrap
 */
export { DefaultRuntimeBootstrap } from "./runtimeBootstrap/index.js";

export type {
  RuntimeBootstrap,
  RuntimeBootstrapDependencies,
  RuntimeBootstrapOptions,
  RuntimeBootstrapPhase,
  RuntimeBootstrapResult,
  RuntimeBootstrapErrorInfo,
} from "./runtimeBootstrap/index.js";

/*
 * Runtime shutdown
 */
export { DefaultRuntimeShutdown } from "./runtimeShutdown/index.js";

export type {
  RuntimeShutdown,
  RuntimeShutdownDependencies,
  RuntimeShutdownConfig,
  RuntimeShutdownPhase,
  RuntimeShutdownResult,
  RuntimeShutdownErrorInfo,
} from "./runtimeShutdown/index.js";

/*
 * Runtime signals
 */
export { RuntimeSignalManager } from "./runtimeSignals/index.js";

export type {
  RuntimeTerminationSignal,
  RuntimeProcessEvent,
  RuntimeSignalTarget,
  RuntimeSignalHandlers,
  RuntimeSignalManagerOptions,
} from "./runtimeSignals/index.js";

/*
 * Runtime timeout
 */
export { withRuntimeTimeout } from "./runtimeTimeout.js";

export type {
  TimeoutAwareOperation,
  RuntimeTimeoutOptions,
} from "./runtimeTimeout.js";

/*
 * Runtime errors
 */
export {
  RuntimeError,
  RuntimeErrorCode,
  InvalidRuntimeStateError,
  InvalidRuntimeTransitionError,
  RuntimeStartError,
  RuntimeStopError,
  RuntimeInitializationError,
  RuntimeLoadError,
  RuntimeTimeoutError,
  RuntimeDependencyError,
  RuntimeNotReadyError,
  RuntimeUnsupportedOperationError,
  RuntimeCancellationError,
  toRuntimeError,
  isRuntimeError,
  hasRuntimeErrorCode,
  createRuntimeError,
} from "./runtimeError/index.js";

export type {
  RuntimeOperation,
  RuntimeErrorPhase,
  RuntimeErrorMetadata,
  RuntimeErrorOptions,
  RuntimeErrorJSON,
} from "./runtimeError/index.js";
