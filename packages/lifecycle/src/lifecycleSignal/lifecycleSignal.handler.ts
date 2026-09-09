/**
 * @zudojs/lifecycle/signal
 *
 * Process signal handler — manages SIGTERM, SIGINT, SIGHUP for graceful shutdown.
 */

/** Options for signal handling. */
export interface SignalHandlerOptions {
  /** Signals to listen for. */
  readonly signals?: readonly NodeJS.Signals[];
  /** Function to call when a signal is received. */
  readonly handler: () => void;
}

/** Default signal configuration for graceful shutdown. */
export const DEFAULT_SHUTDOWN_SIGNALS: readonly NodeJS.Signals[] =
  Object.freeze(["SIGINT", "SIGTERM"]);

/**
 * Installs process signal handlers that trigger lifecycle shutdown.
 * Returns a cleanup function to remove the handlers.
 */
export function installSignalHandlers(
  options: SignalHandlerOptions,
): () => void {
  // DEFAULT_SHUTDOWN_SIGNALS was exported as the documented default
  // while this function hard-coded its own copy of the same list, so
  // changing the constant had no effect on the actual default.
  const signals = options.signals ?? DEFAULT_SHUTDOWN_SIGNALS;
  const handler = options.handler;

  const installed: Array<[NodeJS.Signals, () => void]> = [];

  for (const signal of signals) {
    const listener = () => {
      handler();
    };
    process.on(signal, listener);
    installed.push([signal, listener]);
  }

  return () => {
    for (const [sig, listener] of installed) {
      process.removeListener(sig, listener);
    }
  };
}
