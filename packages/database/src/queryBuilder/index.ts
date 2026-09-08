/**
 * @zudojs/database — Query Builder
 *
 * Database-neutral query construction and filter helpers.
 */

export { QueryBuilder } from "./queryBuilder.core.js";

export { createQueryBuilder } from "./queryBuilder.factory.js";

export {
  toPrismaWhere,
  toPrismaArgs,
  toPrismaOrderBy,
  toPrismaSelect,
  toPrismaSkipTake,
  type PrismaWhere,
  type PrismaQueryArgs,
  type ToPrismaArgsOptions,
} from "./queryBuilder.prisma.js";

export type {
  QueryCondition,
  QueryFilter,
  QueryOperator,
  RelationOperator,
  QueryBuilderState,
} from "./queryBuilder.type.js";

export {
  equals,
  notEquals,
  inList,
  notInList,
  lessThan,
  lessThanOrEqual,
  greaterThan,
  greaterThanOrEqual,
  contains,
  startsWith,
  endsWith,
  isNull,
  isNotNull,
  and,
  or,
  not,
  condition,
  allOf,
  anyOf,
  fromObject,
  dateRange,
  oneOf,
  noneOf,
  optionalEquals,
  optionalContains,
  hasConditions,
  flattenAnd,
  cloneFilter,
  between,
  matchesPattern,
  isEmpty,
  isNotEmpty,
  dateOnly,
  isBefore,
  isAfter,
  isBetween,
  notCondition,
  relational,
} from "./queryBuilder.filter.js";
