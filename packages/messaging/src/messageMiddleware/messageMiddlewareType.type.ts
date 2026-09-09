/**
 * Message middleware type definitions for Zudojs.
 *
 * Middleware wraps message dispatch with cross-cutting concerns
 * like logging, validation, timeouts, and error handling.
 *
 * @module messageMiddleware/messageMiddlewareType
 */

import type { Message } from "../message/messageType.type.js";

import type { MessageContext } from "../messageContext/messageContextType.type.js";

/**
 * Context available to message middleware.
 */
export interface MessageMiddlewareContext<TMessage extends Message = Message> {
  /** The message being dispatched. */
  readonly message: TMessage;

  /** The dispatch context. */
  readonly context: MessageContext;

  /** AbortSignal for cancellation. */
  readonly signal: AbortSignal;

  /** Middleware-specific metadata. */
  readonly metadata: Readonly<Record<string, unknown>>;

  /** Unique dispatch execution ID. */
  readonly executionId: string;

  /** When dispatch started. */
  readonly startedAt: Date;

  /** Mutable state for middleware. */
  readonly state: Map<string, unknown>;
}

/**
 * Next function in the middleware chain.
 */
export type MessageMiddlewareNext<TResult = unknown> = () => Promise<TResult>;

/**
 * A middleware function that processes a message dispatch.
 */
export type MessageMiddleware<
  TMessage extends Message = Message,
  TResult = unknown,
> = (
  context: MessageMiddlewareContext<TMessage>,
  next: MessageMiddlewareNext<TResult>,
) => Promise<TResult>;

/**
 * Middleware object with a handle method.
 */
export interface MessageMiddlewareObject<
  TMessage extends Message = Message,
  TResult = unknown,
> {
  readonly handle: MessageMiddleware<TMessage, TResult>;
}

/**
 * A middleware-like value: either a function or an object with
 * a handle method.
 */
export type MessageMiddlewareLike<
  TMessage extends Message = Message,
  TResult = unknown,
> =
  | MessageMiddleware<TMessage, TResult>
  | MessageMiddlewareObject<TMessage, TResult>;

/**
 * Options for registering middleware.
 */
export interface MessageMiddlewareOptions {
  /** Unique middleware identifier. */
  readonly id?: string;

  /** Human-readable description. */
  readonly description?: string;

  /** Execution priority (lower = earlier). Default: 100. */
  readonly priority?: number;

  /** Whether this middleware is enabled. */
  readonly enabled?: boolean;
}

/**
 * Registered middleware entry.
 */
export interface RegisteredMessageMiddleware<
  TMessage extends Message = Message,
  TResult = unknown,
> {
  readonly id: string;
  readonly description?: string;
  readonly priority: number;
  readonly enabled: boolean;
  readonly middleware: MessageMiddlewareLike<TMessage, TResult>;
}

/**
 * Execution record for a single middleware.
 */
export interface MessageMiddlewareExecution<TResult = unknown> {
  /** The id of the middleware this record describes. */
  readonly middlewareId: string;
  readonly result: TResult;
  readonly duration: number;
}

/**
 * Result of running the middleware pipeline.
 */
export interface MessageMiddlewarePipelineResult<TResult = unknown> {
  readonly result: TResult;
  readonly executions: readonly MessageMiddlewareExecution[];
  readonly duration: number;
}

/**
 * Options for pipeline execution.
 */
export interface MessageMiddlewarePipelineOptions {
  readonly signal?: AbortSignal;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly state?: Map<string, unknown>;

  /**
   * Identifiers parallel to the middleware list, used to label the execution
   * records. Positions without an id fall back to a synthesised one.
   */
  readonly middlewareIds?: readonly string[];
}
