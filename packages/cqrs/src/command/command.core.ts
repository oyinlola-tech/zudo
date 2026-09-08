import type { Command as CommandContract } from "../cqrsTypes/cqrsTypes.type.js";
import { isCqrsRequest } from "../cqrsTypes/cqrsTypes.type.js";

/**
 * Base abstract command.
 *
 * Commands represent requests to change application state.
 * Each concrete command should define a unique static type and
 * immutable command data.
 */
export abstract class Command<
  TType extends string = string,
> implements CommandContract<TType> {
  public readonly type: TType;

  protected constructor(type: TType) {
    this.type = type;
  }
}

/**
 * Options used when constructing a concrete command.
 */
export interface CommandOptions {
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Command containing immutable metadata.
 */
export abstract class MetadataCommand<
  TType extends string = string,
> extends Command<TType> {
  public readonly metadata?: Readonly<Record<string, unknown>>;

  protected constructor(type: TType, options: CommandOptions = {}) {
    super(type);

    this.metadata = options.metadata
      ? Object.freeze({
          ...options.metadata,
        })
      : undefined;
  }
}

/**
 * Creates a simple immutable command object.
 *
 * The `type` argument always wins over any `type` key present in the
 * payload, so untrusted payloads cannot reroute the command.
 */
export function createCommand<
  TType extends string,
  TPayload extends Record<string, unknown> = Record<never, never>,
>(
  type: TType,
  payload?: TPayload,
): Readonly<
  {
    readonly type: TType;
  } & Omit<TPayload, "type">
> {
  return Object.freeze({
    ...(payload ?? {}),
    type,
  }) as Readonly<
    {
      readonly type: TType;
    } & Omit<TPayload, "type">
  >;
}

/**
 * Returns the command type discriminator.
 */
export function getCommandType(command: CommandContract): string {
  return command.type;
}

/**
 * Determines whether a value is a command.
 */
export function isCommand(value: unknown): value is CommandContract {
  return isCqrsRequest(value);
}

/**
 * Creates a command type factory.
 *
 * This is useful when defining a family of related commands while
 * keeping their discriminator values consistent.
 */
export function commandType<TType extends string>(type: TType): () => TType {
  return () => type;
}
