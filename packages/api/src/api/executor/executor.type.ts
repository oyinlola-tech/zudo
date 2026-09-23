import type { APIInterceptor } from "../interceptors/interceptor.type.js";

/**
 * Options for {@link APIExecutor}.
 */
export interface APIExecutorOptions {
  /** Interceptor pipeline, outermost first. */
  readonly interceptors?: readonly APIInterceptor[];

  /**
   * Whether raw schema issue messages are copied into the client-facing
   * `APIValidationError` (which is `expose: true`).
   *
   * Default `false`. Schema messages routinely interpolate the received
   * value — Zod's built-in messages do for several checks, and most
   * hand-written `message:` strings do — which would put submitted
   * secrets straight into a 422 body. With the default, clients receive
   * one entry per failing path (`"user.email: invalid"`) naming *where*
   * validation failed but never echoing *what* was submitted.
   *
   * Set to `true` only when every schema in the process is known to
   * produce value-free messages.
   */
  readonly exposeValidationMessages?: boolean;

  /**
   * Maximum number of validation issues carried on a single
   * `APIValidationError`. Defaults to `MAX_VALIDATION_ISSUES`.
   *
   * A schema over a large array emits one issue per failing element, so
   * an uncapped list is an amplification vector: the executor is the
   * layer on the untrusted-input boundary and caps it here.
   */
  readonly maxValidationIssues?: number;
}
