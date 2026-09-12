/**
 * Lifecycle management for resolved container instances.
 *
 * Tracks SINGLETON instances (container-owned) and SCOPED instances
 * (scope-owned) that need cleanup and disposes them when their owner is
 * destroyed, in reverse creation order.
 *
 * TRANSIENT instances are deliberately NOT tracked: the container creates a
 * new transient per resolution, so tracking them per token would either leak
 * (unbounded growth) or silently drop all but the last instance. Callers own
 * the disposal of transient instances they resolve.
 */

import type { Token } from "../containerToken/containerToken.type.js";
import { describeToken } from "../containerToken/containerToken.type.js";
import { ContainerLifecycleError } from "@zudojs/errors";

/**
 * An object disposable via a `dispose()` method (sync or async).
 * Named `DisposableLike` to avoid shadowing the ES2023 `Disposable` built-in.
 */
export interface DisposableLike {
  dispose(): void | Promise<void>;
}

/** An object disposable via the ES2023 `Symbol.dispose` protocol. */
export interface SymbolDisposableLike {
  [Symbol.dispose](): void;
}

/**
 * An object disposable via the ES2023 `Symbol.asyncDispose` protocol.
 * Named `AsyncDisposableLike` to avoid shadowing the `AsyncDisposable`
 * built-in.
 */
export interface AsyncDisposableLike {
  [Symbol.asyncDispose](): Promise<void> | void;
}

/** @deprecated Use {@link DisposableLike} instead. */
export type Disposable = DisposableLike;
/** @deprecated Use {@link AsyncDisposableLike} instead. */
export type AsyncDisposable = AsyncDisposableLike;

export type DisposableInstance =
  DisposableLike | SymbolDisposableLike | AsyncDisposableLike;

export enum ContainerLifecycleOwner {
  CONTAINER = "container",
  SCOPE = "scope",
}

export interface TrackedInstance<T = unknown> {
  readonly token: Token<T>;
  readonly instance: T;
  readonly owner: ContainerLifecycleOwner;
  disposed: boolean;
  readonly trackedAt: Date;
}

export interface ContainerLifecycleOptions {
  readonly failFast?: boolean;
}

export class ContainerDisposalError extends ContainerLifecycleError {
  readonly errors: readonly unknown[];
  readonly tokens: readonly Token<unknown>[];
  constructor(errors: readonly unknown[], tokens: readonly Token<unknown>[]) {
    super(
      "disposal",
      `Failed to dispose ${errors.length} container instance(s): ${tokens.map(describeToken).join(", ")}.`,
    );
    this.errors = errors;
    this.tokens = tokens;
  }
}

export function isDisposable(value: unknown): value is DisposableLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "dispose" in value &&
    typeof (value as { dispose?: unknown }).dispose === "function"
  );
}

export function isSymbolDisposable(
  value: unknown,
): value is SymbolDisposableLike {
  return (
    typeof value === "object" &&
    value !== null &&
    Symbol.dispose in value &&
    typeof (value as SymbolDisposableLike)[Symbol.dispose] === "function"
  );
}

export function isAsyncDisposable(
  value: unknown,
): value is AsyncDisposableLike {
  return (
    typeof value === "object" &&
    value !== null &&
    Symbol.asyncDispose in value &&
    typeof (value as AsyncDisposableLike)[Symbol.asyncDispose] === "function"
  );
}

export function isDisposableInstance(
  value: unknown,
): value is DisposableInstance {
  return (
    isDisposable(value) || isSymbolDisposable(value) || isAsyncDisposable(value)
  );
}

export class ContainerLifecycle {
  private readonly instances = new Map<
    Token<unknown>,
    TrackedInstance<unknown>
  >();
  private readonly options: Required<ContainerLifecycleOptions>;
  private disposed = false;

  constructor(options: ContainerLifecycleOptions = {}) {
    this.options = { failFast: options.failFast ?? false };
  }

  /**
   * Tracks a disposable instance for later cleanup.
   *
   * Re-tracking a token removes the previous entry and re-inserts it at the
   * end of the map, so reverse-creation disposal order stays sound.
   * Non-disposable instances are ignored.
   */
  track<T>(
    token: Token<T>,
    instance: T,
    owner: ContainerLifecycleOwner = ContainerLifecycleOwner.CONTAINER,
  ): void {
    if (this.disposed)
      throw new ContainerLifecycleError(
        "track",
        "Cannot track an instance after the container lifecycle has been disposed.",
      );
    if (!isDisposableInstance(instance)) return;
    this.instances.delete(token);
    this.instances.set(token, {
      token,
      instance,
      owner,
      disposed: false,
      trackedAt: new Date(),
    });
  }

  has<T>(token: Token<T>): boolean {
    return this.instances.has(token);
  }
  get<T>(token: Token<T>): TrackedInstance<T> | undefined {
    return this.instances.get(token) as TrackedInstance<T> | undefined;
  }
  getAll(): readonly TrackedInstance[] {
    return [...this.instances.values()];
  }
  get size(): number {
    return this.instances.size;
  }
  untrack<T>(token: Token<T>): boolean {
    return this.instances.delete(token);
  }

  /**
   * Disposes a single tracked instance and untracks it. Untracking happens
   * even when disposal fails — a failed disposal is terminal for the entry.
   */
  async disposeInstance<T>(token: Token<T>): Promise<void> {
    const tracked = this.instances.get(token);
    if (!tracked || tracked.disposed) return;
    tracked.disposed = true;
    this.instances.delete(token);
    try {
      await disposeValue(tracked.instance);
    } catch (error) {
      if (this.options.failFast) throw error;
      throw new ContainerDisposalError([error], [token]);
    }
  }

  /**
   * Disposes tracked instances in reverse creation order.
   *
   * Entries are untracked even when their disposal fails (terminal). When
   * `owner` is omitted the whole lifecycle is marked disposed — this happens
   * even on failure — and every failure is reported in the thrown
   * ContainerDisposalError.
   */
  async dispose(owner?: ContainerLifecycleOwner): Promise<void> {
    if (this.disposed) return;
    // Mark before the first await: an instance tracked while disposal is in
    // flight would be dropped by `shutdown()` without ever being disposed.
    if (owner === undefined) this.disposed = true;
    const tracked = [...this.instances.values()].reverse();
    const selected = owner
      ? tracked.filter((entry) => entry.owner === owner)
      : tracked;
    const errors: unknown[] = [];
    const failedTokens: Token<unknown>[] = [];
    for (const entry of selected) {
      if (entry.disposed) continue;
      entry.disposed = true;
      this.instances.delete(entry.token);
      try {
        await disposeValue(entry.instance);
      } catch (error) {
        errors.push(error);
        failedTokens.push(entry.token);
        if (this.options.failFast) break;
      }
    }
    if (errors.length > 0)
      throw new ContainerDisposalError(errors, failedTokens);
  }

  async disposeScope(): Promise<void> {
    await this.dispose(ContainerLifecycleOwner.SCOPE);
  }
  async disposeContainer(): Promise<void> {
    await this.dispose(ContainerLifecycleOwner.CONTAINER);
  }

  /**
   * Releases all tracked references WITHOUT disposing them and marks the
   * lifecycle disposed so further `track()` calls are refused. Used when a
   * container is disposed with `autoDispose: false`.
   */
  shutdown(): void {
    this.instances.clear();
    this.disposed = true;
  }

  isDisposed(): boolean {
    return this.disposed;
  }
  getTrackedTokens(): readonly Token<unknown>[] {
    return [...this.instances.keys()];
  }
}

async function disposeValue(value: unknown): Promise<void> {
  if (isAsyncDisposable(value)) {
    await value[Symbol.asyncDispose]();
    return;
  }
  if (isSymbolDisposable(value)) {
    value[Symbol.dispose]();
    return;
  }
  if (isDisposable(value)) {
    await value.dispose();
    return;
  }
}

export function createContainerLifecycle(
  options: ContainerLifecycleOptions = {},
): ContainerLifecycle {
  return new ContainerLifecycle(options);
}
