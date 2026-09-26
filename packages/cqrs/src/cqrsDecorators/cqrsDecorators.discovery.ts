/**
 * Turning decorated handler instances into registrations.
 *
 * `CommandHandlerFor` / `QueryHandlerFor` only mark a class; no bus reads
 * the mark. These helpers close the loop: given handler instances, they
 * read the mark off each instance's class and register it, so the type a
 * handler is decorated with is the type it is registered under.
 *
 * @module cqrsDecorators/discovery
 */

import type {
  CommandHandlerLike,
  QueryHandlerLike,
} from "../cqrsTypes/cqrsTypes.type.js";

import type { HandlerEntry } from "../handlerRegistry/handlerRegistry.core.js";

import { HandlerConfigurationError } from "../cqrsErrors/cqrsError.base.js";

import { getCqrsHandlerMetadata } from "./cqrsDecorators.core.js";

/**
 * Where decorated handlers are registered: a `HandlerRegistry` (anything
 * with `register(entry)`), or the command and query buses themselves.
 */
export type DecoratedHandlerTarget =
  | { register(entry: HandlerEntry): unknown }
  | {
      readonly commandBus?: {
        register(type: string, handler: CommandHandlerLike): unknown;
      };
      readonly queryBus?: {
        register(type: string, handler: QueryHandlerLike): unknown;
      };
    };

/**
 * Reads the registrations a set of decorated handler instances stand for.
 *
 * @throws HandlerConfigurationError for an instance whose class carries no
 *   CQRS mark, so a handler that lost its decorator does not vanish quietly.
 */
export function collectDecoratedHandlers(
  handlers: readonly object[],
): readonly HandlerEntry[] {
  return handlers.map((handler) => {
    const constructor = (handler as { readonly constructor?: unknown })
      .constructor;

    const metadata = getCqrsHandlerMetadata(constructor);

    if (metadata === undefined) {
      const name =
        typeof constructor === "function" && constructor.name
          ? constructor.name
          : "<anonymous>";

      throw new HandlerConfigurationError(
        `Class "${name}" is not decorated with CommandHandlerFor, QueryHandlerFor or CqrsHandler.`,
        { className: name },
      );
    }

    return metadata.kind === "command"
      ? {
          kind: "command",
          type: metadata.type,
          handler: handler as CommandHandlerLike,
        }
      : { kind: "query", type: metadata.type, handler: handler as QueryHandlerLike };
  });
}

/**
 * Registers decorated handler instances on a registry or on buses.
 *
 * Each instance is registered under the type its class was decorated
 * with. Duplicate and malformed registrations fail exactly as a direct
 * `register` call would.
 *
 * @example
 * ```ts
 * @CommandHandlerFor("PlaceOrder")
 * class PlaceOrderHandler { execute(command: PlaceOrder) { ... } }
 *
 * registerDecoratedHandlers({ commandBus, queryBus }, [new PlaceOrderHandler()]);
 * ```
 */
export function registerDecoratedHandlers(
  target: DecoratedHandlerTarget,
  handlers: readonly object[],
): readonly HandlerEntry[] {
  const entries = collectDecoratedHandlers(handlers);

  for (const entry of entries) {
    if ("register" in target) {
      target.register(entry);
      continue;
    }

    const bus = entry.kind === "command" ? target.commandBus : target.queryBus;

    if (bus === undefined) {
      throw new HandlerConfigurationError(
        `No ${entry.kind} bus was supplied for handler type "${entry.type}".`,
        { kind: entry.kind, type: entry.type },
      );
    }

    if (entry.kind === "command") {
      (bus as { register(type: string, handler: CommandHandlerLike): unknown })
        .register(entry.type, entry.handler);
    } else {
      (bus as { register(type: string, handler: QueryHandlerLike): unknown })
        .register(entry.type, entry.handler);
    }
  }

  return entries;
}
