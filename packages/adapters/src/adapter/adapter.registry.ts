/**
 * @zudojs/adapters/adapter
 *
 * Adapter registry — manages adapter registration and lookup.
 *
 * Adapter names are case-insensitive: they are trimmed and lowercased on
 * registration and lookup, and `getNames()` reports them in that normalized
 * form. The adapter object itself is stored untouched, so `getAll()` still
 * reports whatever `adapter.name` it was built with.
 *
 * Note that `remove()` and `clear()` only drop references — use
 * `removeAndDispose()` / `disposeAll()` to also release adapter resources.
 */

import type { Adapter } from "./adapter.type.js";
import type { AdapterCapabilities } from "../capabilities/capabilities.type.js";
import {
  AdapterAlreadyRegisteredError,
  AdapterCapabilityMissingError,
  AdapterConfigurationError,
  AdapterNotFoundError,
} from "@zudojs/errors";

/** A capability an adapter can declare. */
export type AdapterCapabilityName = keyof AdapterCapabilities;

/**
 * Registry for Zudojs adapters.
 *
 * Ensures adapters are uniquely registered and provides lookup by name.
 */
export class AdapterRegistry {
  private readonly adapters = new Map<string, Adapter>();

  /**
   * Registers an adapter.
   *
   * @throws {AdapterConfigurationError} If the adapter name is blank. A name
   * that normalizes to the empty string is unaddressable — `get("")` is the
   * only way back to it, and every other blank name collides with it.
   * @throws {AdapterAlreadyRegisteredError} If an adapter with the same name is already registered.
   */
  register(adapter: Adapter): void {
    const name = this.normalizeName(adapter.name);

    if (name === "") {
      throw new AdapterConfigurationError(
        String(adapter.name),
        new Error("Adapter name cannot be blank."),
      );
    }

    if (this.adapters.has(name)) {
      throw new AdapterAlreadyRegisteredError(name);
    }

    this.adapters.set(name, adapter);
  }

  /**
   * Returns an adapter by name.
   */
  get<T extends Adapter>(name: string): T | undefined {
    return this.adapters.get(this.normalizeName(name)) as T | undefined;
  }

  /**
   * Returns an adapter by name or throws.
   *
   * @throws {AdapterNotFoundError} If no adapter with the name is registered.
   */
  require<T extends Adapter>(name: string): T {
    const adapter = this.get<T>(name);
    if (adapter === undefined) {
      throw new AdapterNotFoundError(this.normalizeName(name));
    }
    return adapter;
  }

  /**
   * Returns whether an adapter is registered.
   */
  has(name: string): boolean {
    return this.adapters.has(this.normalizeName(name));
  }

  /**
   * Removes an adapter by name without disposing it.
   *
   * The caller keeps responsibility for the adapter's resources —
   * use {@link removeAndDispose} to also stop and dispose it.
   *
   * @returns True if the adapter was removed, false if it was not registered.
   */
  remove(name: string): boolean {
    return this.adapters.delete(this.normalizeName(name));
  }

  /**
   * Removes an adapter by name and releases its resources
   * (calls `stop()` then `dispose()` when defined).
   *
   * @returns True if the adapter was removed, false if it was not registered.
   */
  async removeAndDispose(name: string): Promise<boolean> {
    const key = this.normalizeName(name);
    const adapter = this.adapters.get(key);
    if (adapter === undefined) {
      return false;
    }
    this.adapters.delete(key);
    await this.teardown(adapter);
    return true;
  }

  /**
   * Returns all registered adapters.
   */
  getAll(): readonly Adapter[] {
    return Object.freeze([...this.adapters.values()]);
  }

  /**
   * Returns all registered adapter names (normalized: trimmed, lowercase).
   */
  getNames(): readonly string[] {
    return Object.freeze([...this.adapters.keys()]);
  }

  /**
   * Returns every adapter that declares the given capability.
   *
   * Capabilities exist so runtime code can pick an adapter that can actually
   * do the job; without a way to ask, every declaration was inert.
   */
  findByCapability(capability: AdapterCapabilityName): readonly Adapter[] {
    return Object.freeze(
      [...this.adapters.values()].filter(
        (adapter) => adapter.capabilities[capability] === true,
      ),
    );
  }

  /**
   * Returns whether a registered adapter declares a capability.
   *
   * A missing adapter reports `false` rather than throwing — use
   * {@link requireCapability} when the absence should stop the caller.
   */
  supports(name: string, capability: AdapterCapabilityName): boolean {
    return this.get(name)?.capabilities[capability] === true;
  }

  /**
   * Returns an adapter that declares the given capability, or throws.
   *
   * @throws {AdapterNotFoundError} If no adapter with the name is registered.
   * @throws {AdapterCapabilityMissingError} If the adapter does not declare
   * the capability.
   */
  requireCapability<T extends Adapter>(
    name: string,
    capability: AdapterCapabilityName,
  ): T {
    const adapter = this.require<T>(name);
    if (adapter.capabilities[capability] !== true) {
      throw new AdapterCapabilityMissingError(
        this.normalizeName(name),
        capability,
      );
    }
    return adapter;
  }

  /**
   * Initializes every registered adapter, in registration order.
   *
   * The counterpart to {@link disposeAll}: `initialize()` and `start()` were
   * part of the adapter contract with nothing in the package that ever called
   * them, so an adapter could only be torn down, never brought up.
   *
   * @throws {AggregateError} After attempting all adapters, if any failed.
   */
  async initializeAll(): Promise<void> {
    await this.forEachAdapter(
      (adapter) => adapter.initialize?.(),
      "One or more adapters failed to initialize.",
    );
  }

  /**
   * Starts every registered adapter, in registration order.
   *
   * @throws {AggregateError} After attempting all adapters, if any failed.
   */
  async startAll(): Promise<void> {
    await this.forEachAdapter(
      (adapter) => adapter.start?.(),
      "One or more adapters failed to start.",
    );
  }

  /**
   * Stops every registered adapter without disposing or unregistering them.
   *
   * @throws {AggregateError} After attempting all adapters, if any failed.
   */
  async stopAll(): Promise<void> {
    await this.forEachAdapter(
      (adapter) => adapter.stop?.(),
      "One or more adapters failed to stop.",
    );
  }

  /**
   * Returns the number of registered adapters.
   */
  get size(): number {
    return this.adapters.size;
  }

  /**
   * Clears all registered adapters without disposing them.
   *
   * Use {@link disposeAll} to also release adapter resources.
   */
  clear(): void {
    this.adapters.clear();
  }

  /**
   * Clears the registry and releases every adapter's resources
   * (calls `stop()` then `dispose()` when defined, best-effort).
   *
   * @throws {AggregateError} After attempting all adapters, if any failed.
   */
  async disposeAll(): Promise<void> {
    const adapters = [...this.adapters.values()];
    this.adapters.clear();

    const failures: unknown[] = [];
    for (const adapter of adapters) {
      try {
        await this.teardown(adapter);
      } catch (error) {
        failures.push(error);
      }
    }

    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        "One or more adapters failed to dispose.",
      );
    }
  }

  /**
   * Stops, then disposes, one adapter.
   *
   * `dispose()` runs even when `stop()` throws: the adapter has already
   * left the registry by the time this is called, so skipping disposal
   * would orphan its connections and timers with nothing left holding a
   * reference to release them. A `stop()` failure is still reported — on
   * its own when disposal succeeds, alongside the disposal error when
   * both fail.
   */
  private async teardown(adapter: Adapter): Promise<void> {
    let stopError: unknown;
    let stopFailed = false;
    try {
      await adapter.stop?.();
    } catch (error) {
      stopFailed = true;
      stopError = error;
    }

    try {
      await adapter.dispose?.();
    } catch (error) {
      if (stopFailed) {
        throw new AggregateError(
          [stopError, error],
          `Adapter "${adapter.name}" failed to stop and to dispose.`,
        );
      }
      throw error;
    }

    if (stopFailed) throw stopError;
  }

  /**
   * Runs an operation against every adapter, collecting failures rather than
   * stopping at the first one — a half-applied lifecycle transition leaves
   * resources in a state nobody tracked.
   */
  private async forEachAdapter(
    operation: (adapter: Adapter) => Promise<void> | void,
    message: string,
  ): Promise<void> {
    const failures: unknown[] = [];
    for (const adapter of [...this.adapters.values()]) {
      try {
        await operation(adapter);
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, message);
    }
  }

  private normalizeName(name: string): string {
    return name.trim().toLowerCase();
  }
}
