/**
 * HandlerRegistry type definitions for Zudojs.
 *
 * The registry manages message handler registration and resolution.
 * It supports both single-handler (commands/queries) and multi-handler
 * (events) dispatch models.
 *
 * @module handlerRegistry/handlerRegistryType
 */

import type { NamedMessageHandler } from "../messageHandler/messageHandlerType.type.js";

import type { Message } from "../message/messageType.type.js";

/**
 * Options for the handler registry.
 */
export interface HandlerRegistryOptions {
  /** Allow duplicate handler IDs. Default: false. */
  readonly allowDuplicateHandlerIds?: boolean;

  /** Allow multiple handlers per message type. Default: true. */
  readonly allowMultipleHandlers?: boolean;

  /** Require message type registration before handler. Default: false. */
  readonly requireTypeRegistration?: boolean;
}

/**
 * Registered handler entry.
 */
export interface RegisteredHandler<
  TMessage extends Message = Message,
  TResult = unknown,
> {
  /** The named handler. */
  readonly handler: NamedMessageHandler<TMessage, TResult>;

  /** When the handler was registered. */
  readonly registeredAt: Date;
}

/**
 * Query options for looking up handlers.
 */
export interface HandlerQueryOptions {
  /** Include disabled handlers. Default: false. */
  readonly includeDisabled?: boolean;

  /** Filter by priority (max). Default: no limit. */
  readonly maxPriority?: number;
}
