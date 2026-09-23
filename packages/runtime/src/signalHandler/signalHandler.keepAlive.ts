/**
 * Keeping the process alive while a signal-triggered shutdown runs.
 *
 * Node's signal listeners do not hold the event loop open. A SIGTERM
 * handled while nothing else was keeping the loop alive — or whose
 * shutdown closed the last open handle before an `onShutdown` hook had
 * finished — let the process exit mid-shutdown with code 0, the runtime
 * still `running` or `stopping`, and the remaining hooks never run.
 *
 * @module signalHandler/signalHandler.keepAlive
 */

/** Longest delay a Node timer accepts; the timer never fires in practice. */
const KEEP_ALIVE_INTERVAL = 2_147_483_647;

/**
 * Holds the event loop open until the returned release function is called.
 *
 * The handle is a ref'd interval that does nothing, so the process stays
 * up exactly as long as the shutdown it guards.
 */
export function holdEventLoop(): () => void {
  const handle = setInterval(() => undefined, KEEP_ALIVE_INTERVAL);
  let released = false;

  return () => {
    if (released) return;
    released = true;
    clearInterval(handle);
  };
}

/**
 * Runs one more event-loop turn so a signal that was already delivered,
 * but not yet dispatched, reaches its listener.
 *
 * A process that signals itself (`process.kill(process.pid, "SIGTERM")`)
 * with nothing else keeping the loop alive otherwise exits without ever
 * polling for the signal, so the listener never runs.
 */
export function flushPendingSignals(): void {
  setImmediate(() => undefined);
}

/** Sets the exit code the process ends with once the loop drains. */
export function setProcessExitCode(code: number): void {
  process.exitCode = code;
}
