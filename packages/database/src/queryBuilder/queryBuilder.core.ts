import type {
  QueryOperator,
  QueryCondition,
  QueryFilter,
  QueryBuilderState,
  PaginationInput,
  SortDirection,
  SortInput,
  QueryOptions,
} from "./queryBuilder.type.js";

import { cloneFilter } from "./queryBuilder.filter.js";
import {
  type PrismaQueryArgs,
  type ToPrismaArgsOptions,
  toPrismaArgs,
} from "./queryBuilder.prisma.js";
import {
  type RelationInclude,
  includeRelation,
} from "../relations/relations.definition.js";

/**
 * Query builder used to construct database-neutral query definitions.
 *
 * The builder does not execute queries. It produces a plain query
 * definition that repositories or adapters can translate into their
 * ORM-specific representation.
 */
export class QueryBuilder<TField extends string = string> {
  private filterState?: QueryFilter;

  private paginationState?: PaginationInput;

  private sortState: SortInput<TField>[] = [];

  private selectState: TField[] = [];

  private offsetState?: number;

  private includeState: RelationInclude[] = [];

  private _cachedBuild?: QueryBuilderState<TField>;

  private invalidateCache(): void {
    this._cachedBuild = undefined;
  }

  /**
   * Adds an equality condition.
   */
  public where(field: TField, value: unknown): this {
    return this.addCondition({
      field,
      operator: "equals",
      value,
    });
  }

  /**
   * Adds a condition using a specific operator.
   */
  public whereOperator(
    field: TField,
    operator: QueryOperator,
    value?: unknown,
  ): this {
    return this.addCondition({
      field,
      operator,
      value,
    });
  }

  /**
   * Adds a not-equal condition.
   */
  public whereNot(field: TField, value: unknown): this {
    return this.whereOperator(field, "not", value);
  }

  /**
   * Adds an IN condition.
   */
  public whereIn(field: TField, values: readonly unknown[]): this {
    return this.whereOperator(field, "in", [...values]);
  }

  /**
   * Adds a NOT IN condition.
   */
  public whereNotIn(field: TField, values: readonly unknown[]): this {
    return this.whereOperator(field, "notIn", [...values]);
  }

  /**
   * Adds a less-than condition.
   */
  public whereLessThan(field: TField, value: unknown): this {
    return this.whereOperator(field, "lt", value);
  }

  /**
   * Adds a less-than-or-equal condition.
   */
  public whereLessThanOrEqual(field: TField, value: unknown): this {
    return this.whereOperator(field, "lte", value);
  }

  /**
   * Adds a greater-than condition.
   */
  public whereGreaterThan(field: TField, value: unknown): this {
    return this.whereOperator(field, "gt", value);
  }

  /**
   * Adds a greater-than-or-equal condition.
   */
  public whereGreaterThanOrEqual(field: TField, value: unknown): this {
    return this.whereOperator(field, "gte", value);
  }

  /**
   * Adds a contains condition.
   */
  public whereContains(field: TField, value: string): this {
    return this.whereOperator(field, "contains", value);
  }

  /**
   * Adds a starts-with condition.
   */
  public whereStartsWith(field: TField, value: string): this {
    return this.whereOperator(field, "startsWith", value);
  }

  /**
   * Adds an ends-with condition.
   */
  public whereEndsWith(field: TField, value: string): this {
    return this.whereOperator(field, "endsWith", value);
  }

  /**
   * Adds an IS NULL condition.
   */
  public whereNull(field: TField): this {
    return this.whereOperator(field, "isNull");
  }

  /**
   * Adds an IS NOT NULL condition.
   */
  public whereNotNull(field: TField): this {
    return this.whereOperator(field, "isNotNull");
  }

  /**
   * Adds an AND group.
   */
  public and(...filters: QueryFilter[]): this {
    const existing = this.filterState;

    const group: QueryFilter = {
      and: filters,
    };

    this.filterState = existing
      ? {
          and: [existing, group],
        }
      : group;

    this.invalidateCache();

    return this;
  }

  /**
   * Adds an OR group.
   */
  public or(...filters: QueryFilter[]): this {
    const existing = this.filterState;

    const group: QueryFilter = {
      or: filters,
    };

    this.filterState = existing
      ? {
          and: [existing, group],
        }
      : group;

    this.invalidateCache();

    return this;
  }

  /**
   * Adds a NOT group.
   */
  public not(filter: QueryFilter): this {
    const existing = this.filterState;

    const group: QueryFilter = {
      not: filter,
    };

    this.filterState = existing
      ? {
          and: [existing, group],
        }
      : group;

    this.invalidateCache();

    return this;
  }

  /**
   * Sets the requested page.
   */
  public page(page: number): this {
    this.paginationState = {
      ...this.paginationState,
      page,
    };

    this.invalidateCache();

    return this;
  }

  /**
   * Sets the requested page size.
   */
  public limit(limit: number): this {
    this.paginationState = {
      ...this.paginationState,
      limit,
    };

    this.invalidateCache();

    return this;
  }

  /**
   * Sets pagination.
   */
  public paginate(pagination: PaginationInput): this {
    this.paginationState = {
      ...pagination,
    };

    this.invalidateCache();

    return this;
  }

  /**
   * Sets an explicit row offset. Takes precedence over `page()`.
   */
  public offset(offset: number): this {
    if (!Number.isFinite(offset) || offset < 0) {
      throw new TypeError("Query offset must be a non-negative number.");
    }

    this.offsetState = Math.floor(offset);

    this.invalidateCache();

    return this;
  }

  /**
   * Adds relations to include. Accepts relation names or include
   * definitions created with `includeRelation`.
   */
  public include(...relations: readonly (string | RelationInclude)[]): this {
    for (const relation of relations) {
      const include =
        typeof relation === "string" ? includeRelation(relation) : relation;

      if (!include || typeof include.relation !== "string") {
        throw new TypeError("A relation include is required.");
      }

      if (!this.includeState.some((e) => e.relation === include.relation)) {
        this.includeState.push(include);
      }
    }

    this.invalidateCache();

    return this;
  }

  /**
   * Sorts ascending by a field.
   */
  public orderByAsc(field: TField): this {
    return this.orderBy(field, "asc");
  }

  /**
   * Sorts descending by a field.
   */
  public orderByDesc(field: TField): this {
    return this.orderBy(field, "desc");
  }

  /**
   * Adds a sort definition.
   */
  public orderBy(field: TField, direction: SortDirection = "asc"): this {
    this.sortState.push({
      field,
      direction,
    });

    this.invalidateCache();

    return this;
  }

  /**
   * Replaces all sort definitions.
   */
  public sort(sort: readonly SortInput<TField>[]): this {
    this.sortState = [...sort];

    this.invalidateCache();

    return this;
  }

  /**
   * Selects specific fields.
   */
  public select(...fields: TField[]): this {
    this.selectState = [...new Set(fields)];

    this.invalidateCache();

    return this;
  }

  /**
   * Clears all filters.
   */
  public clearFilters(): this {
    this.filterState = undefined;

    this.invalidateCache();

    return this;
  }

  /**
   * Clears pagination.
   */
  public clearPagination(): this {
    this.paginationState = undefined;

    this.invalidateCache();

    return this;
  }

  /**
   * Clears sorting.
   */
  public clearSort(): this {
    this.sortState = [];

    this.invalidateCache();

    return this;
  }

  /**
   * Clears selected fields.
   */
  public clearSelect(): this {
    this.selectState = [];

    this.invalidateCache();

    return this;
  }

  /**
   * Clears included relations.
   */
  public clearInclude(): this {
    this.includeState = [];

    this.invalidateCache();

    return this;
  }

  /**
   * Resets the builder to its initial empty state.
   */
  public reset(): this {
    this.filterState = undefined;
    this.paginationState = undefined;
    this.offsetState = undefined;
    this.sortState = [];
    this.selectState = [];
    this.includeState = [];

    this.invalidateCache();

    return this;
  }

  /**
   * Returns the immutable query definition.
   */
  public build(): QueryBuilderState<TField> {
    if (this._cachedBuild) {
      return this._cachedBuild;
    }

    const result = deepFreeze({
      filter: cloneFilter(this.filterState),
      pagination: this.paginationState
        ? { ...this.paginationState }
        : undefined,
      offset: this.offsetState,
      sort:
        this.sortState.length > 0
          ? this.sortState.map((entry) => ({ ...entry }))
          : undefined,
      select: this.selectState.length > 0 ? [...this.selectState] : undefined,
      include:
        this.includeState.length > 0 ? [...this.includeState] : undefined,
    }) as QueryBuilderState<TField>;

    this._cachedBuild = result;

    return result;
  }

  /**
   * Converts the builder into generic query options (pagination, sort and
   * the built filter).
   */
  public toQueryOptions(): QueryOptions<TField> & {
    readonly filter?: QueryFilter;
    readonly offset?: number;
  } {
    return {
      filter: cloneFilter(this.filterState),
      pagination: this.paginationState
        ? { ...this.paginationState }
        : undefined,
      offset: this.offsetState,
      sort: this.sortState.length > 0 ? [...this.sortState] : undefined,
    };
  }

  /**
   * Translates the builder into Prisma `findMany`-style arguments.
   */
  public toPrismaArgs(options?: ToPrismaArgsOptions): PrismaQueryArgs {
    return toPrismaArgs(this.build(), options);
  }

  /**
   * Creates an independent copy of the builder.
   */
  public clone(): QueryBuilder<TField> {
    const builder = new QueryBuilder<TField>();

    builder.filterState = cloneFilter(this.filterState);

    builder.paginationState = this.paginationState
      ? {
          ...this.paginationState,
        }
      : undefined;

    builder.offsetState = this.offsetState;

    builder.sortState = this.sortState.map((entry) => ({ ...entry }));

    builder.selectState = [...this.selectState];

    builder.includeState = [...this.includeState];

    return builder;
  }

  /**
   * Adds a condition to the current filter.
   */
  private addCondition(condition: QueryCondition): this {
    const existing = this.filterState;

    if (!existing) {
      this.filterState = {
        conditions: [condition],
      };

      this.invalidateCache();

      return this;
    }

    if (existing.conditions && !existing.and && !existing.or && !existing.not) {
      this.filterState = {
        conditions: [...existing.conditions, condition],
      };

      this.invalidateCache();

      return this;
    }

    this.filterState = {
      and: [
        existing,
        {
          conditions: [condition],
        },
      ],
    };

    this.invalidateCache();

    return this;
  }
}

/**
 * Recursively freezes plain objects and arrays.
 */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  if (value instanceof Date) {
    return value;
  }

  Object.freeze(value);

  for (const entry of Object.values(value as Record<string, unknown>)) {
    deepFreeze(entry);
  }

  return value;
}
