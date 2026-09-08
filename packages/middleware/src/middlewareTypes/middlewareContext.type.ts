/**
 * Middleware context and pipeline result types.
 *
 * @module middlewareTypes/middlewareContext
 */

/**
 * How a pipeline reacts to a middleware or handler that throws.
 *
 * - `"capture"` — stop the chain and report the failure as a
 *   {@link PipelineFailure}. The default.
 * - `"throw"` — stop the chain and let the error propagate to the caller.
 * - `"continue"` — record the failure, skip the rest of the failing
 *   middleware, and continue with the next one. The handler still runs.
 *   A handler that throws is always captured or thrown; there is nothing
 *   left to continue to.
 */
export type PipelineErrorMode = "capture" | "throw" | "continue";

/**
 * A failure recorded while the pipeline was running.
 */
export interface PipelineMiddlewareFailure {
  /** Name of the middleware that threw, or `"handler"` for the final handler. */
  readonly name: string;
  /** The thrown value. */
  readonly error: unknown;
}

/**
 * A pipeline run that reached the handler and completed.
 */
export interface PipelineSuccess<TResult> {
  readonly success: true;
  /** The value returned by the handler. */
  readonly result: TResult;
  /** Always absent on a successful run. Present in the type so that
   *  `result.error` is legal to read before narrowing. */
  readonly error?: undefined;
  /** Execution time in milliseconds. */
  readonly durationMs: number;
  /** Names of middleware that started executing, in execution order. */
  readonly executedMiddleware: readonly string[];
  /** Failures swallowed under `errorMode: "continue"`. Empty otherwise. */
  readonly errors: readonly PipelineMiddlewareFailure[];
}

/**
 * A pipeline run that ended in a captured failure.
 */
export interface PipelineFailure {
  readonly success: false;
  /** Always absent on a failed run. */
  readonly result?: undefined;
  /** The error that ended the run. */
  readonly error: unknown;
  /** Execution time in milliseconds. */
  readonly durationMs: number;
  /** Names of middleware that started executing, in execution order. */
  readonly executedMiddleware: readonly string[];
  /** Every failure recorded during the run, including {@link PipelineFailure.error}. */
  readonly errors: readonly PipelineMiddlewareFailure[];
}

/**
 * Result of executing a middleware pipeline.
 *
 * Discriminated on `success`, so narrowing gives a non-optional `result`:
 *
 * ```ts
 * const outcome = await pipeline(context);
 * if (outcome.success) {
 *   use(outcome.result); // TResult, not TResult | undefined
 * }
 * ```
 */
export type PipelineResult<TResult> =
  PipelineSuccess<TResult> | PipelineFailure;

/**
 * Options for creating a middleware pipeline.
 */
export interface PipelineOptions {
  /** Maximum number of enabled middleware allowed. Default: 50. */
  readonly maxMiddleware?: number;
  /**
   * How the pipeline reacts to an error. Default: `"capture"`.
   *
   * @see PipelineErrorMode
   */
  readonly errorMode?: PipelineErrorMode;
  /**
   * Legacy alias for {@link PipelineOptions.errorMode}: `true` maps to
   * `"capture"` and `false` to `"throw"`. Ignored when `errorMode` is set.
   *
   * @deprecated Use `errorMode` — the name describes the wrong axis, since
   * both settings stop the chain.
   */
  readonly stopOnError?: boolean;
  /**
   * Aborts the run. Checked before each middleware and before the handler;
   * an aborted pipeline fails with a `MiddlewareAbortedError`.
   */
  readonly signal?: AbortSignal;
}
