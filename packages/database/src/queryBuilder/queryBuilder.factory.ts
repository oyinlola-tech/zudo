import { QueryBuilder } from "./queryBuilder.core.js";

/**
 * Creates a new query builder.
 */
export function createQueryBuilder<
  TField extends string = string,
>(): QueryBuilder<TField> {
  return new QueryBuilder<TField>();
}
