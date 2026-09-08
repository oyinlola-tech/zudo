import type { Logger } from "@zudojs/logger";

/**
 * Options controlling signal and fatal-error handling.
 */
export interface SignalHandlerOptions {
  readonly handleSignals: boolean;
  readonly handleFatalErrors: boolean;
  /**
   * Whether a second termination signal exits immediately.
   *
   * Defaults to `true`. Without it an operator watching a wedged
   * shutdown has no escape short of SIGKILL.
   */
  readonly forceExitOnSecondSignal?: boolean;
  /**
   * Whether an uncaught exception exits the process after shutdown.
   *
   * Defaults to `true`. Installing an `uncaughtException` handler
   * suppresses Node's default crash, so without this the process keeps
   * serving requests on state a fatal error has already made
   * untrustworthy.
   */
  readonly exitOnFatalError?: boolean;
  /**
   * How long a fatal-error shutdown may take before the process exits
   * anyway, in milliseconds. Defaults to 10000.
   */
  readonly fatalExitTimeout?: number;
  /** Exit hook, injected for testing. Defaults to `process.exit`. */
  readonly exit?: (code: number) => void;
}

/** Default grace period for a fatal-error shutdown. */
const DEFAULT_FATAL_EXIT_TIMEOUT = 10_000;

/**
 * Signal handler for process lifecycle events.
 */
export class SignalHandler {
  private readonly logger: Logger;
  private readonly options: SignalHandlerOptions;
  private shutdownHandler: (() => void | Promise<void>) | null = null;
  private isShuttingDown = false;
  private registered = false;
  private forcedExitTimer: ReturnType<typeof setTimeout> | null = null;

  public constructor(logger: Logger, options: SignalHandlerOptions) {
    this.logger = logger;
    this.options = options;
  }

  /**
   * Registers signal handlers.
   *
   * Registering twice is a no-op rather than a second set of listeners,
   * so a stop/start cycle cannot accumulate handlers.
   */
  public register(shutdownHandler: () => void | Promise<void>): void {
    this.shutdownHandler = shutdownHandler;

    if (this.registered) {
      return;
    }

    this.registered = true;
    this.isShuttingDown = false;

    if (this.options.handleSignals) {
      process.on("SIGTERM", this.handleTermination);
      process.on("SIGINT", this.handleInterruption);
    }

    if (this.options.handleFatalErrors) {
      process.on("uncaughtException", this.handleUncaughtException);
      process.on("unhandledRejection", this.handleUnhandledRejection);
    }
  }

  /**
   * Removes all signal handlers.
   *
   * Safe to call when nothing is registered, so it can run on both the
   * success and failure paths of a shutdown.
   */
  public unregister(): void {
    if (this.forcedExitTimer) {
      clearTimeout(this.forcedExitTimer);
      this.forcedExitTimer = null;
    }

    if (!this.registered) {
      this.shutdownHandler = null;
      return;
    }

    if (this.options.handleSignals) {
      process.off("SIGTERM", this.handleTermination);
      process.off("SIGINT", this.handleInterruption);
    }

    if (this.options.handleFatalErrors) {
      process.off("uncaughtException", this.handleUncaughtException);
      process.off("unhandledRejection", this.handleUnhandledRejection);
    }

    this.registered = false;
    this.isShuttingDown = false;
    this.shutdownHandler = null;
  }

  /**
   * Whether a shutdown has been initiated by a signal.
   */
  public get shuttingDown(): boolean {
    return this.isShuttingDown;
  }

  private handleTermination = (): void => {
    this.logger.info("Received SIGTERM signal.");
    this.initiateShutdown("SIGTERM");
  };

  private handleInterruption = (): void => {
    this.logger.info("Received SIGINT signal.");
    this.initiateShutdown("SIGINT");
  };

  /**
   * Handles uncaught exceptions.
   *
   * The process state is no longer trustworthy after one, so this shuts
   * down and then exits non-zero rather than continuing to serve.
   */
  private handleUncaughtException = (error: Error): void => {
    this.logger.error("Uncaught exception.", {
      errorMessage: error.message,
      stack: error.stack,
    });

    this.initiateFatalShutdown();
  };

  private handleUnhandledRejection = (reason: unknown): void => {
    const message = reason instanceof Error ? reason.message : String(reason);
    this.logger.error("Unhandled rejection.", {
      reason: message,
      ...(reason instanceof Error && reason.stack
        ? { stack: reason.stack }
        : {}),
    });

    this.initiateFatalShutdown();
  };

  /**
   * Shuts down after a fatal error and exits non-zero.
   */
  private initiateFatalShutdown(): void {
    if (this.options.exitOnFatalError === false) {
      this.initiateShutdown("fatal");
      return;
    }

    const timeout = this.options.fatalExitTimeout ?? DEFAULT_FATAL_EXIT_TIMEOUT;

    if (!this.isShuttingDown) {
      // Exit even if the shutdown itself hangs — a process that is
      // already in an undefined state must not linger indefinitely.
      this.forcedExitTimer = setTimeout(() => {
        this.logger.error("Fatal shutdown timed out; exiting.");
        this.exit(1);
      }, timeout);

      this.forcedExitTimer.unref?.();
    }

    void Promise.resolve(this.initiateShutdown("fatal")).finally(() => {
      if (this.forcedExitTimer) {
        clearTimeout(this.forcedExitTimer);
        this.forcedExitTimer = null;
      }
      this.exit(1);
    });
  }

  /**
   * Initiates graceful shutdown.
   *
   * A second termination signal exits immediately: an operator pressing
   * Ctrl-C again on a stuck shutdown is asking for exactly that.
   */
  private initiateShutdown(source: string): void | Promise<void> {
    if (this.isShuttingDown) {
      if (
        (this.options.forceExitOnSecondSignal ?? true) &&
        source !== "fatal"
      ) {
        this.logger.warn(
          `Received a second ${source} while shutting down; exiting immediately.`,
        );
        this.exit(1);
        return;
      }

      this.logger.warn("Shutdown already in progress, ignoring signal.");
      return;
    }

    this.isShuttingDown = true;

    if (this.shutdownHandler) {
      return Promise.resolve(this.shutdownHandler()).catch((error: unknown) => {
        this.logger.error("Shutdown handler failed.", {
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  private exit(code: number): void {
    const exit = this.options.exit ?? ((value: number) => process.exit(value));
    exit(code);
  }
}
