import type {
  QueryCondition,
  QueryFilter,
  QueryOperator,
  RelationOperator,
} from "./queryBuilder.type.js";

const EMPTY_FILTER: QueryFilter = Object.freeze({
  conditions: Object.freeze([]) as readonly QueryCondition[],
});

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Creates an equality filter.
 */
export function equals(field: string, value: unknown): QueryFilter {
  return condition(field, "equals", value);
}

/**
 * Creates a not-equal filter.
 */
export function notEquals(field: string, value: unknown): QueryFilter {
  return condition(field, "not", value);
}

/**
 * Creates an IN filter.
 */
export function inList(field: string, values: readonly unknown[]): QueryFilter {
  return condition(field, "in", [...values]);
}

/**
 * Creates a NOT IN filter.
 */
export function notInList(
  field: string,
  values: readonly unknown[],
): QueryFilter {
  return condition(field, "notIn", [...values]);
}

/**
 * Creates a less-than filter.
 */
export function lessThan(field: string, value: unknown): QueryFilter {
  return condition(field, "lt", value);
}

/**
 * Creates a less-than-or-equal filter.
 */
export function lessThanOrEqual(field: string, value: unknown): QueryFilter {
  return condition(field, "lte", value);
}

/**
 * Creates a greater-than filter.
 */
export function greaterThan(field: string, value: unknown): QueryFilter {
  return condition(field, "gt", value);
}

/**
 * Creates a greater-than-or-equal filter.
 */
export function greaterThanOrEqual(field: string, value: unknown): QueryFilter {
  return condition(field, "gte", value);
}

/**
 * Creates a contains filter.
 */
export function contains(field: string, value: string): QueryFilter {
  return condition(field, "contains", value);
}

/**
 * Creates a starts-with filter.
 */
export function startsWith(field: string, value: string): QueryFilter {
  return condition(field, "startsWith", value);
}

/**
 * Creates an ends-with filter.
 */
export function endsWith(field: string, value: string): QueryFilter {
  return condition(field, "endsWith", value);
}

/**
 * Creates an IS NULL filter.
 */
export function isNull(field: string): QueryFilter {
  return condition(field, "isNull");
}

/**
 * Creates an IS NOT NULL filter.
 */
export function isNotNull(field: string): QueryFilter {
  return condition(field, "isNotNull");
}

/**
 * Combines filters using AND.
 */
export function and(...filters: readonly QueryFilter[]): QueryFilter {
  return {
    and: filters.map((filter) => cloneFilter(filter)),
  };
}

/**
 * Combines filters using OR.
 */
export function or(...filters: readonly QueryFilter[]): QueryFilter {
  return {
    or: filters.map((filter) => cloneFilter(filter)),
  };
}

/**
 * Negates a filter.
 */
export function not(filter: QueryFilter): QueryFilter {
  return {
    not: cloneFilter(filter),
  };
}

/**
 * Creates a generic filter condition.
 */
export function condition(
  field: string,
  operator: QueryOperator,
  value?: unknown,
): QueryFilter {
  validateField(field);

  const result: QueryCondition = {
    field,
    operator,
  };

  if (value !== undefined) {
    (
      result as {
        value?: unknown;
      }
    ).value = cloneValue(value);
  }

  return {
    conditions: [result],
  };
}

/**
 * Combines multiple filters with AND only when necessary.
 */
export function allOf(filters: readonly QueryFilter[]): QueryFilter {
  const normalized = filters.filter(hasConditions).map((filter) => cloneFilter(filter));

  if (normalized.length === 0) {
    return EMPTY_FILTER;
  }

  if (normalized.length === 1) {
    return normalized[0]!;
  }

  return {
    and: normalized,
  };
}

/**
 * Combines multiple filters with OR only when necessary.
 */
export function anyOf(filters: readonly QueryFilter[]): QueryFilter {
  const normalized = filters.filter(hasConditions).map((filter) => cloneFilter(filter));

  if (normalized.length === 0) {
    return EMPTY_FILTER;
  }

  if (normalized.length === 1) {
    return normalized[0]!;
  }

  return {
    or: normalized,
  };
}

/**
 * Creates a filter from a plain object.
 *
 * Every property becomes an equality condition.
 */
export function fromObject<T extends Record<string, unknown>>(
  values: T,
): QueryFilter {
  if (values === null || typeof values !== "object" || Array.isArray(values)) {
    throw new TypeError("fromObject requires a plain object.");
  }

  const conditions: QueryCondition[] = [];

  for (const [field, value] of Object.entries(values)) {
    if (FORBIDDEN_KEYS.has(field)) {
      throw new TypeError(`Invalid filter field "${field}".`);
    }

    conditions.push(...condition(field, "equals", value).conditions!);
  }

  return {
    conditions,
  };
}

/**
 * Creates filters for a date range.
 */
export function dateRange(
  field: string,
  options: {
    readonly from?: Date;
    readonly to?: Date;
  },
): QueryFilter {
  validateField(field);

  const conditions: QueryCondition[] = [];

  if (options.from) {
    validateDate(options.from, "from");

    conditions.push({
      field,
      operator: "gte",
      value: new Date(options.from.getTime()),
    });
  }

  if (options.to) {
    validateDate(options.to, "to");

    conditions.push({
      field,
      operator: "lte",
      value: new Date(options.to.getTime()),
    });
  }

  if (options.from && options.to && options.from.getTime() > options.to.getTime()) {
    throw new RangeError("dateRange requires `from` to be on or before `to`.");
  }

  return {
    conditions,
  };
}

/**
 * Creates an inclusive range filter (`field >= from AND field <= to`).
 */
export function between(
  field: string,
  from: number | string | Date | bigint,
  to: number | string | Date | bigint,
): QueryFilter {
  validateField(field);

  validateRangeBound(from, "from");

  validateRangeBound(to, "to");

  if (compareBounds(from, to) > 0) {
    throw new RangeError("between requires `from` to be on or before `to`.");
  }

  return {
    conditions: [
      {
        field,
        operator: "gte",
        value: cloneValue(from),
      },
      {
        field,
        operator: "lte",
        value: cloneValue(to),
      },
    ],
  };
}

/**
 * Creates a SQL-style pattern filter using `%` wildcards.
 *
 * Only leading and/or trailing wildcards are supported (`%abc%`, `abc%`,
 * `%abc`); the pattern is translated to `contains`, `startsWith`,
 * `endsWith` or `equals` when converted for an ORM.
 */
export function matchesPattern(field: string, pattern: string): QueryFilter {
  if (typeof pattern !== "string" || pattern.length === 0) {
    throw new TypeError("A pattern is required.");
  }

  // The lookbehind pins the trailing match to the start of a `%` run; plain
  // `%+$` retries from every `%` in an interior run, which is quadratic.
  const inner = pattern.replace(/^%+/, "").replace(/(?<!%)%+$/, "");

  if (inner.length === 0 || inner.includes("%") || inner.includes("_")) {
    throw new TypeError(
      "matchesPattern only supports leading and/or trailing % wildcards.",
    );
  }

  return condition(field, "like", pattern);
}

/**
 * Creates a filter matching null or empty-string values.
 */
export function isEmpty(field: string): QueryFilter {
  return or(isNull(field), equals(field, ""));
}

/**
 * Creates a filter matching values that are neither null nor empty.
 */
export function isNotEmpty(field: string): QueryFilter {
  return and(isNotNull(field), notEquals(field, ""));
}

/**
 * Creates a filter matching any timestamp on the given UTC calendar day.
 */
export function dateOnly(field: string, date: Date): QueryFilter {
  validateField(field);

  validateDate(date, "date");

  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );

  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return {
    conditions: [
      {
        field,
        operator: "gte",
        value: start,
      },
      {
        field,
        operator: "lt",
        value: end,
      },
    ],
  };
}

/**
 * Creates a filter for timestamps strictly before a date.
 */
export function isBefore(field: string, date: Date): QueryFilter {
  validateDate(date, "date");

  return condition(field, "lt", date);
}

/**
 * Creates a filter for timestamps strictly after a date.
 */
export function isAfter(field: string, date: Date): QueryFilter {
  validateDate(date, "date");

  return condition(field, "gt", date);
}

/**
 * Creates an inclusive date range filter.
 */
export function isBetween(field: string, from: Date, to: Date): QueryFilter {
  validateDate(from, "from");

  validateDate(to, "to");

  return between(field, from, to);
}

/**
 * Creates a negated single condition.
 */
export function notCondition(
  field: string,
  operator: QueryOperator,
  value?: unknown,
): QueryFilter {
  return not(condition(field, operator, value));
}

/**
 * Creates a filter on a related entity.
 *
 * `some` / `every` / `none` target collection relations; `is` / `isNot`
 * target single relations.
 */
export function relational(
  relation: string,
  filter: QueryFilter,
  operator: RelationOperator = "some",
): QueryFilter {
  if (
    operator !== "some" &&
    operator !== "every" &&
    operator !== "none" &&
    operator !== "is" &&
    operator !== "isNot"
  ) {
    throw new TypeError(`Invalid relation operator "${String(operator)}".`);
  }

  if (!filter || typeof filter !== "object") {
    throw new TypeError("A relation filter is required.");
  }

  validateField(relation);

  return {
    conditions: [
      {
        field: relation,
        operator,
        value: cloneFilter(filter),
      },
    ],
  };
}

/**
 * Creates a filter for a value being one of several options.
 */
export function oneOf<T>(field: string, values: readonly T[]): QueryFilter {
  return inList(field, values);
}

/**
 * Creates a filter for a value not being one of several options.
 */
export function noneOf<T>(field: string, values: readonly T[]): QueryFilter {
  return notInList(field, values);
}

/**
 * Creates an optional equality filter.
 *
 * Returns an empty filter when the value is undefined.
 */
export function optionalEquals(field: string, value: unknown): QueryFilter {
  if (value === undefined) {
    return {
      conditions: [],
    };
  }

  return equals(field, value);
}

/**
 * Creates an optional text search filter.
 */
export function optionalContains(
  field: string,
  value?: string | null,
): QueryFilter {
  if (value === undefined || value === null || value.trim().length === 0) {
    return {
      conditions: [],
    };
  }

  return contains(field, value.trim());
}

/**
 * Checks whether a filter contains any actual constraints.
 */
export function hasConditions(filter?: QueryFilter): boolean {
  if (!filter) {
    return false;
  }

  if (filter.conditions && filter.conditions.length > 0) {
    return true;
  }

  if (filter.and?.some(hasConditions)) {
    return true;
  }

  if (filter.or?.some(hasConditions)) {
    return true;
  }

  return filter.not ? hasConditions(filter.not) : false;
}

/**
 * Flattens an AND-only filter into individual conditions.
 */
export function flattenAnd(filter: QueryFilter): QueryCondition[] {
  if ((filter.or && filter.or.length > 0) || filter.not) {
    throw new TypeError(
      "flattenAnd only accepts AND-only filters; OR/NOT branches cannot be flattened.",
    );
  }

  const result: QueryCondition[] = [];

  if (filter.conditions) {
    result.push(...filter.conditions.map(cloneCondition));
  }

  for (const child of filter.and ?? []) {
    result.push(...flattenAnd(child));
  }

  return result;
}

/**
 * Deeply clones a filter (conditions, nested groups, Date/array/object
 * values) so the copy shares no mutable state with the source.
 */
export function cloneFilter(filter: QueryFilter): QueryFilter;
export function cloneFilter(filter?: QueryFilter): QueryFilter | undefined;
export function cloneFilter(filter?: QueryFilter): QueryFilter | undefined {
  if (!filter) {
    return undefined;
  }

  return {
    conditions: filter.conditions
      ? filter.conditions.map(cloneCondition)
      : undefined,

    and: filter.and ? filter.and.map((child) => cloneFilter(child)) : undefined,

    or: filter.or ? filter.or.map((child) => cloneFilter(child)) : undefined,

    not: filter.not ? cloneFilter(filter.not) : undefined,
  };
}

/**
 * Clones a single condition.
 */
function cloneCondition(condition: QueryCondition): QueryCondition {
  return {
    ...condition,
    ...(condition.value !== undefined
      ? {
          value: cloneValue(condition.value),
        }
      : {}),
  };
}

/**
 * Clones supported filter values.
 */
function cloneValue(value: unknown): unknown {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (FORBIDDEN_KEYS.has(key)) {
        continue;
      }

      result[key] = cloneValue(entry);
    }

    return result;
  }

  return value;
}

function validateRangeBound(value: unknown, name: string): void {
  if (value instanceof Date) {
    validateDate(value, name);

    return;
  }

  if (typeof value === "number" && Number.isNaN(value)) {
    throw new TypeError(`Invalid ${name} bound.`);
  }

  if (
    typeof value !== "number" &&
    typeof value !== "string" &&
    typeof value !== "bigint"
  ) {
    throw new TypeError(`Invalid ${name} bound.`);
  }
}

function compareBounds(from: unknown, to: unknown): number {
  if (from instanceof Date && to instanceof Date) {
    return from.getTime() - to.getTime();
  }

  if (typeof from === typeof to && (from as number) > (to as number)) {
    return 1;
  }

  return 0;
}

/**
 * Validates a filter field.
 */
function validateField(field: string): void {
  if (typeof field !== "string" || field.trim().length === 0) {
    throw new TypeError("A filter field is required.");
  }

  if (FORBIDDEN_KEYS.has(field)) {
    throw new TypeError(`Invalid filter field "${field}".`);
  }
}

/**
 * Validates a date value.
 */
function validateDate(value: Date, name: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError(`Invalid ${name} date.`);
  }
}
