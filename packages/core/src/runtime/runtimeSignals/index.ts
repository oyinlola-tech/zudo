/**
 * Runtime Signals
 *
 * Process signal and exception handling for graceful shutdown.
 */

export { RuntimeSignalManager } from "./runtimeSignals.js";

export type {
  RuntimeTerminationSignal,
  RuntimeProcessEvent,
  RuntimeSignalTarget,
  RuntimeSignalHandlers,
  RuntimeSignalManagerOptions,
} from "./runtimeSignals.js";
