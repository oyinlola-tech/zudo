/**
 * Mock function utilities.
 *
 * Creates mock functions that record calls and return configured values.
 */

import {
  defineRecordingProperties,
  produceResult,
  type MockMode,
} from "./mockFn.state.js";

/**
 * A mock function that records calls and returns configured values.
 *
 * The `…Once` setters queue a result for the next call only; queued results
 * are consumed in order before the persistent mode (or default) applies.
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
  /** Returns `value` from the next call only. */
  mockReturnValueOnce: (value: TResult) => void;
  /** Returns a promise resolving to `value` from the next call only. */
  mockResolvedValueOnce: (value: Awaited<TResult>) => void;
  /** Returns a promise rejecting with `error` from the next call only. */
  mockRejectedValueOnce: (error: unknown) => void;
  /** Runs `fn` for the next call only. */
  mockImplementationOnce: (fn: (...args: TArgs) => TResult) => void;
  /** Clears the recording, the persistent mode and any queued one-shots. */
  mockReset: () => void;
  /** Clears the recording only. */
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
  const once: MockMode[] = [];

  const initialMode: MockMode =
    arguments.length > 0
      ? { kind: "value", value: defaultReturnValue }
      : { kind: "none" };

  let mode: MockMode = initialMode;

  const mock = ((...args: TArgs): TResult => {
    calls.push(args);
    let result: TResult;
    try {
      result = produceResult<TArgs, TResult>(once.shift() ?? mode, args);
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

  defineRecordingProperties(mock, { calls, results, errors });

  const implementation = (fn: (...args: TArgs) => TResult): MockMode => ({
    kind: "implementation",
    fn: fn as (...a: never[]) => unknown,
  });

  mock.mockReturnValue = (value) => {
    mode = { kind: "value", value };
  };
  mock.mockResolvedValue = (value) => {
    mode = { kind: "resolve", value };
  };
  mock.mockRejectedValue = (error) => {
    mode = { kind: "reject", error };
  };
  mock.mockImplementation = (fn) => {
    mode = implementation(fn);
  };
  mock.mockReturnValueOnce = (value) => {
    once.push({ kind: "value", value });
  };
  mock.mockResolvedValueOnce = (value) => {
    once.push({ kind: "resolve", value });
  };
  mock.mockRejectedValueOnce = (error) => {
    once.push({ kind: "reject", error });
  };
  mock.mockImplementationOnce = (fn) => {
    once.push(implementation(fn));
  };

  mock.mockReset = (): void => {
    calls.length = 0;
    results.length = 0;
    errors.length = 0;
    once.length = 0;
    mode = initialMode;
  };

  mock.mockClear = (): void => {
    calls.length = 0;
    results.length = 0;
    errors.length = 0;
  };

  return mock;
}
