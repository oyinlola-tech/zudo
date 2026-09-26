/**
 * Result modes and call recording shared by `createMockFn`.
 */

/** How a mock produces its result. */
export type MockMode =
  | { readonly kind: "none" }
  | { readonly kind: "value"; readonly value: unknown }
  | { readonly kind: "resolve"; readonly value: unknown }
  | { readonly kind: "reject"; readonly error: unknown }
  | {
      readonly kind: "implementation";
      readonly fn: (...args: never[]) => unknown;
    };

/**
 * Produces the result a mode describes.
 *
 * `undefined` is a legitimate configured value, so the mode is tracked
 * explicitly rather than inferred from a `!== undefined` check — which
 * silently ignored `mockReturnValue(undefined)`.
 */
export function produceResult<TArgs extends readonly unknown[], TResult>(
  mode: MockMode,
  args: TArgs,
): TResult {
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
}

/** The recorded calls of a mock. */
export interface MockRecording<TArgs, TResult> {
  readonly calls: TArgs[];
  readonly results: TResult[];
  readonly errors: unknown[];
}

/**
 * Defines the read-only recording views (`calls`, `results`, `errors`,
 * `invoked`, `callCount`) on a mock function.
 */
export function defineRecordingProperties<TArgs, TResult>(
  mock: object,
  recording: MockRecording<TArgs, TResult>,
): void {
  const define = (name: string, get: () => unknown): void => {
    Object.defineProperty(mock, name, { get, enumerable: true });
  };

  define("calls", () => recording.calls);
  define("results", () => recording.results);
  define("errors", () => recording.errors);
  define("invoked", () => recording.calls.length > 0);
  define("callCount", () => recording.calls.length);
}
