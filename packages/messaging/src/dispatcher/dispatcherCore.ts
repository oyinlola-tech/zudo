/**
 * Dispatcher implementation for Zudojs.
 *
 * @module dispatcher/dispatcherCore
 */

import type { Message } from "../message/messageType.type.js";

import type { MessageMiddlewareLike } from "../messageMiddleware/messageMiddlewareType.type.js";

import type {
  Dispatcher,
  DispatchResult,
  DispatchOptions,
  HandlerExecutionResult,
} from "./dispatcherType.type.js";

import { createMessageContext } from "../messageContext/messageContextType.type.js";
import { HandlerRegistryStore } from "../handlerRegistry/handlerRegistryStore.js";
import { runMessagePipeline } from "../messageMiddleware/messageMiddlewarePipeline.js";
import {
  MessageDispatchAbortedError,
  MessageHandlerError,
  MessageBusDisposedError,
} from "@zudojs/errors";

/**
 * Default dispatcher implementation.
 */
export class DefaultDispatcher implements Dispatcher {
  private readonly registry: HandlerRegistryStore;
  private readonly globalMiddleware: MessageMiddlewareLike[] = [];
  private disposed = false;

  constructor(registry?: HandlerRegistryStore) {
    this.registry = registry ?? new HandlerRegistryStore();
  }

  async dispatch<TPayload, TResult>(
    message: Message<TPayload>,
    options: DispatchOptions<TResult> = {},
  ): Promise<DispatchResult<TResult>> {
    const dispatchStart = performance.now();
    this.validateNotDisposed(message);
    const signal = this.resolveSignal(options.signal);
    const context = createMessageContext(message, {
      ...options.context,
      signal,
    });
    const allMiddleware = [
      ...this.globalMiddleware,
      ...(options.middleware ?? []),
    ];
    const handlers = this.registry.resolve(message.type);
    const handlerResults: HandlerExecutionResult[] = [];

    try {
      const pipelineResult = await runMessagePipeline(
        allMiddleware,
        async (msg, mwCtx) =>
          this.executeHandlers(msg, handlers, handlerResults, mwCtx.signal),
        message,
        {
          signal: context.signal,
          metadata: options.context?.headers as Record<string, unknown>,
          state: options.context?.state,
        },
      );

      return {
        success: true,
        value: pipelineResult.result as TResult,
        message,
        context,
        handlerResults,
        middlewareResult: pipelineResult,
        duration: performance.now() - dispatchStart,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        message,
        context,
        handlerResults,
        duration: performance.now() - dispatchStart,
      };
    }
  }

  private validateNotDisposed(_message: Message): void {
    if (this.disposed) throw new MessageBusDisposedError();
  }

  private resolveSignal(signal?: AbortSignal): AbortSignal {
    const resolved = signal ?? new AbortController().signal;
    if (resolved.aborted) throw new MessageDispatchAbortedError();
    return resolved;
  }

  private async executeHandlers<TResult>(
    message: Message,
    handlers: ReturnType<HandlerRegistryStore["resolve"]>,
    handlerResults: HandlerExecutionResult[],
    signal: AbortSignal,
  ): Promise<TResult> {
    const results: TResult[] = [];
    for (const handler of handlers) {
      const result = await this.executeHandler(handler, message, signal);
      results.push(result as TResult);
      handlerResults.push({
        handlerId: handler.id,
        success: true,
        value: result,
        duration: 0,
      });
    }
    return results.length === 1 ? results[0]! : (results as unknown as TResult);
  }

  private async executeHandler(
    handler: ReturnType<HandlerRegistryStore["resolve"]>[number],
    message: Message,
    signal: AbortSignal,
  ): Promise<unknown> {
    try {
      if (signal.aborted) throw new MessageDispatchAbortedError();
      const context = createMessageContext(message, { signal });
      return await handler.handler(message, context);
    } catch (error) {
      throw new MessageHandlerError(
        `Handler "${handler.id}" failed: ${error instanceof Error ? error.message : String(error)}`,
        {
          handlerId: handler.id,
          messageType: message.type,
          messageId: message.id,
          cause: error,
        },
      );
    }
  }

  use<TMessage extends Message = Message, TResult = unknown>(
    middleware: MessageMiddlewareLike<TMessage, TResult>,
  ): void {
    this.globalMiddleware.push(middleware as MessageMiddlewareLike);
  }

  removeMiddleware(_middlewareId: string): boolean {
    return false;
  }

  getRegistry(): HandlerRegistryStore {
    return this.registry;
  }

  dispose(): void {
    this.disposed = true;
  }
}

export function createDispatcher(registry?: HandlerRegistryStore): Dispatcher {
  return new DefaultDispatcher(registry);
}
