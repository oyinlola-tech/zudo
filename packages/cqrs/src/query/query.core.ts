import type { Query as QueryContract } from "../cqrsTypes/cqrsTypes.type.js";
import { isCqrsRequest } from "../cqrsTypes/cqrsTypes.type.js";

/**
 * Base abstract query.
 *
 * Queries represent requests to retrieve data without changing
 * application state.
 */
export abstract class Query<
  TType extends string = string,
> implements QueryContract<TType> {
  public readonly type: TType;

  protected constructor(type: TType) {
    this.type = type;
  }
}

/**
 * Options used when constructing a concrete query.
 */
export interface QueryOptions {
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Query containing immutable metadata.
 */
export abstract class MetadataQuery<
  TType extends string = string,
> extends Query<TType> {
  public readonly metadata?: Readonly<Record<string, unknown>>;

  protected constructor(type: TType, options: QueryOptions = {}) {
    super(type);

    this.metadata = options.metadata
      ? Object.freeze({
          ...options.metadata,
        })
      : undefined;
  }
}

/**
 * Creates a simple immutable query object.
 *
 * The `type` argument always wins over any `type` key present in the
 * payload, so untrusted payloads cannot reroute the query.
 */
export function createQuery<
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
 * Returns the query type discriminator.
 */
export function getQueryType(query: QueryContract): string {
  return query.type;
}

/**
 * Determines whether a value has the basic query shape.
 *
 * Commands and queries share the same runtime discriminator shape.
 * Therefore, this helper should be used when the value is already
 * known to belong to the query pipeline.
 */
export function isQuery(value: unknown): value is QueryContract {
  return isCqrsRequest(value);
}

/**
 * Creates a query type factory.
 *
 * This is useful when defining related queries while keeping their
 * discriminator values consistent.
 */
export function queryType<TType extends string>(type: TType): () => TType {
  return () => type;
}
