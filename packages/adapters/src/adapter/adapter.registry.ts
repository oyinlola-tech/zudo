/**
 * @zudojs/adapters/adapter
 *
 * Adapter registry — manages adapter registration and lookup.
 *
 * Adapter names are case-insensitive: they are trimmed and lowercased on
 * registration and lookup, and stored (and reported) in that normalized
 * form. Note that `remove()` and `clear()` only drop references — use
 * `removeAndDispose()` / `disposeAll()` to also release adapter resources.
 */

import type { Adapter } from "./adapter.type.js";
import {
  AdapterAlreadyRegisteredError,
  AdapterNotFoundError,
} from "@zudojs/errors";

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
   * @throws {AdapterAlreadyRegisteredError} If an adapter with the same name is already registered.
   */
  register(adapter: Adapter): void {
    const name = this.normalizeName(adapter.name);

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
    await adapter.stop?.();
    await adapter.dispose?.();
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
        await adapter.stop?.();
        await adapter.dispose?.();
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
