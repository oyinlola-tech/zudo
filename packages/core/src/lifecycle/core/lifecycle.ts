import type { Logger } from "../../logging/core/logger.js";
import { InvalidStateError } from "../../errors/exceptions.js";

/** Lifecycle states supported by the Zudojs application runtime. */
export const LifecycleState = {
  CREATED: "created",
  INITIALIZING: "initializing",
  INITIALIZED: "initialized",
  STARTING: "starting",
  RUNNING: "running",
  STOPPING: "stopping",
  STOPPED: "stopped",
  FAILED: "failed",
} as const;

export type LifecycleState =
  (typeof LifecycleState)[keyof typeof LifecycleState];

/** A lifecycle participant can participate in application initialization and shutdown. */
export interface LifecycleParticipant {
  readonly name: string;
  initialize?(): Promise<void> | void;
  start?(): Promise<void> | void;
  stop?(): Promise<void> | void;
  dispose?(): Promise<void> | void;
}

/** Options used by the lifecycle manager. */
export interface LifecycleOptions {
  readonly logger?: Logger;
  /**
   * Whether stop/dispose should keep going after a participant fails.
   * When false the phase aborts at the first failure and the lifecycle
   * is left FAILED (remaining participants are not unwound).
   *
   * Defaults to true.
   */
  readonly continueOnShutdownError?: boolean;
}

type LifecyclePhase = "initialize" | "start" | "stop" | "dispose";

/**
 * Coordinates initialization, startup, shutdown, and disposal of
 * application resources.
 *
 * State machine:
 *
 *   CREATED → INITIALIZING → INITIALIZED → STARTING → RUNNING
 *   RUNNING → STOPPING → STOPPED → (STARTING → RUNNING) restart
 *   any phase failure → FAILED; initialize()/start() retry from FAILED
 *   resume with the participant that failed; stop() from FAILED unwinds
 *   whatever started.
 *
 * Concurrent callers of the same phase share the in-flight promise.
 */
export class Lifecycle {
  private state: LifecycleState = LifecycleState.CREATED;
  private readonly participants: LifecycleParticipant[] = [];
  private readonly logger?: Logger;
  private readonly continueOnShutdownError: boolean;
  private initializedCount = 0;
  private startedCount = 0;
  private disposed = false;
  private failedPhase: LifecyclePhase | undefined;
  private initializePromise: Promise<void> | undefined;
  private startPromise: Promise<void> | undefined;
  private stopPromise: Promise<void> | undefined;

  public constructor(options: LifecycleOptions = {}) {
    this.logger = options.logger;
    this.continueOnShutdownError = options.continueOnShutdownError ?? true;
  }

  public getState(): LifecycleState {
    return this.state;
  }

  public getParticipants(): readonly LifecycleParticipant[] {
    return [...this.participants];
  }

  /**
   * Whether dispose() has run. A disposed lifecycle cannot be
   * restarted.
   */
  public isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Registers a participant. Only allowed before initialization
   * begins so every participant goes through every phase.
   */
  public register(participant: LifecycleParticipant): void {
    if (this.state !== LifecycleState.CREATED) {
      throw new InvalidStateError(
        `Cannot register lifecycle participant "${participant.name}" while application is "${this.state}".`,
        { participant: participant.name, state: this.state },
      );
    }

    this.participants.push(participant);
    this.logger?.debug("Lifecycle participant registered", {
      participant: participant.name,
    });
  }

  public async initialize(): Promise<void> {
    switch (this.state) {
      case LifecycleState.INITIALIZED:
      case LifecycleState.STARTING:
      case LifecycleState.RUNNING:
        return;
      case LifecycleState.INITIALIZING:
        return this.initializePromise;
      case LifecycleState.FAILED:
        if (this.failedPhase !== "initialize") {
          if (this.failedPhase === "start") return;
          throw this.invalidState("initialize");
        }
        break;
      case LifecycleState.STOPPED:
        // A lifecycle stopped after a failed initialization resumes
        // the pending participants; a fully initialized one is done.
        if (this.disposed) throw this.invalidState("initialize");
        if (this.initializedCount >= this.participants.length) return;
        break;
      case LifecycleState.CREATED:
        break;
      default:
        throw this.invalidState("initialize");
    }

    this.initializePromise = this.runInitialize();

    try {
      await this.initializePromise;
    } finally {
      this.initializePromise = undefined;
    }
  }

  public async start(): Promise<void> {
    switch (this.state) {
      case LifecycleState.RUNNING:
        return;
      case LifecycleState.STARTING:
        return this.startPromise;
      case LifecycleState.INITIALIZING:
        await this.initializePromise;
        return this.start();
      case LifecycleState.CREATED:
        await this.initialize();
        return this.start();
      case LifecycleState.FAILED:
        if (this.failedPhase === "initialize") {
          await this.initialize();
          return this.start();
        }
        if (this.failedPhase !== "start") {
          throw this.invalidState("start");
        }
        break;
      case LifecycleState.STOPPED:
        if (this.disposed) throw this.invalidState("start");
        if (this.initializedCount < this.participants.length) {
          await this.initialize();
          return this.start();
        }
        break;
      case LifecycleState.INITIALIZED:
        break;
      default:
        throw this.invalidState("start");
    }

    this.startPromise = this.runStart();

    try {
      await this.startPromise;
    } finally {
      this.startPromise = undefined;
    }
  }

  public async stop(): Promise<void> {
    switch (this.state) {
      case LifecycleState.STOPPED:
        return;
      case LifecycleState.STOPPING:
        return this.stopPromise;
      case LifecycleState.INITIALIZING:
        await this.initializePromise?.catch(() => undefined);
        return this.stop();
      case LifecycleState.STARTING:
        await this.startPromise?.catch(() => undefined);
        return this.stop();
      case LifecycleState.CREATED:
      case LifecycleState.INITIALIZED:
        // Nothing has started; no stop hooks to run.
        this.state = LifecycleState.STOPPED;
        return;
      case LifecycleState.FAILED:
        if (this.failedPhase === "dispose") throw this.invalidState("stop");
        break;
      case LifecycleState.RUNNING:
        break;
      default:
        throw this.invalidState("stop");
    }

    this.stopPromise = this.runStop();

    try {
      await this.stopPromise;
    } finally {
      this.stopPromise = undefined;
    }
  }

  /**
   * Disposes every participant in reverse registration order.
   *
   * Idempotent. Participants that are still running are not stopped
   * first; use shutdown() for stop-then-dispose.
   */
  public async dispose(): Promise<void> {
    if (this.disposed) return;

    if (
      this.state === LifecycleState.STOPPING ||
      this.state === LifecycleState.STARTING ||
      this.state === LifecycleState.INITIALIZING
    ) {
      throw this.invalidState("dispose");
    }

    this.disposed = true;
    const errors: unknown[] = [];

    for (let i = this.participants.length - 1; i >= 0; i--) {
      const participant = this.participants[i]!;
      try {
        this.logger?.debug("Disposing lifecycle participant", {
          participant: participant.name,
        });
        await participant.dispose?.();
      } catch (error) {
        errors.push(error);
        this.logger?.error("Failed to dispose lifecycle participant", error, {
          participant: participant.name,
        });
        if (!this.continueOnShutdownError) break;
      }
    }

    this.initializedCount = 0;
    this.startedCount = 0;

    if (errors.length > 0 && !this.continueOnShutdownError) {
      this.state = LifecycleState.FAILED;
      this.failedPhase = "dispose";
    } else if (this.state !== LifecycleState.FAILED) {
      this.state = LifecycleState.STOPPED;
    }

    if (errors.length > 0)
      throw new AggregateError(
        errors,
        "One or more lifecycle participants failed to dispose.",
      );
  }

  public async shutdown(): Promise<void> {
    let stopError: unknown;
    try {
      await this.stop();
    } catch (error) {
      stopError = error;
    }
    let disposeError: unknown;
    try {
      await this.dispose();
    } catch (error) {
      disposeError = error;
    }
    if (stopError && disposeError)
      throw new AggregateError(
        [stopError, disposeError],
        "Application shutdown completed with errors.",
      );
    if (stopError) throw stopError;
    if (disposeError) throw disposeError;
  }

  private async runInitialize(): Promise<void> {
    this.state = LifecycleState.INITIALIZING;
    this.failedPhase = undefined;
    this.logger?.debug("Application initialization started");

    try {
      for (let i = this.initializedCount; i < this.participants.length; i++) {
        const participant = this.participants[i]!;
        this.logger?.debug("Initializing lifecycle participant", {
          participant: participant.name,
        });
        await participant.initialize?.();
        this.initializedCount = i + 1;
      }
      this.state = LifecycleState.INITIALIZED;
      this.logger?.info("Application initialization completed");
    } catch (error) {
      this.state = LifecycleState.FAILED;
      this.failedPhase = "initialize";
      this.logger?.error("Application initialization failed", error);
      throw error;
    }
  }

  private async runStart(): Promise<void> {
    this.state = LifecycleState.STARTING;
    this.failedPhase = undefined;
    this.logger?.debug("Application startup started");

    try {
      for (let i = this.startedCount; i < this.participants.length; i++) {
        const participant = this.participants[i]!;
        this.logger?.debug("Starting lifecycle participant", {
          participant: participant.name,
        });
        await participant.start?.();
        this.startedCount = i + 1;
      }
      this.state = LifecycleState.RUNNING;
      this.logger?.info("Application startup completed");
    } catch (error) {
      this.state = LifecycleState.FAILED;
      this.failedPhase = "start";
      this.logger?.error("Application startup failed", error);
      throw error;
    }
  }

  private async runStop(): Promise<void> {
    this.state = LifecycleState.STOPPING;
    this.failedPhase = undefined;
    this.logger?.debug("Application shutdown started");
    const errors: unknown[] = [];
    let aborted = false;

    // Only participants whose start() completed are stopped.
    for (let i = this.startedCount - 1; i >= 0; i--) {
      const participant = this.participants[i]!;
      try {
        this.logger?.debug("Stopping lifecycle participant", {
          participant: participant.name,
        });
        await participant.stop?.();
        this.startedCount = i;
      } catch (error) {
        errors.push(error);
        this.logger?.error("Failed to stop lifecycle participant", error, {
          participant: participant.name,
        });
        if (!this.continueOnShutdownError) {
          aborted = true;
          break;
        }
        this.startedCount = i;
      }
    }

    if (aborted) {
      this.state = LifecycleState.FAILED;
      this.failedPhase = "stop";
    } else {
      this.startedCount = 0;
      this.state = LifecycleState.STOPPED;
      this.logger?.info("Application shutdown completed");
    }

    if (errors.length > 0)
      throw new AggregateError(
        errors,
        "One or more lifecycle participants failed to stop.",
      );
  }

  private invalidState(operation: LifecyclePhase): InvalidStateError {
    const label =
      operation === "initialize"
        ? "initialize"
        : operation === "start"
          ? "start"
          : operation === "stop"
            ? "stop"
            : "dispose";

    return new InvalidStateError(
      `Cannot ${label} application while state is "${this.state}".`,
      { operation, state: this.state },
    );
  }
}
