import type { Logger } from "../../logging/core/logger.js";
import type { RuntimeSignalOptions } from "../runtimeOptions/runtimeOptions.type.js";

/**
 * Termination signals the runtime can react to.
 */
export type RuntimeTerminationSignal = "SIGINT" | "SIGTERM" | "SIGHUP";

/**
 * Process events the signal manager can subscribe to.
 */
export type RuntimeProcessEvent =
  RuntimeTerminationSignal | "uncaughtException" | "unhandledRejection";

/**
 * Minimal `process`-like target. Defaults to the global process; tests
 * inject an EventEmitter so nothing is registered on the real process
 * and `exit` can be observed instead of executed.
 */
export interface RuntimeSignalTarget {
  on(event: string, listener: (...args: never[]) => void): unknown;
  off(event: string, listener: (...args: never[]) => void): unknown;
  exit?(code?: number): void;
}

/**
 * Hooks the runtime supplies to react to process events.
 */
export interface RuntimeSignalHandlers {
  /**
   * A termination signal arrived; the runtime should stop gracefully.
   */
  onSignal(signal: RuntimeTerminationSignal): void | Promise<void>;

  /**
   * An uncaught exception reached the process.
   */
  onUncaughtException(error: unknown): void | Promise<void>;

  /**
   * A promise rejection was never handled.
   */
  onUnhandledRejection(reason: unknown): void | Promise<void>;
}

/**
 * Options for the signal manager.
 */
export interface RuntimeSignalManagerOptions {
  readonly signals: Required<RuntimeSignalOptions>;
  readonly target?: RuntimeSignalTarget;
  readonly logger?: Logger;
}

/**
 * Registers and removes process signal/exception handlers on behalf
 * of the runtime.
 *
 * Policy:
 * - Handlers are registered by `register()` and removed by
 *   `unregister()`; both are idempotent.
 * - The first termination signal triggers `onSignal` (graceful stop).
 * - A second termination signal while the first is still being
 *   handled is logged and ignored, unless `forceExitOnSecondSignal`
 *   is on, in which case `target.exit(forceExitCode)` is called.
 * - `process.exit` is never called otherwise.
 */
export class RuntimeSignalManager {
  private readonly _signals: Required<RuntimeSignalOptions>;
  private readonly _target: RuntimeSignalTarget | undefined;
  private readonly _logger: Logger | undefined;
  private readonly _listeners = new Map<
    RuntimeProcessEvent,
    (...args: never[]) => void
  >();
  private _handlers: RuntimeSignalHandlers | undefined;
  private _receivedSignals = 0;
  private _stopping = false;

  public constructor(options: RuntimeSignalManagerOptions) {
    this._signals = options.signals;
    this._target = options.target ?? getGlobalProcess();
    this._logger = options.logger;
  }

  /**
   * Whether handlers are currently attached to the target.
   */
  public get registered(): boolean {
    return this._listeners.size > 0;
  }

  /**
   * Number of termination signals received since registration.
   */
  public get receivedSignals(): number {
    return this._receivedSignals;
  }

  /**
   * Process events this manager subscribes to given its options.
   */
  public get events(): readonly RuntimeProcessEvent[] {
    const events: RuntimeProcessEvent[] = [];
    if (this._signals.handleSigint) events.push("SIGINT");
    if (this._signals.handleSigterm) events.push("SIGTERM");
    if (this._signals.handleSighup) events.push("SIGHUP");
    if (this._signals.handleUncaughtException) events.push("uncaughtException");
    if (this._signals.handleUnhandledRejection)
      events.push("unhandledRejection");
    return events;
  }

  /**
   * Attaches handlers to the target. No-op when already registered or
   * when no target is available (non-Node engines).
   */
  public register(handlers: RuntimeSignalHandlers): void {
    if (this.registered || !this._target) return;

    this._handlers = handlers;
    this._receivedSignals = 0;
    this._stopping = false;

    for (const event of this.events) {
      const listener = this.createListener(event);
      this._listeners.set(event, listener);
      this._target.on(event, listener);
    }
  }

  /**
   * Detaches all handlers from the target.
   */
  public unregister(): void {
    if (!this._target) return;

    for (const [event, listener] of this._listeners) {
      this._target.off(event, listener);
    }

    this._listeners.clear();
    this._handlers = undefined;
  }

  private createListener(
    event: RuntimeProcessEvent,
  ): (...args: never[]) => void {
    switch (event) {
      case "SIGINT":
      case "SIGTERM":
      case "SIGHUP":
        return () => {
          this.handleSignal(event);
        };
      case "uncaughtException":
        return ((error: unknown) => {
          this.run(
            () => this._handlers?.onUncaughtException(error),
            "uncaughtException",
          );
        }) as (...args: never[]) => void;
      case "unhandledRejection":
        return ((reason: unknown) => {
          this.run(
            () => this._handlers?.onUnhandledRejection(reason),
            "unhandledRejection",
          );
        }) as (...args: never[]) => void;
      default:
        return () => {};
    }
  }

  private handleSignal(signal: RuntimeTerminationSignal): void {
    this._receivedSignals += 1;

    if (this._stopping) {
      if (this._signals.forceExitOnSecondSignal) {
        this._logger?.warn(
          `Received ${signal} during shutdown; forcing process exit.`,
          { signal, exitCode: this._signals.forceExitCode },
        );
        this._target?.exit?.(this._signals.forceExitCode);
        return;
      }

      this._logger?.warn(
        `Received ${signal} while shutdown is already in progress; ignoring.`,
        { signal },
      );
      return;
    }

    this._stopping = true;
    this._logger?.info(`Received ${signal}; stopping runtime gracefully.`, {
      signal,
    });
    this.run(() => this._handlers?.onSignal(signal), signal);
  }

  private run(
    handler: () => void | Promise<void> | undefined,
    event: RuntimeProcessEvent,
  ): void {
    try {
      const result = handler();
      if (result && typeof (result as Promise<void>).then === "function") {
        (result as Promise<void>).catch((error: unknown) => {
          this._logger?.error(`Runtime ${event} handler failed.`, error, {
            event,
          });
        });
      }
    } catch (error) {
      this._logger?.error(`Runtime ${event} handler failed.`, error, {
        event,
      });
    }
  }
}

function getGlobalProcess(): RuntimeSignalTarget | undefined {
  const candidate = (globalThis as { process?: unknown }).process;

  if (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof (candidate as RuntimeSignalTarget).on === "function" &&
    typeof (candidate as RuntimeSignalTarget).off === "function"
  ) {
    return candidate as RuntimeSignalTarget;
  }

  return undefined;
}
