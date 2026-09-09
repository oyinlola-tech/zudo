/**
 * In-memory handler registry implementation.
 *
 * @module handlerRegistry/handlerRegistryStore
 */

import type {
  HandlerRegistryOptions,
  RegisteredHandler,
  HandlerQueryOptions,
} from "./handlerRegistryType.type.js";

import type { NamedMessageHandler } from "../messageHandler/messageHandlerType.type.js";

import type { Message } from "../message/messageType.type.js";

import {
  createMessageError,
  DuplicateMessageHandlerError,
  ErrorCode,
} from "@zudojs/errors";

/**
 * In-memory store for registered message handlers.
 */
export class HandlerRegistryStore {
  private readonly handlers = new Map<string, RegisteredHandler>();
  private readonly handlersByType = new Map<string, Set<string>>();
  private readonly options: HandlerRegistryOptions;

  constructor(options: HandlerRegistryOptions = {}) {
    this.options = {
      allowDuplicateHandlerIds: false,
      allowMultipleHandlers: true,
      ...options,
    };
  }

  register<TMessage extends Message, TResult>(
    handler: NamedMessageHandler<TMessage, TResult>,
  ): void {
    this.validateNotDuplicate(handler.id);
    this.validateSingleHandlerPerType(handler);
    const entry: RegisteredHandler<TMessage, TResult> = {
      handler,
      registeredAt: new Date(),
    };
    this.handlers.set(handler.id, entry as RegisteredHandler);
    this.indexHandlerTypes(handler);
  }

  private validateNotDuplicate(handlerId: string): void {
    if (
      !this.options.allowDuplicateHandlerIds &&
      this.handlers.has(handlerId)
    ) {
      throw new DuplicateMessageHandlerError(handlerId);
    }
  }

  /**
   * Rejects a second handler for a type when the registry is single-handler.
   *
   * `allowMultipleHandlers` was stored and never read, so a registry created
   * with `allowMultipleHandlers: false` silently fanned a command out to
   * every handler that had claimed its type.
   *
   * @throws {MessageError} when the type already has a handler.
   */
  private validateSingleHandlerPerType<TMessage extends Message, TResult>(
    handler: NamedMessageHandler<TMessage, TResult>,
  ): void {
    if (this.options.allowMultipleHandlers !== false) return;

    for (const messageType of handler.messageTypes) {
      const existing = this.handlersByType.get(messageType);
      const taken = existing && existing.size > 0 ? [...existing][0] : undefined;
      if (taken !== undefined) {
        throw createMessageError(
          `Message type "${messageType}" already has handler "${taken}" and the registry does not allow multiple handlers.`,
          {
            code: ErrorCode.CONFLICT,
            messageType,
            handlerId: handler.id,
          },
        );
      }
    }
  }

  private indexHandlerTypes<TMessage extends Message, TResult>(
    handler: NamedMessageHandler<TMessage, TResult>,
  ): void {
    for (const messageType of handler.messageTypes) {
      let typeSet = this.handlersByType.get(messageType);
      if (typeSet === undefined) {
        typeSet = new Set();
        this.handlersByType.set(messageType, typeSet);
      }
      typeSet.add(handler.id);
    }
  }

  unregister(handlerId: string): boolean {
    const entry = this.handlers.get(handlerId);
    if (entry === undefined) return false;
    this.removeHandlerFromTypeIndex(entry);
    this.handlers.delete(handlerId);
    return true;
  }

  private removeHandlerFromTypeIndex(entry: RegisteredHandler): void {
    for (const messageType of entry.handler.messageTypes) {
      const typeSet = this.handlersByType.get(messageType);
      if (typeSet !== undefined) {
        typeSet.delete(entry.handler.id);
        if (typeSet.size === 0) this.handlersByType.delete(messageType);
      }
    }
  }

  resolve<TResult>(
    messageType: string,
    options: HandlerQueryOptions = {},
  ): NamedMessageHandler<Message, TResult>[] {
    const handlerIds = this.handlersByType.get(messageType);
    if (handlerIds === undefined || handlerIds.size === 0) return [];
    return this.buildHandlerList(handlerIds, options);
  }

  private buildHandlerList<TResult>(
    handlerIds: Set<string>,
    options: HandlerQueryOptions,
  ): NamedMessageHandler<Message, TResult>[] {
    const result: NamedMessageHandler<Message, TResult>[] = [];
    for (const handlerId of handlerIds) {
      const entry = this.handlers.get(handlerId);
      if (entry === undefined) continue;
      if (this.shouldExcludeHandler(entry.handler, options)) continue;
      result.push(entry.handler as NamedMessageHandler<Message, TResult>);
    }
    return result.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }

  private shouldExcludeHandler(
    handler: NamedMessageHandler,
    options: HandlerQueryOptions,
  ): boolean {
    if (options.includeDisabled !== true && handler.enabled === false)
      return true;
    if (
      options.maxPriority !== undefined &&
      (handler.priority ?? 100) > options.maxPriority
    )
      return true;
    return false;
  }

  get<TResult>(
    handlerId: string,
  ): NamedMessageHandler<Message, TResult> | undefined {
    return this.handlers.get(handlerId)?.handler as
      NamedMessageHandler<Message, TResult> | undefined;
  }

  has(handlerId: string): boolean {
    return this.handlers.has(handlerId);
  }

  getHandlerIds(): string[] {
    return Array.from(this.handlers.keys());
  }

  getRegisteredTypes(): string[] {
    return Array.from(this.handlersByType.keys());
  }

  get size(): number {
    return this.handlers.size;
  }

  clear(): void {
    this.handlers.clear();
    this.handlersByType.clear();
  }
}
