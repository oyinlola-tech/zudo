import type {
  PaginationInput,
  SortInput,
} from "../databaseType/databaseType.type.js";
import { normalizePagination } from "../pagination/pagination.core.js";
import {
  type RelationInclude,
  type ToPrismaIncludeOptions,
  toPrismaInclude,
} from "../relations/relations.definition.js";
import type {
  QueryBuilderState,
  QueryCondition,
  QueryFilter,
  QueryOperator,
} from "./queryBuilder.type.js";

/**
 * A Prisma-compatible `where` object.
 */
export type PrismaWhere = Record<string, unknown>;

/**
 * Prisma-compatible query arguments produced from a builder state.
 */
export interface PrismaQueryArgs {
  readonly where?: PrismaWhere;
  readonly orderBy?: readonly Record<string, "asc" | "desc">[];
  readonly skip?: number;
  readonly take?: number;
  /**
   * Field projection. When the state carries both `select` and `include`,
   * the relations are folded in here (Prisma does not accept both keys on
   * one level), so values may be nested include objects.
   */
  readonly select?: Record<string, boolean | Record<string, unknown>>;
  readonly include?: Record<string, unknown>;
}

/**
 * Options for {@link toPrismaArgs}.
 */
export interface ToPrismaArgsOptions {
  /**
   * Options forwarded to {@link toPrismaInclude} for `include` entries.
   */
  readonly include?: ToPrismaIncludeOptions;
}

const FIELD_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const FORBIDDEN_FIELDS = new Set(["__proto__", "constructor", "prototype"]);

const SIMPLE_OPERATORS: ReadonlySet<QueryOperator> = new Set<QueryOperator>([
  "equals",
  "not",
  "in",
  "notIn",
  "lt",
  "lte",
  "gt",
  "gte",
  "contains",
  "startsWith",
  "endsWith",
]);

const RELATION_OPERATORS: ReadonlySet<QueryOperator> = new Set<QueryOperator>([
  "some",
  "every",
  "none",
  "is",
  "isNot",
]);

/**
 * Translates a database-neutral {@link QueryFilter} into a Prisma `where`
 * object.
 *
 * Returns `undefined` when the filter carries no constraints. Unknown
 * operators and unsafe field names throw a `TypeError`.
 */
export function toPrismaWhere(filter?: QueryFilter): PrismaWhere | undefined {
  if (!filter || typeof filter !== "object") {
    return undefined;
  }

  const where: PrismaWhere = {};

  const extraAnd: PrismaWhere[] = [];

  for (const condition of filter.conditions ?? []) {
    const entry = translateCondition(condition);

    const fieldWhere = entry[condition.field] as Record<string, unknown>;

    const existing = where[condition.field];

    if (existing === undefined) {
      where[condition.field] = fieldWhere;

      continue;
    }

    const [operatorKey] = Object.keys(fieldWhere);

    if (
      isPlainObject(existing) &&
      operatorKey !== undefined &&
      !(operatorKey in existing)
    ) {
      where[condition.field] = { ...existing, ...fieldWhere };

      continue;
    }

    extraAnd.push(entry);
  }

  const andChildren = [
    ...(filter.and ?? []).map((child) => toPrismaWhere(child)),
    ...extraAnd,
  ].filter((child): child is PrismaWhere => child !== undefined);

  if (andChildren.length > 0) {
    where["AND"] = andChildren;
  }

  const orChildren = (filter.or ?? [])
    .map((child) => toPrismaWhere(child))
    .filter((child): child is PrismaWhere => child !== undefined);

  if (orChildren.length > 0) {
    where["OR"] = orChildren;
  }

  if (filter.not) {
    const negated = toPrismaWhere(filter.not);

    if (negated !== undefined) {
      where["NOT"] = negated;
    }
  }

  return Object.keys(where).length === 0 ? undefined : where;
}

/**
 * Translates a builder state into Prisma `findMany`-style arguments.
 */
export function toPrismaArgs<TField extends string = string>(
  state: QueryBuilderState<TField>,
  options: ToPrismaArgsOptions = {},
): PrismaQueryArgs {
  const args: {
    where?: PrismaWhere;
    orderBy?: Record<string, "asc" | "desc">[];
    skip?: number;
    take?: number;
    select?: Record<string, boolean | Record<string, unknown>>;
    include?: Record<string, unknown>;
  } = {};

  const where = toPrismaWhere(state.filter);

  if (where !== undefined) {
    args.where = where;
  }

  const orderBy = toPrismaOrderBy(state.sort);

  if (orderBy !== undefined) {
    args.orderBy = orderBy;
  }

  const { skip, take } = toPrismaSkipTake(state.pagination, state.offset);

  if (skip !== undefined) {
    args.skip = skip;
  }

  if (take !== undefined) {
    args.take = take;
  }

  const select =
    state.select && state.select.length > 0
      ? toPrismaSelect(state.select)
      : undefined;

  const include =
    state.include && state.include.length > 0
      ? toPrismaInclude(
          state.include as readonly RelationInclude[],
          options.include,
        )
      : undefined;

  if (select !== undefined && include !== undefined) {
    // Prisma rejects `select` and `include` on the same level; relations
    // are folded into the projection instead.
    args.select = {
      ...select,
      ...(include as Record<string, Record<string, unknown>>),
    };
  } else if (select !== undefined) {
    args.select = select;
  } else if (include !== undefined) {
    args.include = include;
  }

  return args;
}

/**
 * Translates sort definitions into Prisma `orderBy` entries.
 */
export function toPrismaOrderBy<TField extends string = string>(
  sort?: readonly SortInput<TField>[],
): Record<string, "asc" | "desc">[] | undefined {
  if (!sort || sort.length === 0) {
    return undefined;
  }

  return sort.map((entry) => {
    validateFieldName(entry.field);

    if (entry.direction !== "asc" && entry.direction !== "desc") {
      throw new TypeError(
        `Sort field "${entry.field}" has an invalid direction.`,
      );
    }

    return { [entry.field]: entry.direction };
  });
}

/**
 * Translates a field list into a Prisma `select` object.
 */
export function toPrismaSelect(
  fields: readonly string[],
): Record<string, boolean> {
  const select: Record<string, boolean> = {};

  for (const field of fields) {
    validateFieldName(field);

    select[field] = true;
  }

  return select;
}

/**
 * Resolves pagination / offset into Prisma `skip` and `take`.
 */
export function toPrismaSkipTake(
  pagination?: PaginationInput,
  offset?: number,
): { readonly skip?: number; readonly take?: number } {
  if (offset !== undefined) {
    if (!Number.isFinite(offset) || offset < 0) {
      throw new TypeError("Query offset must be a non-negative number.");
    }

    const take =
      pagination?.limit !== undefined
        ? normalizePagination(pagination).limit
        : undefined;

    return { skip: Math.floor(offset), take };
  }

  if (!pagination) {
    return {};
  }

  const normalized = normalizePagination(pagination);

  return { skip: normalized.offset, take: normalized.limit };
}

function translateCondition(condition: QueryCondition): PrismaWhere {
  if (!condition || typeof condition !== "object") {
    throw new TypeError("Invalid query condition.");
  }

  validateFieldName(condition.field);

  const { field, operator, value } = condition;

  if (SIMPLE_OPERATORS.has(operator)) {
    if ((operator === "in" || operator === "notIn") && !Array.isArray(value)) {
      throw new TypeError(
        `Operator "${operator}" on field "${field}" requires an array value.`,
      );
    }

    if (
      (operator === "contains" ||
        operator === "startsWith" ||
        operator === "endsWith") &&
      typeof value !== "string"
    ) {
      throw new TypeError(
        `Operator "${operator}" on field "${field}" requires a string value.`,
      );
    }

    return { [field]: { [operator]: value } };
  }

  switch (operator) {
    case "isNull":
      return { [field]: { equals: null } };

    case "isNotNull":
      return { [field]: { not: null } };

    case "like":
      return { [field]: translatePattern(field, value) };

    default:
      break;
  }

  if (RELATION_OPERATORS.has(operator)) {
    const nested = toPrismaWhere(value as QueryFilter | undefined) ?? {};

    return { [field]: { [operator]: nested } };
  }

  throw new TypeError(
    `Unsupported query operator "${String(operator)}" on field "${field}".`,
  );
}

function translatePattern(field: string, value: unknown): PrismaWhere {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`Operator "like" on field "${field}" requires a pattern.`);
  }

  const leading = value.startsWith("%");

  const trailing = value.endsWith("%");

  // The lookbehind pins the trailing match to the start of a `%` run; plain
  // `%+$` retries from every `%` in an interior run, which is quadratic.
  const inner = value.replace(/^%+/, "").replace(/(?<!%)%+$/, "");

  if (inner.length === 0 || inner.includes("%") || inner.includes("_")) {
    throw new TypeError(
      `Pattern "${value}" on field "${field}" is not supported; only leading/trailing % wildcards are allowed.`,
    );
  }

  if (leading && trailing) {
    return { contains: inner };
  }

  if (trailing) {
    return { startsWith: inner };
  }

  if (leading) {
    return { endsWith: inner };
  }

  return { equals: inner };
}

function validateFieldName(field: string): void {
  if (
    typeof field !== "string" ||
    !FIELD_PATTERN.test(field) ||
    FORBIDDEN_FIELDS.has(field)
  ) {
    throw new TypeError(`Invalid query field name "${String(field)}".`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}
