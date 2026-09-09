import type { Plugin } from "../pluginTypes/plugin.type.js";
import type { PluginContext } from "../pluginTypes/pluginContext.type.js";
import type { PluginState } from "../pluginTypes/pluginState.type.js";
import type { RegisteredPlugin } from "../pluginRegistry/pluginRegistry.core.js";
import { isValidTransition } from "../pluginTypes/pluginState.type.js";
import {
  PluginDisposeError,
  PluginStateError,
  PluginTimeoutError,
} from "@zudojs/errors";
import {
  PLUGIN_EVENTS,
  createPluginLifecycleEvent,
} from "../pluginEvents/pluginEvent.core.js";

/**
 * Emits a plugin lifecycle event if the context supports events.
 *
 * A throwing subscriber must not abort the lifecycle phase that emitted
 * the event, so delivery failures are contained here.
 */
function emitLifecycleEvent(
  context: PluginContext,
  eventName: string,
  plugin: Plugin["metadata"],
  state: PluginState,
  previousState?: PluginState,
  error?: unknown,
): void {
  if (!context.events?.emit) {
    return;
  }

  const event = createPluginLifecycleEvent(plugin, state, previousState, error);

  try {
    context.events.emit(eventName, event);
  } catch (emitError) {
    queueMicrotask(() => {
      console.error(
        `[@zudojs/plugins] Listener for "${eventName}" threw.`,
        emitError,
      );
    });
  }
}

/** Largest delay a timer can represent. */
const MAX_TIMER_DELAY = 2_147_483_647;

/**
 * Options controlling lifecycle execution.
 */
export interface LifecycleControllerOptions {
  /**
   * Maximum time a single lifecycle hook may run, in milliseconds.
   *
   * Defaults to `0` (unbounded), preserving existing behaviour. Set a
   * value to bound boot and shutdown: without one, a plugin whose
   * `start()` never settles hangs the whole application with no
   * diagnostic.
   */
  readonly hookTimeout?: number;
}

/**
 * Executes plugin lifecycle phases with state management and event emission.
 */
export class LifecycleController {
  private readonly options: LifecycleControllerOptions;

  public constructor(options: LifecycleControllerOptions = {}) {
    this.options = options;
  }

  /**
   * Runs a hook under the configured timeout, clearing the timer either
   * way so a completed hook never leaves one armed.
   */
  private async runHook(
    pluginName: string,
    phase: string,
    run: () => void | Promise<void>,
  ): Promise<void> {
    const timeout = this.options.hookTimeout ?? 0;

    if (timeout <= 0) {
      await run();
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;

    const hook = Promise.resolve().then(run);

    // The hook keeps running if the timeout wins; handle its eventual
    // rejection so it is never unhandled.
    hook.catch(() => {});

    try {
      await Promise.race([
        hook,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new PluginTimeoutError(pluginName, timeout, {
                  metadata: { phase },
                }),
              ),
            Math.min(timeout, MAX_TIMER_DELAY),
          );

          timer.unref?.();
        }),
      ]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }
  public async install<TPlugin extends Plugin>(
    registered: RegisteredPlugin<TPlugin>,
    context: PluginContext,
  ): Promise<void> {
    await this.runPhase(
      registered,
      context,
      "installing",
      "installed",
      PLUGIN_EVENTS.INSTALLING,
      PLUGIN_EVENTS.INSTALLED,
      () => registered.plugin.install?.(context, registered.options),
    );
  }

  public async initialize<TPlugin extends Plugin>(
    registered: RegisteredPlugin<TPlugin>,
    context: PluginContext,
  ): Promise<void> {
    await this.runPhase(
      registered,
      context,
      "initializing",
      "initialized",
      PLUGIN_EVENTS.INITIALIZING,
      PLUGIN_EVENTS.INITIALIZED,
      () => registered.plugin.initialize?.(context),
    );
  }

  public async start<TPlugin extends Plugin>(
    registered: RegisteredPlugin<TPlugin>,
    context: PluginContext,
  ): Promise<void> {
    await this.runPhase(
      registered,
      context,
      "starting",
      "started",
      PLUGIN_EVENTS.STARTING,
      PLUGIN_EVENTS.STARTED,
      () => registered.plugin.start?.(context),
    );
  }

  public async stop<TPlugin extends Plugin>(
    registered: RegisteredPlugin<TPlugin>,
    context: PluginContext,
  ): Promise<void> {
    await this.runPhase(
      registered,
      context,
      "stopping",
      "stopped",
      PLUGIN_EVENTS.STOPPING,
      PLUGIN_EVENTS.STOPPED,
      () => registered.plugin.stop?.(context),
    );
  }

  /**
   * Runs one lifecycle phase, moving through its transient state.
   *
   * On failure the plugin moves to `failed` through the state machine
   * rather than around it, so the recorded state is always one the
   * machine actually permits.
   */
  private async runPhase<TPlugin extends Plugin>(
    registered: RegisteredPlugin<TPlugin>,
    context: PluginContext,
    transient: PluginState,
    settled: PluginState,
    startEvent: string,
    endEvent: string,
    run: () => void | Promise<void>,
  ): Promise<void> {
    const metadata = registered.plugin.metadata;
    const from = registered.state;

    this.ensureTransition(registered, transient);
    registered.setState(transient);
    emitLifecycleEvent(context, startEvent, metadata, transient, from);

    try {
      await this.runHook(metadata.name, transient, run);
      this.ensureTransition(registered, settled);
      registered.setState(settled);
      emitLifecycleEvent(context, endEvent, metadata, settled, transient);
    } catch (error) {
      registered.setError(error);
      this.transitionToFailed(registered);
      emitLifecycleEvent(
        context,
        PLUGIN_EVENTS.FAILED,
        metadata,
        "failed",
        transient,
        error,
      );
      throw error;
    }
  }

  /**
   * Disposes a plugin and everything it registered for cleanup.
   *
   * Disposables run in reverse registration order — the mirror of how
   * they were acquired — and the list is emptied so a second dispose
   * cannot run them again. Every failure is collected; the plugin still
   * reaches a terminal state so it cannot be disposed twice.
   */
  public async dispose<TPlugin extends Plugin>(
    registered: RegisteredPlugin<TPlugin>,
    context: PluginContext,
  ): Promise<void> {
    const metadata = registered.plugin.metadata;
    const from = registered.state;

    if (from === "disposed" || from === "disposing") {
      return;
    }

    this.ensureTransition(registered, "disposing");
    registered.setState("disposing");
    emitLifecycleEvent(
      context,
      PLUGIN_EVENTS.DISPOSING,
      metadata,
      "disposing",
      from,
    );

    const errors: unknown[] = [];

    // Take the list before running it: a disposable that registers
    // another during teardown must not extend the loop indefinitely.
    const disposables = registered.disposables.splice(
      0,
      registered.disposables.length,
    );

    for (const disposable of disposables.reverse()) {
      try {
        await this.runHook(metadata.name, "disposing", () =>
          disposable.dispose(),
        );
      } catch (error) {
        errors.push(error);
      }
    }

    try {
      await this.runHook(metadata.name, "disposing", () =>
        registered.plugin.dispose?.(context),
      );
    } catch (error) {
      errors.push(error);
    }

    registered.setState("disposed");
    emitLifecycleEvent(
      context,
      PLUGIN_EVENTS.DISPOSED,
      metadata,
      "disposed",
      "disposing",
    );

    if (errors.length > 0) {
      const error = new PluginDisposeError(
        errors.length === 1
          ? `Plugin "${metadata.name}" failed to dispose.`
          : `Plugin "${metadata.name}" reported ${errors.length} disposal failures.`,
        metadata.name,
        { cause: errors[0] },
      );

      // Every failure is retained; reporting only the first would hide
      // the rest of a partially failed teardown.
      Object.defineProperty(error, "errors", {
        value: Object.freeze([...errors]),
        enumerable: true,
        configurable: true,
      });

      throw error;
    }
  }

  /**
   * Moves a plugin to `failed`, via `stopping` when required.
   */
  private transitionToFailed(registered: RegisteredPlugin): void {
    if (registered.state === "failed") {
      return;
    }

    if (this.canTransition(registered.state, "failed")) {
      registered.setState("failed");
      return;
    }

    // A phase can fail from a settled state (a hook that threw after
    // the state had already advanced). Route through `stopping`, which
    // every settled state permits, so the machine stays consistent.
    if (this.canTransition(registered.state, "stopping")) {
      registered.setState("stopping");
    }

    registered.setState("failed");
  }

  private canTransition(from: PluginState, to: PluginState): boolean {
    // Delegates to the exported predicate rather than re-deriving it:
    // two copies of the transition rule can disagree, and the public
    // `isValidTransition` must describe what the controller actually does.
    return isValidTransition(from, to);
  }

  private ensureTransition(
    registered: RegisteredPlugin,
    to: PluginState,
  ): void {
    const from = registered.state;
    if (from === to) {
      return;
    }

    if (!this.canTransition(from, to)) {
      throw new PluginStateError(registered.plugin.metadata.name, from, to);
    }
  }
}
