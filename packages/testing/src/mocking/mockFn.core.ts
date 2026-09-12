/**
 * Mock function utilities.
 *
 * Creates mock functions that record calls and return configured values.
 */

/** How a mock produces its result. */
type MockMode =
  | { readonly kind: "none" }
  | { readonly kind: "value"; readonly value: unknown }
  | { readonly kind: "resolve"; readonly value: unknown }
  | { readonly kind: "reject"; readonly error: unknown }
  | {
      readonly kind: "implementation";
      readonly fn: (...args: never[]) => unknown;
    };

/**
 * A mock function that records calls and returns configured values.
 */
export interface MockFn<
  TArgs extends readonly unknown[] = unknown[],
  TResult = unknown,
> {
  (...args: TArgs): TResult;
  readonly calls: readonly TArgs[];
  /**
   * Result of each call, aligned index-for-index with {@link calls}. A
   * call whose implementation threw occupies its slot with `undefined`;
   * the thrown value is in {@link errors}.
   */
  readonly results: readonly TResult[];
  /** Values thrown by the implementation, in call order. */
  readonly errors: readonly unknown[];
  readonly invoked: boolean;
  readonly callCount: number;
  mockReturnValue: (value: TResult) => void;
  /** Configures the mock to return a promise resolving to `value`. */
  mockResolvedValue: (value: Awaited<TResult>) => void;
  /** Configures the mock to return a promise rejecting with `error`. */
  mockRejectedValue: (error: unknown) => void;
  mockImplementation: (fn: (...args: TArgs) => TResult) => void;
  mockReset: () => void;
  mockClear: () => void;
}

/**
 * Creates a mock function.
 *
 * @param defaultReturnValue - Optional default return value.
 * @returns A MockFn instance.
 *
 * @example
 * ```ts
 * const mockFn = createMockFn<string[], void>();
 *
 * mockFn("hello", "world");
 *
 * expect(mockFn.calls).toHaveLength(1);
 * expect(mockFn.calls[0]).toEqual(["hello", "world"]);
 * expect(mockFn.callCount).toBe(1);
 * ```
 */
export function createMockFn<
  TArgs extends readonly unknown[] = unknown[],
  TResult = unknown,
>(defaultReturnValue?: TResult): MockFn<TArgs, TResult> {
  const calls: TArgs[] = [];
  const results: TResult[] = [];
  const errors: unknown[] = [];

  const initialMode: MockMode =
    arguments.length > 0
      ? { kind: "value", value: defaultReturnValue }
      : { kind: "none" };

  let mode: MockMode = initialMode;

  /**
   * Produce the configured result.
   *
   * `undefined` is a legitimate configured value, so the mode is tracked
   * explicitly rather than inferred from a `!== undefined` check — which
   * silently ignored `mockReturnValue(undefined)`.
   */
  const produce = (args: TArgs): TResult => {
    switch (mode.kind) {
      case "value":
        return mode.value as TResult;
      case "resolve":
        return Promise.resolve(mode.value) as TResult;
      case "reject":
        return Promise.reject(mode.error) as TResult;
      case "implementation":
        return (mode.fn as (...a: TArgs) => TResult)(...args);
      case "none":
        return undefined as TResult;
    }
  };

  const mock = ((...args: TArgs): TResult => {
    calls.push(args);
    let result: TResult;
    try {
      result = produce(args);
    } catch (error) {
      // Keep `results` aligned with `calls` even when the implementation
      // throws; otherwise every later result shifts one index left.
      results.push(undefined as TResult);
      errors.push(error);
      throw error;
    }
    results.push(result);
    return result;
  }) as MockFn<TArgs, TResult>;

  Object.defineProperty(mock, "calls", {
    get: () => calls,
    enumerable: true,
  });

  Object.defineProperty(mock, "results", {
    get: () => results,
    enumerable: true,
  });

  Object.defineProperty(mock, "errors", {
    get: () => errors,
    enumerable: true,
  });

  Object.defineProperty(mock, "invoked", {
    get: () => calls.length > 0,
    enumerable: true,
  });

  Object.defineProperty(mock, "callCount", {
    get: () => calls.length,
    enumerable: true,
  });

  mock.mockReturnValue = (value: TResult): void => {
    mode = { kind: "value", value };
  };

  mock.mockResolvedValue = (value: Awaited<TResult>): void => {
    mode = { kind: "resolve", value };
  };

  mock.mockRejectedValue = (error: unknown): void => {
    mode = { kind: "reject", error };
  };

  mock.mockImplementation = (fn: (...args: TArgs) => TResult): void => {
    mode = { kind: "implementation", fn: fn as (...a: never[]) => unknown };
  };

  mock.mockReset = (): void => {
    calls.length = 0;
    results.length = 0;
    errors.length = 0;
    mode = initialMode;
  };

  mock.mockClear = (): void => {
    calls.length = 0;
    results.length = 0;
    errors.length = 0;
  };

  return mock;
}
