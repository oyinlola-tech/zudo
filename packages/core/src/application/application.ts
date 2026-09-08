import type { ApplicationContext } from "./applicationContext.context.js";
import type { ApplicationState } from "./applicationState.state.js";
import type { Lifecycle } from "../lifecycle/core/lifecycle.js";
import type { Runtime } from "../runtime/runtime.js";
import { RuntimeState } from "../runtime/runtimeState.state.js";
import { InvalidStateError } from "../errors/exceptions.js";

/**
 * Creates a fresh Runtime. Because a Runtime is single-use, an
 * Application needs a factory to support restart.
 */
export type RuntimeFactory = () => Runtime;

export interface ApplicationOptions {
  readonly context?: ApplicationContext;
  readonly lifecycle?: Lifecycle;
  /**
   * The runtime to orchestrate, or a factory that creates one. With
   * a factory, every start after a stop gets a new runtime so the
   * application can be restarted; with an instance, restart throws.
   */
  readonly runtime?: Runtime | RuntimeFactory;
}

/**
 * Top-level application object.
 *
 * Orchestrates an optional Lifecycle (application-level participants)
 * and an optional Runtime (module subsystem): start() runs the
 * lifecycle first and then the runtime; stop() unwinds in reverse.
 *
 * When a runtime is present, start(), stop(), and shutdown() run
 * inside the runtime's execution context (`runtime.contextStorage`
 * / `runtime.context`), so lifecycle participants observe the same
 * context as module hooks.
 */
export class Application {
  private readonly context?: ApplicationContext;
  private readonly lifecycle?: Lifecycle;
  private readonly runtimeFactory?: RuntimeFactory;
  private runtime?: Runtime;

  private _state: ApplicationState;

  private constructor(options: ApplicationOptions = {}) {
    this.context = options.context;
    this.lifecycle = options.lifecycle;

    if (typeof options.runtime === "function") {
      this.runtimeFactory = options.runtime;
    } else {
      this.runtime = options.runtime;
    }

    this._state = "created";
  }

  public static async create(
    options: ApplicationOptions = {},
  ): Promise<Application> {
    const application = new Application(options);

    await application.initialize();

    return application;
  }

  public get state(): ApplicationState {
    return this._state;
  }

  public get applicationContext(): ApplicationContext | undefined {
    return this.context;
  }

  /**
   * The current runtime, if any. Changes across restarts when a
   * runtime factory is used.
   */
  public get applicationRuntime(): Runtime | undefined {
    return this.runtime;
  }

  public async initialize(): Promise<void> {
    if (this._state !== "created") {
      return;
    }

    this._state = "initializing";

    try {
      await this.lifecycle?.initialize();

      this._state = "initialized";
    } catch (error) {
      this._state = "failed";

      throw error;
    }
  }

  public async start(): Promise<void> {
    if (this._state === "running") {
      return;
    }

    if (this._state === "created") {
      await this.initialize();
    }

    if (this._state !== "initialized" && this._state !== "stopped") {
      throw new InvalidStateError(
        `Application cannot start from state "${this._state}".`,
        { state: this._state },
      );
    }

    // Resolve the runtime first so a refused restart leaves the
    // application untouched.
    const runtime = this.ensureRuntime();

    this._state = "starting";

    try {
      await this.inRuntimeContext(runtime, async () => {
        await this.lifecycle?.start();
        await runtime?.start();
      });

      this._state = "running";
    } catch (error) {
      this._state = "failed";

      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (
      this._state === "stopped" ||
      this._state === "created" ||
      this._state === "initialized"
    ) {
      return;
    }

    if (this._state !== "running" && this._state !== "failed") {
      throw new InvalidStateError(
        `Application cannot stop from state "${this._state}".`,
        { state: this._state },
      );
    }

    this._state = "stopping";
    const errors: unknown[] = [];
    const runtime = this.runtime;

    await this.inRuntimeContext(runtime, async () => {
      try {
        await runtime?.stop();
      } catch (error) {
        errors.push(error);
      }

      try {
        await this.lifecycle?.stop();
      } catch (error) {
        errors.push(error);
      }
    });

    if (errors.length > 0) {
      this._state = "failed";

      if (errors.length === 1) throw errors[0];

      throw new AggregateError(
        errors,
        "Application stop completed with errors.",
      );
    }

    this._state = "stopped";
  }

  /**
   * Stops the application and releases lifecycle resources. The
   * application cannot be restarted afterwards.
   */
  public async shutdown(): Promise<void> {
    const errors: unknown[] = [];
    const runtime = this.runtime;

    await this.inRuntimeContext(runtime, async () => {
      try {
        await this.stop();
      } catch (error) {
        errors.push(error);
      }

      try {
        await runtime?.dispose();
      } catch (error) {
        errors.push(error);
      }

      try {
        await this.lifecycle?.dispose();
      } catch (error) {
        errors.push(error);
      }
    });

    if (errors.length === 1) throw errors[0];

    if (errors.length > 1) {
      throw new AggregateError(
        errors,
        "Application shutdown completed with errors.",
      );
    }
  }

  /**
   * Runs an operation inside the runtime's execution context, or
   * directly when the application has no runtime.
   */
  private inRuntimeContext<T>(
    runtime: Runtime | undefined,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (!runtime) return operation();

    return runtime.contextStorage.run(runtime.context, operation);
  }

  /**
   * Returns a startable runtime: the configured instance while it is
   * unused, or a new one from the factory after a stop/failure.
   */
  private ensureRuntime(): Runtime | undefined {
    const current = this.runtime;
    const reusable =
      current !== undefined && current.state === RuntimeState.CREATED;

    if (reusable) return current;

    if (this.runtimeFactory) {
      this.runtime = this.runtimeFactory();
      return this.runtime;
    }

    if (current === undefined) return undefined;

    throw new InvalidStateError(
      `Application runtime is "${current.state}" and cannot be restarted; supply a runtime factory to enable restart.`,
      { runtimeState: current.state },
    );
  }
}
