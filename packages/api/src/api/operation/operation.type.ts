import type { APIHandler } from "../handler/handler.type.js";

import {
  DEFAULT_OPERATION_TIMEOUT,
  MAX_OPERATION_NAME_LENGTH,
  MAX_OPERATION_TIMEOUT,
} from "../constants.js";

/**
 * Metadata for an API operation.
 */
export interface APIOperationMetadata {
  readonly description?: string;

  readonly tags?: readonly string[];

  readonly deprecated?: boolean;

  readonly version?: string;

  /**
   * Operation timeout in milliseconds. Superseded by
   * {@link APIOperation.timeout} when both are present.
   */
  readonly timeout?: number;

  readonly idempotent?: boolean;
}

/**
 * Core API operation contract.
 *
 * Operations are transport-independent and define the public
 * surface of application capabilities.
 */
export interface APIOperation<TInput = unknown, TOutput = unknown> {
  readonly name: string;

  /**
   * Input schema. When this is a Standard Schema
   * (https://standardschema.dev), the executor validates input against it
   * before invoking the handler; other values are documentation-only.
   */
  readonly input?: unknown;

  /**
   * Output schema. When this is a Standard Schema
   * (https://standardschema.dev), the executor validates the handler's
   * return value against it and returns the validated (possibly
   * transformed) value as the result data; a handler returning the wrong
   * shape fails with an `APIInternalError` (`expose: false`) rather than
   * leaking through to the transport. Other values are
   * documentation-only.
   */
  readonly output?: unknown;

  readonly handler: APIHandler<TInput, TOutput>;

  readonly metadata?: APIOperationMetadata;

  /**
   * Operation timeout in milliseconds. Must be a positive, finite integer
   * no greater than {@link MAX_OPERATION_TIMEOUT}. There is no way to
   * disable the deadline: `0` and negative values are rejected by
   * {@link defineOperation} rather than silently running unbounded.
   */
  readonly timeout?: number;
}

/**
 * An operation of any input/output type.
 *
 * `APIOperation<unknown, unknown>` is *not* a supertype of a typed
 * operation — a handler taking `{ id: string }` cannot be called with an
 * `unknown` input — so APIs that merely store or catalogue operations
 * (the registry) accept this instead.
 */
export type AnyAPIOperation = APIOperation<never, unknown>;

/**
 * Options for defining an API operation.
 */
export interface DefineOperationOptions<TInput = unknown, TOutput = unknown> {
  readonly name: string;

  /** @see {@link APIOperation.input} */
  readonly input?: unknown;

  /** @see {@link APIOperation.output} */
  readonly output?: unknown;

  readonly handler: APIHandler<TInput, TOutput>;

  readonly metadata?: APIOperationMetadata;

  /** @see {@link APIOperation.timeout} */
  readonly timeout?: number;
}

const OPERATION_NAME_PATTERN = /^[A-Za-z0-9._:/-]+$/;

/**
 * Validates an operation timeout.
 *
 * @throws {TypeError} if the value is not a number.
 * @throws {RangeError} if the value is not a positive, finite integer of
 * at most {@link MAX_OPERATION_TIMEOUT} milliseconds.
 */
export function assertValidTimeout(timeout: unknown, label: string): number {
  if (typeof timeout !== "number") {
    throw new TypeError(`${label} must be a number, received ${typeof timeout}.`);
  }
  if (!Number.isFinite(timeout) || !Number.isInteger(timeout)) {
    throw new RangeError(
      `${label} must be a finite integer number of milliseconds, received ${String(timeout)}.`,
    );
  }
  if (timeout <= 0) {
    throw new RangeError(
      `${label} must be greater than 0 ms, received ${timeout}. The deadline cannot be disabled.`,
    );
  }
  if (timeout > MAX_OPERATION_TIMEOUT) {
    throw new RangeError(
      `${label} must be at most ${MAX_OPERATION_TIMEOUT} ms, received ${timeout}.`,
    );
  }
  return timeout;
}

function isUsableTimeout(timeout: unknown): timeout is number {
  return (
    typeof timeout === "number" &&
    Number.isInteger(timeout) &&
    timeout > 0 &&
    timeout <= MAX_OPERATION_TIMEOUT
  );
}

/**
 * Resolves the effective timeout for an operation.
 *
 * This is the single owner of the precedence rule
 * (`timeout` > `metadata.timeout` > {@link DEFAULT_OPERATION_TIMEOUT});
 * `defineOperation` and the executor both go through it.
 *
 * Unusable values are skipped rather than disabling the deadline: the
 * first usable candidate wins, and {@link DEFAULT_OPERATION_TIMEOUT}
 * applies when none is. `defineOperation` rejects unusable values
 * outright, so that fallback only applies to hand-rolled `APIOperation`
 * objects.
 */
export function resolveOperationTimeout(source: {
  readonly timeout?: number;
  readonly metadata?: { readonly timeout?: number };
}): number {
  for (const candidate of [source.timeout, source.metadata?.timeout]) {
    if (isUsableTimeout(candidate)) {
      return candidate;
    }
  }
  return DEFAULT_OPERATION_TIMEOUT;
}

/**
 * Validates the identity-bearing fields of an operation.
 *
 * Called by `defineOperation` and re-checked by
 * `APIOperationRegistry.register`, since `APIOperation` is a bare
 * interface that callers can satisfy without `defineOperation`.
 *
 * @throws {TypeError} if `name` or `handler` has the wrong type.
 * @throws {RangeError} if `name` is empty, over-long, or contains
 * characters outside `[A-Za-z0-9._:/-]`.
 */
export function assertValidOperationShape(operation: {
  readonly name?: unknown;
  readonly handler?: unknown;
}): void {
  const { name, handler } = operation;

  if (typeof name !== "string") {
    throw new TypeError(
      `Operation name must be a string, received ${typeof name}.`,
    );
  }
  if (name.length === 0) {
    throw new RangeError("Operation name must not be empty.");
  }
  if (name.length > MAX_OPERATION_NAME_LENGTH) {
    throw new RangeError(
      `Operation name must be at most ${MAX_OPERATION_NAME_LENGTH} characters, received ${name.length}.`,
    );
  }
  if (!OPERATION_NAME_PATTERN.test(name)) {
    throw new RangeError(
      `Operation name "${name}" contains characters outside ${OPERATION_NAME_PATTERN.source}.`,
    );
  }
  if (typeof handler !== "function") {
    throw new TypeError(
      `Operation "${name}" must have a handler function, received ${typeof handler}.`,
    );
  }
}

/**
 * Deeply freezes an operation's metadata so a registered operation cannot
 * be rewritten process-wide through `metadata.tags` or `metadata.timeout`.
 */
export function freezeOperationMetadata(
  metadata: APIOperationMetadata | undefined,
): APIOperationMetadata | undefined {
  if (metadata === undefined) {
    return undefined;
  }
  if (Array.isArray(metadata.tags)) {
    Object.freeze(metadata.tags);
  }
  return Object.freeze(metadata);
}

/**
 * Creates a new API operation definition.
 *
 * Validates the definition eagerly — a bad name, a missing handler, or an
 * unusable timeout fails here, at startup, rather than on the first
 * request that reaches the operation.
 *
 * @throws {TypeError} if `name` or `handler` has the wrong type.
 * @throws {RangeError} if `name` or a supplied `timeout` is out of range.
 */
export function defineOperation<TInput = unknown, TOutput = unknown>(
  options: DefineOperationOptions<TInput, TOutput>,
): APIOperation<TInput, TOutput> {
  assertValidOperationShape(options);

  if (options.timeout !== undefined) {
    assertValidTimeout(options.timeout, "Operation timeout");
  }
  if (options.metadata?.timeout !== undefined) {
    assertValidTimeout(options.metadata.timeout, "Operation metadata.timeout");
  }

  // Explicit field list rather than `...options`: an operation carries
  // exactly the contract fields, never arbitrary extra properties.
  const operation: APIOperation<TInput, TOutput> = {
    name: options.name,
    input: options.input,
    output: options.output,
    handler: options.handler,
    metadata: freezeOperationMetadata(options.metadata),
    timeout: resolveOperationTimeout(options),
  };

  return Object.freeze(operation);
}
