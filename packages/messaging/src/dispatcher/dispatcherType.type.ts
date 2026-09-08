/**
 * Dispatcher type definitions for Zudojs.
 *
 * The dispatcher is the core coordination point that validates
 * messages, creates context, runs middleware, and invokes handlers.
 *
 * @module dispatcher/dispatcherType
 */

import type { Message } from "../message/messageType.type.js";

import type {
  MessageContext,
  MessageContextOptions,
} from "../messageContext/messageContextType.type.js";

import type {
  MessageMiddlewareLike,
  MessageMiddlewarePipelineResult,
} from "../messageMiddleware/messageMiddlewareType.type.js";

/**
 * Result of dispatching a message.
 */
export interface DispatchResult<TResult = unknown> {
  /** Whether the dispatch was successful. */
  readonly success: boolean;

  /** The result value (if successful). */
  readonly value?: TResult;

  /** The error (if failed). */
  readonly error?: Error;

  /** The message that was dispatched. */
  readonly message: Message;

  /** The context used for dispatch. */
  readonly context: MessageContext;

  /** Handler execution results. */
  readonly handlerResults: readonly HandlerExecutionResult[];

  /** Middleware execution metadata. */
  readonly middlewareResult?: MessageMiddlewarePipelineResult;

  /** Total dispatch duration in ms. */
  readonly duration: number;
}

/**
 * Result of a single handler execution.
 */
export interface HandlerExecutionResult<TResult = unknown> {
  /** The handler ID. */
  readonly handlerId: string;

  /** Whether the handler succeeded. */
  readonly success: boolean;

  /** The result value (if successful). */
  readonly value?: TResult;

  /** The error (if failed). */
  readonly error?: Error;

  /** Handler execution duration in ms. */
  readonly duration: number;
}

/**
 * Options for dispatching a message.
 */
export interface DispatchOptions<TResult = unknown> {
  /** Context options. */
  readonly context?: MessageContextOptions;

  /** Middleware to apply for this dispatch. */
  readonly middleware?: readonly MessageMiddlewareLike[];

  /** Timeout in ms. 0 = no timeout. Default: 0. */
  readonly timeout?: number;

  /** AbortSignal for cancellation. */
  readonly signal?: AbortSignal;
}

/**
 * Dispatcher interface.
 *
 * Validates, contextualizes, and dispatches messages through
 * the middleware pipeline to handlers.
 */
export interface Dispatcher {
  /**
   * Dispatches a message through the pipeline to handlers.
   */
  dispatch<TPayload, TResult>(
    message: Message<TPayload>,
    options?: DispatchOptions<TResult>,
  ): Promise<DispatchResult<TResult>>;

  /**
   * Registers middleware for all dispatches.
   */
  use<TMessage extends Message = Message, TResult = unknown>(
    middleware: MessageMiddlewareLike<TMessage, TResult>,
    options?: { priority?: number },
  ): void;

  /**
   * Removes middleware by ID.
   */
  removeMiddleware(middlewareId: string): boolean;
}
