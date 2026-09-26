import type { Command, Query } from "../cqrsTypes/cqrsTypes.type.js";

import { HandlerConfigurationError } from "../cqrsErrors/cqrsError.base.js";

import { assertHandlerType } from "../cqrsValidation/cqrsValidation.core.js";

/**
 * Metadata key used to identify CQRS handler configuration.
 */
const CQRS_HANDLER_METADATA = Symbol.for("zudojs.cqrs.handler");

/**
 * Metadata key used to identify command handler configuration.
 */
const COMMAND_HANDLER_METADATA = Symbol.for("zudojs.cqrs.command-handler");

/**
 * Metadata key used to identify query handler configuration.
 */
const QUERY_HANDLER_METADATA = Symbol.for("zudojs.cqrs.query-handler");

/**
 * Metadata key used to identify command/query type information.
 */
const CQRS_TYPE_METADATA = Symbol.for("zudojs.cqrs.type");

/**
 * Supported CQRS handler kinds.
 */
export type CqrsHandlerKind = "command" | "query";

/**
 * Metadata attached to a CQRS handler class.
 */
export interface CqrsHandlerMetadata {
  readonly kind: CqrsHandlerKind;
  readonly type: string;
}

/**
 * Metadata attached to a command handler.
 */
export interface CommandHandlerMetadata<
  TCommand extends Command = Command,
> extends CqrsHandlerMetadata {
  readonly kind: "command";
  readonly type: TCommand["type"];
}

/**
 * Metadata attached to a query handler.
 */
export interface QueryHandlerMetadata<
  TQuery extends Query = Query,
> extends CqrsHandlerMetadata {
  readonly kind: "query";
  readonly type: TQuery["type"];
}

/**
 * Generic constructor type used by decorators.
 */
export type CqrsClass<TInstance = object> = new (
  ...args: unknown[]
) => TInstance;

/**
 * Constructor decorated with CQRS metadata.
 */
export type DecoratedCqrsClass<TInstance = object> = CqrsClass<TInstance> & {
  readonly [CQRS_HANDLER_METADATA]?: CqrsHandlerMetadata;
  readonly [COMMAND_HANDLER_METADATA]?: CommandHandlerMetadata;
  readonly [QUERY_HANDLER_METADATA]?: QueryHandlerMetadata;
  readonly [CQRS_TYPE_METADATA]?: string;
};

/**
 * Marks a class as a CQRS handler.
 *
 * This decorator is useful when a framework or dependency injection
 * container needs to discover handlers automatically.
 */
export function CqrsHandler<TType extends string>(
  kind: CqrsHandlerKind,
  type: TType,
): ClassDecorator {
  validateHandlerMetadata(kind, type);

  return (target) => {
    const constructor = target as unknown as DecoratedCqrsClass;

    const metadata: CqrsHandlerMetadata = Object.freeze({
      kind,
      type,
    });

    defineMetadata(constructor, CQRS_HANDLER_METADATA, metadata);

    defineMetadata(constructor, CQRS_TYPE_METADATA, type);
  };
}

/**
 * Marks a class as the command handler for `type`.
 *
 * Named `CommandHandlerFor` so it does not collide with the abstract
 * `CommandHandler` class exported from the same package.
 *
 * The mark is metadata only: no bus reads it. Registration is explicit —
 * `commandBus.register(type, new Handler())` — or driven from the mark
 * with `registerDecoratedHandlers`. The decorator is typed as a legacy
 * `ClassDecorator` and also works as a standard (TC39) class decorator,
 * whose second argument it ignores.
 */
export function CommandHandlerFor<TType extends string>(
  type: TType,
): ClassDecorator {
  validateHandlerMetadata("command", type);

  return (target) => {
    const constructor = target as unknown as DecoratedCqrsClass;

    const metadata: CommandHandlerMetadata = Object.freeze({
      kind: "command",
      type,
    });

    defineMetadata(constructor, COMMAND_HANDLER_METADATA, metadata);

    defineMetadata(constructor, CQRS_HANDLER_METADATA, metadata);

    defineMetadata(constructor, CQRS_TYPE_METADATA, type);
  };
}

/**
 * Marks a class as the query handler for `type`.
 *
 * Named `QueryHandlerFor` so it does not collide with the abstract
 * `QueryHandler` class exported from the same package. See
 * {@link CommandHandlerFor} for how the mark is consumed.
 */
export function QueryHandlerFor<TType extends string>(
  type: TType,
): ClassDecorator {
  validateHandlerMetadata("query", type);

  return (target) => {
    const constructor = target as unknown as DecoratedCqrsClass;

    const metadata: QueryHandlerMetadata = Object.freeze({
      kind: "query",
      type,
    });

    defineMetadata(constructor, QUERY_HANDLER_METADATA, metadata);

    defineMetadata(constructor, CQRS_HANDLER_METADATA, metadata);

    defineMetadata(constructor, CQRS_TYPE_METADATA, type);
  };
}

/**
 * Reads metadata the class itself was decorated with.
 *
 * Only own metadata counts. A subclass of a decorated handler used to
 * inherit the parent's mark through the prototype chain, so discovery
 * reported both classes as the handler for the same type and registered
 * the type twice; a subclass is a handler only when it is decorated itself.
 */
function ownMetadata<TValue>(
  target: unknown,
  key: symbol,
): TValue | undefined {
  if (typeof target !== "function") {
    return undefined;
  }

  if (!Object.prototype.hasOwnProperty.call(target, key)) {
    return undefined;
  }

  return (target as unknown as Record<symbol, TValue | undefined>)[key];
}

/**
 * Reads generic CQRS handler metadata from a class.
 */
export function getCqrsHandlerMetadata(
  target: unknown,
): CqrsHandlerMetadata | undefined {
  return ownMetadata<CqrsHandlerMetadata>(target, CQRS_HANDLER_METADATA);
}

/**
 * Reads command handler metadata from a class.
 */
export function getCommandHandlerMetadata(
  target: unknown,
): CommandHandlerMetadata | undefined {
  return ownMetadata<CommandHandlerMetadata>(target, COMMAND_HANDLER_METADATA);
}

/**
 * Reads query handler metadata from a class.
 */
export function getQueryHandlerMetadata(
  target: unknown,
): QueryHandlerMetadata | undefined {
  return ownMetadata<QueryHandlerMetadata>(target, QUERY_HANDLER_METADATA);
}

/**
 * Reads the CQRS type discriminator from a class.
 */
export function getCqrsType(target: unknown): string | undefined {
  return ownMetadata<string>(target, CQRS_TYPE_METADATA);
}

/**
 * Determines whether a class is decorated as a CQRS handler.
 */
export function isCqrsHandler(target: unknown): boolean {
  return getCqrsHandlerMetadata(target) !== undefined;
}

/**
 * Determines whether a class is decorated with `CommandHandlerFor`.
 */
export function isDecoratedCommandHandler(target: unknown): boolean {
  return getCommandHandlerMetadata(target) !== undefined;
}

/**
 * Determines whether a class is decorated with `QueryHandlerFor`.
 */
export function isDecoratedQueryHandler(target: unknown): boolean {
  return getQueryHandlerMetadata(target) !== undefined;
}

/**
 * Creates a reusable command handler decorator.
 */
export function createCommandHandlerDecorator<TType extends string>(
  type: TType,
): ClassDecorator {
  return CommandHandlerFor(type);
}

/**
 * Creates a reusable query handler decorator.
 */
export function createQueryHandlerDecorator<TType extends string>(
  type: TType,
): ClassDecorator {
  return QueryHandlerFor(type);
}

/**
 * Validates decorator arguments.
 */
function validateHandlerMetadata(kind: CqrsHandlerKind, type: string): void {
  assertHandlerType(kind, type);
}

/**
 * Defines immutable metadata on a constructor.
 *
 * Re-applying a decorator that carries identical metadata is a no-op, so
 * stacking `CqrsHandler("command", "A")` with `CommandHandlerFor("A")`
 * works. Conflicting metadata throws `HandlerConfigurationError`.
 */
function defineMetadata(
  constructor: DecoratedCqrsClass,
  key: symbol,
  value: CqrsHandlerMetadata | string,
): void {
  if (Object.prototype.hasOwnProperty.call(constructor, key)) {
    const existing = (constructor as unknown as Record<symbol, unknown>)[key];

    if (isSameMetadata(existing, value)) {
      return;
    }

    throw new HandlerConfigurationError(
      `Class "${constructor.name || "<anonymous>"}" already carries conflicting CQRS handler metadata (${describeMetadata(existing)} vs ${describeMetadata(value)}).`,
      {
        className: constructor.name,
        existing: describeMetadata(existing),
        incoming: describeMetadata(value),
      },
    );
  }

  Object.defineProperty(constructor, key, {
    configurable: false,
    enumerable: false,
    writable: false,
    value,
  });
}

/**
 * Compares two metadata values structurally.
 */
function isSameMetadata(existing: unknown, incoming: unknown): boolean {
  if (typeof incoming === "string") {
    return existing === incoming;
  }

  if (typeof existing !== "object" || existing === null) {
    return false;
  }

  const current = existing as Partial<CqrsHandlerMetadata>;

  return (
    current.kind === (incoming as CqrsHandlerMetadata).kind &&
    current.type === (incoming as CqrsHandlerMetadata).type
  );
}

/**
 * Renders metadata for error messages.
 */
function describeMetadata(value: unknown): string {
  if (typeof value === "string") {
    return `"${value}"`;
  }

  if (typeof value === "object" && value !== null) {
    const metadata = value as Partial<CqrsHandlerMetadata>;

    return `${String(metadata.kind)}:"${String(metadata.type)}"`;
  }

  return String(value);
}
