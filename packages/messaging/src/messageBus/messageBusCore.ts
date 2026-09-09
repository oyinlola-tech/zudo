/**
 * In-memory message bus implementation.
 *
 * @module messageBus/messageBusCore
 */

import type { Message, MessageInput } from "../message/messageType.type.js";

import type {
  MessageHandler,
  NamedMessageHandler,
} from "../messageHandler/messageHandlerType.type.js";

import type {
  MessageMiddlewareLike,
  MessageMiddlewareOptions,
} from "../messageMiddleware/messageMiddlewareType.type.js";

import type { MessageBus, MessageBusOptions } from "./messageBusType.type.js";

import type {
  DispatchResult,
  DispatchOptions,
} from "../dispatcher/dispatcherType.type.js";

import { createMessage } from "../message/messageFactory.js";
import { HandlerRegistryStore } from "../handlerRegistry/handlerRegistryStore.js";
import { DefaultDispatcher } from "../dispatcher/dispatcherCore.js";
import { MessageBusDisposedError } from "@zudojs/errors";

/** Default in-memory message bus. */
export class InMemoryMessageBus implements MessageBus {
  private readonly dispatcher: DefaultDispatcher;
  private readonly registry: HandlerRegistryStore;
  private readonly defaultTimeout: number;
  private handlerSequence = 0;
  private _disposed = false;

  constructor(options: MessageBusOptions = {}) {
    this.registry = new HandlerRegistryStore({
      allowDuplicateHandlerIds: options.allowDuplicateHandlers ?? false,
      allowMultipleHandlers: options.allowMultipleHandlers ?? true,
    });
    this.dispatcher = new DefaultDispatcher(this.registry);
    this.defaultTimeout = options.defaultTimeout ?? 0;
    this.registerGlobalMiddleware(options.middleware);
  }

  private registerGlobalMiddleware(
    middleware?: readonly MessageMiddlewareLike[],
  ): void {
    if (middleware !== undefined) {
      for (const mw of middleware) this.dispatcher.use(mw);
    }
  }

  async dispatch<TPayload, TResult>(
    message: Message<TPayload>,
    options: DispatchOptions<TResult> = {},
  ): Promise<DispatchResult<TResult>> {
    this.validateNotDisposed(message);
    const timeout = options.timeout ?? this.defaultTimeout;

    // The timeout is the dispatcher's job. The bus used to race the dispatch
    // itself and abort on expiry, which produced a generic abort error and
    // meant the dispatcher's own documented `timeout` option stayed dead.
    return this.dispatcher.dispatch(message, {
      ...options,
      timeout,
    }) as Promise<DispatchResult<TResult>>;
  }

  private validateNotDisposed(_message: Message): void {
    if (this._disposed) {
      throw new MessageBusDisposedError();
    }
  }

  async send<TPayload, TResult>(
    input: MessageInput<TPayload>,
    options: DispatchOptions<TResult> = {},
  ): Promise<DispatchResult<TResult>> {
    return this.dispatch(createMessage(input), options);
  }

  on<TPayload, TResult>(
    messageType: string,
    handler: MessageHandler<Message<TPayload>, TResult>,
    options: { id?: string; priority?: number } = {},
  ): void {
    // A clock-derived id collided whenever two handlers for the same type
    // were registered inside one millisecond, which then threw
    // DuplicateMessageHandlerError from what looked like ordinary setup.
    const id =
      options.id ?? `handler:${messageType}:${++this.handlerSequence}`;
    const namedHandler: NamedMessageHandler<Message<TPayload>, TResult> = {
      id,
      name: id,
      handler,
      messageTypes: [messageType],
      priority: options.priority ?? 100,
      enabled: true,
    };
    this.registry.register(namedHandler);
  }

  addHandler<TMessage extends Message, TResult>(
    handler: NamedMessageHandler<TMessage, TResult>,
  ): void {
    this.registry.register(handler as NamedMessageHandler);
  }

  off(handlerId: string): boolean {
    return this.registry.unregister(handlerId);
  }

  use<TMessage extends Message = Message, TResult = unknown>(
    middleware: MessageMiddlewareLike<TMessage, TResult>,
    options?: MessageMiddlewareOptions,
  ): string {
    return this.dispatcher.use(middleware, options);
  }

  removeMiddleware(middlewareId: string): boolean {
    return this.dispatcher.removeMiddleware(middlewareId);
  }

  hasHandlers(messageType: string): boolean {
    return this.registry.resolve(messageType).length > 0;
  }

  get handlerCount(): number {
    return this.registry.size;
  }

  dispose(): void {
    this._disposed = true;
    this.registry.clear();
    this.dispatcher.dispose();
  }

  get disposed(): boolean {
    return this._disposed;
  }
}
export function createMessageBus(options?: MessageBusOptions): MessageBus {
  return new InMemoryMessageBus(options);
}
