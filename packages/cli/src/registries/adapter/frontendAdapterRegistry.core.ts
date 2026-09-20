/**
 * Frontend adapter registry.
 *
 * @module registries/adapter
 */

import { CLIValidationError } from "../../errors/index.js";
import type { FrontendAdapter } from "../../adapters/frontend/frontendAdapter.type.js";
import { ReactAdapter } from "../../adapters/frontend/react.adapter.js";
import { NextAdapter } from "../../adapters/frontend/next.adapter.js";
import { VueAdapter } from "../../adapters/frontend/vue.adapter.js";
import { NuxtAdapter } from "../../adapters/frontend/nuxt.adapter.js";
import { AngularAdapter } from "../../adapters/frontend/angular.adapter.js";
import { SvelteAdapter } from "../../adapters/frontend/svelte.adapter.js";
import { SvelteKitAdapter } from "../../adapters/frontend/sveltekit.adapter.js";
import { AstroAdapter } from "../../adapters/frontend/astro.adapter.js";
import { VanillaAdapter } from "../../adapters/frontend/vanilla.adapter.js";
import { FlutterAdapter } from "../../adapters/frontend/flutter.adapter.js";
import { ReactNativeAdapter } from "../../adapters/frontend/react-native.adapter.js";

/**
 * Registry for frontend adapters.
 */
export class FrontendAdapterRegistry {
  private readonly adapters = new Map<string, FrontendAdapter>();

  constructor() {
    this.register(new ReactAdapter());
    this.register(new NextAdapter());
    this.register(new VueAdapter());
    this.register(new NuxtAdapter());
    this.register(new AngularAdapter());
    this.register(new SvelteAdapter());
    this.register(new SvelteKitAdapter());
    this.register(new AstroAdapter());
    this.register(new VanillaAdapter());
    this.register(new FlutterAdapter());
    this.register(new ReactNativeAdapter());
  }

  /**
   * Registers a new frontend adapter.
   *
   * A duplicate name used to overwrite the adapter already registered,
   * silently, so the winner depended on registration order. Use
   * {@link replace} to do that on purpose.
   */
  register(adapter: FrontendAdapter): void {
    if (this.adapters.has(adapter.name)) {
      throw new CLIValidationError(
        `A frontend adapter named "${adapter.name}" is already registered. Use replace() to override it.`,
      );
    }
    this.adapters.set(adapter.name, adapter);
  }

  /** Registers an adapter, replacing any adapter of the same name. */
  replace(adapter: FrontendAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  /**
   * Gets an adapter by name.
   */
  get(name: string): FrontendAdapter | undefined {
    return this.adapters.get(name);
  }

  /**
   * Gets all registered adapter names.
   */
  getNames(): readonly string[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Gets all registered adapters.
   */
  getAll(): readonly FrontendAdapter[] {
    return Array.from(this.adapters.values());
  }
}
