import type { Logger } from "../../logging/core/logger.js";
import type {
  LifecycleComponent,
  LifecycleRegistration,
} from "../core/lifecycleRegistry.registry.js";
import { LifecycleRegistry } from "../core/lifecycleRegistry.registry.js";
import { InvalidStateError } from "../../errors/exceptions.js";

/** Lifecycle scope state. */
export const LifecycleScopeState = {
  CREATED: "created",
  INITIALIZING: "initializing",
  INITIALIZED: "initialized",
  STARTING: "starting",
  RUNNING: "running",
  STOPPING: "stopping",
  STOPPED: "stopped",
  DESTROYED: "destroyed",
  FAILED: "failed",
} as const;

export type LifecycleScopeState =
  (typeof LifecycleScopeState)[keyof typeof LifecycleScopeState];

/** Options used when creating a lifecycle scope. */
export interface LifecycleScopeOptions {
  readonly name: string;
  readonly parent?: LifecycleScope;
  readonly logger?: Logger;
  readonly continueOnShutdownError?: boolean;
}

/**
 * Represents an independently managed lifecycle boundary.
 * Can represent an Application, Module, Plugin, Worker, Service, or Feature.
 *
 * Children are initialized/started after the parent's own components
 * and stopped/destroyed before them. A destroyed child detaches from
 * its parent so it is never re-destroyed.
 */
export class LifecycleScope {
  private state: LifecycleScopeState = LifecycleScopeState.CREATED;
  private readonly name: string;
  private parent?: LifecycleScope;
  private readonly logger?: Logger;
  private readonly continueOnShutdownError: boolean;
  private readonly registry = new LifecycleRegistry();
  private readonly children: LifecycleScope[] = [];

  public constructor(options: LifecycleScopeOptions) {
    this.name = options.name;
    this.parent = options.parent;
    this.logger = options.logger;
    this.continueOnShutdownError = options.continueOnShutdownError ?? true;
    if (this.parent) this.parent.addChild(this);
  }

  public getName(): string {
    return this.name;
  }
  public getState(): LifecycleScopeState {
    return this.state;
  }
  public getParent(): LifecycleScope | undefined {
    return this.parent;
  }
  public getChildren(): readonly LifecycleScope[] {
    return [...this.children];
  }
  public getRegistrations(): readonly LifecycleRegistration[] {
    return this.registry.getAll();
  }

  public register(
    component: LifecycleComponent,
    name?: string,
  ): LifecycleRegistration {
    if (
      this.state !== LifecycleScopeState.CREATED &&
      this.state !== LifecycleScopeState.INITIALIZED
    ) {
      throw new InvalidStateError(
        `Cannot register component in lifecycle scope "${this.name}" while state is "${this.state}".`,
        { scope: this.name, state: this.state },
      );
    }
    return this.registry.register(component, name);
  }

  public unregister(id: string): boolean {
    return this.registry.unregister(id);
  }

  public async initialize(): Promise<void> {
    if (
      this.state === LifecycleScopeState.INITIALIZED ||
      this.state === LifecycleScopeState.RUNNING
    )
      return;
    if (this.state !== LifecycleScopeState.CREATED)
      throw this.invalidState("initialize");

    this.state = LifecycleScopeState.INITIALIZING;
    this.logger?.debug("Initializing lifecycle scope", { scope: this.name });

    try {
      for (const registration of this.registry.getAll()) {
        const component = registration.component;
        if (
          "onInitialize" in component &&
          typeof component.onInitialize === "function"
        ) {
          await component.onInitialize();
        } else if (
          "initialize" in component &&
          typeof component.initialize === "function"
        ) {
          await component.initialize();
        }
      }
      for (const child of [...this.children]) await child.initialize();
      this.state = LifecycleScopeState.INITIALIZED;
      this.logger?.debug("Lifecycle scope initialized", { scope: this.name });
    } catch (error) {
      this.state = LifecycleScopeState.FAILED;
      this.logger?.error("Lifecycle scope initialization failed", error, {
        scope: this.name,
      });
      throw error;
    }
  }

  public async start(): Promise<void> {
    if (this.state === LifecycleScopeState.RUNNING) return;
    if (this.state === LifecycleScopeState.CREATED) await this.initialize();
    if (this.state !== LifecycleScopeState.INITIALIZED)
      throw this.invalidState("start");

    this.state = LifecycleScopeState.STARTING;
    this.logger?.debug("Starting lifecycle scope", { scope: this.name });

    try {
      for (const registration of this.registry.getAll()) {
        const component = registration.component;
        if ("onStart" in component && typeof component.onStart === "function") {
          await component.onStart();
        } else if (
          "start" in component &&
          typeof component.start === "function"
        ) {
          await component.start();
        }
      }
      for (const child of [...this.children]) await child.start();
      this.state = LifecycleScopeState.RUNNING;
      this.logger?.debug("Lifecycle scope started", { scope: this.name });
    } catch (error) {
      this.state = LifecycleScopeState.FAILED;
      this.logger?.error("Lifecycle scope startup failed", error, {
        scope: this.name,
      });
      throw error;
    }
  }

  /**
   * Stops children (reverse order) and then this scope's components
   * (reverse registration order).
   *
   * A scope that never started transitions straight to STOPPED without
   * running any stop hook. When `continueOnShutdownError` is false the
   * first failure aborts the phase and leaves the scope FAILED.
   */
  public async stop(): Promise<void> {
    switch (this.state) {
      case LifecycleScopeState.STOPPED:
      case LifecycleScopeState.DESTROYED:
        return;
      case LifecycleScopeState.CREATED:
      case LifecycleScopeState.INITIALIZED:
        // Nothing started here; cascade the state to children only.
        for (let i = this.children.length - 1; i >= 0; i--) {
          await this.children[i]!.stop();
        }
        this.state = LifecycleScopeState.STOPPED;
        return;
      case LifecycleScopeState.RUNNING:
      case LifecycleScopeState.FAILED:
        break;
      default:
        throw this.invalidState("stop");
    }

    this.state = LifecycleScopeState.STOPPING;
    const errors: unknown[] = [];
    let aborted = false;
    this.logger?.debug("Stopping lifecycle scope", { scope: this.name });

    for (let i = this.children.length - 1; i >= 0; i--) {
      try {
        await this.children[i]!.stop();
      } catch (error) {
        errors.push(error);
        if (!this.continueOnShutdownError) {
          aborted = true;
          break;
        }
      }
    }

    if (!aborted) {
      for (const registration of this.registry.getReverse()) {
        const component = registration.component;
        try {
          if ("onStop" in component && typeof component.onStop === "function") {
            await component.onStop();
          } else if (
            "stop" in component &&
            typeof component.stop === "function"
          ) {
            await component.stop();
          }
        } catch (error) {
          errors.push(error);
          this.logger?.error("Lifecycle component failed to stop", error, {
            scope: this.name,
            component: registration.name,
          });
          if (!this.continueOnShutdownError) {
            aborted = true;
            break;
          }
        }
      }
    }

    this.state = aborted
      ? LifecycleScopeState.FAILED
      : LifecycleScopeState.STOPPED;

    if (errors.length > 0)
      throw new AggregateError(
        errors,
        `Lifecycle scope "${this.name}" stopped with errors.`,
      );
  }

  /**
   * Destroys children (reverse order) and then this scope's
   * components. Idempotent: a destroyed scope is detached from its
   * parent and never destroyed again.
   */
  public async destroy(): Promise<void> {
    if (this.state === LifecycleScopeState.DESTROYED) return;
    if (
      this.state === LifecycleScopeState.INITIALIZING ||
      this.state === LifecycleScopeState.STARTING ||
      this.state === LifecycleScopeState.STOPPING
    )
      throw this.invalidState("destroy");

    const errors: unknown[] = [];
    let aborted = false;
    this.logger?.debug("Destroying lifecycle scope", { scope: this.name });

    for (let i = this.children.length - 1; i >= 0; i--) {
      try {
        await this.children[i]!.destroy();
      } catch (error) {
        errors.push(error);
        if (!this.continueOnShutdownError) {
          aborted = true;
          break;
        }
      }
    }

    if (!aborted) {
      for (const registration of this.registry.getReverse()) {
        const component = registration.component;
        try {
          if (
            "onDestroy" in component &&
            typeof component.onDestroy === "function"
          ) {
            await component.onDestroy();
          } else if (
            "dispose" in component &&
            typeof component.dispose === "function"
          ) {
            await component.dispose();
          }
        } catch (error) {
          errors.push(error);
          this.logger?.error("Lifecycle component failed to destroy", error, {
            scope: this.name,
            component: registration.name,
          });
          if (!this.continueOnShutdownError) {
            aborted = true;
            break;
          }
        }
      }
    }

    if (aborted) {
      this.state = LifecycleScopeState.FAILED;
    } else {
      this.state = LifecycleScopeState.DESTROYED;
      this.detach();
    }

    if (errors.length > 0)
      throw new AggregateError(
        errors,
        `Lifecycle scope "${this.name}" destroyed with errors.`,
      );
  }

  public async shutdown(): Promise<void> {
    const errors: unknown[] = [];
    try {
      await this.stop();
    } catch (error) {
      errors.push(error);
    }
    try {
      await this.destroy();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length > 0)
      throw new AggregateError(
        errors,
        `Lifecycle scope "${this.name}" shutdown completed with errors.`,
      );
  }

  private addChild(child: LifecycleScope): void {
    if (this.children.includes(child)) return;
    this.children.push(child);
  }

  private removeChild(child: LifecycleScope): void {
    const index = this.children.indexOf(child);
    if (index !== -1) this.children.splice(index, 1);
  }

  private detach(): void {
    this.parent?.removeChild(this);
    this.parent = undefined;
  }

  private invalidState(operation: string): InvalidStateError {
    return new InvalidStateError(
      `Cannot ${operation} lifecycle scope "${this.name}" while state is "${this.state}".`,
      { scope: this.name, operation, state: this.state },
    );
  }
}
