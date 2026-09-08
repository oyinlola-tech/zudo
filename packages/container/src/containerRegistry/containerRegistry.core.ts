/**
 * Container registration registry.
 *
 * The registry stores normalized registrations and emits change events
 * (REGISTER / REPLACE / REMOVE / CLEAR / RESTORE) so collaborators — notably
 * the resolver's singleton cache — can react to mutations.
 */

import type { ContainerProvider } from "../containerProvider/containerProvider.core.js";

import type {
  ContainerRegistration,
  CreateRegistrationOptions,
  RegistrationToken,
} from "../containerRegistration/containerRegistration.core.js";

import {
  assertValidProvider,
  assertValidRegistrationToken,
  defineRegistration,
  getRegistrationToken,
} from "../containerRegistration/containerRegistration.core.js";

import type { Token } from "../containerToken/containerToken.type.js";

import {
  describeToken,
  unwrapToken,
} from "../containerToken/containerToken.type.js";

import type {
  ContainerRegistryOptions,
  RegistryChangeEvent,
  RegistryListener,
} from "./containerRegistry.type.js";

import { RegistryOperation } from "./containerRegistry.type.js";

import {
  DuplicateRegistrationError,
  RegistrationNotFoundError,
} from "@zudojs/errors";

/** Token used for registry-wide events (CLEAR / RESTORE). */
const REGISTRY_EVENT_TOKEN = Symbol.for("zudojs:container:registry");

export class ContainerRegistry {
  private readonly registrations = new Map<
    Token<unknown>,
    ContainerRegistration<unknown>
  >();
  private readonly listeners = new Set<RegistryListener>();
  private readonly allowDuplicates: boolean;

  constructor(options: ContainerRegistryOptions = {}) {
    this.allowDuplicates = options.allowDuplicates ?? false;
  }

  register<T>(
    token: RegistrationToken<T>,
    provider: ContainerProvider<T>,
    options: CreateRegistrationOptions = {},
  ): ContainerRegistration<T> {
    const t = unwrapToken(token);
    if (this.registrations.has(t) && !this.allowDuplicates)
      throw new DuplicateRegistrationError(describeToken(t));
    const prev = this.registrations.get(t);
    const reg = defineRegistration(t, provider, options);
    this.registrations.set(t, reg as ContainerRegistration<unknown>);
    this.emit({
      operation: prev ? RegistryOperation.REPLACE : RegistryOperation.REGISTER,
      token: t,
      registration: reg,
      previous: prev,
      timestamp: new Date(),
    });
    return reg;
  }

  replace<T>(
    token: RegistrationToken<T>,
    provider: ContainerProvider<T>,
    options: CreateRegistrationOptions = {},
  ): ContainerRegistration<T> {
    const t = unwrapToken(token);
    if (!this.registrations.has(t))
      throw new RegistrationNotFoundError(describeToken(t));
    const prev = this.registrations.get(t);
    const reg = defineRegistration(t, provider, options);
    this.registrations.set(t, reg as ContainerRegistration<unknown>);
    this.emit({
      operation: RegistryOperation.REPLACE,
      token: t,
      registration: reg,
      previous: prev,
      timestamp: new Date(),
    });
    return reg;
  }

  get<T>(token: RegistrationToken<T>): ContainerRegistration<T> | undefined {
    return this.registrations.get(unwrapToken(token)) as
      ContainerRegistration<T> | undefined;
  }

  has<T>(token: RegistrationToken<T>): boolean {
    return this.registrations.has(unwrapToken(token));
  }

  remove<T>(token: RegistrationToken<T>): boolean {
    const t = unwrapToken(token);
    const prev = this.registrations.get(t);
    if (!prev) return false;
    const removed = this.registrations.delete(t);
    if (removed)
      this.emit({
        operation: RegistryOperation.REMOVE,
        token: t,
        previous: prev,
        timestamp: new Date(),
      });
    return removed;
  }

  get size(): number {
    return this.registrations.size;
  }

  getAll(): readonly ContainerRegistration[] {
    return [...this.registrations.values()];
  }

  getTokens(): readonly Token<unknown>[] {
    return [...this.registrations.keys()];
  }

  clear(): void {
    if (this.registrations.size === 0) return;
    this.registrations.clear();
    this.emit({
      operation: RegistryOperation.CLEAR,
      token: REGISTRY_EVENT_TOKEN,
      timestamp: new Date(),
    });
  }

  subscribe(listener: RegistryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  clearListeners(): void {
    this.listeners.clear();
  }

  /**
   * Notifies all listeners. Listener errors are collected and rethrown as a
   * single AggregateError after every listener has been notified — they are
   * never silently swallowed.
   */
  private emit(event: RegistryChangeEvent): void {
    const errors: unknown[] = [];
    for (const l of this.listeners) {
      try {
        l(event);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0)
      throw new AggregateError(
        errors,
        `${errors.length} container registry listener(s) failed while handling "${event.operation}".`,
      );
  }

  /**
   * Returns an immutable snapshot of the current registrations.
   * Pass the result to {@link restore} to roll the registry back.
   */
  snapshot(): readonly ContainerRegistration[] {
    return this.getAll();
  }

  /**
   * Wholesale replacement of the registry's contents.
   *
   * Every existing registration is discarded and replaced by `regs` (entries
   * are validated first; duplicate tokens in `regs` throw unless
   * `allowDuplicates` is enabled, in which case the last entry wins).
   * Emits a single RESTORE event so caches keyed on the old registrations
   * can be evicted.
   */
  restore(regs: readonly ContainerRegistration[]): void {
    const next = new Map<Token<unknown>, ContainerRegistration<unknown>>();
    for (const r of regs) {
      assertValidRegistrationToken(r.token);
      assertValidProvider(r.provider);
      const t = getRegistrationToken(r);
      if (next.has(t) && !this.allowDuplicates)
        throw new DuplicateRegistrationError(describeToken(t));
      next.set(t, r as ContainerRegistration<unknown>);
    }
    this.registrations.clear();
    for (const [t, r] of next) this.registrations.set(t, r);
    this.emit({
      operation: RegistryOperation.RESTORE,
      token: REGISTRY_EVENT_TOKEN,
      timestamp: new Date(),
    });
  }
}
