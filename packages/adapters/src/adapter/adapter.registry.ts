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
import type { KnownAdapterCapabilities } from "../capabilities/capabilities.type.js";
import {
  AdapterAlreadyRegisteredError,
  AdapterCapabilityMissingError,
  AdapterConfigurationError,
  AdapterNotFoundError,
} from "@zudojs/errors";

import { collectAdapterHealth, configureAdapter } from "./adapter.health.js";
import type { AdapterHealthReport } from "./adapter.health.js";
import {
  runAdapterLifecycleAll,
  teardownAdapter,
} from "./adapterLifecycle/index.js";
import type { AdapterOperationOptions } from "../lifecycle/lifecycle.type.js";

/**
 * A capability an adapter can declare: one of the well-known names, with
 * completion, or any other string (a business capability such as
 * `"refunds"`).
 */
export type AdapterCapabilityName =
  | (keyof KnownAdapterCapabilities & string)
  | (string & {});

/** Names that are unsafe as a plain-object key, so no adapter may claim them. */
const RESERVED_NAMES: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

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
   * @throws {AdapterConfigurationError} If the adapter name is a prototype
   * member (`__proto__`, `constructor`, `prototype`). Those names survive the
   * registry's `Map`, but any consumer keying a plain object by adapter name
   * loses or corrupts the entry, so they are refused at the door.
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

    if (RESERVED_NAMES.has(name)) {
      throw new AdapterConfigurationError(
        String(adapter.name),
        new Error(`Adapter name "${name}" is reserved.`),
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
    await teardownAdapter(adapter);
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
   * `options.timeout` bounds each adapter's hook, `options.retry` re-runs a
   * failed one and `options.signal` stops the whole pass, as for
   * {@link healthAll}.
   *
   * @throws {AggregateError} After attempting all adapters, if any failed.
   * Each entry is an `AdapterInitializationError` (or `AdapterTimeoutError`)
   * naming its adapter, with the hook's own error as `cause`.
   */
  async initializeAll(options: AdapterOperationOptions = {}): Promise<void> {
    await runAdapterLifecycleAll(
      [...this.adapters.values()],
      "initialize",
      options,
      "One or more adapters failed to initialize.",
    );
  }

  /**
   * Starts every registered adapter, in registration order.
   *
   * @throws {AggregateError} After attempting all adapters, if any failed.
   * Each entry is an `AdapterOperationError` (or `AdapterTimeoutError`)
   * naming its adapter, with the hook's own error as `cause`.
   */
  async startAll(options: AdapterOperationOptions = {}): Promise<void> {
    await runAdapterLifecycleAll(
      [...this.adapters.values()],
      "start",
      options,
      "One or more adapters failed to start.",
    );
  }

  /**
   * Stops every registered adapter without disposing or unregistering them,
   * in reverse registration order — the mirror of {@link startAll}, so an
   * adapter is stopped before anything registered ahead of it that it may
   * depend on.
   *
   * @throws {AggregateError} After attempting all adapters, if any failed.
   * Each entry is an `AdapterOperationError` (or `AdapterTimeoutError`)
   * naming its adapter, with the hook's own error as `cause`.
   */
  async stopAll(options: AdapterOperationOptions = {}): Promise<void> {
    await runAdapterLifecycleAll(
      [...this.adapters.values()].reverse(),
      "stop",
      options,
      "One or more adapters failed to stop.",
    );
  }

  /**
   * Checks the health of every adapter that implements `health()`. Failures,
   * timeouts (`options.timeout`) and aborts (`options.signal`) are reported
   * as `"unhealthy"` entries rather than thrown.
   */
  async healthAll(
    options?: AdapterOperationOptions,
  ): Promise<AdapterHealthReport> {
    return collectAdapterHealth([...this.adapters.entries()], options);
  }

  /**
   * Passes options to one adapter's `configure()` hook.
   *
   * @throws {AdapterNotFoundError} If no adapter with the name is registered.
   * @throws {AdapterConfigurationError} If the adapter has no `configure()`.
   */
  async configure(name: string, options: unknown): Promise<void> {
    await configureAdapter(
      this.normalizeName(name),
      this.require(name),
      options,
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
   * Clears the registry and releases every adapter's resources (calls
   * `stop()` then `dispose()` when defined, best-effort), in reverse
   * registration order like {@link stopAll}.
   *
   * @throws {AggregateError} After attempting all adapters, if any failed.
   * Each entry is what {@link removeAndDispose} would have thrown for that
   * adapter: the hook's own error, or an `AggregateError` of both when its
   * `stop()` and `dispose()` both failed.
   */
  async disposeAll(): Promise<void> {
    const adapters = [...this.adapters.values()].reverse();
    this.adapters.clear();

    const failures: unknown[] = [];
    for (const adapter of adapters) {
      try {
        await teardownAdapter(adapter);
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

  private normalizeName(name: string): string {
    return name.trim().toLowerCase();
  }
}
