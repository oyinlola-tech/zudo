import type { APIHandler } from "../handler/handler.type.js";

import { DEFAULT_OPERATION_TIMEOUT } from "../constants.js";

/**
 * Metadata for an API operation.
 */
export interface APIOperationMetadata {
  readonly description?: string;

  readonly tags?: readonly string[];

  readonly deprecated?: boolean;

  readonly version?: string;

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

  readonly output?: unknown;

  readonly handler: APIHandler<TInput, TOutput>;

  readonly metadata?: APIOperationMetadata;

  readonly timeout?: number;
}

/**
 * Options for defining an API operation.
 */
export interface DefineOperationOptions<TInput = unknown, TOutput = unknown> {
  readonly name: string;

  readonly input?: unknown;

  readonly output?: unknown;

  readonly handler: APIHandler<TInput, TOutput>;

  readonly metadata?: APIOperationMetadata;

  readonly timeout?: number;
}

/**
 * Creates a new API operation definition.
 */
export function defineOperation<TInput = unknown, TOutput = unknown>(
  options: DefineOperationOptions<TInput, TOutput>,
): APIOperation<TInput, TOutput> {
  const operation: APIOperation<TInput, TOutput> = {
    ...options,
    timeout:
      options.timeout ?? options.metadata?.timeout ?? DEFAULT_OPERATION_TIMEOUT,
  };

  return Object.freeze(operation);
}
