import type { Logger } from "../../logging/core/logger.js";
import {
  hasDestroyHook,
  hasInitializeHook,
  hasStartHook,
  hasStopHook,
  type LifecycleHook,
} from "../core/lifecycleHook.hook.js";
import {
  Lifecycle,
  type LifecycleState,
  type LifecycleParticipant,
} from "../core/lifecycle.js";

/** Anything that can participate in the managed application lifecycle. */
export type ManagedLifecycleComponent = LifecycleParticipant | LifecycleHook;

/** Options for LifecycleManager. */
export interface LifecycleManagerOptions {
  readonly logger?: Logger;
  readonly continueOnShutdownError?: boolean;
}

/**
 * Coordinates lifecycle hooks and lifecycle participants.
 * Primary API for application-level lifecycle management.
 *
 * Every component, whether it uses the hook interfaces (onInitialize,
 * onStart, onStop, onDestroy) or the participant API (initialize,
 * start, stop, dispose), is normalized into a single participant and
 * driven by one Lifecycle state machine. This guarantees:
 *
 * - global registration order across both component kinds
 *   (initialize/start forward, stop/destroy reverse),
 * - a component exposing both shapes runs exactly once per phase
 *   (the `onX` hook takes precedence),
 * - state guards, retries, and concurrency rules of Lifecycle.
 */
export class LifecycleManager {
  private readonly lifecycle: Lifecycle;
  private readonly components: ManagedLifecycleComponent[] = [];
  private readonly logger?: Logger;

  public constructor(options: LifecycleManagerOptions = {}) {
    this.logger = options.logger;
    this.lifecycle = new Lifecycle({
      logger: this.logger,
      continueOnShutdownError: options.continueOnShutdownError ?? true,
    });
  }

  public getState(): LifecycleState {
    return this.lifecycle.getState();
  }

  public getComponents(): readonly ManagedLifecycleComponent[] {
    return [...this.components];
  }

  /**
   * Registers a component. Only allowed before initialization begins.
   */
  public register(component: ManagedLifecycleComponent): void {
    this.lifecycle.register(this.toParticipant(component));
    this.components.push(component);
  }

  public async initialize(): Promise<void> {
    this.logger?.debug("Lifecycle manager initialization started");
    await this.lifecycle.initialize();
    this.logger?.debug("Lifecycle manager initialization completed");
  }

  public async start(): Promise<void> {
    this.logger?.debug("Lifecycle manager startup started");
    await this.lifecycle.start();
    this.logger?.debug("Lifecycle manager startup completed");
  }

  public async stop(): Promise<void> {
    this.logger?.debug("Lifecycle manager shutdown started");
    await this.lifecycle.stop();
    this.logger?.debug("Lifecycle manager shutdown completed");
  }

  public async destroy(): Promise<void> {
    this.logger?.debug("Lifecycle manager destruction started");
    await this.lifecycle.dispose();
    this.logger?.debug("Lifecycle manager destruction completed");
  }

  public async shutdown(): Promise<void> {
    await this.lifecycle.shutdown();
  }

  /**
   * Normalizes a component into a LifecycleParticipant. Hook methods
   * (onInitialize, ...) win over participant methods (initialize, ...)
   * when a component exposes both, so each phase runs once.
   */
  private toParticipant(
    component: ManagedLifecycleComponent,
  ): LifecycleParticipant {
    const name = this.getComponentName(component);
    const participant = this.isLifecycleParticipant(component)
      ? component
      : undefined;

    const initialize = hasInitializeHook(component)
      ? () => this.runHook(name, "initialize", () => component.onInitialize())
      : participant?.initialize
        ? () =>
            this.runHook(name, "initialize", () => participant.initialize!())
        : undefined;

    const start = hasStartHook(component)
      ? () => this.runHook(name, "start", () => component.onStart())
      : participant?.start
        ? () => this.runHook(name, "start", () => participant.start!())
        : undefined;

    const stop = hasStopHook(component)
      ? () => this.runHook(name, "stop", () => component.onStop())
      : participant?.stop
        ? () => this.runHook(name, "stop", () => participant.stop!())
        : undefined;

    const dispose = hasDestroyHook(component)
      ? () => this.runHook(name, "destroy", () => component.onDestroy())
      : participant?.dispose
        ? () => this.runHook(name, "destroy", () => participant.dispose!())
        : undefined;

    return { name, initialize, start, stop, dispose };
  }

  private async runHook(
    component: string,
    label: string,
    hook: () => Promise<void> | void,
  ): Promise<void> {
    this.logger?.debug(`Running lifecycle ${label} hook`, { component });
    await hook();
  }

  private isLifecycleParticipant(
    component: ManagedLifecycleComponent,
  ): component is LifecycleParticipant {
    return (
      typeof component === "object" &&
      component !== null &&
      "name" in component &&
      typeof component.name === "string"
    );
  }

  private getComponentName(component: ManagedLifecycleComponent): string {
    if ("name" in component && typeof component.name === "string")
      return component.name;
    if (
      typeof component === "object" &&
      component !== null &&
      "constructor" in component &&
      typeof component.constructor === "function" &&
      component.constructor.name &&
      component.constructor !== Object
    )
      return component.constructor.name;
    return "anonymous";
  }
}
