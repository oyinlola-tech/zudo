import { AsyncLocalStorage } from "node:async_hooks";

import type { ExecutionContext } from "../core/executionContext.context.js";
import { deriveExecutionContext } from "../core/executionContext.context.js";
import { ContextValues } from "../values/contextValues.values.js";
import { createContextValues } from "../values/contextValues.values.js";
import type { ContextSnapshot } from "../snapshot/contextSnapshot.snapshot.js";
import { createContextSnapshot } from "../snapshot/contextSnapshot.snapshot.js";
import { ExecutionContextNotFoundError } from "../../errors/exceptions.js";

/**
 * Overrides accepted when deriving an execution context from
 * the current one.
 */
export type ExecutionContextOverrides = Partial<
  Omit<ExecutionContext, "executionId" | "startedAt" | "metadata">
> & {
  readonly executionId?: string;
  readonly startedAt?: Date;
  readonly metadata?: Record<string, unknown>;
};

/**
 * Stores the current ExecutionContext across asynchronous
 * boundaries.
 *
 * This allows framework components to access the current
 * execution without explicitly passing the context through
 * every function call.
 *
 * Alongside the ExecutionContext, an optional ContextValues
 * collection can travel with the execution, connecting typed
 * context values to the async storage.
 */
export class ContextStorage {
  private readonly storage = new AsyncLocalStorage<ExecutionContext>();

  private readonly valuesStorage = new AsyncLocalStorage<ContextValues>();

  /**
   * Runs a function inside an execution context.
   *
   * The context is automatically available to all asynchronous
   * operations created within the callback.
   */
  public run<T>(context: ExecutionContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  /**
   * Returns the current execution context.
   *
   * Returns undefined when called outside a managed execution.
   */
  public get(): ExecutionContext | undefined {
    return this.storage.getStore();
  }

  /**
   * Returns the current execution context.
   *
   * Throws when no execution context is available.
   */
  public require(): ExecutionContext {
    const context = this.get();

    if (!context) {
      throw new ExecutionContextNotFoundError();
    }

    return context;
  }

  /**
   * Checks whether an execution context is currently available.
   */
  public has(): boolean {
    return this.get() !== undefined;
  }

  /**
   * Executes a callback within a context derived from the
   * current one.
   *
   * The current context is read from storage and combined with
   * the supplied overrides via deriveExecutionContext, so
   * correlation and tracing information propagates into the
   * derived scope. Throws when no context is active.
   */
  public runDerived<T>(
    overrides: ExecutionContextOverrides,
    callback: () => T,
  ): T {
    const current = this.require();
    const derived = deriveExecutionContext(current, overrides);
    return this.storage.run(derived, callback);
  }

  /**
   * Clears the current execution context by executing the
   * callback outside the current storage context.
   */
  public runWithoutContext<T>(callback: () => T): T {
    return this.storage.exit(() => this.valuesStorage.exit(callback));
  }

  /**
   * Runs a callback with both an execution context and a typed
   * ContextValues collection bound to the async scope.
   */
  public runWithValues<T>(
    context: ExecutionContext,
    values: ContextValues,
    callback: () => T,
  ): T {
    return this.storage.run(context, () =>
      this.valuesStorage.run(values, callback),
    );
  }

  /**
   * Returns the ContextValues bound to the current async scope,
   * when one was provided via runWithValues or runSnapshot.
   */
  public getValues(): ContextValues | undefined {
    return this.valuesStorage.getStore();
  }

  /**
   * Captures the current execution context and its values as an
   * immutable snapshot for later restoration (for example, when
   * scheduling background work).
   *
   * Throws when no execution context is active.
   */
  public capture(): ContextSnapshot {
    return createContextSnapshot(
      this.require(),
      this.getValues() ?? createContextValues(),
    );
  }

  /**
   * Runs a callback inside the execution context and values of
   * a previously captured snapshot.
   */
  public runSnapshot<T>(snapshot: ContextSnapshot, callback: () => T): T {
    return this.runWithValues(snapshot.context, snapshot.values, callback);
  }
}

/**
 * Creates a ContextStorage instance.
 */
export function createContextStorage(): ContextStorage {
  return new ContextStorage();
}
