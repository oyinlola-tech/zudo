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

import type { MessageMiddlewareLike } from "../messageMiddleware/messageMiddlewareType.type.js";

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
    const dispatchOptions = { ...options, timeout };

    if (timeout > 0) {
      return this.dispatchWithTimeout(message, dispatchOptions);
    }

    return this.dispatcher.dispatch(message, dispatchOptions) as Promise<
      DispatchResult<TResult>
    >;
  }

  private validateNotDisposed(_message: Message): void {
    if (this._disposed) {
      throw new MessageBusDisposedError();
    }
  }

  private async dispatchWithTimeout<TPayload, TResult>(
    message: Message<TPayload>,
    options: DispatchOptions<TResult>,
  ): Promise<DispatchResult<TResult>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      options.timeout ?? 0,
    );
    try {
      const result = await this.dispatcher.dispatch(message, {
        ...options,
        signal: controller.signal,
      });
      return result as DispatchResult<TResult>;
    } finally {
      clearTimeout(timeoutId);
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
    const id = options.id ?? `handler:${messageType}:${Date.now()}`;
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
  ): void {
    this.dispatcher.use(middleware);
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
