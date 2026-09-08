/**
 * MessageHandler type definitions for Zudojs.
 *
 * Handlers are the consumer side of the messaging system.
 * They receive messages and produce results.
 *
 * @module messageHandler/messageHandlerType
 */

import type { Message } from "../message/messageType.type.js";

import type { MessageContext } from "../messageContext/messageContextType.type.js";

/**
 * Result of handling a message.
 *
 * Handlers can return either a value directly or a structured
 * result with metadata.
 */
export interface HandlerResult<TResult = unknown> {
  /** The result value. */
  readonly value: TResult;

  /** Optional result metadata. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * A function that handles a message and returns a result.
 *
 * @typeParam TMessage - The message type to handle
 * @typeParam TResult - The result type returned by the handler
 */
export type MessageHandler<
  TMessage extends Message = Message,
  TResult = unknown,
> = (message: TMessage, context: MessageContext) => Promise<TResult> | TResult;

/**
 * Message handler with metadata.
 */
export interface NamedMessageHandler<
  TMessage extends Message = Message,
  TResult = unknown,
> {
  /** Unique handler identifier. */
  readonly id: string;

  /** Human-readable name for debugging. */
  readonly name: string;

  /** The handler function. */
  readonly handler: MessageHandler<TMessage, TResult>;

  /** Message types this handler processes. */
  readonly messageTypes: readonly string[];

  /** Execution priority (lower = earlier). Default: 100. */
  readonly priority?: number;

  /** Whether this handler is enabled. */
  readonly enabled?: boolean;
}

/**
 * A handler-like value: either a function or an object with a
 * handle method.
 */
export type MessageHandlerLike<
  TMessage extends Message = Message,
  TResult = unknown,
> =
  | MessageHandler<TMessage, TResult>
  | { handle: MessageHandler<TMessage, TResult> };

/**
 * Handler factory function.
 */
export type MessageHandlerFactory<
  TMessage extends Message = Message,
  TResult = unknown,
> = (
  options?: Record<string, unknown>,
) => NamedMessageHandler<TMessage, TResult>;

/**
 * Resolves a MessageHandlerLike to a plain MessageHandler function.
 */
export function resolveMessageHandler<
  TMessage extends Message = Message,
  TResult = unknown,
>(
  handler: MessageHandlerLike<TMessage, TResult>,
): MessageHandler<TMessage, TResult> {
  if (typeof handler === "function") {
    return handler;
  }
  return handler.handle;
}
