/**
 * Package manager registry.
 *
 * @module registries/adapter/packageManager
 */

import { CLIValidationError } from "../../errors/index.js";
import type { PackageManager } from "../../adapters/package-managers/packageManager.type.js";
import { PnpmAdapter } from "../../adapters/package-managers/pnpm.adapter.js";
import { NpmAdapter } from "../../adapters/package-managers/npm.adapter.js";
import { YarnAdapter } from "../../adapters/package-managers/yarn.adapter.js";
import { BunAdapter } from "../../adapters/package-managers/bun.adapter.js";

/**
 * Registry for package manager adapters.
 */
export class PackageManagerRegistry {
  private readonly adapters = new Map<string, PackageManager>();

  constructor() {
    this.register(new PnpmAdapter());
    this.register(new NpmAdapter());
    this.register(new YarnAdapter());
    this.register(new BunAdapter());
  }

  /**
   * Registers a new package manager adapter.
   *
   * Registering the same name twice used to overwrite the first adapter
   * without a word; {@link replace} is the explicit way to do that.
   */
  register(adapter: PackageManager): void {
    if (this.adapters.has(adapter.name)) {
      throw new CLIValidationError(
        `A package manager adapter named "${adapter.name}" is already registered. Use replace() to override it.`,
      );
    }
    this.adapters.set(adapter.name, adapter);
  }

  /** Registers an adapter, replacing any adapter of the same name. */
  replace(adapter: PackageManager): void {
    this.adapters.set(adapter.name, adapter);
  }

  /**
   * Gets an adapter by name.
   */
  get(name: string): PackageManager | undefined {
    return this.adapters.get(name);
  }

  /**
   * Gets all registered adapter names.
   */
  getNames(): readonly string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Detects the installed package manager.
   */
  async detect(): Promise<PackageManager | undefined> {
    for (const adapter of this.adapters.values()) {
      if (await adapter.isInstalled()) {
        return adapter;
      }
    }
    return undefined;
  }
}
