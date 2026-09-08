/**
 * Spy utilities.
 *
 * Wraps existing functions to record calls while preserving behavior.
 */

/**
 * A spy that wraps an existing function.
 */
export interface SpyFn<
  TArgs extends readonly unknown[] = unknown[],
  TResult = unknown,
> {
  (...args: TArgs): TResult;
  readonly original: (...args: TArgs) => TResult;
  readonly calls: readonly TArgs[];
  readonly results: readonly TResult[];
  /** Errors thrown by the wrapped function, in call order. */
  readonly errors: readonly unknown[];
  readonly callCount: number;
  /** Clears the recorded calls, results and errors. */
  reset: () => void;
}

/**
 * Creates a spy that wraps an existing function.
 *
 * The wrapper forwards its receiver, so a spy taken on a method still works
 * when the method reads instance state.
 *
 * @param fn - The function to spy on.
 * @returns A SpyFn instance.
 *
 * @example
 * ```ts
 * const original = (a: number, b: number) => a + b;
 * const spy = createSpyFn(original);
 *
 * expect(spy(1, 2)).toBe(3);
 * expect(spy.calls).toHaveLength(1);
 * expect(spy.calls[0]).toEqual([1, 2]);
 *
 * spy.reset();
 * ```
 */
export function createSpyFn<
  TArgs extends readonly unknown[] = unknown[],
  TResult = unknown,
>(fn: (...args: TArgs) => TResult): SpyFn<TArgs, TResult> {
  const calls: TArgs[] = [];
  const results: TResult[] = [];
  const errors: unknown[] = [];

  const spy = function (this: unknown, ...args: TArgs): TResult {
    calls.push(args);
    try {
      const result = Reflect.apply(fn, this, args) as TResult;
      results.push(result);
      return result;
    } catch (error) {
      errors.push(error);
      throw error;
    }
  } as unknown as SpyFn<TArgs, TResult>;

  Object.defineProperty(spy, "original", {
    value: fn,
    writable: false,
    enumerable: true,
  });

  for (const [name, get] of [
    ["calls", () => calls],
    ["results", () => results],
    ["errors", () => errors],
    ["callCount", () => calls.length],
  ] as const) {
    Object.defineProperty(spy, name, { get, enumerable: true });
  }

  spy.reset = (): void => {
    calls.length = 0;
    results.length = 0;
    errors.length = 0;
  };

  return spy;
}

/**
 * A spy that wraps an object method.
 */
export interface SpyMethod<TObj, TMethod extends keyof TObj> {
  readonly object: TObj;
  readonly property: TMethod;
  readonly calls: readonly unknown[][];
  readonly results: readonly unknown[];
  readonly errors: readonly unknown[];
  readonly callCount: number;
  /** Reinstates the original method exactly as it was found. */
  restore: () => void;
}

/**
 * Creates a spy on an object method.
 *
 * @param object - The object containing the method.
 * @param property - The method name to spy on.
 * @returns A SpyMethod instance.
 *
 * @example
 * ```ts
 * const service = { save: (data: unknown) => ({ ...data, saved: true }) };
 * const spy = createSpyMethod(service, "save");
 *
 * service.save({ id: "123" });
 *
 * expect(spy.calls).toHaveLength(1);
 *
 * spy.restore();
 * ```
 */
export function createSpyMethod<TObj, TMethod extends keyof TObj>(
  object: TObj,
  property: TMethod,
): SpyMethod<TObj, TMethod> {
  const original = object[property] as unknown;

  if (typeof original !== "function") {
    throw new TypeError(`Property "${String(property)}" is not a function.`);
  }

  const key = property as PropertyKey;
  const target = object as unknown as Record<PropertyKey, unknown>;
  // Whether the method was the object's own or inherited from a prototype.
  // Reassigning an inherited method and then "restoring" it by assignment
  // leaves a permanent own property that changes enumeration and hasOwn.
  const wasOwnProperty = Object.hasOwn(target, key);

  const originalFn = original as (...args: unknown[]) => unknown;
  const calls: unknown[][] = [];
  const results: unknown[] = [];
  const errors: unknown[] = [];

  target[key] = function (this: unknown, ...args: unknown[]): unknown {
    calls.push(args);
    try {
      const result = originalFn.apply(this ?? object, args);
      results.push(result);
      return result;
    } catch (error) {
      errors.push(error);
      throw error;
    }
  };

  return {
    object,
    property,
    calls,
    results,
    errors,
    get callCount(): number {
      return calls.length;
    },
    restore: (): void => {
      if (wasOwnProperty) target[key] = original;
      else delete target[key];
      calls.length = 0;
      results.length = 0;
      errors.length = 0;
    },
  };
}
