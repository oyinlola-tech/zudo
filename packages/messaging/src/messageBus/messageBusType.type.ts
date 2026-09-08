/**
 * MessageBus type definitions for Zudojs.
 *
 * The bus is the primary API surface for sending messages.
 * It wraps the dispatcher with publish semantics.
 *
 * @module messageBus/messageBusType
 */

import type { Message, MessageInput } from "../message/messageType.type.js";

import type {
  MessageHandler,
  NamedMessageHandler,
} from "../messageHandler/messageHandlerType.type.js";

import type { MessageMiddlewareLike } from "../messageMiddleware/messageMiddlewareType.type.js";

import type {
  DispatchResult,
  DispatchOptions,
} from "../dispatcher/dispatcherType.type.js";

/**
 * Options for creating a message bus.
 */
export interface MessageBusOptions {
  /** Allow duplicate handler IDs. Default: false. */
  readonly allowDuplicateHandlers?: boolean;

  /** Allow multiple handlers per message type. Default: true. */
  readonly allowMultipleHandlers?: boolean;

  /** Global middleware. */
  readonly middleware?: readonly MessageMiddlewareLike[];

  /** Default timeout in ms. Default: 0 (no timeout). */
  readonly defaultTimeout?: number;
}

/**
 * Message bus interface.
 *
 * Provides a high-level API for dispatching messages and
 * registering handlers.
 */
export interface MessageBus {
  /**
   * Dispatches a message to registered handlers.
   *
   * This is the primary method for sending messages.
   * The message is validated, contextualized, and run through
   * the middleware pipeline before being delivered to handlers.
   */
  dispatch<TPayload, TResult>(
    message: Message<TPayload>,
    options?: DispatchOptions<TResult>,
  ): Promise<DispatchResult<TResult>>;

  /**
   * Convenience method: creates and dispatches a message from input.
   */
  send<TPayload, TResult>(
    input: MessageInput<TPayload>,
    options?: DispatchOptions<TResult>,
  ): Promise<DispatchResult<TResult>>;

  /**
   * Registers a handler for a message type.
   */
  on<TPayload, TResult>(
    messageType: string,
    handler: MessageHandler<Message<TPayload>, TResult>,
    options?: { id?: string; priority?: number },
  ): void;

  /**
   * Registers a named handler.
   */
  addHandler<TMessage extends Message, TResult>(
    handler: NamedMessageHandler<TMessage, TResult>,
  ): void;

  /**
   * Removes a handler by ID.
   */
  off(handlerId: string): boolean;

  /**
   * Adds middleware to the bus.
   */
  use<TMessage extends Message = Message, TResult = unknown>(
    middleware: MessageMiddlewareLike<TMessage, TResult>,
    options?: { priority?: number },
  ): void;

  /**
   * Checks if handlers are registered for a message type.
   */
  hasHandlers(messageType: string): boolean;

  /**
   * Returns the number of registered handlers.
   */
  readonly handlerCount: number;

  /**
   * Disposes the bus and releases resources.
   */
  dispose(): void;

  /**
   * Whether the bus has been disposed.
   */
  readonly disposed: boolean;
}
