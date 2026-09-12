import type { APIContext } from "../context/context.type.js";

import type { APIResult } from "../result/apiResult.type.js";

import { apiFailure, apiSuccess } from "../result/apiResult.type.js";

import type { APIOperation } from "../operation/operation.type.js";

import { resolveOperationTimeout } from "../operation/operation.type.js";

import type {
  APIInterceptor,
  APIExecutionContext,
} from "../interceptors/interceptor.type.js";

import {
  APIError,
  APIInternalError,
  APITimeoutError,
  APIValidationError,
  createAPIError,
  ErrorCode,
  isAPIError,
} from "../errors/index.js";

import {
  MAX_INTERCEPTORS,
  MAX_VALIDATION_ISSUES,
  MAX_VALIDATION_ISSUE_LENGTH,
} from "../constants.js";

export type { APIExecutionContext } from "../interceptors/interceptor.type.js";

/**
 * Error normalizer for converting unknown errors into APIError instances.
 *
 * APIErrors pass through untouched. Everything else is wrapped in an
 * `APIInternalError` (`expose: false`) carrying a generic message; the
 * original error is preserved on `cause` for logging.
 *
 * The wrapper's own message is deliberately *not* a copy of the original.
 * `BaseError.toJSON()` in `@zudojs/errors` 0.1.0 emits `message`, `stack`
 * and the serialized `cause` regardless of `expose`, so a transport doing
 * `res.json(result.error)` would otherwise ship the raw driver message
 * (connection strings, constraint names, file paths, tokens) to a client.
 */
export function normalizeAPIError(
  error: unknown,
  operationName?: string,
): APIError {
  if (isAPIError(error)) {
    return error;
  }

  const where =
    operationName !== undefined && operationName !== ""
      ? `operation "${operationName}"`
      : "an API operation";

  const wrapped =
    error instanceof Error
      ? new APIInternalError(
          `An unexpected internal error occurred in ${where}.`,
        )
      : new APIInternalError(
          `A non-error value (${describeValueType(error)}) was thrown in ${where}.`,
        );

  // `APIInternalError`'s subclass constructor forwards only
  // `{ endpoint, method }`, so `cause` cannot be passed through it.
  // `APIError` / `createAPIError` *do* accept `cause`, but constructing
  // through them would lose the `APIInternalError` class identity that
  // consumers match on. `cause` is a declared writable class field on
  // `BaseError`, so assigning it after construction is equivalent for
  // `toJSON()` and for `error.cause` reads; only the native `[[cause]]`
  // slot differs.
  (wrapped as { cause?: unknown }).cause = error;

  return wrapped;
}

function describeValueType(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

/**
 * Minimal Standard Schema (https://standardschema.dev) shape.
 *
 * Zod, Valibot, ArkType, and other libraries implement this interface,
 * so operation schemas from any of them validate without the api
 * package depending on a specific validation library.
 */
interface StandardSchemaLike {
  readonly "~standard": {
    readonly version: number;
    readonly vendor: string;
    validate(
      value: unknown,
    ): StandardSchemaResult | Promise<StandardSchemaResult>;
  };
}

type StandardSchemaPathSegment = PropertyKey | { readonly key: PropertyKey };

interface StandardSchemaIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<StandardSchemaPathSegment>;
}

type StandardSchemaResult =
  | { readonly value: unknown; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardSchemaIssue> };

function isStandardSchema(value: unknown): value is StandardSchemaLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, { validate?: unknown }>)["~standard"]
      ?.validate === "function"
  );
}

/**
 * A schema result counts as a failure only when it carries at least one
 * issue. Some adapters always populate `issues` and return an empty array
 * on success; treating that as a failure produces a 422 with an empty
 * issue list and no way to learn what was wrong.
 */
function hasIssues(
  result: StandardSchemaResult,
): result is { readonly issues: ReadonlyArray<StandardSchemaIssue> } {
  return Array.isArray(result.issues) && result.issues.length > 0;
}

type MutableExecutionContext<TInput, TOutput> = Omit<
  APIExecutionContext<TInput, TOutput>,
  "result"
> & { result?: APIResult<TOutput> };

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
   * `APIValidationError`. Defaults to {@link MAX_VALIDATION_ISSUES}.
   *
   * A schema over a large array emits one issue per failing element, so
   * an uncapped list is an amplification vector: the executor is the
   * layer on the untrusted-input boundary and caps it here.
   */
  readonly maxValidationIssues?: number;
}

/**
 * Executes an API operation through its interceptor pipeline.
 *
 * Enforces the operation timeout, honors the context AbortSignal, and
 * validates input and output when the operation's `input` / `output` is a
 * Standard Schema.
 */
export class APIExecutor {
  private readonly interceptors: readonly APIInterceptor[];

  private readonly exposeValidationMessages: boolean;

  private readonly maxValidationIssues: number;

  constructor(
    optionsOrInterceptors:
      | readonly APIInterceptor[]
      | APIExecutorOptions = {},
  ) {
    const options: APIExecutorOptions = Array.isArray(optionsOrInterceptors)
      ? { interceptors: optionsOrInterceptors }
      : (optionsOrInterceptors as APIExecutorOptions);

    const interceptors = options.interceptors ?? [];
    if (interceptors.length > MAX_INTERCEPTORS) {
      throw new RangeError(
        `Interceptor pipeline exceeds MAX_INTERCEPTORS (${MAX_INTERCEPTORS}).`,
      );
    }

    const maxValidationIssues =
      options.maxValidationIssues ?? MAX_VALIDATION_ISSUES;
    if (
      !Number.isInteger(maxValidationIssues) ||
      maxValidationIssues < 1 ||
      maxValidationIssues > MAX_VALIDATION_ISSUES
    ) {
      throw new RangeError(
        `maxValidationIssues must be an integer between 1 and ${MAX_VALIDATION_ISSUES}, received ${String(maxValidationIssues)}.`,
      );
    }

    this.interceptors = Object.freeze([...interceptors]);
    this.exposeValidationMessages = options.exposeValidationMessages === true;
    this.maxValidationIssues = maxValidationIssues;
  }

  /**
   * Executes an operation with the given input and context.
   */
  async execute<TInput = unknown, TOutput = unknown>(
    operation: APIOperation<TInput, TOutput>,
    input: TInput,
    context: APIContext,
  ): Promise<APIResult<TOutput>> {
    if (context.signal?.aborted) {
      return apiFailure(abortedError(operation.name));
    }

    let effectiveInput = input;
    if (isStandardSchema(operation.input)) {
      try {
        const validation = await operation.input["~standard"].validate(input);
        if (hasIssues(validation)) {
          return apiFailure(
            new APIValidationError(
              `Invalid input for operation "${operation.name}".`,
              this.clientIssues(validation.issues),
            ),
          );
        }
        effectiveInput = validation.value as TInput;
      } catch (error) {
        return apiFailure(normalizeAPIError(error, operation.name));
      }
    }

    const executionContext: MutableExecutionContext<TInput, TOutput> = {
      operation,
      input: effectiveInput,
      context,
    };

    // Reads `executionContext.input` at call time, so an interceptor that
    // replaces the input before calling `next()` actually changes what the
    // handler receives.
    const executeHandler = (): Promise<APIResult<TOutput>> =>
      this.invokeHandler(operation, executionContext.input, context);

    try {
      return await this.runPipeline(executionContext, executeHandler);
    } catch (error) {
      return apiFailure(normalizeAPIError(error, operation.name));
    }
  }

  /**
   * Invokes the operation handler under its timeout and abort signal, and
   * validates the handler's output when `operation.output` is a Standard
   * Schema.
   */
  private async invokeHandler<TInput, TOutput>(
    operation: APIOperation<TInput, TOutput>,
    input: TInput,
    context: APIContext,
  ): Promise<APIResult<TOutput>> {
    if (context.signal?.aborted) {
      return apiFailure(abortedError(operation.name));
    }

    const timeoutMs = resolveOperationTimeout(operation);

    let output: TOutput;
    try {
      output = await withDeadline(
        operation.handler(input, context),
        timeoutMs,
        operation.name,
        context.signal,
      );
    } catch (error) {
      return apiFailure(normalizeAPIError(error, operation.name));
    }

    return this.validateOutput(operation, output);
  }

  /**
   * Validates handler output against `operation.output`.
   *
   * A response that does not match its declared schema is a server bug,
   * not a client mistake, so failures surface as an `APIInternalError`
   * (500, `expose: false`) naming only the failing paths — never the
   * offending values, which are exactly the fields (password hashes,
   * internal audit columns) that should not reach a client.
   */
  private async validateOutput<TInput, TOutput>(
    operation: APIOperation<TInput, TOutput>,
    output: TOutput,
  ): Promise<APIResult<TOutput>> {
    if (!isStandardSchema(operation.output)) {
      return apiSuccess(output);
    }

    let validation: StandardSchemaResult;
    try {
      validation = await operation.output["~standard"].validate(output);
    } catch (error) {
      return apiFailure(normalizeAPIError(error, operation.name));
    }

    if (hasIssues(validation)) {
      const paths = validation.issues
        .slice(0, this.maxValidationIssues)
        .map(formatIssuePath)
        .join(", ");
      return apiFailure(
        new APIInternalError(
          `Invalid output for operation "${operation.name}" at: ${paths}.`,
        ),
      );
    }

    return apiSuccess(validation.value as TOutput);
  }

  /**
   * Converts schema issues into the capped, redacted list carried on the
   * client-facing `APIValidationError`.
   */
  private clientIssues(
    issues: ReadonlyArray<StandardSchemaIssue>,
  ): readonly string[] {
    const limit = this.maxValidationIssues;
    const shown = issues.slice(0, limit).map((issue) =>
      this.exposeValidationMessages
        ? truncate(issue.message, MAX_VALIDATION_ISSUE_LENGTH)
        : `${formatIssuePath(issue)}: invalid`,
    );

    const omitted = issues.length - shown.length;
    if (omitted > 0) {
      shown.push(`… and ${omitted} more issue(s) omitted.`);
    }

    return shown;
  }

  /**
   * Runs the interceptor pipeline (Koa-style dispatch).
   *
   * Each interceptor's `next()` may be awaited at most once; a second
   * call rejects instead of silently re-executing the handler while
   * bypassing downstream interceptors.
   *
   * `context.result` is assigned as each level resolves, so an
   * interceptor reading it after `await next()` sees exactly what the
   * level below returned — including when a downstream interceptor
   * short-circuits without calling `next()`.
   */
  private runPipeline<TInput, TOutput>(
    context: MutableExecutionContext<TInput, TOutput>,
    terminal: () => Promise<APIResult<TOutput>>,
  ): Promise<APIResult<TOutput>> {
    const interceptors = this.interceptors;
    let lastDispatched = -1;

    const dispatch = async (index: number): Promise<APIResult<TOutput>> => {
      if (index <= lastDispatched) {
        throw new APIInternalError(
          "next() called multiple times in interceptor pipeline.",
        );
      }
      lastDispatched = index;

      if (index >= interceptors.length) {
        const result = await terminal();
        context.result = result;
        return result;
      }

      const interceptor = interceptors[index]!;
      const result = await interceptor.intercept(context, () =>
        dispatch(index + 1),
      );
      context.result = result;
      return result;
    };

    return dispatch(0);
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────

function truncate(value: string, max: number): string {
  const text = typeof value === "string" ? value : String(value);
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * Renders a Standard Schema issue path as a dotted string. Path segments
 * are field names, never submitted values, so they are safe to expose.
 */
function formatIssuePath(issue: StandardSchemaIssue): string {
  const path = issue.path;
  if (path === undefined || path.length === 0) {
    return "(root)";
  }

  return path
    .map((segment) => {
      const key =
        typeof segment === "object" && segment !== null && "key" in segment
          ? segment.key
          : segment;
      return truncate(String(key), 64);
    })
    .join(".");
}

/**
 * Error for an execution cancelled by the caller's `AbortSignal`.
 *
 * Carries `ErrorCode.OPERATION_CANCELLED` — branch on that, not on the
 * status code. `statusCode` is 499, an nginx convention ("Client Closed
 * Request") rather than an IANA status; this package is
 * transport-agnostic, so each adapter should map the *code* onto whatever
 * its protocol calls "cancelled" (gRPC `CANCELLED`, a dropped queue
 * message, a non-zero CLI exit) rather than passing 499 to the wire.
 */
function abortedError(operationName: string): APIError {
  return createAPIError(`Operation "${operationName}" was aborted.`, {
    code: ErrorCode.OPERATION_CANCELLED,
    statusCode: 499,
    expose: true,
  });
}

/**
 * Awaits a handler promise, rejecting when the timeout elapses or the
 * abort signal fires. The handler itself keeps running (promises are not
 * cancellable), but the caller stops waiting and resources are released.
 *
 * `timeoutMs` is always a positive integer here — `defineOperation`
 * rejects anything else and `resolveOperationTimeout` substitutes the
 * default for hand-rolled operations — so the deadline can never be
 * silently disabled.
 */
function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };

    const onAbort = (): void => {
      cleanup();
      reject(abortedError(operationName));
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new APITimeoutError(timeoutMs));
    }, timeoutMs);

    signal?.addEventListener("abort", onAbort, { once: true });

    // `Promise.resolve` rather than `promise.then`: a hand-rolled operation
    // whose handler returns synchronously is a legal JavaScript caller, and
    // calling `.then` on its plain value failed with "promise.then is not a
    // function" reported as an internal error of the operation.
    Promise.resolve(promise).then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}
