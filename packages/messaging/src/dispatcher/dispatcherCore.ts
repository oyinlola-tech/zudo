/**
 * Dispatcher implementation for Zudojs.
 *
 * @module dispatcher/dispatcherCore
 */

import type { Message } from "../message/messageType.type.js";
import type { MessageContext } from "../messageContext/messageContextType.type.js";

import type {
  MessageMiddlewareLike,
  MessageMiddlewareOptions,
  RegisteredMessageMiddleware,
} from "../messageMiddleware/messageMiddlewareType.type.js";

import type { NamedMessageHandler } from "../messageHandler/messageHandlerType.type.js";

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
  MessageMiddlewareError,
  MessageTimeoutError,
  MessageBusDisposedError,
} from "@zudojs/errors";

/** Default priority for middleware that does not declare one. */
const DEFAULT_MIDDLEWARE_PRIORITY = 100;

/**
 * Default dispatcher implementation.
 */
export class DefaultDispatcher implements Dispatcher {
  private readonly registry: HandlerRegistryStore;

  /**
   * Registered global middleware, in registration order.
   *
   * Held as {@link RegisteredMessageMiddleware} rather than bare functions:
   * without an identity, `removeMiddleware` had nothing to match on and
   * unconditionally returned false, and the `priority` the interface accepts
   * had nowhere to live.
   */
  private readonly globalMiddleware: RegisteredMessageMiddleware[] = [];

  private middlewareSequence = 0;

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
    const timeout = options.timeout ?? 0;
    const controller = new AbortController();
    const { signal, release } = this.resolveSignal(options.signal, controller);
    const context = createMessageContext(message, {
      ...options.context,
      signal,
    });
    const ordered = this.orderedMiddleware();
    const perDispatch = options.middleware ?? [];
    const allMiddleware = [
      ...ordered.map((entry) => entry.middleware),
      ...perDispatch,
    ];
    const middlewareIds = [
      ...ordered.map((entry) => entry.id),
      ...perDispatch.map((_mw, index) => `dispatch:${index}`),
    ];
    const handlers = this.registry.resolve(message.type);
    const handlerResults: HandlerExecutionResult[] = [];

    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      const run = runMessagePipeline(
        allMiddleware,
        // Handlers receive the same context the middleware saw: the one
        // built from `DispatchOptions.context` (headers, state, correlation
        // overrides) plus anything a middleware put into `state`. A fresh
        // context per handler used to drop all of that on the floor.
        async (msg, mwCtx) =>
          this.executeHandlers(msg, handlers, handlerResults, mwCtx.context),
        message,
        {
          signal: context.signal,
          metadata: context.headers,
          state: context.state,
          middlewareIds,
          context,
        },
      );

      // `DispatchOptions.timeout` was documented on the dispatcher but only
      // ever honoured by the bus wrapper, so anyone holding a dispatcher
      // directly got no timeout at all.
      const pipelineResult =
        timeout > 0
          ? await Promise.race([
              run,
              this.timeoutRejection(message, timeout, controller, (t) => {
                timer = t;
              }),
            ])
          : await run;

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
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      // Detach from the caller's signal, otherwise a long-lived signal
      // shared across dispatches accumulates one listener per dispatch.
      release();
    }
  }

  /** A promise that rejects with {@link MessageTimeoutError} and aborts. */
  private timeoutRejection(
    message: Message,
    timeout: number,
    controller: AbortController,
    keepTimer: (timer: ReturnType<typeof setTimeout>) => void,
  ): Promise<never> {
    return new Promise<never>((_resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new MessageTimeoutError(timeout, {
          messageType: message.type,
          messageId: message.id,
        });
        // Abort first so a handler watching its signal can wind down rather
        // than running on past the dispatch that gave up on it.
        controller.abort(error);
        reject(error);
      }, timeout);
      if (timer.unref) timer.unref();
      keepTimer(timer);
    });
  }

  /** Global middleware ordered by priority, with disabled entries dropped. */
  private orderedMiddleware(): readonly RegisteredMessageMiddleware[] {
    return this.globalMiddleware
      .filter((entry) => entry.enabled)
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => a.entry.priority - b.entry.priority || a.index - b.index)
      .map(({ entry }) => entry);
  }

  private validateNotDisposed(_message: Message): void {
    if (this.disposed) throw new MessageBusDisposedError();
  }

  /**
   * Resolves the signal handlers observe.
   *
   * The dispatcher's own controller is chained to the caller's signal so a
   * timeout can abort the work without the caller losing its own cancellation.
   */
  private resolveSignal(
    signal: AbortSignal | undefined,
    controller: AbortController,
  ): { signal: AbortSignal; release: () => void } {
    if (signal?.aborted) throw new MessageDispatchAbortedError();
    if (!signal) {
      return { signal: controller.signal, release: () => {} };
    }
    const onAbort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    return {
      signal: controller.signal,
      release: () => signal.removeEventListener("abort", onAbort),
    };
  }

  private async executeHandlers<TResult>(
    message: Message,
    handlers: readonly NamedMessageHandler<Message, unknown>[],
    handlerResults: HandlerExecutionResult[],
    context: MessageContext,
  ): Promise<TResult> {
    const results: TResult[] = [];
    for (const handler of handlers) {
      // A dispatch cancelled between handlers is reported as an abort, not
      // as a failure of the handler that never got to run.
      if (context.signal.aborted) {
        throw new MessageDispatchAbortedError(undefined, {
          messageType: message.type,
          messageId: message.id,
        });
      }
      const start = performance.now();
      try {
        const result = await this.executeHandler(handler, message, context);
        results.push(result as TResult);
        handlerResults.push({
          handlerId: handler.id,
          success: true,
          value: result,
          duration: performance.now() - start,
        });
      } catch (error) {
        // A failing handler used to leave no trace at all in handlerResults,
        // so a caller inspecting them could not tell which handler broke.
        handlerResults.push({
          handlerId: handler.id,
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
          duration: performance.now() - start,
        });
        throw error;
      }
    }
    return results.length === 1 ? results[0]! : (results as unknown as TResult);
  }

  private async executeHandler(
    handler: NamedMessageHandler<Message, unknown>,
    message: Message,
    context: MessageContext,
  ): Promise<unknown> {
    try {
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

  /**
   * Registers global middleware.
   *
   * @param middleware - The middleware to register.
   * @param options - Identity, priority and enablement.
   * @returns The identifier {@link DefaultDispatcher.removeMiddleware} takes.
   * @throws {MessageMiddlewareError} when the requested id is already taken.
   */
  use<TMessage extends Message = Message, TResult = unknown>(
    middleware: MessageMiddlewareLike<TMessage, TResult>,
    options: MessageMiddlewareOptions = {},
  ): string {
    const id = options.id ?? `middleware:${++this.middlewareSequence}`;

    if (this.globalMiddleware.some((entry) => entry.id === id)) {
      throw new MessageMiddlewareError(
        `Middleware "${id}" is already registered.`,
        { middlewareId: id },
      );
    }

    const entry: RegisteredMessageMiddleware = {
      id,
      priority: options.priority ?? DEFAULT_MIDDLEWARE_PRIORITY,
      enabled: options.enabled ?? true,
      middleware: middleware as MessageMiddlewareLike,
      ...(options.description !== undefined
        ? { description: options.description }
        : {}),
    };
    this.globalMiddleware.push(entry);
    return id;
  }

  /**
   * Removes previously registered global middleware.
   *
   * @param middlewareId - The id returned by {@link DefaultDispatcher.use}.
   * @returns Whether a registration was removed.
   */
  removeMiddleware(middlewareId: string): boolean {
    const index = this.globalMiddleware.findIndex(
      (entry) => entry.id === middlewareId,
    );
    if (index === -1) return false;
    this.globalMiddleware.splice(index, 1);
    return true;
  }

  /** The ids of every registered global middleware, in priority order. */
  listMiddleware(): readonly string[] {
    return this.globalMiddleware
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => a.entry.priority - b.entry.priority || a.index - b.index)
      .map(({ entry }) => entry.id);
  }

  getRegistry(): HandlerRegistryStore {
    return this.registry;
  }

  dispose(): void {
    this.disposed = true;
    this.globalMiddleware.length = 0;
  }
}

export function createDispatcher(registry?: HandlerRegistryStore): Dispatcher {
  return new DefaultDispatcher(registry);
}
