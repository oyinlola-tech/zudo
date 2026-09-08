import type { ExecutionContext } from "../core/executionContext.context.js";
import type { ContextStorage } from "./contextStorage.storage.js";
import { getDefaultContextStorage } from "./defaultContextStorage.storage.js";

/**
 * Provides access to the current execution context.
 *
 * ContextProvider intentionally hides the underlying storage
 * mechanism from the rest of the framework.
 */
export interface ContextProvider {
  /**
   * Returns the current execution context.
   *
   * Returns undefined when no context is active.
   */
  get(): ExecutionContext | undefined;

  /**
   * Returns the current execution context.
   *
   * Throws when no context is active.
   */
  require(): ExecutionContext;

  /**
   * Determines whether an execution context is active.
   */
  has(): boolean;

  /**
   * Executes a callback within the supplied context.
   */
  run<T>(context: ExecutionContext, callback: () => T): T;
}

/**
 * Default ContextProvider implementation.
 *
 * Uses ContextStorage internally while keeping that
 * implementation detail hidden behind the provider contract. When
 * no storage is supplied the process-wide default storage is used,
 * so the provider observes the same context the runtime establishes.
 */
export class DefaultContextProvider implements ContextProvider {
  private readonly storage: ContextStorage;

  public constructor(storage: ContextStorage = getDefaultContextStorage()) {
    this.storage = storage;
  }

  /**
   * Returns the current execution context.
   */
  public get(): ExecutionContext | undefined {
    return this.storage.get();
  }

  /**
   * Returns the current execution context or throws.
   */
  public require(): ExecutionContext {
    return this.storage.require();
  }

  /**
   * Checks whether a context is active.
   */
  public has(): boolean {
    return this.storage.has();
  }

  /**
   * Runs a callback within an execution context.
   */
  public run<T>(context: ExecutionContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }
}

/**
 * Creates the default framework context provider, optionally bound
 * to a specific ContextStorage.
 */
export function createContextProvider(
  storage?: ContextStorage,
): ContextProvider {
  return new DefaultContextProvider(storage);
}
