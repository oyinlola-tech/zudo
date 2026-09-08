import type {
  PaginationInput,
  SortInput,
} from "../databaseType/databaseType.type.js";
import type { RelationInclude } from "../relations/relations.definition.js";

export type {
  PaginationInput,
  QueryOptions,
  SortDirection,
  SortInput,
} from "../databaseType/databaseType.type.js";

/**
 * Supported query operators.
 *
 * - `like` matches a SQL-style pattern using `%` wildcards at either end.
 * - `some` / `every` / `none` apply a nested {@link QueryFilter} to a
 *   collection relation; `is` / `isNot` apply one to a single relation.
 */
export type QueryOperator =
  | "equals"
  | "not"
  | "in"
  | "notIn"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "contains"
  | "startsWith"
  | "endsWith"
  | "like"
  | "isNull"
  | "isNotNull"
  | "some"
  | "every"
  | "none"
  | "is"
  | "isNot";

/**
 * Operators that take a nested filter targeting a relation.
 */
export type RelationOperator = "some" | "every" | "none" | "is" | "isNot";

/**
 * Generic filter condition.
 */
export interface QueryCondition {
  readonly field: string;
  readonly operator: QueryOperator;
  readonly value?: unknown;
}

/**
 * Generic logical filter.
 */
export interface QueryFilter {
  readonly conditions?: readonly QueryCondition[];
  readonly and?: readonly QueryFilter[];
  readonly or?: readonly QueryFilter[];
  readonly not?: QueryFilter;
}

/**
 * Query builder state.
 */
export interface QueryBuilderState<TField extends string = string> {
  readonly filter?: QueryFilter;
  readonly pagination?: PaginationInput;
  /**
   * Explicit row offset. Takes precedence over `pagination.page` when both
   * are present.
   */
  readonly offset?: number;
  readonly sort?: readonly SortInput<TField>[];
  readonly select?: readonly TField[];
  readonly include?: readonly RelationInclude[];
}
