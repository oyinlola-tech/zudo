import type { LifecycleHook } from "./lifecycleHook.hook.js";
import type { LifecycleParticipant } from "./lifecycle.js";
import { InvalidArgumentError } from "../../errors/exceptions.js";

/**
 * Any component that can participate in the application lifecycle.
 */
export type LifecycleComponent = LifecycleParticipant | LifecycleHook;

/**
 * Internal lifecycle registration.
 *
 * The registry stores components in a normalized representation
 * so the lifecycle manager does not need to care whether a
 * component uses the full participant API or individual hooks.
 */
export interface LifecycleRegistration {
  /**
   * Unique registration identifier.
   */
  readonly id: string;

  /**
   * Human-readable component name.
   */
  readonly name: string;

  /**
   * Original registered component.
   */
  readonly component: LifecycleComponent;

  /**
   * Registration order.
   *
   * Lower numbers are initialized first and stopped last.
   */
  readonly order: number;

  /**
   * Whether the component exposes the full lifecycle participant API.
   */
  readonly isParticipant: boolean;
}

/**
 * Registry responsible for lifecycle component registration
 * and deterministic ordering.
 */
export class LifecycleRegistry {
  private readonly registrations: LifecycleRegistration[] = [];

  private sequence = 0;

  /**
   * Registers a lifecycle component.
   *
   * Components are executed in registration order during
   * initialization and startup.
   *
   * Components are executed in reverse registration order
   * during stopping and destruction.
   *
   * Names are unique within a registry: an explicit duplicate name is
   * rejected, while derived names (constructor names) are made unique
   * with a numeric suffix so getByName() is unambiguous.
   */
  public register(
    component: LifecycleComponent,
    name?: string,
  ): LifecycleRegistration {
    if (name !== undefined && this.getByName(name)) {
      throw new InvalidArgumentError(
        `A lifecycle component named "${name}" is already registered.`,
        { name },
      );
    }

    const registration: LifecycleRegistration = {
      id: this.createId(),
      name: name ?? this.uniqueName(this.resolveComponentName(component)),
      component,
      order: this.sequence,
      isParticipant: this.isLifecycleParticipant(component),
    };

    this.sequence += 1;

    this.registrations.push(registration);

    return registration;
  }

  /**
   * Unregisters a component by registration ID.
   */
  public unregister(id: string): boolean {
    const index = this.registrations.findIndex(
      (registration) => registration.id === id,
    );

    if (index === -1) {
      return false;
    }

    this.registrations.splice(index, 1);

    return true;
  }

  /**
   * Returns all registrations in initialization/startup order.
   */
  public getAll(): readonly LifecycleRegistration[] {
    return [...this.registrations].sort((a, b) => a.order - b.order);
  }

  /**
   * Returns all registrations in shutdown/destruction order.
   */
  public getReverse(): readonly LifecycleRegistration[] {
    return [...this.registrations].sort((a, b) => b.order - a.order);
  }

  /**
   * Finds a registration by ID.
   */
  public getById(id: string): LifecycleRegistration | undefined {
    return this.registrations.find((registration) => registration.id === id);
  }

  /**
   * Finds a registration by component name.
   */
  public getByName(name: string): LifecycleRegistration | undefined {
    return this.registrations.find(
      (registration) => registration.name === name,
    );
  }

  /**
   * Checks whether a component is registered.
   */
  public has(component: LifecycleComponent): boolean {
    return this.registrations.some(
      (registration) => registration.component === component,
    );
  }

  /**
   * Returns the number of registered components.
   */
  public size(): number {
    return this.registrations.length;
  }

  /**
   * Removes all registrations.
   */
  public clear(): void {
    this.registrations.length = 0;
  }

  /**
   * Suffixes a derived name until it is unique within the registry.
   */
  private uniqueName(base: string): string {
    if (!this.getByName(base)) return base;

    let index = 2;
    while (this.getByName(`${base}#${index}`)) index += 1;
    return `${base}#${index}`;
  }

  /**
   * Creates a stable registration ID.
   */
  private createId(): string {
    return `lifecycle:${this.sequence}`;
  }

  /**
   * Determines whether a component is a full
   * LifecycleParticipant.
   */
  private isLifecycleParticipant(
    component: LifecycleComponent,
  ): component is LifecycleParticipant {
    return (
      typeof component === "object" &&
      component !== null &&
      "name" in component &&
      typeof component.name === "string"
    );
  }

  /**
   * Resolves a readable component name.
   */
  private resolveComponentName(component: LifecycleComponent): string {
    if (this.isLifecycleParticipant(component)) {
      return component.name;
    }

    if (
      typeof component === "object" &&
      component !== null &&
      "constructor" in component &&
      typeof component.constructor === "function" &&
      component.constructor.name
    ) {
      return component.constructor.name;
    }

    return "anonymous";
  }
}
